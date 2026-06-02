from fastapi import APIRouter
from services.rss_scraper import _fetch_all_async, _cached, _store, SOURCES, FALLBACK_SOURCES
from typing import Optional
import httpx

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/")
async def get_news(symbol: Optional[str] = None):
    # Pas de cache si filtre actif
    if not symbol:
        cached = _cached()
        if cached is not None:
            return cached

    # Fetch parallèle
    articles = await _fetch_all_async(SOURCES)

    # Fallback si trop peu d'articles
    if len(articles) < 3:
        fallback = await _fetch_all_async(FALLBACK_SOURCES)
        articles = sorted(articles + fallback, key=lambda x: x["date"], reverse=True)

    # Filtre par ticker (ex "MC.PA" → cherche "mc" dans titre/résumé)
    if symbol:
        ticker = symbol.split(".")[0].lower()
        filtered = [
            a for a in articles
            if ticker in (a["title"] + a["summary"]).lower()
        ]
        return filtered if filtered else articles

    return _store(articles)
