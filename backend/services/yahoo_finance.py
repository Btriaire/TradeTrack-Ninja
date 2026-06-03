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
# Utilise le endpoint /chart (même que l'historique) car /quote est bloqué
# sur les IPs cloud. Le meta de la réponse contient le prix en temps réel.
def get_quote(symbol: str) -> dict:
    cache_key = f"quote:{symbol}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    try:
        r = httpx.get(url, params={
            "interval":       "1d",
            "range":          "5d",
            "includePrePost": "false",
        }, headers=HEADERS, timeout=12, follow_redirects=True)

        data   = r.json()
        result = data.get("chart", {}).get("result")
        if not result:
            err = data.get("chart", {}).get("error", {})
            print(f"[YF QUOTE] {symbol} pas de résultat: {err}")
            return {"symbol": symbol, "price": None}

        meta  = result[0].get("meta", {})
        price = _clean(meta.get("regularMarketPrice"))
        prev  = _clean(meta.get("chartPreviousClose") or meta.get("previousClose"))
        vol   = meta.get("regularMarketVolume")

        change, pct = None, None
        if price and prev and prev != 0:
            change = round(price - prev, 2)
            pct    = round((price - prev) / prev * 100, 2)

        # Sparkline — extraire les closes des 5 derniers jours
        q0         = result[0].get("indicators", {}).get("quote", [{}])[0]
        raw_closes = q0.get("close", [])
        sparkline  = [round(c, 2) for c in raw_closes if c is not None][-7:]

        result_dict = {
            "symbol":     symbol,
            "price":      price,
            "prev_close": prev,
            "change":     change,
            "change_pct": pct,
            "volume":     vol,
            "market_cap": None,
            "currency":   meta.get("currency", "EUR"),
            "sparkline":  sparkline,
        }
        return _store(cache_key, result_dict)

    except Exception as e:
        print(f"[YF QUOTE ERROR] {symbol}: {e}")
        return {"symbol": symbol, "price": None, "error": str(e)}


# ── Live quote (cache 8s, intervalle 2m) ─────────────────────────────────────
_live_cache: dict = {}
LIVE_TTL = 8   # secondes — fraîcheur maximale sans spammer Yahoo

def get_live_quote(symbol: str) -> dict:
    """
    Prix le plus récent disponible (Yahoo ~15min de délai sur abonnement gratuit).
    Cache 8s pour permettre un polling frontend régulier sans saturer Yahoo.
    """
    key   = f"live:{symbol}"
    entry = _live_cache.get(key)
    if entry and (time.time() - entry[0]) < LIVE_TTL:
        return entry[1]

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    try:
        r = httpx.get(url, params={
            "interval":       "2m",   # bougies 2min → dernière clôture très récente
            "range":          "1d",
            "includePrePost": "true",
        }, headers=HEADERS, timeout=10, follow_redirects=True)

        data   = r.json()
        result = data.get("chart", {}).get("result")
        if not result:
            return {"symbol": symbol, "price": None, "market_state": "CLOSED", "is_open": False}

        meta         = result[0].get("meta", {})
        price        = _clean(meta.get("regularMarketPrice"))
        prev         = _clean(meta.get("chartPreviousClose") or meta.get("previousClose"))
        market_state = meta.get("marketState", "CLOSED")   # REGULAR | PRE | POST | CLOSED
        mkt_time     = meta.get("regularMarketTime")        # unix timestamp

        change, pct = None, None
        if price and prev and prev != 0:
            change = round(price - prev, 2)
            pct    = round((price - prev) / prev * 100, 2)

        # Dernière bougie 2min si disponible (prix intraday frais)
        q0      = result[0].get("indicators", {}).get("quote", [{}])[0]
        closes  = [c for c in q0.get("close", []) if c is not None]
        if closes and market_state == "REGULAR":
            fresh = _clean(closes[-1])
            if fresh:
                price  = fresh
                if prev and prev != 0:
                    change = round(price - prev, 2)
                    pct    = round(change / prev * 100, 2)

        out = {
            "symbol":       symbol,
            "price":        price,
            "change":       change,
            "change_pct":   pct,
            "volume":       meta.get("regularMarketVolume"),
            "high":         _clean(meta.get("regularMarketDayHigh")),
            "low":          _clean(meta.get("regularMarketDayLow")),
            "market_state": market_state,
            "market_time":  mkt_time,
            "is_open":      market_state == "REGULAR",
            "currency":     meta.get("currency", "EUR"),
            "delay_min":    15,   # délai Yahoo Finance gratuit en minutes
        }
        _live_cache[key] = (time.time(), out)
        return out

    except Exception as e:
        print(f"[LIVE QUOTE] {symbol}: {e}")
        return {"symbol": symbol, "price": None, "market_state": "CLOSED", "is_open": False}


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


# ── Intraday (bougies séance courante) ────────────────────────────────────────
_intraday_cache: dict = {}

def get_intraday(symbol: str, interval: str = "5m") -> dict:
    """
    Bougies intraday du jour courant avec stats de séance.
    Cache : 60s pour 1m, 3min pour 5m, 10min pour 15m+
    """
    valid = {"1m", "2m", "5m", "15m", "30m", "60m"}
    if interval not in valid:
        interval = "5m"

    ttl = 60 if interval == "1m" else 180 if interval in ("2m", "5m") else 600
    key = f"intraday:{symbol}:{interval}"
    entry = _intraday_cache.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    try:
        r = httpx.get(url, params={
            "interval":       interval,
            "range":          "1d",
            "includePrePost": "true",
        }, headers=HEADERS, timeout=12, follow_redirects=True)

        data   = r.json()
        result = data.get("chart", {}).get("result")
        if not result:
            return {"symbol": symbol, "candles": [], "session": {}, "market_state": "CLOSED"}

        meta       = result[0].get("meta", {})
        timestamps = result[0].get("timestamp", []) or []
        q0         = result[0].get("indicators", {}).get("quote", [{}])[0]

        opens   = q0.get("open",   [])
        highs   = q0.get("high",   [])
        lows    = q0.get("low",    [])
        closes  = q0.get("close",  [])
        volumes = q0.get("volume", [])

        candles = []
        for i, ts in enumerate(timestamps):
            c = closes[i]  if i < len(closes)  else None
            if c is None:
                continue
            o = opens[i]   if i < len(opens)   else c
            h = highs[i]   if i < len(highs)   else c
            l = lows[i]    if i < len(lows)    else c
            v = volumes[i] if i < len(volumes) else 0
            candles.append({
                "time":   int(ts),
                "open":   round(float(o), 4) if o else c,
                "high":   round(float(h), 4) if h else c,
                "low":    round(float(l), 4) if l else c,
                "close":  round(float(c), 4),
                "volume": int(v) if v else 0,
            })

        # ── Stats de séance ───────────────────────────────────────────────
        session_open  = candles[0]["open"]  if candles else None
        session_high  = max(c["high"]  for c in candles) if candles else None
        session_low   = min(c["low"]   for c in candles) if candles else None
        total_vol     = sum(c["volume"] for c in candles)
        current       = _clean(meta.get("regularMarketPrice")) or (candles[-1]["close"] if candles else None)

        # VWAP = Σ(typical_price × volume) / Σ(volume)
        vwap = None
        if total_vol > 0:
            num = sum(((c["high"] + c["low"] + c["close"]) / 3) * c["volume"] for c in candles)
            vwap = round(num / total_vol, 2)

        delta_open = None
        if current and session_open and session_open != 0:
            delta_open = round((current - session_open) / session_open * 100, 2)

        out = {
            "symbol":       symbol,
            "interval":     interval,
            "candles":      candles,
            "market_state": meta.get("marketState", "CLOSED"),
            "session": {
                "open":        round(session_open, 2)  if session_open else None,
                "high":        round(session_high, 2)  if session_high else None,
                "low":         round(session_low, 2)   if session_low  else None,
                "vwap":        vwap,
                "volume":      total_vol,
                "current":     current,
                "delta_open":  delta_open,
            },
        }
        _intraday_cache[key] = (time.time(), out)
        return out

    except Exception as e:
        print(f"[INTRADAY] {symbol}/{interval}: {e}")
        return {"symbol": symbol, "candles": [], "session": {}, "market_state": "CLOSED"}
