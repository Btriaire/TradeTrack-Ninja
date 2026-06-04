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

def _extract_article(html: str, url: str) -> dict:
    """
    Extraction légère d'article — stdlib uniquement, pas de dépendance externe.
    Stratégie : cherche <article>, <main>, ou div avec class content/article/body.
    """
    import html as html_module

    def _og(prop: str) -> str:
        """Extrait une balise OG meta."""
        m = re.search(
            rf'<meta[^>]+(?:property|name)=["\'](?:og:)?{prop}["\'][^>]+content=["\']([^"\']+)["\']',
            html, re.I
        )
        if not m:
            m = re.search(
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:)?{prop}["\']',
                html, re.I
            )
        return m.group(1).strip() if m else ""

    def _strip(raw: str) -> str:
        """Supprime balises HTML, décode entités, nettoie espaces."""
        # Supprimer scripts/styles
        raw = re.sub(r'<(script|style|nav|header|footer|aside|form|button)[^>]*>.*?</\1>', ' ', raw, flags=re.S | re.I)
        # Supprimer toutes les balises
        raw = re.sub(r'<[^>]+>', ' ', raw)
        # Décoder entités HTML
        raw = html_module.unescape(raw)
        # Nettoyer espaces multiples
        raw = re.sub(r'\s{2,}', '\n', raw).strip()
        return raw

    # 1. Cherche le bloc de contenu principal (dans l'ordre de préférence)
    content_block = ""
    patterns = [
        r'<article[^>]*>(.*?)</article>',
        r'<div[^>]+class=["\'][^"\']*(?:article-body|article-content|entry-content|post-content|story-body|article__body|articleBody|main-content|content-body)[^"\']*["\'][^>]*>(.*?)</div\s*>',
        r'<main[^>]*>(.*?)</main>',
    ]
    for pat in patterns:
        m = re.search(pat, html, re.S | re.I)
        if m:
            content_block = m.group(1)
            break

    # 2. Si rien trouvé → body complet (moins précis)
    if not content_block:
        m = re.search(r'<body[^>]*>(.*?)</body>', html, re.S | re.I)
        content_block = m.group(1) if m else html

    text = _strip(content_block)

    # Garder seulement les lignes suffisamment longues (évite menus/boutons)
    lines = [l.strip() for l in text.split('\n') if len(l.strip()) > 40]
    content = '\n'.join(lines)

    return {
        "url":      url,
        "content":  content,
        "title":    _og("title") or _og("og:title") or "",
        "image":    _og("image") or _og("og:image") or "",
        "author":   _og("author") or "",
        "sitename": _og("site_name") or "",
    }


@router.get("/article")
async def get_article_content(url: str = Query(..., description="URL de l'article à scraper")):
    """Scrape le contenu complet d'un article depuis son URL (extraction stdlib)."""
    # Cache
    if url in _article_cache:
        ts, data = _article_cache[url]
        if time.time() - ts < ARTICLE_CACHE_TTL:
            return data

    try:
        async with httpx.AsyncClient(headers=_SCRAPE_HEADERS, follow_redirects=True, timeout=12) as client:
            r = await client.get(url)

        if r.status_code >= 400:
            return {"url": url, "content": "", "title": "", "image": None, "author": None, "sitename": ""}

        result = _extract_article(r.text, url)
        _article_cache[url] = (time.time(), result)
        return result

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
