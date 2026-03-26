from __future__ import annotations

import ast
import signal
from typing import Any

from app.core.config import settings
from app.engine.strategy.base import StrategyBase
from app.engine.broker.order import Order, OrderSide, OrderType
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

def _is_dunder(name: str) -> bool:
    """Return True for any __dunder__ name."""
    return name.startswith("__") and name.endswith("__") and len(name) > 4


# Explicitly blocked single-underscore and other dangerous attrs
_BLOCKED_ATTRS = {
    "_module", "_class", "_bases", "_mro", "_dict",
    "_globals", "_code", "_func", "_self",
}


def _validate_no_dunder_access(code: str) -> None:
    """Reject any AST node that touches a dunder or other dangerous attribute."""
    tree = ast.parse(code)
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            attr = node.attr
            if _is_dunder(attr):
                raise ValueError(
                    f"Access to dunder attribute '{attr}' is not allowed "
                    f"(line {getattr(node, 'lineno', '?')})"
                )
        if isinstance(node, ast.Subscript):
            # Catch obj['__class__'] style access via constant string key
            if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
                key = node.slice.value
                if _is_dunder(key):
                    raise ValueError(
                        f"Access to dunder key '{key}' is not allowed "
                        f"(line {getattr(node, 'lineno', '?')})"
                    )
        if isinstance(node, ast.Call):
            # Block getattr(obj, '__class__') etc. even though getattr is
            # already in _BLOCKED_BUILTINS — belt-and-suspenders check.
            if isinstance(node.func, ast.Name) and node.func.id in {"getattr", "setattr", "delattr"}:
                if len(node.args) >= 2 and isinstance(node.args[1], ast.Constant):
                    key = node.args[1].value
                    if isinstance(key, str) and _is_dunder(key):
                        raise ValueError(
                            f"Access to dunder attribute '{key}' via {node.func.id}() is not allowed "
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

    try:
        _validate_no_dunder_access(code)
    except SyntaxError as e:
        line_info = f" (line {e.lineno})" if e.lineno else ""
        raise ValueError(f"SyntaxError{line_info}: {e.msg}") from e

    safe_globals: dict = {
        "__builtins__": _build_safe_builtins(),
        "StrategyBase": StrategyBase,
        "BarData": BarData,
        "Order": Order,
        "OrderSide": OrderSide,
        "OrderType": OrderType,
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

    timeout = settings.COMPILE_TIMEOUT_SECONDS

    def _timeout_handler(signum, frame):
        raise TimeoutError("Strategy compilation timed out")

    try:
        compiled = compile(code, "<strategy>", "exec")
        old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(timeout)
        try:
            exec(compiled, safe_globals)
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
    except TimeoutError as e:
        raise ValueError(str(e)) from e
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
