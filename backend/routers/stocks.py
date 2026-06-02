from fastapi import APIRouter, HTTPException
from services.yahoo_finance import get_quote, get_history, get_indicators, search_symbols

router = APIRouter(prefix="/stocks", tags=["stocks"])


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
        print(f"[ROUTE ERROR] /quote/{symbol}: {e}")
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
        print(f"[ROUTE ERROR] /history/{symbol}: {e}")
        raise HTTPException(500, str(e))


@router.get("/indicators/{symbol}")
def indicators(symbol: str):
    try:
        return get_indicators(symbol.upper())
    except Exception as e:
        print(f"[ROUTE ERROR] /indicators/{symbol}: {e}")
        return {}


@router.get("/search")
def search(q: str):
    return search_symbols(q)
