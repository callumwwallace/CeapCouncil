"""Overlay indicators — plotted on the price chart."""

from __future__ import annotations

from typing import Sequence

import numpy as np

from app.engine.indicators.base import Indicator, MultiInputIndicator


class SMA(Indicator):
    """Simple Moving Average."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period

    def __call__(self, data: Sequence[float] | np.ndarray) -> float | np.ndarray:
        arr = self._to_array(data)
        if len(arr) < self.period:
            return np.nan
        if len(arr) == self.period:
            return float(np.mean(arr))
        result = np.convolve(arr, np.ones(self.period) / self.period, mode="valid")
        return float(result[-1])

    def series(self, data: Sequence[float] | np.ndarray) -> np.ndarray:
        """Return full SMA series (NaN-padded at start)."""
        arr = self._to_array(data)
        out = np.full(len(arr), np.nan)
        if len(arr) >= self.period:
            sma = np.convolve(arr, np.ones(self.period) / self.period, mode="valid")
            out[self.period - 1:] = sma
        return out


class EMA(Indicator):
    """Exponential Moving Average."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period
        self._alpha = 2.0 / (period + 1)

    def __call__(self, data: Sequence[float] | np.ndarray) -> float | np.ndarray:
        arr = self._to_array(data)
        if len(arr) < self.period:
            return np.nan
        return float(self.series(arr)[-1])

    def series(self, data: Sequence[float] | np.ndarray) -> np.ndarray:
        arr = self._to_array(data)
        out = np.full(len(arr), np.nan)
        if len(arr) < self.period:
            return out
        out[self.period - 1] = np.mean(arr[:self.period])
        for i in range(self.period, len(arr)):
            out[i] = self._alpha * arr[i] + (1 - self._alpha) * out[i - 1]
        return out


class WMA(Indicator):
    """Weighted Moving Average."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period
        self._weights = np.arange(1, period + 1, dtype=np.float64)
        self._weight_sum = self._weights.sum()

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        if len(arr) < self.period:
            return np.nan
        window = arr[-self.period:]
        return float(np.dot(window, self._weights) / self._weight_sum)


class DEMA(Indicator):
    """Double Exponential Moving Average."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period
        self._ema = EMA(period)

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        ema1 = self._ema.series(arr)
        ema2 = self._ema.series(ema1[~np.isnan(ema1)])
        if len(ema2) == 0 or np.isnan(ema2[-1]):
            return np.nan
        e1 = ema1[~np.isnan(ema1)]
        e2 = ema2[~np.isnan(ema2)]
        if len(e1) == 0 or len(e2) == 0:
            return np.nan
        return float(2 * e1[-1] - e2[-1])


class TEMA(Indicator):
    """Triple Exponential Moving Average."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period
        self._ema = EMA(period)

    def __call__(self, data: Sequence[float] | np.ndarray) -> float:
        arr = self._to_array(data)
        ema1 = self._ema.series(arr)
        e1 = ema1[~np.isnan(ema1)]
        if len(e1) == 0:
            return np.nan
        ema2 = self._ema.series(e1)
        e2 = ema2[~np.isnan(ema2)]
        if len(e2) == 0:
            return np.nan
        ema3 = self._ema.series(e2)
        e3 = ema3[~np.isnan(ema3)]
        if len(e3) == 0:
            return np.nan
        return float(3 * e1[-1] - 3 * e2[-1] + e3[-1])


class VWAP(MultiInputIndicator):
    """Volume Weighted Average Price."""

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


class BollingerBands(Indicator):
    """Bollinger Bands — returns dict with upper, middle, lower, %B, bandwidth."""

    def __init__(self, period: int = 20, num_std: float = 2.0):
        super().__init__(period=period, num_std=num_std)
        self.period = period
        self.num_std = num_std
        self._sma = SMA(period)

    def __call__(self, data: Sequence[float] | np.ndarray) -> dict:
        arr = self._to_array(data)
        if len(arr) < self.period:
            return {"upper": np.nan, "middle": np.nan, "lower": np.nan, "pct_b": np.nan, "bandwidth": np.nan}
        window = arr[-self.period:]
        middle = float(np.mean(window))
        std = float(np.std(window, ddof=1))
        upper = middle + self.num_std * std
        lower = middle - self.num_std * std
        band_width = upper - lower
        pct_b = (arr[-1] - lower) / band_width if band_width > 0 else 0.5
        return {
            "upper": upper,
            "middle": middle,
            "lower": lower,
            "pct_b": pct_b,
            "bandwidth": band_width / middle * 100 if middle > 0 else 0,
        }


class KeltnerChannel(MultiInputIndicator):
    """Keltner Channel — EMA ± ATR multiplier."""

    def __init__(self, period: int = 20, atr_period: int = 10, multiplier: float = 1.5):
        super().__init__(period=period, atr_period=atr_period, multiplier=multiplier)
        self.period = period
        self.atr_period = atr_period
        self.multiplier = multiplier

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
    ) -> dict:
        if high is None or low is None or close is None:
            return {"upper": np.nan, "middle": np.nan, "lower": np.nan}
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        n = len(c)
        if n < max(self.period, self.atr_period + 1):
            return {"upper": np.nan, "middle": np.nan, "lower": np.nan}
        ema = EMA(self.period)
        middle = ema(c)
        # ATR
        tr = np.maximum(h[1:] - l[1:], np.abs(h[1:] - c[:-1]))
        tr = np.maximum(tr, np.abs(l[1:] - c[:-1]))
        atr_val = float(np.mean(tr[-self.atr_period:]))
        return {
            "upper": middle + self.multiplier * atr_val,
            "middle": middle,
            "lower": middle - self.multiplier * atr_val,
        }


class DonchianChannel(MultiInputIndicator):
    """Donchian Channel — highest high and lowest low over N periods."""

    def __init__(self, period: int = 20):
        super().__init__(period=period)
        self.period = period

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
    ) -> dict:
        if high is None or low is None:
            return {"upper": np.nan, "middle": np.nan, "lower": np.nan}
        h = self._to_array(high)
        l = self._to_array(low)
        if len(h) < self.period:
            return {"upper": np.nan, "middle": np.nan, "lower": np.nan}
        upper = float(np.max(h[-self.period:]))
        lower = float(np.min(l[-self.period:]))
        return {"upper": upper, "middle": (upper + lower) / 2, "lower": lower}


class IchimokuCloud(MultiInputIndicator):
    """Ichimoku Cloud — Tenkan, Kijun, Senkou A, Senkou B, Chikou."""

    def __init__(self, tenkan: int = 9, kijun: int = 26, senkou_b: int = 52):
        super().__init__(tenkan=tenkan, kijun=kijun, senkou_b=senkou_b)
        self.tenkan_period = tenkan
        self.kijun_period = kijun
        self.senkou_b_period = senkou_b

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
        close: Sequence[float] | np.ndarray | None = None,
    ) -> dict:
        if high is None or low is None or close is None:
            return {k: np.nan for k in ("tenkan", "kijun", "senkou_a", "senkou_b", "chikou")}
        h = self._to_array(high)
        l = self._to_array(low)
        c = self._to_array(close)
        n = len(c)
        result: dict = {}

        def midpoint(arr_h, arr_l, period):
            if len(arr_h) < period:
                return np.nan
            return float((np.max(arr_h[-period:]) + np.min(arr_l[-period:])) / 2)

        result["tenkan"] = midpoint(h, l, self.tenkan_period)
        result["kijun"] = midpoint(h, l, self.kijun_period)
        if not np.isnan(result["tenkan"]) and not np.isnan(result["kijun"]):
            result["senkou_a"] = (result["tenkan"] + result["kijun"]) / 2
        else:
            result["senkou_a"] = np.nan
        result["senkou_b"] = midpoint(h, l, self.senkou_b_period)
        result["chikou"] = float(c[-1]) if n > 0 else np.nan
        return result


class ParabolicSAR(MultiInputIndicator):
    """Parabolic SAR — trend-following stop-and-reverse."""

    def __init__(self, af_start: float = 0.02, af_step: float = 0.02, af_max: float = 0.2):
        super().__init__(af_start=af_start, af_step=af_step, af_max=af_max)
        self.af_start = af_start
        self.af_step = af_step
        self.af_max = af_max

    def __call__(
        self,
        high: Sequence[float] | np.ndarray | None = None,
        low: Sequence[float] | np.ndarray | None = None,
    ) -> dict:
        if high is None or low is None:
            return {"sar": np.nan, "trend": 0}
        h = self._to_array(high)
        l = self._to_array(low)
        n = len(h)
        if n < 2:
            return {"sar": np.nan, "trend": 0}

        sar = np.zeros(n)
        trend = np.ones(n, dtype=int)
        af = self.af_start
        ep = h[0]
        sar[0] = l[0]

        for i in range(1, n):
            sar[i] = sar[i - 1] + af * (ep - sar[i - 1])
            if trend[i - 1] == 1:  # uptrend
                if l[i] < sar[i]:
                    trend[i] = -1
                    sar[i] = ep
                    ep = l[i]
                    af = self.af_start
                else:
                    trend[i] = 1
                    if h[i] > ep:
                        ep = h[i]
                        af = min(af + self.af_step, self.af_max)
            else:  # downtrend
                if h[i] > sar[i]:
                    trend[i] = 1
                    sar[i] = ep
                    ep = h[i]
                    af = self.af_start
                else:
                    trend[i] = -1
                    if l[i] < ep:
                        ep = l[i]
                        af = min(af + self.af_step, self.af_max)

        return {"sar": float(sar[-1]), "trend": int(trend[-1])}


class Envelope(Indicator):
    """Moving Average Envelope — SMA ± percentage."""

    def __init__(self, period: int = 20, pct: float = 2.5):
        super().__init__(period=period, pct=pct)
        self.period = period
        self.pct = pct / 100.0
        self._sma = SMA(period)

    def __call__(self, data: Sequence[float] | np.ndarray) -> dict:
        middle = self._sma(data)
        if np.isnan(middle):
            return {"upper": np.nan, "middle": np.nan, "lower": np.nan}
        return {
            "upper": middle * (1 + self.pct),
            "middle": middle,
            "lower": middle * (1 - self.pct),
        }
