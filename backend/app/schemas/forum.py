from datetime import datetime
from pydantic import BaseModel, Field


class ForumTopicResponse(BaseModel):
    id: int
    slug: str
    name: str
    description: str | None
    section: str
    sort_order: int
    thread_count: int
    post_count: int
    latest_thread: dict | None

    class Config:
        from_attributes = True


class ForumThreadSummary(BaseModel):
    id: int
    topic_id: int
    author_id: int
    author_username: str
    author_avatar_url: str | None = None
    title: str
    post_count: int
    vote_score: int = 0
    your_vote: int | None = None
    is_pinned: bool = False
    proposal_data: dict | None = None
    created_at: datetime
    updated_at: datetime


class ForumThreadCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)


class ProposalThreadCreate(BaseModel):
    """Create a competition proposal thread. Requires proposal fields."""
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)
    symbol: str | None = Field(None, min_length=1, max_length=20)  # Legacy; use symbols
    symbols: list[str] | None = Field(None, max_length=5)  # Multi-asset support
    backtest_start: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    backtest_end: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    initial_capital: float = Field(10000, ge=1000)
    ranking_metric: str = Field("sharpe_ratio")
    ranking_metrics: list[str] | None = None  # Multi-metric support


class ForumThreadDetail(BaseModel):
    id: int
    topic_id: int
    author_id: int
    author_username: str
    author_avatar_url: str | None = None
    title: str
    post_count: int
    vote_score: int = 0
    your_vote: int | None = None
    is_pinned: bool = False
    proposal_data: dict | None = None
    created_at: datetime
    updated_at: datetime
    posts: list["ForumPostResponse"]


class ThreadVoteCreate(BaseModel):
    value: int = Field(..., ge=-1, le=1)  # 1 for upvote, -1 for downvote, 0 to remove


class ForumPostResponse(BaseModel):
    id: int
    thread_id: int
    author_id: int
    author_username: str
    author_avatar_url: str | None = None
    content: str
    vote_score: int = 0
    your_vote: int | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PostVoteCreate(BaseModel):
    value: int = Field(..., ge=-1, le=1)


class ForumPostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class ForumPostUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


ForumThreadDetail.model_rebuild()


class ForumSearchResult(BaseModel):
    """Thread match from search with topic slug for linking."""
    id: int
    topic_id: int
    topic_slug: str
    topic_name: str
    section: str
    author_id: int
    author_username: str
    title: str
    post_count: int
    created_at: datetime
    updated_at: datetime
