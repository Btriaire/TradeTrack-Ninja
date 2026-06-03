from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os, json, time
import httpx

router = APIRouter(prefix="/analysis", tags=["analysis"])


class FocusConfig(BaseModel):
    fondamentaux: bool = True
    technique:    bool = True
    actualites:   bool = True
    risques:      bool = True

class PromptConfig(BaseModel):
    style:        str = "journalistique"   # journalistique|technique|synthétique|optimiste|pessimiste
    horizon:      str = "auto"             # auto|court|moyen|long
    focus:        FocusConfig = FocusConfig()
    instructions: str = ""                 # texte libre
    langue:       str = "fr"              # fr|en

class AnalysisRequest(BaseModel):
    symbol:        str
    articles:      list[dict]
    indicators:    dict = {}
    prompt_config: Optional[PromptConfig] = None
    candles:       list[dict] = []   # historique OHLCV pour analyse approfondie


# ── Groq ─────────────────────────────────────────────────────────────────────
def _call_groq(api_key: str, prompt: str) -> str:
    r = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model":       "llama-3.1-8b-instant",
            "messages":    [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens":  1024,
        },
        timeout=30,
    )
    if r.status_code != 200:
        raise ValueError(f"Groq HTTP {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"]["content"]


# ── Gemini ───────────────────────────────────────────────────────────────────
GEMINI_BASE   = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash"]

def _call_gemini(api_key: str, model: str, prompt: str) -> str:
    url     = f"{GEMINI_BASE}/{model}:generateContent"
    payload = {
        "contents":         [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }
    if api_key.startswith("AIza"):
        params, headers = {"key": api_key}, {"Content-Type": "application/json"}
    else:
        params, headers = {}, {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}

    r = httpx.post(url, params=params, json=payload, headers=headers, timeout=30)
    if r.status_code != 200:
        raise ValueError(f"Gemini HTTP {r.status_code}: {r.text[:200]}")
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


# ── Parsing JSON ──────────────────────────────────────────────────────────────
def _parse_json(text: str) -> dict:
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"Pas de JSON: {text[:100]}")
    return json.loads(text[start:end])


# ── Construction du prompt ────────────────────────────────────────────────────
def _build_candles_summary(candles: list) -> str:
    """Résumé lisible de l'historique de cours pour le prompt."""
    if not candles:
        return ""
    first, last = candles[0], candles[-1]
    perf = ((last['close'] - first['close']) / first['close'] * 100) if first['close'] else 0
    high = max(c['high'] for c in candles)
    low  = min(c['low']  for c in candles)
    # Variation des 5 dernières séances
    recent = candles[-5:]
    recent_lines = " | ".join(
        f"{c['time']}: {c['close']:.2f} ({'▲' if c['close']>=c['open'] else '▼'})"
        for c in recent
    )
    return f"""
Historique des cours ({len(candles)} séances):
- Du {first['time']} au {last['time']}
- Performance période: {perf:+.2f}%
- Plus haut: {high:.2f} | Plus bas: {low:.2f}
- Clôture actuelle: {last['close']:.2f}
- Volume moyen: {int(sum(c['volume'] for c in candles)/len(candles)):,}
- 5 dernières séances: {recent_lines}
"""


def _build_prompt(symbol: str, articles: list, indicators: dict, cfg: PromptConfig, candles: list = []) -> str:
    # Langue
    lang_instr = "Réponds en français." if cfg.langue == "fr" else "Answer in English."

    # Style
    style_map = {
        "journalistique": "style journaliste Les Echos/BFM Bourse, vivant et accessible",
        "technique":      "style analyste technique, précis et factuel, avec niveaux clés",
        "synthétique":    "style très concis, bullet points, aller droit au but",
        "optimiste":      "biais haussier, met en valeur les opportunités et catalyseurs positifs",
        "pessimiste":     "biais baissier, met en valeur les risques et points de vigilance",
    }
    style_desc = style_map.get(cfg.style, style_map["journalistique"])

    # Horizon
    horizon_instr = {
        "auto":  "",
        "court": "Concentre-toi sur les perspectives de court terme (< 1 mois).",
        "moyen": "Concentre-toi sur les perspectives de moyen terme (1-6 mois).",
        "long":  "Concentre-toi sur les perspectives de long terme (> 6 mois).",
    }.get(cfg.horizon, "")

    # Focus
    focus_parts = []
    if cfg.focus.technique:    focus_parts.append("analyse technique (tendances, niveaux supports/résistances)")
    if cfg.focus.fondamentaux: focus_parts.append("fondamentaux (valorisation, croissance, secteur)")
    if cfg.focus.actualites:   focus_parts.append("actualités récentes et catalyseurs")
    if cfg.focus.risques:      focus_parts.append("risques principaux")
    focus_instr = "Couvre : " + ", ".join(focus_parts) + "." if focus_parts else ""

    # Indicateurs
    ind  = indicators
    rsi  = ind.get('rsi', 50)
    ind_text = ""
    if ind:
        ind_text = f"""
Indicateurs techniques:
- RSI(14): {rsi} {'(survente)' if rsi < 35 else '(surachat)' if rsi > 65 else '(neutre)'}
- MACD: {ind.get('macd','N/A')} / Signal: {ind.get('macd_signal','N/A')}
- SMA20: {ind.get('sma20','N/A')} / SMA50: {ind.get('sma50','N/A')}
- Signal global: {ind.get('signal','N/A')}
"""

    # Articles
    articles_text = "\n".join([
        f"[{a.get('source','?')}] {a.get('title','')}: {a.get('summary','')}"
        for a in articles[:8]
    ]) or "Aucun article disponible."

    # Historique de cours (mode analyse approfondie)
    candles_text = _build_candles_summary(candles) if candles else ""

    # Instructions perso
    custom = f"\nInstructions supplémentaires: {cfg.instructions.strip()}" if cfg.instructions.strip() else ""

    # JSON schema selon langue
    if cfg.langue == "fr":
        schema = '''{
  "sentiment": "HAUSSIER" ou "BAISSIER" ou "NEUTRE",
  "score": nombre entier entre -100 et 100,
  "resume": "2-3 phrases de synthèse",
  "points_cles": ["point 1", "point 2", "point 3"],
  "risques": ["risque 1", "risque 2"],
  "horizon": "Court terme (< 1 mois)" ou "Moyen terme (1-6 mois)" ou "Long terme (> 6 mois)"
}'''
    else:
        schema = '''{
  "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
  "score": integer between -100 and 100,
  "resume": "2-3 sentence summary",
  "points_cles": ["point 1", "point 2", "point 3"],
  "risques": ["risk 1", "risk 2"],
  "horizon": "Short term (< 1 month)" or "Medium term (1-6 months)" or "Long term (> 6 months)"
}'''

    return f"""Tu es analyste financier expert ({style_desc}).
{lang_instr} {horizon_instr} {focus_instr}

Analyse les informations suivantes sur {symbol}.
{ind_text}{candles_text}
Articles récents:
{articles_text}
{custom}

Réponds UNIQUEMENT en JSON valide (sans markdown, sans ```):
{schema}"""


# ── Route principale ──────────────────────────────────────────────────────────
@router.post("/sentiment")
def analyze_sentiment(req: AnalysisRequest):
    cfg        = req.prompt_config or PromptConfig()
    prompt     = _build_prompt(req.symbol, req.articles, req.indicators, cfg, req.candles)
    groq_key   = os.getenv("GROQ_API_KEY", "")
    gemini_key = os.getenv("GEMINI_API_KEY", "")

    if groq_key:
        try:
            print("[AI] Groq…")
            return _parse_json(_call_groq(groq_key, prompt))
        except Exception as e:
            print(f"[GROQ ERROR] {e}")

    if gemini_key:
        last_error = ""
        for model in GEMINI_MODELS:
            for attempt in range(2):
                try:
                    print(f"[AI] Gemini {model} essai {attempt+1}")
                    return _parse_json(_call_gemini(gemini_key, model, prompt))
                except Exception as e:
                    last_error = str(e)[:120]
                    if "429" in last_error or "EXHAUSTED" in last_error:
                        if attempt == 0: time.sleep(15)
                        else: break
                    else: break
        return _mock_analysis(req.symbol, f"Gemini: {last_error}")

    return _mock_analysis(req.symbol, "Ajoutez GROQ_API_KEY dans Render > Environment")


# ── Debug ─────────────────────────────────────────────────────────────────────
@router.get("/debug")
def debug_ai():
    groq_key, gemini_key = os.getenv("GROQ_API_KEY",""), os.getenv("GEMINI_API_KEY","")
    results = {}
    if groq_key:
        try:
            text = _call_groq(groq_key, '{"status":"ok"}')
            results["groq"] = {"ok": True, "preview": groq_key[:8]+"...", "response": text[:60]}
        except Exception as e:
            results["groq"] = {"ok": False, "preview": groq_key[:8]+"...", "error": str(e)[:120]}
    if gemini_key:
        for model in GEMINI_MODELS:
            try:
                text = _call_gemini(gemini_key, model, '{"status":"ok"}')
                results[f"gemini/{model}"] = {"ok": True, "response": text[:60]}
                break
            except Exception as e:
                results[f"gemini/{model}"] = {"ok": False, "error": str(e)[:120]}
    any_ok = any(v["ok"] for v in results.values())
    return {"status": "OK" if any_ok else "KO", "providers": results}


# ── Mock ──────────────────────────────────────────────────────────────────────
def _mock_analysis(symbol: str, reason: str = "") -> dict:
    return {
        "sentiment":   "NEUTRE",
        "score":       0,
        "resume":      f"Analyse IA indisponible pour {symbol}. {reason}",
        "points_cles": ["Créez une clé sur console.groq.com (gratuit)"],
        "risques":     [reason] if reason else ["Aucune clé API configurée"],
        "horizon":     "Court terme (< 1 mois)",
    }
