import yfinance as yf
import pandas as pd
from typing import Optional
import ta


def get_quote(symbol: str) -> dict:
    ticker = yf.Ticker(symbol)
    info = ticker.fast_info
    return {
        "symbol": symbol,
        "price": round(info.last_price, 2) if info.last_price else None,
        "prev_close": round(info.previous_close, 2) if info.previous_close else None,
        "change": round(info.last_price - info.previous_close, 2) if info.last_price and info.previous_close else None,
        "change_pct": round(((info.last_price - info.previous_close) / info.previous_close) * 100, 2) if info.last_price and info.previous_close else None,
        "volume": info.three_month_average_volume,
        "market_cap": info.market_cap,
        "currency": info.currency,
    }


def get_history(symbol: str, period: str = "6mo", interval: str = "1d") -> list[dict]:
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval)
    if df.empty:
        return []
    df = df.reset_index()
    df["Date"] = df["Date"].astype(str)
    return [
        {
            "time": row["Date"][:10],
            "open": round(row["Open"], 2),
            "high": round(row["High"], 2),
            "low": round(row["Low"], 2),
            "close": round(row["Close"], 2),
            "volume": int(row["Volume"]),
        }
        for _, row in df.iterrows()
    ]


def get_indicators(symbol: str, period: str = "6mo") -> dict:
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval="1d")
    if df.empty or len(df) < 20:
        return {}

    close = df["Close"]
    rsi = ta.momentum.RSIIndicator(close, window=14).rsi().iloc[-1]
    macd_obj = ta.trend.MACD(close)
    macd = macd_obj.macd().iloc[-1]
    macd_signal = macd_obj.macd_signal().iloc[-1]
    bb = ta.volatility.BollingerBands(close, window=20)
    sma20 = close.rolling(20).mean().iloc[-1]
    sma50 = close.rolling(50).mean().iloc[-1] if len(df) >= 50 else None

    return {
        "rsi": round(float(rsi), 2),
        "macd": round(float(macd), 4),
        "macd_signal": round(float(macd_signal), 4),
        "bb_upper": round(float(bb.bollinger_hband().iloc[-1]), 2),
        "bb_lower": round(float(bb.bollinger_lband().iloc[-1]), 2),
        "sma20": round(float(sma20), 2),
        "sma50": round(float(sma50), 2) if sma50 else None,
        "signal": _signal(float(rsi), float(macd), float(macd_signal)),
    }


def _signal(rsi: float, macd: float, macd_signal: float) -> str:
    bullish = 0
    bearish = 0
    if rsi < 40:
        bullish += 1
    elif rsi > 65:
        bearish += 1
    if macd > macd_signal:
        bullish += 1
    else:
        bearish += 1
    if bullish > bearish:
        return "HAUSSIER"
    elif bearish > bullish:
        return "BAISSIER"
    return "NEUTRE"


def search_symbols(query: str) -> list[dict]:
    ticker = yf.Ticker(query)
    try:
        info = ticker.info
        return [{
            "symbol": query.upper(),
            "name": info.get("longName", query),
            "exchange": info.get("exchange", ""),
            "type": info.get("quoteType", ""),
        }]
    except Exception:
        return []
