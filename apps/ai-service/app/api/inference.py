import hmac
import logging
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.models.embedder import embedder
from app.models.moderation import screen_text
from app.models.tagger import caption_hashtags, tagger
from app.schemas.contracts import (
    PostAnalyzeOutput,
    PostAnalyzePayload,
    SearchResultItem,
    SemanticSearchQuery,
    SemanticSearchResponse,
    TextModerationRequest,
    TextModerationResult,
)
from app.vectorstore.qdrant import qdrant_store

log = logging.getLogger("novak.inference")

# bge-small reads up to 512 tokens; this bounds the work for very long captions
MAX_DOCUMENT_CHARS = 1000


def verify_internal_secret(x_internal_secret: str | None = Header(None, alias="X-Internal-Secret")):
    if settings.AI_ENV == "production":
        if not x_internal_secret or not hmac.compare_digest(x_internal_secret, settings.INTERNAL_API_SECRET):
            raise HTTPException(status_code=401, detail="Unauthorized internal call")


router = APIRouter(prefix="/api/v1", tags=["AI Inference"], dependencies=[Depends(verify_internal_secret)])


def build_document(caption: str, tags: list[str]) -> str:
    """The text a post is indexed by: its caption plus the author's tags."""
    return " ".join(part for part in [caption.strip(), " ".join(tags)] if part)[:MAX_DOCUMENT_CHARS]


@router.post("/moderate", response_model=TextModerationResult)
async def moderate_text(payload: TextModerationRequest):
    """Caption keyword screening only. There is no image moderation endpoint."""
    return screen_text(payload.text)


@router.post("/analyze-post", response_model=PostAnalyzeOutput)
async def analyze_post_pipeline(payload: PostAnalyzePayload):
    """Screens the caption, embeds caption + tags and upserts the vector into Qdrant.

    Idempotent: the Qdrant point id is derived from the post id, so a redelivered job
    overwrites the same point. Returns 503 when the post has text to index but the model or
    Qdrant is unavailable, so the caller retries instead of recording the post as done.
    Flagged posts are indexed too; visibility is enforced when the API hydrates results.
    """
    moderation = screen_text(payload.caption)
    tags = caption_hashtags(payload.caption)
    document = build_document(payload.caption, payload.tags)

    if not document:
        # Image with no caption or tags: nothing to embed, and that's a final answer
        return PostAnalyzeOutput(post_id=payload.post_id, tags=tags, indexed=False, moderation=moderation)

    if not embedder.is_loaded:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")

    [vec] = await run_in_threadpool(embedder.embed_documents, [document])
    ai_tags = await run_in_threadpool(tagger.text_tags, vec)
    tags = list(dict.fromkeys(tags + ai_tags))[:10]

    try:
        await run_in_threadpool(
            qdrant_store.upsert_post,
            payload.post_id,
            vec,
            {"author_id": payload.author_id, "tags": tags, "timestamp": payload.timestamp},
        )
    except Exception as e:
        log.warning("Qdrant upsert failed for post %s: %s", payload.post_id, e)
        raise HTTPException(status_code=503, detail=f"Vector store unavailable: {e}") from e

    return PostAnalyzeOutput(post_id=payload.post_id, tags=tags, indexed=True, moderation=moderation)


@router.delete("/posts/{post_id}")
async def delete_post_vector(post_id: str):
    try:
        await run_in_threadpool(qdrant_store.delete_post, post_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Vector store unavailable: {e}") from e
    return {"postId": post_id, "deleted": True}


@router.post("/search", response_model=SemanticSearchResponse)
async def semantic_search(query: SemanticSearchQuery):
    if not embedder.is_loaded:
        # The API falls back to keyword search on any non-2xx
        raise HTTPException(status_code=503, detail="Semantic search unavailable: model not loaded")

    start = time.perf_counter()
    q_vec = await run_in_threadpool(embedder.embed_query, query.query)
    try:
        hits = await run_in_threadpool(
            qdrant_store.search_posts, q_vec, query.limit, query.filter_tag, settings.SEARCH_MIN_SCORE
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Vector store unavailable: {e}") from e

    results = [SearchResultItem(post_id=h["post_id"], score=round(h["score"], 4)) for h in hits]
    return SemanticSearchResponse(
        results=results,
        total=len(results),
        query=query.query,
        min_score=settings.SEARCH_MIN_SCORE,
        latency_ms=round((time.perf_counter() - start) * 1000, 2),
    )
