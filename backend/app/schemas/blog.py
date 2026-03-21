import re
from pydantic import BaseModel, Field, field_validator


class BlogPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=220)
    excerpt: str | None = Field(None, max_length=500)
    content: str = Field(..., min_length=1)
    published: bool = True

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        if not re.match(r'^[a-z0-9]+(?:-[a-z0-9]+)*$', v):
            raise ValueError("Slug must be lowercase letters, numbers, and hyphens only")
        return v


class BlogPostUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    slug: str | None = Field(None, min_length=1, max_length=220)
    excerpt: str | None = Field(None, max_length=500)
    content: str | None = Field(None, min_length=1)
    published: bool | None = None

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not re.match(r'^[a-z0-9]+(?:-[a-z0-9]+)*$', v):
            raise ValueError("Slug must be lowercase letters, numbers, and hyphens only")
        return v


class BlogCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    parent_id: int | None = None

    @field_validator("content")
    @classmethod
    def content_not_whitespace_only(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Comment content cannot be empty or whitespace only")
        return v.strip()
