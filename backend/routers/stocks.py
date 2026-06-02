from fastapi import APIRouter, HTTPException
from services.yahoo_finance import get_quote, get_history, get_indicators, search_symbols

router = APIRouter(prefix="/stocks", tags=["stocks"])


@router.get("/quote/{symbol}")
def quote(symbol: str):
    data = get_quote(symbol.upper())
    if not data.get("price"):
        raise HTTPException(404, f"Symbole {symbol} introuvable")
    return data


@router.get("/history/{symbol}")
def history(symbol: str, period: str = "6mo", interval: str = "1d"):
    data = get_history(symbol.upper(), period, interval)
    if not data:
        raise HTTPException(404, f"Pas d'historique pour {symbol}")
    return data


@router.get("/indicators/{symbol}")
def indicators(symbol: str):
    data = get_indicators(symbol.upper())
    return data


@router.get("/search")
def search(q: str):
    return search_symbols(q)
