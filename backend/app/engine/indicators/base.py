"""Base classes for indicators."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Sequence

import numpy as np


class Indicator(ABC):
    """Base class for all indicators.

    Indicators accept a sequence of values (list or numpy array) and return
    the computed value(s). They are stateless callables.
    """

    def __init__(self, **kwargs: Any):
        self._params = kwargs

    @abstractmethod
    def __call__(self, data: Sequence[float] | np.ndarray) -> float | np.ndarray | dict:
        """Compute the indicator value from the given data."""
        ...

    def _to_array(self, data: Sequence[float] | np.ndarray) -> np.ndarray:
        """Convert input to numpy array."""
        if isinstance(data, np.ndarray):
            return data.astype(np.float64)
        return np.array(data, dtype=np.float64)

    @property
    def name(self) -> str:
        return self.__class__.__name__

    def __repr__(self) -> str:
        params = ", ".join(f"{k}={v}" for k, v in self._params.items())
        return f"{self.name}({params})"


class MultiInputIndicator(ABC):
    """Base for indicators that require multiple input arrays (e.g., high, low, close)."""

    def __init__(self, **kwargs: Any):
        self._params = kwargs

    @abstractmethod
    def __call__(self, **arrays: Sequence[float] | np.ndarray) -> float | np.ndarray | dict:
        ...

    def _to_array(self, data: Sequence[float] | np.ndarray) -> np.ndarray:
        if isinstance(data, np.ndarray):
            return data.astype(np.float64)
        return np.array(data, dtype=np.float64)

    @property
    def name(self) -> str:
        return self.__class__.__name__
