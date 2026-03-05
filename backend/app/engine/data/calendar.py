"""Exchange session calendars.

Defines trading hours, holidays, and session boundaries for different markets.
Crypto: 24/7. Equities: market hours with holidays. Futures: extended hours.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, date, timedelta
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pandas as pd


class MarketType(Enum):
    CRYPTO = "crypto"
    US_EQUITY = "us_equity"
    US_FUTURES = "us_futures"
    FOREX = "forex"


@dataclass
class TradingSession:
    """A single trading session."""
    market_open: time
    market_close: time
    pre_market_open: time | None = None
    post_market_close: time | None = None
    timezone: str = "America/New_York"


# US market holidays (NYSE/NASDAQ)
_US_HOLIDAYS: set[date] = {
    # 2023
    date(2023, 1, 2), date(2023, 1, 16), date(2023, 2, 20),
    date(2023, 4, 7), date(2023, 5, 29), date(2023, 6, 19),
    date(2023, 7, 4), date(2023, 9, 4), date(2023, 11, 23),
    date(2023, 12, 25),
    # 2024
    date(2024, 1, 1), date(2024, 1, 15), date(2024, 2, 19),
    date(2024, 3, 29), date(2024, 5, 27), date(2024, 6, 19),
    date(2024, 7, 4), date(2024, 9, 2), date(2024, 11, 28),
    date(2024, 12, 25),
    # 2025
    date(2025, 1, 1), date(2025, 1, 20), date(2025, 2, 17),
    date(2025, 4, 18), date(2025, 5, 26), date(2025, 6, 19),
    date(2025, 7, 4), date(2025, 9, 1), date(2025, 11, 27),
    date(2025, 12, 25),
    # 2026
    date(2026, 1, 1), date(2026, 1, 19), date(2026, 2, 16),
    date(2026, 4, 3), date(2026, 5, 25), date(2026, 6, 19),
    date(2026, 7, 3), date(2026, 9, 7), date(2026, 11, 26),
    date(2026, 12, 25),
}


class ExchangeCalendar:
    """Determines whether a given time is within trading hours."""

    def __init__(self, market_type: MarketType = MarketType.US_EQUITY):
        self.market_type = market_type
        self._sessions = self._build_sessions()

    def _build_sessions(self) -> TradingSession:
        if self.market_type == MarketType.CRYPTO:
            return TradingSession(
                market_open=time(0, 0),
                market_close=time(23, 59, 59),
                timezone="UTC",
            )
        elif self.market_type == MarketType.US_EQUITY:
            return TradingSession(
                market_open=time(9, 30),
                market_close=time(16, 0),
                pre_market_open=time(4, 0),
                post_market_close=time(20, 0),
                timezone="America/New_York",
            )
        elif self.market_type == MarketType.US_FUTURES:
            return TradingSession(
                market_open=time(18, 0),   # Sunday evening
                market_close=time(17, 0),  # Friday evening
                timezone="America/New_York",
            )
        else:
            # Forex: Sun 5pm - Fri 5pm ET
            return TradingSession(
                market_open=time(17, 0),
                market_close=time(17, 0),
                timezone="America/New_York",
            )

    def is_trading_day(self, dt: date) -> bool:
        """Check if a date is a trading day."""
        if self.market_type == MarketType.CRYPTO:
            return True
        if dt.weekday() >= 5:  # Saturday or Sunday
            return False
        if dt in _US_HOLIDAYS:
            return False
        return True

    def is_market_open(self, dt: datetime) -> bool:
        """Check if the market is open at a specific datetime."""
        if self.market_type == MarketType.CRYPTO:
            return True
        if not self.is_trading_day(dt.date()):
            return False
        t = dt.time()
        return self._sessions.market_open <= t < self._sessions.market_close

    def is_session_open(self, dt: datetime) -> bool:
        """Check if within extended hours (pre + regular + post)."""
        if self.market_type == MarketType.CRYPTO:
            return True
        if not self.is_trading_day(dt.date()):
            return False
        t = dt.time()
        open_time = self._sessions.pre_market_open or self._sessions.market_open
        close_time = self._sessions.post_market_close or self._sessions.market_close
        return open_time <= t < close_time

    def next_market_open(self, dt: datetime) -> datetime:
        """Get the next market open time after dt."""
        d = dt.date()
        if dt.time() >= self._sessions.market_close:
            d += timedelta(days=1)
        while not self.is_trading_day(d):
            d += timedelta(days=1)
        return datetime.combine(d, self._sessions.market_open)

    def session_close(self, dt: datetime) -> datetime:
        """Get the session close time for the given date."""
        return datetime.combine(dt.date(), self._sessions.market_close)

    def trading_days_between(self, start: date, end: date) -> list[date]:
        """List all trading days between start and end (inclusive)."""
        days = []
        d = start
        while d <= end:
            if self.is_trading_day(d):
                days.append(d)
            d += timedelta(days=1)
        return days

    @staticmethod
    def detect_market_type(symbol: str) -> MarketType:
        """Auto-detect market type from symbol."""
        s = symbol.upper()
        crypto_indicators = ["-USD", "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "USDT", "BNB"]
        if any(ind in s for ind in crypto_indicators):
            return MarketType.CRYPTO
        if s.endswith("=F"):
            return MarketType.US_FUTURES
        if "/" in s or s.endswith("=X"):
            return MarketType.FOREX
        return MarketType.US_EQUITY


def filter_to_trading_days(df: "pd.DataFrame", symbol: str) -> "pd.DataFrame":
    """Filter DataFrame to only include rows on valid trading days for the symbol.

    For US equities: excludes weekends and US market holidays.
    For crypto: returns df unchanged (24/7).
    For forex/futures: uses appropriate calendar.

    Preserves data integrity so backtests don't include weekend/holiday bars for
    equities or accidentally exclude valid crypto weekend bars.
    """
    import pandas as pd

    if df.empty:
        return df

    market_type = ExchangeCalendar.detect_market_type(symbol)
    if market_type == MarketType.CRYPTO:
        return df

    cal = ExchangeCalendar(market_type=market_type)
    idx = df.index
    if hasattr(idx, "tz") and idx.tz is not None:
        idx = idx.tz_localize(None)
    keep = [cal.is_trading_day(pd.Timestamp(ts).date()) for ts in idx]
    return df.loc[keep].copy()


@dataclass
class TradingHalt:
    """Represents a trading halt event."""
    symbol: str
    start_time: datetime
    end_time: datetime | None = None
    reason: str = ""  # e.g. "LULD", "news_pending", "volatility"
    halt_type: str = "symbol"  # "symbol" or "market_wide"


class HaltManager:
    """Manages trading halts for symbols and market-wide events.
    
    Usage:
        halts = HaltManager()
        halts.add_halt(TradingHalt(symbol="AAPL", start_time=..., end_time=...))
        if halts.is_halted("AAPL", current_time):
            # Don't process orders for AAPL
    """

    def __init__(self):
        self._halts: list[TradingHalt] = []

    def add_halt(self, halt: TradingHalt) -> None:
        self._halts.append(halt)

    def is_halted(self, symbol: str, timestamp: datetime) -> bool:
        """Check if a symbol is currently halted."""
        for halt in self._halts:
            if halt.halt_type == "market_wide" or halt.symbol.upper() == symbol.upper():
                if halt.start_time <= timestamp:
                    if halt.end_time is None or timestamp <= halt.end_time:
                        return True
        return False

    def get_active_halts(self, timestamp: datetime) -> list[TradingHalt]:
        """Get all currently active halts."""
        return [
            h for h in self._halts
            if h.start_time <= timestamp and (h.end_time is None or timestamp <= h.end_time)
        ]

    def add_luld_halt(self, symbol: str, timestamp: datetime, duration_minutes: int = 5) -> None:
        """Add a Limit Up/Limit Down halt."""
        end = timestamp + timedelta(minutes=duration_minutes)
        self.add_halt(TradingHalt(
            symbol=symbol, start_time=timestamp, end_time=end,
            reason="LULD", halt_type="symbol",
        ))

    def add_circuit_breaker(self, timestamp: datetime, level: int = 1) -> None:
        """Add a market-wide circuit breaker halt."""
        durations = {1: 15, 2: 15, 3: 0}  # Level 3 = rest of day
        minutes = durations.get(level, 15)
        end = timestamp + timedelta(minutes=minutes) if minutes > 0 else None
        self.add_halt(TradingHalt(
            symbol="*", start_time=timestamp, end_time=end,
            reason=f"circuit_breaker_L{level}", halt_type="market_wide",
        ))

    def clear(self) -> None:
        self._halts.clear()
