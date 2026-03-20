"""Rate limit WebSocket connections per client IP using atomic Lua script."""

WS_CONN_PREFIX = "ws_conn:"
WS_LIMIT = 10
WS_WINDOW_SEC = 60

# Atomic increment-and-expire: avoids TOCTOU race between INCR and EXPIRE.
_RATE_LIMIT_LUA = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


async def check_ws_connection_limit(client_host: str) -> bool:
    """Return True if connection allowed, False if rate limited."""
    from app.core.redis import redis_client

    key = f"{WS_CONN_PREFIX}{client_host}"
    try:
        count = await redis_client.eval(_RATE_LIMIT_LUA, 1, key, WS_WINDOW_SEC)
        return int(count) <= WS_LIMIT
    except Exception:
        return True  # Fail open on Redis errors
