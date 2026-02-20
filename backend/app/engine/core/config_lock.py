"""Strategy configuration locking for audit and compliance.

Freezes a strategy's code and configuration at backtest time,
producing a tamper-evident hash that can be verified later.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ConfigLock:
    """An immutable snapshot of a strategy's configuration at backtest time.

    The lock_hash can be used to verify that the strategy code and
    parameters have not been modified since the backtest ran.
    """
    strategy_code: str
    parameters: dict
    engine_config: dict
    symbol: str
    start_date: str
    end_date: str
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    lock_hash: str = ""

    def __post_init__(self):
        if not self.lock_hash:
            self.lock_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        """Compute a deterministic SHA-256 hash of the locked configuration."""
        payload = {
            "code": self.strategy_code,
            "params": json.dumps(self.parameters, sort_keys=True),
            "engine": json.dumps(self.engine_config, sort_keys=True, default=str),
            "symbol": self.symbol,
            "start": self.start_date,
            "end": self.end_date,
        }
        canonical = json.dumps(payload, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

    def verify(self) -> bool:
        """Verify that the lock hash matches the current configuration."""
        return self.lock_hash == self._compute_hash()

    def to_dict(self) -> dict:
        return {
            "lock_hash": self.lock_hash,
            "created_at": self.created_at,
            "symbol": self.symbol,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "parameters": self.parameters,
            "code_hash": hashlib.sha256(self.strategy_code.encode()).hexdigest(),
            "verified": self.verify(),
        }

    @classmethod
    def from_backtest(
        cls,
        code: str,
        params: dict,
        engine_config: dict,
        symbol: str,
        start_date: str,
        end_date: str,
    ) -> "ConfigLock":
        """Create a lock from backtest parameters."""
        return cls(
            strategy_code=code,
            parameters=params,
            engine_config=engine_config,
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
        )


class ConfigLockStore:
    """In-memory store for config locks (can be backed by database)."""

    def __init__(self):
        self._locks: dict[str, ConfigLock] = {}  # backtest_id -> lock

    def store(self, backtest_id: str, lock: ConfigLock) -> None:
        self._locks[backtest_id] = lock

    def get(self, backtest_id: str) -> ConfigLock | None:
        return self._locks.get(backtest_id)

    def verify(self, backtest_id: str) -> bool | None:
        """Verify a stored lock. Returns None if not found."""
        lock = self._locks.get(backtest_id)
        if lock is None:
            return None
        return lock.verify()

    def list_all(self) -> list[dict]:
        return [
            {"backtest_id": bid, **lock.to_dict()}
            for bid, lock in self._locks.items()
        ]
