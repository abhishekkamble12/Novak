FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/app/.cache/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY apps/ai-service/requirements.txt apps/ai-service/requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# WITH_CLIP=true installs torch + OpenCLIP and bakes the model weights into the image, enabling
# semantic search and AI tags. On Railway, set WITH_CLIP as a service variable: Railway passes
# variables named by ARG into the build.
ARG WITH_CLIP=false
ARG CLIP_MODEL_NAME=ViT-B-32
ARG CLIP_PRETRAINED=openai
RUN if [ "$WITH_CLIP" = "true" ]; then \
      pip install --no-cache-dir -r requirements-ml.txt && \
      python -c "import open_clip; open_clip.create_model_and_transforms('$CLIP_MODEL_NAME', pretrained='$CLIP_PRETRAINED')"; \
    fi

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
