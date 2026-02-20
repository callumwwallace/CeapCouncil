"""Portfolio construction: weight allocation and rebalancing for multi-asset portfolios."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import numpy as np
import pandas as pd


class WeightingScheme(Enum):
    EQUAL = "equal"
    INVERSE_VOLATILITY = "inverse_volatility"
    RISK_PARITY = "risk_parity"
    MARKET_CAP = "market_cap"
    CUSTOM = "custom"


@dataclass
class PortfolioConstraints:
    """Constraints applied during portfolio construction."""
    max_position_pct: float = 100.0   # Max weight for a single asset (%)
    min_position_pct: float = 0.0     # Min weight for a single asset (%)
    max_sector_pct: float = 100.0     # Max weight for a single sector (%)
    max_turnover_pct: float = 100.0   # Max portfolio turnover per rebalance (%)
    long_only: bool = True            # No short weights


@dataclass
class RebalanceConfig:
    """Configuration for rebalancing frequency."""
    frequency: str = "monthly"  # "daily", "weekly", "monthly", "quarterly", "never"
    day_of_week: int = 0        # 0=Monday (for weekly)
    day_of_month: int = 1       # 1st of month (for monthly)

    def should_rebalance(self, current_date: pd.Timestamp, last_rebalance: pd.Timestamp | None) -> bool:
        if last_rebalance is None:
            return True
        if self.frequency == "never":
            return False
        if self.frequency == "daily":
            return current_date.date() != last_rebalance.date()
        if self.frequency == "weekly":
            return (current_date - last_rebalance).days >= 7
        if self.frequency == "monthly":
            return current_date.month != last_rebalance.month or current_date.year != last_rebalance.year
        if self.frequency == "quarterly":
            q_now = (current_date.month - 1) // 3
            q_last = (last_rebalance.month - 1) // 3
            return q_now != q_last or current_date.year != last_rebalance.year
        return False


class PortfolioConstructor:
    """Computes target weights for a portfolio of assets."""

    def __init__(
        self,
        scheme: WeightingScheme = WeightingScheme.EQUAL,
        constraints: PortfolioConstraints | None = None,
        rebalance: RebalanceConfig | None = None,
        custom_weights: dict[str, float] | None = None,
        sector_map: dict[str, str] | None = None,
    ):
        self.scheme = scheme
        self.constraints = constraints or PortfolioConstraints()
        self.rebalance = rebalance or RebalanceConfig()
        self.custom_weights = custom_weights or {}
        self.sector_map = sector_map or {}
        self._last_rebalance: pd.Timestamp | None = None
        self._current_weights: dict[str, float] = {}

    def compute_weights(
        self,
        symbols: list[str],
        returns_matrix: pd.DataFrame | None = None,
    ) -> dict[str, float]:
        """Compute target weights for the given symbols.

        Args:
            symbols: List of asset symbols.
            returns_matrix: DataFrame of historical returns (columns = symbols).
                Required for inverse_volatility and risk_parity.

        Returns:
            Dict mapping symbol -> target weight (0 to 1, summing to ~1).
        """
        if not symbols:
            return {}

        n = len(symbols)

        if self.scheme == WeightingScheme.EQUAL:
            raw = {s: 1.0 / n for s in symbols}

        elif self.scheme == WeightingScheme.INVERSE_VOLATILITY:
            if returns_matrix is None or returns_matrix.empty:
                raw = {s: 1.0 / n for s in symbols}
            else:
                vols = returns_matrix[symbols].std()
                vols = vols.replace(0, np.nan).fillna(vols.mean())
                inv_vol = 1.0 / vols
                total = inv_vol.sum()
                raw = {s: float(inv_vol[s] / total) if total > 0 else 1.0 / n for s in symbols}

        elif self.scheme == WeightingScheme.RISK_PARITY:
            if returns_matrix is None or returns_matrix.empty or len(symbols) < 2:
                raw = {s: 1.0 / n for s in symbols}
            else:
                cov = returns_matrix[symbols].cov()
                # Naive risk parity: w_i proportional to 1/sigma_i, then normalize
                vols = np.sqrt(np.diag(cov.values))
                vols[vols == 0] = np.mean(vols[vols > 0]) if np.any(vols > 0) else 1.0
                inv_vol = 1.0 / vols
                weights = inv_vol / inv_vol.sum()
                raw = {s: float(weights[i]) for i, s in enumerate(symbols)}

        elif self.scheme == WeightingScheme.CUSTOM:
            total = sum(self.custom_weights.get(s, 0) for s in symbols) or 1.0
            raw = {s: self.custom_weights.get(s, 0) / total for s in symbols}

        else:
            raw = {s: 1.0 / n for s in symbols}

        return self._apply_constraints(raw, symbols)

    def _apply_constraints(self, weights: dict[str, float], symbols: list[str]) -> dict[str, float]:
        """Apply position and sector constraints, then renormalize."""
        c = self.constraints
        result = {}

        for s in symbols:
            w = weights.get(s, 0)
            if c.long_only:
                w = max(0, w)
            w = min(w, c.max_position_pct / 100)
            w = max(w, c.min_position_pct / 100)
            result[s] = w

        # Sector constraints
        if c.max_sector_pct < 100 and self.sector_map:
            sector_totals: dict[str, float] = {}
            for s, w in result.items():
                sector = self.sector_map.get(s, "unknown")
                sector_totals[sector] = sector_totals.get(sector, 0) + w

            for sector, total in sector_totals.items():
                if total > c.max_sector_pct / 100:
                    scale = (c.max_sector_pct / 100) / total
                    for s in result:
                        if self.sector_map.get(s, "unknown") == sector:
                            result[s] *= scale

        # Renormalize to sum to 1
        total = sum(result.values())
        if total > 0:
            result = {s: w / total for s, w in result.items()}

        self._current_weights = result
        return result

    def should_rebalance(self, current_date: pd.Timestamp) -> bool:
        return self.rebalance.should_rebalance(current_date, self._last_rebalance)

    def mark_rebalanced(self, date: pd.Timestamp) -> None:
        self._last_rebalance = date

    @property
    def current_weights(self) -> dict[str, float]:
        return self._current_weights.copy()
