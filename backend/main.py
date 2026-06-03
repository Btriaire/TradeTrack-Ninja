from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
async def debug_quote(symbol: str):
    """Teste la cotation Yahoo Finance pour un symbole donné."""
    import httpx
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Referer": "https://finance.yahoo.com/",
    }
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=10) as client:
            r = await client.get(
                "https://query1.finance.yahoo.com/v8/finance/quote",
                params={"symbols": symbol},
            )
        raw = r.json()
        result = raw.get("quoteResponse", {}).get("result", [])
        return {
            "symbol": symbol,
            "status": r.status_code,
            "found":  len(result) > 0,
            "price":  result[0].get("regularMarketPrice") if result else None,
            "change_pct": result[0].get("regularMarketChangePercent") if result else None,
            "raw_keys": list(result[0].keys()) if result else [],
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}


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
