from fastapi import APIRouter
from pydantic import BaseModel
import os, json, time

router = APIRouter(prefix="/analysis", tags=["analysis"])

# Modèles essayés dans l'ordre (lite en premier = quota plus généreux)
GEMINI_MODELS = [
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-2.0-flash",
]


class AnalysisRequest(BaseModel):
    symbol: str
    articles: list[dict]
    indicators: dict = {}


@router.post("/sentiment")
def analyze_sentiment(req: AnalysisRequest):
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _mock_analysis(req.symbol, "GEMINI_API_KEY manquant dans Render > Environment")

    try:
        from google import genai
    except ImportError as e:
        return _mock_analysis(req.symbol, f"Package google-genai non installé: {e}")

    client = genai.Client(api_key=api_key)

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
                print(f"[GEMINI] {model} — essai {attempt + 1}")
                response = client.models.generate_content(model=model, contents=prompt)
                text = response.text.strip()
                if "```" in text:
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                start = text.find("{")
                end   = text.rfind("}") + 1
                if start == -1 or end == 0:
                    raise ValueError(f"Pas de JSON dans: {text[:100]}")
                return json.loads(text[start:end])

            except Exception as e:
                last_error = f"{type(e).__name__} ({model}): {str(e)[:120]}"
                print(f"[GEMINI ERROR] {last_error}")
                if "429" in str(e):
                    if attempt == 0:
                        print("[GEMINI] 429 — attente 15s")
                        time.sleep(15)
                    else:
                        break  # Passer au modèle suivant
                else:
                    break  # Erreur non-quota → passer au modèle suivant

    return _mock_analysis(req.symbol, last_error)


@router.get("/debug")
def debug_gemini():
    """Teste la connexion Gemini avec chaque modèle disponible."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return {"status": "KO", "error": "GEMINI_API_KEY manquant"}

    try:
        from google import genai
    except ImportError as e:
        return {"status": "KO", "error": f"Import: {e}"}

    client  = genai.Client(api_key=api_key)
    results = {}

    for model in GEMINI_MODELS:
        try:
            r = client.models.generate_content(
                model=model,
                contents='{"status":"ok"}',
            )
            results[model] = {"ok": True, "response": r.text[:80]}
            break  # Un seul modèle qui marche suffit
        except Exception as e:
            results[model] = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:120]}"}

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
        "points_cles": ["Créez une nouvelle clé sur aistudio.google.com/app/apikey"],
        "risques":     [reason] if reason else ["Quota Gemini épuisé"],
        "horizon":     "Court terme (< 1 mois)",
    }
