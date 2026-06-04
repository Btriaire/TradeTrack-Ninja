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
async def get_indices():
    """Retourne les cotations des principaux indices boursiers."""
    import asyncio

    async def fetch_index(name: str, symbol: str) -> dict:
        try:
            url = "https://query1.finance.yahoo.com/v8/finance/quote"
            async with httpx.AsyncClient(headers=HEADERS) as client:
                r = await client.get(
                    url,
                    params={"symbols": symbol, "fields": "regularMarketPrice,regularMarketChangePercent,regularMarketChange,marketState"},
                    timeout=6,
                )
            result = r.json().get("quoteResponse", {}).get("result", [])
            if not result:
                return None
            q = result[0]
            market_state = q.get("marketState", "CLOSED")
            return {
                "name":         name,
                "symbol":       symbol,
                "price":        round(q.get("regularMarketPrice", 0), 2),
                "change_pct":   round(q.get("regularMarketChangePercent", 0), 2),
                "change":       round(q.get("regularMarketChange", 0), 2),
                "market_state": market_state,
                "is_open":      market_state == "REGULAR",
            }
        except Exception as e:
            print(f"[INDEX ERROR] {name}: {e}")
            return None

    tasks   = [fetch_index(name, sym) for name, sym in INDICES.items()]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
