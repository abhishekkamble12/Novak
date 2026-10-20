from fastapi import APIRouter
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.embedder import embedder
from app.vectorstore.qdrant import qdrant_store

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    # Always 200 while the process is up (liveness). "degraded" means analysis jobs will be
    # retried and search falls back to keyword mode until the components recover.
    qdrant_ok = await run_in_threadpool(qdrant_store.is_healthy)
    return {
        "status": "healthy" if qdrant_ok and embedder.is_loaded else "degraded",
        "service": "novak-ai-service",
        "env": settings.AI_ENV,
        "components": {
            "qdrant": "healthy" if qdrant_ok else "unavailable",
            "embedding_model": settings.EMBED_MODEL_NAME if embedder.is_loaded else "not_loaded",
        },
    }
