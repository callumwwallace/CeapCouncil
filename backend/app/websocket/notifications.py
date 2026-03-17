from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.core.config import settings
from app.core.security import is_token_blocked
from app.websocket.manager import manager

router = APIRouter()


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
    await websocket.accept()

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

    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket, user_id)
