from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pathlib import Path

# Chemin absolu vers le .env, peu importe d'où uvicorn est lancé
load_dotenv(Path(__file__).parent / ".env", override=True)

from routers import stocks, news, simulator, analysis

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
