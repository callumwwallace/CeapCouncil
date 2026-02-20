"""Algorithm Framework — composable Alpha / Portfolio / Risk / Execution pipeline.

Modeled after QuantConnect's Algorithm Framework:
- AlphaModel: emits signals (insights)
- PortfolioModel: converts insights to target weights
- ExecutionModel: converts target weights to orders
- RiskModel: vetoes or adjusts orders

Usage:
    from app.engine.framework import (
        AlphaModel, Insight, InsightDirection,
        PortfolioModel, ExecutionModel, RiskModel,
        FrameworkStrategy,
    )

    class MyAlpha(AlphaModel):
        def generate_insights(self, bar, history):
            return [Insight("BTC-USD", InsightDirection.UP, magnitude=0.8)]

    class MyPortfolio(PortfolioModel):
        def get_target_weights(self, insights, portfolio):
            weights = {}
            for ins in insights:
                if ins.direction == InsightDirection.UP:
                    weights[ins.symbol] = 1.0 / len(insights)
            return weights

    strategy = FrameworkStrategy(
        alpha=MyAlpha(),
        portfolio=MyPortfolio(),
    )
"""

from app.engine.framework.models import (
    AlphaModel,
    PortfolioModel,
    ExecutionModel,
    RiskModel,
    Insight,
    InsightDirection,
)
from app.engine.framework.strategy import FrameworkStrategy

__all__ = [
    "AlphaModel", "PortfolioModel", "ExecutionModel", "RiskModel",
    "Insight", "InsightDirection", "FrameworkStrategy",
]
