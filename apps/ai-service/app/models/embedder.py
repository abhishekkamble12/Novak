import logging

from app.config import settings

log = logging.getLogger("novak.embedder")


class TextEmbedder:
    """FastEmbed (ONNX, CPU-only) sentence embeddings. The default model, bge-small-en-v1.5,
    is a ~67 MB download on first load, cached in EMBED_CACHE_DIR. Posts are embedded from
    their caption and tags (text only; images are never looked at). If the model can't load,
    search returns 503 and the API falls back to keyword search; analysis returns 503 and the
    job is retried."""

    def __init__(self):
        self.model = None

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    def load_model(self):
        try:
            from fastembed import TextEmbedding

            self.model = TextEmbedding(settings.EMBED_MODEL_NAME, cache_dir=settings.EMBED_CACHE_DIR)
            log.info("Loaded embedding model %s", settings.EMBED_MODEL_NAME)
        except Exception as e:
            log.error("Embedding model %s not available: %s", settings.EMBED_MODEL_NAME, e)
            self.model = None

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self.model.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        # bge models prepend a retrieval instruction to short queries; query_embed handles it
        return next(iter(self.model.query_embed(text))).tolist()


embedder = TextEmbedder()
