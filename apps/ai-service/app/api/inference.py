import hmac
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.embedder import embedder
from app.models.moderation import moderation_service
from app.models.tagger import caption_hashtags, tagger
from app.schemas.contracts import (
    ModerationRequest,
    ModerationResult,
    PostAnalyzeOutput,
    PostAnalyzePayload,
    SearchResultItem,
    SemanticSearchQuery,
    SemanticSearchResponse,
)
from app.vectorstore.qdrant import qdrant_store


def verify_internal_secret(x_internal_secret: str | None = Header(None, alias="X-Internal-Secret")):
    if settings.AI_ENV == "production":
        if not x_internal_secret or not hmac.compare_digest(x_internal_secret, settings.INTERNAL_API_SECRET):
            raise HTTPException(status_code=401, detail="Unauthorized internal call")


router = APIRouter(prefix="/api/v1", tags=["AI Inference"], dependencies=[Depends(verify_internal_secret)])


@router.post("/moderate", response_model=ModerationResult)
async def moderate_content(payload: ModerationRequest):
    text_result = await run_in_threadpool(moderation_service.evaluate_text, payload.text)
    if text_result.is_flagged:
        return text_result
    return await run_in_threadpool(moderation_service.evaluate_image, payload.image_url)


@router.post("/analyze-post", response_model=PostAnalyzeOutput)
async def analyze_post_pipeline(payload: PostAnalyzePayload):
    mod = await run_in_threadpool(moderation_service.evaluate_text, payload.caption)
    tags = caption_hashtags(payload.caption)
    indexed = False

    # Posts are indexed by their text; an image with no caption has nothing to embed
    if embedder.is_loaded and mod.status != "rejected" and payload.caption.strip():
        # bge-small reads up to 512 tokens; this just bounds the work for very long captions
        [vec] = await run_in_threadpool(embedder.embed_documents, [payload.caption[:1000]])
        ai_tags = await run_in_threadpool(tagger.text_tags, vec)
        tags = list(dict.fromkeys(tags + ai_tags))[:10]

        indexed = await run_in_threadpool(
            qdrant_store.upsert_post,
            payload.post_id,
            vec,
            {
                "author_id": payload.author_id,
                "author_username": payload.author_username or "user",
                "caption": payload.caption,
                "media_url": payload.media_url,
                "tags": tags,
                "timestamp": payload.timestamp,
            },
        )

    return PostAnalyzeOutput(post_id=payload.post_id, tags=tags[:10], indexed=indexed, moderation=mod)


@router.delete("/posts/{post_id}")
async def delete_post_vector(post_id: str):
    try:
        deleted = await run_in_threadpool(qdrant_store.delete_post, post_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Vector store unavailable: {e}") from e
    return {"postId": post_id, "deleted": deleted}


@router.post("/search", response_model=SemanticSearchResponse)
async def semantic_search(query: SemanticSearchQuery):
    if not embedder.is_loaded:
        # The API falls back to keyword search on any non-2xx
        raise HTTPException(status_code=503, detail="Semantic search unavailable: model not loaded")

    start = time.time()
    q_vec = await run_in_threadpool(embedder.embed_query, query.query)
    try:
        hits = await run_in_threadpool(
            qdrant_store.search_posts, q_vec, query.limit, query.offset, query.filter_tag
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Vector store unavailable: {e}") from e

    results = [
        SearchResultItem(
            post_id=h["post_id"],
            score=round(float(h["score"]), 4),
            caption=h["payload"].get("caption", ""),
            media_url=h["payload"].get("media_url", ""),
            author_username=h["payload"].get("author_username", "user"),
            tags=h["payload"].get("tags", []),
        )
        for h in hits
    ]

    return SemanticSearchResponse(
        results=results,
        total=len(results),
        query=query.query,
        latency_ms=round((time.time() - start) * 1000, 2),
    )
