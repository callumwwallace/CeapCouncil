"""Endpoint to serve real OHLCV market data for the frontend chart."""

import json
from datetime import datetime

import redis
import yfinance as yf
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings

router = APIRouter()

# Well-known symbols (always allowed without validation)
KNOWN_SYMBOLS = {
    "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA",
    "SPY", "QQQ", "BTC-USD", "ETH-USD",
    "META", "NVDA", "AMD", "NFLX", "DIS", "BA",
    "JPM", "GS", "GLD", "SLV", "TLT",
    "V", "MA", "WMT", "JNJ", "PG", "UNH",
    "XOM", "CVX", "COIN", "PLTR", "SOFI",
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
    try:
        info = yf.Ticker(symbol).info
        if info and info.get("regularMarketPrice") is not None:
            _validated_symbols.add(symbol)
            return True
    except Exception:
        pass
    return False


@router.get("/search")
def search_symbols(
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
def get_market_data(
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
            raise HTTPException(status_code=400, detail=f"Symbol '{symbol}' is not valid")

    if interval not in ("1d", "1h", "15m", "5m", "1m"):
        raise HTTPException(status_code=400, detail=f"Invalid interval '{interval}'")

    # Validate dates
    try:
        datetime.strptime(start, "%Y-%m-%d")
        datetime.strptime(end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    cache_key = f"market_data:{symbol}:{start}:{end}:{interval}"
    r = _get_redis()

    # Check cache
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)

    # Fetch from yfinance
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start, end=end, interval=interval)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch market data: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")

    # Strip timezone so date formatting is consistent with the Celery task
    if df.index.tz is not None:
        df.index = df.index.tz_localize(None)

    # Build response
    date_fmt = "%Y-%m-%d" if interval == "1d" else "%Y-%m-%d %H:%M"
    data = []
    for idx, row in df.iterrows():
        data.append({
            "date": idx.strftime(date_fmt),
            "open": round(float(row["Open"]), 2),
            "high": round(float(row["High"]), 2),
            "low": round(float(row["Low"]), 2),
            "close": round(float(row["Close"]), 2),
            "volume": int(row["Volume"]),
        })

    # Sample down if too large (keep max 500 points for intraday)
    max_points = 500 if interval != "1d" else 300
    if len(data) > max_points:
        step = len(data) / max_points
        indices = {0, len(data) - 1}
        for i in range(1, max_points - 1):
            indices.add(round(i * step))
        data = [data[i] for i in sorted(indices)]

    result = {"symbol": symbol, "data": data}

    # Cache for shorter period for intraday data
    ttl = 86400 if interval == "1d" else 3600
    r.setex(cache_key, ttl, json.dumps(result))

    return result
