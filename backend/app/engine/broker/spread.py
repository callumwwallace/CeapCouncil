"""Bid/ask spread modeling.

Synthetic spread from bar data: spread = f(volatility, volume).
Buys fill at ask (mid + half spread), sells fill at bid (mid - half spread).
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.engine.data.feed import BarData


class SpreadModel(ABC):
    """Abstract spread model — compute bid/ask from bar data."""

    @abstractmethod
    def get_spread(self, bar: BarData, avg_volume: float | None = None) -> float:
        """Return the full spread (ask - bid) for this bar."""
        ...

    def get_bid(self, price: float, bar: BarData, avg_volume: float | None = None) -> float:
        return price - self.get_spread(bar, avg_volume) / 2

    def get_ask(self, price: float, bar: BarData, avg_volume: float | None = None) -> float:
        return price + self.get_spread(bar, avg_volume) / 2


class NoSpread(SpreadModel):
    """Zero spread — fills at mid price."""

    def get_spread(self, bar: BarData, avg_volume: float | None = None) -> float:
        return 0.0


@dataclass
class FixedSpread(SpreadModel):
    """Fixed absolute spread in price units."""
    spread: float = 0.01

    def get_spread(self, bar: BarData, avg_volume: float | None = None) -> float:
        return self.spread


@dataclass
class FixedBpsSpread(SpreadModel):
    """Fixed spread in basis points of mid price."""
    bps: float = 10.0  # 10 bps = 0.1%

    def get_spread(self, bar: BarData, avg_volume: float | None = None) -> float:
        mid = bar.close
        return mid * self.bps / 10000


@dataclass
class VolatilitySpread(SpreadModel):
    """Volatility-adaptive spread model.

    spread = base_bps + vol_multiplier * intrabar_volatility

    For crypto: wider base spread, higher volatility sensitivity.
    For equities: tighter base spread, lower sensitivity.
    """
    base_bps: float = 5.0        # Base spread in bps
    vol_multiplier: float = 2.0  # How much volatility widens the spread
    min_spread_bps: float = 1.0  # Floor
    max_spread_bps: float = 100.0  # Ceiling
    is_crypto: bool = False

    def __post_init__(self):
        if self.is_crypto:
            self.base_bps = max(self.base_bps, 10.0)
            self.vol_multiplier = max(self.vol_multiplier, 3.0)

    def get_spread(self, bar: BarData, avg_volume: float | None = None) -> float:
        mid = bar.close
        if mid <= 0:
            return 0.0

        # Intrabar volatility: (high - low) / close as a percentage
        intrabar_vol = bar.range / mid * 100 if mid > 0 else 0

        # Volume adjustment: lower volume → wider spread
        vol_adj = 1.0
        if avg_volume and avg_volume > 0 and bar.volume > 0:
            vol_ratio = bar.volume / avg_volume
            vol_adj = 1.0 / max(math.sqrt(vol_ratio), 0.5)

        spread_bps = (self.base_bps + self.vol_multiplier * intrabar_vol * 100) * vol_adj
        spread_bps = max(self.min_spread_bps, min(spread_bps, self.max_spread_bps))

        return mid * spread_bps / 10000
