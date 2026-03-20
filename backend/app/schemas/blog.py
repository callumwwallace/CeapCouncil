from pydantic import BaseModel, Field, field_validator


class BlogCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    parent_id: int | None = None

    @field_validator("content")
    @classmethod
    def content_not_whitespace_only(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Comment content cannot be empty or whitespace only")
        return v.strip()
