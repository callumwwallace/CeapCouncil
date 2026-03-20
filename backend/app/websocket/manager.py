"""WebSocket connection manager for real-time notifications."""

import json
from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    """Maps user_id -> set of active WebSocket connections."""

    def __init__(self) -> None:
        self._connections: Dict[int, Set[WebSocket]] = {}

    def connect(self, websocket: WebSocket, user_id: int) -> None:
        """Register a websocket for the user. Caller must accept() before connecting."""
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int) -> None:
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_personal(self, user_id: int, payload: dict) -> None:
        """Send payload to all connections for the given user."""
        if user_id not in self._connections:
            return
        dead = set()
        msg = json.dumps(payload)
        for ws in self._connections[user_id]:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[user_id].discard(ws)


# Singleton - used by WebSocket endpoint and notification creation
manager = ConnectionManager()
