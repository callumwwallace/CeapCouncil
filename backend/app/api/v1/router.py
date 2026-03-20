from fastapi import APIRouter

from app.api.v1.endpoints import auth, users, strategies, backtests, social, market_data, competitions, blog, forum, notifications, follows

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(forum.router, prefix="/forum", tags=["forum"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(follows.router, prefix="/users", tags=["follows"])
api_router.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
api_router.include_router(backtests.router, prefix="/backtests", tags=["backtests"])
api_router.include_router(social.router, prefix="/social", tags=["social"])
api_router.include_router(market_data.router, prefix="/market-data", tags=["market-data"])
api_router.include_router(competitions.router, prefix="/competitions", tags=["competitions"])
api_router.include_router(blog.router, prefix="/blog", tags=["blog"])
