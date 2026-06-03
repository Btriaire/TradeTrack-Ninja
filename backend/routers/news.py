from fastapi import APIRouter
from services.rss_scraper import _fetch_all_async, _cached, _store, SOURCES, SOURCES_FR, fetch_general_news_async, SOURCES_GENERAL
from typing import Optional

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/")
async def get_news(symbol: Optional[str] = None):
    if not symbol:
        cached = _cached()
        if cached is not None:
            return cached

    articles = await _fetch_all_async(SOURCES)

    if len(articles) < 3:
        fallback = await _fetch_all_async(SOURCES_FR)
        articles = sorted(articles + fallback, key=lambda x: x["date"], reverse=True)

    if symbol:
        ticker   = symbol.split(".")[0].lower()
        filtered = [a for a in articles if ticker in (a["title"] + a["summary"]).lower()]
        return filtered if filtered else articles

    return _store(articles)


@router.get("/general")
async def get_general_news(category: Optional[str] = None):
    """
    Actualités financières générales — toutes sources + catégories.
    Sources: Les Echos, BFM Business, Capital, Figaro, Boursorama, Zone Bourse,
             La Tribune, Reuters, CNBC, Guardian Business, MarketWatch,
             Investing.com, Yahoo Finance, Seeking Alpha, WSJ Markets.
    """
    articles = await fetch_general_news_async()
    if category and category != "Tout":
        articles = [a for a in articles if a.get("category") == category]
    return articles


@router.get("/sources")
async def get_sources():
    """Retourne la liste des sources utilisées avec leur catégorie."""
    return [
        {"name": name, "category": cat, "flag": flag, "url": url}
        for name, (url, cat, flag) in SOURCES_GENERAL.items()
    ]
