from fastapi import APIRouter
from pydantic import BaseModel
import os, json, time
import httpx

router = APIRouter(prefix="/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    symbol: str
    articles: list[dict]
    indicators: dict = {}


# ── Groq (Llama 3) ───────────────────────────────────────────────────────────
def _call_groq(api_key: str, prompt: str) -> str:
    r = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        },
        json={
            "model":    "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens":  1024,
        },
        timeout=30,
    )
    if r.status_code != 200:
        raise ValueError(f"Groq HTTP {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"]["content"]


# ── Gemini (Google) ──────────────────────────────────────────────────────────
GEMINI_BASE   = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODELS = ["gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash"]


def _call_gemini(api_key: str, model: str, prompt: str) -> str:
    url     = f"{GEMINI_BASE}/{model}:generateContent"
    payload = {
        "contents":         [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }
    if api_key.startswith("AIza"):
        params  = {"key": api_key}
        headers = {"Content-Type": "application/json"}
    else:
        params  = {}
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}

    r = httpx.post(url, params=params, json=payload, headers=headers, timeout=30)
    if r.status_code != 200:
        raise ValueError(f"Gemini HTTP {r.status_code}: {r.text[:200]}")
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


# ── Parsing JSON depuis la réponse du LLM ────────────────────────────────────
def _parse_json(text: str) -> dict:
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"Pas de JSON: {text[:100]}")
    return json.loads(text[start:end])


# ── Prompt commun ────────────────────────────────────────────────────────────
def _build_prompt(symbol: str, articles: list[dict], indicators: dict) -> str:
    articles_text = "\n".join([
        f"[{a.get('source','?')}] {a.get('title','')}: {a.get('summary','')}"
        for a in articles[:8]
    ]) or "Aucun article disponible."

    ind = indicators
    rsi = ind.get('rsi', 50)
    ind_text = ""
    if ind:
        ind_text = f"""
Indicateurs techniques:
- RSI(14): {rsi} {'(survente)' if rsi < 35 else '(surachat)' if rsi > 65 else '(neutre)'}
- MACD: {ind.get('macd','N/A')} / Signal: {ind.get('macd_signal','N/A')}
- SMA20: {ind.get('sma20','N/A')} / SMA50: {ind.get('sma50','N/A')}
- Signal global: {ind.get('signal','N/A')}
"""
    return f"""Tu es analyste financier expert sur les marchés français.
Analyse les informations suivantes sur {symbol}.
{ind_text}
Articles récents:
{articles_text}

Réponds UNIQUEMENT en JSON valide (sans markdown, sans ```):
{{
  "sentiment": "HAUSSIER" ou "BAISSIER" ou "NEUTRE",
  "score": nombre entier entre -100 et 100,
  "resume": "2-3 phrases de synthèse",
  "points_cles": ["point 1", "point 2", "point 3"],
  "risques": ["risque 1", "risque 2"],
  "horizon": "Court terme (< 1 mois)" ou "Moyen terme (1-6 mois)" ou "Long terme (> 6 mois)"
}}"""


# ── Route principale ─────────────────────────────────────────────────────────
@router.post("/sentiment")
def analyze_sentiment(req: AnalysisRequest):
    prompt     = _build_prompt(req.symbol, req.articles, req.indicators)
    groq_key   = os.getenv("GROQ_API_KEY", "")
    gemini_key = os.getenv("GEMINI_API_KEY", "")

    # 1. Essai Groq en priorité (plus fiable, 14k req/jour gratuit)
    if groq_key:
        try:
            print("[AI] Tentative Groq…")
            return _parse_json(_call_groq(groq_key, prompt))
        except Exception as e:
            print(f"[GROQ ERROR] {e}")

    # 2. Fallback Gemini
    if gemini_key:
        last_error = ""
        for model in GEMINI_MODELS:
            for attempt in range(2):
                try:
                    print(f"[AI] Gemini {model} essai {attempt+1}")
                    return _parse_json(_call_gemini(gemini_key, model, prompt))
                except Exception as e:
                    last_error = str(e)[:120]
                    print(f"[GEMINI ERROR] {last_error}")
                    if "429" in last_error or "EXHAUSTED" in last_error:
                        if attempt == 0:
                            time.sleep(15)
                        else:
                            break
                    else:
                        break
        return _mock_analysis(req.symbol, f"Gemini: {last_error}")

    return _mock_analysis(req.symbol, "Ajoutez GROQ_API_KEY ou GEMINI_API_KEY dans Render > Environment")


# ── Debug ────────────────────────────────────────────────────────────────────
@router.get("/debug")
def debug_ai():
    groq_key   = os.getenv("GROQ_API_KEY", "")
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    results    = {}

    if groq_key:
        try:
            text = _call_groq(groq_key, 'Réponds juste: {"status":"ok"}')
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


# ── Mock ─────────────────────────────────────────────────────────────────────
def _mock_analysis(symbol: str, reason: str = "") -> dict:
    return {
        "sentiment":   "NEUTRE",
        "score":       0,
        "resume":      f"Analyse IA indisponible pour {symbol}. {reason}",
        "points_cles": ["Créez une clé sur console.groq.com (gratuit, 14k req/jour)"],
        "risques":     [reason] if reason else ["Aucune clé API configurée"],
        "horizon":     "Court terme (< 1 mois)",
    }
