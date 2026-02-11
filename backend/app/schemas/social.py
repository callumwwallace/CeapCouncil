from datetime import datetime
from pydantic import BaseModel, Field


class VoteCreate(BaseModel):
    strategy_id: int
    value: int = Field(..., ge=-1, le=1)  # -1, 0 (remove), or 1


class VoteResponse(BaseModel):
    id: int
    user_id: int
    strategy_id: int
    value: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class CommentCreate(BaseModel):
    strategy_id: int
    content: str = Field(..., min_length=1, max_length=2000)
    parent_id: int | None = None


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    id: int
    user_id: int
    strategy_id: int
    content: str
    parent_id: int | None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class CommentWithUser(CommentResponse):
    username: str
    avatar_url: str | None
