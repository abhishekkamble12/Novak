from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.inference import router as inference_router
from app.config import settings
from app.models.clip_loader import clip_service
from app.vectorstore.qdrant import qdrant_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load models & connect vector DB
    print("[AI-Service] Starting up Novak AI Service...")
    clip_service.load_model()
    qdrant_store.connect()
    yield
    # Shutdown: Clean up resources
    print("[AI-Service] Shutting down Novak AI Service...")

def create_app() -> FastAPI:
    app = FastAPI(
        title="Novak AI Service",
        description="Async AI Pipeline for Embeddings, Semantic Search, and Safety Moderation",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(inference_router)

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.AI_HOST, port=settings.AI_PORT, reload=True)
