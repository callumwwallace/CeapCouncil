"""FrameworkStrategy — composable strategy using Alpha/Portfolio/Execution/Risk pipeline."""

from __future__ import annotations

from typing import Any

from app.engine.data.feed import BarData
from app.engine.strategy.base import StrategyBase
from app.engine.framework.models import (
    AlphaModel,
    PortfolioModel,
    ExecutionModel,
    RiskModel,
    Insight,
    InsightDirection,
    EqualWeightPortfolio,
    ImmediateExecution,
)


class FrameworkStrategy(StrategyBase):
    """Strategy composed of pluggable Alpha, Portfolio, Execution, and Risk models.

    Usage:
        strategy = FrameworkStrategy(
            alpha=MyAlphaModel(),
            portfolio=EqualWeightPortfolio(),
            execution=ImmediateExecution(),
            risk=MaxDrawdownRisk(max_drawdown_pct=15),
        )
    """

    def __init__(
        self,
        alpha: AlphaModel | None = None,
        portfolio: PortfolioModel | None = None,
        execution: ExecutionModel | None = None,
        risk: RiskModel | None = None,
        rebalance_every: int = 1,
        params: dict[str, Any] | None = None,
    ):
        super().__init__(params=params)
        self._alpha = alpha
        self._portfolio_model = portfolio or EqualWeightPortfolio()
        self._execution_model = execution or ImmediateExecution()
        self._risk_model = risk
        self._rebalance_every = rebalance_every
        self._active_insights: list[Insight] = []
        self._bars_since_rebalance = 0

    def on_init(self) -> None:
        pass

    def on_data(self, bar: BarData) -> None:
        if self._alpha is None:
            return

        # Generate new insights
        history = self.history(bar.symbol, length=100)
        new_insights = self._alpha.generate_insights(bar, history, self._active_insights)

        # Update active insights
        if new_insights:
            insight_map = {i.symbol: i for i in self._active_insights}
            for ins in new_insights:
                ins.generated_at = self.time
                insight_map[ins.symbol] = ins
            self._active_insights = list(insight_map.values())

        # Remove expired insights
        self._active_insights = [
            i for i in self._active_insights
            if i.period_bars is None or
            (i.generated_at and (self.bar_index - getattr(i, '_start_bar', self.bar_index)) < i.period_bars)
        ]

        # Rebalance check
        self._bars_since_rebalance += 1
        if self._bars_since_rebalance < self._rebalance_every:
            return
        self._bars_since_rebalance = 0

        if not self._active_insights:
            return

        # Portfolio model: insights -> target weights
        portfolio_value = self.portfolio.equity
        current_weights = self._get_current_weights(bar)
        target_weights = self._portfolio_model.get_target_weights(
            self._active_insights, portfolio_value, current_weights
        )

        # Execution model: weights -> orders
        current_prices = {bar.symbol: bar.close}
        for b in history:
            current_prices[b.symbol] = b.close

        orders = self._execution_model.execute(
            target_weights, current_weights, portfolio_value, current_prices
        )

        # Risk model: filter/adjust orders
        if self._risk_model and orders:
            orders = self._risk_model.adjust_orders(orders, portfolio_value, current_weights)

        # Submit orders
        for order_spec in orders:
            qty = order_spec.get("quantity", 0)
            if abs(qty) > 1e-9:
                self.market_order(order_spec["symbol"], qty)

    def _get_current_weights(self, bar: BarData) -> dict[str, float]:
        """Get current portfolio weights."""
        equity = self.portfolio.equity
        if equity <= 0:
            return {}
        weights: dict[str, float] = {}
        for symbol in self.portfolio._positions:
            pos = self.portfolio._positions[symbol]
            if not pos.is_flat:
                history = self.history(symbol, length=1)
                price = history[-1].close if history else bar.close
                value = pos.quantity * price
                weights[symbol] = value / equity
        return weights
