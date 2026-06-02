from fastapi import APIRouter
from services.rss_scraper import fetch_all_news
from typing import Optional

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/")
def get_news(symbol: Optional[str] = None):
    return fetch_all_news(symbol)
