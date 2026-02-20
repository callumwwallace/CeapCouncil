"""Tests for strategy base class and compiler."""

import pytest
from datetime import datetime

from app.engine.strategy.base import StrategyBase
from app.engine.strategy.compiler import compile_strategy


class SimpleBuyHold(StrategyBase):
    """Minimal buy-and-hold strategy for testing."""

    def on_init(self):
        self._bought = False

    def on_data(self, bar):
        if not self._bought and self.is_flat(bar.symbol):
            qty = int(self.portfolio.cash * 0.95 / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)
                self._bought = True


class TestStrategyBase:
    def test_subclass_must_implement_on_data(self):
        with pytest.raises(TypeError):
            class BadStrategy(StrategyBase):
                pass
            BadStrategy()

    def test_params_accessible(self):
        class S(StrategyBase):
            def on_data(self, bar):
                pass
        s = S(params={"sma_period": 20, "threshold": 0.5})
        assert s.params["sma_period"] == 20


class TestStrategyCompiler:
    def test_compile_valid_strategy(self):
        code = """
class MyStrategy(StrategyBase):
    def on_data(self, bar):
        if self.bar_index == 0 and self.is_flat(bar.symbol):
            qty = int(self.portfolio.cash / bar.close)
            if qty > 0:
                self.market_order(bar.symbol, qty)
"""
        cls = compile_strategy(code)
        assert issubclass(cls, StrategyBase)
        instance = cls()
        assert instance is not None

    def test_compile_syntax_error(self):
        code = "class MyStrategy(StrategyBase)\n  def on_data(self, bar):"
        with pytest.raises(ValueError, match="SyntaxError"):
            compile_strategy(code)

    def test_compile_missing_class(self):
        code = """
class NotMyStrategy(StrategyBase):
    def on_data(self, bar):
        pass
"""
        with pytest.raises(ValueError, match="must define a class named 'MyStrategy'"):
            compile_strategy(code)

    def test_compile_not_subclass(self):
        code = """
class MyStrategy:
    def on_data(self, bar):
        pass
"""
        with pytest.raises(ValueError, match="must be a subclass"):
            compile_strategy(code)

    def test_blocked_import(self):
        code = """
import os
class MyStrategy(StrategyBase):
    def on_data(self, bar):
        pass
"""
        with pytest.raises(ValueError, match="not allowed"):
            compile_strategy(code)

    def test_allowed_import(self):
        code = """
import math
import numpy as np
class MyStrategy(StrategyBase):
    def on_data(self, bar):
        x = math.sqrt(4)
        arr = np.array([1, 2, 3])
"""
        cls = compile_strategy(code)
        assert issubclass(cls, StrategyBase)
