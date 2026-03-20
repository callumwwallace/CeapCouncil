import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core import limiter as limiter_module

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def test_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def test_session(test_engine):
    """Create a test database session."""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session() as session:
        yield session


@pytest.fixture
async def client(test_engine):
    """Create a test HTTP client with overridden database."""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async def override_get_db():
        async with async_session() as session:
            yield session
    
    app.dependency_overrides[get_db] = override_get_db
    
    # Disable rate limiting for tests
    limiter_module.limiter.enabled = False

    # Use fakeredis for auth flows (email verify, pwd reset, 2FA, blocklist)
    try:
        from fakeredis import FakeAsyncRedis
        redis_fake = FakeAsyncRedis()
        patches = [
            patch("app.core.redis.redis_client", redis_fake),
            patch("app.api.v1.endpoints.auth.redis_client", redis_fake),
            patch("app.core.security.redis_client", redis_fake),
        ]
        for p in patches:
            p.start()
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac
        finally:
            for p in patches:
                p.stop()
        await redis_fake.flushall()
    except ImportError:
        # In-memory dict to simulate Redis for tests
        _redis_store: dict[str, tuple[str, float]] = {}

        async def mock_get(key: str):
            if key in _redis_store:
                val, _ = _redis_store[key]
                return val
            return None

        async def mock_setex(key: str, ttl: int, value: str):
            import time
            _redis_store[key] = (value, time.time() + ttl)

        async def mock_delete(key: str):
            _redis_store.pop(key, None)

        async def mock_keys(pattern: str):
            prefix = pattern.replace("*", "")
            return [k for k in _redis_store if k.startswith(prefix)]

        mock_redis = AsyncMock()
        mock_redis.get = mock_get
        mock_redis.setex = mock_setex
        mock_redis.delete = mock_delete
        mock_redis.keys = mock_keys
        patches = [
            patch("app.core.redis.redis_client", mock_redis),
            patch("app.api.v1.endpoints.auth.redis_client", mock_redis),
            patch("app.core.security.redis_client", mock_redis),
        ]
        for p in patches:
            p.start()
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                yield ac
        finally:
            for p in patches:
                p.stop()
    
    app.dependency_overrides.clear()


# Test user data (zxcvbn score >= 3 required)
@pytest.fixture
def valid_user_data():
    """Valid user registration data with strong password."""
    return {
        "email": "test@example.com",
        "username": "testuser",
        "password": "QuantGuild-Secure99!",
        "full_name": "Test User"
    }


@pytest.fixture
def weak_password_data():
    """User data with weak password (zxcvbn score < 3)."""
    return {
        "email": "test@example.com",
        "username": "testuser",
        "password": "password",
    }


@pytest.fixture
async def verified_user(client, test_engine, valid_user_data):
    """Create a verified user directly in DB for login tests."""
    from app.models.user import User
    from app.core.security import get_password_hash

    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with async_session() as session:
        user = User(
            email=valid_user_data["email"],
            username=valid_user_data["username"],
            hashed_password=get_password_hash(valid_user_data["password"]),
            full_name=valid_user_data.get("full_name"),
            is_verified=True,
        )
        session.add(user)
        await session.commit()
    return valid_user_data
