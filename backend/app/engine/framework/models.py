"""Framework model interfaces — Alpha, Portfolio, Execution, Risk."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from app.engine.data.feed import BarData


class InsightDirection(str, Enum):
    UP = "up"
    DOWN = "down"
    FLAT = "flat"


@dataclass
class Insight:
    """A trading signal produced by an AlphaModel."""
    symbol: str
    direction: InsightDirection
    magnitude: float = 1.0
    confidence: float = 1.0
    period_bars: int | None = None
    source: str = ""
    generated_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "direction": self.direction.value,
            "magnitude": self.magnitude,
            "confidence": self.confidence,
            "period_bars": self.period_bars,
            "source": self.source,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
        }


class AlphaModel(ABC):
    """Generates trading insights/signals.

    Override generate_insights() to produce signals from market data.
    """

    def __init__(self, name: str = ""):
        self.name = name or self.__class__.__name__

    @abstractmethod
    def generate_insights(
        self,
        bar: BarData,
        history: list[BarData],
        current_insights: list[Insight] | None = None,
    ) -> list[Insight]:
        """Generate new insights from the current bar and history.

        Args:
            bar: Current bar data
            history: Recent bar history
            current_insights: Active insights from previous bars

        Returns:
            List of new insights
        """
        ...

    def on_securities_changed(self, added: list[str], removed: list[str]) -> None:
        """Called when the universe changes."""
        pass


class PortfolioModel(ABC):
    """Converts insights into target portfolio weights.

    Override get_target_weights() to define position sizing.
    """

    def __init__(self, name: str = ""):
        self.name = name or self.__class__.__name__

    @abstractmethod
    def get_target_weights(
        self,
        insights: list[Insight],
        portfolio_value: float,
        current_weights: dict[str, float] | None = None,
    ) -> dict[str, float]:
        """Convert insights into target weights.

        Args:
            insights: Active trading insights
            portfolio_value: Current portfolio value
            current_weights: Current position weights

        Returns:
            Dict of symbol -> target weight (0.0 to 1.0, negative for short)
        """
        ...


class ExecutionModel(ABC):
    """Converts target weights into actual orders.

    Override execute() to define order generation logic.
    """

    def __init__(self, name: str = ""):
        self.name = name or self.__class__.__name__

    @abstractmethod
    def execute(
        self,
        target_weights: dict[str, float],
        current_weights: dict[str, float],
        portfolio_value: float,
        current_prices: dict[str, float],
    ) -> list[dict]:
        """Generate orders to move from current to target weights.

        Args:
            target_weights: Desired position weights
            current_weights: Current position weights
            portfolio_value: Portfolio value for sizing
            current_prices: Current prices for quantity calculation

        Returns:
            List of order dicts: {"symbol", "quantity", "order_type"}
        """
        ...


class RiskModel(ABC):
    """Adjusts or vetoes orders based on risk constraints.

    Override adjust_orders() to apply risk controls.
    """

    def __init__(self, name: str = ""):
        self.name = name or self.__class__.__name__

    @abstractmethod
    def adjust_orders(
        self,
        orders: list[dict],
        portfolio_value: float,
        current_weights: dict[str, float],
    ) -> list[dict]:
        """Adjust or filter orders based on risk rules.

        Returns the adjusted order list (may remove, resize, or modify orders).
        """
        ...


# ── Built-in implementations ──────────────────────────────────────────────

class EqualWeightPortfolio(PortfolioModel):
    """Equal-weight across all UP insights, zero for FLAT/DOWN."""

    def get_target_weights(
        self,
        insights: list[Insight],
        portfolio_value: float,
        current_weights: dict[str, float] | None = None,
    ) -> dict[str, float]:
        long_symbols = [i.symbol for i in insights if i.direction == InsightDirection.UP]
        short_symbols = [i.symbol for i in insights if i.direction == InsightDirection.DOWN]
        weights: dict[str, float] = {}
        if long_symbols:
            w = 1.0 / (len(long_symbols) + len(short_symbols)) if (len(long_symbols) + len(short_symbols)) > 0 else 0
            for s in long_symbols:
                weights[s] = w
            for s in short_symbols:
                weights[s] = -w
        return weights


class InsightWeightedPortfolio(PortfolioModel):
    """Weight by insight magnitude × confidence."""

    def get_target_weights(
        self,
        insights: list[Insight],
        portfolio_value: float,
        current_weights: dict[str, float] | None = None,
    ) -> dict[str, float]:
        raw: dict[str, float] = {}
        for ins in insights:
            if ins.direction == InsightDirection.FLAT:
                raw[ins.symbol] = 0.0
                continue
            sign = 1.0 if ins.direction == InsightDirection.UP else -1.0
            raw[ins.symbol] = sign * ins.magnitude * ins.confidence

        total = sum(abs(v) for v in raw.values())
        if total == 0:
            return raw
        return {s: v / total for s, v in raw.items()}


class ImmediateExecution(ExecutionModel):
    """Simple execution — market orders to reach target weights."""

    def __init__(self, min_weight_change: float = 0.01):
        super().__init__()
        self.min_weight_change = min_weight_change

    def execute(
        self,
        target_weights: dict[str, float],
        current_weights: dict[str, float],
        portfolio_value: float,
        current_prices: dict[str, float],
    ) -> list[dict]:
        orders = []
        all_symbols = set(target_weights.keys()) | set(current_weights.keys())
        for symbol in all_symbols:
            target_w = target_weights.get(symbol, 0.0)
            current_w = current_weights.get(symbol, 0.0)
            delta_w = target_w - current_w
            if abs(delta_w) < self.min_weight_change:
                continue
            price = current_prices.get(symbol, 0)
            if price <= 0:
                continue
            dollar_amount = delta_w * portfolio_value
            quantity = dollar_amount / price
            orders.append({
                "symbol": symbol,
                "quantity": quantity,
                "order_type": "market",
                "target_weight": target_w,
            })
        return orders


class MaxDrawdownRisk(RiskModel):
    """Vetoes all orders if portfolio drawdown exceeds threshold."""

    def __init__(self, max_drawdown_pct: float = 20.0):
        super().__init__()
        self.max_drawdown_pct = max_drawdown_pct
        self._peak_value = 0.0

    def adjust_orders(
        self,
        orders: list[dict],
        portfolio_value: float,
        current_weights: dict[str, float],
    ) -> list[dict]:
        self._peak_value = max(self._peak_value, portfolio_value)
        if self._peak_value > 0:
            drawdown = (self._peak_value - portfolio_value) / self._peak_value * 100
            if drawdown >= self.max_drawdown_pct:
                return []
        return orders


class MaxPositionRisk(RiskModel):
    """Caps individual position weights."""

    def __init__(self, max_weight: float = 0.25):
        super().__init__()
        self.max_weight = max_weight

    def adjust_orders(
        self,
        orders: list[dict],
        portfolio_value: float,
        current_weights: dict[str, float],
    ) -> list[dict]:
        adjusted = []
        for order in orders:
            target_w = order.get("target_weight", 0)
            if abs(target_w) > self.max_weight:
                scale = self.max_weight / abs(target_w)
                order["quantity"] = order["quantity"] * scale
                order["target_weight"] = target_w * scale
            adjusted.append(order)
        return adjusted
