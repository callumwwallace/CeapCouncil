"""Corporate actions engine: adjusts historical data for splits, dividends, and delistings.

Applies retroactive price/volume adjustments for accurate backtests.
Crypto-aware: supports token migrations and hard forks.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

import numpy as np
import pandas as pd


class ActionType(Enum):
    SPLIT = "split"
    REVERSE_SPLIT = "reverse_split"
    DIVIDEND = "dividend"
    DELIST = "delist"
    TOKEN_MIGRATION = "token_migration"  # Crypto: old token -> new token
    HARD_FORK = "hard_fork"  # Crypto: chain fork


@dataclass
class CorporateAction:
    """A single corporate action event."""
    symbol: str
    action_type: ActionType
    date: datetime
    ratio: float | None = None  # For splits: e.g. 4.0 means 4:1 split
    amount: float | None = None  # For dividends: cash per share
    new_symbol: str | None = None  # For token migrations
    metadata: dict[str, Any] = field(default_factory=dict)


class CorporateActionsManager:
    """Manages corporate actions and applies adjustments to historical data."""

    def __init__(self):
        self._actions: dict[str, list[CorporateAction]] = {}  # symbol -> actions
        self._delisted: dict[str, datetime] = {}  # symbol -> delist date
        self._migrations: dict[str, str] = {}  # old_symbol -> new_symbol

    def add_action(self, action: CorporateAction) -> None:
        if action.symbol not in self._actions:
            self._actions[action.symbol] = []
        self._actions[action.symbol].append(action)
        self._actions[action.symbol].sort(key=lambda a: a.date)

        if action.action_type == ActionType.DELIST:
            self._delisted[action.symbol] = action.date
        if action.action_type in (ActionType.TOKEN_MIGRATION, ActionType.HARD_FORK):
            if action.new_symbol:
                self._migrations[action.symbol] = action.new_symbol

    def add_split(self, symbol: str, date: datetime, ratio: float) -> None:
        self.add_action(CorporateAction(symbol=symbol, action_type=ActionType.SPLIT, date=date, ratio=ratio))

    def add_reverse_split(self, symbol: str, date: datetime, ratio: float) -> None:
        self.add_action(CorporateAction(symbol=symbol, action_type=ActionType.REVERSE_SPLIT, date=date, ratio=ratio))

    def add_dividend(self, symbol: str, date: datetime, amount: float) -> None:
        self.add_action(CorporateAction(symbol=symbol, action_type=ActionType.DIVIDEND, date=date, amount=amount))

    def mark_delisted(self, symbol: str, date: datetime) -> None:
        self.add_action(CorporateAction(symbol=symbol, action_type=ActionType.DELIST, date=date))

    def add_token_migration(self, old_symbol: str, new_symbol: str, date: datetime, ratio: float = 1.0) -> None:
        self.add_action(CorporateAction(
            symbol=old_symbol, action_type=ActionType.TOKEN_MIGRATION,
            date=date, ratio=ratio, new_symbol=new_symbol,
        ))

    def get_actions(self, symbol: str) -> list[CorporateAction]:
        return self._actions.get(symbol, [])

    def is_delisted(self, symbol: str) -> bool:
        return symbol in self._delisted

    def get_migrated_symbol(self, symbol: str) -> str | None:
        return self._migrations.get(symbol)

    def adjust_for_splits(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Retroactively adjust prices and volume for stock splits.
        
        For a 4:1 split on date D:
        - All prices before D are divided by 4
        - All volumes before D are multiplied by 4
        This makes the entire series look as if the split had always been in effect.
        """
        actions = [a for a in self.get_actions(symbol) 
                   if a.action_type in (ActionType.SPLIT, ActionType.REVERSE_SPLIT)]
        if not actions:
            return df

        df = df.copy()
        price_cols = [c for c in ["Open", "High", "Low", "Close", "Adj Close"] if c in df.columns]
        vol_col = "Volume" if "Volume" in df.columns else None

        for action in actions:
            ratio = action.ratio or 1.0
            if action.action_type == ActionType.REVERSE_SPLIT:
                ratio = 1.0 / ratio  # Reverse: prices go UP, volume goes DOWN

            mask = df.index < action.date
            if not mask.any():
                continue

            for col in price_cols:
                df.loc[mask, col] = df.loc[mask, col] / ratio
            if vol_col:
                df.loc[mask, vol_col] = df.loc[mask, vol_col] * ratio

        return df

    def adjust_for_dividends(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Backward-adjust prices for cash dividends.
        
        For a $1 dividend on date D with close price $100:
        - Adjustment factor = 1 - (dividend / close_before_ex)
        - All prices before D are multiplied by this factor
        This removes the artificial price drop on ex-dividend dates.
        """
        actions = [a for a in self.get_actions(symbol) if a.action_type == ActionType.DIVIDEND]
        if not actions:
            return df

        df = df.copy()
        price_cols = [c for c in ["Open", "High", "Low", "Close", "Adj Close"] if c in df.columns]

        # Apply in reverse chronological order (most recent first)
        for action in reversed(actions):
            amount = action.amount or 0.0
            if amount <= 0:
                continue

            mask = df.index < action.date
            if not mask.any():
                continue

            # Get the close price just before the ex-dividend date
            pre_ex = df.loc[mask, "Close"].iloc[-1] if "Close" in df.columns else None
            if pre_ex is None or pre_ex <= 0:
                continue

            adj_factor = 1.0 - (amount / pre_ex)
            if adj_factor <= 0 or adj_factor > 1:
                continue  # Sanity check

            for col in price_cols:
                df.loc[mask, col] = df.loc[mask, col] * adj_factor

        return df

    def apply_delisting(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Truncate data at delist date and optionally set final price to 0."""
        if symbol not in self._delisted:
            return df
        
        delist_date = self._delisted[symbol]
        df = df.copy()
        # Keep data up to and including delist date
        df = df[df.index <= delist_date]
        return df

    def apply_all(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Apply all corporate actions to a DataFrame in the correct order.
        
        Order: splits first (changes share count), then dividends (price adjustment),
        then delisting (truncation).
        """
        df = self.adjust_for_splits(df, symbol)
        df = self.adjust_for_dividends(df, symbol)
        df = self.apply_delisting(df, symbol)
        return df

    def to_dict(self) -> dict:
        """Serialize all actions for storage/export."""
        result = {}
        for symbol, actions in self._actions.items():
            result[symbol] = [
                {
                    "action_type": a.action_type.value,
                    "date": a.date.isoformat(),
                    "ratio": a.ratio,
                    "amount": a.amount,
                    "new_symbol": a.new_symbol,
                    "metadata": a.metadata,
                }
                for a in actions
            ]
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "CorporateActionsManager":
        """Deserialize from dict."""
        mgr = cls()
        for symbol, actions in data.items():
            for a in actions:
                mgr.add_action(CorporateAction(
                    symbol=symbol,
                    action_type=ActionType(a["action_type"]),
                    date=datetime.fromisoformat(a["date"]),
                    ratio=a.get("ratio"),
                    amount=a.get("amount"),
                    new_symbol=a.get("new_symbol"),
                    metadata=a.get("metadata", {}),
                ))
        return mgr
