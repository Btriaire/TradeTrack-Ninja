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
    key = os.getenv("GEMINI_API_KEY", "")
    td  = os.getenv("TWELVE_DATA_KEY", "")
    return {
        "gemini_key_set": bool(key),
        "twelve_data_key_set": bool(td),
        "twelve_data_preview": td[:8] + "..." if td else "VIDE",
    }

@app.get("/debug/fh/{symbol}")
def debug_finnhub(symbol: str):
    from services.yahoo_finance import _fh_symbol, get_history
    fh_sym = _fh_symbol(symbol)
    data   = get_history(symbol, "1mo")
    return {
        "finnhub_symbol": fh_sym,
        "candles_count":  len(data),
        "last": data[-1] if data else None,
    }
