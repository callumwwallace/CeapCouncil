from __future__ import annotations

import ast
from typing import Any

from app.engine.strategy.base import StrategyBase
from app.engine.broker.order import Order, OrderSide, OrderType, TimeInForce
from app.engine.data.feed import BarData

from app.engine.indicators.overlays import (
    SMA, EMA, WMA, DEMA, TEMA, VWAP as OverlayVWAP,
    BollingerBands, KeltnerChannel, DonchianChannel,
    IchimokuCloud, ParabolicSAR, Envelope,
)
from app.engine.indicators.oscillators import (
    RSI, MACD, Stochastic, CCI, WilliamsR,
    ROC, MOM, PPO, TSI, UltimateOscillator, Aroon, ADX,
)
from app.engine.indicators.volume import (
    OBV, MFI, ChaikinMoneyFlow, ForceIndex,
    AccumulationDistribution, EaseOfMovement,
)
from app.engine.indicators.statistics import (
    StdDev, LinearRegression, Correlation, ZScore, HurstExponent,
)
from app.engine.indicators.volatility import (
    ATR, NormalizedATR, HistoricalVolatility, GarmanKlass,
)
from app.engine.data.consolidators import (
    TimeConsolidator, BarCountConsolidator, RenkoConsolidator,
    RangeConsolidator, ConsolidatedBar,
)


_ALLOWED_IMPORTS = {
    "math", "numpy", "np", "pandas", "pd",
    "statistics", "collections", "itertools", "functools",
    "datetime", "decimal",
}

_BLOCKED_BUILTINS = {
    "exec", "eval", "compile", "__import__", "open",
    "input", "exit", "quit", "breakpoint", "globals", "locals",
    "getattr", "setattr", "delattr", "vars", "dir",
    "type", "super",
}

_BLOCKED_DUNDER_ATTRS = {
    "__subclasses__", "__bases__", "__mro__", "__base__",
    "__class__", "__dict__", "__globals__", "__code__",
    "__func__", "__self__", "__module__", "__import__",
    "__builtins__", "__qualname__", "__wrapped__",
    "__loader__", "__spec__", "__path__", "__file__",
    "__reduce__", "__reduce_ex__", "__getstate__",
}


def _validate_no_dunder_access(code: str) -> None:
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            if node.attr in _BLOCKED_DUNDER_ATTRS:
                raise ValueError(
                    f"Access to '{node.attr}' is not allowed "
                    f"(line {getattr(node, 'lineno', '?')})"
                )
        if isinstance(node, ast.Subscript):
            if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                if node.slice.value in _BLOCKED_DUNDER_ATTRS:
                    raise ValueError(
                        f"Access to '{node.slice.value}' is not allowed "
                        f"(line {getattr(node, 'lineno', '?')})"
                    )


def _build_safe_builtins() -> dict:
    if isinstance(__builtins__, dict):
        src = __builtins__
    else:
        src = {k: getattr(__builtins__, k) for k in dir(__builtins__)}
    safe = {k: v for k, v in src.items() if k not in _BLOCKED_BUILTINS}

    def _safe_import(name, *args, **kwargs):
        if name not in _ALLOWED_IMPORTS:
            raise ImportError(
                f"Import of '{name}' not allowed. "
                f"Allowed: {', '.join(sorted(_ALLOWED_IMPORTS))}"
            )
        return __import__(name, *args, **kwargs)

    safe["__import__"] = _safe_import
    return safe


def compile_strategy(code: str, params: dict[str, Any] | None = None) -> type[StrategyBase]:
    import numpy as np
    import math

    _validate_no_dunder_access(code)

    safe_globals: dict = {
        "__builtins__": _build_safe_builtins(),
        "StrategyBase": StrategyBase,
        "BarData": BarData,
        "Order": Order,
        "OrderSide": OrderSide,
        "OrderType": OrderType,
        "TimeInForce": TimeInForce,
        "np": np,
        "math": math,
        "SMA": SMA,
        "EMA": EMA,
        "WMA": WMA,
        "DEMA": DEMA,
        "TEMA": TEMA,
        "VWAP": OverlayVWAP,
        "BollingerBands": BollingerBands,
        "KeltnerChannel": KeltnerChannel,
        "DonchianChannel": DonchianChannel,
        "IchimokuCloud": IchimokuCloud,
        "ParabolicSAR": ParabolicSAR,
        "Envelope": Envelope,
        "RSI": RSI,
        "MACD": MACD,
        "Stochastic": Stochastic,
        "CCI": CCI,
        "WilliamsR": WilliamsR,
        "ROC": ROC,
        "MOM": MOM,
        "PPO": PPO,
        "TSI": TSI,
        "UltimateOscillator": UltimateOscillator,
        "Aroon": Aroon,
        "ADX": ADX,
        "OBV": OBV,
        "MFI": MFI,
        "ChaikinMoneyFlow": ChaikinMoneyFlow,
        "ForceIndex": ForceIndex,
        "AccumulationDistribution": AccumulationDistribution,
        "EaseOfMovement": EaseOfMovement,
        "StdDev": StdDev,
        "LinearRegression": LinearRegression,
        "Correlation": Correlation,
        "ZScore": ZScore,
        "HurstExponent": HurstExponent,
        "ATR": ATR,
        "NormalizedATR": NormalizedATR,
        "HistoricalVolatility": HistoricalVolatility,
        "GarmanKlass": GarmanKlass,
        "TimeConsolidator": TimeConsolidator,
        "BarCountConsolidator": BarCountConsolidator,
        "RenkoConsolidator": RenkoConsolidator,
        "RangeConsolidator": RangeConsolidator,
        "ConsolidatedBar": ConsolidatedBar,
    }

    try:
        compiled = compile(code, "<strategy>", "exec")
        exec(compiled, safe_globals)
    except SyntaxError as e:
        line_info = f" (line {e.lineno})" if e.lineno else ""
        raise ValueError(f"SyntaxError{line_info}: {e.msg}") from e
    except Exception as e:
        raise ValueError(f"Strategy compilation error: {e}") from e

    strategy_cls = safe_globals.get("MyStrategy")
    if strategy_cls is None:
        raise ValueError(
            "Strategy code must define a class named 'MyStrategy' "
            "that extends StrategyBase"
        )

    if not (isinstance(strategy_cls, type) and issubclass(strategy_cls, StrategyBase)):
        raise ValueError("MyStrategy must be a subclass of StrategyBase")

    return strategy_cls


def extract_user_error(exc: Exception, code: str) -> str:
    tb = exc.__traceback__
    user_frames: list[str] = []
    while tb is not None:
        frame = tb.tb_frame
        if frame.f_code.co_filename == "<strategy>":
            lineno = tb.tb_lineno
            lines = code.split("\n")
            line_text = lines[lineno - 1].strip() if 0 < lineno <= len(lines) else ""
            user_frames.append(f"  Line {lineno}: {line_text}")
        tb = tb.tb_next

    parts = [f"{type(exc).__name__}: {exc}"]
    if user_frames:
        parts.insert(0, "Error in strategy code:")
        parts.extend(user_frames)
    return "\n".join(parts)
