"""Deterministic backtesting — seeded randomness, dataset/strategy hashing, reproducible IDs."""

from __future__ import annotations

import hashlib
import json
import random
from datetime import datetime
from typing import Any

import numpy as np


class DeterministicContext:
    """Manages seeded randomness and version hashing for reproducibility."""

    def __init__(self, seed: int | None = None):
        self._seed = seed or 42
        self._rng = np.random.RandomState(self._seed)
        self._python_rng = random.Random(self._seed)

    @property
    def seed(self) -> int:
        return self._seed

    @property
    def rng(self) -> np.random.RandomState:
        """Numpy random state for Monte Carlo etc."""
        return self._rng

    @property
    def python_rng(self) -> random.Random:
        """Python random for non-numpy operations."""
        return self._python_rng

    def reset(self) -> None:
        """Reset to initial seed state."""
        self._rng = np.random.RandomState(self._seed)
        self._python_rng = random.Random(self._seed)


def hash_dataset(data_dict: dict[str, list]) -> str:
    """Create a deterministic hash of dataset content.

    Args:
        data_dict: Dict of symbol -> list of bar dicts

    Returns:
        16-char hex hash
    """
    content = json.dumps(data_dict, sort_keys=True, default=str)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def hash_strategy(code: str, params: dict[str, Any] | None = None) -> str:
    """Hash strategy code + parameters for version tracking."""
    content = code + json.dumps(params or {}, sort_keys=True, default=str)
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def generate_backtest_id(
    strategy_hash: str,
    dataset_hash: str,
    config_hash: str,
) -> str:
    """Generate a reproducible backtest ID from its inputs.

    Same inputs always produce the same ID.
    """
    combined = f"{strategy_hash}:{dataset_hash}:{config_hash}"
    return hashlib.sha256(combined.encode()).hexdigest()[:24]


class EventLog:
    """Append-only event log for audit trail."""

    def __init__(self):
        self._events: list[dict] = []

    def log(self, event_type: str, timestamp: datetime, data: dict[str, Any]) -> None:
        self._events.append({
            "type": event_type,
            "timestamp": timestamp.isoformat(),
            "data": data,
        })

    def get_log(self) -> list[dict]:
        return list(self._events)

    def export_json(self) -> str:
        return json.dumps(self._events, indent=2, default=str)

    def replay_hash(self) -> str:
        """Hash of the entire event log for verification."""
        content = json.dumps(self._events, sort_keys=True, default=str)
        return hashlib.sha256(content.encode()).hexdigest()

    def __len__(self) -> int:
        return len(self._events)
