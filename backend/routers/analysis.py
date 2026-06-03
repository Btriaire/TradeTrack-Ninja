from fastapi import APIRouter
from pydantic import BaseModel
import os, json, time
import httpx

router = APIRouter(prefix="/analysis", tags=["analysis"])

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
GEMINI_MODELS = [
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
]


class AnalysisRequest(BaseModel):
    symbol: str
    articles: list[dict]
    indicators: dict = {}


def _call_gemini(api_key: str, model: str, prompt: str) -> str:
    """Appel direct à l'API REST Gemini.
    - Clés AIzaSy... → query param ?key=
    - Clés AQ...     → header Authorization: Bearer
    """
    url = f"{GEMINI_BASE}/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024},
    }

    # Détection automatique du format de clé
    if api_key.startswith("AIza"):
        params  = {"key": api_key}
        headers = {"Content-Type": "application/json"}
    else:
        # Token OAuth (AQ., ya29., etc.) → Bearer
        params  = {}
        headers = {
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    r = httpx.post(url, params=params, json=payload, headers=headers, timeout=30)
    if r.status_code != 200:
        raise ValueError(f"HTTP {r.status_code}: {r.text[:200]}")
    data = r.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


@router.post("/sentiment")
def analyze_sentiment(req: AnalysisRequest):
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _mock_analysis(req.symbol, "GEMINI_API_KEY manquant dans Render > Environment")

    articles_text = "\n".join([
        f"[{a.get('source','?')}] {a.get('title','')}: {a.get('summary','')}"
        for a in req.articles[:8]
    ]) or "Aucun article — analyse basée sur les indicateurs techniques."

    ind = req.indicators
    rsi = ind.get('rsi', 50)
    indicators_text = ""
    if ind:
        indicators_text = f"""
Indicateurs techniques:
- RSI(14): {rsi} {'(survente)' if rsi < 35 else '(surachat)' if rsi > 65 else '(neutre)'}
- MACD: {ind.get('macd', 'N/A')} / Signal: {ind.get('macd_signal', 'N/A')}
- SMA20: {ind.get('sma20', 'N/A')} / SMA50: {ind.get('sma50', 'N/A')}
- Signal global: {ind.get('signal', 'N/A')}
"""

    prompt = f"""Tu es analyste financier expert sur les marchés français.
Analyse les informations suivantes sur {req.symbol}.

{indicators_text}

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

    last_error = "Erreur inconnue"

    for model in GEMINI_MODELS:
        for attempt in range(2):
            try:
                print(f"[GEMINI] {model} essai {attempt + 1}")
                text = _call_gemini(api_key, model, prompt)
                if "```" in text:
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                start = text.find("{")
                end   = text.rfind("}") + 1
                if start == -1 or end == 0:
                    raise ValueError(f"Pas de JSON: {text[:100]}")
                return json.loads(text[start:end])

            except Exception as e:
                last_error = f"{model}: {str(e)[:150]}"
                print(f"[GEMINI ERROR] {last_error}")
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    if attempt == 0:
                        time.sleep(15)
                    else:
                        break
                else:
                    break

    return _mock_analysis(req.symbol, last_error)


@router.get("/debug")
def debug_gemini():
    """Teste l'API Gemini REST directement."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return {"status": "KO", "error": "GEMINI_API_KEY manquant"}

    results = {}
    for model in GEMINI_MODELS:
        try:
            text = _call_gemini(api_key, model, 'Dis juste "ok"')
            results[model] = {"ok": True, "response": text[:80]}
            break
        except Exception as e:
            results[model] = {"ok": False, "error": str(e)[:150]}

    any_ok = any(v["ok"] for v in results.values())
    return {
        "status":      "OK" if any_ok else "KO",
        "key_preview": api_key[:8] + "...",
        "models":      results,
    }


def _mock_analysis(symbol: str, reason: str = "") -> dict:
    return {
        "sentiment":   "NEUTRE",
        "score":       0,
        "resume":      f"Analyse IA indisponible pour {symbol}. {reason}",
        "points_cles": ["Vérifiez la clé GEMINI_API_KEY sur aistudio.google.com"],
        "risques":     [reason] if reason else ["Clé API invalide ou quota épuisé"],
        "horizon":     "Court terme (< 1 mois)",
    }
