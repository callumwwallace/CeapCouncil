"""Futures continuous contract rolling logic.

Handles front-month to back-month contract transitions with
configurable roll methods (calendar, volume, open interest).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

import numpy as np
import pandas as pd


class RollMethod(Enum):
    CALENDAR = "calendar"           # Roll N days before expiry
    VOLUME = "volume"               # Roll when back-month volume exceeds front
    OPEN_INTEREST = "open_interest" # Roll when back-month OI exceeds front


class AdjustmentMethod(Enum):
    RATIO = "ratio"       # Multiply by ratio of prices at roll
    DIFFERENCE = "difference"  # Add difference at roll point
    NONE = "none"         # No adjustment (absolute prices)


@dataclass
class ContractSpec:
    """Specification for a single futures contract."""
    symbol: str             # e.g. "ESZ24" (S&P E-mini Dec 2024)
    root: str               # e.g. "ES"
    expiry: datetime
    multiplier: float = 1.0
    data: pd.DataFrame | None = None


@dataclass
class RollConfig:
    """Configuration for contract rolling."""
    roll_method: RollMethod = RollMethod.CALENDAR
    roll_days_before_expiry: int = 5   # For calendar roll
    adjustment: AdjustmentMethod = AdjustmentMethod.RATIO
    gap_fill: bool = True              # Fill gaps between contracts


class ContinuousContractBuilder:
    """Builds a continuous price series from individual contract data.

    Usage:
        builder = ContinuousContractBuilder(config)
        builder.add_contract(ContractSpec(...))
        continuous = builder.build()
    """

    def __init__(self, config: RollConfig | None = None):
        self.config = config or RollConfig()
        self._contracts: list[ContractSpec] = []

    def add_contract(self, contract: ContractSpec) -> None:
        self._contracts.append(contract)
        self._contracts.sort(key=lambda c: c.expiry)

    def build(self) -> pd.DataFrame:
        """Build a continuous price series from the loaded contracts.

        Returns:
            DataFrame with OHLCV columns, adjusted for contract rolls.
        """
        if not self._contracts:
            return pd.DataFrame()

        # Filter contracts with data
        contracts = [c for c in self._contracts if c.data is not None and not c.data.empty]
        if not contracts:
            return pd.DataFrame()

        if len(contracts) == 1:
            return contracts[0].data.copy()

        # Determine roll dates
        roll_points = self._compute_roll_dates(contracts)

        # Stitch contracts together
        segments: list[pd.DataFrame] = []
        adjustment_factor = 1.0 if self.config.adjustment == AdjustmentMethod.RATIO else 0.0

        for i, (contract, roll_date) in enumerate(zip(contracts, roll_points)):
            data = contract.data.copy()

            if i < len(contracts) - 1:
                # Trim to roll date
                segment = data[data.index <= roll_date]
            else:
                # Last contract: use all remaining data
                segment = data
                if i > 0 and roll_points[i - 1] is not None:
                    segment = data[data.index > roll_points[i - 1]]

            if segment.empty:
                continue

            # Apply cumulative adjustment
            price_cols = [c for c in ["Open", "High", "Low", "Close"] if c in segment.columns]
            if self.config.adjustment == AdjustmentMethod.RATIO and adjustment_factor != 1.0:
                for col in price_cols:
                    segment[col] = segment[col] * adjustment_factor
            elif self.config.adjustment == AdjustmentMethod.DIFFERENCE and adjustment_factor != 0.0:
                for col in price_cols:
                    segment[col] = segment[col] + adjustment_factor

            segments.append(segment)

            # Compute adjustment for next contract
            if i < len(contracts) - 1 and roll_date is not None:
                next_data = contracts[i + 1].data
                if next_data is not None and not next_data.empty:
                    # Get closing prices on roll date
                    front_close = self._get_close_on_date(data, roll_date)
                    back_close = self._get_close_on_date(next_data, roll_date)

                    if front_close and back_close and back_close != 0:
                        if self.config.adjustment == AdjustmentMethod.RATIO:
                            adjustment_factor *= front_close / back_close
                        elif self.config.adjustment == AdjustmentMethod.DIFFERENCE:
                            adjustment_factor += front_close - back_close

        if not segments:
            return pd.DataFrame()

        result = pd.concat(segments)
        result = result[~result.index.duplicated(keep="last")]
        result = result.sort_index()
        return result

    def _compute_roll_dates(self, contracts: list[ContractSpec]) -> list[datetime | None]:
        """Compute the date to roll from each contract to the next."""
        roll_dates = []
        for i, contract in enumerate(contracts):
            if i == len(contracts) - 1:
                roll_dates.append(None)  # Last contract — no roll
            else:
                if self.config.roll_method == RollMethod.CALENDAR:
                    roll_date = contract.expiry - timedelta(days=self.config.roll_days_before_expiry)
                    roll_dates.append(roll_date)
                elif self.config.roll_method == RollMethod.VOLUME:
                    # Find date where back-month volume exceeds front
                    roll_date = self._find_volume_crossover(contract, contracts[i + 1])
                    roll_dates.append(roll_date or (contract.expiry - timedelta(days=self.config.roll_days_before_expiry)))
                else:
                    roll_dates.append(contract.expiry - timedelta(days=self.config.roll_days_before_expiry))
        return roll_dates

    def _find_volume_crossover(self, front: ContractSpec, back: ContractSpec) -> datetime | None:
        """Find the date where back-month volume first exceeds front-month."""
        if front.data is None or back.data is None:
            return None
        common = front.data.index.intersection(back.data.index)
        for date in common:
            front_vol = front.data.loc[date, "Volume"] if "Volume" in front.data.columns else 0
            back_vol = back.data.loc[date, "Volume"] if "Volume" in back.data.columns else 0
            if back_vol > front_vol:
                return date
        return None

    @staticmethod
    def _get_close_on_date(data: pd.DataFrame, date: datetime) -> float | None:
        if date in data.index:
            return float(data.loc[date, "Close"]) if "Close" in data.columns else None
        # Find nearest date
        idx = data.index.get_indexer([date], method="ffill")
        if idx[0] >= 0:
            return float(data.iloc[idx[0]]["Close"]) if "Close" in data.columns else None
        return None

    def get_roll_schedule(self) -> list[dict]:
        """Return the computed roll schedule for inspection."""
        contracts = [c for c in self._contracts if c.data is not None]
        if not contracts:
            return []
        roll_dates = self._compute_roll_dates(contracts)
        return [
            {
                "from_contract": contracts[i].symbol,
                "to_contract": contracts[i + 1].symbol if i + 1 < len(contracts) else None,
                "roll_date": rd.isoformat() if rd else None,
                "expiry": contracts[i].expiry.isoformat(),
            }
            for i, rd in enumerate(roll_dates)
        ]
