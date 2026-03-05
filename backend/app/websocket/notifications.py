"""WebSocket endpoint for real-time notifications."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt

from app.core.config import settings
from app.websocket.manager import manager

router = APIRouter()


def _get_user_id_from_token(token: str) -> int | None:
    """Verify JWT and return user id. Returns None if invalid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except (JWTError, ValueError, KeyError):
        return None


@router.websocket("/ws/notifications")
async def notifications_websocket(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    """Connect for real-time notification push. Pass token as query param: ?token=xxx"""
    user_id = _get_user_id_from_token(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection alive; client can send ping, we just wait
            data = await websocket.receive_text()
            # Optional: handle ping/pong for keepalive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id)
