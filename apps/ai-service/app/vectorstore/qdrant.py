import uuid
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.config import settings


def point_id_for(post_id: str) -> str:
    # Qdrant ids must be UUIDs or integers; derive a stable UUID from the Mongo id
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, post_id))


class QdrantVectorStore:
    def __init__(self):
        self.client: QdrantClient | None = None

    def connect(self):
        try:
            if settings.QDRANT_URL:
                client = QdrantClient(
                    url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY or None, timeout=10.0
                )
                target = settings.QDRANT_URL
            else:
                client = QdrantClient(
                    host=settings.QDRANT_HOST,
                    port=settings.QDRANT_PORT,
                    api_key=settings.QDRANT_API_KEY or None,  # "" from .env would force HTTPS
                    https=False,
                    timeout=10.0,
                )
                target = f"{settings.QDRANT_HOST}:{settings.QDRANT_PORT}"
            self.client = client
            self.ensure_collection()
            print(f"[Qdrant] Connected to {target}")
        except Exception as e:
            print(f"[Qdrant] Connection not established ({e}). Vector indexing disabled.")
            self.client = None

    def ensure_collection(self):
        if not self.client:
            return
        name = settings.QDRANT_COLLECTION_POSTS
        if not self.client.collection_exists(name):
            self.client.create_collection(
                collection_name=name,
                vectors_config=qmodels.VectorParams(
                    size=settings.VECTOR_DIM, distance=qmodels.Distance.COSINE
                ),
            )
            print(f"[Qdrant] Created collection {name}")
        # Keyword index so tag filters stay fast as the collection grows
        self.client.create_payload_index(
            collection_name=name,
            field_name="tags",
            field_schema=qmodels.PayloadSchemaType.KEYWORD,
        )

    def upsert_post(self, post_id: str, vector: list[float], payload: dict[str, Any]) -> bool:
        if not self.client:
            return False
        try:
            self.client.upsert(
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
        if not self.client:
            return False
        self.client.delete(
            collection_name=settings.QDRANT_COLLECTION_POSTS,
            points_selector=qmodels.PointIdsList(points=[point_id_for(post_id)]),
        )
        return True

    def search_posts(
        self, vector: list[float], limit: int = 20, offset: int = 0, filter_tag: str | None = None
    ) -> list[dict[str, Any]]:
        """Raises when Qdrant is unreachable so the caller can report the outage."""
        if not self.client:
            raise RuntimeError("Qdrant is not connected")

        qfilter = None
        if filter_tag:
            qfilter = qmodels.Filter(
                must=[qmodels.FieldCondition(key="tags", match=qmodels.MatchValue(value=filter_tag))]
            )

        response = self.client.query_points(
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
