import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    AI_HOST: str = "0.0.0.0"
    AI_PORT: int = 8000
    AI_ENV: str = "development"
    INTERNAL_API_SECRET: str = "internal-ai-service-shared-secret-key"

    REDIS_URL: str = "redis://localhost:6379"

    # Vector DB
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_GRPC_PORT: int = 6334
    QDRANT_COLLECTION_POSTS: str = "lumen_posts_v1"
    QDRANT_API_KEY: str | None = None

    # CLIP Model Configuration
    CLIP_MODEL_NAME: str = "ViT-B-32"
    CLIP_PRETRAINED: str = "openai"
    TEXT_EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    DEVICE: str = "cpu"
    VECTOR_DIM: int = 512

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
