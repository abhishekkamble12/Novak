from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    AI_HOST: str = "0.0.0.0"
    AI_PORT: int = 8000
    AI_ENV: str = "development"
    INTERNAL_API_SECRET: str = "internal-ai-service-shared-secret-key"

    # Vector DB. QDRANT_URL (e.g. a Qdrant Cloud cluster URL) takes precedence over host/port.
    QDRANT_URL: str | None = None
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_GRPC_PORT: int = 6334
    QDRANT_COLLECTION_POSTS: str = "novak_posts_v1"
    QDRANT_API_KEY: str | None = None

    # CLIP Model Configuration
    CLIP_MODEL_NAME: str = "ViT-B-32"
    CLIP_PRETRAINED: str = "openai"
    DEVICE: str = "cpu"
    VECTOR_DIM: int = 512

    # Image download limits for analysis
    IMAGE_FETCH_TIMEOUT_S: float = 15.0
    IMAGE_MAX_BYTES: int = 15 * 1024 * 1024


settings = Settings()
