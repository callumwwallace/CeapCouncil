"""Tests for strategy groups and default group behavior."""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.user import User
from app.models.strategy_group import StrategyGroup
from app.models.strategy import Strategy
from app.core.security import get_password_hash


@pytest.fixture
async def auth_headers(client: AsyncClient, test_engine):
    """Create a verified user and return auth headers."""
    async_session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        user = User(
            email="strategyuser@example.com",
            username="strategyuser",
            hashed_password=get_password_hash("QuantGuild-Secure99!"),
            full_name="Strategy User",
            is_verified=True,
        )
        session.add(user)
        await session.flush()
        user_id = user.id
        # Create default group (as registration would)
        default_group = StrategyGroup(
            name="My Strategies", user_id=user_id, is_default=True
        )
        session.add(default_group)
        await session.commit()

    login_resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "strategyuser@example.com", "password": "QuantGuild-Secure99!"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def user_and_default_group(test_engine, auth_headers):
    """Get user id and default group id for the authenticated user."""
    async_session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.email == "strategyuser@example.com")
        )
        user = result.scalar_one_or_none()
        assert user
        result = await session.execute(
            select(StrategyGroup).where(
                StrategyGroup.user_id == user.id, StrategyGroup.is_default == True
            )
        )
        default_group = result.scalar_one_or_none()
        assert default_group
        return user.id, default_group.id


class TestDefaultGroup:
    """Tests for default strategy group behavior."""

    async def test_create_strategy_without_group_id_uses_default(
        self, client: AsyncClient, auth_headers, user_and_default_group
    ):
        """Create strategy with group_id null should use default group."""
        user_id, default_group_id = user_and_default_group
        response = await client.post(
            "/api/v1/strategies",
            headers=auth_headers,
            json={
                "title": "Test Strategy",
                "code": "class MyStrategy(bt.Strategy): pass",
                "parameters": {},
                "is_public": False,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["group_id"] == default_group_id

    async def test_delete_default_group_forbidden(
        self, client: AsyncClient, auth_headers, user_and_default_group
    ):
        """Cannot delete the default strategy group."""
        _, default_group_id = user_and_default_group
        response = await client.delete(
            f"/api/v1/strategy-groups/{default_group_id}",
            headers=auth_headers,
        )
        assert response.status_code == 403
        assert "default" in response.json()["detail"].lower()
