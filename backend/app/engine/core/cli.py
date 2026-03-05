"""Headless engine CLI.

Run backtests from command line:
    python -m app.engine.core.cli run --config backtest.yaml
    python -m app.engine.core.cli run --config backtest.json --output results.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

import yaml
import pandas as pd
import yfinance as yf

from app.engine.core.engine import Engine, EngineConfig


def load_config(path: str) -> dict:
    """Load config from YAML or JSON file."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    content = p.read_text()
    if p.suffix in (".yml", ".yaml"):
        return yaml.safe_load(content)
    elif p.suffix == ".json":
        return json.loads(content)
    else:
        raise ValueError(f"Unsupported config format: {p.suffix}. Use .yaml or .json")


def fetch_data(symbol: str, start: str, end: str, interval: str = "1d") -> pd.DataFrame:
    """Fetch market data from yfinance."""
    ticker = yf.Ticker(symbol)
    data = ticker.history(start=start, end=end, interval=interval)
    if data.empty:
        raise ValueError(f"No data found for {symbol} from {start} to {end}")
    if data.index.tz is not None:
        data.index = data.index.tz_localize(None)
    return data


def run_backtest(config_path: str, output_path: str | None = None) -> dict:
    """Execute a backtest from a config file."""
    raw_config = load_config(config_path)

    # Build engine config
    engine_cfg = EngineConfig(
        initial_capital=raw_config.get("initial_capital", 100000),
        commission_rate=raw_config.get("commission", 0.001),
        slippage_model=raw_config.get("slippage_model", "percentage"),
        slippage_pct=raw_config.get("slippage_pct", 0.1),
        spread_model=raw_config.get("spread_model", "none"),
        is_crypto=raw_config.get("is_crypto", False),
    )

    # Fetch data
    symbol = raw_config["symbol"]
    start = raw_config["start_date"]
    end = raw_config["end_date"]
    interval = raw_config.get("interval", "1d")
    data = fetch_data(symbol, start, end, interval)

    # Build strategy
    strategy_code = raw_config.get("strategy_code")
    if strategy_code:
        from app.engine.strategy.compiler import compile_strategy
        strategy_cls = compile_strategy(strategy_code)
        strategy = strategy_cls(params=raw_config.get("strategy_params", {}))
    else:
        raise ValueError("Config must include 'strategy_code'")

    # Run
    engine = Engine(engine_cfg)
    engine.add_data(symbol, data)
    engine.set_strategy(strategy)
    result = engine.run()

    # Output
    results_dict = result.to_results_dict()
    if output_path:
        Path(output_path).write_text(json.dumps(results_dict, indent=2, default=str))
        print(f"Results written to {output_path}")
    else:
        print(json.dumps(results_dict, indent=2, default=str))

    return results_dict


def main():
    parser = argparse.ArgumentParser(
        prog="ceapcouncil-engine",
        description="Ceap Council Backtesting Engine CLI",
    )
    subparsers = parser.add_subparsers(dest="command")

    # Run command
    run_parser = subparsers.add_parser("run", help="Run a backtest")
    run_parser.add_argument("--config", "-c", required=True, help="Config file (YAML or JSON)")
    run_parser.add_argument("--output", "-o", help="Output file for results (JSON)")

    args = parser.parse_args()

    if args.command == "run":
        try:
            run_backtest(args.config, args.output)
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
