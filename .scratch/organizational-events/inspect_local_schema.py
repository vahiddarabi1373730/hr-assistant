"""Read-only verification of the configured local database; no credentials printed."""

import asyncio
import os
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[2] / "backend"
os.chdir(backend)
sys.path.insert(0, str(backend))

from sqlalchemy import text  # noqa: E402

from app.db import engine  # noqa: E402


async def main():
    async with engine.connect() as connection:
        result = await connection.execute(text(
            "select to_regclass('org_events')::text as events, "
            "to_regclass('event_guests')::text as guests, "
            "to_regclass('event_tasks')::text as tasks, "
            "to_regclass('org_invitations')::text as invitations, "
            "to_regclass('system_mailboxes')::text as system_mailboxes"
        ))
        print(dict(result.mappings().one()))
    await engine.dispose()


asyncio.run(main())
