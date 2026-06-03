"""
Service données financières — Yahoo Finance API directe (sans librairie yfinance)
- Pas de quota quotidien (contrairement à Alpha Vantage 25/jour)
- Cache mémoire 30 min pour limiter les appels
- Supporte tous les marchés : .PA, .DE, .L, .AS, US...
"""
import httpx, math, time, pandas as pd
from datetime import datetime
from typing import Optional

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False

# ── Cache ────────────────────────────────────────────────────────────────────
_cache: dict = {}
CACHE_TTL = 1800  # 30 minutes

def _cached(key: str):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None

def _store(key: str, data):
    _cache[key] = (time.time(), data)
    return data

# ── Headers qui ressemblent à un vrai navigateur ─────────────────────────────
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
}

PERIOD_TO_RANGE = {
    "1mo": "1mo", "3mo": "3mo", "6mo": "6mo",
    "1y":  "1y",  "2y":  "2y",  "5y":  "5y",
}


def _clean(val) -> Optional[float]:
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 2)
    except Exception:
        return None


# ── Historique (bougies OHLCV) ───────────────────────────────────────────────
def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    cache_key = f"history:{symbol}:{period}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    yf_range = PERIOD_TO_RANGE.get(period, "6mo")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

    try:
        r = httpx.get(url, params={
            "interval":       interval,
            "range":          yf_range,
            "includePrePost": "false",
            "events":         "div,splits",
        }, headers=HEADERS, timeout=12, follow_redirects=True)

        data = r.json()
        result = data.get("chart", {}).get("result")
        if not result:
            err = data.get("chart", {}).get("error", {})
            print(f"[YF] {symbol} erreur: {err}")
            return []

        r0          = result[0]
        timestamps  = r0.get("timestamp", [])
        indicators  = r0.get("indicators", {})
        quote_data  = indicators.get("quote", [{}])[0]
        opens       = quote_data.get("open",   [])
        highs       = quote_data.get("high",   [])
        lows        = quote_data.get("low",    [])
        closes      = quote_data.get("close",  [])
        volumes     = quote_data.get("volume", [])

        candles = []
        for i, ts in enumerate(timestamps):
            o = _clean(opens[i]  if i < len(opens)   else None)
            h = _clean(highs[i]  if i < len(highs)   else None)
            l = _clean(lows[i]   if i < len(lows)    else None)
            c = _clean(closes[i] if i < len(closes)  else None)
            v = volumes[i]       if i < len(volumes)  else 0
            if None in (o, h, l, c):
                continue
            date_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
            candles.append({
                "time": date_str, "open": o, "high": h,
                "low": l, "close": c, "volume": int(v or 0),
            })

        print(f"[YF] {symbol}: {len(candles)} bougies ({period})")
        return _store(cache_key, candles)

    except Exception as e:
        print(f"[YF HISTORY ERROR] {symbol}: {e}")
        return []


# ── Quote temps réel ─────────────────────────────────────────────────────────
def get_quote(symbol: str) -> dict:
    cache_key = f"quote:{symbol}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    url = "https://query1.finance.yahoo.com/v8/finance/quote"
    try:
        r = httpx.get(url, params={
            "symbols": symbol,
            "fields":  "regularMarketPrice,regularMarketChange,"
                       "regularMarketChangePercent,regularMarketPreviousClose,"
                       "regularMarketVolume,marketCap,currency",
        }, headers=HEADERS, timeout=10, follow_redirects=True)

        data   = r.json()
        result = data.get("quoteResponse", {}).get("result", [])
        if not result:
            return {"symbol": symbol, "price": None, "error": "Aucune donnée"}

        q      = result[0]
        price  = _clean(q.get("regularMarketPrice"))
        prev   = _clean(q.get("regularMarketPreviousClose"))
        change = _clean(q.get("regularMarketChange"))
        pct    = _clean(q.get("regularMarketChangePercent"))
        mcap   = q.get("marketCap")

        result_dict = {
            "symbol":     symbol,
            "price":      price,
            "prev_close": prev,
            "change":     change,
            "change_pct": round(pct, 2) if pct is not None else None,
            "volume":     q.get("regularMarketVolume"),
            "market_cap": mcap,
            "currency":   q.get("currency", "EUR"),
        }
        return _store(cache_key, result_dict)

    except Exception as e:
        print(f"[YF QUOTE ERROR] {symbol}: {e}")
        return {"symbol": symbol, "price": None, "error": str(e)}


# ── Indicateurs techniques ───────────────────────────────────────────────────
def get_indicators(symbol: str, period: str = "6mo") -> dict:
    candles = get_history(symbol, period)
    if len(candles) < 20:
        return {}
    try:
        close = pd.Series([c["close"] for c in candles])
        sma20 = _clean(close.rolling(20).mean().iloc[-1])
        sma50 = _clean(close.rolling(50).mean().iloc[-1]) if len(candles) >= 50 else None
        if not TA_AVAILABLE:
            return {"sma20": sma20, "sma50": sma50, "signal": "NEUTRE"}
        rsi      = _clean(ta.momentum.RSIIndicator(close, window=14).rsi().iloc[-1])
        macd_obj = ta.trend.MACD(close)
        macd     = _clean(macd_obj.macd().iloc[-1])
        macd_sig = _clean(macd_obj.macd_signal().iloc[-1])
        bb       = ta.volatility.BollingerBands(close, window=20)
        return {
            "rsi": rsi, "macd": macd, "macd_signal": macd_sig,
            "bb_upper": _clean(bb.bollinger_hband().iloc[-1]),
            "bb_lower": _clean(bb.bollinger_lband().iloc[-1]),
            "sma20": sma20, "sma50": sma50,
            "signal": _signal(rsi or 50, macd or 0, macd_sig or 0),
        }
    except Exception as e:
        print(f"[INDICATORS ERROR] {symbol}: {e}")
        return {}


def _signal(rsi, macd, macd_sig):
    b = m = 0
    if rsi < 40:   b += 1
    elif rsi > 65: m += 1
    if macd > macd_sig: b += 1
    else:               m += 1
    return "HAUSSIER" if b > m else "BAISSIER" if m > b else "NEUTRE"


def search_symbols(query: str) -> list[dict]:
    return [{"symbol": query.upper(), "name": query.upper(), "exchange": "", "type": ""}]
