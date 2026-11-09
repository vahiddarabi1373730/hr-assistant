"""Groq transport and response validation without any external AI calls."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ai import role_matching
from app.config import settings


@pytest.fixture
def groq_transport(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "test-groq-only")
    monkeypatch.setattr(settings, "resume_extract_model", "configured-groq-model")
    completion = AsyncMock()
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion)))
    context = SimpleNamespace()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)

    class ClientContext:
        async def __aenter__(self):
            return await context.__aenter__()

        async def __aexit__(self, *args):
            return await context.__aexit__(*args)

    constructor = lambda **kwargs: ClientContext()  # noqa: E731
    monkeypatch.setattr(role_matching, "AsyncOpenAI", constructor)
    return completion


def response(items):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({"items": items})))]
    )


async def test_uses_groq_model_and_only_accepted_professional_fields(groq_transport):
    groq_transport.return_value = response(
        [
            {"candidate_id": "0", "similarity": 0.9},
            {"candidate_id": "1", "similarity": None},
        ]
    )
    result = await role_matching.GroqRoleMatcher().compare(
        {"title": "Python developer"},
        {
            "database-id": {
                "contact": {"email": "private@example.com", "full_name": "Private Name"},
                "skills": ["Python"],
                "work_experience": [{"title": "Developer", "company": "Private Employer"}],
                "education": [{"degree": "BSc", "institution": "Private School"}],
                "raw_text": "Unaccepted resume text",
                "summary": "May contain identifying details",
            },
            "second-id": {"skills": ["SQL"]},
            "empty-id": {},
        },
    )
    assert result == {"database-id": 0.9, "second-id": None, "empty-id": None}
    call = groq_transport.call_args.kwargs
    assert call["model"] == "configured-groq-model"
    assert call["response_format"]["json_schema"]["strict"] is True
    payload = json.loads(call["messages"][1]["content"])
    assert len(payload["candidates"]) == 2
    sent = call["messages"][1]["content"]
    for private in ("database-id", "private@example.com", "Private", "Unaccepted", "identifying"):
        assert private not in sent
    assert "Python" in sent and "Developer" in sent


@pytest.mark.parametrize(
    "items",
    [
        [],
        [{"candidate_id": "unknown", "similarity": 0.5}],
        [{"candidate_id": "0", "similarity": 0.5}] * 2,
        [{"candidate_id": "0", "similarity": 1.1}],
        [{"candidate_id": "0", "similarity": -0.1}],
        [{"candidate_id": "0", "similarity": "0.8"}],
        [{"candidate_id": "0", "similarity": float("nan")}],
        [{"candidate_id": "0", "similarity": True}],
    ],
)
async def test_rejects_invalid_or_invented_scores(groq_transport, items):
    groq_transport.return_value = response(items)
    with pytest.raises(ValueError):
        await role_matching.GroqRoleMatcher().compare(
            {"title": "Developer"}, {"real-id": {"skills": ["Python"]}}
        )


async def test_empty_professional_profiles_do_not_call_groq(groq_transport):
    result = await role_matching.GroqRoleMatcher().compare(
        {"title": "Developer"}, {"id": {"contact": {"full_name": "Name only"}}}
    )
    assert result == {"id": None}
    groq_transport.assert_not_called()


async def test_batches_reuse_aliases_without_mixing_candidates(groq_transport):
    groq_transport.side_effect = [
        response([{"candidate_id": str(index), "similarity": 0.5} for index in range(5)]),
        response([{"candidate_id": "0", "similarity": 0.9}]),
    ]
    profiles = {f"id-{index}": {"skills": ["Python"]} for index in range(6)}
    result = await role_matching.GroqRoleMatcher().compare({"title": "Developer"}, profiles)
    assert result == {**dict.fromkeys(list(profiles)[:5], 0.5), "id-5": 0.9}
    assert groq_transport.call_count == 2
