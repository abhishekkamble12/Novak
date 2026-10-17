from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    AI_HOST: str = "0.0.0.0"
    AI_PORT: int = 8000
    AI_ENV: str = "development"
    INTERNAL_API_SECRET: str = "internal-ai-service-shared-secret-key"

    # Vector DB: the qdrant container from infra/docker-compose.yml ("qdrant" inside the compose network)
    # 127.0.0.1, not localhost: on Windows "localhost" tries ::1 first and costs ~2s per request
    QDRANT_HOST: str = "127.0.0.1"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION_POSTS: str = "novak_posts_v2"

    # FastEmbed text model (ONNX, CPU). Changing the model changes VECTOR_DIM: use a new collection.
    EMBED_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"
    EMBED_CACHE_DIR: str = ".cache/fastembed"
    VECTOR_DIM: int = 384


settings = Settings()
