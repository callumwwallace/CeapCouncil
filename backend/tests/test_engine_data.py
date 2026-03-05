"""Tests for data storage, feeds, and calendar."""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from app.engine.data.storage import DataStore, CachedDataStore, TickData, DatasetVersion
from app.engine.data.feed import DataFeed, BarData
from app.engine.data.calendar import ExchangeCalendar, MarketType, filter_to_trading_days


def _make_df(rows=50, start_price=100.0, seed=42):
    np.random.seed(seed)
    dates = pd.bdate_range(start="2024-01-02", periods=rows)
    prices = [start_price]
    for _ in range(rows - 1):
        prices.append(prices[-1] * (1 + np.random.normal(0.001, 0.02)))
    return pd.DataFrame({
        "Open": prices,
        "High": [p * 1.01 for p in prices],
        "Low": [p * 0.99 for p in prices],
        "Close": prices,
        "Volume": [1_000_000] * rows,
    }, index=dates)


class TestDataStore:
    def test_store_and_retrieve_ohlcv(self):
        store = DataStore()
        df = _make_df()
        version = store.store_ohlcv("AAPL", "1d", df)

        assert version is not None
        assert version.symbol == "AAPL"
        assert version.row_count == 50

        retrieved = store.get_ohlcv("AAPL", "1d")
        assert retrieved is not None
        assert len(retrieved) == 50

    def test_date_range_filter(self):
        store = DataStore()
        df = _make_df(rows=100)
        store.store_ohlcv("AAPL", "1d", df)

        start = datetime(2024, 2, 1)
        end = datetime(2024, 3, 1)
        filtered = store.get_ohlcv("AAPL", "1d", start=start, end=end)
        assert filtered is not None
        assert len(filtered) < 100

    def test_store_ticks(self):
        store = DataStore()
        ticks = [
            TickData("BTC-USD", datetime(2025, 1, 1, 10, 0, i), 42000.0 + i, 0.5)
            for i in range(10)
        ]
        count = store.store_ticks("BTC-USD", ticks)
        assert count == 10
        assert len(store.get_ticks("BTC-USD")) == 10

    def test_aggregate_ticks_to_bars(self):
        store = DataStore()
        base = datetime(2025, 1, 1, 10, 0, 0)
        ticks = [
            TickData("BTC-USD", base + timedelta(seconds=i), 42000.0 + i * 10, 0.1)
            for i in range(120)
        ]
        store.store_ticks("BTC-USD", ticks)
        bars = store.aggregate_ticks_to_bars("BTC-USD", 60)  # 1-minute bars
        assert len(bars) >= 1
        assert "Open" in bars.columns
        assert "Close" in bars.columns

    def test_list_symbols(self):
        store = DataStore()
        store.store_ohlcv("AAPL", "1d", _make_df())
        store.store_ohlcv("MSFT", "1d", _make_df(seed=2))
        symbols = store.list_symbols()
        assert "AAPL" in symbols
        assert "MSFT" in symbols

    def test_versioning(self):
        store = DataStore()
        v1 = store.store_ohlcv("AAPL", "1d", _make_df(seed=1))
        v2 = store.store_ohlcv("AAPL", "1d", _make_df(seed=2))

        versions = store.list_versions("AAPL")
        assert len(versions) == 2
        # Different data should produce different hashes
        assert v1.content_hash != v2.content_hash

    def test_export_json(self):
        store = DataStore()
        store.store_ohlcv("AAPL", "1d", _make_df(rows=5))
        json_str = store.export_json("AAPL", "1d")
        assert json_str is not None
        import json
        data = json.loads(json_str)
        assert data["symbol"] == "AAPL"
        assert len(data["data"]) == 5


class TestCachedDataStore:
    def test_cache_hits(self):
        store = CachedDataStore()
        store.store_ohlcv("AAPL", "1d", _make_df())

        # First access = miss
        store.get_ohlcv("AAPL", "1d")
        assert store._cache_misses == 1

        # Second access = hit
        store.get_ohlcv("AAPL", "1d")
        assert store._cache_hits == 1
        assert store.cache_hit_rate == pytest.approx(0.5)

    def test_cache_eviction(self):
        store = CachedDataStore(max_cache_size=2)
        store.store_ohlcv("A", "1d", _make_df(seed=1))
        store.store_ohlcv("B", "1d", _make_df(seed=2))
        store.store_ohlcv("C", "1d", _make_df(seed=3))

        store.get_ohlcv("A", "1d")
        store.get_ohlcv("B", "1d")
        store.get_ohlcv("C", "1d")  # Should evict A

        assert len(store._cache) == 2


class TestDataFeed:
    def test_bar_data_properties(self):
        bar = BarData("AAPL", datetime(2025, 1, 1), 150, 155, 148, 152, 1000000)
        assert bar.mid == (155 + 148) / 2
        assert bar.typical_price == (155 + 148 + 152) / 3
        assert bar.range == 7

    def test_bar_to_event(self):
        bar = BarData("AAPL", datetime(2025, 1, 1), 150, 155, 148, 152, 1000000)
        event = bar.to_event()
        assert event.symbol == "AAPL"
        assert event.close == 152

    def test_multi_symbol_sync(self):
        feed = DataFeed()
        feed.add_symbol("AAPL", _make_df(rows=20, seed=1))
        feed.add_symbol("MSFT", _make_df(rows=20, seed=2))

        groups = list(feed.iterate())
        assert len(groups) == 20
        for group in groups:
            assert len(group) == 2


class TestExchangeCalendarExtended:
    def test_trading_days_between(self):
        cal = ExchangeCalendar(MarketType.US_EQUITY)
        from datetime import date
        days = cal.trading_days_between(date(2025, 1, 6), date(2025, 1, 12))
        assert len(days) == 5  # Mon-Fri

    def test_crypto_trading_days(self):
        cal = ExchangeCalendar(MarketType.CRYPTO)
        from datetime import date
        days = cal.trading_days_between(date(2025, 1, 1), date(2025, 1, 7))
        assert len(days) == 7  # All days

    def test_next_market_open(self):
        cal = ExchangeCalendar(MarketType.US_EQUITY)
        # Friday at 5pm
        dt = datetime(2025, 1, 3, 17, 0)
        next_open = cal.next_market_open(dt)
        assert next_open.weekday() == 0  # Monday

    def test_session_close(self):
        cal = ExchangeCalendar(MarketType.US_EQUITY)
        dt = datetime(2025, 1, 6, 10, 0)
        close = cal.session_close(dt)
        assert close.hour == 16
        assert close.minute == 0

    def test_filter_to_trading_days_equity_excludes_weekends(self):
        """Equity data: weekend bars should be filtered out."""
        from datetime import date
        # Include Sat Jan 4, Sun Jan 5, Mon Jan 6
        dates = pd.DatetimeIndex([date(2025, 1, 4), date(2025, 1, 5), date(2025, 1, 6)])
        df = pd.DataFrame({"Open": [100, 101, 102], "High": [101, 102, 103], "Low": [99, 100, 101], "Close": [100, 101, 102], "Volume": [1e6, 1e6, 1e6]}, index=dates)
        out = filter_to_trading_days(df, "AAPL")
        assert len(out) == 1
        assert out.index[0].date() == date(2025, 1, 6)

    def test_filter_to_trading_days_crypto_unchanged(self):
        """Crypto: all bars kept (24/7) including weekends."""
        from datetime import date
        dates = pd.DatetimeIndex([date(2025, 1, 4), date(2025, 1, 5), date(2025, 1, 6)])  # Sat, Sun, Mon
        df = pd.DataFrame({"Open": [100, 101, 102], "High": [101, 102, 103], "Low": [99, 100, 101], "Close": [100, 101, 102], "Volume": [1e6, 1e6, 1e6]}, index=dates)
        out = filter_to_trading_days(df, "ETH-USD")
        assert len(out) == 3
