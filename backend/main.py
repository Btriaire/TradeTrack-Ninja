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
    import httpx
    from services.yahoo_finance import _stooq_sym, get_history, HEADERS
    from datetime import datetime, timedelta
    stooq = _stooq_sym(symbol)
    d2 = datetime.now()
    d1 = d2 - timedelta(days=30)
    url = f"https://stooq.com/q/d/l/?s={stooq}&d1={d1.strftime('%Y%m%d')}&d2={d2.strftime('%Y%m%d')}&i=d"
    r = httpx.get(url, headers=HEADERS, timeout=12, follow_redirects=True)
    data = get_history(symbol, "1mo")
    return {
        "stooq_symbol": stooq,
        "url": url,
        "status_code": r.status_code,
        "raw_response": r.text[:500],
        "candles_count": len(data),
    }
