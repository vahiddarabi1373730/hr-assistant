"""Human-controlled Role and Application workflow. No automatic stage moves."""

import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, text, update
from sqlalchemy.orm import load_only

from app.ai.actions import get_embedding_provider
from app.ai.role_matching import get_role_matcher
from app.config import settings
from app.deletion import cancel_application_interviews
from app.models import (
    ApplicationActivity,
    Candidate,
    CandidateApplication,
    CandidateNote,
    Membership,
    OrgActivity,
    PipelineStage,
    Role,
    User,
)
from app.pipeline_defaults import ENDING_KINDS
from app.profiles import lock_org
from app.resumes import SessionDep
from app.tenancy import TenantContextDep

router = APIRouter(prefix="/api", tags=["pipeline"])
logger = logging.getLogger(__name__)


class RoleDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(default="", max_length=5000)
    responsibilities: list[str] = Field(default_factory=list, max_length=40)
    required_skills: list[str] = Field(default_factory=list, max_length=40)
    preferred_skills: list[str] = Field(default_factory=list, max_length=40)
    min_experience_years: int | None = Field(default=None, ge=0, le=60)
    education: str = Field(default="", max_length=200)
    seniority: Literal["", "intern", "junior", "mid", "senior", "lead"] = ""
    employment_type: Literal["", "full_time", "part_time", "contract", "internship"] = ""
    work_mode: Literal["", "onsite", "hybrid", "remote"] = ""
    location: str = Field(default="", max_length=200)
    salary_range: str = Field(default="", max_length=300)

    @field_validator("responsibilities", "required_skills", "preferred_skills")
    @classmethod
    def normalize_list_items(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if any(len(value) > 120 for value in cleaned):
            raise ValueError("items must be at most 120 characters")
        return cleaned


class RoleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    owner_id: UUID | None = None
    details: RoleDetails = Field(default_factory=RoleDetails)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value):
        if not value.strip():
            raise ValueError("empty title")
        return value.strip()


class RoleEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: Literal["draft", "open"] | None = None
    owner_id: UUID | None = None
    details: RoleDetails | None = None


async def owner_for(session, org_id, owner_id):
    if owner_id is not None and not await session.scalar(
        select(User.id)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.org_id == org_id, User.id == owner_id, User.is_active.is_(True))
    ):
        raise HTTPException(422, "INVALID_OWNER")


async def role_for(session, org_id, role_id):
    role = await session.scalar(select(Role).where(Role.org_id == org_id, Role.id == role_id))
    if role is None:
        raise HTTPException(404, "ROLE_NOT_FOUND")
    return role


def role_data(role):
    details = role.details or {}
    if isinstance(details, dict):
        details = {key: value for key, value in details.items() if key != "criteria_weights"}
    return {
        "id": role.id,
        "title": role.title,
        "status": role.status,
        "owner_id": role.owner_id,
        "details": RoleDetails.model_validate(details).model_dump(),
    }


def role_embedding_text(role) -> str:
    details = role_data(role)["details"]
    return "\n".join(
        [
            role.title,
            details["description"],
            *details["responsibilities"],
            *details["required_skills"],
            *details["preferred_skills"],
            details["education"],
            details["seniority"],
            details["location"],
        ]
    ).strip()


async def stages_for(session, org_id):
    return [
        {"id": s.id, "name": s.name, "kind": s.kind, "position": s.position}
        for s in (
            await session.scalars(
                select(PipelineStage)
                .where(PipelineStage.org_id == org_id)
                .order_by(PipelineStage.position, PipelineStage.id)
            )
        ).all()
    ]


@router.get("/pipeline/stages")
async def stages(ctx: TenantContextDep, session: SessionDep) -> dict:
    return {"items": await stages_for(session, ctx.org.id)}


@router.get("/pipeline/owners")
async def owners(ctx: TenantContextDep, session: SessionDep) -> dict:
    users = (
        await session.scalars(
            select(User)
            .join(Membership)
            .where(Membership.org_id == ctx.org.id)
            .order_by(User.email)
        )
    ).all()
    return {"items": [{"id": u.id, "email": u.email, "active": u.is_active} for u in users]}


@router.get("/roles")
async def roles(ctx: TenantContextDep, session: SessionDep) -> dict:
    return {
        "items": [
            role_data(r)
            for r in (
                await session.scalars(
                    select(Role)
                    .where(Role.org_id == ctx.org.id)
                    .order_by(Role.created_at.desc(), Role.id)
                )
            ).all()
        ]
    }


@router.post("/roles", status_code=201)
async def create_role(data: RoleInput, ctx: TenantContextDep, session: SessionDep) -> dict:
    await lock_org(session, ctx.org.id)
    await owner_for(session, ctx.org.id, data.owner_id)
    role = Role(
        org_id=ctx.org.id,
        title=data.title,
        details=data.details.model_dump(),
        owner_id=data.owner_id,
        status="draft",
    )
    session.add(role)
    await session.flush()
    session.add(
        OrgActivity(
            org_id=ctx.org.id,
            actor_user_id=ctx.user.id,
            event_type="role_created",
            data={"role_id": str(role.id)},
        )
    )
    result = role_data(role)
    await session.commit()
    return result


@router.patch("/roles/{role_id}")
async def edit_role(
    role_id: UUID, data: RoleEdit, ctx: TenantContextDep, session: SessionDep
) -> dict:
    await lock_org(session, ctx.org.id)
    role = await role_for(session, ctx.org.id, role_id)
    changes = data.model_dump(exclude_unset=True)
    if "details" in changes and data.details is None:
        raise HTTPException(422, "INVALID_ROLE_DETAILS")
    if "owner_id" in changes:
        await owner_for(session, ctx.org.id, data.owner_id)
    if "title" in changes and not (data.title or "").strip():
        raise HTTPException(422, "ROLE_TITLE_REQUIRED")
    if "status" in changes and (
        data.status is None
        or (role.status != data.status and (role.status, data.status) != ("draft", "open"))
    ):
        raise HTTPException(409, "INVALID_ROLE_TRANSITION")
    for key, value in changes.items():
        setattr(role, key, value.strip() if key == "title" else value)
    session.add(
        OrgActivity(
            org_id=ctx.org.id,
            actor_user_id=ctx.user.id,
            event_type="role_updated",
            data={
                "role_id": str(role.id),
                "changes": {k: str(v) if isinstance(v, UUID) else v for k, v in changes.items()},
            },
        )
    )
    result = role_data(role)
    await session.commit()
    return result


@router.delete("/roles/{role_id}", status_code=204)
async def delete_role(role_id: UUID, ctx: TenantContextDep, session: SessionDep) -> None:
    await lock_org(session, ctx.org.id)
    role = await role_for(session, ctx.org.id, role_id)
    applications = (
        await session.scalars(
            select(CandidateApplication).where(
                CandidateApplication.org_id == ctx.org.id,
                CandidateApplication.role_id == role.id,
            )
        )
    ).all()
    application_ids = [application.id for application in applications]
    await cancel_application_interviews(session, ctx.org.id, application_ids)
    if application_ids:
        await session.execute(
            update(CandidateNote)
            .where(
                CandidateNote.org_id == ctx.org.id,
                CandidateNote.application_id.in_(application_ids),
            )
            .values(application_id=None)
        )
    for application in applications:
        await session.delete(application)
    session.add(
        OrgActivity(
            org_id=ctx.org.id,
            actor_user_id=ctx.user.id,
            event_type="role_deleted",
            data={"role_id": str(role.id), "applications_deleted": len(applications)},
        )
    )
    await session.delete(role)
    await session.commit()


@router.post("/roles/{role_id}/rank")
async def rank_role_candidates(
    role_id: UUID,
    ctx: TenantContextDep,
    session: SessionDep,
    provider: Annotated[object, Depends(get_embedding_provider)],
    matcher: Annotated[object, Depends(get_role_matcher)],
) -> dict:
    role = await role_for(session, ctx.org.id, role_id)
    has_applications = await session.scalar(
        select(CandidateApplication.id)
        .where(
            CandidateApplication.org_id == ctx.org.id,
            CandidateApplication.role_id == role.id,
        )
        .limit(1)
    )
    if has_applications is None:
        mode = "llm" if settings.resume_ai_provider == "groq" else "semantic"
        return {"items": [], "mode": mode, "unranked_count": 0}

    if settings.resume_ai_provider == "groq":
        if not matcher.configured:
            raise HTTPException(503, "ROLE_MATCHING_NOT_CONFIGURED")
        linked = (
            await session.execute(
                select(CandidateApplication.id, Candidate)
                .options(
                    load_only(Candidate.id, Candidate.full_name, Candidate.email, Candidate.profile)
                )
                .join(
                    Candidate,
                    (Candidate.id == CandidateApplication.candidate_id)
                    & (Candidate.org_id == CandidateApplication.org_id),
                )
                .where(
                    CandidateApplication.org_id == ctx.org.id,
                    CandidateApplication.role_id == role.id,
                )
                .order_by(Candidate.id)
            )
        ).all()
        profiles = {str(candidate.id): candidate.profile or {} for _, candidate in linked}
        # Release the read transaction/connection before waiting on Groq.
        role_evidence = {"title": role.title, **role_data(role)["details"]}
        result = [
            {
                "application_id": application_id,
                "candidate_id": candidate.id,
                "full_name": candidate.full_name,
                "email": candidate.email,
                "similarity": None,
            }
            for application_id, candidate in linked
        ]
        await session.rollback()
        try:
            scores = await matcher.compare(role_evidence, profiles)
        except Exception as exc:
            # Provider errors may contain input data; do not log their bodies.
            logger.warning("Groq role comparison failed (%s)", type(exc).__name__)
            raise HTTPException(503, "ROLE_MATCHING_UNAVAILABLE") from exc
        for item in result:
            item["similarity"] = scores[str(item["candidate_id"])]
        result.sort(key=lambda item: (
            item["similarity"] is None,
            -(item["similarity"] or 0),
            str(item["candidate_id"]),
        ))
        return {
            "items": result,
            "mode": "llm",
            "unranked_count": sum(item["similarity"] is None for item in result),
        }

    if not provider.model or not settings.search_embedding_api_key:
        raise HTTPException(503, "ROLE_MATCHING_NOT_CONFIGURED")

    job_text = role_embedding_text(role)
    try:
        vector = await provider.embed(job_text)
    except Exception as exc:
        logger.exception("Could not create role embedding for role %s", role.id)
        raise HTTPException(503, "ROLE_MATCHING_UNAVAILABLE") from exc

    items = (
        await session.execute(
            text("""
                SELECT a.id AS application_id, c.id AS candidate_id, c.full_name, c.email,
                       CASE WHEN d.embedding IS NOT NULL
                                  AND d.embedding_status='ready'
                                  AND d.embedding_model=:model
                                  AND d.embedding_dimensions=:dimensions
                            THEN 1 - (d.embedding <=> CAST(:vector AS vector))
                            ELSE NULL END AS similarity
                FROM candidate_applications a
                JOIN candidates c ON c.id=a.candidate_id AND c.org_id=a.org_id
                JOIN pipeline_stages s ON s.id=a.stage_id AND s.org_id=a.org_id
                LEFT JOIN candidate_search_docs d
                    ON d.candidate_id=c.id AND d.org_id=c.org_id
                WHERE a.org_id=:org_id AND a.role_id=:role_id
                ORDER BY
                    CASE WHEN d.embedding IS NOT NULL
                               AND d.embedding_status='ready'
                               AND d.embedding_model=:model
                               AND d.embedding_dimensions=:dimensions
                         THEN 0 ELSE 1 END,
                CASE WHEN d.embedding IS NOT NULL
                           AND d.embedding_status='ready'
                           AND d.embedding_model=:model
                           AND d.embedding_dimensions=:dimensions
                     THEN d.embedding <=> CAST(:vector AS vector)
                     ELSE NULL END NULLS LAST,
                c.id
            """),
            {
                "org_id": ctx.org.id,
                "role_id": role.id,
                "vector": vector,
                "model": provider.model,
                "dimensions": provider.dimensions,
            },
        )
    ).mappings().all()
    result = [
        {
            "application_id": row["application_id"],
            "candidate_id": row["candidate_id"],
            "full_name": row["full_name"],
            "email": row["email"],
            "similarity": float(row["similarity"]) if row["similarity"] is not None else None,
        }
        for row in items
    ]
    return {
        "items": result,
        "mode": "semantic",
        "unranked_count": sum(item["similarity"] is None for item in result),
    }


@router.post("/roles/{role_id}/candidates/{candidate_id}/match")
async def match_candidate_to_role(
    role_id: UUID,
    candidate_id: UUID,
    ctx: TenantContextDep,
    session: SessionDep,
    provider: Annotated[object, Depends(get_embedding_provider)],
    matcher: Annotated[object, Depends(get_role_matcher)],
) -> dict:
    role = await role_for(session, ctx.org.id, role_id)
    candidate = await session.scalar(
        select(Candidate)
        .options(load_only(Candidate.id, Candidate.org_id, Candidate.profile))
        .where(Candidate.id == candidate_id, Candidate.org_id == ctx.org.id)
    )
    if candidate is None:
        raise HTTPException(404, "CANDIDATE_NOT_FOUND")

    role_evidence = {"title": role.title, **role_data(role)["details"]}
    if settings.resume_ai_provider == "groq":
        if not matcher.configured:
            raise HTTPException(503, "ROLE_MATCHING_NOT_CONFIGURED")
        candidate_key = str(candidate.id)
        profiles = {candidate_key: candidate.profile or {}}
        await session.rollback()
        try:
            scores = await matcher.compare(role_evidence, profiles)
        except Exception as exc:
            logger.warning("Groq role comparison failed (%s)", type(exc).__name__)
            raise HTTPException(503, "ROLE_MATCHING_UNAVAILABLE") from exc
        return {
            "candidate_id": candidate_key,
            "similarity": scores[candidate_key],
            "mode": "llm",
        }

    if not provider.model or not settings.search_embedding_api_key:
        raise HTTPException(503, "ROLE_MATCHING_NOT_CONFIGURED")
    job_text = role_embedding_text(role)
    try:
        vector = await provider.embed(job_text)
    except Exception as exc:
        logger.exception("Could not create role embedding for role %s", role.id)
        raise HTTPException(503, "ROLE_MATCHING_UNAVAILABLE") from exc

    similarity = await session.scalar(
        text("""
            SELECT CASE WHEN d.embedding IS NOT NULL
                              AND d.embedding_status='ready'
                              AND d.embedding_model=:model
                              AND d.embedding_dimensions=:dimensions
                        THEN 1 - (d.embedding <=> CAST(:vector AS vector))
                        ELSE NULL END
            FROM candidates c
            LEFT JOIN candidate_search_docs d
                ON d.candidate_id=c.id AND d.org_id=c.org_id
            WHERE c.org_id=:org_id AND c.id=:candidate_id
        """),
        {
            "org_id": ctx.org.id,
            "candidate_id": candidate.id,
            "vector": vector,
            "model": provider.model,
            "dimensions": provider.dimensions,
        },
    )
    return {
        "candidate_id": str(candidate.id),
        "similarity": float(similarity) if similarity is not None else None,
        "mode": "semantic",
    }


@router.get("/pipeline/board")
async def board(ctx: TenantContextDep, session: SessionDep) -> dict:
    return {
        "stages": await stages_for(session, ctx.org.id),
        "roles": (await roles(ctx, session))["items"],
        "applications": await application_rows(session, ctx.org.id),
    }


class AddApplication(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: UUID
    owner_id: UUID | None = None


class StageMove(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stage_id: UUID
    expected_stage_id: UUID
    context: str | None = Field(default=None, max_length=4000)
    reason: Literal["experience", "skills", "expectations", "timing", "other"] | None = None


class OwnerEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    owner_id: UUID | None


def application_data(application):
    return {
        "id": application.id,
        "candidate_id": application.candidate_id,
        "role_id": application.role_id,
        "stage_id": application.stage_id,
        "owner_id": application.owner_id,
    }


def application_event(session, application, event, actor=None, **data):
    session.add(
        ApplicationActivity(
            org_id=application.org_id,
            application_id=application.id,
            actor_user_id=actor,
            event_type=event,
            data=data,
        )
    )


async def application_for(session, org_id, application_id):
    application = await session.scalar(
        select(CandidateApplication).where(
            CandidateApplication.org_id == org_id, CandidateApplication.id == application_id
        )
    )
    if application is None:
        raise HTTPException(404, "APPLICATION_NOT_FOUND")
    return application


@router.delete("/applications/{application_id}", status_code=204)
async def delete_application(
    application_id: UUID, ctx: TenantContextDep, session: SessionDep
) -> None:
    await lock_org(session, ctx.org.id)
    application = await application_for(session, ctx.org.id, application_id)
    await cancel_application_interviews(session, ctx.org.id, [application.id])

    await session.execute(
        update(CandidateNote)
        .where(
            CandidateNote.org_id == ctx.org.id,
            CandidateNote.application_id == application.id,
        )
        .values(application_id=None)
    )
    session.add(
        OrgActivity(
            org_id=ctx.org.id,
            actor_user_id=ctx.user.id,
            event_type="application_deleted",
            data={
                "application_id": str(application.id),
                "candidate_id": str(application.candidate_id),
                "role_id": str(application.role_id),
            },
        )
    )
    await session.delete(application)
    await session.commit()


async def stage_for(session, org_id, stage_id):
    stage = await session.scalar(
        select(PipelineStage).where(PipelineStage.org_id == org_id, PipelineStage.id == stage_id)
    )
    if stage is None:
        raise HTTPException(404, "STAGE_NOT_FOUND")
    return stage


async def application_rows(session, org_id, candidate_id=None):
    query = (
        select(CandidateApplication, Candidate, Role, PipelineStage)
        .options(
            load_only(Candidate.id, Candidate.full_name, Candidate.headline, Candidate.profile)
        )
        .join(Candidate, CandidateApplication.candidate_id == Candidate.id)
        .join(Role, CandidateApplication.role_id == Role.id)
        .join(PipelineStage, CandidateApplication.stage_id == PipelineStage.id)
        .where(
            CandidateApplication.org_id == org_id,
            Candidate.org_id == org_id,
            Role.org_id == org_id,
            PipelineStage.org_id == org_id,
        )
    )
    if candidate_id is not None:
        query = query.where(CandidateApplication.candidate_id == candidate_id)
    rows = (
        await session.execute(
            query.order_by(CandidateApplication.created_at, CandidateApplication.id)
        )
    ).all()
    return [
        {
            **application_data(a),
            "full_name": c.full_name,
            "headline": c.headline
            or next(
                (
                    job.get("title")
                    for job in ((c.profile or {}).get("work_experience") or [])
                    if job.get("current") and job.get("title")
                ),
                None,
            ),
            "role_title": r.title,
            "stage": s.name,
            "stage_kind": s.kind,
        }
        for a, c, r, s in rows
    ]


@router.post("/roles/{role_id}/applications")
async def add_application(
    role_id: UUID, data: AddApplication, ctx: TenantContextDep, session: SessionDep
) -> dict:
    # Same lock as identity Merge: an add cannot race a candidate's deletion/coalescing.
    await lock_org(session, ctx.org.id)
    role = await role_for(session, ctx.org.id, role_id)
    if role.status != "open":
        raise HTTPException(409, "ROLE_NOT_OPEN")
    if not await session.scalar(
        select(Candidate.id).where(
            Candidate.id == data.candidate_id, Candidate.org_id == ctx.org.id
        )
    ):
        raise HTTPException(404, "CANDIDATE_NOT_FOUND")
    await owner_for(session, ctx.org.id, data.owner_id)
    application = await session.scalar(
        select(CandidateApplication).where(
            CandidateApplication.org_id == ctx.org.id,
            CandidateApplication.candidate_id == data.candidate_id,
            CandidateApplication.role_id == role.id,
        )
    )
    sourced = await session.scalar(
        select(PipelineStage).where(
            PipelineStage.org_id == ctx.org.id, PipelineStage.kind == "sourced"
        )
    )
    if application is None:
        application = CandidateApplication(
            org_id=ctx.org.id,
            candidate_id=data.candidate_id,
            role_id=role.id,
            role_title=role.title,
            stage_id=sourced.id,
            stage=sourced.kind,
            owner_id=data.owner_id,
            data={},
        )
        session.add(application)
        await session.flush()
        application_event(
            session, application, "application_added", ctx.user.id, stage_id=str(sourced.id)
        )
    else:
        current = await stage_for(session, ctx.org.id, application.stage_id)
        if current.kind in ENDING_KINDS:
            old_stage = application.stage_id
            application.stage_id, application.stage = sourced.id, sourced.kind
            application_event(
                session,
                application,
                "application_reopened",
                ctx.user.id,
                from_stage_id=str(old_stage),
                to_stage_id=str(sourced.id),
            )
    result = application_data(application)
    await session.commit()
    return result


@router.get("/applications/{application_id}")
async def application_detail(
    application_id: UUID, ctx: TenantContextDep, session: SessionDep
) -> dict:
    application = await application_for(session, ctx.org.id, application_id)
    from app.notes import note_rows

    notes = await note_rows(session, ctx.org.id, application.candidate_id, application.id)
    events = (
        await session.scalars(
            select(ApplicationActivity)
            .where(
                ApplicationActivity.org_id == ctx.org.id,
                ApplicationActivity.application_id == application.id,
            )
            .order_by(ApplicationActivity.created_at, ApplicationActivity.id)
        )
    ).all()
    return {
        **application_data(application),
        "notes": notes,
        "activity": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "actor_user_id": e.actor_user_id,
                "data": e.data,
                "created_at": e.created_at,
            }
            for e in events
        ],
    }


@router.post("/applications/{application_id}/stage")
async def move_application(
    application_id: UUID, data: StageMove, ctx: TenantContextDep, session: SessionDep
) -> dict:
    await lock_org(session, ctx.org.id)
    application = await application_for(session, ctx.org.id, application_id)
    destination = await stage_for(session, ctx.org.id, data.stage_id)
    if application.stage_id != data.expected_stage_id:
        raise HTTPException(409, "APPLICATION_CHANGED_REFRESH")
    if data.reason is not None and destination.kind != "rejected":
        raise HTTPException(422, "REASON_ONLY_FOR_REJECTION")
    if application.stage_id != destination.id:
        previous = await stage_for(session, ctx.org.id, application.stage_id)
        application.stage_id, application.stage = destination.id, destination.kind
        application_event(
            session,
            application,
            "stage_changed",
            ctx.user.id,
            from_stage_id=str(previous.id),
            to_stage_id=str(destination.id),
            from_stage_name=previous.name,
            to_stage_name=destination.name,
            context=(data.context or "").strip() or None,
            reason=data.reason,
        )
    result = application_data(application)
    await session.commit()
    return result


@router.patch("/applications/{application_id}/owner")
async def assign_application(
    application_id: UUID, data: OwnerEdit, ctx: TenantContextDep, session: SessionDep
) -> dict:
    await lock_org(session, ctx.org.id)
    application = await application_for(session, ctx.org.id, application_id)
    await owner_for(session, ctx.org.id, data.owner_id)
    if application.owner_id != data.owner_id:
        previous = application.owner_id
        application.owner_id = data.owner_id
        application_event(
            session,
            application,
            "owner_changed",
            ctx.user.id,
            from_owner_id=str(previous) if previous else None,
            to_owner_id=str(data.owner_id) if data.owner_id else None,
        )
    result = application_data(application)
    await session.commit()
    return result
