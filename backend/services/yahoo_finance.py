"""
Service données financières — Yahoo Finance API directe (sans librairie yfinance)
- Pas de quota quotidien (contrairement à Alpha Vantage 25/jour)
- Cache mémoire 30 min pour limiter les appels
- Supporte tous les marchés : .PA, .DE, .L, .AS, US...
"""
import httpx, math, time, threading, gc, pandas as pd
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    import ta
    TA_AVAILABLE = True
except Exception:
    TA_AVAILABLE = False

# ── Cache LRU borné ──────────────────────────────────────────────────────────
# Render free tier = 512 MB RAM. Sans limite, 40 symboles × historiques × pandas
# font exploser la mémoire. On garde au max MAX_ENTRIES entrées valides.
_cache: dict = {}
CACHE_TTL    = 1800   # 30 minutes
MAX_ENTRIES  = 80     # ~60 symboles actifs + marge

def _evict():
    """Supprime d'abord les entrées expirées, puis les plus anciennes si dépassement."""
    now = time.time()
    # 1. Expirations
    expired = [k for k, (ts, _) in _cache.items() if (now - ts) >= CACHE_TTL]
    for k in expired:
        del _cache[k]
    # 2. Si encore trop plein → éviction LRU (les plus anciens d'abord)
    if len(_cache) > MAX_ENTRIES:
        oldest = sorted(_cache, key=lambda k: _cache[k][0])
        for k in oldest[:len(_cache) - MAX_ENTRIES]:
            del _cache[k]

def _cached(key: str):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None

def _store(key: str, data):
    if len(_cache) >= MAX_ENTRIES:
        _evict()
    _cache[key] = (time.time(), data)
    return data

# ── Déduplication des requêtes concurrentes (cache stampede prevention) ──────
# Si 3 requêtes arrivent en même temps pour le même symbole, une seule fait
# l'appel HTTP ; les 2 autres attendent qu'elle finisse puis lisent le cache.
_inflight: dict[str, threading.Event] = {}
_inflight_lock = threading.Lock()

def _dedup_fetch(key: str, fetch_fn):
    """
    Exécute fetch_fn() en s'assurant qu'une seule requête tourne à la fois
    pour ce cache key. Les autres threads attendent et lisent le cache résultant.
    """
    # Déjà en cache ?
    cached = _cached(key)
    if cached is not None:
        return cached

    with _inflight_lock:
        # Double-check après acquisition du lock
        cached = _cached(key)
        if cached is not None:
            return cached

        # Quelqu'un est déjà en train de fetcher ce key ?
        if key in _inflight:
            evt = _inflight[key]
        else:
            evt = threading.Event()
            _inflight[key] = evt
            evt = None  # on est le premier → on fait le fetch

    if evt is not None:
        # Attendre que le premier thread finisse (max 15s)
        evt.wait(timeout=15)
        return _cached(key)

    # On est le premier → fetch
    try:
        result = fetch_fn()
        return result
    finally:
        with _inflight_lock:
            done_evt = _inflight.pop(key, None)
        if done_evt:
            done_evt.set()

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

# ── Heures de trading par fuseau (heure locale, lundi-vendredi) ──────────────
# Format : liste de (open_minutes, close_minutes) depuis minuit
_TRADING_HOURS: dict[str, list[tuple[int, int]]] = {
    "America/New_York":    [(570, 960)],         # 9h30-16h00 ET
    "America/Chicago":     [(570, 960)],          # CME (ajuste à la NY)
    "America/Los_Angeles": [(390, 780)],          # 6h30-13h PT (suit NY)
    "Europe/Paris":        [(540, 1050)],         # 9h00-17h30 CET/CEST
    "Europe/Berlin":       [(540, 1050)],
    "Europe/Amsterdam":    [(540, 1050)],
    "Europe/Brussels":     [(540, 1050)],
    "Europe/Madrid":       [(540, 1050)],
    "Europe/Milan":        [(540, 1050)],
    "Europe/Lisbon":       [(540, 1050)],
    "Europe/Zurich":       [(540, 1050)],
    "Europe/Stockholm":    [(540, 1050)],
    "Europe/Oslo":         [(540, 1050)],
    "Europe/Copenhagen":   [(540, 1050)],
    "Europe/Helsinki":     [(540, 1050)],
    "Europe/Warsaw":       [(540, 1050)],
    "Europe/Vienna":       [(540, 1050)],
    "Europe/London":       [(480, 990)],          # 8h00-16h30 GMT/BST
    "Europe/Dublin":       [(480, 990)],
    "Asia/Tokyo":          [(540, 690), (750, 930)],  # 9h-11h30 + 12h30-15h30 JST
    "Asia/Seoul":          [(540, 900)],          # 9h-15h KST
    "Asia/Shanghai":       [(570, 690), (780, 900)],  # 9h30-11h30 + 13h-15h CST
    "Asia/Hong_Kong":      [(570, 720), (780, 960)],  # 9h30-12h + 13h-16h HKT
    "Asia/Singapore":      [(540, 720), (810, 990)],
    "Australia/Sydney":    [(600, 990)],          # 10h-16h30 AEST
    "America/Sao_Paulo":   [(600, 1050)],         # 10h-17h30 BRT
}

def _infer_market_state(meta: dict) -> str:
    """
    Infère l'état du marché depuis le timezone de l'exchange.
    Yahoo Finance /chart ne retourne pas 'marketState' dans le meta.
    Fallback: âge de regularMarketTime si timezone inconnu.
    """
    tz_name = meta.get("exchangeTimezoneName", "")
    rmt     = meta.get("regularMarketTime", 0)
    now_ts  = time.time()

    # ── Fallback rapide : si la dernière cotation est < 3 min → OUVERT ──────
    # (fiable pour interval=2m — si une transaction vient d'avoir lieu)
    age_min = (now_ts - rmt) / 60 if rmt else 9999
    if age_min < 3:
        return "REGULAR"

    # ── Inférence par fuseau horaire ─────────────────────────────────────────
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, Exception):
        # Timezone inconnu → fallback âge
        return "REGULAR" if age_min < 8 else "CLOSED"

    now_local = datetime.now(tz)
    weekday   = now_local.weekday()   # 0=lundi, 5=sam, 6=dim

    if weekday >= 5:
        return "CLOSED"

    t = now_local.hour * 60 + now_local.minute

    slots = _TRADING_HOURS.get(tz_name)
    if slots:
        for open_m, close_m in slots:
            if open_m <= t < close_m:
                return "REGULAR"
        # Vérifier pré/post pour US (America/New_York)
        if tz_name.startswith("America/"):
            if 240 <= t < 570:   return "PRE"   # 4h00-9h30
            if 960 <= t < 1200:  return "POST"  # 16h00-20h00
        return "CLOSED"

    # ── Timezone connu mais pas dans notre table : fallback âge ──────────────
    return "REGULAR" if age_min < 60 else "CLOSED"


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


def get_batch_quotes(symbols: list) -> dict:
    """
    Récupère les cotations de plusieurs symboles en UN SEUL appel HTTP.
    ~40x plus rapide que des appels individuels pour la page Marchés.
    Utilise /v8/finance/quote (même endpoint que les indices — fonctionnel sur IPs cloud).
    """
    if not symbols:
        return {}

    # Séparer ce qui est déjà en cache
    result: dict = {}
    missing: list = []
    for s in symbols:
        cached = _cached(f"quote:{s}")
        if cached is not None:
            result[s] = cached
        else:
            missing.append(s)

    if not missing:
        return result

    # Batch par chunks de 20 (limite sécurisée Yahoo)
    CHUNK = 20
    for i in range(0, len(missing), CHUNK):
        chunk = missing[i:i + CHUNK]
        url   = "https://query1.finance.yahoo.com/v8/finance/quote"
        try:
            r = httpx.get(
                url,
                params={
                    "symbols": ",".join(chunk),
                    "fields":  (
                        "regularMarketPrice,regularMarketChange,"
                        "regularMarketChangePercent,regularMarketVolume,"
                        "regularMarketPreviousClose,currency,shortName"
                    ),
                },
                headers=HEADERS,
                timeout=10,
                follow_redirects=True,
            )
            items = r.json().get("quoteResponse", {}).get("result", [])
            for item in items:
                sym   = item.get("symbol")
                if not sym:
                    continue
                price = _clean(item.get("regularMarketPrice"))
                prev  = _clean(item.get("regularMarketPreviousClose"))
                pct   = _clean(item.get("regularMarketChangePercent"))
                chg   = _clean(item.get("regularMarketChange"))
                vol   = item.get("regularMarketVolume")
                q = {
                    "symbol":     sym,
                    "price":      price,
                    "prev_close": prev,
                    "change":     chg,
                    "change_pct": round(pct, 2) if pct is not None else None,
                    "volume":     vol,
                    "market_cap": None,
                    "currency":   item.get("currency", "EUR"),
                    "sparkline":  [],   # non disponible en batch — chargé lazily
                }
                _store(f"quote:{sym}", q)
                result[sym] = q
        except Exception as e:
            print(f"[BATCH QUOTES] chunk {chunk[:3]}… erreur: {e}")
            # Fallback: individual calls for failed chunks
            for s in chunk:
                try:
                    result[s] = get_quote(s)
                except Exception:
                    result[s] = {"symbol": s, "price": None}

    return result


# ── Live quote (cache 8s, intervalle 2m) ─────────────────────────────────────
_live_cache: dict = {}
LIVE_TTL     = 8    # secondes
MAX_LIVE     = 50   # max entrées simultanées

def _live_evict():
    now = time.time()
    expired = [k for k, (ts, _) in _live_cache.items() if (now - ts) >= LIVE_TTL * 30]
    for k in expired:
        del _live_cache[k]
    if len(_live_cache) > MAX_LIVE:
        oldest = sorted(_live_cache, key=lambda k: _live_cache[k][0])
        for k in oldest[:len(_live_cache) - MAX_LIVE]:
            del _live_cache[k]

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
        market_state = _infer_market_state(meta)   # chart API n'expose pas marketState
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
        if len(_live_cache) >= MAX_LIVE:
            _live_evict()
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
        # Utiliser uniquement les 120 dernières bougies (6 mois max) pour limiter la mémoire
        closes_raw = [c["close"] for c in candles[-120:]]
        close = pd.Series(closes_raw, dtype="float32")   # float32 = moitié de float64
        sma20 = _clean(close.rolling(20).mean().iloc[-1])
        sma50 = _clean(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None
        if not TA_AVAILABLE:
            del close
            return {"sma20": sma20, "sma50": sma50, "signal": "NEUTRE"}
        rsi      = _clean(ta.momentum.RSIIndicator(close, window=14).rsi().iloc[-1])
        macd_obj = ta.trend.MACD(close)
        macd     = _clean(macd_obj.macd().iloc[-1])
        macd_sig = _clean(macd_obj.macd_signal().iloc[-1])
        bb       = ta.volatility.BollingerBands(close, window=20)
        bb_upper = _clean(bb.bollinger_hband().iloc[-1])
        bb_lower = _clean(bb.bollinger_lband().iloc[-1])
        sig      = _signal(rsi or 50, macd or 0, macd_sig or 0)
        # Libérer explicitement — pandas retient les références sinon
        del close, macd_obj, bb
        return {
            "rsi": rsi, "macd": macd, "macd_signal": macd_sig,
            "bb_upper": bb_upper, "bb_lower": bb_lower,
            "sma20": sma20, "sma50": sma50,
            "signal": sig,
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
MAX_INTRADAY = 25   # symboles actifs en même temps

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
            "market_state": _infer_market_state(meta),
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
        # Éviction LRU si cache plein
        if len(_intraday_cache) >= MAX_INTRADAY:
            oldest = min(_intraday_cache, key=lambda k: _intraday_cache[k][0])
            del _intraday_cache[oldest]
        _intraday_cache[key] = (time.time(), out)
        return out

    except Exception as e:
        print(f"[INTRADAY] {symbol}/{interval}: {e}")
        return {"symbol": symbol, "candles": [], "session": {}, "market_state": "CLOSED"}


# ── Profil société ────────────────────────────────────────────────────────────
_profile_cache: dict = {}
PROFILE_TTL = 6 * 3600  # 6 heures

def get_profile(symbol: str) -> dict:
    """Profil complet de la société via Yahoo Finance quoteSummary."""
    key = f"profile:{symbol}"
    entry = _profile_cache.get(key)
    if entry and (time.time() - entry[0]) < PROFILE_TTL:
        return entry[1]

    modules = "assetProfile,defaultKeyStatistics,financialData,summaryDetail,price"
    url = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"

    try:
        r = httpx.get(
            url,
            params={"modules": modules, "formatted": "false"},
            headers=HEADERS,
            timeout=12,
            follow_redirects=True,
        )
        data = r.json()
        result = data.get("quoteSummary", {}).get("result")
        if not result:
            err = data.get("quoteSummary", {}).get("error", {})
            print(f"[PROFILE] {symbol} erreur: {err}")
            return {}

        res = result[0]

        # ── assetProfile ──────────────────────────────────────────────────
        asset = res.get("assetProfile", {})
        # CEO : premier officier avec "Chief Executive" dans le titre
        officers = asset.get("companyOfficers", [])
        ceo = next(
            (o.get("name", "") for o in officers
             if "chief executive" in o.get("title", "").lower()
             or "ceo" in o.get("title", "").lower()),
            officers[0].get("name", "") if officers else ""
        )
        # Année de fondation (rarement disponible dans YF, on met null)
        founded = asset.get("foundedYear") or None

        # ── summaryDetail ────────────────────────────────────────────────
        sd = res.get("summaryDetail", {})

        # ── defaultKeyStatistics ─────────────────────────────────────────
        ks = res.get("defaultKeyStatistics", {})

        # ── financialData ────────────────────────────────────────────────
        fd = res.get("financialData", {})

        # ── price ────────────────────────────────────────────────────────
        pr = res.get("price", {})

        def val(d: dict, *keys):
            """Extrait la valeur numérique brute (pas le dict formatted)."""
            for k in keys:
                v = d.get(k)
                if v is None:
                    continue
                if isinstance(v, dict):
                    v = v.get("raw") or v.get("fmt") or None
                if v is not None:
                    return v
            return None

        profile = {
            # Identité
            "symbol":       symbol,
            "name":         val(pr, "longName", "shortName") or symbol,
            "sector":       asset.get("sector", ""),
            "industry":     asset.get("industry", ""),
            "country":      asset.get("country", ""),
            "city":         asset.get("city", ""),
            "website":      asset.get("website", ""),
            "description":  asset.get("longBusinessSummary", ""),
            "employees":    val(asset, "fullTimeEmployees"),
            "ceo":          ceo,
            "founded":      founded,
            # Valorisation
            "market_cap":   val(pr, "marketCap"),
            "enterprise_value": val(ks, "enterpriseValue"),
            "pe_trailing":  val(sd, "trailingPE"),
            "pe_forward":   val(ks, "forwardPE"),
            "peg_ratio":    val(ks, "pegRatio"),
            "price_to_book": val(ks, "priceToBook"),
            "beta":         val(ks, "beta"),
            "dividend_yield": val(sd, "dividendYield"),
            "52w_high":     val(sd, "fiftyTwoWeekHigh"),
            "52w_low":      val(sd, "fiftyTwoWeekLow"),
            # Financiers
            "revenue":      val(fd, "totalRevenue"),
            "revenue_growth": val(fd, "revenueGrowth"),
            "ebitda":       val(fd, "ebitda"),
            "profit_margin": val(fd, "profitMargins"),
            "roe":          val(fd, "returnOnEquity"),
            "debt_to_equity": val(fd, "debtToEquity"),
            "current_ratio": val(fd, "currentRatio"),
            "currency":     val(pr, "currency"),
        }

        print(f"[PROFILE] {symbol}: ok (secteur={profile['sector']})")
        _profile_cache[key] = (time.time(), profile)
        return profile

    except Exception as e:
        print(f"[PROFILE ERROR] {symbol}: {e}")
        return {}
