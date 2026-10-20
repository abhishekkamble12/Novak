"""Endpoint behaviour with the model and Qdrant replaced by fakes (no network, no model load)."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.api import inference
from app.main import create_app
from app.models.embedder import embedder
from app.vectorstore.qdrant import qdrant_store


class FakeModel:
    def embed(self, texts):
        return [np.ones(384) / np.sqrt(384) for _ in texts]

    def query_embed(self, text):
        yield np.ones(384) / np.sqrt(384)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(embedder, "model", FakeModel())
    monkeypatch.setattr(inference.tagger, "text_tags", lambda vec: ["beach"])
    # TestClient without a context manager skips lifespan, so nothing real is loaded
    return TestClient(create_app())


def job(**overrides):
    body = {
        "postId": "65f000000000000000000001",
        "authorId": "65f000000000000000000002",
        "authorUsername": "ada",
        "mediaUrl": "https://example.com/a.jpg",
        "caption": "Golden hour on the beach #sunset",
        "tags": ["travel"],
        "timestamp": 1700000000000,
    }
    body.update(overrides)
    return body


def test_analyze_indexes_caption_and_tags(client, monkeypatch):
    calls = []
    monkeypatch.setattr(qdrant_store, "upsert_post", lambda pid, vec, payload: calls.append((pid, payload)))

    res = client.post("/api/v1/analyze-post", json=job())

    assert res.status_code == 200
    body = res.json()
    assert body["indexed"] is True
    assert body["tags"] == ["sunset", "beach"]
    assert body["moderation"]["status"] == "approved"
    assert calls[0][0] == "65f000000000000000000001"


def test_analyze_returns_503_when_qdrant_fails(client, monkeypatch):
    def boom(*_args):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(qdrant_store, "upsert_post", boom)
    res = client.post("/api/v1/analyze-post", json=job())
    # Retryable: the worker must not record the post as processed
    assert res.status_code == 503


def test_analyze_returns_503_when_model_not_loaded(client, monkeypatch):
    monkeypatch.setattr(embedder, "model", None)
    res = client.post("/api/v1/analyze-post", json=job())
    assert res.status_code == 503


def test_analyze_without_text_is_a_final_not_indexed_result(client, monkeypatch):
    monkeypatch.setattr(embedder, "model", None)  # never needed
    res = client.post("/api/v1/analyze-post", json=job(caption="", tags=[]))
    assert res.status_code == 200
    assert res.json()["indexed"] is False


def test_flagged_posts_are_still_indexed(client, monkeypatch):
    calls = []
    monkeypatch.setattr(qdrant_store, "upsert_post", lambda *a: calls.append(a))
    res = client.post("/api/v1/analyze-post", json=job(caption="free crypto giveaway"))
    assert res.json()["moderation"]["status"] == "flagged"
    assert res.json()["indexed"] is True
    assert len(calls) == 1


def test_analyze_rejects_malformed_payload(client):
    res = client.post("/api/v1/analyze-post", json={"postId": "x"})
    assert res.status_code == 422


def test_search_applies_min_score_and_returns_ids(client, monkeypatch):
    seen = {}

    def fake_search(vec, limit, filter_tag, min_score):
        seen.update(limit=limit, filter_tag=filter_tag, min_score=min_score)
        return [{"post_id": "p1", "score": 0.812345}]

    monkeypatch.setattr(qdrant_store, "search_posts", fake_search)
    monkeypatch.setattr(inference.settings, "SEARCH_MIN_SCORE", 0.6)

    res = client.post("/api/v1/search", json={"query": "dog on a beach", "limit": 5, "filterTag": "pets"})

    assert res.status_code == 200
    body = res.json()
    assert body["results"] == [{"postId": "p1", "score": 0.8123}]
    assert body["minScore"] == 0.6
    assert seen == {"limit": 5, "filter_tag": "pets", "min_score": 0.6}


def test_search_503_when_model_not_loaded(client, monkeypatch):
    monkeypatch.setattr(embedder, "model", None)
    assert client.post("/api/v1/search", json={"query": "dog"}).status_code == 503


def test_search_503_when_qdrant_down(client, monkeypatch):
    def down(*_a):
        raise RuntimeError("unreachable")

    monkeypatch.setattr(qdrant_store, "search_posts", down)
    assert client.post("/api/v1/search", json={"query": "dog"}).status_code == 503


def test_internal_secret_enforced_in_production(client, monkeypatch):
    monkeypatch.setattr(inference.settings, "AI_ENV", "production")
    monkeypatch.setattr(inference.settings, "INTERNAL_API_SECRET", "s3cret")
    assert client.post("/api/v1/moderate", json={"text": "hi"}).status_code == 401
    ok = client.post("/api/v1/moderate", json={"text": "hi"}, headers={"X-Internal-Secret": "s3cret"})
    assert ok.status_code == 200


def test_build_document_combines_caption_and_tags():
    assert inference.build_document("  Sunset  ", ["beach", "travel"]) == "Sunset beach travel"
    assert inference.build_document("", []) == ""
    assert len(inference.build_document("x" * 5000, [])) == inference.MAX_DOCUMENT_CHARS
