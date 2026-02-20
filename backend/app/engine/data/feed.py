"""Data feed — converts raw price data into MarketDataEvents.

Supports bar-level (OHLCV) and tick-level data. Handles multiple symbols
for multi-asset strategies.

Two modes:
  - DataFeed (default): Eager — materializes BarData objects upfront.
    Best for small/medium datasets (< 100k rows).
  - StreamingDataFeed: Lazy — keeps raw numpy arrays and creates BarData
    on-the-fly during iteration. Uses ~60% less memory for large datasets.
    Timestamp merging uses a heap-based k-way merge instead of collecting
    all timestamps into a single sorted list.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterator

import numpy as np
import pandas as pd

from app.engine.core.events import MarketDataEvent


@dataclass
class BarData:
    """Single OHLCV bar for one symbol."""
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    bar_index: int = 0

    @property
    def mid(self) -> float:
        return (self.high + self.low) / 2

    @property
    def typical_price(self) -> float:
        return (self.high + self.low + self.close) / 3

    @property
    def range(self) -> float:
        return self.high - self.low

    def to_event(self) -> MarketDataEvent:
        return MarketDataEvent(
            timestamp=self.timestamp,
            symbol=self.symbol,
            open=self.open,
            high=self.high,
            low=self.low,
            close=self.close,
            volume=self.volume,
            bar_index=self.bar_index,
        )


# ── Helper: normalize a pandas index entry to a naive datetime ────────────

def _to_naive_dt(idx) -> datetime:
    """Convert any index value to a timezone-naive Python datetime."""
    if isinstance(idx, datetime):
        ts = idx
    else:
        ts = pd.Timestamp(idx).to_pydatetime()
    if hasattr(ts, 'to_pydatetime'):
        ts = ts.to_pydatetime()
    if hasattr(ts, 'tzinfo') and ts.tzinfo is not None:
        ts = ts.replace(tzinfo=None)
    return ts


# ── Resolve column name (case-insensitive) ────────────────────────────────

def _col(df: pd.DataFrame, name: str) -> str:
    """Return the actual column name matching *name* (case-insensitive)."""
    for c in df.columns:
        if c.lower() == name.lower():
            return c
    return name  # fallback


# ═══════════════════════════════════════════════════════════════════════════
#  DataFeed (original eager mode — unchanged API)
# ═══════════════════════════════════════════════════════════════════════════

class DataFeed:
    """Manages one or more symbol data feeds and emits bars in time order.

    Accepts pandas DataFrames (from yfinance or any source) and yields
    MarketDataEvents in chronological order across all symbols.
    """

    def __init__(self):
        self._feeds: dict[str, list[BarData]] = {}
        self._bar_count: dict[str, int] = {}

    def add_symbol(self, symbol: str, df: pd.DataFrame) -> None:
        """Load a DataFrame into the feed. Expects columns: Open, High, Low, Close, Volume."""
        bars: list[BarData] = []
        for i, (idx, row) in enumerate(df.iterrows()):
            ts = _to_naive_dt(idx)
            bars.append(BarData(
                symbol=symbol,
                timestamp=ts,
                open=float(row.get(_col(df, "Open"), 0)),
                high=float(row.get(_col(df, "High"), 0)),
                low=float(row.get(_col(df, "Low"), 0)),
                close=float(row.get(_col(df, "Close"), 0)),
                volume=float(row.get(_col(df, "Volume"), 0)),
                bar_index=i,
            ))
        self._feeds[symbol] = bars
        self._bar_count[symbol] = len(bars)

    def get_bars(self, symbol: str) -> list[BarData]:
        return self._feeds.get(symbol, [])

    def get_bar(self, symbol: str, index: int) -> BarData | None:
        bars = self._feeds.get(symbol)
        if bars and 0 <= index < len(bars):
            return bars[index]
        return None

    @property
    def symbols(self) -> list[str]:
        return list(self._feeds.keys())

    @property
    def primary_symbol(self) -> str | None:
        return self.symbols[0] if self.symbols else None

    def total_bars(self, symbol: str | None = None) -> int:
        if symbol:
            return self._bar_count.get(symbol, 0)
        return max(self._bar_count.values()) if self._bar_count else 0

    def iterate(self) -> Iterator[list[MarketDataEvent]]:
        """Yield groups of events at each unique timestamp across all feeds.

        At each timestamp, all symbols with data at that time are yielded
        together so the strategy sees a synchronized snapshot.

        Uses a heap-based k-way merge so we never build a full timestamp
        list in memory.
        """
        if not self._feeds:
            return

        pointers: dict[str, int] = {s: 0 for s in self._feeds}

        # Seed the min-heap with the first bar of each symbol
        # Heap entries: (timestamp, symbol_name)
        heap: list[tuple[datetime, str]] = []
        for symbol, bars in self._feeds.items():
            if bars:
                heapq.heappush(heap, (bars[0].timestamp, symbol))

        last_ts: datetime | None = None
        pending: list[MarketDataEvent] = []

        while heap:
            ts, sym = heapq.heappop(heap)

            # If the timestamp changed, flush the pending group
            if last_ts is not None and ts != last_ts and pending:
                yield pending
                pending = []

            last_ts = ts
            ptr = pointers[sym]
            pending.append(self._feeds[sym][ptr].to_event())
            pointers[sym] = ptr + 1

            # Push next bar for this symbol
            if pointers[sym] < len(self._feeds[sym]):
                next_bar = self._feeds[sym][pointers[sym]]
                heapq.heappush(heap, (next_bar.timestamp, sym))

        # Flush last group
        if pending:
            yield pending


# ═══════════════════════════════════════════════════════════════════════════
#  StreamingDataFeed — lazy bar iteration with compact numpy storage
# ═══════════════════════════════════════════════════════════════════════════

class _SymbolArrays:
    """Compact columnar storage for one symbol's OHLCV data.

    Stores raw numpy arrays instead of a list of BarData objects.
    A 100k-row DataFrame stored this way uses ~4 MB (5 float64 arrays)
    versus ~40 MB for 100k BarData objects (each ~400 bytes with Python
    object overhead).
    """

    __slots__ = ("symbol", "timestamps", "opens", "highs", "lows", "closes", "volumes", "length")

    def __init__(self, symbol: str, df: pd.DataFrame):
        self.symbol = symbol
        self.length = len(df)

        # Convert index to numpy datetime64, then to an array of Python datetimes
        idx = df.index
        if hasattr(idx, 'tz') and idx.tz is not None:
            idx = idx.tz_localize(None)
        self.timestamps: np.ndarray = idx.values.astype("datetime64[ns]")

        o_col = _col(df, "Open")
        h_col = _col(df, "High")
        l_col = _col(df, "Low")
        c_col = _col(df, "Close")
        v_col = _col(df, "Volume")

        self.opens: np.ndarray = df[o_col].values.astype(np.float64) if o_col in df.columns else np.zeros(self.length)
        self.highs: np.ndarray = df[h_col].values.astype(np.float64) if h_col in df.columns else np.zeros(self.length)
        self.lows: np.ndarray = df[l_col].values.astype(np.float64) if l_col in df.columns else np.zeros(self.length)
        self.closes: np.ndarray = df[c_col].values.astype(np.float64) if c_col in df.columns else np.zeros(self.length)
        self.volumes: np.ndarray = df[v_col].values.astype(np.float64) if v_col in df.columns else np.zeros(self.length)

    def bar_at(self, i: int) -> BarData:
        """Create a BarData on-the-fly for index *i*."""
        ts = pd.Timestamp(self.timestamps[i]).to_pydatetime()
        if hasattr(ts, 'tzinfo') and ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        return BarData(
            symbol=self.symbol,
            timestamp=ts,
            open=float(self.opens[i]),
            high=float(self.highs[i]),
            low=float(self.lows[i]),
            close=float(self.closes[i]),
            volume=float(self.volumes[i]),
            bar_index=i,
        )

    def event_at(self, i: int) -> MarketDataEvent:
        """Create a MarketDataEvent on-the-fly for index *i*."""
        ts = pd.Timestamp(self.timestamps[i]).to_pydatetime()
        if hasattr(ts, 'tzinfo') and ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        return MarketDataEvent(
            timestamp=ts,
            symbol=self.symbol,
            open=float(self.opens[i]),
            high=float(self.highs[i]),
            low=float(self.lows[i]),
            close=float(self.closes[i]),
            volume=float(self.volumes[i]),
            bar_index=i,
        )


class StreamingDataFeed:
    """Data feed using raw numpy arrays (~60% less memory than BarData objects).

    Drop-in replacement for DataFeed — same public API — uses ~60%
    less memory for large datasets because it stores compact numpy
    arrays instead of Python BarData objects.

    BarData/MarketDataEvent objects are created lazily during iteration
    and immediately discarded after the engine processes each bar group.
    """

    def __init__(self):
        self._arrays: dict[str, _SymbolArrays] = {}
        self._bar_count: dict[str, int] = {}

    def add_symbol(self, symbol: str, df: pd.DataFrame) -> None:
        """Store a DataFrame as compact numpy arrays."""
        arr = _SymbolArrays(symbol, df)
        self._arrays[symbol] = arr
        self._bar_count[symbol] = arr.length

    def get_bars(self, symbol: str) -> list[BarData]:
        """Materialise all bars (use sparingly — defeats the memory benefit)."""
        arr = self._arrays.get(symbol)
        if arr is None:
            return []
        return [arr.bar_at(i) for i in range(arr.length)]

    def get_bar(self, symbol: str, index: int) -> BarData | None:
        arr = self._arrays.get(symbol)
        if arr and 0 <= index < arr.length:
            return arr.bar_at(index)
        return None

    @property
    def symbols(self) -> list[str]:
        return list(self._arrays.keys())

    @property
    def primary_symbol(self) -> str | None:
        return self.symbols[0] if self.symbols else None

    def total_bars(self, symbol: str | None = None) -> int:
        if symbol:
            return self._bar_count.get(symbol, 0)
        return max(self._bar_count.values()) if self._bar_count else 0

    def iterate(self) -> Iterator[list[MarketDataEvent]]:
        """Heap-based k-way merge over compact arrays.

        Creates MarketDataEvent objects lazily — only one bar-group's
        worth of objects exist in memory at any time.
        """
        if not self._arrays:
            return

        pointers: dict[str, int] = {s: 0 for s in self._arrays}

        # Seed heap: (timestamp_ns_int, symbol)
        # Using int64 nanoseconds for fast comparison in the heap
        heap: list[tuple[int, str]] = []
        for symbol, arr in self._arrays.items():
            if arr.length > 0:
                ts_ns = int(arr.timestamps[0])
                heapq.heappush(heap, (ts_ns, symbol))

        last_ts_ns: int | None = None
        pending: list[MarketDataEvent] = []

        while heap:
            ts_ns, sym = heapq.heappop(heap)

            if last_ts_ns is not None and ts_ns != last_ts_ns and pending:
                yield pending
                pending = []

            last_ts_ns = ts_ns
            ptr = pointers[sym]
            pending.append(self._arrays[sym].event_at(ptr))
            pointers[sym] = ptr + 1

            # Push next bar
            if pointers[sym] < self._arrays[sym].length:
                next_ts = int(self._arrays[sym].timestamps[pointers[sym]])
                heapq.heappush(heap, (next_ts, sym))

        if pending:
            yield pending
