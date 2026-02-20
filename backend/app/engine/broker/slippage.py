"""Volume-aware slippage models.

Slippage as a function of order size / bar volume with impact curve modeling.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum

from app.engine.data.feed import BarData


class LiquidityTier(Enum):
    HIGH = "high"     # Large-cap, high volume
    MID = "mid"       # Mid-cap
    LOW = "low"       # Small-cap, low liquidity


class SlippageModel(ABC):
    """Abstract slippage model."""

    @abstractmethod
    def compute_slippage(
        self, price: float, order_size: float, bar: BarData, is_buy: bool
    ) -> float:
        """Return slippage in price units (always positive)."""
        ...


class NoSlippage(SlippageModel):
    """Zero slippage model."""

    def compute_slippage(
        self, price: float, order_size: float, bar: BarData, is_buy: bool
    ) -> float:
        return 0.0


@dataclass
class PercentageSlippage(SlippageModel):
    """Simple percentage-based slippage (legacy compatible)."""
    pct: float = 0.1  # 0.1% default

    def compute_slippage(
        self, price: float, order_size: float, bar: BarData, is_buy: bool
    ) -> float:
        return price * self.pct / 100


@dataclass
class VolumeAwareSlippage(SlippageModel):
    """Volume-aware slippage with impact curve modeling.

    slippage = base_bps + impact_factor * sqrt(order_size / bar_volume) * 10000

    The square-root model captures the empirical observation that market impact
    grows sub-linearly with order size (Almgren & Chriss, 2001).
    """
    base_bps: float = 1.0            # Minimum slippage in bps
    impact_factor: float = 0.1       # Impact scaling
    tier: LiquidityTier = LiquidityTier.HIGH
    max_slippage_bps: float = 500.0  # Cap at 5%

    def __post_init__(self):
        # Auto-adjust impact by liquidity tier
        tier_multipliers = {
            LiquidityTier.HIGH: 1.0,
            LiquidityTier.MID: 2.0,
            LiquidityTier.LOW: 5.0,
        }
        self.impact_factor *= tier_multipliers[self.tier]

    def compute_slippage(
        self, price: float, order_size: float, bar: BarData, is_buy: bool
    ) -> float:
        if price <= 0:
            return 0.0

        participation = order_size / bar.volume if bar.volume > 0 else 1.0
        impact_bps = self.base_bps + self.impact_factor * math.sqrt(participation) * 10000
        impact_bps = min(impact_bps, self.max_slippage_bps)

        return price * impact_bps / 10000


@dataclass
class LinearSlippage(SlippageModel):
    """Linear slippage: proportional to participation rate."""
    base_bps: float = 1.0
    linear_factor: float = 50.0  # bps per 1% participation

    def compute_slippage(
        self, price: float, order_size: float, bar: BarData, is_buy: bool
    ) -> float:
        if price <= 0:
            return 0.0

        participation_pct = (order_size / bar.volume * 100) if bar.volume > 0 else 100.0
        slippage_bps = self.base_bps + self.linear_factor * participation_pct / 100
        return price * slippage_bps / 10000


def auto_detect_tier(avg_daily_volume: float) -> LiquidityTier:
    """Detect liquidity tier from average daily volume (in dollars)."""
    if avg_daily_volume >= 100_000_000:
        return LiquidityTier.HIGH
    elif avg_daily_volume >= 10_000_000:
        return LiquidityTier.MID
    return LiquidityTier.LOW
