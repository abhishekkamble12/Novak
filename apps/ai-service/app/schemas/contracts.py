from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field, ConfigDict

def to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])

class LumenBaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )

class ModerationRequest(LumenBaseModel):
    image_url: Optional[str] = None
    text: Optional[str] = None

class ModerationResult(LumenBaseModel):
    is_flagged: bool = False
    status: Literal["approved", "flagged", "rejected"] = "approved"
    confidence: float = 1.0
    labels: List[str] = Field(default_factory=list)
    scores: Dict[str, float] = Field(default_factory=dict)
    reason: Optional[str] = None

class EmbeddingRequest(LumenBaseModel):
    text: Optional[str] = None
    image_url: Optional[str] = None

class EmbeddingResponse(LumenBaseModel):
    embedding: List[float]
    dimension: int
    model: str

class PostAnalyzePayload(LumenBaseModel):
    post_id: str
    author_id: str
    author_username: Optional[str] = "user"
    media_url: str
    caption: str
    timestamp: float

class PostAnalyzeOutput(LumenBaseModel):
    post_id: str
    embedding: List[float]
    tags: List[str]
    moderation: ModerationResult

class SemanticSearchQuery(LumenBaseModel):
    query: str
    limit: int = 20
    offset: int = 0
    filter_tag: Optional[str] = None

class SearchResultItem(LumenBaseModel):
    post_id: str
    score: float
    caption: str
    media_url: str
    author_username: str
    tags: List[str]

class SemanticSearchResponse(LumenBaseModel):
    results: List[SearchResultItem]
    total: int
    query: str
    latency_ms: float
