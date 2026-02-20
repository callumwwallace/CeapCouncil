"""Portfolio manager : tracks cash, positions, equity, and margin.

Central hub for position tracking, P&L computation, and equity recording.
Supports margin, buying power, and forced liquidation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.engine.broker.order import OrderSide
from app.engine.core.events import FillEvent
from app.engine.portfolio.position import Position, TradeRecord


@dataclass
class MarginConfig:
    """Margin configuration for the portfolio."""
    enabled: bool = False
    initial_margin_pct: float = 50.0    # 50% for equities, lower for crypto
    maintenance_margin_pct: float = 25.0
    max_leverage: float = 2.0           # 2x leverage
    short_borrow_rate_annual: float = 2.0  # 2% annual borrow fee


@dataclass
class EquityPoint:
    """Single point on the equity curve."""
    date: str
    equity: float
    cash: float = 0.0
    margin_used: float = 0.0


class Portfolio:
    """Manages cash, positions, equity curve, and margin.

    Acts as the central accounting system for the backtester.
    Receives fills from the broker and updates positions accordingly.
    """

    def __init__(
        self,
        initial_cash: float = 100000.0,
        margin_config: MarginConfig | None = None,
        base_currency: str = "USD",
    ):
        self.initial_cash = initial_cash
        self.cash = initial_cash
        self.margin = margin_config or MarginConfig()
        self.base_currency = base_currency

        # Position tracking
        self._positions: dict[str, Position] = {}

        # Completed trades (all symbols)
        self.trades: list[TradeRecord] = []

        # Equity curve
        self.equity_curve: list[EquityPoint] = []

        # Current prices for mark-to-market
        self._current_prices: dict[str, float] = {}

        # Multi-currency cash balances
        self._currency_balances: dict[str, float] = {base_currency: initial_cash}

        # Margin tracking
        self._margin_used: float = 0.0
        self._margin_calls: list[dict] = []

    @property
    def equity(self) -> float:
        """Total portfolio value = cash + unrealized P&L."""
        return self.cash + self.unrealized_pnl

    @property
    def unrealized_pnl(self) -> float:
        total = 0.0
        for symbol, pos in self._positions.items():
            price = self._current_prices.get(symbol, pos.avg_cost)
            total += pos.unrealized_pnl(price)
        return total

    @property
    def realized_pnl(self) -> float:
        return sum(pos.realized_pnl for pos in self._positions.values())

    @property
    def total_pnl(self) -> float:
        return self.equity - self.initial_cash

    @property
    def total_return_pct(self) -> float:
        if self.initial_cash <= 0:
            return 0.0
        return (self.equity - self.initial_cash) / self.initial_cash * 100

    @property
    def buying_power(self) -> float:
        """Available buying power considering margin."""
        if not self.margin.enabled:
            return max(self.cash, 0)
        return max(self.cash * self.margin.max_leverage - self._margin_used, 0)

    @property
    def margin_used(self) -> float:
        return self._margin_used

    @property
    def margin_available(self) -> float:
        if not self.margin.enabled:
            return self.cash
        return self.equity - self._margin_used * (self.margin.maintenance_margin_pct / 100)

    def get_position(self, symbol: str) -> Position:
        if symbol not in self._positions:
            self._positions[symbol] = Position(symbol=symbol)
        return self._positions[symbol]

    def has_position(self, symbol: str) -> bool:
        pos = self._positions.get(symbol)
        return pos is not None and not pos.is_flat

    def get_position_quantity(self, symbol: str) -> float:
        pos = self._positions.get(symbol)
        return pos.quantity if pos else 0.0

    def on_fill(self, fill: FillEvent) -> list[TradeRecord]:
        """Process a fill event : update position and cash."""
        pos = self.get_position(fill.symbol)

        # Determine signed quantity
        qty = fill.quantity if fill.side == "buy" else -fill.quantity

        # Update position
        completed_trades = pos.update(
            quantity=qty,
            price=fill.fill_price,
            commission=fill.commission,
            slippage=fill.slippage,
            spread_cost=0.0,
            timestamp=fill.timestamp,
        )

        # Update cash
        cost = fill.fill_price * fill.quantity
        if fill.side == "buy":
            self.cash -= cost + fill.commission
        else:
            self.cash += cost - fill.commission

        # Update margin
        if self.margin.enabled:
            self._update_margin()

        # Record completed trades
        self.trades.extend(completed_trades)
        return completed_trades

    def update_prices(self, prices: dict[str, float]) -> None:
        """Mark positions to market with new prices."""
        self._current_prices.update(prices)

    def record_equity(self, timestamp: datetime) -> None:
        """Record current equity for the equity curve."""
        self.equity_curve.append(EquityPoint(
            date=timestamp.strftime("%Y-%m-%d"),
            equity=round(self.equity, 2),
            cash=round(self.cash, 2),
            margin_used=round(self._margin_used, 2),
        ))

    def _update_margin(self) -> None:
        """Recalculate margin usage."""
        total_margin = 0.0
        for symbol, pos in self._positions.items():
            if not pos.is_flat:
                price = self._current_prices.get(symbol, pos.avg_cost)
                position_value = abs(pos.quantity) * price
                if pos.is_short:
                    total_margin += position_value * (self.margin.initial_margin_pct / 100) * 1.5
                else:
                    total_margin += position_value * (self.margin.initial_margin_pct / 100)
        self._margin_used = total_margin

    def check_margin_call(self, timestamp: datetime) -> bool:
        """Check if equity has fallen below maintenance margin. Returns True if margin call."""
        if not self.margin.enabled:
            return False

        maintenance_req = self._margin_used * (self.margin.maintenance_margin_pct / 100)
        if self.equity < maintenance_req:
            self._margin_calls.append({
                "timestamp": timestamp.isoformat(),
                "equity": round(self.equity, 2),
                "maintenance_required": round(maintenance_req, 2),
                "margin_used": round(self._margin_used, 2),
            })
            return True
        return False

    def accrue_borrow_fees(self, timestamp: datetime) -> float:
        """Accrue daily short borrow fees."""
        if not self.margin.enabled:
            return 0.0

        daily_rate = self.margin.short_borrow_rate_annual / 365 / 100
        total_fee = 0.0
        for symbol, pos in self._positions.items():
            if pos.is_short:
                price = self._current_prices.get(symbol, pos.avg_cost)
                position_value = abs(pos.quantity) * price
                fee = position_value * daily_rate
                total_fee += fee
                self.cash -= fee
        return total_fee

    def get_results_dict(self) -> dict:
        """Return results compatible with existing frontend format."""
        equity_curve = [{"date": p.date, "equity": p.equity} for p in self.equity_curve]
        trades_list = [t.to_dict() for t in self.trades]
        return {
            "equity_curve": equity_curve,
            "trades": trades_list,
            "final_value": round(self.equity, 2),
            "initial_capital": self.initial_cash,
            "total_return_pct": round(self.total_return_pct, 4),
        }
