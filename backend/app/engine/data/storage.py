"""Data storage layer — persistent time-series via TimescaleDB (PostgreSQL extension).
Supports OHLCV bars, tick data, versioned datasets, and caching.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Iterator

import pandas as pd
import numpy as np

from app.engine.data.feed import BarData


class DataInterval(Enum):
    TICK = "tick"
    SECOND_1 = "1s"
    MINUTE_1 = "1m"
    MINUTE_5 = "5m"
    MINUTE_15 = "15m"
    MINUTE_30 = "30m"
    HOUR_1 = "1h"
    HOUR_4 = "4h"
    DAILY = "1d"
    WEEKLY = "1w"
    MONTHLY = "1M"


@dataclass
class DatasetVersion:
    """Versioned dataset for reproducibility."""
    version_id: str
    symbol: str
    interval: DataInterval
    start_date: datetime
    end_date: datetime
    row_count: int
    content_hash: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TickData:
    """Single tick data point."""
    symbol: str
    timestamp: datetime
    price: float
    size: float
    side: str = "unknown"  # "buy", "sell", "unknown"
    exchange: str = ""

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp.isoformat(),
            "price": self.price,
            "size": self.size,
            "side": self.side,
            "exchange": self.exchange,
        }


class DataStore:
    """In-memory data store with persistence-ready interface. Subclass for TimescaleDB/ClickHouse in production."""

    def __init__(self):
        self._ohlcv: dict[str, dict[str, pd.DataFrame]] = {}  # symbol -> interval -> df
        self._ticks: dict[str, list[TickData]] = {}            # symbol -> ticks
        self._versions: dict[str, DatasetVersion] = {}          # version_id -> version
        self._metadata: dict[str, dict[str, Any]] = {}          # symbol -> metadata

    def store_ohlcv(
        self,
        symbol: str,
        interval: str,
        df: pd.DataFrame,
        create_version: bool = True,
    ) -> DatasetVersion | None:
        """Store OHLCV data for a symbol/interval."""
        if symbol not in self._ohlcv:
            self._ohlcv[symbol] = {}
        self._ohlcv[symbol][interval] = df.copy()

        if create_version:
            version = self._create_version(symbol, interval, df)
            self._versions[version.version_id] = version
            return version
        return None

    def get_ohlcv(
        self,
        symbol: str,
        interval: str,
        start: datetime | None = None,
        end: datetime | None = None,
        version_id: str | None = None,
    ) -> pd.DataFrame | None:
        """Retrieve OHLCV data, optionally filtered by date range."""
        if symbol not in self._ohlcv or interval not in self._ohlcv[symbol]:
            return None

        df = self._ohlcv[symbol][interval]
        if start:
            df = df[df.index >= start]
        if end:
            df = df[df.index <= end]
        return df

    def store_ticks(self, symbol: str, ticks: list[TickData]) -> int:
        """Store tick data. Returns count stored."""
        if symbol not in self._ticks:
            self._ticks[symbol] = []
        self._ticks[symbol].extend(ticks)
        return len(ticks)

    def get_ticks(
        self,
        symbol: str,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[TickData]:
        """Retrieve tick data for a symbol."""
        ticks = self._ticks.get(symbol, [])
        if start:
            ticks = [t for t in ticks if t.timestamp >= start]
        if end:
            ticks = [t for t in ticks if t.timestamp <= end]
        return ticks

    def aggregate_ticks_to_bars(
        self,
        symbol: str,
        interval_seconds: int,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> pd.DataFrame:
        """Aggregate tick data to OHLCV bars on-the-fly."""
        ticks = self.get_ticks(symbol, start, end)
        if not ticks:
            return pd.DataFrame()

        # Group ticks by interval
        bars: list[dict] = []
        current_bar_start = None
        current_bar: dict[str, Any] = {}

        for tick in sorted(ticks, key=lambda t: t.timestamp):
            bar_start = tick.timestamp.replace(
                second=(tick.timestamp.second // interval_seconds) * interval_seconds,
                microsecond=0,
            )
            if interval_seconds >= 60:
                bar_start = tick.timestamp.replace(
                    minute=(tick.timestamp.minute // (interval_seconds // 60)) * (interval_seconds // 60),
                    second=0, microsecond=0,
                )

            if current_bar_start != bar_start:
                if current_bar:
                    bars.append(current_bar)
                current_bar_start = bar_start
                current_bar = {
                    "timestamp": bar_start,
                    "Open": tick.price,
                    "High": tick.price,
                    "Low": tick.price,
                    "Close": tick.price,
                    "Volume": tick.size,
                }
            else:
                current_bar["High"] = max(current_bar["High"], tick.price)
                current_bar["Low"] = min(current_bar["Low"], tick.price)
                current_bar["Close"] = tick.price
                current_bar["Volume"] += tick.size

        if current_bar:
            bars.append(current_bar)

        if not bars:
            return pd.DataFrame()

        df = pd.DataFrame(bars)
        df.set_index("timestamp", inplace=True)
        return df

    def list_symbols(self) -> list[str]:
        """List all symbols with stored data."""
        symbols = set(self._ohlcv.keys()) | set(self._ticks.keys())
        return sorted(symbols)

    def list_intervals(self, symbol: str) -> list[str]:
        """List available intervals for a symbol."""
        return list(self._ohlcv.get(symbol, {}).keys())

    def get_version(self, version_id: str) -> DatasetVersion | None:
        return self._versions.get(version_id)

    def list_versions(self, symbol: str | None = None) -> list[DatasetVersion]:
        versions = list(self._versions.values())
        if symbol:
            versions = [v for v in versions if v.symbol == symbol]
        return sorted(versions, key=lambda v: v.created_at, reverse=True)

    def _create_version(self, symbol: str, interval: str, df: pd.DataFrame) -> DatasetVersion:
        """Create a versioned snapshot of the data."""
        content = df.to_json()
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
        version_id = f"{symbol}_{interval}_{content_hash}"

        return DatasetVersion(
            version_id=version_id,
            symbol=symbol,
            interval=DataInterval(interval) if interval in [e.value for e in DataInterval] else DataInterval.DAILY,
            start_date=df.index[0].to_pydatetime() if len(df) > 0 else datetime.utcnow(),
            end_date=df.index[-1].to_pydatetime() if len(df) > 0 else datetime.utcnow(),
            row_count=len(df),
            content_hash=content_hash,
        )

    def import_csv(self, symbol: str, filepath: str, interval: str = "1d") -> int:
        """Import OHLCV data from a CSV file."""
        df = pd.read_csv(filepath, parse_dates=True, index_col=0)

        # Normalize column names
        col_map = {}
        for col in df.columns:
            lc = col.lower()
            if "open" in lc:
                col_map[col] = "Open"
            elif "high" in lc:
                col_map[col] = "High"
            elif "low" in lc:
                col_map[col] = "Low"
            elif "close" in lc:
                col_map[col] = "Close"
            elif "vol" in lc:
                col_map[col] = "Volume"
        df = df.rename(columns=col_map)

        self.store_ohlcv(symbol, interval, df)
        return len(df)

    def export_json(self, symbol: str, interval: str) -> str | None:
        """Export data as a JSON artifact for download."""
        df = self.get_ohlcv(symbol, interval)
        if df is None:
            return None
        records = []
        for idx, row in df.iterrows():
            records.append({
                "timestamp": idx.isoformat() if hasattr(idx, 'isoformat') else str(idx),
                "open": round(float(row.get("Open", 0)), 4),
                "high": round(float(row.get("High", 0)), 4),
                "low": round(float(row.get("Low", 0)), 4),
                "close": round(float(row.get("Close", 0)), 4),
                "volume": float(row.get("Volume", 0)),
            })
        return json.dumps({"symbol": symbol, "interval": interval, "data": records}, indent=2)


class CachedDataStore(DataStore):
    """DataStore with LRU caching for frequently accessed data.

    Dataset caching layer.
    """

    def __init__(self, max_cache_size: int = 100):
        super().__init__()
        self._cache: dict[str, tuple[pd.DataFrame, datetime]] = {}
        self._max_cache_size = max_cache_size
        self._cache_hits = 0
        self._cache_misses = 0

    def get_ohlcv(
        self,
        symbol: str,
        interval: str,
        start: datetime | None = None,
        end: datetime | None = None,
        version_id: str | None = None,
    ) -> pd.DataFrame | None:
        cache_key = f"{symbol}:{interval}:{start}:{end}"
        if cache_key in self._cache:
            self._cache_hits += 1
            return self._cache[cache_key][0]

        self._cache_misses += 1
        df = super().get_ohlcv(symbol, interval, start, end, version_id)
        if df is not None:
            if len(self._cache) >= self._max_cache_size:
                # Evict oldest entry
                oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
                del self._cache[oldest_key]
            self._cache[cache_key] = (df, datetime.utcnow())
        return df

    @property
    def cache_hit_rate(self) -> float:
        total = self._cache_hits + self._cache_misses
        return self._cache_hits / total if total > 0 else 0.0
