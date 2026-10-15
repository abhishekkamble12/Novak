import hmac
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.clip_loader import clip_service
from app.models.moderation import moderation_service
from app.schemas.contracts import (
    EmbeddingRequest,
    EmbeddingResponse,
    ModerationRequest,
    ModerationResult,
    PostAnalyzeOutput,
    PostAnalyzePayload,
    SearchResultItem,
    SemanticSearchQuery,
    SemanticSearchResponse,
)
from app.vectorstore.qdrant import qdrant_store

router = APIRouter(prefix="/api/v1", tags=["AI Inference"])

def verify_internal_secret(x_internal_secret: str = Header(None, alias="X-Internal-Secret")):
    if settings.AI_ENV == "production":
        if not x_internal_secret or not hmac.compare_digest(x_internal_secret, settings.INTERNAL_API_SECRET):
            raise HTTPException(status_code=401, detail="Unauthorized internal call")
    return True

@router.post("/moderate", response_model=ModerationResult, dependencies=[Depends(verify_internal_secret)])
async def moderate_content(payload: ModerationRequest):
    text_result = await run_in_threadpool(moderation_service.evaluate_text, payload.text)
    if text_result.is_flagged:
        return text_result
    return await run_in_threadpool(moderation_service.evaluate_image, payload.image_url)

@router.post("/embed", response_model=EmbeddingResponse, dependencies=[Depends(verify_internal_secret)])
async def generate_embedding(payload: EmbeddingRequest):
    if not payload.text and not payload.image_url:
        raise HTTPException(status_code=400, detail="Provide either text or image_url")

    text_to_embed = payload.text if payload.text else (payload.image_url or "image")
    vec = await run_in_threadpool(clip_service.get_text_embedding, text_to_embed)

    return EmbeddingResponse(
        embedding=vec,
        dimension=len(vec),
        model=settings.CLIP_MODEL_NAME
    )

@router.post(
    "/analyze-post",
    response_model=PostAnalyzeOutput,
    dependencies=[Depends(verify_internal_secret)],
)
async def analyze_post_pipeline(payload: PostAnalyzePayload):
    # 1. Moderation check
    mod = await run_in_threadpool(moderation_service.evaluate_text, payload.caption)

    # 2. Embedding generation
    text_content = payload.caption if payload.caption else "Visual post"
    vec = await run_in_threadpool(clip_service.get_text_embedding, text_content)

    # 3. Simple tag generation from caption
    words = [w.strip("#.,!").lower() for w in payload.caption.split() if len(w) > 3]
    tags = list(dict.fromkeys(words))[:5]

    # 4. Upsert into Qdrant if approved
    if mod.status != "rejected":
        await run_in_threadpool(
            qdrant_store.upsert_post,
            payload.post_id,
            vec,
            {
                "author_id": payload.author_id,
                "author_username": payload.author_username or "user",
                "caption": payload.caption,
                "media_url": payload.media_url,
                "tags": tags,
                "timestamp": payload.timestamp
            }
        )

    return PostAnalyzeOutput(
        post_id=payload.post_id,
        embedding=vec,
        tags=tags,
        moderation=mod
    )

@router.post("/search", response_model=SemanticSearchResponse, dependencies=[Depends(verify_internal_secret)])
async def semantic_search(query: SemanticSearchQuery):
    start = time.time()

    # Encode query in worker threadpool to prevent event loop starvation
    q_vec = await run_in_threadpool(clip_service.get_text_embedding, query.query)

    # Search in Qdrant with offset and filter_tag
    hits = await run_in_threadpool(
        qdrant_store.search_posts,
        q_vec,
        query.limit,
        query.offset,
        query.filter_tag
    )

    results = []
    for h in hits:
        p = h.get("payload", {})
        results.append(
            SearchResultItem(
                post_id=h.get("post_id", ""),
                score=round(float(h.get("score", 0.0)), 4),
                caption=p.get("caption", ""),
                media_url=p.get("media_url", ""),
                author_username=p.get("author_username", "user"),
                tags=p.get("tags", []),
            )
        )

    elapsed_ms = round((time.time() - start) * 1000, 2)
    return SemanticSearchResponse(
        results=results,
        total=len(results),
        query=query.query,
        latency_ms=elapsed_ms
    )
