import yfinance as yf
import pandas as pd
import requests
import math
from typing import Optional

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False

# Session avec User-Agent pour éviter le rate limit Yahoo Finance
_session = requests.Session()
_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
})


def _clean(val) -> Optional[float]:
    """Retourne None si la valeur est NaN/Inf, sinon arrondit à 2 décimales."""
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 2)
    except Exception:
        return None


def get_quote(symbol: str) -> dict:
    try:
        ticker = yf.Ticker(symbol, session=_session)
        info = ticker.fast_info
        price = _clean(info.last_price)
        prev  = _clean(info.previous_close)
        return {
            "symbol":     symbol,
            "price":      price,
            "prev_close": prev,
            "change":     round(price - prev, 2) if price and prev else None,
            "change_pct": round(((price - prev) / prev) * 100, 2) if price and prev else None,
            "volume":     info.three_month_average_volume,
            "market_cap": info.market_cap,
            "currency":   info.currency,
        }
    except Exception as e:
        print(f"[QUOTE ERROR] {symbol}: {e}")
        return {"symbol": symbol, "price": None, "error": str(e)}


def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    try:
        ticker = yf.Ticker(symbol, session=_session)
        df = ticker.history(period=period, interval=interval)
        if df.empty:
            return []
        df = df.reset_index()
        date_col = "Datetime" if "Datetime" in df.columns else "Date"
        df[date_col] = df[date_col].astype(str)

        result = []
        for _, row in df.iterrows():
            o = _clean(row["Open"])
            h = _clean(row["High"])
            l = _clean(row["Low"])
            c = _clean(row["Close"])
            # Ignorer les bougies incomplètes
            if None in (o, h, l, c):
                continue
            result.append({
                "time":   str(row[date_col])[:10],
                "open":   o,
                "high":   h,
                "low":    l,
                "close":  c,
                "volume": int(row["Volume"]) if not math.isnan(float(row["Volume"])) else 0,
            })
        return result
    except Exception as e:
        print(f"[HISTORY ERROR] {symbol}: {e}")
        return []


def get_indicators(symbol: str, period: str = "6mo") -> dict:
    try:
        ticker = yf.Ticker(symbol, session=_session)
        df = ticker.history(period=period, interval="1d")
        if df.empty or len(df) < 20:
            return {}

        close = df["Close"]
        sma20 = _clean(close.rolling(20).mean().iloc[-1])
        sma50 = _clean(close.rolling(50).mean().iloc[-1]) if len(df) >= 50 else None

        if not TA_AVAILABLE:
            return {"sma20": sma20, "sma50": sma50, "signal": "NEUTRE"}

        rsi       = _clean(ta.momentum.RSIIndicator(close, window=14).rsi().iloc[-1])
        macd_obj  = ta.trend.MACD(close)
        macd      = _clean(macd_obj.macd().iloc[-1])
        macd_sig  = _clean(macd_obj.macd_signal().iloc[-1])
        bb        = ta.volatility.BollingerBands(close, window=20)
        bb_upper  = _clean(bb.bollinger_hband().iloc[-1])
        bb_lower  = _clean(bb.bollinger_lband().iloc[-1])

        return {
            "rsi":         rsi,
            "macd":        macd,
            "macd_signal": macd_sig,
            "bb_upper":    bb_upper,
            "bb_lower":    bb_lower,
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
    try:
        ticker = yf.Ticker(query, session=_session)
        info = ticker.info
        return [{"symbol": query.upper(), "name": info.get("longName", query),
                 "exchange": info.get("exchange", ""), "type": info.get("quoteType", "")}]
    except Exception:
        return []
