from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])

class NovakBaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )

class ModerationRequest(NovakBaseModel):
    image_url: str | None = None
    text: str | None = None

class ModerationResult(NovakBaseModel):
    is_flagged: bool = False
    status: Literal["approved", "flagged", "rejected"] = "approved"
    confidence: float = 1.0
    labels: list[str] = Field(default_factory=list)
    scores: dict[str, float] = Field(default_factory=dict)
    reason: str | None = None

class EmbeddingRequest(NovakBaseModel):
    text: str | None = None
    image_url: str | None = None

class EmbeddingResponse(NovakBaseModel):
    embedding: list[float]
    dimension: int
    model: str

class PostAnalyzePayload(NovakBaseModel):
    post_id: str
    author_id: str
    author_username: str | None = "user"
    media_url: str
    caption: str
    timestamp: float

class PostAnalyzeOutput(NovakBaseModel):
    post_id: str
    embedding: list[float]
    tags: list[str]
    moderation: ModerationResult

class SemanticSearchQuery(NovakBaseModel):
    query: str
    limit: int = 20
    offset: int = 0
    filter_tag: str | None = None

class SearchResultItem(NovakBaseModel):
    post_id: str
    score: float
    caption: str
    media_url: str
    author_username: str
    tags: list[str]

class SemanticSearchResponse(NovakBaseModel):
    results: list[SearchResultItem]
    total: int
    query: str
    latency_ms: float
