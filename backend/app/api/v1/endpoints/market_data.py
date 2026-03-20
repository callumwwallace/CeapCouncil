"""Endpoint to serve real OHLCV market data for the frontend chart.

Bloomberg-style adaptive resolution: when daily is requested, bar size adapts
to the date span so the full period is visible without truncation.
- >5 years: monthly bars (~60 points)
- >2 years: weekly bars (~260 points for 5 years)
- ≤2 years: daily bars

Yahoo Finance intraday limits (auto-clamped):
- 1m: max 8 days
- 5m, 15m: max 60 days
- 1h: max 730 days
- 1d: no limit
"""

import json
from datetime import datetime, timedelta

import redis
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query, Request

from app.core.config import settings
from app.core.limiter import limiter
from app.engine.data.calendar import filter_to_trading_days

router = APIRouter()

# Well-known symbols (always allowed without validation)
KNOWN_SYMBOLS = {
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA",
    "SPY", "QQQ", "BTC-USD", "ETH-USD",
    "META", "NVDA", "AMD", "NFLX", "DIS", "BA",
    "JPM", "GS", "GLD", "SLV", "TLT",
    "V", "MA", "WMT", "JNJ", "PG", "UNH",
    "XOM", "CVX", "COIN", "PLTR", "SOFI",
    # Forex (yfinance format)
    "EURUSD=X", "GBPUSD=X", "USDJPY=X", "AUDUSD=X",
    "USDCAD=X", "USDCHF=X", "NZDUSD=X",
}

# Cache of validated symbols (in addition to known)
_validated_symbols: set[str] = set()

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def _is_valid_symbol(symbol: str) -> bool:
    """Check if a symbol is in the known set or has been validated."""
    return symbol in KNOWN_SYMBOLS or symbol in _validated_symbols


def _validate_and_cache_symbol(symbol: str) -> bool:
    """Validate a symbol via yfinance and cache if valid."""
    if _is_valid_symbol(symbol):
        return True
    import signal

    def _timeout_handler(signum, frame):
        raise TimeoutError("Symbol validation timed out")

    try:
        old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
        signal.alarm(5)  # 5-second timeout on yfinance call
        try:
            info = yf.Ticker(symbol).info
            if info and info.get("regularMarketPrice") is not None:
                _validated_symbols.add(symbol)
                return True
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
    except (TimeoutError, Exception):
        pass
    return False


# Yahoo Finance max span (days) per interval - requests exceeding this are clamped
_MAX_DAYS_PER_INTERVAL = {"1m": 8, "5m": 60, "15m": 60, "1h": 730, "1d": 0}


def _clamp_dates_for_interval(interval: str, start: str, end: str) -> tuple[str, str]:
    """Clamp start/end to Yahoo's max range for the interval. Returns (start, end)."""
    max_days = _MAX_DAYS_PER_INTERVAL.get(interval, 0)
    if max_days <= 0:
        return start, end
    try:
        end_dt = datetime.strptime(end, "%Y-%m-%d").date()
        start_dt = datetime.strptime(start, "%Y-%m-%d").date()
        span_days = (end_dt - start_dt).days
        if span_days <= max_days:
            return start, end
        start_clamped = (end_dt - timedelta(days=max_days)).strftime("%Y-%m-%d")
        return start_clamped, end
    except (ValueError, TypeError):
        return start, end


def _effective_interval(requested: str, start: str, end: str) -> str:
    """Bloomberg-style: coarsen daily to weekly/monthly for long spans.

    yfinance supports 1d, 1wk, 1mo. For intraday we keep requested.
    """
    if requested != "1d":
        return requested
    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end, "%Y-%m-%d").date()
        span_days = (end_dt - start_dt).days
    except (ValueError, TypeError):
        return requested
    if span_days > 1825:  # ~5 years → monthly
        return "1mo"
    if span_days > 730:  # ~2 years → weekly
        return "1wk"
    return "1d"


@router.get("/search")
@limiter.limit("60/minute")
def search_symbols(
    request: Request,
    q: str = Query(..., min_length=1, max_length=20, description="Search query"),
):
    """Search for valid ticker symbols. Returns matching known symbols
    and validates unknown symbols via yfinance."""
    q = q.upper().strip()

    # First check known symbols
    matches = [
        s for s in sorted(KNOWN_SYMBOLS | _validated_symbols)
        if q in s
    ][:20]

    # If exact match not found, try to validate via yfinance
    if q not in matches and len(q) >= 1:
        if _validate_and_cache_symbol(q):
            matches.insert(0, q)

    return {"results": matches}


@router.get("/ohlcv")
@limiter.limit("60/minute")
def get_market_data(
    request: Request,
    symbol: str = Query(..., description="Ticker symbol"),
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
    interval: str = Query("1d", description="Data interval: 1d, 1h, 15m, 5m, 1m"),
):
    """Return OHLCV price data for a symbol, with 24-hour Redis caching."""
    symbol = symbol.upper()
    if not _is_valid_symbol(symbol):
        # Try to validate it dynamically
        if not _validate_and_cache_symbol(symbol):
            raise HTTPException(status_code=400, detail="Invalid symbol")

    if interval not in ("1d", "1h", "15m", "5m", "1m"):
        raise HTTPException(status_code=400, detail="Invalid interval")

    # Validate dates
    try:
        datetime.strptime(start, "%Y-%m-%d")
        datetime.strptime(end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    # Bloomberg-style adaptive resolution for daily requests
    effective_interval = _effective_interval(interval, start, end)

    # Clamp date range for intraday intervals (Yahoo limits: 1m=8d, 5m/15m=60d, 1h=730d)
    fetch_start, fetch_end = _clamp_dates_for_interval(effective_interval, start, end)

    # v2 = 5-decimal forex precision (invalidates old cached 2-decimal data)
    cache_suffix = ":v2" if symbol.endswith("=X") else ""
    cache_key = f"market_data:{symbol}:{fetch_start}:{fetch_end}:{effective_interval}{cache_suffix}"
    r = _get_redis()

    # Check cache
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)

    # Fetch from yfinance (use clamped range for intraday)
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=fetch_start, end=fetch_end, interval=effective_interval)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch market data. Try again later.")

    if df.empty:
        raise HTTPException(status_code=404, detail="No data found for this symbol")

    # Strip timezone so date formatting is consistent with the Celery task
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)

    # Filter to valid trading days per asset type (equities: exclude weekends/holidays)
    df = filter_to_trading_days(df, symbol)
    if df.empty:
        raise HTTPException(status_code=404, detail="No trading-day data found")

    # Build response - forex needs higher precision (pips) so candle colors render correctly
    is_forex = symbol.endswith("=X")
    decimals = 5 if is_forex else 2
    date_only_intervals = ("1d", "1wk", "1mo")
    date_fmt = "%Y-%m-%d" if effective_interval in date_only_intervals else "%Y-%m-%d %H:%M"
    data = []
    for idx, row in df.iterrows():
        data.append({
            "date": idx.strftime(date_fmt),
            "open": round(float(row["Open"]), decimals),
            "high": round(float(row["High"]), decimals),
            "low": round(float(row["Low"]), decimals),
            "close": round(float(row["Close"]), decimals),
            "volume": int(row["Volume"]),
        })

    # Sample down if too large (daily/weekly/monthly: 300; intraday: 500)
    date_resolution = effective_interval in ("1d", "1wk", "1mo")
    max_points = 500 if not date_resolution else 300
    if len(data) > max_points:
        step = len(data) / max_points
        indices = {0, len(data) - 1}
        for i in range(1, max_points - 1):
            indices.add(round(i * step))
        data = [data[i] for i in sorted(indices)]

    result = {"symbol": symbol, "data": data, "effective_interval": effective_interval}

    # Cache for shorter period for intraday data
    ttl = 86400 if date_resolution else 3600
    r.setex(cache_key, ttl, json.dumps(result))

    return result
