from fastapi import APIRouter
from pydantic import BaseModel
import os, json, time

router = APIRouter(prefix="/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    symbol: str
    articles: list[dict]
    indicators: dict = {}


@router.post("/sentiment")
def analyze_sentiment(req: AnalysisRequest):
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _mock_analysis(req.symbol, "GEMINI_API_KEY manquant dans les variables d'environnement")

    try:
        from google import genai
    except ImportError as e:
        return _mock_analysis(req.symbol, f"Package google-genai non installé: {e}")

    client = genai.Client(api_key=api_key)

    articles_text = "\n".join([
        f"[{a.get('source','?')}] {a.get('title','')}: {a.get('summary','')}"
        for a in req.articles[:8]
    ]) or "Aucun article disponible — analyse basée sur les indicateurs techniques uniquement."

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

    prompt = f"""Tu es analyste financier expert sur les marchés français (style journaliste Les Echos/BFM Bourse).
Analyse les informations suivantes sur {req.symbol} et donne une synthèse concise.

{indicators_text}

Articles récents:
{articles_text}

Réponds UNIQUEMENT en JSON valide (sans markdown, sans ```), avec exactement ces clés:
{{
  "sentiment": "HAUSSIER" ou "BAISSIER" ou "NEUTRE",
  "score": nombre entier entre -100 et 100,
  "resume": "2-3 phrases de synthèse journalistique",
  "points_cles": ["point 1", "point 2", "point 3"],
  "risques": ["risque 1", "risque 2"],
  "horizon": "Court terme (< 1 mois)" ou "Moyen terme (1-6 mois)" ou "Long terme (> 6 mois)"
}}"""

    last_error = "Erreur inconnue"
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
            )
            text = response.text.strip()
            # Nettoyer les balises markdown éventuelles
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            start = text.find("{")
            end   = text.rfind("}") + 1
            if start == -1 or end == 0:
                raise ValueError(f"Pas de JSON dans la réponse: {text[:200]}")
            return json.loads(text[start:end])

        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"
            print(f"[GEMINI tentative {attempt+1}/3] {last_error}")
            if "429" in str(e) and attempt < 2:
                wait = 10 * (attempt + 1)
                print(f"[GEMINI] Rate limit — attente {wait}s")
                time.sleep(wait)
            else:
                break

    return _mock_analysis(req.symbol, last_error)


@router.get("/debug")
def debug_gemini():
    """Teste la connexion Gemini directement."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return {"status": "KO", "error": "GEMINI_API_KEY manquant"}
    try:
        from google import genai
        client   = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents='Réponds juste "ok" en JSON: {"status":"ok"}',
        )
        return {
            "status":      "OK",
            "key_preview": api_key[:8] + "...",
            "response":    response.text[:200],
        }
    except Exception as e:
        return {
            "status":      "KO",
            "key_preview": api_key[:8] + "...",
            "error":       f"{type(e).__name__}: {e}",
        }


def _mock_analysis(symbol: str, reason: str = "") -> dict:
    return {
        "sentiment":    "NEUTRE",
        "score":        0,
        "resume":       f"Analyse IA indisponible pour {symbol}. {reason}",
        "points_cles":  ["Configurez GEMINI_API_KEY dans Render > Environment"],
        "risques":      [reason] if reason else ["Clé API non configurée"],
        "horizon":      "Court terme (< 1 mois)",
    }
