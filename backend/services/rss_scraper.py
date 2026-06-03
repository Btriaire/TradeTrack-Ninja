"""
RSS scraper — fetch parallèle + cache 5 min
Sources fiables qui n'bloquent pas les IPs cloud.
"""
import feedparser
import httpx
import asyncio
import time
from datetime import datetime
from typing import Optional

# Sources principales — testées sur serveurs cloud
SOURCES = {
    "Investing.com":   "https://www.investing.com/rss/news_301.rss",
    "MarketWatch":     "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
    "Yahoo Finance":   "https://finance.yahoo.com/rss/topstories",
    "Seeking Alpha":   "https://seekingalpha.com/market_currents.xml",
}

# Sources françaises (bloquent parfois les IPs cloud — tentées en 2nd)
SOURCES_FR = {
    "Boursorama":      "https://www.boursorama.com/rss/actus-societes",
    "Figaro Economie": "https://www.lefigaro.fr/rss/figaro_economie.xml",
    "Zonebourse":      "https://www.zonebourse.com/rss/news.xml",
    "BFM Business":    "https://www.bfmtv.com/rss/economie/",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/rss+xml, application/xml, text/xml, */*",
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
        resp = await client.get(url, timeout=7)
        if resp.status_code >= 400:
            print(f"[RSS] {name} → HTTP {resp.status_code}")
            return []
        feed = feedparser.parse(resp.text)
        articles = []
        for entry in feed.entries[:12]:
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
        print(f"[RSS ERROR] {name}: {type(e).__name__}")
        return []


async def _fetch_all_async(sources: dict) -> list[dict]:
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(*[
            _fetch_source_async(client, name, url)
            for name, url in sources.items()
        ])
    all_articles = [a for lst in results for a in lst]
    all_articles.sort(key=lambda x: x["date"], reverse=True)
    return all_articles


def fetch_all_news(symbol_filter: Optional[str] = None) -> list[dict]:
    if not symbol_filter:
        cached = _cached()
        if cached is not None:
            print(f"[RSS] Cache hit — {len(cached)} articles")
            return cached

    # Fetch parallèle sources principales (internationales, fiables)
    try:
        articles = asyncio.run(_fetch_all_async(SOURCES))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        articles = loop.run_until_complete(_fetch_all_async(SOURCES))
        loop.close()

    # Si insuffisant, tenter aussi les sources françaises
    if len(articles) < 5:
        print("[RSS] Tentative sources françaises...")
        try:
            fr = asyncio.run(_fetch_all_async(SOURCES_FR))
        except RuntimeError:
            loop = asyncio.new_event_loop()
            fr = loop.run_until_complete(_fetch_all_async(SOURCES_FR))
            loop.close()
        articles = sorted(articles + fr, key=lambda x: x["date"], reverse=True)

    if symbol_filter:
        ticker   = symbol_filter.split(".")[0].lower()
        filtered = [a for a in articles if ticker in (a["title"] + a["summary"]).lower()]
        return filtered if filtered else articles

    return _store(articles)
