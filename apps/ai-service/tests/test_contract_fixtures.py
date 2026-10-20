"""The FastAPI responses must match packages/contracts/fixtures/*.json byte for byte (as JSON).
apps/api/src/contracts.test.ts parses the same files with the Zod schemas, so a field renamed
on either side fails a test. Regenerate after an intentional change with:
    UPDATE_FIXTURES=1 python -m pytest tests/test_contract_fixtures.py
"""

import json
import os
from pathlib import Path

from app.api import inference
from app.vectorstore.qdrant import qdrant_store
from tests.test_inference_api import client, job  # noqa: F401  (pytest fixture)

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "fixtures"


def check(name: str, payload: dict):
    path = FIXTURES / name
    if os.environ.get("UPDATE_FIXTURES"):
        path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    assert json.loads(path.read_text(encoding="utf-8")) == payload


def test_analyze_post_response_matches_fixture(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(qdrant_store, "upsert_post", lambda *a: None)
    res = client.post("/api/v1/analyze-post", json=job(caption="free crypto at the beach #sunset"))
    check("analyze-post.response.json", res.json())


def test_analyze_post_request_matches_fixture():
    check("analyze-post.request.json", job())


def test_search_response_matches_fixture(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(
        qdrant_store, "search_posts", lambda *a: [{"post_id": "65f000000000000000000001", "score": 0.7312}]
    )
    monkeypatch.setattr(inference.settings, "SEARCH_MIN_SCORE", 0.62)
    body = client.post("/api/v1/search", json={"query": "sunset"}).json()
    body["latencyMs"] = 1.0  # timing varies
    check("search.response.json", body)
