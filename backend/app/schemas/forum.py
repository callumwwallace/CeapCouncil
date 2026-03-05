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
    title: str
    post_count: int
    created_at: datetime
    updated_at: datetime


class ForumThreadCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=10000)


class ForumThreadDetail(BaseModel):
    id: int
    topic_id: int
    author_id: int
    author_username: str
    title: str
    post_count: int
    created_at: datetime
    updated_at: datetime
    posts: list["ForumPostResponse"]


class ForumPostResponse(BaseModel):
    id: int
    thread_id: int
    author_id: int
    author_username: str
    content: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


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
