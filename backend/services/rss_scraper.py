"""
RSS scraper — fetch parallèle + cache 5 min
Toutes les sources sont récupérées simultanément pour éviter les timeouts.
"""
import feedparser
import httpx
import asyncio
import time
from datetime import datetime
from typing import Optional

SOURCES = {
    "Boursorama":      "https://www.boursorama.com/rss/actus-societes",
    "Figaro Economie": "https://www.lefigaro.fr/rss/figaro_economie.xml",
    "Zonebourse":      "https://www.zonebourse.com/rss/news.xml",
    "Les Echos":       "https://www.lesechos.fr/rss/rss_finance.xml",
}

# Sources de secours si les principales échouent
FALLBACK_SOURCES = {
    "Reuters Finance": "https://feeds.reuters.com/reuters/businessNews",
    "Yahoo Finance":   "https://finance.yahoo.com/rss/topstories",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

# Cache : {"all": (timestamp, articles)}
_cache: dict = {}
CACHE_TTL = 300  # 5 minutes


def _cached() -> Optional[list]:
    entry = _cache.get("all")
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _store(articles: list) -> list:
    _cache["all"] = (time.time(), articles)
    return articles


def _parse_date(entry) -> str:
    for attr in ("published", "updated"):
        val = getattr(entry, attr, None)
        if val:
            try:
                return val[:25]
            except Exception:
                pass
    return datetime.now().isoformat()


async def _fetch_source_async(
    client: httpx.AsyncClient,
    name: str,
    url: str,
) -> list[dict]:
    try:
        resp = await client.get(url, timeout=6)
        if resp.status_code >= 400:
            print(f"[RSS] {name} → HTTP {resp.status_code}")
            return []
        feed = feedparser.parse(resp.text)
        articles = []
        for entry in feed.entries[:15]:
            title   = entry.get("title", "").strip()
            summary = entry.get("summary", entry.get("description", "")).strip()
            link    = entry.get("link", "")
            if not title:
                continue
            articles.append({
                "source":  name,
                "title":   title,
                "summary": summary[:400],
                "url":     link,
                "date":    _parse_date(entry),
            })
        print(f"[RSS] {name} → {len(articles)} articles")
        return articles
    except Exception as e:
        print(f"[RSS ERROR] {name}: {e}")
        return []


async def _fetch_all_async(sources: dict) -> list[dict]:
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        tasks = [
            _fetch_source_async(client, name, url)
            for name, url in sources.items()
        ]
        results = await asyncio.gather(*tasks)

    all_articles = [a for source_list in results for a in source_list]
    all_articles.sort(key=lambda x: x["date"], reverse=True)
    return all_articles


def fetch_all_news(symbol_filter: Optional[str] = None) -> list[dict]:
    # Pas de cache si on filtre par symbole
    if not symbol_filter:
        cached = _cached()
        if cached is not None:
            print(f"[RSS] Cache hit — {len(cached)} articles")
            return cached

    # Fetch parallèle sources principales
    try:
        articles = asyncio.run(_fetch_all_async(SOURCES))
    except RuntimeError:
        # asyncio.run() ne fonctionne pas dans une boucle déjà active
        loop = asyncio.new_event_loop()
        articles = loop.run_until_complete(_fetch_all_async(SOURCES))
        loop.close()

    # Si moins de 3 articles, tenter les sources de secours
    if len(articles) < 3:
        print("[RSS] Sources principales insuffisantes — tentative fallback")
        try:
            fallback = asyncio.run(_fetch_all_async(FALLBACK_SOURCES))
        except RuntimeError:
            loop = asyncio.new_event_loop()
            fallback = loop.run_until_complete(_fetch_all_async(FALLBACK_SOURCES))
            loop.close()
        articles = (articles + fallback)
        articles.sort(key=lambda x: x["date"], reverse=True)

    # Filtrer par symbole si demandé (ex: "MC.PA" → cherche "LVMH" etc.)
    if symbol_filter:
        ticker = symbol_filter.split(".")[0].lower()
        filtered = [
            a for a in articles
            if ticker in (a["title"] + a["summary"]).lower()
        ]
        return filtered if filtered else articles  # fallback: toutes les actus

    return _store(articles)
