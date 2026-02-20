"""Risk manager: pre-trade and real-time risk checks.

Validates orders against risk limits before submission.
Monitors portfolio for breach conditions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.engine.broker.order import Order, OrderSide
from app.engine.portfolio.portfolio import Portfolio


@dataclass
class RiskLimits:
    """Configurable risk limits."""
    max_position_pct: float = 100.0       # Max % of equity in single position
    max_portfolio_leverage: float = 1.0   # Max total leverage
    max_drawdown_pct: float = 50.0        # Stop trading at this drawdown
    max_daily_loss_pct: float = 10.0      # Max daily loss %
    max_open_positions: int = 50          # Max number of open positions
    max_order_value_pct: float = 100.0    # Max single order as % of equity
    min_cash_reserve_pct: float = 0.0     # Keep this % in cash
    max_sector_exposure_pct: float = 100.0  # Max % in one sector

    # Stop-loss and take-profit (portfolio level)
    stop_loss_pct: float | None = None
    take_profit_pct: float | None = None

    # Pattern Day Trading (US equities)
    pdt_enabled: bool = False
    pdt_threshold: float = 25000.0   # PDT limit threshold


@dataclass
class DayTradeRecord:
    """Tracks a single day trade (open and close same day)."""
    symbol: str
    date: str
    side: str


@dataclass
class RiskViolation:
    """Record of a risk limit breach."""
    timestamp: datetime
    rule: str
    description: str
    action: str  # "reject", "warn", "liquidate"


class RiskManager:
    """Enforces risk limits on order submission and monitors portfolio."""

    def __init__(self, limits: RiskLimits | None = None):
        self.limits = limits or RiskLimits()
        self.violations: list[RiskViolation] = []
        self._daily_pnl_start: float | None = None
        self._current_day: str | None = None
        self._trading_halted: bool = False

        # PDT tracking
        self._day_trades: list[DayTradeRecord] = []
        self._open_positions_today: dict[str, str] = {}  # symbol -> open_date

    @property
    def is_halted(self) -> bool:
        return self._trading_halted

    def check_order(self, order: Order, portfolio: Portfolio, current_price: float) -> tuple[bool, str]:
        """Pre-trade risk check. Returns (allowed, reason)."""
        if self._trading_halted:
            return False, "Trading halted due to risk limit breach"

        equity = portfolio.equity
        if equity <= 0:
            return False, "Portfolio equity is zero or negative"

        # Max order value check
        order_value = order.quantity * current_price
        order_pct = order_value / equity * 100
        if order_pct > self.limits.max_order_value_pct:
            return False, f"Order value ({order_pct:.1f}%) exceeds max ({self.limits.max_order_value_pct}%)"

        # Max position check
        current_qty = portfolio.get_position_quantity(order.symbol)
        new_qty = current_qty + (order.quantity if order.is_buy else -order.quantity)
        new_value = abs(new_qty) * current_price
        position_pct = new_value / equity * 100
        if position_pct > self.limits.max_position_pct:
            return False, f"Position size ({position_pct:.1f}%) exceeds max ({self.limits.max_position_pct}%)"

        # Cash reserve check
        if not portfolio.margin.enabled:
            min_cash = equity * self.limits.min_cash_reserve_pct / 100
            if order.is_buy and portfolio.cash - order_value < min_cash:
                return False, f"Insufficient cash after reserve ({self.limits.min_cash_reserve_pct}%)"

        # Max open positions check
        open_positions = sum(1 for s, p in portfolio._positions.items() if not p.is_flat)
        if not portfolio.has_position(order.symbol) and open_positions >= self.limits.max_open_positions:
            return False, f"Max open positions ({self.limits.max_open_positions}) reached"

        # Pattern Day Trading check
        if self.limits.pdt_enabled and equity < self.limits.pdt_threshold:
            recent_day_trades = self._count_recent_day_trades(5)
            # Would this close a same-day position (making it a day trade)?
            if portfolio.has_position(order.symbol):
                current_qty = portfolio.get_position_quantity(order.symbol)
                is_closing = (order.is_buy and current_qty < 0) or (not order.is_buy and current_qty > 0)
                open_date = self._open_positions_today.get(order.symbol, "")
                if is_closing and open_date == self._current_day:
                    if recent_day_trades >= 3:
                        return False, f"PDT violation: {recent_day_trades} day trades in 5 days (limit 3 for accounts < ${self.limits.pdt_threshold:,.0f})"

        return True, ""

    def record_position_open(self, symbol: str, date: str) -> None:
        """Track when a position is opened for PDT tracking."""
        self._open_positions_today[symbol] = date

    def record_day_trade(self, symbol: str, date: str, side: str) -> None:
        """Record a completed day trade."""
        self._day_trades.append(DayTradeRecord(symbol=symbol, date=date, side=side))

    def _count_recent_day_trades(self, days: int = 5) -> int:
        """Count day trades in the last N trading days."""
        if not self._day_trades or not self._current_day:
            return 0
        from datetime import datetime, timedelta
        try:
            current = datetime.strptime(self._current_day, "%Y-%m-%d")
            cutoff = current - timedelta(days=days)
            cutoff_str = cutoff.strftime("%Y-%m-%d")
            return sum(1 for dt in self._day_trades if dt.date >= cutoff_str)
        except ValueError:
            return 0

    @property
    def day_trade_count(self) -> int:
        """Total day trades recorded."""
        return len(self._day_trades)

    def on_bar(self, portfolio: Portfolio, timestamp: datetime) -> list[RiskViolation]:
        """Monitor portfolio on each bar. Returns any violations."""
        violations: list[RiskViolation] = []
        day_str = timestamp.strftime("%Y-%m-%d")

        # Track daily P&L
        if self._current_day != day_str:
            self._daily_pnl_start = portfolio.equity
            self._current_day = day_str

        # Max drawdown check
        drawdown = (portfolio.initial_cash - portfolio.equity) / portfolio.initial_cash * 100
        if drawdown > 0 and drawdown >= self.limits.max_drawdown_pct:
            v = RiskViolation(
                timestamp=timestamp,
                rule="max_drawdown",
                description=f"Drawdown {drawdown:.1f}% >= limit {self.limits.max_drawdown_pct}%",
                action="liquidate",
            )
            violations.append(v)
            self._trading_halted = True

        # Daily loss check
        if self._daily_pnl_start and self._daily_pnl_start > 0:
            daily_loss = (self._daily_pnl_start - portfolio.equity) / self._daily_pnl_start * 100
            if daily_loss > 0 and daily_loss >= self.limits.max_daily_loss_pct:
                v = RiskViolation(
                    timestamp=timestamp,
                    rule="max_daily_loss",
                    description=f"Daily loss {daily_loss:.1f}% >= limit {self.limits.max_daily_loss_pct}%",
                    action="warn",
                )
                violations.append(v)

        # Portfolio-level stop loss
        if self.limits.stop_loss_pct is not None:
            total_loss = (portfolio.initial_cash - portfolio.equity) / portfolio.initial_cash * 100
            if total_loss >= self.limits.stop_loss_pct:
                v = RiskViolation(
                    timestamp=timestamp,
                    rule="stop_loss",
                    description=f"Portfolio loss {total_loss:.1f}% hit stop loss",
                    action="liquidate",
                )
                violations.append(v)
                self._trading_halted = True

        # Portfolio-level take profit
        if self.limits.take_profit_pct is not None:
            total_gain = portfolio.total_return_pct
            if total_gain >= self.limits.take_profit_pct:
                v = RiskViolation(
                    timestamp=timestamp,
                    rule="take_profit",
                    description=f"Portfolio gain {total_gain:.1f}% hit take profit",
                    action="liquidate",
                )
                violations.append(v)
                self._trading_halted = True

        self.violations.extend(violations)
        return violations
