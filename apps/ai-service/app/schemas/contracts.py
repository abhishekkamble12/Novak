from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, HttpUrl, Field

class ModerationRequest(BaseModel):
    image_url: Optional[str] = None
    text: Optional[str] = None

class ModerationResult(BaseModel):
    is_flagged: bool = False
    status: Literal["approved", "flagged", "rejected"] = "approved"
    confidence: float = 1.0
    labels: List[str] = Field(default_factory=list)
    scores: Dict[str, float] = Field(default_factory=dict)
    reason: Optional[str] = None

class EmbeddingRequest(BaseModel):
    text: Optional[str] = None
    image_url: Optional[str] = None

class EmbeddingResponse(BaseModel):
    embedding: List[float]
    dimension: int
    model: str

class PostAnalyzePayload(BaseModel):
    post_id: str
    author_id: str
    media_url: str
    caption: str
    timestamp: float

class PostAnalyzeOutput(BaseModel):
    post_id: str
    embedding: List[float]
    tags: List[str]
    moderation: ModerationResult

class SemanticSearchQuery(BaseModel):
    query: str
    limit: int = 20
    offset: int = 0
    filter_tag: Optional[str] = None

class SearchResultItem(BaseModel):
    post_id: str
    score: float
    caption: str
    media_url: str
    author_username: str
    tags: List[str]

class SemanticSearchResponse(BaseModel):
    results: List[SearchResultItem]
    total: int
    query: str
    latency_ms: float
