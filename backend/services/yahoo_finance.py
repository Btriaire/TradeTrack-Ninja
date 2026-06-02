"""
Service données financières — Alpha Vantage
- Gratuit : 25 req/jour, 5 req/min
- Supporte Euronext Paris (MC.PAR, AIR.PAR...)
- Cache mémoire 30 min pour économiser les appels
"""
import os, httpx, math, time, pandas as pd
from datetime import datetime, timedelta
from typing import Optional
from functools import lru_cache

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False

AV_BASE = "https://www.alphavantage.co/query"

# Cache simple : {cache_key: (timestamp, data)}
_cache: dict = {}
CACHE_TTL = 1800  # 30 minutes

# Conversion Yahoo Finance → Alpha Vantage suffixes
SUFFIX_MAP = {
    ".PA": ".PAR",   # Euronext Paris
    ".AS": ".AMS",   # Amsterdam
    ".BR": ".BRU",   # Bruxelles
    ".DE": ".DEX",   # Xetra Frankfurt
    ".L":  ".LON",   # London
    ".MI": ".MIL",   # Milan
    ".MC": ".MAD",   # Madrid
}

PERIOD_DAYS = {
    "1mo": 30, "3mo": 90, "6mo": 180,
    "1y": 365, "2y": 730, "5y": 1825
}


def _clean(val) -> Optional[float]:
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 2)
    except Exception:
        return None


def _av_symbol(symbol: str) -> str:
    """MC.PA → MC.PAR"""
    s = symbol.upper()
    for yf_sfx, av_sfx in SUFFIX_MAP.items():
        if s.endswith(yf_sfx):
            return s[:-len(yf_sfx)] + av_sfx
    return s  # US stocks unchanged


def _key() -> str:
    return os.getenv("ALPHA_VANTAGE_KEY", "")


def _cached(key: str):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _store(key: str, data):
    _cache[key] = (time.time(), data)
    return data


def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    cache_key = f"history:{symbol}:{period}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    key = _key()
    if not key:
        print("[AV] ALPHA_VANTAGE_KEY manquant")
        return []

    av_sym = _av_symbol(symbol)
    days   = PERIOD_DAYS.get(period, 180)
    output = "compact" if days <= 100 else "full"

    try:
        r = httpx.get(AV_BASE, params={
            "function":   "TIME_SERIES_DAILY",
            "symbol":     av_sym,
            "outputsize": output,
            "apikey":     key,
        }, timeout=15)
        data = r.json()

        if "Note" in data:
            print(f"[AV] Rate limit: {data['Note']}")
            return []
        if "Error Message" in data:
            print(f"[AV ERROR] {data['Error Message']}")
            return []

        series = data.get("Time Series (Daily)", {})
        cutoff = datetime.now() - timedelta(days=days)
        candles = []
        for date_str, values in sorted(series.items()):
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            if dt < cutoff:
                continue
            o = _clean(values.get("1. open"))
            h = _clean(values.get("2. high"))
            l = _clean(values.get("3. low"))
            c = _clean(values.get("4. close"))
            v = values.get("5. volume", "0")
            if None in (o, h, l, c):
                continue
            candles.append({
                "time": date_str, "open": o, "high": h,
                "low": l, "close": c, "volume": int(v),
            })

        print(f"[AV] {symbol} → {av_sym} : {len(candles)} bougies")
        return _store(cache_key, candles)

    except Exception as e:
        print(f"[AV HISTORY ERROR] {symbol}: {e}")
        return []


def get_quote(symbol: str) -> dict:
    cache_key = f"quote:{symbol}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    key = _key()
    if not key:
        return {"symbol": symbol, "price": None, "error": "ALPHA_VANTAGE_KEY manquant"}

    av_sym = _av_symbol(symbol)
    try:
        r = httpx.get(AV_BASE, params={
            "function": "GLOBAL_QUOTE",
            "symbol":   av_sym,
            "apikey":   key,
        }, timeout=10)
        q = r.json().get("Global Quote", {})
        price = _clean(q.get("05. price"))
        prev  = _clean(q.get("08. previous close"))
        change = _clean(q.get("09. change"))
        pct    = _clean(q.get("10. change percent", "0").replace("%", ""))
        result = {
            "symbol": symbol, "price": price, "prev_close": prev,
            "change": change, "change_pct": pct,
            "volume": q.get("06. volume"), "market_cap": None, "currency": "EUR",
        }
        return _store(cache_key, result)
    except Exception as e:
        print(f"[AV QUOTE ERROR] {symbol}: {e}")
        return {"symbol": symbol, "price": None, "error": str(e)}


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
    if rsi < 40: b += 1
    elif rsi > 65: m += 1
    if macd > macd_sig: b += 1
    else: m += 1
    return "HAUSSIER" if b > m else "BAISSIER" if m > b else "NEUTRE"


def search_symbols(query: str) -> list[dict]:
    return [{"symbol": query.upper(), "name": query.upper(), "exchange": "", "type": ""}]
