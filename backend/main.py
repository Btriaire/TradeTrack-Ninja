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

@app.get("/debug/stooq/{symbol}")
def debug_stooq(symbol: str):
    from services.yahoo_finance import _stooq_sym, get_history
    stooq = _stooq_sym(symbol)
    data  = get_history(symbol, "1mo")
    return {"stooq_symbol": stooq, "candles_count": len(data), "last": data[-1] if data else None}
