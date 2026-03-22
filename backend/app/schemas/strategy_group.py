from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.strategy import StrategyResponse


class StrategyGroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)


class StrategyGroupCreate(StrategyGroupBase):
    pass


class StrategyGroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    is_shareable: bool | None = None


class StrategyGroupResponse(StrategyGroupBase):
    id: int
    user_id: int
    is_default: bool
    share_token: str
    is_shareable: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StrategySummaryForEmbed(BaseModel):
    """Minimal strategy info for group embed."""
    id: int
    title: str
    share_token: str
    is_public: bool


class GroupEmbedResponse(BaseModel):
    """Public group embed response for forum cards."""
    id: int
    name: str
    share_token: str
    author_username: str
    strategy_count: int
    strategies: list[StrategySummaryForEmbed]


class ForkGroupResponse(BaseModel):
    """Response after forking a group."""
    group: StrategyGroupResponse
    strategies: list[StrategyResponse]
    forked_count: int
