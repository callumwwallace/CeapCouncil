"""Integration tests for auth features: email verification, forgot/reset password."""

import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def mock_send_email():
    """Mock email sending so no SMTP is required."""
    with patch("app.core.email.send_email", new_callable=AsyncMock) as m:
        yield m


class TestVerifyEmail:
    """Tests for email verification flow."""

    async def test_verify_email_success(self, client: AsyncClient, valid_user_data, test_engine):
        """Test successful email verification."""
        from app.core.redis import redis_client
        from app.models.user import User
        from app.core.security import get_password_hash

        # Create unverified user directly
        from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
        async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
        async with async_session() as session:
            user = User(
                email=valid_user_data["email"],
                username=valid_user_data["username"],
                hashed_password=get_password_hash(valid_user_data["password"]),
                full_name=valid_user_data.get("full_name"),
                is_verified=False,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            user_id = user.id

        # Seed Redis with token (use same redis as app - works with FakeRedis)
        token = "test-verify-token-12345"
        await redis_client.setex(f"email_verify:{token}", 86400, str(user_id))

        response = await client.post("/api/v1/auth/verify-email", json={"token": token})
        assert response.status_code == 200
        assert "verified" in response.json().get("message", "").lower()

    async def test_verify_email_invalid_token(self, client: AsyncClient):
        """Test verify-email with invalid token."""
        response = await client.post("/api/v1/auth/verify-email", json={"token": "invalid-token"})
        assert response.status_code == 400


class TestForgotPassword:
    """Tests for forgot password flow."""

    async def test_forgot_password_always_200(self, client: AsyncClient):
        """Test forgot-password returns 200 for both existing and non-existing email."""
        r1 = await client.post("/api/v1/auth/forgot-password", json={"email": "nonexistent@example.com"})
        assert r1.status_code == 200

        r2 = await client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "test@example.com"},
        )
        assert r2.status_code == 200


class TestResetPassword:
    """Tests for reset password flow."""

    async def test_reset_password_invalid_token(self, client: AsyncClient, valid_user_data):
        """Test reset-password with invalid token."""
        response = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": "invalid-token", "new_password": valid_user_data["password"]},
        )
        assert response.status_code == 400
