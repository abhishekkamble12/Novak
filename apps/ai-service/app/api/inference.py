import time
from fastapi import APIRouter, HTTPException, Depends, Header
from app.config import settings
from app.models.clip_loader import clip_service
from app.models.moderation import moderation_service
from app.vectorstore.qdrant import qdrant_store
from app.schemas.contracts import (
    ModerationRequest,
    ModerationResult,
    EmbeddingRequest,
    EmbeddingResponse,
    PostAnalyzePayload,
    PostAnalyzeOutput,
    SemanticSearchQuery,
    SemanticSearchResponse,
    SearchResultItem,
)

router = APIRouter(prefix="/api/v1", tags=["AI Inference"])

def verify_internal_secret(x_api_secret: str = Header(None)):
    if settings.AI_ENV == "production" and x_api_secret != settings.INTERNAL_API_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized internal call")
    return True

@router.post("/moderate", response_model=ModerationResult, dependencies=[Depends(verify_internal_secret)])
async def moderate_content(payload: ModerationRequest):
    text_result = moderation_service.evaluate_text(payload.text)
    if text_result.is_flagged:
        return text_result
    return moderation_service.evaluate_image(payload.image_url)

@router.post("/embed", response_model=EmbeddingResponse, dependencies=[Depends(verify_internal_secret)])
async def generate_embedding(payload: EmbeddingRequest):
    if not payload.text and not payload.image_url:
        raise HTTPException(status_code=400, detail="Provide either text or image_url")

    if payload.text:
        vec = clip_service.get_text_embedding(payload.text)
    else:
        vec = clip_service.get_text_embedding(payload.image_url or "image")

    return EmbeddingResponse(
        embedding=vec,
        dimension=len(vec),
        model=settings.CLIP_MODEL_NAME
    )

@router.post("/analyze-post", response_model=PostAnalyzeOutput, dependencies=[Depends(verify_internal_secret)])
async def analyze_post_pipeline(payload: PostAnalyzePayload):
    # 1. Moderation check
    mod = moderation_service.evaluate_text(payload.caption)
    
    # 2. Embedding generation (combining caption and post context)
    text_content = payload.caption if payload.caption else "Visual post"
    vec = clip_service.get_text_embedding(text_content)

    # 3. Simple tag generation from caption
    words = [w.strip("#.,!").lower() for w in payload.caption.split() if len(w) > 3]
    tags = list(dict.fromkeys(words))[:5]

    # 4. Upsert into Qdrant if approved
    if mod.status != "rejected":
        qdrant_store.upsert_post(
            post_id=payload.post_id,
            vector=vec,
            payload={
                "author_id": payload.author_id,
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
    
    # Encode natural language query into vector space
    q_vec = clip_service.get_text_embedding(query.query)

    # Search in Qdrant
    hits = qdrant_store.search_posts(q_vec, limit=query.limit)

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
