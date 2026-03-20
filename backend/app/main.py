from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import engine, Base
from app.core.limiter import limiter
from app.api.v1.router import api_router
from app.websocket.notifications import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url=f"{settings.API_V1_PREFIX}/docs",
    redoc_url=f"{settings.API_V1_PREFIX}/redoc",
    lifespan=lifespan,
)

# Rate limiter state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PATHS = {
    f"{settings.API_V1_PREFIX}/auth/login",
    f"{settings.API_V1_PREFIX}/auth/register",
}


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    """Double-submit cookie CSRF protection for state-changing requests."""
    if (
        request.method not in _CSRF_SAFE_METHODS
        and request.url.path not in _CSRF_EXEMPT_PATHS
        and request.cookies.get("csrf_token")  # only enforce when cookie-auth is active
    ):
        cookie_csrf = request.cookies.get("csrf_token", "")
        header_csrf = request.headers.get("x-csrf-token", "")
        if not cookie_csrf or cookie_csrf != header_csrf:
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token missing or invalid"},
            )
    return await call_next(request)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    # Don't overwrite CSP if the endpoint already set one (e.g. tearsheet with nonce)
    if "Content-Security-Policy" not in response.headers:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' https: data:; connect-src 'self' wss: ws:; "
            "frame-ancestors 'none'"
        )
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Include API router
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# WebSocket for real time notifications (no /api/v1 prefix)
app.include_router(ws_router)


@app.get("/health")
async def health_check():
    payload = {"status": "healthy", "app": settings.APP_NAME}
    if not settings.HIDE_VERSION_IN_HEALTH:
        payload["version"] = settings.APP_VERSION
    return payload
