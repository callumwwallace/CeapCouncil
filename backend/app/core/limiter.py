import re

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# rate limits go in redis db 3, rest is 0=app cache 1=celery broker 2=celery results
# falls back to memory when redis isnt around (local dev / tests)
_redis_url = re.sub(r"/\d+$", "/3", settings.REDIS_URL)
if not re.search(r"/\d+$", settings.REDIS_URL):
    _redis_url = settings.REDIS_URL.rstrip("/") + "/3"

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_redis_url,
    in_memory_fallback_enabled=True,
)
