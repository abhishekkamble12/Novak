FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    EMBED_CACHE_DIR=/app/.cache/fastembed

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/ai-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Bake the ~67 MB ONNX embedding model into the image so containers start without downloading it
ARG EMBED_MODEL_NAME=BAAI/bge-small-en-v1.5
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('$EMBED_MODEL_NAME', cache_dir='$EMBED_CACHE_DIR')"

# Dev stage with hot-reloading
FROM base AS dev
COPY apps/ai-service/app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Prod stage (last, so platforms that build the final stage get this one)
FROM base AS prod
RUN useradd -m -u 1000 appuser
COPY apps/ai-service/app ./app
RUN mkdir -p /app/.cache && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -fs "http://localhost:${PORT:-8000}/health" || exit 1

# Railway injects PORT and its private network is IPv6, hence "::" (dual-stack) by default.
# docker-compose sets AI_HOST=0.0.0.0.
CMD ["sh", "-c", "exec uvicorn app.main:app --host \"${AI_HOST:-::}\" --port \"${PORT:-8000}\" --proxy-headers"]
