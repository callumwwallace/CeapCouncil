import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.redis import redis_client

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_DUMMY_HASH = pwd_context.hash("__dummy_timing__")

_TOKEN_BLOCKLIST_PREFIX = "token:blocked:"
_TOKEN_BLOCKLIST_TTL = timedelta(days=8)


def create_access_token(subject: str | Any, expires_delta: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    jti = secrets.token_urlsafe(16)
    to_encode = {"exp": expire, "iat": int(now.timestamp()), "sub": str(subject), "type": "access", "jti": jti}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str | Any) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = secrets.token_urlsafe(16)
    to_encode = {"exp": expire, "iat": int(now.timestamp()), "sub": str(subject), "type": "refresh", "jti": jti}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def blocklist_token(token: str) -> None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        jti = payload.get("jti")
        if jti:
            await redis_client.setex(
                f"{_TOKEN_BLOCKLIST_PREFIX}{jti}",
                int(_TOKEN_BLOCKLIST_TTL.total_seconds()),
                "1",
            )
    except Exception:
        pass


async def is_token_blocked(payload: dict) -> bool:
    jti = payload.get("jti")
    if not jti:
        return False
    result = await redis_client.get(f"{_TOKEN_BLOCKLIST_PREFIX}{jti}")
    return result is not None


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def verify_password_constant_time(plain_password: str, hashed_password: str | None) -> bool:
    target = hashed_password if hashed_password else _DUMMY_HASH
    return pwd_context.verify(plain_password, target)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
