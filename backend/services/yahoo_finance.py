"""
Service données financières — Finnhub API
Gratuit : 60 req/min, supporte Euronext Paris, cloud-friendly.
https://finnhub.io/register (gratuit, sans carte bancaire)
"""
import os
import httpx
import math
import time
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False

FINNHUB_BASE = "https://finnhub.io/api/v1"

PERIOD_DAYS = {
    "1mo": 30, "3mo": 90, "6mo": 180,
    "1y": 365, "2y": 730, "5y": 1825
}

# Conversion Yahoo Finance → Finnhub exchange prefix
EXCHANGE_MAP = {
    ".PA": "EURONEXT",   # Paris
    ".AS": "EURONEXT",   # Amsterdam
    ".BR": "EURONEXT",   # Bruxelles
    ".DE": "XETRA",      # Frankfurt
    ".L":  "LSE",        # Londres
    ".MI": "MIL",        # Milan
}


def _clean(val) -> Optional[float]:
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 2)
    except Exception:
        return None


def _fh_symbol(symbol: str) -> str:
    """MC.PA → EURONEXT:MC"""
    s = symbol.upper()
    for suffix, exchange in EXCHANGE_MAP.items():
        if s.endswith(suffix):
            return f"{exchange}:{s[:-len(suffix)]}"
    return s  # US stocks: AAPL, MSFT...


def _key() -> str:
    return os.getenv("FINNHUB_KEY", "")


def get_quote(symbol: str) -> dict:
    key = _key()
    if not key:
        return {"symbol": symbol, "price": None, "error": "FINNHUB_KEY manquant"}
    try:
        fh_sym = _fh_symbol(symbol)
        r = httpx.get(f"{FINNHUB_BASE}/quote", params={
            "symbol": fh_sym, "token": key
        }, timeout=10)
        q = r.json()
        price = _clean(q.get("c"))   # current price
        prev  = _clean(q.get("pc"))  # previous close
        change = _clean(q.get("d"))  # change
        pct    = _clean(q.get("dp")) # percent change
        return {
            "symbol":     symbol,
            "price":      price,
            "prev_close": prev,
            "change":     change,
            "change_pct": pct,
            "volume":     None,
            "market_cap": None,
            "currency":   "EUR",
        }
    except Exception as e:
        print(f"[FH QUOTE ERROR] {symbol}: {e}")
        return {"symbol": symbol, "price": None, "error": str(e)}


def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    key = _key()
    if not key:
        return []
    try:
        fh_sym = _fh_symbol(symbol)
        days   = PERIOD_DAYS.get(period, 180)
        t_to   = int(time.time())
        t_from = int((datetime.now() - timedelta(days=days)).timestamp())

        # Finnhub resolution: D=daily, W=weekly, M=monthly
        res_map = {"1d": "D", "1wk": "W", "1mo": "M"}
        resolution = res_map.get(interval, "D")

        r = httpx.get(f"{FINNHUB_BASE}/stock/candle", params={
            "symbol":     fh_sym,
            "resolution": resolution,
            "from":       t_from,
            "to":         t_to,
            "token":      key,
        }, timeout=15)
        data = r.json()

        if data.get("s") == "no_data":
            print(f"[FH HISTORY] No data for {symbol} ({fh_sym})")
            return []

        candles = []
        timestamps = data.get("t", [])
        opens      = data.get("o", [])
        highs      = data.get("h", [])
        lows       = data.get("l", [])
        closes     = data.get("c", [])
        volumes    = data.get("v", [])

        for i, ts in enumerate(timestamps):
            o = _clean(opens[i])
            h = _clean(highs[i])
            l = _clean(lows[i])
            c = _clean(closes[i])
            if None in (o, h, l, c):
                continue
            candles.append({
                "time":   datetime.fromtimestamp(ts).strftime("%Y-%m-%d"),
                "open":   o, "high": h, "low": l, "close": c,
                "volume": int(volumes[i]) if i < len(volumes) else 0,
            })

        print(f"[FH] {symbol} → {fh_sym} : {len(candles)} bougies")
        return candles
    except Exception as e:
        print(f"[FH HISTORY ERROR] {symbol}: {e}")
        return []


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


def _signal(rsi, macd, macd_signal):
    b = m = 0
    if rsi < 40: b += 1
    elif rsi > 65: m += 1
    if macd > macd_signal: b += 1
    else: m += 1
    return "HAUSSIER" if b > m else "BAISSIER" if m > b else "NEUTRE"


def search_symbols(query: str) -> list[dict]:
    return [{"symbol": query.upper(), "name": query.upper(), "exchange": "", "type": ""}]
