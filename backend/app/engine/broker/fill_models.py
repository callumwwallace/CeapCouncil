"""Fill logic : determines when and at what price orders get filled.

Processes pending orders against incoming market data. Handles:
- Market orders: fill at next bar open (or configurable)
- Limit orders: fill when price crosses limit
- Stop orders: trigger when price crosses stop, then fill as market
- Stop-limit orders: trigger converts to limit, fills on subsequent bars
- Trailing stop: dynamic stop level
- MOO/MOC: fill at open/close
- Partial fills based on volume availability

When an IntrabarSimulator is provided, limit/stop/trailing-stop orders are
evaluated against a synthetic intrabar price path instead of raw OHLC. This
gives two key improvements:
  1. Correct fill sequencing — determines which of multiple pending orders
     (e.g. stop-loss vs take-profit) would have been hit first within a bar.
  2. More realistic fill prices — limit orders may fill at the actual
     intrabar touch price rather than always at the exact limit price.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.engine.broker.order import Order, OrderType, OrderSide
from app.engine.broker.slippage import SlippageModel, NoSlippage
from app.engine.broker.spread import SpreadModel, NoSpread
from app.engine.data.feed import BarData


@dataclass
class FillResult:
    """Result of attempting to fill an order against a bar."""
    filled: bool = False
    fill_price: float = 0.0
    fill_quantity: float = 0.0
    slippage: float = 0.0
    spread_cost: float = 0.0
    intrabar_tick_index: int | None = None


class FillModel:
    """Determines how orders are filled against bar data.

    The fill model checks if an order's conditions are met against the
    current bar and computes the fill price including spread and slippage.

    When an IntrabarSimulator is provided, limit/stop/trailing-stop orders
    use a synthetic intrabar price path for more realistic fill simulation.
    """

    def __init__(
        self,
        spread_model: SpreadModel | None = None,
        slippage_model: SlippageModel | None = None,
        fill_at_open: bool = True,
        max_fill_pct_of_volume: float = 0.1,
        intrabar_simulator: "IntrabarSimulator | None" = None,
    ):
        self.spread = spread_model or NoSpread()
        self.slippage = slippage_model or NoSlippage()
        self.fill_at_open = fill_at_open
        self.max_fill_pct = max_fill_pct_of_volume
        self._intrabar = intrabar_simulator

    def try_fill(self, order: Order, bar: BarData, avg_volume: float | None = None) -> FillResult:
        """Attempt to fill an order against the given bar.

        Returns a FillResult with filled=True if the order should fill.
        """
        handlers = {
            OrderType.MARKET: self._fill_market,
            OrderType.LIMIT: self._fill_limit,
            OrderType.STOP_MARKET: self._fill_stop_market,
            OrderType.STOP_LIMIT: self._fill_stop_limit,
            OrderType.TRAILING_STOP: self._fill_trailing_stop,
            OrderType.MARKET_ON_OPEN: self._fill_moo,
            OrderType.MARKET_ON_CLOSE: self._fill_moc,
        }
        handler = handlers.get(order.order_type)
        if not handler:
            return FillResult()

        if bar.volume <= 0:
            return FillResult()

        result = handler(order, bar, avg_volume)

        if result.filled and bar.volume > 0:
            max_qty = bar.volume * self.max_fill_pct
            if result.fill_quantity > max_qty:
                result.fill_quantity = max_qty

        return result

    def _get_intrabar_prices(self, bar: BarData) -> list[float] | None:
        """Generate intrabar price path if simulator is available."""
        if self._intrabar is None:
            return None
        return self._intrabar.simulate(
            open_price=bar.open,
            high_price=bar.high,
            low_price=bar.low,
            close_price=bar.close,
            volume=bar.volume,
        )

    @staticmethod
    def _find_cross(prices: list[float], target: float, direction: str) -> int | None:
        """Find the first tick index where price crosses a target level.

        direction: "above" (price rises to/above target) or "below" (price falls to/below target)
        """
        for i, price in enumerate(prices):
            if direction == "below" and price <= target:
                return i
            if direction == "above" and price >= target:
                return i
        return None

    def _apply_spread_and_slippage(
        self, base_price: float, order: Order, bar: BarData, avg_volume: float | None
    ) -> tuple[float, float, float]:
        """Apply spread and slippage to get the actual fill price.

        Returns: (fill_price, slippage_cost, spread_cost)
        """
        is_buy = order.is_buy

        if is_buy:
            spread_adjusted = self.spread.get_ask(base_price, bar, avg_volume)
        else:
            spread_adjusted = self.spread.get_bid(base_price, bar, avg_volume)
        spread_cost = abs(spread_adjusted - base_price)

        slip = self.slippage.compute_slippage(
            spread_adjusted, order.remaining_quantity, bar, is_buy
        )
        if is_buy:
            fill_price = spread_adjusted + slip
        else:
            fill_price = spread_adjusted - slip

        fill_price = max(bar.low, min(fill_price, bar.high))

        return fill_price, slip, spread_cost

    def _fill_market(self, order: Order, bar: BarData, avg_volume: float | None) -> FillResult:
        base_price = bar.open if self.fill_at_open else bar.close
        fill_price, slip, spread_cost = self._apply_spread_and_slippage(
            base_price, order, bar, avg_volume
        )
        return FillResult(
            filled=True,
            fill_price=fill_price,
            fill_quantity=order.remaining_quantity,
            slippage=slip,
            spread_cost=spread_cost,
        )

    def _fill_limit(self, order: Order, bar: BarData, avg_volume: float | None) -> FillResult:
        if order.limit_price is None:
            return FillResult()

        triggered = False
        tick_idx: int | None = None

        if order.is_buy:
            triggered = bar.low <= order.limit_price
        else:
            triggered = bar.high >= order.limit_price

        if not triggered:
            return FillResult()

        # Use intrabar path for tick-level sequencing
        intra_prices = self._get_intrabar_prices(bar)
        if intra_prices is not None:
            direction = "below" if order.is_buy else "above"
            tick_idx = self._find_cross(intra_prices, order.limit_price, direction)

        fill_price = order.limit_price
        fill_price, slip, spread_cost = self._apply_spread_and_slippage(
            fill_price, order, bar, avg_volume
        )
        if order.is_buy:
            fill_price = min(fill_price, order.limit_price)
        else:
            fill_price = max(fill_price, order.limit_price)

        return FillResult(
            filled=True,
            fill_price=fill_price,
            fill_quantity=order.remaining_quantity,
            slippage=slip,
            spread_cost=spread_cost,
            intrabar_tick_index=tick_idx,
        )

    def _fill_stop_market(self, order: Order, bar: BarData, avg_volume: float | None) -> FillResult:
        if order.stop_price is None:
            return FillResult()

        triggered = False
        if order.is_buy and bar.high >= order.stop_price:
            triggered = True
        elif not order.is_buy and bar.low <= order.stop_price:
            triggered = True

        if not triggered:
            return FillResult()

        tick_idx: int | None = None
        intra_prices = self._get_intrabar_prices(bar)
        if intra_prices is not None:
            direction = "above" if order.is_buy else "below"
            tick_idx = self._find_cross(intra_prices, order.stop_price, direction)

        base_price = order.stop_price
        fill_price, slip, spread_cost = self._apply_spread_and_slippage(
            base_price, order, bar, avg_volume
        )
        return FillResult(
            filled=True,
            fill_price=fill_price,
            fill_quantity=order.remaining_quantity,
            slippage=slip,
            spread_cost=spread_cost,
            intrabar_tick_index=tick_idx,
        )

    def _fill_stop_limit(self, order: Order, bar: BarData, avg_volume: float | None) -> FillResult:
        if order.stop_price is None or order.limit_price is None:
            return FillResult()

        intra_prices = self._get_intrabar_prices(bar)

        if not order.metadata.get("_stop_triggered"):
            stop_triggered = False
            if order.is_buy and bar.high >= order.stop_price:
                stop_triggered = True
            elif not order.is_buy and bar.low <= order.stop_price:
                stop_triggered = True

            if stop_triggered:
                order.metadata["_stop_triggered"] = True

                # With intrabar: check if the limit can also fill within this same bar
                # after the stop triggers (stop tick < limit tick)
                if intra_prices is not None:
                    stop_dir = "above" if order.is_buy else "below"
                    stop_tick = self._find_cross(intra_prices, order.stop_price, stop_dir)
                    if stop_tick is not None:
                        limit_dir = "below" if order.is_buy else "above"
                        remaining = intra_prices[stop_tick:]
                        limit_tick = self._find_cross(remaining, order.limit_price, limit_dir)
                        if limit_tick is not None:
                            tick_idx = stop_tick + limit_tick
                            fill_price = order.limit_price
                            fill_price, slip, spread_cost = self._apply_spread_and_slippage(
                                fill_price, order, bar, avg_volume
                            )
                            if order.is_buy:
                                fill_price = min(fill_price, order.limit_price)
                            else:
                                fill_price = max(fill_price, order.limit_price)
                            return FillResult(
                                filled=True,
                                fill_price=fill_price,
                                fill_quantity=order.remaining_quantity,
                                slippage=slip,
                                spread_cost=spread_cost,
                                intrabar_tick_index=tick_idx,
                            )
            return FillResult()

        # Stop already triggered on a previous bar — evaluate as limit
        triggered = False
        if order.is_buy and bar.low <= order.limit_price:
            triggered = True
        elif not order.is_buy and bar.high >= order.limit_price:
            triggered = True

        if not triggered:
            return FillResult()

        tick_idx: int | None = None
        if intra_prices is not None:
            direction = "below" if order.is_buy else "above"
            tick_idx = self._find_cross(intra_prices, order.limit_price, direction)

        fill_price = order.limit_price
        fill_price, slip, spread_cost = self._apply_spread_and_slippage(
            fill_price, order, bar, avg_volume
        )
        if order.is_buy:
            fill_price = min(fill_price, order.limit_price)
        else:
            fill_price = max(fill_price, order.limit_price)

        return FillResult(
            filled=True,
            fill_price=fill_price,
            fill_quantity=order.remaining_quantity,
            slippage=slip,
            spread_cost=spread_cost,
            intrabar_tick_index=tick_idx,
        )

    def _fill_trailing_stop(self, order: Order, bar: BarData, avg_volume: float | None) -> FillResult:
        if order.side == OrderSide.SELL:
            stop_price = order.update_trail(bar.high)
        else:
            stop_price = order.update_trail(bar.low)

        if stop_price is None:
            return FillResult()

        triggered = False
        if order.side == OrderSide.SELL and bar.low <= stop_price:
            triggered = True
        elif order.side == OrderSide.BUY and bar.high >= stop_price:
            triggered = True

        if not triggered:
            return FillResult()

        tick_idx: int | None = None
        intra_prices = self._get_intrabar_prices(bar)
        if intra_prices is not None:
            direction = "below" if order.side == OrderSide.SELL else "above"
            tick_idx = self._find_cross(intra_prices, stop_price, direction)

        fill_price, slip, spread_cost = self._apply_spread_and_slippage(
            stop_price, order, bar, avg_volume
        )
        return FillResult(
            filled=True,
            fill_price=fill_price,
            fill_quantity=order.remaining_quantity,
            slippage=slip,
            spread_cost=spread_cost,
            intrabar_tick_index=tick_idx,
        )

    def _fill_moo(self, order: Order, bar: BarData, avg_volume: float | None) -> FillResult:
        fill_price, slip, spread_cost = self._apply_spread_and_slippage(
            bar.open, order, bar, avg_volume
        )
        return FillResult(
            filled=True,
            fill_price=fill_price,
            fill_quantity=order.remaining_quantity,
            slippage=slip,
            spread_cost=spread_cost,
        )

    def _fill_moc(self, order: Order, bar: BarData, avg_volume: float | None) -> FillResult:
        fill_price, slip, spread_cost = self._apply_spread_and_slippage(
            bar.close, order, bar, avg_volume
        )
        return FillResult(
            filled=True,
            fill_price=fill_price,
            fill_quantity=order.remaining_quantity,
            slippage=slip,
            spread_cost=spread_cost,
        )


DefaultFillModel = FillModel
