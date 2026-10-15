from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from app.config import settings

class QdrantVectorStore:
    def __init__(self):
        self.client: Optional[QdrantClient] = None

    def connect(self):
        try:
            self.client = QdrantClient(
                host=settings.QDRANT_HOST,
                port=settings.QDRANT_PORT,
                api_key=settings.QDRANT_API_KEY,
                timeout=5.0
            )
            self.ensure_collection()
            print(f"[Qdrant] Connected to {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")
        except Exception as e:
            print(f"[Qdrant] Notice: Connection not established ({e}). Will run in standalone memory mode if needed.")
            self.client = None

    def ensure_collection(self):
        if not self.client:
            return

        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == settings.QDRANT_COLLECTION_POSTS for c in collections)

            if not exists:
                self.client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION_POSTS,
                    vectors_config=qmodels.VectorParams(
                        size=settings.VECTOR_DIM,
                        distance=qmodels.Distance.COSINE
                    )
                )
                print(f"[Qdrant] Created collection {settings.QDRANT_COLLECTION_POSTS}")
        except Exception as e:
            print(f"[Qdrant] Collection check warning: {e}")

    def upsert_post(self, post_id: str, vector: List[float], payload: Dict[str, Any]):
        if not self.client:
            return False

        try:
            # We map post_id to a deterministic point ID or use string if Qdrant supports UUID/hash
            import uuid
            point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, post_id))
            
            self.client.upsert(
                collection_name=settings.QDRANT_COLLECTION_POSTS,
                points=[
                    qmodels.PointStruct(
                        id=point_id,
                        vector=vector,
                        payload={"post_id": post_id, **payload}
                    )
                ]
            )
            return True
        except Exception as e:
            print(f"[Qdrant] Upsert error: {e}")
            return False

    def search_posts(self, vector: List[float], limit: int = 20) -> List[Dict[str, Any]]:
        if not self.client:
            return []

        try:
            results = self.client.search(
                collection_name=settings.QDRANT_COLLECTION_POSTS,
                query_vector=vector,
                limit=limit,
                with_payload=True
            )
            return [
                {
                    "post_id": r.payload.get("post_id", str(r.id)),
                    "score": r.score,
                    "payload": r.payload
                }
                for r in results
            ]
        except Exception as e:
            print(f"[Qdrant] Search error: {e}")
            return []

qdrant_store = QdrantVectorStore()
