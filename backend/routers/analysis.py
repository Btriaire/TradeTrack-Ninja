from fastapi import APIRouter
from pydantic import BaseModel
import os
import json
import google.generativeai as genai

router = APIRouter(prefix="/analysis", tags=["analysis"])


class AnalysisRequest(BaseModel):
    symbol: str
    articles: list[dict]
    indicators: dict = {}


@router.post("/sentiment")
def analyze_sentiment(req: AnalysisRequest):
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return _mock_analysis(req.symbol)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    articles_text = "\n".join([
        f"[{a['source']}] {a['title']}: {a['summary']}"
        for a in req.articles[:8]
    ])

    indicators_text = ""
    if req.indicators:
        ind = req.indicators
        rsi = ind.get('rsi', 50)
        indicators_text = f"""
Indicateurs techniques:
- RSI(14): {rsi} {'(survente)' if rsi < 35 else '(surachat)' if rsi > 65 else '(neutre)'}
- MACD: {ind.get('macd', 'N/A')} / Signal: {ind.get('macd_signal', 'N/A')}
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

    import time
    for attempt in range(3):
        try:
            response = model.generate_content(prompt)
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            start = text.find("{")
            end = text.rfind("}") + 1
            return json.loads(text[start:end])
        except Exception as e:
            print(f"[GEMINI ERROR tentative {attempt+1}] {type(e).__name__}: {e}")
            if "429" in str(e) and attempt < 2:
                wait = 10 * (attempt + 1)
                print(f"[GEMINI] Quota dépassé — attente {wait}s avant retry...")
                time.sleep(wait)
            else:
                break
    return _mock_analysis(req.symbol)


def _mock_analysis(symbol: str) -> dict:
    return {
        "sentiment": "NEUTRE",
        "score": 0,
        "resume": f"Analyse IA indisponible pour {symbol}. Configurez GEMINI_API_KEY dans backend/.env pour activer l'analyse Gemini.",
        "points_cles": ["Données techniques disponibles", "Actualités chargées depuis les sources RSS"],
        "risques": ["Clé API Gemini non configurée"],
        "horizon": "Court terme (< 1 mois)",
    }
