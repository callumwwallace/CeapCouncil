"""Tests for the notification system: API, service, and categories."""

import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.core import limiter as limiter_module
from app.models.user import User
from app.models.notification import Notification
from app.core.security import get_password_hash

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
async def seeded_db(test_engine):
    """Create users and notifications for testing."""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with async_session() as session:
        # Create two users
        u1 = User(
            email="user1@example.com",
            username="user1",
            hashed_password=get_password_hash("TestPass123"),
            is_active=True,
            is_verified=True,
        )
        u2 = User(
            email="user2@example.com",
            username="user2",
            hashed_password=get_password_hash("TestPass123"),
            is_active=True,
            is_verified=True,
        )
        session.add_all([u1, u2])
        await session.flush()

        # Create notifications for user1
        n1 = Notification(
            user_id=u1.id,
            actor_id=u2.id,
            category="forum",
            type="mention",
            message="user2 mentioned you",
            link="/community/general/1",
        )
        n2 = Notification(
            user_id=u1.id,
            actor_id=u2.id,
            category="system",
            type="follow",
            message="user2 started following you",
            link="/profile/user2",
        )
        n3 = Notification(
            user_id=u1.id,
            actor_id=None,
            category="competition",
            type="competition_rank",
            message="Competition ended. You placed 1st!",
            link="/competitions/1",
            extra_data={"rank": 1, "competition_id": 1},
        )
        session.add_all([n1, n2, n3])
        await session.commit()
        return {"user1": u1, "user2": u2, "notifications": [n1, n2, n3]}


@pytest.fixture
async def auth_headers(client: AsyncClient, seeded_db):
    """Register user1, login, and return auth headers."""
    # Login as user1 (already in DB from seeded_db)
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "user1@example.com", "password": "TestPass123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def client(test_engine, seeded_db):
    """Create test client with seeded database."""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db():
        async with async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    limiter_module.limiter.enabled = False

    # Mock Redis token blocklist check to avoid Redis in tests
    with patch("app.api.deps.is_token_blocked", new_callable=AsyncMock, return_value=False):
        from httpx import ASGITransport

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()


class TestListNotifications:
    """Tests for GET /notifications."""

    async def test_list_notifications_requires_auth(self, client: AsyncClient):
        """Unauthenticated requests should fail."""
        response = await client.get("/api/v1/notifications")
        assert response.status_code == 401

    async def test_list_notifications_flat(self, client: AsyncClient, auth_headers):
        """List returns flat array when group_by is not set."""
        response = await client.get("/api/v1/notifications", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3
        for n in data:
            assert "id" in n
            assert "type" in n
            assert "category" in n
            assert "message" in n
            assert "link" in n
            assert "actor_username" in n
            assert "read_at" in n
            assert "created_at" in n

    async def test_list_notifications_grouped(self, client: AsyncClient, auth_headers):
        """List returns grouped dict when group_by=category."""
        response = await client.get(
            "/api/v1/notifications",
            params={"group_by": "category"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "competition" in data
        assert "forum" in data
        assert "strategy" in data
        assert "system" in data
        assert all(isinstance(v, list) for v in data.values())
        total = sum(len(v) for v in data.values())
        assert total >= 3

    async def test_list_notifications_filter_by_category(
        self, client: AsyncClient, auth_headers
    ):
        """Filter by category returns only that category."""
        response = await client.get(
            "/api/v1/notifications",
            params={"category": "forum"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for n in data:
            assert n["category"] == "forum"

    async def test_list_notifications_unread_only(
        self, client: AsyncClient, auth_headers
    ):
        """unread_only filter works."""
        response = await client.get(
            "/api/v1/notifications",
            params={"unread_only": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        for n in data:
            assert n["read_at"] is None


class TestUnreadCount:
    """Tests for GET /notifications/unread-count."""

    async def test_unread_count(self, client: AsyncClient, auth_headers):
        """Unread count returns correct number."""
        response = await client.get(
            "/api/v1/notifications/unread-count",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert isinstance(data["count"], int)
        assert data["count"] >= 3


class TestMarkRead:
    """Tests for POST /notifications/{id}/read."""

    async def test_mark_read(self, client: AsyncClient, auth_headers):
        """Mark single notification as read."""
        list_resp = await client.get("/api/v1/notifications", headers=auth_headers)
        assert list_resp.status_code == 200
        notifications = list_resp.json()
        assert len(notifications) > 0
        first_id = notifications[0]["id"]

        response = await client.post(
            f"/api/v1/notifications/{first_id}/read",
            headers=auth_headers,
        )
        assert response.status_code == 204

        # Verify it's marked read
        list_resp2 = await client.get("/api/v1/notifications", headers=auth_headers)
        read_one = next(n for n in list_resp2.json() if n["id"] == first_id)
        assert read_one["read_at"] is not None

    async def test_mark_read_404_for_other_user(
        self, client: AsyncClient, auth_headers, seeded_db
    ):
        """Cannot mark another user's notification as read."""
        # Get user2's token
        login = await client.post(
            "/api/v1/auth/login",
            data={"username": "user2@example.com", "password": "TestPass123"},
        )
        assert login.status_code == 200
        user2_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        # Get user1's notification id
        list_resp = await client.get("/api/v1/notifications", headers=auth_headers)
        first_id = list_resp.json()[0]["id"]

        # User2 tries to mark user1's notification - should 404
        response = await client.post(
            f"/api/v1/notifications/{first_id}/read",
            headers=user2_headers,
        )
        assert response.status_code == 404


class TestMarkAllRead:
    """Tests for POST /notifications/read-all."""

    async def test_mark_all_read(self, client: AsyncClient, auth_headers):
        """Mark all notifications as read."""
        response = await client.post(
            "/api/v1/notifications/read-all",
            headers=auth_headers,
        )
        assert response.status_code == 204

        count_resp = await client.get(
            "/api/v1/notifications/unread-count",
            headers=auth_headers,
        )
        assert count_resp.json()["count"] == 0


class TestClearAll:
    """Tests for DELETE /notifications/clear."""

    async def test_clear_all(self, client: AsyncClient, auth_headers):
        """Clear all notifications."""
        response = await client.delete(
            "/api/v1/notifications/clear",
            headers=auth_headers,
        )
        assert response.status_code == 204

        list_resp = await client.get("/api/v1/notifications", headers=auth_headers)
        assert list_resp.json() == []

        count_resp = await client.get(
            "/api/v1/notifications/unread-count",
            headers=auth_headers,
        )
        assert count_resp.json()["count"] == 0


class TestNotificationService:
    """Unit tests for create_notification service."""

    @pytest.fixture
    async def db_session(self, test_engine):
        """Create a session for service tests."""
        async_session = async_sessionmaker(
            test_engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        async with async_session() as session:
            # Add a user
            u = User(
                email="svc@example.com",
                username="svcuser",
                hashed_password=get_password_hash("TestPass123"),
                is_active=True,
            )
            session.add(u)
            await session.flush()
            yield session

    async def test_create_notification_resolves_category(
        self, db_session: AsyncSession, test_engine
    ):
        """Service resolves category from type when not provided."""
        from app.services.notifications import create_notification

        user = (await db_session.execute(select(User).where(User.username == "svcuser"))).scalar_one_or_none()
        assert user is not None

        n = await create_notification(
            db_session,
            user.id,
            "mention",
            "Someone mentioned you",
            "/link",
            actor_id=user.id,
        )
        assert n is not None
        assert n.category == "forum"
        assert n.type == "mention"

    async def test_create_notification_system_announcement_no_actor(
        self, db_session: AsyncSession
    ):
        """System announcements can have actor_id=None."""
        from app.services.notifications import create_notification

        user = (await db_session.execute(select(User).where(User.username == "svcuser"))).scalar_one_or_none()
        assert user is not None

        n = await create_notification(
            db_session,
            user.id,
            "system_announcement",
            "System maintenance tonight",
            "/announcements",
            category="system",
            actor_id=None,
        )
        assert n is not None
        assert n.actor_id is None
        assert n.category == "system"
