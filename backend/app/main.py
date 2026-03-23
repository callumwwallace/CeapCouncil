import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import engine, Base
from app.core.limiter import limiter
from app.core.logging import setup_logging, get_logger
from app.api.v1.router import api_router
from app.websocket.notifications import router as ws_router

setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # prod uses alembic upgrade head, only create tables in debug
    if settings.DEBUG:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json" if settings.DEBUG else None,
    docs_url=f"{settings.API_V1_PREFIX}/docs" if settings.DEBUG else None,
    redoc_url=f"{settings.API_V1_PREFIX}/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
    redirect_slashes=False,
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
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def access_log_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    request_id = getattr(request.state, "request_id", "-")
    logger.info(
        "access",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration_ms, 2),
        request_id=request_id,
    )
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    # dont overwrite CSP if endpoint set its own (e.g tearsheet w nonce)
    if "Content-Security-Policy" not in response.headers:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' https: data:; connect-src 'self' wss: ws:; "
            "frame-ancestors 'none'"
        )
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.include_router(api_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}
