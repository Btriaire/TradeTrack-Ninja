"""
Service données financières — Stooq (gratuit, sans clé API, cloud-friendly)
Fallback yfinance en dev local.
"""
import httpx
import math
import io
import csv
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"}

# Conversion Yahoo Finance → Stooq suffixes
STOOQ_SUFFIX = {
    ".PA": ".fr",   # Euronext Paris
    ".AS": ".nl",   # Amsterdam
    ".BR": ".be",   # Bruxelles
    ".DE": ".de",   # Xetra
    ".L":  ".uk",   # London
    ".MI": ".it",   # Milan
    ".MC": ".es",   # Madrid
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


def _stooq_sym(symbol: str) -> str:
    s = symbol.upper()
    for yf, stooq in STOOQ_SUFFIX.items():
        if s.endswith(yf):
            return s[:-len(yf)].lower() + stooq
    return s.lower()  # US stocks


def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    sym = _stooq_sym(symbol)
    days = PERIOD_DAYS.get(period, 180)
    d2 = datetime.now()
    d1 = d2 - timedelta(days=days)
    url = (
        f"https://stooq.com/q/d/l/"
        f"?s={sym}"
        f"&d1={d1.strftime('%Y%m%d')}"
        f"&d2={d2.strftime('%Y%m%d')}"
        f"&i=d"
    )
    try:
        r = httpx.get(url, headers=HEADERS, timeout=12, follow_redirects=True)
        reader = csv.DictReader(io.StringIO(r.text))
        result = []
        for row in reader:
            o = _clean(row.get("Open"))
            h = _clean(row.get("High"))
            l = _clean(row.get("Low"))
            c = _clean(row.get("Close"))
            if None in (o, h, l, c):
                continue
            result.append({
                "time":   row.get("Date", "")[:10],
                "open":   o, "high": h, "low": l, "close": c,
                "volume": int(float(row.get("Volume") or 0)),
            })
        print(f"[STOOQ] {symbol} → {sym} : {len(result)} bougies")
        return result
    except Exception as e:
        print(f"[STOOQ ERROR] {symbol}: {e}")
        return []


def get_quote(symbol: str) -> dict:
    candles = get_history(symbol, "5d")
    if not candles:
        return {"symbol": symbol, "price": None}
    last = candles[-1]
    prev = candles[-2] if len(candles) >= 2 else None
    price = last["close"]
    prev_close = prev["close"] if prev else None
    change = round(price - prev_close, 2) if prev_close else None
    pct = round((change / prev_close) * 100, 2) if prev_close and change else None
    return {
        "symbol":     symbol,
        "price":      price,
        "prev_close": prev_close,
        "change":     change,
        "change_pct": pct,
        "volume":     last["volume"],
        "market_cap": None,
        "currency":   "EUR",
    }


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
