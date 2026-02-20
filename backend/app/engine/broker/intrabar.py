"""Intrabar price simulation for execution realism.

Generates synthetic intrabar price paths within a single OHLCV bar,
allowing more realistic fill price simulation for limit/stop orders.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import random

import numpy as np


class IntrabarModel(Enum):
    OHLC_PATH = "ohlc_path"       # O -> H/L -> L/H -> C
    RANDOM_WALK = "random_walk"    # Brownian bridge within bar
    VWAP_WEIGHTED = "vwap_weighted"  # Weighted toward VWAP


@dataclass
class IntrabarConfig:
    """Configuration for intrabar simulation."""
    model: IntrabarModel = IntrabarModel.OHLC_PATH
    num_ticks: int = 20           # Synthetic ticks per bar
    seed: int | None = None


class IntrabarSimulator:
    """Generates synthetic intrabar price paths.

    Given an OHLCV bar, produces a sequence of prices that the market
    might have followed within that bar. This allows limit and stop
    orders to be evaluated against a more realistic price path.

    Usage:
        sim = IntrabarSimulator()
        prices = sim.simulate(open=100, high=102, low=99, close=101, volume=1000)
    """

    def __init__(self, config: IntrabarConfig | None = None):
        self.config = config or IntrabarConfig()
        self._rng = random.Random(self.config.seed)

    def simulate(
        self,
        open_price: float,
        high_price: float,
        low_price: float,
        close_price: float,
        volume: float = 0,
    ) -> list[float]:
        """Generate a synthetic intrabar price path.

        Returns:
            List of prices starting at open, ending at close,
            touching high and low at some point.
        """
        if self.config.model == IntrabarModel.OHLC_PATH:
            return self._ohlc_path(open_price, high_price, low_price, close_price)
        elif self.config.model == IntrabarModel.RANDOM_WALK:
            return self._random_walk(open_price, high_price, low_price, close_price)
        elif self.config.model == IntrabarModel.VWAP_WEIGHTED:
            return self._vwap_weighted(open_price, high_price, low_price, close_price, volume)
        return [open_price, close_price]

    def _ohlc_path(self, o: float, h: float, l: float, c: float) -> list[float]:
        """Simple O -> H or L -> opposite extreme -> C path."""
        n = max(self.config.num_ticks, 4)

        # Determine if bar went up first or down first
        up_first = (c >= o)  # Bullish bar: O -> L -> H -> C
        if not up_first:     # Bearish bar: O -> H -> L -> C
            pass

        prices = [o]
        quarter = n // 4

        if up_first:
            # O -> L (dip) -> H (rally) -> C
            for i in range(1, quarter + 1):
                t = i / quarter
                prices.append(o + (l - o) * t)
            for i in range(1, quarter * 2 + 1):
                t = i / (quarter * 2)
                prices.append(l + (h - l) * t)
            remaining = n - len(prices)
            for i in range(1, remaining + 1):
                t = i / remaining
                prices.append(h + (c - h) * t)
        else:
            # O -> H (rally) -> L (dip) -> C
            for i in range(1, quarter + 1):
                t = i / quarter
                prices.append(o + (h - o) * t)
            for i in range(1, quarter * 2 + 1):
                t = i / (quarter * 2)
                prices.append(h + (l - h) * t)
            remaining = n - len(prices)
            for i in range(1, remaining + 1):
                t = i / remaining
                prices.append(l + (c - l) * t)

        prices.append(c)
        return prices

    def _random_walk(self, o: float, h: float, l: float, c: float) -> list[float]:
        """Brownian bridge constrained to [low, high], starting at open, ending at close."""
        n = self.config.num_ticks

        # Generate a Brownian bridge from 0 to 0
        increments = [self._rng.gauss(0, 1) for _ in range(n)]
        cumsum = [0.0]
        for inc in increments:
            cumsum.append(cumsum[-1] + inc)

        # Bridge: subtract linear interpolation to end at 0
        bridge = [cumsum[i] - (i / n) * cumsum[-1] for i in range(n + 1)]

        # Scale to fit within [low - open, high - open]
        raw_min = min(bridge)
        raw_max = max(bridge)
        raw_range = raw_max - raw_min if raw_max != raw_min else 1

        prices = []
        for i, b in enumerate(bridge):
            # Normalize to [0, 1]
            norm = (b - raw_min) / raw_range
            # Scale to [low, high]
            price = l + norm * (h - l)
            prices.append(price)

        # Force start=open, end=close
        if prices:
            prices[0] = o
            prices[-1] = c

        return prices

    def _vwap_weighted(self, o: float, h: float, l: float, c: float, volume: float) -> list[float]:
        """VWAP-weighted: prices cluster around the midpoint."""
        vwap = (h + l + c) / 3  # Typical price approximation
        prices = self._ohlc_path(o, h, l, c)

        # Pull prices toward VWAP
        alpha = 0.3
        weighted = [p * (1 - alpha) + vwap * alpha for p in prices]
        # Preserve endpoints
        if weighted:
            weighted[0] = o
            weighted[-1] = c
        return weighted

    def check_price_touched(
        self,
        target_price: float,
        open_price: float,
        high_price: float,
        low_price: float,
        close_price: float,
    ) -> tuple[bool, int | None]:
        """Check if target price was touched within the bar.

        Returns:
            (touched: bool, tick_index: int | None) — tick_index is the
            synthetic tick at which the target was first reached.
        """
        prices = self.simulate(open_price, high_price, low_price, close_price)
        for i, p in enumerate(prices):
            if (target_price >= low_price and target_price <= high_price):
                # Price was in range — find exact tick
                if abs(p - target_price) / max(target_price, 0.01) < 0.001:
                    return True, i
                if i > 0:
                    prev = prices[i - 1]
                    if (prev <= target_price <= p) or (p <= target_price <= prev):
                        return True, i
        # Simple range check
        if low_price <= target_price <= high_price:
            return True, len(prices) // 2
        return False, None
