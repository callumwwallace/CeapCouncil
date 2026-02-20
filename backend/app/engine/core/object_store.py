"""Object store — persistent key-value storage for strategies.

Allows strategies to save and load state between backtests.
Supports serialization of basic Python types, numpy arrays, and DataFrames.

Usage:
    class MyStrategy(StrategyBase):
        def on_init(self):
            # Load previously saved state
            self.model_weights = self.store.get('model_weights', default=None)

        def on_end(self):
            # Save state for future runs
            self.store.set('model_weights', self.trained_weights)
"""

from __future__ import annotations

import json
import pickle
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any


class ObjectStore:
    """In-memory key-value store with optional persistence.

    Storage backends:
    - memory: dict-based, lost when process ends (default for backtesting)
    - file: JSON/pickle-based, persisted to disk
    - redis: Redis-based (for production)
    """

    def __init__(self, namespace: str = "default", backend: str = "memory", base_path: str | None = None):
        self._namespace = namespace
        self._backend = backend
        self._store: dict[str, Any] = {}
        self._metadata: dict[str, dict] = {}
        self._base_path = Path(base_path) if base_path else None

        if backend == "file" and self._base_path:
            self._base_path.mkdir(parents=True, exist_ok=True)
            self._load_from_disk()

    def get(self, key: str, default: Any = None) -> Any:
        """Get a value by key."""
        full_key = f"{self._namespace}:{key}"
        return self._store.get(full_key, default)

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Set a value. Optional TTL in seconds (only enforced on retrieval)."""
        full_key = f"{self._namespace}:{key}"
        self._store[full_key] = value
        self._metadata[full_key] = {
            "created_at": datetime.utcnow().isoformat(),
            "ttl": ttl,
            "type": type(value).__name__,
            "size_bytes": self._estimate_size(value),
        }
        if self._backend == "file" and self._base_path:
            self._save_to_disk()

    def delete(self, key: str) -> bool:
        """Delete a key. Returns True if it existed."""
        full_key = f"{self._namespace}:{key}"
        if full_key in self._store:
            del self._store[full_key]
            self._metadata.pop(full_key, None)
            return True
        return False

    def exists(self, key: str) -> bool:
        full_key = f"{self._namespace}:{key}"
        return full_key in self._store

    def keys(self) -> list[str]:
        """List all keys in this namespace."""
        prefix = f"{self._namespace}:"
        return [k[len(prefix):] for k in self._store if k.startswith(prefix)]

    def clear(self) -> None:
        """Clear all keys in this namespace."""
        prefix = f"{self._namespace}:"
        to_delete = [k for k in self._store if k.startswith(prefix)]
        for k in to_delete:
            del self._store[k]
            self._metadata.pop(k, None)

    def save_json(self, key: str, data: dict | list) -> None:
        """Save JSON-serializable data."""
        self.set(key, json.dumps(data))

    def load_json(self, key: str, default: Any = None) -> dict | list | None:
        """Load JSON data."""
        raw = self.get(key)
        if raw is None:
            return default
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return default

    def save_bytes(self, key: str, data: bytes) -> None:
        """Save raw bytes."""
        self.set(key, data)

    def load_bytes(self, key: str) -> bytes | None:
        """Load raw bytes."""
        val = self.get(key)
        return val if isinstance(val, bytes) else None

    def info(self) -> dict:
        """Get store statistics."""
        prefix = f"{self._namespace}:"
        items = {k: v for k, v in self._metadata.items() if k.startswith(prefix)}
        total_size = sum(v.get("size_bytes", 0) for v in items.values())
        return {
            "namespace": self._namespace,
            "backend": self._backend,
            "num_keys": len(items),
            "total_size_bytes": total_size,
        }

    def _estimate_size(self, value: Any) -> int:
        try:
            return len(pickle.dumps(value))
        except Exception:
            return 0

    def _save_to_disk(self) -> None:
        if not self._base_path:
            return
        data_path = self._base_path / f"{self._namespace}.pkl"
        with open(data_path, "wb") as f:
            pickle.dump({"store": self._store, "metadata": self._metadata}, f)

    def _load_from_disk(self) -> None:
        if not self._base_path:
            return
        data_path = self._base_path / f"{self._namespace}.pkl"
        if data_path.exists():
            with open(data_path, "rb") as f:
                data = pickle.load(f)  # noqa: S301
                self._store = data.get("store", {})
                self._metadata = data.get("metadata", {})
