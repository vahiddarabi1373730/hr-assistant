"""One real Groq request with synthetic data; never prints credentials."""

import asyncio
import json
import os
import sys
from pathlib import Path

backend = Path(__file__).resolve().parents[2] / "backend"
os.chdir(backend)
sys.path.insert(0, str(backend))

from app.ai.role_matching import GroqRoleMatcher  # noqa: E402
from app.config import settings  # noqa: E402


async def main():
    try:
        scores = await GroqRoleMatcher().compare(
            {"title": "Python developer", "required_skills": ["Python", "SQL"]},
            {"synthetic": {"skills": ["Python", "SQL"]}},
        )
    except Exception as exc:
        body = getattr(exc, "body", {})
        error = body.get("error", body) if isinstance(body, dict) else {}
        print(json.dumps({"ok": False, "error_type": type(exc).__name__,
                          "status_code": getattr(exc, "status_code", None),
                          "message": str(error.get("message", ""))[:1500]}))
        raise SystemExit(1) from None
    print(json.dumps({"ok": True, "provider": "groq", "model": settings.resume_extract_model,
                      "scores": scores}))


asyncio.run(main())
