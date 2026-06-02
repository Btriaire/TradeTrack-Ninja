import yfinance as yf
import pandas as pd
from typing import Optional

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False


def get_quote(symbol: str) -> dict:
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        price = float(info.last_price) if info.last_price else None
        prev  = float(info.previous_close) if info.previous_close else None
        return {
            "symbol": symbol,
            "price": round(price, 2) if price else None,
            "prev_close": round(prev, 2) if prev else None,
            "change": round(price - prev, 2) if price and prev else None,
            "change_pct": round(((price - prev) / prev) * 100, 2) if price and prev else None,
            "volume": info.three_month_average_volume,
            "market_cap": info.market_cap,
            "currency": info.currency,
        }
    except Exception as e:
        print(f"[QUOTE ERROR] {symbol}: {e}")
        return {"symbol": symbol, "price": None, "error": str(e)}


def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        if df.empty:
            return []
        df = df.reset_index()
        # Gère les deux formats de colonne date selon la version yfinance
        date_col = "Datetime" if "Datetime" in df.columns else "Date"
        df[date_col] = df[date_col].astype(str)
        return [
            {
                "time": str(row[date_col])[:10],
                "open":   round(float(row["Open"]),   2),
                "high":   round(float(row["High"]),   2),
                "low":    round(float(row["Low"]),    2),
                "close":  round(float(row["Close"]),  2),
                "volume": int(row["Volume"]),
            }
            for _, row in df.iterrows()
        ]
    except Exception as e:
        print(f"[HISTORY ERROR] {symbol}: {e}")
        return []


def get_indicators(symbol: str, period: str = "6mo") -> dict:
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval="1d")
        if df.empty or len(df) < 20:
            return {}

        close = df["Close"]
        sma20 = float(close.rolling(20).mean().iloc[-1])
        sma50 = float(close.rolling(50).mean().iloc[-1]) if len(df) >= 50 else None

        if not TA_AVAILABLE:
            return {"sma20": round(sma20, 2), "sma50": round(sma50, 2) if sma50 else None, "signal": "NEUTRE"}

        rsi        = float(ta.momentum.RSIIndicator(close, window=14).rsi().iloc[-1])
        macd_obj   = ta.trend.MACD(close)
        macd       = float(macd_obj.macd().iloc[-1])
        macd_sig   = float(macd_obj.macd_signal().iloc[-1])
        bb         = ta.volatility.BollingerBands(close, window=20)

        return {
            "rsi":          round(rsi, 2),
            "macd":         round(macd, 4),
            "macd_signal":  round(macd_sig, 4),
            "bb_upper":     round(float(bb.bollinger_hband().iloc[-1]), 2),
            "bb_lower":     round(float(bb.bollinger_lband().iloc[-1]), 2),
            "sma20":        round(sma20, 2),
            "sma50":        round(sma50, 2) if sma50 else None,
            "signal":       _signal(rsi, macd, macd_sig),
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
        ticker = yf.Ticker(query)
        info = ticker.info
        return [{
            "symbol":   query.upper(),
            "name":     info.get("longName", query),
            "exchange": info.get("exchange", ""),
            "type":     info.get("quoteType", ""),
        }]
    except Exception:
        return []
