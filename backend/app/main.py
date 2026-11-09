"""App assembly."""

import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI

from app.candidate_profiles import router as candidate_profiles_router
from app.config import settings
from app.db import async_session_factory
from app.event_reminders import run_event_reminders_forever
from app.events import public_router as event_rsvp_router
from app.events import router as events_router
from app.inbound import inbound_router
from app.interviews import router as interviews_router
from app.notes import router as notes_router
from app.notifications import router as notifications_router
from app.parsing.llm import get_extractor
from app.parsing.worker import run_worker_forever
from app.pipeline import router as pipeline_router
from app.resumes import resumes_router
from app.review import review_router
from app.routes import api_router, auth_router
from app.search import router as search_router
from app.user_admin import router as user_admin_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Postgres-as-queue worker (spec §7.3): single uploads are processed
    # inline by the API for sub-minute UX; this loop drains everything else
    # (future email-in path, retries after crashes). Cancel on shutdown.
    worker = asyncio.create_task(run_worker_forever(async_session_factory, await get_extractor()))
    event_reminders = asyncio.create_task(run_event_reminders_forever(async_session_factory))
    try:
        yield
    finally:
        worker.cancel()
        event_reminders.cancel()
        with suppress(asyncio.CancelledError):
            await worker
        with suppress(asyncio.CancelledError):
            await event_reminders


app = FastAPI(title="AI HR Assistant", version="0.1.0", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(api_router)
app.include_router(inbound_router)
app.include_router(review_router)
app.include_router(resumes_router)
app.include_router(candidate_profiles_router)
app.include_router(pipeline_router)
app.include_router(interviews_router)
app.include_router(search_router)
app.include_router(notes_router)
app.include_router(notifications_router)
app.include_router(events_router)
app.include_router(user_admin_router)
app.include_router(event_rsvp_router)


@app.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


# Serve the built SPA when present (dev uses the Vite server + proxy).
_dist = Path(__file__).resolve().parent.parent / settings.frontend_dist
if _dist.is_dir():
    app.frontend("/", directory=str(_dist))
