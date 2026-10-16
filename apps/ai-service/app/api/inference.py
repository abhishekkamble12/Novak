import hmac
import time
from urllib.parse import urljoin

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.clip_loader import clip_service
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


async def fetch_image(url: str) -> bytes:
    """Downloads a user-supplied image. Only https is followed (including redirects), so the
    service can't be pointed at plain-http internal hosts. Raises 422 on any failure: the
    caller treats 4xx as permanent and flags the post instead of retrying."""
    async with httpx.AsyncClient(timeout=settings.IMAGE_FETCH_TIMEOUT_S, follow_redirects=False) as client:
        for _ in range(4):
            if not url.startswith("https://"):
                raise HTTPException(status_code=422, detail="Image URL must use https")
            try:
                async with client.stream("GET", url, headers={"User-Agent": "NovakBot/1.0"}) as res:
                    if res.is_redirect and "location" in res.headers:
                        url = urljoin(url, res.headers["location"])
                        continue
                    if res.status_code != 200:
                        raise HTTPException(status_code=422, detail=f"Image fetch returned {res.status_code}")
                    chunks, size = [], 0
                    async for chunk in res.aiter_bytes():
                        size += len(chunk)
                        if size > settings.IMAGE_MAX_BYTES:
                            raise HTTPException(status_code=422, detail="Image is too large")
                        chunks.append(chunk)
                    return b"".join(chunks)
            except httpx.HTTPError as e:
                raise HTTPException(status_code=422, detail=f"Image could not be fetched: {e}") from e
    raise HTTPException(status_code=422, detail="Too many redirects")


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

    if clip_service.is_loaded and mod.status != "rejected":
        image_bytes = await fetch_image(payload.media_url)
        try:
            image_vec = await run_in_threadpool(clip_service.get_image_embedding, image_bytes)
        except Exception as e:
            # PIL couldn't decode it: not an image, won't succeed on retry
            raise HTTPException(status_code=422, detail=f"Unsupported image: {e}") from e

        vec = await run_in_threadpool(clip_service.get_post_embedding, image_vec, payload.caption)
        ai_tags = await run_in_threadpool(tagger.image_tags, image_vec)
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
    if not clip_service.is_loaded:
        # The API falls back to keyword search on any non-2xx
        raise HTTPException(status_code=503, detail="Semantic search unavailable: model not loaded")

    start = time.time()
    q_vec = await run_in_threadpool(clip_service.get_text_embedding, query.query)
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
