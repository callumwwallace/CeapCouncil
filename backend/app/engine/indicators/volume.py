"""Volume-based indicators."""

from __future__ import annotations

from typing import Sequence

import numpy as np

from app.engine.indicators.base import Indicator, MultiInputIndicator


class OBV(MultiInputIndicator):
    """On-Balance Volume."""

    def __call__(
        self,
        close: Sequence[float] | np.ndarray | None = None,
        volume: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if close is None or volume is None:
            return np.nan
        c = self._to_array(close)
        v = self._to_array(volume)
        if len(c) < 2:
            return 0.0
        direction = np.sign(np.diff(c))
        obv = np.cumsum(direction * v[1:])
        return float(obv[-1])


class MFI(MultiInputIndicator):
    """Money Flow Index : volume-weighted RSI."""

    def __init__(self, period: int = 14):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
        volume: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if high is None or low is None or close is None or volume is None:
            return np.nan
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        v = self._to_array(volume)
        if len(c) < self.period + 1:
            return np.nan
        tp = (h + l + c) / 3.0
        mf = tp * v
        tp_diff = np.diff(tp)
        pos_mf = np.where(tp_diff > 0, mf[1:], 0)
        neg_mf = np.where(tp_diff < 0, mf[1:], 0)
        pos_sum = np.sum(pos_mf[-self.period:])
        neg_sum = np.sum(neg_mf[-self.period:])
        if neg_sum == 0:
            return 100.0
        ratio = pos_sum / neg_sum
        return float(100 - 100 / (1 + ratio))


class ChaikinMoneyFlow(MultiInputIndicator):
    """Chaikin Money Flow."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
        volume: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if high is None or low is None or close is None or volume is None:
            return np.nan
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        v = self._to_array(volume)
        if len(c) < self.period:
            return np.nan
        hl_range = h - l
        hl_range = np.where(hl_range == 0, 1e-10, hl_range)
        clv = ((c - l) - (h - c)) / hl_range
        mf_volume = clv * v
        vol_sum = np.sum(v[-self.period:])
        if vol_sum == 0:
            return 0.0
        return float(np.sum(mf_volume[-self.period:]) / vol_sum)


class ForceIndex(MultiInputIndicator):
    """Force Index : price change × volume."""

    def __init__(self, period: int = 13):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        close: Sequence[float] | np.ndarray | None = None,
        volume: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if close is None or volume is None:
            return np.nan
        c = self._to_array(close)
        v = self._to_array(volume)
        if len(c) < 2:
            return np.nan
        raw_fi = np.diff(c) * v[1:]
        if len(raw_fi) < self.period:
            return float(raw_fi[-1]) if len(raw_fi) > 0 else np.nan
        from app.engine.indicators.overlays import EMA
        ema = EMA(self.period)
        return ema(raw_fi)


class VWAP(MultiInputIndicator):
    """Volume Weighted Average Price (same as overlays.VWAP)."""

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
        volume: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if high is None or low is None or close is None or volume is None:
            return np.nan
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        v = self._to_array(volume)
        tp = (h + l + c) / 3.0
        cum_tp_vol = np.cumsum(tp * v)
        cum_vol = np.cumsum(v)
        if cum_vol[-1] == 0:
            return np.nan
        return float(cum_tp_vol[-1] / cum_vol[-1])


class AccumulationDistribution(MultiInputIndicator):
    """Accumulation/Distribution Line."""

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
        volume: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if high is None or low is None or close is None or volume is None:
            return np.nan
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        v = self._to_array(volume)
        hl_range = h - l
        hl_range = np.where(hl_range == 0, 1e-10, hl_range)
        clv = ((c - l) - (h - c)) / hl_range
        ad = np.cumsum(clv * v)
        return float(ad[-1])


class EaseOfMovement(MultiInputIndicator):
    """Ease of Movement."""

    def __init__(self, period: int = 14):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        volume: Sequence[float] | np.ndarray | None = None,
    ) -> float:
        if high is None or low is None or volume is None:
            return np.nan
        h = self._to_array(high)
        l = self._to_array(low)
        v = self._to_array(volume)
        if len(h) < 2:
            return np.nan
        dm = ((h[1:] + l[1:]) / 2) - ((h[:-1] + l[:-1]) / 2)
        box_ratio = (v[1:] / 1e6) / (h[1:] - l[1:])
        box_ratio = np.where(np.isinf(box_ratio) | np.isnan(box_ratio), 0, box_ratio)
        emv = dm / np.where(box_ratio == 0, 1e-10, box_ratio)
        if len(emv) < self.period:
            return float(np.mean(emv))
        return float(np.mean(emv[-self.period:]))
