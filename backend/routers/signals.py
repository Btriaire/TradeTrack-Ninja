"""
Router /signals — signaux quotidiens Great Catch / Stay Away
"""
from fastapi import APIRouter, BackgroundTasks
from datetime import datetime
import os, json, time, httpx
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


@router.get("/universe")
def get_universe():
    """Retourne la liste des valeurs analysées."""
    return UNIVERSE
