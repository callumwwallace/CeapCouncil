"""QuantGuild Backtesting Engine — event-driven execution, order state machine,
spread/slippage models, margin/multi-currency portfolio, analytics, deterministic reproducibility.
"""

from app.engine.core.engine import Engine
from app.engine.core.events import (
    Event,
    MarketDataEvent,
    OrderEvent,
    FillEvent,
    TimerEvent,
    SignalEvent,
)
from app.engine.core.clock import SimulationClock
from app.engine.broker.order import Order, OrderSide, OrderType, OrderStatus, TimeInForce
from app.engine.broker.broker import BrokerSimulator
from app.engine.broker.fill_models import FillModel, DefaultFillModel
from app.engine.broker.slippage import SlippageModel, PercentageSlippage, VolumeAwareSlippage
from app.engine.broker.spread import SpreadModel, VolatilitySpread, FixedSpread
from app.engine.portfolio.portfolio import Portfolio
from app.engine.portfolio.position import Position
from app.engine.strategy.base import StrategyBase
from app.engine.data.feed import DataFeed, BarData
from app.engine.analytics.metrics import compute_metrics
from app.engine.adapters.backtrader_adapter import BacktraderEngine

__all__ = [
    "Engine",
    "Event", "MarketDataEvent", "OrderEvent", "FillEvent", "TimerEvent", "SignalEvent",
    "SimulationClock",
    "Order", "OrderSide", "OrderType", "OrderStatus", "TimeInForce",
    "BrokerSimulator",
    "FillModel", "DefaultFillModel",
    "SlippageModel", "PercentageSlippage", "VolumeAwareSlippage",
    "SpreadModel", "VolatilitySpread", "FixedSpread",
    "Portfolio", "Position",
    "StrategyBase",
    "DataFeed", "BarData",
    "compute_metrics",
    "BacktraderEngine",
]
