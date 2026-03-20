from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.core.config import settings
from app.core.security import is_token_blocked
from app.websocket.manager import manager
from app.websocket.rate_limit import check_ws_connection_limit

router = APIRouter()


def _get_client_host(websocket: WebSocket) -> str:
    """Get client IP from WebSocket scope (handles proxies)."""
    client = websocket.scope.get("client")
    if client:
        return str(client[0])
    forwarded = websocket.scope.get("headers") or []
    for k, v in forwarded:
        if k == b"x-forwarded-for" or k == b"X-Forwarded-For":
            return v.decode().split(",")[0].strip()
    return "unknown"


def _get_user_id_from_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        return None


@router.websocket("/ws/notifications")
async def notifications_websocket(websocket: WebSocket):
    client_host = _get_client_host(websocket)
    if not await check_ws_connection_limit(client_host):
        await websocket.close(code=4429, reason="Too many connections")
        return

    await websocket.accept()

    # Try cookie-based auth first (HTTP-only cookie sent during handshake)
    token = websocket.cookies.get("access_token")

    if not token:
        # Fall back to Bearer token message for backward compatibility
        try:
            auth_msg = await websocket.receive_text()
        except WebSocketDisconnect:
            return

        if not auth_msg.startswith("Bearer "):
            await websocket.close(code=4001)
            return
        token = auth_msg[7:]

    user_id = _get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if await is_token_blocked(payload):
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    manager.connect(websocket, user_id)
    try:
        ping_count = 0
        import time
        ping_window_start = time.monotonic()
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                now = time.monotonic()
                if now - ping_window_start > 10:
                    ping_count = 0
                    ping_window_start = now
                ping_count += 1
                if ping_count > 20:
                    await websocket.close(code=4429, reason="Ping rate exceeded")
                    break
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id)
