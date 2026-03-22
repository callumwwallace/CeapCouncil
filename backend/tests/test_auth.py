import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.strategy_group import StrategyGroup


class TestRegister:
    """Tests for user registration endpoint."""
    
    async def test_register_success(self, client: AsyncClient, valid_user_data):
        """Test successful user registration."""
        response = await client.post("/api/v1/auth/register", json=valid_user_data)
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == valid_user_data["username"].lower()
        assert "id" in data
        assert "hashed_password" not in data  # Password should not be exposed
    
    async def test_register_duplicate_email(self, client: AsyncClient, valid_user_data):
        """Test registration fails with duplicate email."""
        # Register first user
        await client.post("/api/v1/auth/register", json=valid_user_data)
        
        # Try to register with same email
        duplicate_data = valid_user_data.copy()
        duplicate_data["username"] = "different_user"
        response = await client.post("/api/v1/auth/register", json=duplicate_data)
        
        assert response.status_code == 400
        assert "email" in response.json()["detail"].lower() or "already" in response.json()["detail"].lower()
    
    async def test_register_duplicate_username(self, client: AsyncClient, valid_user_data):
        """Test registration fails with duplicate username."""
        # Register first user
        await client.post("/api/v1/auth/register", json=valid_user_data)
        
        # Try to register with same username
        duplicate_data = valid_user_data.copy()
        duplicate_data["email"] = "different@example.com"
        response = await client.post("/api/v1/auth/register", json=duplicate_data)
        
        assert response.status_code == 400
        assert "username" in response.json()["detail"].lower() or "already" in response.json()["detail"].lower()
    
    async def test_register_weak_password(self, client: AsyncClient, weak_password_data):
        """Test registration fails with weak password."""
        response = await client.post("/api/v1/auth/register", json=weak_password_data)
        
        assert response.status_code == 422  # Validation error
    
    async def test_register_password_no_uppercase(self, client: AsyncClient, valid_user_data):
        """Test registration fails without uppercase in password."""
        valid_user_data["password"] = "testpass123"  # No uppercase
        response = await client.post("/api/v1/auth/register", json=valid_user_data)
        
        assert response.status_code == 422
    
    async def test_register_password_no_number(self, client: AsyncClient, valid_user_data):
        """Test registration fails without number in password."""
        valid_user_data["password"] = "TestPassword"  # No number
        response = await client.post("/api/v1/auth/register", json=valid_user_data)
        
        assert response.status_code == 422
    
    async def test_register_invalid_username(self, client: AsyncClient, valid_user_data):
        """Test registration fails with invalid username characters."""
        valid_user_data["username"] = "test@user!"  # Invalid characters
        response = await client.post("/api/v1/auth/register", json=valid_user_data)
        
        assert response.status_code == 422

    async def test_register_creates_default_strategy_group(self, client: AsyncClient, valid_user_data, test_engine):
        """Test registration creates a default strategy group for the user."""
        response = await client.post("/api/v1/auth/register", json=valid_user_data)
        assert response.status_code == 201
        user_id = response.json()["id"]

        async_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
        async with async_session() as session:
            result = await session.execute(
                select(StrategyGroup).where(
                    StrategyGroup.user_id == user_id,
                    StrategyGroup.is_default == True,
                )
            )
            groups = result.scalars().all()
        assert len(groups) == 1
        assert groups[0].name == "My Strategies"


class TestLogin:
    """Tests for user login endpoint."""

    async def test_login_success(self, client: AsyncClient, verified_user):
        """Test successful login with verified user."""
        response = await client.post(
            "/api/v1/auth/login",
            data={
                "username": verified_user["email"],
                "password": verified_user["password"],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
    
    async def test_login_wrong_password(self, client: AsyncClient, verified_user):
        """Test login fails with wrong password."""
        
        response = await client.post(
            "/api/v1/auth/login",
            data={
                "username": verified_user["email"],
                "password": "WrongPass123",
            },
        )
        
        assert response.status_code == 401
        assert "Incorrect email or password" in response.json()["detail"]
    
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login fails for non-existent user."""
        response = await client.post(
            "/api/v1/auth/login",
            data={
                "username": "nonexistent@example.com",
                "password": "QuantGuild-Secure99!",
            },
        )
        assert response.status_code == 401

    async def test_login_blocked_when_unverified(self, client: AsyncClient, valid_user_data):
        """Test login fails when user has not verified email."""
        await client.post("/api/v1/auth/register", json=valid_user_data)
        response = await client.post(
            "/api/v1/auth/login",
            data={
                "username": valid_user_data["email"],
                "password": valid_user_data["password"],
            },
        )
        assert response.status_code == 403
        data = response.json()
        detail = data.get("detail", {})
        assert (
            (isinstance(detail, dict) and detail.get("requires_verification"))
            or "verify" in str(detail).lower()
        )
