"""Object store: persistent key-value storage for strategies.

Allows strategies to save and load state between backtests.
Supports serialization of basic Python types, numpy arrays, and DataFrames.

Uses JSON-based storage (no pickle) for security. numpy arrays and DataFrames
are serialized via safe formats (numpy save with allow_pickle=False, DataFrame
to_dict).

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

import base64
import json
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

_NAMESPACE_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _serialize_value(value: Any) -> dict[str, Any]:
    """Serialize a value to a JSON-safe dict. Returns {_t: type, _v: data}."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return {"_t": "json", "_v": value}
    if isinstance(value, (list, dict)):
        return {"_t": "json", "_v": value}
    if isinstance(value, bytes):
        return {"_t": "bytes", "_v": base64.b64encode(value).decode("ascii")}
    try:
        import numpy as np

        if isinstance(value, np.ndarray):
            buf = BytesIO()
            np.save(buf, value, allow_pickle=False)
            return {"_t": "ndarray", "_v": base64.b64encode(buf.getvalue()).decode("ascii")}
    except ImportError:
        pass
    try:
        import pandas as pd

        if isinstance(value, pd.DataFrame):
            return {"_t": "dataframe", "_v": value.to_dict(orient="split")}
    except ImportError:
        pass
    # Fallback: try JSON (e.g. nested dicts with lists)
    try:
        json.dumps(value)
        return {"_t": "json", "_v": value}
    except (TypeError, ValueError):
        raise TypeError(
            f"ObjectStore supports JSON-serializable types, numpy arrays, pandas DataFrames, and bytes. "
            f"Got {type(value).__name__}"
        ) from None


def _deserialize_value(data: dict[str, Any]) -> Any:
    """Deserialize a value from {_t, _v} dict."""
    t = data.get("_t", "json")
    v = data.get("_v")
    if t == "json":
        return v
    if t == "bytes":
        return base64.b64decode(v.encode("ascii"))
    if t == "ndarray":
        import numpy as np

        buf = BytesIO(base64.b64decode(v.encode("ascii")))
        return np.load(buf, allow_pickle=False)
    if t == "dataframe":
        import pandas as pd

        return pd.DataFrame(**v)
    return v


class ObjectStore:
    """In-memory key-value store with optional persistence.

    Storage backends:
    - memory: dict-based, lost when process ends (default for backtesting)
    - file: JSON-based (no pickle), persisted to disk
    - redis: Redis-based (for production)
    """

    def __init__(self, namespace: str = "default", backend: str = "memory", base_path: str | None = None):
        if not _NAMESPACE_RE.match(namespace):
            raise ValueError("Invalid namespace: only alphanumeric, underscore, hyphen allowed")
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
        return [k[len(prefix) :] for k in self._store if k.startswith(prefix)]

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
            encoded = _serialize_value(value)
            return len(json.dumps(encoded))
        except (TypeError, ValueError):
            return 0

    def _save_to_disk(self) -> None:
        if not self._base_path:
            return
        data_path = self._base_path / f"{self._namespace}.json"
        serialized: dict[str, Any] = {
            "store": {k: _serialize_value(v) for k, v in self._store.items()},
            "metadata": self._metadata,
        }
        with open(data_path, "w", encoding="utf-8") as f:
            json.dump(serialized, f, default=str)

    def _load_from_disk(self) -> None:
        if not self._base_path:
            return
        data_path = self._base_path / f"{self._namespace}.json"
        if data_path.exists():
            with open(data_path, encoding="utf-8") as f:
                data = json.load(f)
            store_enc = data.get("store", {})
            self._store = {k: _deserialize_value(v) for k, v in store_enc.items()}
            self._metadata = data.get("metadata", {})
