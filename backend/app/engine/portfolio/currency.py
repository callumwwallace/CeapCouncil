"""Multi-currency accounting system.

Supports base currency selection, FX conversion, per-currency cash balances,
and cross-asset P&L aggregation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class FxRate:
    """A single FX rate snapshot."""
    pair: str         # e.g. "EUR/USD"
    rate: float       # Units of quote per 1 unit of base
    timestamp: datetime | None = None


class CurrencyManager:
    """Manages multi-currency cash balances and FX conversions.

    Usage:
        mgr = CurrencyManager(base_currency="USD")
        mgr.update_fx("EUR/USD", 1.08)
        mgr.deposit("EUR", 10000)
        usd_value = mgr.total_value_in_base()
    """

    def __init__(self, base_currency: str = "USD"):
        self.base_currency = base_currency.upper()
        self._balances: dict[str, float] = {self.base_currency: 0.0}
        self._fx_rates: dict[str, float] = {}  # "EUR/USD" -> 1.08
        self._fx_history: list[dict] = []

    def deposit(self, currency: str, amount: float) -> None:
        """Add funds in a specific currency."""
        currency = currency.upper()
        self._balances[currency] = self._balances.get(currency, 0.0) + amount

    def withdraw(self, currency: str, amount: float) -> bool:
        """Remove funds. Returns False if insufficient balance."""
        currency = currency.upper()
        current = self._balances.get(currency, 0.0)
        if current < amount:
            return False
        self._balances[currency] = current - amount
        return True

    def update_fx(self, pair: str, rate: float, timestamp: datetime | None = None) -> None:
        """Update an FX rate. Pair format: 'EUR/USD'."""
        self._fx_rates[pair.upper()] = rate
        # Also store inverse
        parts = pair.upper().split("/")
        if len(parts) == 2:
            inverse_pair = f"{parts[1]}/{parts[0]}"
            self._fx_rates[inverse_pair] = 1.0 / rate if rate != 0 else 0.0

        self._fx_history.append({
            "pair": pair, "rate": rate,
            "timestamp": timestamp.isoformat() if timestamp else None,
        })

    def convert(self, amount: float, from_currency: str, to_currency: str) -> float:
        """Convert an amount from one currency to another."""
        from_currency = from_currency.upper()
        to_currency = to_currency.upper()

        if from_currency == to_currency:
            return amount

        pair = f"{from_currency}/{to_currency}"
        if pair in self._fx_rates:
            return amount * self._fx_rates[pair]

        # Try through base currency
        to_base = f"{from_currency}/{self.base_currency}"
        from_base = f"{self.base_currency}/{to_currency}"
        if to_base in self._fx_rates and from_base in self._fx_rates:
            base_amount = amount * self._fx_rates[to_base]
            return base_amount * self._fx_rates[from_base]

        # No rate available: return as-is (assume 1:1)
        return amount

    def to_base(self, amount: float, currency: str) -> float:
        """Convert an amount to the base currency."""
        return self.convert(amount, currency, self.base_currency)

    def balance(self, currency: str) -> float:
        """Get balance in a specific currency."""
        return self._balances.get(currency.upper(), 0.0)

    def total_value_in_base(self) -> float:
        """Get total portfolio value across all currencies, in base currency."""
        total = 0.0
        for currency, balance in self._balances.items():
            total += self.to_base(balance, currency)
        return total

    def all_balances(self) -> dict[str, float]:
        """Get all currency balances."""
        return self._balances.copy()

    def all_balances_in_base(self) -> dict[str, float]:
        """Get all balances converted to base currency."""
        return {c: self.to_base(b, c) for c, b in self._balances.items()}

    def get_currency_for_symbol(self, symbol: str) -> str:
        """Infer the denomination currency for a symbol.

        Convention: BTC-USD -> USD, AAPL -> USD, EUR/USD -> USD (quote),
        7203.T -> JPY
        """
        symbol = symbol.upper()
        if "-" in symbol:
            return symbol.split("-")[-1]
        if "/" in symbol:
            return symbol.split("/")[-1]
        if symbol.endswith(".T"):
            return "JPY"
        if symbol.endswith(".L"):
            return "GBP"
        if symbol.endswith(".PA") or symbol.endswith(".DE"):
            return "EUR"
        return self.base_currency

    def process_fill(self, symbol: str, side: str, quantity: float,
                     price: float, commission: float = 0.0) -> None:
        """Update balances after a fill.

        For a BUY: decrease cash in symbol's currency, increase position.
        For a SELL: increase cash in symbol's currency, decrease position.
        Commission is deducted from the symbol's currency.
        """
        currency = self.get_currency_for_symbol(symbol)
        cost = quantity * price

        if side.upper() == "BUY":
            self._balances[currency] = self._balances.get(currency, 0.0) - cost - commission
        else:
            self._balances[currency] = self._balances.get(currency, 0.0) + cost - commission

    def to_dict(self) -> dict:
        return {
            "base_currency": self.base_currency,
            "balances": self._balances.copy(),
            "fx_rates": self._fx_rates.copy(),
        }
