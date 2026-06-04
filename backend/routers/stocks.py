from fastapi import APIRouter, HTTPException
import httpx
from services.yahoo_finance import get_quote, get_history, get_indicators, get_live_quote, get_intraday, get_profile

router = APIRouter(prefix="/stocks", tags=["stocks"])

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

# Indices majeurs
INDICES = {
    "CAC 40":       "^FCHI",
    "DAX":          "^GDAXI",
    "S&P 500":      "^GSPC",
    "NASDAQ":       "^IXIC",
    "Euro Stoxx 50":"^STOXX50E",
    "FTSE 100":     "^FTSE",
    "Nikkei 225":   "^N225",
    "AEX":          "^AEX",
    "IBEX 35":      "^IBEX",
    "BEL 20":       "^BFX",
}

# Suffixes Yahoo Finance par marché
MARKET_SUFFIX = {
    "FR": ".PA",  # Euronext Paris
    "DE": ".DE",  # XETRA Frankfurt
    "GB": ".L",   # London Stock Exchange
    "NL": ".AS",  # Euronext Amsterdam
    "BE": ".BR",  # Euronext Bruxelles
    "ES": ".MC",  # Bolsa Madrid
    "IT": ".MI",  # Borsa Italiana
    "US": "",     # NYSE / NASDAQ
    "JP": ".T",   # Tokyo
}


@router.get("/quote/{symbol}")
def quote(symbol: str):
    try:
        data = get_quote(symbol.upper())
        if not data.get("price"):
            raise HTTPException(404, f"Symbole {symbol} introuvable")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/live/{symbol}")
def live(symbol: str):
    """Quote pseudo-temps-réel : cache 8s, bougies 2min, marketState inclus."""
    return get_live_quote(symbol.upper())


@router.get("/intraday/{symbol}")
def intraday(symbol: str, interval: str = "5m"):
    """Bougies intraday du jour (1m/5m/15m/30m) + stats séance (VWAP, H/L/Vol)."""
    return get_intraday(symbol.upper(), interval)


@router.get("/profile/{symbol}")
def profile(symbol: str):
    """Profil complet de la société : secteur, CEO, CA, EBITDA, ratios…"""
    try:
        data = get_profile(symbol.upper())
        if not data:
            raise HTTPException(404, f"Profil introuvable pour {symbol}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/targets/{symbol}")
def get_targets(symbol: str):
    """
    Consensus analystes : price targets + distribution buy/hold/sell.
    Données Yahoo Finance via yfinance (agrège 10-50 brokers).
    Cache 12h (les targets bougent peu).
    """
    import yfinance as yf, time

    sym = symbol.upper()

    # Cache simple 12h
    cache_key = f"_targets_{sym}"
    import routers.stocks as _self
    if not hasattr(_self, "_targets_cache"):
        _self._targets_cache = {}
    cached = _self._targets_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < 43200:
        return cached[1]

    try:
        t    = yf.Ticker(sym)
        info = t.info

        current = info.get("currentPrice") or info.get("regularMarketPrice") or 0

        # Prix cibles analystes
        target_mean   = info.get("targetMeanPrice")
        target_high   = info.get("targetHighPrice")
        target_low    = info.get("targetLowPrice")
        target_median = info.get("targetMedianPrice")
        reco_mean     = info.get("recommendationMean")   # 1=Strong Buy → 5=Strong Sell
        reco_key      = info.get("recommendationKey", "")  # "buy","hold","sell"…
        nb_analysts   = info.get("numberOfAnalystOpinions", 0)

        # Distribution buy/hold/sell (mois courant)
        dist = {"strongBuy": 0, "buy": 0, "hold": 0, "sell": 0, "strongSell": 0}
        try:
            recs = t.recommendations
            if recs is not None and not recs.empty:
                row = recs[recs["period"] == "0m"]
                if not row.empty:
                    for k in dist:
                        dist[k] = int(row.iloc[0].get(k, 0))
        except Exception:
            pass

        # Upside potentiel
        upside_mean = round((target_mean / current - 1) * 100, 1) if current and target_mean else None

        result = {
            "symbol":        sym,
            "current_price": current,
            "target_mean":   target_mean,
            "target_median": target_median,
            "target_high":   target_high,
            "target_low":    target_low,
            "upside_mean":   upside_mean,
            "recommendation_key":  reco_key,
            "recommendation_score": reco_mean,   # 1.0=Strong Buy, 5.0=Strong Sell
            "nb_analysts":   nb_analysts,
            "distribution":  dist,
        }

        _self._targets_cache[cache_key] = (time.time(), result)
        print(f"[TARGETS] {sym}: target={target_mean}, upside={upside_mean}%, n={nb_analysts}")
        return result

    except Exception as e:
        print(f"[TARGETS ERROR] {sym}: {e}")
        return {"symbol": sym, "error": str(e)}


@router.get("/history/{symbol}")
def history(symbol: str, period: str = "6mo", interval: str = "1d"):
    try:
        data = get_history(symbol.upper(), period, interval)
        if not data:
            raise HTTPException(404, f"Pas d'historique pour {symbol}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/indicators/{symbol}")
def indicators(symbol: str):
    try:
        return get_indicators(symbol.upper())
    except Exception as e:
        return {}


@router.get("/search")
def search(q: str, market: str = "ALL"):
    """Recherche de valeurs via Yahoo Finance, filtrable par marché."""
    if len(q.strip()) < 1:
        return []
    try:
        r = httpx.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={
                "q":           q,
                "quotesCount": 20,
                "newsCount":   0,
                "listsCount":  0,
                "lang":        "fr-FR",
            },
            headers=HEADERS,
            timeout=8,
        )
        quotes = r.json().get("quotes", [])

        results = []
        suffix = MARKET_SUFFIX.get(market.upper(), None)

        for item in quotes:
            sym      = item.get("symbol", "")
            name     = item.get("shortname") or item.get("longname") or sym
            exchange = item.get("exchange", "")
            qtype    = item.get("quoteType", "")

            # Filtrer: seulement actions + ETF, pas les cryptos ni forex
            if qtype not in ("EQUITY", "ETF", "INDEX"):
                continue
            # Filtre par marché si demandé
            if market.upper() != "ALL" and suffix is not None:
                if not sym.endswith(suffix) and suffix != "":
                    continue
                if suffix == "" and ("." in sym):
                    continue  # US = pas de suffixe

            results.append({
                "symbol":   sym,
                "name":     name,
                "exchange": exchange,
                "type":     qtype,
                "market":   market,
            })

        return results[:15]

    except Exception as e:
        print(f"[SEARCH ERROR] {e}")
        return []


@router.get("/markets")
def get_markets():
    """Retourne toutes les valeurs de l'univers avec leurs cotations.
    Utilise get_quote (basé sur /chart, prouvé fonctionnel sur Render)."""
    from services.signal_engine import UNIVERSE
    from services.yahoo_finance import get_batch_quotes

    symbols = [s["symbol"] for s in UNIVERSE]
    batch   = get_batch_quotes(symbols)
    results = []
    for stock in UNIVERSE:
        sym = stock["symbol"]
        q   = batch.get(sym, {})
        results.append({
            **stock,
            "price":      q.get("price")      or 0,
            "change_pct": q.get("change_pct") or 0,
            "volume":     q.get("volume")     or 0,
            "market_cap": 0,
            "day_high":   0,
            "day_low":    0,
        })

    filled = sum(1 for r in results if r["price"] > 0)
    print(f"[MARKETS BATCH] {filled}/{len(UNIVERSE)} cotations récupérées")
    return results


@router.get("/sectors")
def get_sectors():
    """Valeurs enrichies avec secteur, cotations et score pépite."""
    from services.signal_engine import UNIVERSE, _cache as sig_cache
    from services.yahoo_finance import get_batch_quotes

    # Construire la map des scores depuis le cache signaux
    score_map: dict = {}
    gem_buy:   set  = set()
    gem_sell:  set  = set()
    if sig_cache.get("data"):
        for s in sig_cache["data"].get("great_catch", []):
            score_map[s["symbol"]] = s.get("score", 0)
            gem_buy.add(s["symbol"])
        for s in sig_cache["data"].get("stay_away", []):
            score_map[s["symbol"]] = s.get("score", 0)
            gem_sell.add(s["symbol"])

    # Batch quotes en 1 seul appel
    symbols   = [s["symbol"] for s in UNIVERSE]
    batch     = get_batch_quotes(symbols)

    results = []
    for stock in UNIVERSE:
        sym  = stock["symbol"]
        q    = batch.get(sym, {})
        pct  = q.get("change_pct") or 0
        gem  = None
        if sym in gem_buy:
            gem = "buy"
        elif sym in gem_sell:
            gem = "sell"
        elif pct >= 3.0:
            gem = "momentum+"
        elif pct <= -4.0:
            gem = "dip"
        results.append({
            **stock,
            "price":      q.get("price")      or 0,
            "change_pct": pct,
            "volume":     q.get("volume")      or 0,
            "score":      score_map.get(sym, 0),
            "gem":        gem,
            "sparkline":  q.get("sparkline", []),
        })

    return results


@router.get("/indices")
def get_indices():
    """Retourne les cotations des principaux indices boursiers.
    Utilise /v8/finance/chart (même que get_live_quote) — fonctionne sur IPs cloud.
    /v8/finance/quote est bloqué sur Render."""
    from services.yahoo_finance import get_live_quote
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def fetch_one(name: str, symbol: str):
        try:
            q = get_live_quote(symbol)
            if not q.get("price"):
                return None
            return {
                "name":         name,
                "symbol":       symbol,
                "price":        q.get("price", 0),
                "change_pct":   q.get("change_pct", 0) or 0,
                "change":       q.get("change", 0) or 0,
                "market_state": q.get("market_state", "CLOSED"),
                "is_open":      q.get("is_open", False),
            }
        except Exception as e:
            print(f"[INDEX ERROR] {name}: {e}")
            return None

    results = []
    with ThreadPoolExecutor(max_workers=len(INDICES)) as pool:
        futures = {pool.submit(fetch_one, name, sym): name for name, sym in INDICES.items()}
        for future in as_completed(futures):
            r = future.result()
            if r:
                results.append(r)

    # Trier dans l'ordre original
    order = list(INDICES.keys())
    results.sort(key=lambda x: order.index(x["name"]) if x["name"] in order else 99)
    return results
