"""Portfolio construction: weighting schemes and rebalancing.

Supports: Equal Weight, Inverse Volatility, Risk Parity.
Enforces position constraints and sector exposure limits.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class WeightingScheme(Enum):
    EQUAL = "equal"
    INVERSE_VOLATILITY = "inverse_volatility"
    RISK_PARITY = "risk_parity"
    CUSTOM = "custom"


@dataclass
class PortfolioConstraints:
    """Constraints on portfolio construction."""
    max_position_pct: float = 25.0          # Max % per position
    min_position_pct: float = 0.0           # Min % per position (0 = exclude)
    max_total_positions: int = 50
    max_sector_pct: float = 40.0            # Max % in one sector
    max_leverage: float = 1.0               # Total portfolio leverage


class PortfolioConstructor:
    """Compute target weights for a portfolio of symbols."""

    def __init__(
        self,
        scheme: WeightingScheme = WeightingScheme.EQUAL,
        constraints: PortfolioConstraints | None = None,
    ):
        self.scheme = scheme
        self.constraints = constraints or PortfolioConstraints()

    def compute_weights(
        self,
        symbols: list[str],
        volatilities: dict[str, float] | None = None,
        covariance_matrix: np.ndarray | None = None,
        custom_weights: dict[str, float] | None = None,
    ) -> dict[str, float]:
        """Compute target weights for each symbol.

        Args:
            symbols: List of symbols to include
            volatilities: Annualized volatility per symbol (for inv-vol and risk parity)
            covariance_matrix: Covariance matrix (for risk parity)
            custom_weights: User-provided weights (for custom scheme)

        Returns:
            Dict of symbol -> weight (0.0 to 1.0, summing to <= max_leverage)
        """
        if not symbols:
            return {}

        n = len(symbols)

        if self.scheme == WeightingScheme.EQUAL:
            raw = {s: 1.0 / n for s in symbols}

        elif self.scheme == WeightingScheme.INVERSE_VOLATILITY:
            if not volatilities:
                raw = {s: 1.0 / n for s in symbols}
            else:
                inv_vols = {}
                for s in symbols:
                    vol = volatilities.get(s, 0)
                    inv_vols[s] = 1.0 / max(vol, 0.001)
                total = sum(inv_vols.values())
                raw = {s: v / total for s, v in inv_vols.items()} if total > 0 else {s: 1.0 / n for s in symbols}

        elif self.scheme == WeightingScheme.RISK_PARITY:
            if covariance_matrix is not None and len(covariance_matrix) == n:
                raw = self._risk_parity(symbols, covariance_matrix)
            elif volatilities:
                # Simplified: use inverse volatility as approximation
                inv_vols = {}
                for s in symbols:
                    vol = volatilities.get(s, 0)
                    inv_vols[s] = 1.0 / max(vol, 0.001)
                total = sum(inv_vols.values())
                raw = {s: v / total for s, v in inv_vols.items()} if total > 0 else {s: 1.0 / n for s in symbols}
            else:
                raw = {s: 1.0 / n for s in symbols}

        elif self.scheme == WeightingScheme.CUSTOM:
            raw = custom_weights or {s: 1.0 / n for s in symbols}

        else:
            raw = {s: 1.0 / n for s in symbols}

        # Apply constraints
        return self._apply_constraints(raw)

    def _risk_parity(self, symbols: list[str], cov: np.ndarray) -> dict[str, float]:
        """Simple risk parity: equal risk contribution using Newton's method."""
        n = len(symbols)
        w = np.ones(n) / n

        for _ in range(100):
            sigma = float(np.sqrt(w @ cov @ w))
            if sigma < 1e-10:
                break
            marginal_risk = cov @ w / sigma
            risk_contrib = w * marginal_risk
            target = sigma / n

            for i in range(n):
                if marginal_risk[i] > 1e-10:
                    w[i] *= target / risk_contrib[i]

            w = w / w.sum()

        return {symbols[i]: round(float(w[i]), 6) for i in range(n)}

    def _apply_constraints(self, weights: dict[str, float]) -> dict[str, float]:
        """Apply position limits and normalize."""
        max_w = self.constraints.max_position_pct / 100
        min_w = self.constraints.min_position_pct / 100
        max_lev = self.constraints.max_leverage

        # Clip weights
        clipped = {}
        for s, w in weights.items():
            w = max(min_w, min(w, max_w))
            if w > 0:
                clipped[s] = w

        # Limit number of positions
        if len(clipped) > self.constraints.max_total_positions:
            sorted_w = sorted(clipped.items(), key=lambda x: x[1], reverse=True)
            clipped = dict(sorted_w[:self.constraints.max_total_positions])

        # Normalize to max leverage
        total = sum(clipped.values())
        if total > max_lev:
            factor = max_lev / total
            clipped = {s: w * factor for s, w in clipped.items()}

        return {s: round(w, 6) for s, w in clipped.items()}
