"""Plugin/model registry for custom slippage, spread, and fill models.

Allows users to register and use custom models without modifying engine internals.

Usage:
    from app.engine.core.plugin import ModelRegistry

    @ModelRegistry.register_slippage("my_custom_slippage")
    class MySlippage(SlippageModel):
        def calculate(self, price, quantity, bar):
            return price * 0.0005  # custom logic

    # Then use in config:
    config = EngineConfig(slippage_model="my_custom_slippage")
"""

from __future__ import annotations

from typing import Any, Type


class ModelRegistry:
    """Central registry for pluggable models (slippage, spread, fill, commission)."""

    _slippage_models: dict[str, Type] = {}
    _spread_models: dict[str, Type] = {}
    _fill_models: dict[str, Type] = {}
    _commission_models: dict[str, Type] = {}

    # -- Slippage --
    @classmethod
    def register_slippage(cls, name: str):
        """Decorator to register a custom slippage model."""
        def decorator(model_cls: Type) -> Type:
            cls._slippage_models[name] = model_cls
            return model_cls
        return decorator

    @classmethod
    def get_slippage(cls, name: str) -> Type | None:
        return cls._slippage_models.get(name)

    @classmethod
    def list_slippage(cls) -> list[str]:
        return list(cls._slippage_models.keys())

    # -- Spread --
    @classmethod
    def register_spread(cls, name: str):
        """Decorator to register a custom spread model."""
        def decorator(model_cls: Type) -> Type:
            cls._spread_models[name] = model_cls
            return model_cls
        return decorator

    @classmethod
    def get_spread(cls, name: str) -> Type | None:
        return cls._spread_models.get(name)

    @classmethod
    def list_spread(cls) -> list[str]:
        return list(cls._spread_models.keys())

    # -- Fill --
    @classmethod
    def register_fill(cls, name: str):
        """Decorator to register a custom fill model."""
        def decorator(model_cls: Type) -> Type:
            cls._fill_models[name] = model_cls
            return model_cls
        return decorator

    @classmethod
    def get_fill(cls, name: str) -> Type | None:
        return cls._fill_models.get(name)

    @classmethod
    def list_fill(cls) -> list[str]:
        return list(cls._fill_models.keys())

    # -- Commission --
    @classmethod
    def register_commission(cls, name: str):
        """Decorator to register a custom commission model."""
        def decorator(model_cls: Type) -> Type:
            cls._commission_models[name] = model_cls
            return model_cls
        return decorator

    @classmethod
    def get_commission(cls, name: str) -> Type | None:
        return cls._commission_models.get(name)

    @classmethod
    def list_commission(cls) -> list[str]:
        return list(cls._commission_models.keys())

    # -- General --
    @classmethod
    def list_all(cls) -> dict[str, list[str]]:
        return {
            "slippage": cls.list_slippage(),
            "spread": cls.list_spread(),
            "fill": cls.list_fill(),
            "commission": cls.list_commission(),
        }

    @classmethod
    def clear(cls) -> None:
        """Clear all registered models (useful for testing)."""
        cls._slippage_models.clear()
        cls._spread_models.clear()
        cls._fill_models.clear()
        cls._commission_models.clear()
