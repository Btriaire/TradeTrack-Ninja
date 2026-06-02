"""
Service de données financières — utilise Twelve Data API (gratuit, 800 req/jour)
Fallback sur yfinance si TWELVE_DATA_KEY non configuré (dev local uniquement)
"""
import os
import httpx
import math
import pandas as pd
from typing import Optional

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False

TWELVE_DATA_BASE = "https://api.twelvedata.com"

# Conversion suffixes Yahoo Finance → Twelve Data exchange
EXCHANGE_MAP = {
    ".PA": ("EURONEXT", "EUR"),  # Paris
    ".AS": ("EURONEXT", "EUR"),  # Amsterdam
    ".BR": ("EURONEXT", "EUR"),  # Bruxelles
    ".DE": ("XETRA",    "EUR"),  # Frankfurt
    ".L":  ("LSE",      "GBP"),  # Londres
    ".MI": ("MIL",      "EUR"),  # Milan
    ".MC": ("BME",      "EUR"),  # Madrid
}

def _td_symbol(symbol: str) -> tuple[str, str]:
    """Convertit MC.PA → ('MC', 'EURONEXT')"""
    for suffix, (exchange, _) in EXCHANGE_MAP.items():
        if symbol.upper().endswith(suffix):
            return symbol[:-len(suffix)].upper(), exchange
    return symbol.upper(), "NASDAQ"  # US par défaut


def _clean(val) -> Optional[float]:
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)
    except Exception:
        return None


def _td_key() -> str:
    return os.getenv("TWELVE_DATA_KEY", "")


def get_quote(symbol: str) -> dict:
    key = _td_key()
    if not key:
        return _yf_quote(symbol)
    try:
        td_sym, exchange = _td_symbol(symbol)
        # Stats complémentaires
        r2 = httpx.get(f"{TWELVE_DATA_BASE}/quote", params={
            "symbol": td_sym, "exchange": exchange, "apikey": key
        }, timeout=10)
        q = r2.json()
        if q.get("status") == "error":
            raise Exception(q.get("message", "TD error"))

        price = _clean(q.get("close"))
        prev  = _clean(q.get("previous_close"))
        change = _clean(q.get("change"))
        pct    = _clean(q.get("percent_change"))

        return {
            "symbol":     symbol,
            "price":      price,
            "prev_close": prev,
            "change":     change,
            "change_pct": pct,
            "volume":     q.get("volume"),
            "market_cap": None,
            "currency":   q.get("currency", "EUR"),
        }
    except Exception as e:
        print(f"[TD QUOTE ERROR] {symbol}: {e}")
        return _yf_quote(symbol)


def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    key = _td_key()
    if not key:
        return _yf_history(symbol, period, interval)
    try:
        # Convertir période en outputsize
        output_map = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365, "2y": 730, "5y": 1825}
        outputsize = output_map.get(period, 180)

        interval_map = {"1d": "1day", "1wk": "1week", "1mo": "1month"}
        td_interval = interval_map.get(interval, "1day")

        td_sym, exchange = _td_symbol(symbol)
        r = httpx.get(f"{TWELVE_DATA_BASE}/time_series", params={
            "symbol":     td_sym,
            "exchange":   exchange,
            "interval":   td_interval,
            "outputsize": outputsize,
            "apikey":     key,
        }, timeout=15)
        data = r.json()

        if data.get("status") == "error":
            print(f"[TD HISTORY ERROR] {symbol}: {data.get('message')}")
            return _yf_history(symbol, period, interval)

        candles = []
        for item in reversed(data.get("values", [])):
            o = _clean(item.get("open"))
            h = _clean(item.get("high"))
            l = _clean(item.get("low"))
            c = _clean(item.get("close"))
            if None in (o, h, l, c):
                continue
            candles.append({
                "time":   item["datetime"][:10],
                "open":   o, "high": h, "low": l, "close": c,
                "volume": int(item.get("volume", 0) or 0),
            })
        return candles
    except Exception as e:
        print(f"[TD HISTORY ERROR] {symbol}: {e}")
        return _yf_history(symbol, period, interval)


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
            "rsi":         rsi,
            "macd":        macd,
            "macd_signal": macd_sig,
            "bb_upper":    _clean(bb.bollinger_hband().iloc[-1]),
            "bb_lower":    _clean(bb.bollinger_lband().iloc[-1]),
            "sma20":       sma20,
            "sma50":       sma50,
            "signal":      _signal(rsi or 50, macd or 0, macd_sig or 0),
        }
    except Exception as e:
        print(f"[INDICATORS ERROR] {symbol}: {e}")
        return {}


def _signal(rsi: float, macd: float, macd_signal: float) -> str:
    bullish = bearish = 0
    if rsi < 40:   bullish += 1
    elif rsi > 65: bearish += 1
    if macd > macd_signal: bullish += 1
    else:                  bearish += 1
    if bullish > bearish: return "HAUSSIER"
    if bearish > bullish: return "BAISSIER"
    return "NEUTRE"


def search_symbols(query: str) -> list[dict]:
    return [{"symbol": query.upper(), "name": query.upper(), "exchange": "", "type": ""}]


# ── Fallback yfinance (dev local) ──────────────────────────────────────────────
def _yf_quote(symbol: str) -> dict:
    try:
        import yfinance as yf
        import requests
        s = requests.Session()
        s.headers.update({"User-Agent": "Mozilla/5.0"})
        ticker = yf.Ticker(symbol, session=s)
        info = ticker.fast_info
        price = _clean(info.last_price)
        prev  = _clean(info.previous_close)
        return {
            "symbol": symbol, "price": price, "prev_close": prev,
            "change": round(price - prev, 2) if price and prev else None,
            "change_pct": round(((price - prev) / prev) * 100, 2) if price and prev else None,
            "volume": info.three_month_average_volume,
            "market_cap": info.market_cap, "currency": info.currency,
        }
    except Exception as e:
        return {"symbol": symbol, "price": None, "error": str(e)}


def _yf_history(symbol: str, period: str, interval: str) -> list[dict]:
    try:
        import yfinance as yf
        df = yf.download(symbol, period=period, interval=interval, progress=False, auto_adjust=True)
        if df.empty:
            return []
        df = df.reset_index()
        date_col = "Datetime" if "Datetime" in df.columns else "Date"
        result = []
        for _, row in df.iterrows():
            o, h, l, c = _clean(row["Open"]), _clean(row["High"]), _clean(row["Low"]), _clean(row["Close"])
            if None in (o, h, l, c):
                continue
            result.append({"time": str(row[date_col])[:10], "open": o, "high": h, "low": l, "close": c, "volume": int(row.get("Volume", 0) or 0)})
        return result
    except Exception as e:
        print(f"[YF FALLBACK ERROR] {symbol}: {e}")
        return []
