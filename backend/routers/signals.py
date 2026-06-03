"""
Router /signals — signaux quotidiens Great Catch / Stay Away
"""
from fastapi import APIRouter, BackgroundTasks
from datetime import datetime
import os, json, time, httpx, asyncio, feedparser
from services.signal_engine import get_signals_cached, compute_signals, _cache, UNIVERSE

router = APIRouter(prefix="/signals", tags=["signals"])


def _ai_reasons(signals: list[dict], direction: str, groq_key: str) -> list[dict]:
    """Appelle Groq pour générer une phrase d'explication pour chaque signal."""
    if not signals or not groq_key:
        return signals

    # On groupe tous les signaux dans un seul appel
    lines = "\n".join([
        f"- {s['symbol']} ({s['name']}, {s['index']}): score={s['score']}, RSI={s['rsi']}, "
        f"perf récente={s['change_pct']:+.1f}%, potentiel estimé={s['potential_pct']:+.1f}%, "
        f"signaux: {', '.join(s['tags']) or s['signal']}"
        for s in signals
    ])

    emoji = "📈 opportunité d'achat" if direction == "buy" else "📉 signal de vente/éviter"
    prompt = f"""Tu es analyste technique expert. Pour chaque valeur ci-dessous,
écris UNE phrase courte (max 15 mots) expliquant pourquoi c'est un {emoji} sur 2-7 jours.
Sois précis, utilise le jargon technique si pertinent.

Valeurs:
{lines}

Réponds UNIQUEMENT en JSON:
[{{"symbol":"XXX","reason":"ta phrase courte"}}, ...]"""

    try:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens": 800,
            },
            timeout=20,
        )
        text = r.json()["choices"][0]["message"]["content"]
        # Parse JSON
        start = text.find("[")
        end   = text.rfind("]") + 1
        if start == -1:
            return signals
        reasons_list = json.loads(text[start:end])
        reason_map = {item["symbol"]: item["reason"] for item in reasons_list}
        for s in signals:
            s["reason"] = reason_map.get(s["symbol"], "")
        return signals
    except Exception as e:
        print(f"[AI REASONS] {e}")
        return signals


def _enrich_with_ai(data: dict) -> dict:
    """Enrichit les signaux avec des raisons IA via Groq."""
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        return data
    if data.get("great_catch"):
        data["great_catch"] = _ai_reasons(data["great_catch"], "buy",  groq_key)
    if data.get("stay_away"):
        data["stay_away"]   = _ai_reasons(data["stay_away"],   "sell", groq_key)
    return data


@router.get("/daily")
def daily_signals(background_tasks: BackgroundTasks):
    """
    Retourne les signaux du jour.
    - Cache 6h
    - Premier appel déclenche le calcul (peut prendre 30-60s)
    """
    data = get_signals_cached()

    # Si les reasons IA sont vides, les enrichir
    needs_ai = any(not s.get("reason") for s in data.get("great_catch", []))
    if needs_ai and not data.get("generating"):
        groq_key = os.getenv("GROQ_API_KEY", "")
        if groq_key:
            data = _enrich_with_ai(data)
            _cache["data"] = data  # sauvegarder avec les raisons

    return data


@router.post("/refresh")
def refresh_signals(background_tasks: BackgroundTasks):
    """Force un recalcul des signaux (utile le matin)."""
    def _refresh():
        data = compute_signals()
        _cache["data"] = data
        _cache["ts"]   = time.time()
        # Enrichir avec IA
        groq_key = os.getenv("GROQ_API_KEY", "")
        if groq_key:
            _enrich_with_ai(data)
            _cache["data"] = data

    background_tasks.add_task(_refresh)
    return {"status": "refresh_started", "message": "Calcul en cours, revenez dans 60 secondes"}


@router.get("/game")
def game_of_day():
    """
    The Game of Today — top 3 pépites avec potentiel max de hausse court terme.
    Inclut un brief IA expliquant l'opportunité du jour.
    """
    data   = get_signals_cached()
    picks  = data.get("great_catch", [])[:3]

    # Brief IA (génération à la volée si pas déjà en cache)
    brief = data.get("game_brief", "")
    if not brief and picks:
        brief = _generate_game_brief(picks)
        # Mise en cache du brief avec les signaux
        if _cache.get("data"):
            _cache["data"]["game_brief"] = brief

    return {
        "picks":        picks,
        "brief":        brief,
        "date":         datetime.now().strftime("%d/%m/%Y"),
        "generated_at": data.get("generated_at", ""),
    }


def _generate_game_brief(picks: list) -> str:
    """Génère une phrase d'accroche IA pour les top picks du jour."""
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key or not picks:
        return ""

    symbols = ", ".join([f"{p['name']} ({p['symbol']})" for p in picks])
    reasons = " | ".join([
        f"{p['name']}: score={p['score']}, RSI={p['rsi']}, potentiel={p['potential_pct']:+.1f}%, {', '.join(p['tags'][:2]) or p['signal']}"
        for p in picks
    ])

    prompt = f"""Tu es un analyste financier expert. Génère UNE seule phrase d'accroche percutante (20-30 mots max)
pour présenter les meilleures opportunités de trading court terme du jour.
Sois factuel, concis, et utilise le jargon technique avec modération.

Top picks du jour: {symbols}
Contexte technique: {reasons}

Réponds avec UNE seule phrase, sans guillemets, directement."""

    try:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.5,
                "max_tokens": 80,
            },
            timeout=10,
        )
        return r.json()["choices"][0]["message"]["content"].strip().strip('"')
    except Exception as e:
        print(f"[GAME BRIEF] {e}")
        return ""


@router.get("/top-sectors")
def top_sectors():
    """
    Top 3 secteurs en forte croissance de la semaine.
    Agrège les scores/perf par secteur sur l'univers complet.
    """
    data       = get_signals_cached()
    all_stocks = data.get("all_scores", [])

    if not all_stocks:
        return {"sectors": [], "brief": "", "date": datetime.now().strftime("%d/%m/%Y")}

    # ── Agrégation par secteur ─────────────────────────────────────────────
    sectors: dict = {}
    for stock in all_stocks:
        sec = stock.get("sector", "Autre")
        if sec not in sectors:
            sectors[sec] = {"stocks": [], "countries": set()}
        sectors[sec]["stocks"].append(stock)
        sectors[sec]["countries"].add(stock["country"])

    sector_list = []
    for sec_name, sec_data in sectors.items():
        stocks = sec_data["stocks"]
        if len(stocks) < 1:
            continue
        avg_score      = sum(s["score"]        for s in stocks) / len(stocks)
        avg_perf5      = sum(s.get("perf_5j", 0)    for s in stocks) / len(stocks)
        avg_potential  = sum(s["potential_pct"] for s in stocks) / len(stocks)
        avg_change     = sum(s["change_pct"]    for s in stocks) / len(stocks)
        top_stocks     = sorted(stocks, key=lambda s: s["score"], reverse=True)[:3]
        best           = top_stocks[0]

        sector_list.append({
            "sector":          sec_name,
            "avg_score":       round(avg_score, 2),
            "avg_perf_5j":     round(avg_perf5, 2),
            "avg_potential":   round(avg_potential, 1),
            "avg_change":      round(avg_change, 2),
            "stock_count":     len(stocks),
            "countries":       sorted(sec_data["countries"]),
            "top_stocks":      top_stocks,
            "best_symbol":     best["symbol"],
            "best_name":       best["name"],
        })

    # Tri : d'abord sur perf_5j, tie-break sur avg_score
    sector_list.sort(key=lambda s: (s["avg_perf_5j"], s["avg_score"]), reverse=True)
    top3 = sector_list[:3]

    # ── Brief IA (mis en cache) ────────────────────────────────────────────
    brief = data.get("sector_brief", "")
    if not brief and top3:
        brief = _generate_sector_brief(top3)
        if _cache.get("data"):
            _cache["data"]["sector_brief"] = brief

    return {
        "sectors":     top3,
        "all_sectors": sector_list,
        "brief":       brief,
        "date":        datetime.now().strftime("%d/%m/%Y"),
    }


def _generate_sector_brief(sectors: list) -> str:
    """Génère une accroche IA pour les secteurs en tête cette semaine."""
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key or not sectors:
        return ""

    lines = " | ".join([
        f"{s['sector']} (perf 5j: {s['avg_perf_5j']:+.1f}%, score: {s['avg_score']:+.1f}, pays: {', '.join(s['countries'][:3])})"
        for s in sectors
    ])
    prompt = f"""Tu es analyste sectoriel expert. Génère UNE seule phrase d'accroche percutante (20-30 mots max)
sur les secteurs les plus dynamiques de la semaine. Mentionne le contexte macro si pertinent.

Top secteurs: {lines}

Réponds avec UNE seule phrase, sans guillemets, directement en français."""

    try:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.5,
                "max_tokens": 80,
            },
            timeout=10,
        )
        return r.json()["choices"][0]["message"]["content"].strip().strip('"')
    except Exception as e:
        print(f"[SECTOR BRIEF] {e}")
        return ""


@router.get("/universe")
def get_universe():
    """Retourne la liste des valeurs analysées."""
    return UNIVERSE


# ── Géopolitique ──────────────────────────────────────────────────────────────
_geo_cache: dict = {"ts": 0, "data": None}
GEO_TTL = 4 * 3600   # 4 heures

# Sources géopolitiques / macro prioritaires
_GEO_SOURCES = [
    "https://feeds.reuters.com/reuters/businessNews",
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    "https://www.theguardian.com/uk/business/rss",
    "https://www.lefigaro.fr/rss/figaro_economie.xml",
]

_GEO_KEYWORDS = (
    "tariff","sanction","war","conflict","election","central bank","fed","ecb","bce",
    "trade","treaty","nato","g7","g20","opec","geopolit","tension","ukraine","russia",
    "china","dollar","euro","inflation","rate","interest","policy","xi","trump","biden",
    "macron","merz","embargo","import","export","supply chain","energy","oil","gas",
    "tarifaire","guerre","élection","banque centrale","taux","géopolit","pétrole",
)


async def _fetch_geo_headlines() -> list[str]:
    """Récupère des titres d'actualité récents depuis des sources fiables."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; TradeTrack/1.0)",
        "Accept":     "application/rss+xml, application/xml, text/xml, */*",
    }
    headlines = []

    async def _fetch_one(url: str):
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(url, headers=headers, follow_redirects=True)
                if r.status_code == 200:
                    feed = feedparser.parse(r.text)
                    for entry in feed.entries[:6]:
                        title = getattr(entry, "title", "")
                        summary = getattr(entry, "summary", "")[:120]
                        if title:
                            headlines.append(f"{title}. {summary}".strip())
        except Exception:
            pass

    await asyncio.gather(*[_fetch_one(url) for url in _GEO_SOURCES])

    # Filtrer : garder surtout les titres à saveur géopolitique/macro
    filtered = [h for h in headlines if any(kw in h.lower() for kw in _GEO_KEYWORDS)]
    # Si pas assez filtrés, on garde tout
    return (filtered if len(filtered) >= 6 else headlines)[:30]


def _analyze_geo_with_groq(headlines: list[str], groq_key: str) -> dict:
    """Appelle Groq pour identifier les 3 événements géopolitiques clés."""
    news_block = "\n".join(f"- {h}" for h in headlines[:25])

    prompt = f"""Tu es analyste géopolitique expert en marchés financiers.

Voici des titres d'actualité récents:
{news_block}

Identifie les 3 décisions ou événements géopolitiques/macro les plus importants qui influencent actuellement les marchés boursiers mondiaux.
Si les titres fournis manquent de substance géopolitique, utilise tes connaissances des tendances actuelles (tensions commerciales, politiques monétaires, conflits).

Pour chaque événement retourne:
- title: titre court et percutant (max 8 mots)
- flags: tableau d'emojis drapeaux des pays impliqués (max 3)
- regions: description courte des zones (ex: "USA · Chine", "Zone Euro", "Moyen-Orient")
- impact: "HAUSSIER" | "BAISSIER" | "MIXTE" | "INCERTAIN"
- sectors: tableau de 2-3 secteurs affectés (ex: ["Technologie", "Énergie"])
- brief: explication concise (25-35 mots max) en français
- signal: "OPPORTUNITÉ" | "RISQUE" | "SURVEILLER"

Réponds UNIQUEMENT en JSON valide (sans markdown):
{{
  "events": [
    {{
      "title": "...",
      "flags": ["🇺🇸","🇨🇳"],
      "regions": "USA · Chine",
      "impact": "BAISSIER",
      "sectors": ["Technologie","Commerce"],
      "brief": "...",
      "signal": "RISQUE"
    }}
  ],
  "synthesis": "une phrase de synthèse sur le climat géopolitique global (20 mots max)"
}}"""

    try:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model":       "llama-3.1-8b-instant",
                "messages":    [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "max_tokens":  700,
            },
            timeout=25,
        )
        text = r.json()["choices"][0]["message"]["content"]
        start, end = text.find("{"), text.rfind("}") + 1
        if start == -1:
            raise ValueError("Pas de JSON")
        return json.loads(text[start:end])
    except Exception as e:
        print(f"[GEO GROQ] {e}")
        return {}


@router.get("/geo-events")
async def geo_events():
    """
    Top 3 événements géopolitiques influençant les marchés.
    - Fetch RSS international → headlines filtrés
    - Analyse Groq → structure JSON
    - Cache 4h
    """
    now = time.time()
    if _geo_cache["data"] and (now - _geo_cache["ts"]) < GEO_TTL:
        return _geo_cache["data"]

    groq_key = os.getenv("GROQ_API_KEY", "")

    # Fetch headlines (async)
    headlines = await _fetch_geo_headlines()

    result: dict = {}
    if groq_key:
        result = _analyze_geo_with_groq(headlines, groq_key)

    # Fallback si Groq KO ou pas de clé
    if not result.get("events"):
        result = {
            "events": [
                {
                    "title":   "Analyse indisponible",
                    "flags":   ["🌍"],
                    "regions": "Global",
                    "impact":  "INCERTAIN",
                    "sectors": ["Tous secteurs"],
                    "brief":   "Configurez GROQ_API_KEY pour activer l'analyse géopolitique.",
                    "signal":  "SURVEILLER",
                },
            ],
            "synthesis": "Analyse géopolitique indisponible — GROQ_API_KEY requise.",
        }

    result["date"]     = datetime.now().strftime("%d/%m/%Y")
    result["headline_count"] = len(headlines)

    _geo_cache["data"] = result
    _geo_cache["ts"]   = now
    return result
