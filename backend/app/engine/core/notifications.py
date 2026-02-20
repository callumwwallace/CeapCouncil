"""Notifications / alerts : send strategy alerts via various channels.

Supports:
- In-memory log (always available)
- Webhook (HTTP POST)
- Email (via SMTP : optional)

Usage:
    class MyStrategy(StrategyBase):
        def on_data(self, bar):
            rsi = self.compute_rsi(bar)
            if rsi < 30:
                self.notify(f"RSI oversold on {bar.symbol}: {rsi:.1f}")
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class AlertLevel(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class Alert:
    """A strategy alert/notification."""
    timestamp: datetime
    level: AlertLevel
    message: str
    symbol: str | None = None
    data: dict[str, Any] | None = None
    delivered: bool = False
    channel: str = "log"

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "level": self.level.value,
            "message": self.message,
            "symbol": self.symbol,
            "data": self.data,
            "delivered": self.delivered,
            "channel": self.channel,
        }


@dataclass
class WebhookConfig:
    """Webhook delivery configuration."""
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    method: str = "POST"
    include_data: bool = True
    timeout: int = 5


@dataclass
class NotificationConfig:
    """Global notification configuration."""
    enabled: bool = True
    webhook: WebhookConfig | None = None
    max_alerts_per_run: int = 100
    min_level: AlertLevel = AlertLevel.INFO
    deduplicate_window_seconds: int = 60


class NotificationManager:
    """Manages strategy alerts and notification delivery.

    In backtest mode, alerts are collected in memory.
    Webhook delivery is deferred to avoid HTTP calls during backtests.
    """

    def __init__(self, config: NotificationConfig | None = None):
        self.config = config or NotificationConfig()
        self._alerts: list[Alert] = []
        self._recent_messages: dict[str, datetime] = {}

    def alert(
        self,
        message: str,
        level: AlertLevel = AlertLevel.INFO,
        symbol: str | None = None,
        data: dict[str, Any] | None = None,
        timestamp: datetime | None = None,
    ) -> Alert | None:
        """Create an alert. Returns the Alert if it passes filters."""
        if not self.config.enabled:
            return None

        if len(self._alerts) >= self.config.max_alerts_per_run:
            return None

        if self._level_value(level) < self._level_value(self.config.min_level):
            return None

        ts = timestamp or datetime.utcnow()

        # Deduplication
        dedup_key = f"{level.value}:{message}:{symbol or ''}"
        if dedup_key in self._recent_messages:
            last = self._recent_messages[dedup_key]
            if (ts - last).total_seconds() < self.config.deduplicate_window_seconds:
                return None

        self._recent_messages[dedup_key] = ts

        alert = Alert(
            timestamp=ts,
            level=level,
            message=message,
            symbol=symbol,
            data=data,
            channel="log",
        )
        self._alerts.append(alert)
        logger.info(f"Alert [{level.value}]: {message}")
        return alert

    def deliver_webhook(self, alert: Alert) -> bool:
        """Deliver an alert via webhook. Call post-backtest for production use."""
        if not self.config.webhook:
            return False

        try:
            import urllib.request

            payload = json.dumps(alert.to_dict()).encode("utf-8")
            req = urllib.request.Request(
                self.config.webhook.url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    **self.config.webhook.headers,
                },
                method=self.config.webhook.method,
            )
            with urllib.request.urlopen(req, timeout=self.config.webhook.timeout) as resp:
                alert.delivered = resp.status < 400
                alert.channel = "webhook"
                return alert.delivered
        except Exception as e:
            logger.warning(f"Webhook delivery failed: {e}")
            return False

    def deliver_all_pending(self) -> int:
        """Deliver all undelivered alerts via webhook. Returns count of successful deliveries."""
        if not self.config.webhook:
            return 0
        count = 0
        for alert in self._alerts:
            if not alert.delivered:
                if self.deliver_webhook(alert):
                    count += 1
        return count

    @property
    def alerts(self) -> list[Alert]:
        return list(self._alerts)

    @property
    def alert_count(self) -> int:
        return len(self._alerts)

    def get_alerts(
        self,
        level: AlertLevel | None = None,
        symbol: str | None = None,
    ) -> list[Alert]:
        """Filter alerts by level and/or symbol."""
        result = self._alerts
        if level:
            result = [a for a in result if a.level == level]
        if symbol:
            result = [a for a in result if a.symbol == symbol]
        return result

    def clear(self) -> None:
        self._alerts.clear()
        self._recent_messages.clear()

    def to_dict_list(self) -> list[dict]:
        return [a.to_dict() for a in self._alerts]

    @staticmethod
    def _level_value(level: AlertLevel) -> int:
        return {"info": 0, "warning": 1, "critical": 2}.get(level.value, 0)
