from fastapi import APIRouter, Query, HTTPException
from services.rss_scraper import _fetch_all_async, _cached, _store, SOURCES, SOURCES_FR, fetch_general_news_async, SOURCES_GENERAL
from typing import Optional
import httpx, time, re

router = APIRouter(prefix="/news", tags=["news"])

# ── Cache scraping articles (évite de re-scraper le même article) ────────────
_article_cache: dict = {}
ARTICLE_CACHE_TTL = 86400  # 24h — un article ne change pas

_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

@router.get("/article")
async def get_article_content(url: str = Query(..., description="URL de l'article à scraper")):
    """
    Scrape le contenu complet d'un article depuis son URL.
    Utilise trafilatura pour extraire le texte principal.
    """
    # Cache
    if url in _article_cache:
        ts, data = _article_cache[url]
        if time.time() - ts < ARTICLE_CACHE_TTL:
            return data

    try:
        import trafilatura

        async with httpx.AsyncClient(headers=_SCRAPE_HEADERS, follow_redirects=True, timeout=12) as client:
            r = await client.get(url)

        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Source returned {r.status_code}")

        html = r.text

        # Extraction contenu principal
        content = trafilatura.extract(
            html,
            include_comments=False,
            include_tables=False,
            favor_precision=True,
            no_fallback=False,
        )

        # Extraction métadonnées (titre, image, date, auteur)
        meta = trafilatura.extract_metadata(html, default_url=url)

        # Image OG en fallback
        og_image = None
        m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if not m:
            m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html, re.I)
        if m:
            og_image = m.group(1)

        # Auteur
        author = None
        if meta:
            author = getattr(meta, 'author', None)

        result = {
            "url":      url,
            "content":  content or "",
            "title":    (meta.title if meta else None) or "",
            "image":    og_image or (meta.image if meta else None) or None,
            "author":   author,
            "sitename": (meta.sitename if meta else None) or "",
        }

        _article_cache[url] = (time.time(), result)
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ARTICLE SCRAPE] {url}: {e}")
        return {"url": url, "content": "", "title": "", "image": None, "author": None, "sitename": ""}


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
