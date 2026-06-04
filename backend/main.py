from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from dotenv import load_dotenv
from pathlib import Path

# Chemin absolu vers le .env, peu importe d'où uvicorn est lancé
load_dotenv(Path(__file__).parent / ".env", override=True)

from routers import stocks, news, simulator, analysis, signals

app = FastAPI(title="TradeTrack-Ninja API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://trade-track-ninja.vercel.app",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)

app.include_router(stocks.router)
app.include_router(news.router)
app.include_router(simulator.router)
app.include_router(analysis.router)
app.include_router(signals.router)


@app.get("/")
def root():
    return {"status": "ok", "app": "TradeTrack-Ninja", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/ping")
def ping():
    """Keep-alive endpoint — frontend l'appelle au chargement pour réveiller Render."""
    return {"pong": True}


@app.on_event("startup")
def warmup_cache():
    """
    Warmup minimal au démarrage — NE PAS lancer les signaux automatiquement.
    Render free tier = 512 MB. Lancer compute_signals() au boot = pic mémoire
    immédiat → OOM kill. Les signaux se calculent à la première requête.
    On pré-chauffe uniquement les 5 indices + 5 quotes les plus demandées.
    """
    import threading
    from services.yahoo_finance import get_live_quote

    WARM_SYMBOLS = ["^FCHI", "^GSPC", "^IXIC", "^GDAXI", "^FTSE",
                    "MC.PA", "AIR.PA", "AAPL", "MSFT", "NVDA"]

    def _warm():
        for sym in WARM_SYMBOLS:
            try:
                get_live_quote(sym)
            except Exception:
                pass
        print(f"[WARMUP] {len(WARM_SYMBOLS)} quotes pré-chargées")

    threading.Thread(target=_warm, daemon=True).start()


@app.get("/debug/env")
def debug_env():
    import os
    gemini = os.getenv("GEMINI_API_KEY", "")
    av     = os.getenv("ALPHA_VANTAGE_KEY", "")
    return {
        "gemini_key_set":        bool(gemini),
        "alpha_vantage_key_set": bool(av),
        "alpha_vantage_preview": av[:8] + "..." if av else "VIDE",
    }

@app.get("/debug/news")
async def debug_news():
    """Teste chaque source RSS individuellement pour voir laquelle répond."""
    import httpx, asyncio
    from services.rss_scraper import SOURCES, SOURCES_FR, HEADERS
    results = {}
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        for name, url in {**SOURCES, **SOURCES_FR}.items():
            try:
                r = await client.get(url, timeout=6)
                results[name] = {"status": r.status_code, "size": len(r.text)}
            except Exception as e:
                results[name] = {"status": "ERROR", "error": type(e).__name__}
    return results


@app.get("/debug/quote/{symbol}")
def debug_quote(symbol: str):
    """Teste get_quote (via /chart) pour un symbole donné."""
    from services.yahoo_finance import get_quote
    q = get_quote(symbol)
    return {
        "symbol":     symbol,
        "price":      q.get("price"),
        "change_pct": q.get("change_pct"),
        "volume":     q.get("volume"),
        "currency":   q.get("currency"),
        "error":      q.get("error"),
        "ok":         q.get("price") is not None,
    }


@app.get("/debug/av/{symbol}")
def debug_alphavantage(symbol: str):
    import os, httpx
    from services.yahoo_finance import _av_symbol, get_history
    av_sym = _av_symbol(symbol)
    key    = os.getenv("ALPHA_VANTAGE_KEY", "")
    # Appel brut pour voir la réponse exacte d'AV
    try:
        r    = httpx.get("https://www.alphavantage.co/query", params={
            "function": "GLOBAL_QUOTE", "symbol": av_sym, "apikey": key,
        }, timeout=10)
        raw  = r.json()
    except Exception as e:
        raw = {"error": str(e)}
    data = get_history(symbol, "1mo")
    return {
        "av_symbol":     av_sym,
        "key_loaded":    bool(key),
        "key_preview":   key[:8] + "..." if key else "VIDE",
        "av_raw_quote":  raw,
        "candles_count": len(data),
        "last":          data[-1] if data else None,
    }
