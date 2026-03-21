import secrets

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Ceap Council"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql+asyncpg://quantguild:quantguild@localhost:5432/quantguild"

    REDIS_URL: str = "redis://localhost:6379/0"

    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    S3_ENDPOINT: str = "localhost:9000"
    S3_ACCESS_KEY: str = "minioadmin"
    S3_SECRET_KEY: str = "minioadmin"
    S3_BUCKET_NAME: str = "quantguild"
    S3_USE_SSL: bool = False

    ENGINE_VERSION: str = "engine"

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Email (SMTP) — set SMTP_HOST to enable sending
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@quantguild.local"
    SMTP_TLS: bool = True
    FRONTEND_URL: str = "http://localhost:3000"

    # TOTP 2FA
    TOTP_ENCRYPTION_KEY: str = ""  # 32-byte base64 Fernet key; derive from SECRET_KEY if empty
    TOTP_ISSUER_NAME: str = "QuantGuild"

    MEDIA_BASE_URL: str = "http://localhost:9000/ceapcouncil"

    BACKTEST_TIMEOUT_SECONDS: int = 300
    COMPILE_TIMEOUT_SECONDS: int = 30  # Strategy compilation timeout (SIGALRM)
    BACKTEST_MAX_MEMORY_MB: int = 1024

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Ignore extra env vars (POSTGRES_*, REDIS_PASSWORD, etc.)


_INSECURE_DEFAULTS = {"", "your-secret-key-change-in-production", "changeme"}


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    if s.SECRET_KEY in _INSECURE_DEFAULTS:
        if s.DEBUG:
            s.SECRET_KEY = secrets.token_urlsafe(64)
        else:
            raise RuntimeError(
                "SECRET_KEY must be set via environment variable. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
    return s


settings = get_settings()
