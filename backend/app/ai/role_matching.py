"""Explicit Groq comparison of a Role with accepted professional Profile data."""

import asyncio
import json
from pathlib import Path

from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from app.config import settings


class MatchScore(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    candidate_id: str
    similarity: float | None = Field(ge=0, le=1, allow_inf_nan=False)


class MatchResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    items: list[MatchScore]


def professional_evidence(profile: dict) -> dict:
    """Exclude identity/contact data, raw resumes, Notes and pending proposals."""
    evidence = {}
    for key in ("headline", "skills", "industries"):
        if profile.get(key):
            evidence[key] = profile[key]
    for section, fields in (
        ("work_experience", ("title", "start_date", "end_date", "current", "bullets")),
        ("education", ("degree", "field")),
    ):
        entries = [
            {key: entry[key] for key in fields if entry.get(key) is not None}
            for entry in (profile.get(section) or [])[:20]
        ]
        if entries:
            evidence[section] = entries
    return evidence


class GroqRoleMatcher:
    @property
    def configured(self) -> bool:
        return bool(settings.groq_api_key and settings.resume_extract_model)

    async def compare(self, role: dict, profiles: dict[str, dict]) -> dict[str, float | None]:
        if not self.configured:
            raise RuntimeError("groq_matching_unconfigured")
        scores = dict.fromkeys(profiles)
        # Request-local aliases keep database identifiers out of provider inputs.
        candidates = [
            (candidate_id, professional_evidence(profile))
            for candidate_id, profile in profiles.items()
        ]
        candidates = [(candidate_id, data) for candidate_id, data in candidates if data]
        if not candidates:
            return scores
        prompt = (Path(__file__).parent / "prompts" / "role_matching_v1.md").read_text(
            encoding="utf-8"
        )
        async with (
            asyncio.timeout(120),
            AsyncOpenAI(
                api_key=settings.groq_api_key,
                base_url=settings.groq_base_url,
                timeout=45,
                max_retries=0,
            ) as client,
        ):
            for start in range(0, len(candidates), 5):
                batch = candidates[start : start + 5]
                aliases = {
                    str(index): candidate_id for index, (candidate_id, _) in enumerate(batch)
                }
                payload = {
                    "role": role,
                    "candidates": [
                        {
                            "candidate_id": str(index),
                            "professional_profile": json.dumps(data, ensure_ascii=False)[:8000],
                        }
                        for index, (_, data) in enumerate(batch)
                    ],
                }
                response = await client.chat.completions.create(
                    model=settings.resume_extract_model,
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": {
                            "name": "role_matching",
                            "strict": True,
                            "schema": MatchResult.model_json_schema(),
                        },
                    },
                    temperature=0,
                )
                result = MatchResult.model_validate_json(response.choices[0].message.content or "")
                returned_ids = [item.candidate_id for item in result.items]
                if len(returned_ids) != len(aliases) or set(returned_ids) != set(aliases):
                    raise ValueError("invalid_matching_candidates")
                for item in result.items:
                    scores[aliases[item.candidate_id]] = item.similarity
        return scores


def get_role_matcher():
    return GroqRoleMatcher()
