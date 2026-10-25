import logging
import time
import uuid
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.config import settings

log = logging.getLogger("novak.qdrant")

# Seconds between reconnect attempts while Qdrant is down
RECONNECT_INTERVAL_S = 10.0


def point_id_for(post_id: str) -> str:
    # Qdrant ids must be UUIDs or integers; derive a stable UUID from the Mongo id
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, post_id))


class QdrantVectorStore:
    """Qdrant running in Docker (infra/docker-compose.yml). If it isn't reachable at startup,
    calls retry the connection lazily, so starting the AI service before the container is fine."""

    def __init__(self):
        self.client: QdrantClient | None = None
        self._last_attempt = 0.0

    @property
    def target(self) -> str:
        return f"{settings.QDRANT_HOST}:{settings.QDRANT_PORT}"

    def connect(self) -> bool:
        self._last_attempt = time.monotonic()
        try:
            client = QdrantClient(
                host=settings.QDRANT_HOST, port=settings.QDRANT_PORT, https=False, timeout=10.0
            )
            self._ensure_collection(client)
            self.client = client
            log.info("Connected to Qdrant at %s", self.target)
            return True
        except Exception as e:
            log.warning("Qdrant not reachable at %s (%s); will retry on demand", self.target, e)
            self.client = None
            return False

    def _get_client(self) -> QdrantClient | None:
        if self.client is None and time.monotonic() - self._last_attempt >= RECONNECT_INTERVAL_S:
            self.connect()
        return self.client

    def is_healthy(self) -> bool:
        client = self._get_client()
        if client is None:
            return False
        try:
            client.get_collections()
            return True
        except Exception:
            # Container went away; drop the client so the next call reconnects
            self.client = None
            return False

    @staticmethod
    def _ensure_collection(client: QdrantClient):
        name = settings.QDRANT_COLLECTION_POSTS
        if not client.collection_exists(name):
            client.create_collection(
                collection_name=name,
                vectors_config=qmodels.VectorParams(
                    size=settings.VECTOR_DIM, distance=qmodels.Distance.COSINE
                ),
            )
            log.info("Created Qdrant collection %s", name)
        # Keyword index so tag filters stay fast as the collection grows
        client.create_payload_index(
            collection_name=name,
            field_name="tags",
            field_schema=qmodels.PayloadSchemaType.KEYWORD,
        )

    def _require_client(self) -> QdrantClient:
        client = self._get_client()
        if client is None:
            raise RuntimeError(f"Qdrant is not reachable at {self.target}")
        return client

    def upsert_post(self, post_id: str, vector: list[float], payload: dict[str, Any]) -> None:
        """Raises when Qdrant is unreachable, so the caller can retry rather than lose the vector."""
        try:
            self._require_client().upsert(
                collection_name=settings.QDRANT_COLLECTION_POSTS,
                points=[
                    qmodels.PointStruct(
                        id=point_id_for(post_id), vector=vector, payload={"post_id": post_id, **payload}
                    )
                ],
            )
        except Exception:
            # Container may have restarted; reconnect on the next call
            self.client = None
            raise

    def delete_post(self, post_id: str) -> None:
        self._require_client().delete(
            collection_name=settings.QDRANT_COLLECTION_POSTS,
            points_selector=qmodels.PointIdsList(points=[point_id_for(post_id)]),
        )

    def search_posts(
        self,
        vector: list[float],
        limit: int = 20,
        filter_tag: str | None = None,
        min_score: float | None = None,
    ) -> list[dict[str, Any]]:
        """Cosine top-k, dropping hits below min_score. Raises when Qdrant is unreachable."""
        client = self._require_client()

        qfilter = None
        if filter_tag:
            qfilter = qmodels.Filter(
                must=[qmodels.FieldCondition(key="tags", match=qmodels.MatchValue(value=filter_tag))]
            )

        response = client.query_points(
            collection_name=settings.QDRANT_COLLECTION_POSTS,
            query=vector,
            limit=limit,
            query_filter=qfilter,
            score_threshold=min_score,
            with_payload=True,
        )
        return [
            {
                "post_id": (p.payload or {}).get("post_id", str(p.id)),
                "score": float(p.score),
            }
            for p in response.points
        ]


qdrant_store = QdrantVectorStore()
