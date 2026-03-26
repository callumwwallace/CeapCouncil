"""Portfolio manager : tracks cash, positions, equity, and margin.

Central hub for position tracking, P&L computation, and equity recording.
Supports margin, buying power, and forced liquidation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from app.engine.broker.order import OrderSide
from app.engine.core.events import FillEvent
from app.engine.portfolio.position import Position, TradeRecord

if TYPE_CHECKING:
    from app.engine.portfolio.currency import CurrencyManager


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
        currency_manager: CurrencyManager | None = None,
    ):
        self.initial_cash = initial_cash
        self.cash = initial_cash
        self.margin = margin_config or MarginConfig()
        self.base_currency = base_currency
        self._currency_mgr = currency_manager

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

        # Funding rate tracking (crypto perpetuals)
        self.total_funding_paid: float = 0.0
        self.total_funding_received: float = 0.0
        self._funding_log: list[dict] = []

    def _to_base(self, amount: float, symbol: str) -> float:
        """Convert an amount denominated in a symbol's currency to base currency."""
        if not self._currency_mgr:
            return amount
        currency = self._currency_mgr.get_currency_for_symbol(symbol)
        return self._currency_mgr.to_base(amount, currency)

    @property
    def equity(self) -> float:
        total = self.cash
        for symbol, pos in self._positions.items():
            if not pos.is_flat:
                price = self._current_prices.get(symbol, pos.avg_cost)
                total += self._to_base(abs(pos.quantity) * price, symbol)
        return total

    @property
    def unrealized_pnl(self) -> float:
        total = 0.0
        for symbol, pos in self._positions.items():
            price = self._current_prices.get(symbol, pos.avg_cost)
            total += self._to_base(pos.unrealized_pnl(price), symbol)
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

        # Update position (P&L tracked in local currency)
        completed_trades = pos.update(
            quantity=qty,
            price=fill.fill_price,
            commission=fill.commission,
            slippage=fill.slippage,
            spread_cost=0.0,
            timestamp=fill.timestamp,
        )

        # Update cash — convert to base currency when trading foreign assets
        cost_local = fill.fill_price * fill.quantity
        cost_base = self._to_base(cost_local, fill.symbol)
        commission_base = self._to_base(fill.commission, fill.symbol)

        if fill.side == "buy":
            self.cash -= cost_base + commission_base
        else:
            self.cash += cost_base - commission_base

        # Also update per-currency balances for audit
        if self._currency_mgr:
            self._currency_mgr.process_fill(
                fill.symbol, fill.side, fill.quantity,
                fill.fill_price, fill.commission,
            )

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
        """Record current equity for the equity curve.

        For daily data each bar gets its own point.  For intraday data we
        update the last point in-place while we're still on the same calendar
        day, and only append a new point when the day changes.  This prevents
        100k-bar backtests from creating massive arrays while still giving the
        frontend a complete daily equity curve.
        """
        is_eod = timestamp.hour == 0 and timestamp.minute == 0 and timestamp.second == 0
        date_str = timestamp.strftime("%Y-%m-%d") if is_eod else timestamp.strftime("%Y-%m-%dT%H:%M:%S")
        current_day = timestamp.strftime("%Y-%m-%d")

        new_point = EquityPoint(
            date=date_str,
            equity=round(self.equity, 2),
            cash=round(self.cash, 2),
            margin_used=round(self._margin_used, 2),
        )

        if not is_eod and self.equity_curve:
            last = self.equity_curve[-1]
            # Same calendar day → update in place instead of appending
            if last.date[:10] == current_day:
                last.date = date_str
                last.equity = new_point.equity
                last.cash = new_point.cash
                last.margin_used = new_point.margin_used
                return

        self.equity_curve.append(new_point)

    def _update_margin(self) -> None:
        """Recalculate margin usage (in base currency)."""
        total_margin = 0.0
        for symbol, pos in self._positions.items():
            if not pos.is_flat:
                price = self._current_prices.get(symbol, pos.avg_cost)
                position_value = self._to_base(abs(pos.quantity) * price, symbol)
                if pos.is_short:
                    total_margin += position_value * (self.margin.initial_margin_pct / 100) * 1.5
                else:
                    total_margin += position_value * (self.margin.initial_margin_pct / 100)
        self._margin_used = total_margin

    def check_margin_call(self, timestamp: datetime) -> bool:
        """Check if equity has fallen below maintenance margin. Returns True if margin call.

        Maintenance margin is a percentage of total open position *market value*,
        not a percentage of margin already posted.  Calculating it from
        _margin_used (which is itself a fraction of position value) would produce
        a maintenance requirement that is far too small.
        """
        if not self.margin.enabled:
            return False

        total_position_value = sum(
            self._to_base(abs(pos.quantity) * self._current_prices.get(symbol, pos.avg_cost), symbol)
            for symbol, pos in self._positions.items()
            if not pos.is_flat
        )
        # Fall back to deriving position value from recorded margin when positions
        # haven't been priced yet (e.g. state set directly in tests or before first tick).
        if total_position_value == 0 and self._margin_used > 0:
            total_position_value = self._margin_used / (self.margin.initial_margin_pct / 100)
        maintenance_req = total_position_value * (self.margin.maintenance_margin_pct / 100)
        if self.equity < maintenance_req:
            self._margin_calls.append({
                "timestamp": timestamp.isoformat(),
                "equity": round(self.equity, 2),
                "maintenance_required": round(maintenance_req, 2),
                "total_position_value": round(total_position_value, 2),
                "margin_used": round(self._margin_used, 2),
            })
            return True
        return False

    def accrue_borrow_fees(self, timestamp: datetime) -> float:
        """Accrue daily short borrow fees (in base currency)."""
        if not self.margin.enabled:
            return 0.0

        daily_rate = self.margin.short_borrow_rate_annual / 365 / 100
        total_fee = 0.0
        for symbol, pos in self._positions.items():
            if pos.is_short:
                price = self._current_prices.get(symbol, pos.avg_cost)
                position_value = self._to_base(abs(pos.quantity) * price, symbol)
                fee = position_value * daily_rate
                total_fee += fee
                self.cash -= fee
        return total_fee

    def accrue_funding(
        self,
        timestamp: datetime,
        annual_rate_pct: float,
        payments_per_day: int = 3,
    ) -> float:
        """Accrue perpetual funding costs/revenue for all open positions.

        Funding rate mechanics (standard across Binance/Bybit/etc.):
          - Positive rate → longs pay shorts
          - Negative rate → shorts pay longs

        Args:
            annual_rate_pct: Annualized funding rate (e.g. 10.0 for 10%).
            payments_per_day: Number of funding intervals per day (3 for 8h).

        Returns:
            Net funding amount (negative = paid, positive = received).
        """
        if not self._positions:
            return 0.0

        per_payment_rate = (annual_rate_pct / 100) / (365 * payments_per_day)
        net_funding = 0.0

        for symbol, pos in self._positions.items():
            if pos.is_flat:
                continue

            price = self._current_prices.get(symbol, pos.avg_cost)
            notional = self._to_base(abs(pos.quantity) * price, symbol)
            payment = notional * per_payment_rate

            # Funding mechanics (Binance/Bybit standard):
            #   annual_rate_pct > 0  →  longs pay shorts
            #   annual_rate_pct < 0  →  shorts pay longs
            # payment = notional * per_payment_rate, so its sign already
            # follows annual_rate_pct.  No conditional needed.
            if pos.is_long:
                cost = -payment   # positive rate → pay; negative rate → receive
            else:
                cost = payment    # positive rate → receive; negative rate → pay

            self.cash += cost
            net_funding += cost

            if abs(cost) > 0.001:
                self._funding_log.append({
                    "timestamp": timestamp.isoformat(),
                    "symbol": symbol,
                    "side": "long" if pos.is_long else "short",
                    "notional": round(notional, 2),
                    "rate_per_payment": round(per_payment_rate * 100, 6),
                    "amount": round(cost, 4),
                })

        if net_funding < 0:
            self.total_funding_paid += abs(net_funding)
        else:
            self.total_funding_received += net_funding

        return net_funding

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
