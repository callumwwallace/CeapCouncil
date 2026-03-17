"""Position tracking : per-symbol position with cost basis and P&L.

Supports FIFO trade matching for entry/exit recording.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class TradeRecord:
    """A completed round-trip trade (entry + exit)."""
    symbol: str
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    size: float
    pnl: float
    pnl_pct: float
    commission: float
    trade_type: str  # "LONG" or "SHORT"
    slippage_cost: float = 0.0
    spread_cost: float = 0.0

    def to_dict(self) -> dict:
        return {
            "entry_date": self.entry_date,
            "exit_date": self.exit_date,
            "entry_price": round(self.entry_price, 4),
            "exit_price": round(self.exit_price, 4),
            "size": self.size,
            "pnl": round(self.pnl, 2),
            "pnl_pct": round(self.pnl_pct, 4),
            "commission": round(self.commission, 4),
            "type": self.trade_type,
            "slippage_cost": round(self.slippage_cost, 4),
            "spread_cost": round(self.spread_cost, 4),
        }


@dataclass
class PositionLot:
    """A single lot in a position (for FIFO matching)."""
    quantity: float
    price: float
    timestamp: datetime
    commission: float = 0.0


@dataclass
class Position:
    """Tracks a position in a single symbol.

    Uses FIFO matching: the first shares bought are the first sold.
    """
    symbol: str
    quantity: float = 0.0
    avg_cost: float = 0.0
    total_commission: float = 0.0
    realized_pnl: float = 0.0
    total_slippage: float = 0.0
    total_spread_cost: float = 0.0

    # FIFO lots
    _lots: list[PositionLot] = field(default_factory=list)

    # Completed trades
    trades: list[TradeRecord] = field(default_factory=list)

    @property
    def is_long(self) -> bool:
        return self.quantity > 0

    @property
    def is_short(self) -> bool:
        return self.quantity < 0

    @property
    def is_flat(self) -> bool:
        return abs(self.quantity) < 1e-9

    @property
    def market_value(self) -> float:
        """Unsigned market value at avg cost."""
        return abs(self.quantity) * self.avg_cost

    def unrealized_pnl(self, current_price: float) -> float:
        if self.is_flat:
            return 0.0
        if self.is_long:
            return (current_price - self.avg_cost) * self.quantity
        else:
            return (self.avg_cost - current_price) * abs(self.quantity)

    def update(
        self,
        quantity: float,
        price: float,
        commission: float,
        slippage: float,
        spread_cost: float,
        timestamp: datetime,
    ) -> list[TradeRecord]:
        """Update position with a fill. Positive quantity = buy, negative = sell.

        Returns any completed trades from this fill.
        """
        self.total_commission += commission
        self.total_slippage += slippage
        self.total_spread_cost += spread_cost

        completed_trades: list[TradeRecord] = []

        if self.is_flat or (quantity > 0 and self.quantity >= 0) or (quantity < 0 and self.quantity <= 0):
            # Increasing or opening a position
            self._add_lot(quantity, price, commission, timestamp)
        else:
            # Reducing or reversing a position
            completed_trades = self._close_lots(quantity, price, commission, slippage, spread_cost, timestamp)

        return completed_trades

    def _add_lot(self, quantity: float, price: float, commission: float, timestamp: datetime) -> None:
        """Add to position (same direction)."""
        total_cost = abs(self.quantity) * self.avg_cost + abs(quantity) * price
        self.quantity += quantity
        if abs(self.quantity) > 1e-9:
            self.avg_cost = total_cost / abs(self.quantity)
        self._lots.append(PositionLot(
            quantity=quantity,
            price=price,
            timestamp=timestamp,
            commission=commission,
        ))

    def _close_lots(
        self,
        quantity: float,
        price: float,
        commission: float,
        slippage: float,
        spread_cost: float,
        timestamp: datetime,
    ) -> list[TradeRecord]:
        """Close lots FIFO and return completed trade records."""
        trades: list[TradeRecord] = []
        remaining = abs(quantity)
        exit_date = timestamp.strftime("%Y-%m-%d")

        while remaining > 1e-9 and self._lots:
            lot = self._lots[0]
            lot_qty = abs(lot.quantity)
            close_qty = min(remaining, lot_qty)

            # Compute PnL
            if lot.quantity > 0:
                # Closing long position
                pnl = (price - lot.price) * close_qty
                trade_type = "LONG"
            else:
                # Closing short position
                pnl = (lot.price - price) * close_qty
                trade_type = "SHORT"

            pnl_net = pnl - lot.commission * (close_qty / lot_qty) - commission * (close_qty / abs(quantity))

            entry_price = lot.price
            pnl_pct = (pnl_net / (abs(close_qty) * entry_price) * 100) if entry_price > 0 else 0

            trades.append(TradeRecord(
                symbol=self.symbol,
                entry_date=lot.timestamp.strftime("%Y-%m-%d"),
                exit_date=exit_date,
                entry_price=entry_price,
                exit_price=price,
                size=close_qty,
                pnl=round(pnl_net, 2),
                pnl_pct=round(pnl_pct, 4),
                commission=round(lot.commission * (close_qty / lot_qty) + commission * (close_qty / abs(quantity)), 4),
                trade_type=trade_type,
                slippage_cost=round(slippage * (close_qty / abs(quantity)), 4),
                spread_cost=round(spread_cost * (close_qty / abs(quantity)), 4),
            ))

            self.realized_pnl += pnl_net
            remaining -= close_qty

            if close_qty >= lot_qty - 1e-9:
                self._lots.pop(0)
            else:
                lot.quantity = lot.quantity - close_qty if lot.quantity > 0 else lot.quantity + close_qty

        self.quantity += quantity

        if abs(self.quantity) < 1e-9:
            self.quantity = 0.0
            self.avg_cost = 0.0
            self._lots.clear()
        elif self._lots:
            total_cost = sum(abs(l.quantity) * l.price for l in self._lots)
            total_qty = sum(abs(l.quantity) for l in self._lots)
            self.avg_cost = total_cost / total_qty if total_qty > 0 else 0

        if abs(self.quantity) > 1e-9 and not self._lots and remaining > 1e-9:
            self._add_lot(
                remaining if quantity > 0 else -remaining,
                price, commission * (remaining / abs(quantity)),
                timestamp,
            )

        self.trades.extend(trades)
        return trades
