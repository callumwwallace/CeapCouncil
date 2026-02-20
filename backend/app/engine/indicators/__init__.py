"""Built-in indicator library.

Provides 30+ technical indicators that can be used directly in strategies.
All indicators operate on numpy arrays for performance and return numpy arrays.

Usage in strategies:
    from app.engine.indicators import SMA, EMA, RSI, MACD, BollingerBands

    class MyStrategy(StrategyBase):
        def on_init(self):
            self.sma_fast = SMA(period=10)
            self.sma_slow = SMA(period=50)
            self.rsi = RSI(period=14)

        def on_data(self, bar):
            closes = [b.close for b in self.history(length=50)]
            fast = self.sma_fast(closes)
            slow = self.sma_slow(closes)
            rsi_val = self.rsi(closes)
"""

from app.engine.indicators.overlays import (
    SMA, EMA, WMA, DEMA, TEMA, VWAP,
    BollingerBands, KeltnerChannel, DonchianChannel,
    IchimokuCloud, ParabolicSAR, Envelope,
)
from app.engine.indicators.oscillators import (
    RSI, MACD, Stochastic, CCI, WilliamsR,
    ROC, MOM, PPO, TSI, UltimateOscillator, Aroon,
    ADX,
)
from app.engine.indicators.volume import (
    OBV, MFI, ChaikinMoneyFlow, ForceIndex, VWAP as VolumeVWAP,
    AccumulationDistribution, EaseOfMovement,
)
from app.engine.indicators.statistics import (
    StdDev, LinearRegression, Correlation, ZScore, HurstExponent,
)
from app.engine.indicators.volatility import (
    ATR, NormalizedATR, HistoricalVolatility, GarmanKlass,
)

__all__ = [
    # Overlays
    "SMA", "EMA", "WMA", "DEMA", "TEMA", "VWAP",
    "BollingerBands", "KeltnerChannel", "DonchianChannel",
    "IchimokuCloud", "ParabolicSAR", "Envelope",
    # Oscillators
    "RSI", "MACD", "Stochastic", "CCI", "WilliamsR",
    "ROC", "MOM", "PPO", "TSI", "UltimateOscillator", "Aroon", "ADX",
    # Volume
    "OBV", "MFI", "ChaikinMoneyFlow", "ForceIndex", "VolumeVWAP",
    "AccumulationDistribution", "EaseOfMovement",
    # Statistics
    "StdDev", "LinearRegression", "Correlation", "ZScore", "HurstExponent",
    # Volatility
    "ATR", "NormalizedATR", "HistoricalVolatility", "GarmanKlass",
]
