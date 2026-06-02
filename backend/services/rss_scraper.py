import feedparser
import httpx
from datetime import datetime
from typing import Optional

SOURCES = {
    "Boursorama":      "https://www.boursorama.com/rss/actus-societes",
    "Figaro Economie": "https://www.lefigaro.fr/rss/figaro_economie.xml",
    "Zonebourse":      "https://www.zonebourse.com/rss/news.xml",
    "Les Echos":       "https://www.lesechos.fr/rss/rss_finance.xml",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TradeTrack-Ninja/1.0)"
}


def _parse_date(entry) -> str:
    for attr in ("published", "updated"):
        val = getattr(entry, attr, None)
        if val:
            return val[:25]
    return datetime.now().isoformat()


def fetch_source(name: str, url: str, symbol_filter: Optional[str] = None) -> list[dict]:
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=8, follow_redirects=True)
        feed = feedparser.parse(resp.text)
    except Exception:
        return []

    articles = []
    for entry in feed.entries[:15]:
        title = entry.get("title", "")
        summary = entry.get("summary", entry.get("description", ""))
        link = entry.get("link", "")

        if symbol_filter:
            combined = (title + summary).lower()
            if symbol_filter.lower() not in combined:
                continue

        articles.append({
            "source": name,
            "title": title,
            "summary": summary[:400],
            "url": link,
            "date": _parse_date(entry),
        })

    return articles


def fetch_all_news(symbol_filter: Optional[str] = None) -> list[dict]:
    all_articles = []
    for name, url in SOURCES.items():
        articles = fetch_source(name, url, symbol_filter)
        all_articles.extend(articles)
    all_articles.sort(key=lambda x: x["date"], reverse=True)
    return all_articles
