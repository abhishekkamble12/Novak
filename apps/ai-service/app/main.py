import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from app.api.health import router as health_router
from app.api.inference import router as inference_router
from app.config import settings
from app.models.embedder import embedder
from app.vectorstore.qdrant import qdrant_store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("novak")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Novak AI service")
    await run_in_threadpool(embedder.load_model)
    await run_in_threadpool(qdrant_store.connect)
    yield
    log.info("Shutting down Novak AI service")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Novak AI Service",
        description="Caption embeddings, semantic text search over Qdrant, and rule-based caption screening",
        version="1.0.0",
        lifespan=lifespan,
    )
    # No CORS middleware: only the Node API calls this service, server to server
    app.include_router(health_router)
    app.include_router(inference_router)
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.AI_HOST, port=settings.AI_PORT, reload=True)
