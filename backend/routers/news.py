from fastapi import APIRouter
from services.rss_scraper import _fetch_all_async, _cached, _store, SOURCES, SOURCES_FR
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
