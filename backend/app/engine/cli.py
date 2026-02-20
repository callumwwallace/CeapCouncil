"""Headless CLI mode for the backtesting engine.

Allows running backtests from the command line without the web UI.
Supports JSON config input and JSON/CSV output.

Usage:
    python -m app.engine.cli --config backtest.json --output results.json
    python -m app.engine.cli --code strategy.py --symbol AAPL --start 2023-01-01 --end 2024-01-01
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import yfinance as yf

from app.engine.core.engine import Engine, EngineConfig, EngineResult
from app.engine.strategy.compiler import compile_strategy


def _fetch_data(symbol: str, start: str, end: str, interval: str = "1d") -> pd.DataFrame:
    """Fetch market data via yfinance."""
    ticker = yf.Ticker(symbol)
    data = ticker.history(start=start, end=end, interval=interval)
    if data.index.tz is not None:
        data.index = data.index.tz_localize(None)
    return data


def run_from_config(config_path: str) -> dict:
    """Run a backtest from a JSON config file."""
    with open(config_path) as f:
        cfg = json.load(f)

    code_path = cfg.get("code_file")
    code = cfg.get("code", "")
    if code_path and Path(code_path).exists():
        code = Path(code_path).read_text()

    if not code:
        raise ValueError("No strategy code provided (use 'code' or 'code_file' in config)")

    symbol = cfg.get("symbol", "AAPL")
    start = cfg.get("start_date", "2023-01-01")
    end = cfg.get("end_date", "2024-01-01")
    interval = cfg.get("interval", "1d")
    params = cfg.get("parameters", {})

    engine_cfg = EngineConfig(
        initial_capital=cfg.get("initial_capital", 10000),
        commission_rate=cfg.get("commission", 0.001),
        slippage_model=cfg.get("slippage_model", "percentage"),
        slippage_pct=cfg.get("slippage_pct", 0.1),
        spread_model=cfg.get("spread_model", "none"),
        is_crypto=cfg.get("is_crypto", False),
    )

    strategy_cls = compile_strategy(code)
    strategy = strategy_cls(params=params)

    data = _fetch_data(symbol, start, end, interval)
    if data.empty:
        raise ValueError(f"No data found for {symbol}")

    engine = Engine(engine_cfg)
    engine.add_data(symbol, data)
    engine.set_strategy(strategy)

    start_time = time.monotonic()
    result = engine.run()
    elapsed = time.monotonic() - start_time

    results_dict = result.to_results_dict()
    results_dict["cli_metadata"] = {
        "elapsed_seconds": round(elapsed, 3),
        "symbol": symbol,
        "start_date": start,
        "end_date": end,
        "interval": interval,
    }
    return results_dict


def run_from_args(args: argparse.Namespace) -> dict:
    """Run a backtest from CLI arguments."""
    code = ""
    if args.code:
        code = Path(args.code).read_text()

    if not code:
        raise ValueError("Provide --code <path_to_strategy.py>")

    is_crypto = any(
        ind in args.symbol.upper()
        for ind in ["-USD", "BTC", "ETH", "SOL", "DOGE", "XRP"]
    )

    engine_cfg = EngineConfig(
        initial_capital=args.capital,
        commission_rate=args.commission,
        slippage_model="percentage",
        slippage_pct=args.slippage,
        spread_model="volatility" if is_crypto else "none",
        is_crypto=is_crypto,
    )

    strategy_cls = compile_strategy(code)
    strategy = strategy_cls(params={})

    data = _fetch_data(args.symbol, args.start, args.end, args.interval)
    if data.empty:
        raise ValueError(f"No data found for {args.symbol}")

    engine = Engine(engine_cfg)
    engine.add_data(args.symbol, data)
    engine.set_strategy(strategy)

    start_time = time.monotonic()
    result = engine.run()
    elapsed = time.monotonic() - start_time

    results_dict = result.to_results_dict()
    results_dict["cli_metadata"] = {
        "elapsed_seconds": round(elapsed, 3),
        "symbol": args.symbol,
        "start_date": args.start,
        "end_date": args.end,
    }
    return results_dict


def main():
    parser = argparse.ArgumentParser(
        description="QuantGuild Backtesting Engine CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m app.engine.cli --config backtest.json
  python -m app.engine.cli --code strategy.py --symbol AAPL --start 2023-01-01 --end 2024-01-01
  python -m app.engine.cli --code strategy.py --symbol BTC-USD --capital 50000 --output results.json
        """,
    )

    parser.add_argument("--config", help="Path to JSON config file")
    parser.add_argument("--code", help="Path to strategy .py file")
    parser.add_argument("--symbol", default="AAPL", help="Ticker symbol")
    parser.add_argument("--start", default="2023-01-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", default="2024-01-01", help="End date (YYYY-MM-DD)")
    parser.add_argument("--interval", default="1d", choices=["1d", "1h", "15m", "5m", "1m"])
    parser.add_argument("--capital", type=float, default=10000, help="Initial capital")
    parser.add_argument("--commission", type=float, default=0.001, help="Commission rate")
    parser.add_argument("--slippage", type=float, default=0.1, help="Slippage percentage")
    parser.add_argument("--output", "-o", help="Output file path (JSON)")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress console output")

    args = parser.parse_args()

    try:
        if args.config:
            results = run_from_config(args.config)
        elif args.code:
            results = run_from_args(args)
        else:
            parser.print_help()
            sys.exit(1)

        if args.output:
            with open(args.output, "w") as f:
                json.dump(results, f, indent=2, default=str)
            if not args.quiet:
                print(f"Results written to {args.output}")
        else:
            if not args.quiet:
                # Print summary
                print("\n" + "=" * 50)
                print("BACKTEST RESULTS")
                print("=" * 50)
                print(f"  Total Return:  {results.get('total_return_pct', 0):.2f}%")
                print(f"  Sharpe Ratio:  {results.get('sharpe_ratio', 0):.3f}")
                print(f"  Max Drawdown:  {results.get('max_drawdown_pct', 0):.2f}%")
                print(f"  Total Trades:  {results.get('total_trades', 0)}")
                print(f"  Win Rate:      {results.get('win_rate', 0):.1f}%")
                print(f"  Final Value:   ${results.get('final_value', 0):,.2f}")
                meta = results.get("cli_metadata", {})
                if meta.get("elapsed_seconds"):
                    print(f"  Elapsed:       {meta['elapsed_seconds']:.3f}s")
                print("=" * 50)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
