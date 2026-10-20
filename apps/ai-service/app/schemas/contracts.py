from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Mirrors packages/contracts (Zod). camelCase on the wire, snake_case in Python.


def to_camel(string: str) -> str:
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


class NovakBaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class TextModerationRequest(NovakBaseModel):
    text: str = ""


class TextModerationResult(NovakBaseModel):
    status: Literal["approved", "flagged"]
    method: Literal["keyword_rules"] = "keyword_rules"
    labels: list[str] = Field(default_factory=list)
    matched_terms: list[str] = Field(default_factory=list)
    reason: str | None = None


class PostAnalyzePayload(NovakBaseModel):
    post_id: str
    author_id: str
    author_username: str | None = "user"
    media_url: str
    caption: str
    tags: list[str] = Field(default_factory=list)
    timestamp: float


class PostAnalyzeOutput(NovakBaseModel):
    post_id: str
    tags: list[str]
    indexed: bool
    moderation: TextModerationResult


class SemanticSearchQuery(NovakBaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=20, ge=1, le=50)
    filter_tag: str | None = None


class SearchResultItem(NovakBaseModel):
    post_id: str
    score: float


class SemanticSearchResponse(NovakBaseModel):
    results: list[SearchResultItem]
    total: int
    query: str
    min_score: float
    latency_ms: float
