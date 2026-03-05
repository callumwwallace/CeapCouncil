"""OHLCV data cache for reproducible backtests and reduced API load.

Caches fetched DataFrames by (symbol, start_date, end_date, interval).
Uses disk storage with configurable TTL (default 24h).
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pandas as pd

CACHE_DIR = Path(os.environ.get("OHLCV_CACHE_DIR", ".cache/ohlcv"))
CACHE_TTL_HOURS = float(os.environ.get("OHLCV_CACHE_TTL_HOURS", "24"))


def _cache_key(symbol: str, start_date: str, end_date: str, interval: str) -> str:
    raw = f"{symbol}|{start_date}|{end_date}|{interval}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _cache_path(key: str) -> Path:
    p = Path(CACHE_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{key}.pkl"


def get_cached(symbol: str, start_date: str, end_date: str, interval: str) -> pd.DataFrame | None:
    """Return cached DataFrame if valid, else None."""
    try:
        import time
        key = _cache_key(symbol, str(start_date), str(end_date), interval)
        path = _cache_path(key)
        if not path.exists():
            return None
        age_hours = (time.time() - path.stat().st_mtime) / 3600
        if age_hours > CACHE_TTL_HOURS:
            path.unlink(missing_ok=True)
            return None
        df = pd.read_pickle(path)
        return df
    except Exception:
        return None


def set_cached(
    symbol: str,
    start_date: str,
    end_date: str,
    interval: str,
    data: pd.DataFrame,
) -> None:
    """Store DataFrame in cache."""
    try:
        key = _cache_key(symbol, str(start_date), str(end_date), interval)
        path = _cache_path(key)
        data.to_pickle(path)
    except Exception:
        pass


def compute_data_hash(data: pd.DataFrame | None) -> str:
    """Deterministic hash of OHLCV data for versioning."""
    if data is None or data.empty:
        return "empty"
    cols = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in data.columns]
    if not cols:
        return "empty"
    subset = data[cols].fillna(0).round(4)
    raw = subset.to_csv(index=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def compute_config_hash(config: dict | None) -> str:
    """Deterministic hash of backtest config."""
    ordered = json.dumps(config or {}, sort_keys=True, default=str)
    return hashlib.sha256(ordered.encode()).hexdigest()[:16]


def compute_code_hash(code: str) -> str:
    """Deterministic hash of strategy code."""
    return hashlib.sha256(code.encode()).hexdigest()[:16]
