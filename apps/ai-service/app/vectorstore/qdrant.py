import time
import uuid
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.config import settings

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
            print(f"[Qdrant] Connected to {self.target}")
            return True
        except Exception as e:
            print(f"[Qdrant] Not reachable at {self.target} ({e}). Will retry on demand.")
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
            print(f"[Qdrant] Created collection {name}")
        # Keyword index so tag filters stay fast as the collection grows
        client.create_payload_index(
            collection_name=name,
            field_name="tags",
            field_schema=qmodels.PayloadSchemaType.KEYWORD,
        )

    def upsert_post(self, post_id: str, vector: list[float], payload: dict[str, Any]) -> bool:
        client = self._get_client()
        if not client:
            return False
        try:
            client.upsert(
                collection_name=settings.QDRANT_COLLECTION_POSTS,
                points=[
                    qmodels.PointStruct(
                        id=point_id_for(post_id), vector=vector, payload={"post_id": post_id, **payload}
                    )
                ],
            )
            return True
        except Exception as e:
            print(f"[Qdrant] Upsert error: {e}")
            return False

    def delete_post(self, post_id: str) -> bool:
        client = self._get_client()
        if not client:
            return False
        client.delete(
            collection_name=settings.QDRANT_COLLECTION_POSTS,
            points_selector=qmodels.PointIdsList(points=[point_id_for(post_id)]),
        )
        return True

    def search_posts(
        self, vector: list[float], limit: int = 20, offset: int = 0, filter_tag: str | None = None
    ) -> list[dict[str, Any]]:
        """Raises when Qdrant is unreachable so the caller can report the outage."""
        client = self._get_client()
        if not client:
            raise RuntimeError(f"Qdrant is not reachable at {self.target}")

        qfilter = None
        if filter_tag:
            qfilter = qmodels.Filter(
                must=[qmodels.FieldCondition(key="tags", match=qmodels.MatchValue(value=filter_tag))]
            )

        response = client.query_points(
            collection_name=settings.QDRANT_COLLECTION_POSTS,
            query=vector,
            limit=limit,
            offset=offset,
            query_filter=qfilter,
            with_payload=True,
        )
        return [
            {
                "post_id": (p.payload or {}).get("post_id", str(p.id)),
                "score": p.score,
                "payload": p.payload or {},
            }
            for p in response.points
        ]


qdrant_store = QdrantVectorStore()
