from fastapi import APIRouter

from app.config import settings
from app.models.clip_loader import clip_service
from app.vectorstore.qdrant import qdrant_store

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    # Always 200 while the process is up: moderation works without Qdrant or the model,
    # and the API degrades to keyword search. The components show what's actually live.
    qdrant_ok = qdrant_store.client is not None
    return {
        "status": "healthy" if qdrant_ok and clip_service.is_loaded else "degraded",
        "service": "novak-ai-service",
        "env": settings.AI_ENV,
        "components": {
            "qdrant": "healthy" if qdrant_ok else "unavailable",
            "clip_model": "loaded" if clip_service.is_loaded else "not_installed",
            "device": settings.DEVICE,
        },
    }
