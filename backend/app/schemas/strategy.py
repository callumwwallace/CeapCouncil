from datetime import datetime
from pydantic import BaseModel, Field


class StrategyBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    code: str = Field(..., max_length=50000)
    parameters: dict = Field(default_factory=dict)
    is_public: bool = False


class StrategyCreate(StrategyBase):
    pass


class StrategyUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    code: str | None = None
    parameters: dict | None = None
    is_public: bool | None = None


class StrategyResponse(StrategyBase):
    id: int
    share_token: str
    author_id: int
    vote_count: int
    view_count: int
    fork_count: int
    forked_from_id: int | None
    version: int = 1
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class StrategyWithAuthor(StrategyResponse):
    author_username: str


class StrategyVersionResponse(BaseModel):
    id: int
    strategy_id: int
    version: int
    code: str
    parameters: dict
    commit_message: str | None = None
    created_at: datetime
    
    class Config:
        from_attributes = True
