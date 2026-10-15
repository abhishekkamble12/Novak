from fastapi import APIRouter

from app.config import settings
from app.models.clip_loader import clip_service
from app.vectorstore.qdrant import qdrant_store

router = APIRouter(tags=["Health"])

@router.get("/health")
async def health_check():
    qdrant_status = "healthy" if qdrant_store.client is not None else "degraded"
    model_status = "loaded" if clip_service._is_loaded else "fallback_mode"

    return {
        "status": "healthy" if qdrant_status == "healthy" else "degraded",
        "service": "novak-ai-service",
        "env": settings.AI_ENV,
        "components": {
            "qdrant": qdrant_status,
            "clip_model": model_status,
            "device": settings.DEVICE,
        }
    }
