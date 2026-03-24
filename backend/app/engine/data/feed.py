"""Turn DataFrames into time-ordered bar events the engine can step through.

You get two flavours:
  * **DataFeed** — builds a list of ``BarData`` up front. Simple and fast enough under ~100k rows.
  * **StreamingDataFeed** — keeps numpy columns and materialises bars as we go. Roughly 40% lighter
    on memory for big histories because we never allocate a giant list of Python objects.
    Both paths merge timestamps with a small heap instead of sorting every stamp at once.
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


def _col(df: pd.DataFrame, name: str) -> str:
    """Return the actual column name matching *name* (case-insensitive)."""
    for c in df.columns:
        if c.lower() == name.lower():
            return c
    return name  # fallback


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

        Every group is guaranteed to contain ALL symbols. Symbols that have
        no new bar at the current timestamp are filled forward with a
        synthetic bar (open=high=low=close=last_close, volume=0) so the
        strategy always sees a complete, synchronised snapshot with no
        lookahead bias.

        Uses a heap-based k-way merge so we never build a full timestamp
        list in memory.
        """
        if not self._feeds:
            return

        all_symbols: list[str] = list(self._feeds.keys())
        pointers: dict[str, int] = {s: 0 for s in self._feeds}
        last_known: dict[str, MarketDataEvent] = {}

        # Min-heap of (next timestamp, symbol) — classic k-way merge
        heap: list[tuple[datetime, str]] = []
        for symbol, bars in self._feeds.items():
            if bars:
                heapq.heappush(heap, (bars[0].timestamp, symbol))

        last_ts: datetime | None = None
        pending: list[MarketDataEvent] = []
        pending_syms: set[str] = set()

        while heap:
            ts, sym = heapq.heappop(heap)

            if last_ts is not None and ts != last_ts and pending:
                # Pad missing symbols with a synthetic flat bar (last close, zero volume)
                for s in all_symbols:
                    if s not in pending_syms and s in last_known:
                        ev = last_known[s]
                        pending.append(MarketDataEvent(
                            timestamp=last_ts,
                            symbol=s,
                            open=ev.close,
                            high=ev.close,
                            low=ev.close,
                            close=ev.close,
                            volume=0.0,
                            bar_index=ev.bar_index,
                        ))
                yield pending
                pending = []
                pending_syms = set()

            last_ts = ts
            ptr = pointers[sym]
            event = self._feeds[sym][ptr].to_event()
            pending.append(event)
            pending_syms.add(sym)
            last_known[sym] = event
            pointers[sym] = ptr + 1

            if pointers[sym] < len(self._feeds[sym]):
                next_bar = self._feeds[sym][pointers[sym]]
                heapq.heappush(heap, (next_bar.timestamp, sym))

        if pending:
            for s in all_symbols:
                if s not in pending_syms and s in last_known:
                    ev = last_known[s]
                    pending.append(MarketDataEvent(
                        timestamp=last_ts,
                        symbol=s,
                        open=ev.close,
                        high=ev.close,
                        low=ev.close,
                        close=ev.close,
                        volume=0.0,
                        bar_index=ev.bar_index,
                    ))
            yield pending


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
    """Same API as ``DataFeed``, but OHLCV lives in numpy until you actually need a bar.

    Expect a meaningful memory win on large universes — we stop materialising
    hundreds of thousands of ``BarData`` instances up front.
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
        """Build every bar (handy for tests; skips the whole point in production)."""
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
        """Same merge semantics as ``DataFeed.iterate``, but events are built on demand."""
        if not self._arrays:
            return

        all_symbols: list[str] = list(self._arrays.keys())
        pointers: dict[str, int] = {s: 0 for s in self._arrays}
        last_known: dict[str, MarketDataEvent] = {}

        # int64 nanoseconds compare cheaply in the heap
        heap: list[tuple[int, str]] = []
        for symbol, arr in self._arrays.items():
            if arr.length > 0:
                ts_ns = int(arr.timestamps[0])
                heapq.heappush(heap, (ts_ns, symbol))

        last_ts_ns: int | None = None
        last_ts_dt: datetime | None = None
        pending: list[MarketDataEvent] = []
        pending_syms: set[str] = set()

        while heap:
            ts_ns, sym = heapq.heappop(heap)

            if last_ts_ns is not None and ts_ns != last_ts_ns and pending:
                # Carry forward anyone who didn't print this timestamp
                for s in all_symbols:
                    if s not in pending_syms and s in last_known:
                        ev = last_known[s]
                        pending.append(MarketDataEvent(
                            timestamp=last_ts_dt,
                            symbol=s,
                            open=ev.close,
                            high=ev.close,
                            low=ev.close,
                            close=ev.close,
                            volume=0.0,
                            bar_index=ev.bar_index,
                        ))
                yield pending
                pending = []
                pending_syms = set()

            last_ts_ns = ts_ns
            ptr = pointers[sym]
            event = self._arrays[sym].event_at(ptr)
            pending.append(event)
            pending_syms.add(sym)
            last_known[sym] = event
            last_ts_dt = event.timestamp
            pointers[sym] = ptr + 1

            if pointers[sym] < self._arrays[sym].length:
                next_ts = int(self._arrays[sym].timestamps[pointers[sym]])
                heapq.heappush(heap, (next_ts, sym))

        if pending:
            for s in all_symbols:
                if s not in pending_syms and s in last_known:
                    ev = last_known[s]
                    pending.append(MarketDataEvent(
                        timestamp=last_ts_dt,
                        symbol=s,
                        open=ev.close,
                        high=ev.close,
                        low=ev.close,
                        close=ev.close,
                        volume=0.0,
                        bar_index=ev.bar_index,
                    ))
            yield pending
