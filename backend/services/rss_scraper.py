"""
RSS scraper — fetch parallèle + cache
Stratégie sources : FR en priorité (IP cloud moins bloquées),
puis international. Seeking Alpha / Investing.com / WSJ retirés
(bloquent systématiquement les IPs Render).
"""
import feedparser
import httpx
import asyncio
import re
import time
from datetime import datetime
from typing import Optional

# ── Sources primaires — fiables sur IP cloud ───────────────────────────────────
SOURCES = {
    # France — rarement bloquées
    "BFM Business":     "https://bfmbusiness.bfmtv.com/rss/info/",
    "Boursorama":       "https://www.boursorama.com/rss/actus-societes",
    "Figaro Economie":  "https://www.lefigaro.fr/rss/figaro_economie.xml",
    "Zone Bourse":      "https://www.zonebourse.com/rss/news.xml",
    # International — généralement accessibles
    "Yahoo Finance":    "https://finance.yahoo.com/rss/topstories",
    "CNBC":             "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "Reuters":          "https://feeds.reuters.com/reuters/businessNews",
}

# ── Sources fallback ───────────────────────────────────────────────────────────
SOURCES_FR = {
    "Capital.fr":       "https://www.capital.fr/feed",
    "La Tribune":       "https://www.latribune.fr/rss.html",
}

# ── Sources générales — onglet Actualités ─────────────────────────────────────
SOURCES_GENERAL = {
    # France fiables cloud ✅
    "BFM Business":     ("https://bfmbusiness.bfmtv.com/rss/info/",                     "France",        "🇫🇷"),
    "Boursorama":       ("https://www.boursorama.com/rss/actus-societes",                "Marchés FR",    "🇫🇷"),
    "Figaro Economie":  ("https://www.lefigaro.fr/rss/figaro_economie.xml",              "France",        "🇫🇷"),
    "Zone Bourse":      ("https://www.zonebourse.com/rss/news.xml",                      "Marchés FR",    "🇫🇷"),
    "Capital.fr":       ("https://www.capital.fr/feed",                                  "France",        "🇫🇷"),
    "La Tribune":       ("https://www.latribune.fr/rss.html",                            "France",        "🇫🇷"),
    "Les Echos":        ("https://www.lesechos.fr/arc/outboundfeeds/rss/?outputType=xml","France",        "🇫🇷"),
    # International ✅
    "CNBC":             ("https://www.cnbc.com/id/100003114/device/rss/rss.html",        "International", "🌍"),
    "Reuters Business": ("https://feeds.reuters.com/reuters/businessNews",               "International", "🌍"),
    "Guardian Business":("https://www.theguardian.com/uk/business/rss",                 "International", "🌍"),
    # Marchés ⚠️ (parfois bloqués)
    "Yahoo Finance":    ("https://finance.yahoo.com/rss/topstories",                     "Marchés",       "📊"),
    "MarketWatch":      ("https://feeds.content.dowjones.io/public/rss/mw_topstories",  "Marchés",       "📊"),
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

# Cache
_cache: dict = {}
CACHE_TTL = 300  # 5 min

_cache_general: dict = {}
CACHE_GENERAL_TTL = 600  # 10 min


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


def _extract_image(entry) -> Optional[str]:
    """Essaie d'extraire une URL d'image depuis l'entrée RSS."""
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list):
        for m in media:
            url = m.get("url", "")
            if url and any(url.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
                return url

    enclosures = getattr(entry, "enclosures", [])
    for enc in enclosures:
        url = enc.get("href") or enc.get("url", "")
        if url and "image" in enc.get("type", "image"):
            return url

    html = getattr(entry, "summary", "") or ""
    for attr in ("content",):
        val = getattr(entry, attr, None)
        if val and isinstance(val, list):
            html = val[0].get("value", html)
    match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html)
    if match:
        url = match.group(1)
        if url.startswith("http"):
            return url

    thumb = getattr(entry, "media_thumbnail", None)
    if thumb and isinstance(thumb, list):
        return thumb[0].get("url")

    return None


async def _fetch_source_async(
    client: httpx.AsyncClient,
    name: str,
    url: str,
    category: str = "Général",
    flag: str = "🌍",
) -> list[dict]:
    try:
        resp = await client.get(url, timeout=8)
        if resp.status_code >= 400:
            print(f"[RSS] {name} → HTTP {resp.status_code}")
            return []
        feed = feedparser.parse(resp.text)
        articles = []
        for entry in feed.entries[:15]:
            title   = entry.get("title", "").strip()
            summary = entry.get("summary", entry.get("description", "")).strip()
            summary_clean = re.sub(r"<[^>]+>", " ", summary).strip()
            summary_clean = re.sub(r"\s+", " ", summary_clean)
            link    = entry.get("link", "")
            if not title:
                continue
            articles.append({
                "source":   name,
                "category": category,
                "flag":     flag,
                "title":    title,
                "summary":  summary_clean[:600],
                "url":      link,
                "date":     _parse_date(entry),
                "image":    _extract_image(entry),
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


async def fetch_general_news_async() -> list[dict]:
    """Fetch toutes les sources générales avec catégories + images."""
    cached = _cache_general.get("all")
    if cached and (time.time() - cached[0]) < CACHE_GENERAL_TTL:
        print(f"[RSS GENERAL] Cache hit — {len(cached[1])} articles")
        return cached[1]

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(*[
            _fetch_source_async(client, name, url, cat, flag)
            for name, (url, cat, flag) in SOURCES_GENERAL.items()
        ])

    all_articles = [a for lst in results for a in lst]
    all_articles.sort(key=lambda x: x["date"], reverse=True)
    _cache_general["all"] = (time.time(), all_articles)
    print(f"[RSS GENERAL] {len(all_articles)} articles depuis {len(SOURCES_GENERAL)} sources")
    return all_articles


def fetch_all_news(symbol_filter: Optional[str] = None) -> list[dict]:
    if not symbol_filter:
        cached = _cached()
        if cached is not None:
            print(f"[RSS] Cache hit — {len(cached)} articles")
            return cached

    try:
        articles = asyncio.run(_fetch_all_async(SOURCES))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        articles = loop.run_until_complete(_fetch_all_async(SOURCES))
        loop.close()

    # Fallback si peu d'articles (seuil relevé à 5)
    if len(articles) < 5:
        print("[RSS] Peu d'articles, ajout sources fallback...")
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
