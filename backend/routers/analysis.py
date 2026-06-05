from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import os, json, time
import httpx
from services.pattern_detector import detect_patterns, format_for_prompt
from services.yahoo_finance import get_intraday

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
    candles:       list[dict] = []


class DiagnosticRequest(BaseModel):
    symbol:      str
    name:        str = ""
    sector:      str = ""
    index:       str = ""
    candles:     list[dict] = []
    indicators:  dict = {}
    articles:    list[dict] = []
    with_explanation: bool = False


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


# ── Diagnostic & Pronostic ────────────────────────────────────────────────────
def _build_diagnostic_prompt(req: DiagnosticRequest, patterns: dict) -> str:
    ind = req.indicators
    rsi = ind.get("rsi", 50) or 50

    # Résumé indicateurs
    ind_text = f"""
INDICATEURS TECHNIQUES:
- RSI(14): {rsi:.1f} {'🔴 SURVENTE' if rsi < 35 else '🔴 SURACHAT' if rsi > 65 else '🟡 neutre'}
- MACD: {ind.get('macd', 'N/A')} | Signal: {ind.get('macd_signal', 'N/A')} → {'momentum HAUSSIER' if (ind.get('macd') or 0) > (ind.get('macd_signal') or 0) else 'momentum BAISSIER'}
- SMA20: {ind.get('sma20', 'N/A')} | SMA50: {ind.get('sma50', 'N/A')}
- Bollinger Upper: {ind.get('bb_upper', 'N/A')} | Lower: {ind.get('bb_lower', 'N/A')}
- Signal calculé: {ind.get('signal', 'NEUTRE')}
"""

    # Résumé cours historique
    candles_text = ""
    if req.candles:
        c = req.candles
        perf_total = ((c[-1]['close'] - c[0]['close']) / c[0]['close'] * 100) if c[0]['close'] else 0
        candles_text = f"""
HISTORIQUE DES COURS ({len(c)} séances):
- De {c[0]['time']} à {c[-1]['time']}
- Performance période: {perf_total:+.2f}%
- Plus haut: {max(x['high'] for x in c):.2f} | Plus bas: {min(x['low'] for x in c):.2f}
- Clôture actuelle: {c[-1]['close']:.2f}
- Dernières 5 séances: {' | '.join(f"{x['time'][-5:]}: {x['close']:.2f}" for x in c[-5:])}
"""

    # News
    news_text = ""
    if req.articles:
        news_text = "ACTUALITÉS RÉCENTES:\n" + "\n".join([
            f"- [{a.get('source','?')}] {a.get('title','')}"
            for a in req.articles[:6]
        ])

    # Patterns graphiques
    patterns_text = format_for_prompt(patterns)

    explanation_instr = """
- "explanation": une analyse narrative détaillée de 3-5 paragraphes (diagnostic complet + contexte + pronostic argumenté)
""" if req.with_explanation else '- "explanation": ""'

    price = req.candles[-1]['close'] if req.candles else 0

    return f"""Tu es un analyste financier senior expert. Analyse de manière holistique la valeur {req.symbol} ({req.name}).

CONTEXTE:
- Secteur: {req.sector or 'Non spécifié'}
- Indice: {req.index or 'Non spécifié'}
- Prix actuel: {price:.2f}

{ind_text}
{patterns_text}
{candles_text}
{news_text}

Fournis un DIAGNOSTIC complet et un PRONOSTIC structuré. Intègre:
1. L'analyse technique (patterns, indicateurs, tendance)
2. Le sentiment des actualités récentes
3. Le contexte sectoriel et macroéconomique général
4. Les niveaux clés supports/résistances

Réponds UNIQUEMENT en JSON valide (pas de markdown):
{{
  "diagnostic": {{
    "etat": "HAUSSIER" | "BAISSIER" | "NEUTRE",
    "force": entier 1-10,
    "technique": "phrase courte sur état technique",
    "pattern_principal": "pattern graphique dominant",
    "support": nombre ou null,
    "resistance": nombre ou null,
    "sentiment_news": "POSITIF" | "NÉGATIF" | "NEUTRE",
    "resume": "2-3 phrases de diagnostic holistique"
  }},
  "pronostic": {{
    "court_terme": {{
      "horizon": "1-5 jours",
      "direction": "HAUSSE" | "BAISSE" | "LATÉRAL",
      "cible_prix": nombre,
      "confiance": entier 1-10
    }},
    "moyen_terme": {{
      "horizon": "2-4 semaines",
      "direction": "HAUSSE" | "BAISSE" | "LATÉRAL",
      "cible_prix": nombre,
      "confiance": entier 1-10
    }},
    "risques": ["risque 1", "risque 2", "risque 3"],
    "catalyseurs": ["catalyseur 1", "catalyseur 2"],
    "verdict": "ACHETER" | "RENFORCER" | "CONSERVER" | "ALLÉGER" | "ÉVITER"
  }},
  {explanation_instr.strip()}
}}"""


@router.post("/diagnostic")
def analyze_diagnostic(req: DiagnosticRequest):
    """Diagnostic & Pronostic holistique — technique + news + secteur + IA."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    groq_key   = os.getenv("GROQ_API_KEY", "")

    if not gemini_key and not groq_key:
        return {"error": "Aucune clé IA configurée (GEMINI_API_KEY ou GROQ_API_KEY)"}

    # Détection de patterns graphiques
    patterns = detect_patterns(req.candles, req.indicators)
    prompt   = _build_diagnostic_prompt(req, patterns)

    raw = None
    last_err = ""
    # Priorité : Gemini (disponible) → Groq (fallback)
    if gemini_key:
        for model in GEMINI_MODELS:
            try:
                raw = _call_gemini(gemini_key, model, prompt)
                print(f"[DIAGNOSTIC] {req.symbol} via Gemini/{model}")
                break
            except Exception as e:
                last_err = str(e)
                print(f"[DIAGNOSTIC] Gemini/{model} échec: {e}")
    if raw is None and groq_key:
        try:
            raw = _call_groq(groq_key, prompt)
            print(f"[DIAGNOSTIC] {req.symbol} via Groq")
        except Exception as e:
            last_err = str(e)

    try:
        if raw is None:
            raise ValueError(last_err or "Tous les modèles ont échoué")
        result = _parse_json(raw)
        result["patterns_detected"] = patterns
        return result
    except Exception as e:
        print(f"[DIAGNOSTIC ERROR] {e}")
        return {
            "error": str(e),
            "patterns_detected": patterns,
            "diagnostic": {"etat": "NEUTRE", "force": 5, "resume": "Analyse indisponible temporairement",
                           "technique": "", "pattern_principal": "", "support": None,
                           "resistance": None, "sentiment_news": "NEUTRE"},
            "pronostic": {"verdict": "CONSERVER", "risques": [], "catalyseurs": [],
                          "court_terme": {"horizon":"","direction":"LATÉRAL","cible_prix":0,"confiance":5},
                          "moyen_terme": {"horizon":"","direction":"LATÉRAL","cible_prix":0,"confiance":5}},
        }


# ── Analyse de Clôture ───────────────────────────────────────────────────────
class ClotureRequest(BaseModel):
    symbol:      str
    name:        str = ""
    sector:      str = ""
    index:       str = ""
    candles:     list[dict] = []      # historique long terme (mois/semaines)
    indicators:  dict = {}
    articles:    list[dict] = []
    geo_events:  list[dict] = []      # événements géopolitiques du jour
    sector_perf: dict = {}            # performance du secteur cette semaine
    market_date: str = ""             # date de la séance analysée


def _build_cloture_prompt(req: ClotureRequest, patterns: dict, intraday: dict) -> str:
    ind = req.indicators
    rsi = ind.get("rsi", 50) or 50
    price = req.candles[-1]["close"] if req.candles else 0
    prev_close = req.candles[-2]["close"] if len(req.candles) >= 2 else price

    # ── Historique multi-horizons ──────────────────────────────────────────
    def perf_n(n):
        if len(req.candles) <= n: return None
        p = (req.candles[-1]["close"] - req.candles[-n-1]["close"]) / req.candles[-n-1]["close"] * 100
        return round(p, 2)

    perf_1j  = perf_n(1)
    perf_5j  = perf_n(5)
    perf_20j = perf_n(20)
    perf_60j = perf_n(60)

    hist_text = f"""
ÉVOLUTION MULTI-HORIZONS:
- Performance 1 jour :  {f'{perf_1j:+.2f}%'  if perf_1j  is not None else 'N/A'}
- Performance 5 jours : {f'{perf_5j:+.2f}%'  if perf_5j  is not None else 'N/A'}  (~1 semaine)
- Performance 20 jours: {f'{perf_20j:+.2f}%' if perf_20j is not None else 'N/A'}  (~1 mois)
- Performance 60 jours: {f'{perf_60j:+.2f}%' if perf_60j is not None else 'N/A'}  (~3 mois)
- Plus haut 60j: {max(c['high']  for c in req.candles[-60:]):.2f}
- Plus bas  60j: {min(c['low']   for c in req.candles[-60:]):.2f}
- Clôture:    {price:.2f}  (veille: {prev_close:.2f})
"""

    # ── Intraday ───────────────────────────────────────────────────────────
    s = intraday.get("session", {})
    intra_text = ""
    if s.get("open"):
        intra_text = f"""
SÉANCE DU JOUR (intraday):
- Ouverture: {s['open']:.2f}  |  Haut: {s.get('high', 'N/A')}  |  Bas: {s.get('low', 'N/A')}
- VWAP: {s.get('vwap', 'N/A')}  |  Volume: {int(s.get('volume', 0)):,}
- Variation par rapport à l'ouverture: {f"{s['delta_open']:+.2f}%" if s.get('delta_open') is not None else 'N/A'}
- État marché: {intraday.get('market_state', 'N/A')}
- Bougies intraday disponibles: {len(intraday.get('candles', []))}
"""

    # ── Indicateurs ────────────────────────────────────────────────────────
    ind_text = f"""
INDICATEURS TECHNIQUES:
- RSI(14): {rsi:.1f}  {'🔴 SURVENTE' if rsi < 35 else '🔴 SURACHAT' if rsi > 65 else '🟡 neutre'}
- MACD: {ind.get('macd', 'N/A')} | Signal: {ind.get('macd_signal', 'N/A')}
- SMA20: {ind.get('sma20', 'N/A')} | SMA50: {ind.get('sma50', 'N/A')}
- BB Upper: {ind.get('bb_upper', 'N/A')} | BB Lower: {ind.get('bb_lower', 'N/A')}
"""

    # ── Contexte sectoriel ─────────────────────────────────────────────────
    sector_text = ""
    if req.sector_perf:
        sector_text = f"""
CONTEXTE SECTORIEL ({req.sector}):
- Performance secteur 5j: {req.sector_perf.get('avg_perf_5j', 'N/A')}%
- Score moyen secteur: {req.sector_perf.get('avg_score', 'N/A')}
- Potentiel moyen: {req.sector_perf.get('avg_potential', 'N/A')}%
- Pays du secteur: {', '.join(req.sector_perf.get('countries', []))}
"""

    # ── Géopolitique ──────────────────────────────────────────────────────
    geo_text = ""
    if req.geo_events:
        geo_lines = "\n".join([
            f"- [{e.get('signal','?')}] {e.get('title','')}: {e.get('brief','')} (impact: {e.get('impact','?')}, secteurs: {', '.join(e.get('sectors', []))})"
            for e in req.geo_events[:3]
        ])
        geo_text = f"\nÉVÉNEMENTS GÉOPOLITIQUES DU JOUR:\n{geo_lines}"

    # ── News ───────────────────────────────────────────────────────────────
    news_text = ""
    if req.articles:
        news_text = "ACTUALITÉS RÉCENTES:\n" + "\n".join([
            f"- [{a.get('source','?')}] {a.get('title','')}"
            for a in req.articles[:5]
        ])

    # ── Patterns ──────────────────────────────────────────────────────────
    patterns_text = format_for_prompt(patterns)
    date_str = req.market_date or time.strftime("%d/%m/%Y")

    return f"""Tu es un analyste financier senior. Effectue une ANALYSE DE CLÔTURE complète pour {req.symbol} ({req.name}) à la date du {date_str}.

CONTEXTE:
- Secteur: {req.sector or 'Non spécifié'}
- Indice: {req.index or 'Non spécifié'}
- Prix de clôture: {price:.2f}
{hist_text}
{intra_text}
{ind_text}
{patterns_text}
{sector_text}
{geo_text}
{news_text}

Ta mission: produire une analyse de clôture professionnelle qui:
1. Résume la séance (comportement intraday, volume, momentum)
2. Évalue la tendance sur chaque horizon (jour, semaine, mois, trimestre)
3. Intègre le contexte sectoriel et géopolitique
4. Donne un diagnostic technique précis
5. Établit un pronostic argumenté pour la prochaine séance et les 5 jours suivants
6. Identifie les niveaux clés à surveiller (support, résistance, VWAP)

Réponds UNIQUEMENT en JSON valide (sans markdown):
{{
  "seance": {{
    "resume": "2-3 phrases sur le déroulé de la séance",
    "biais": "HAUSSIER" | "BAISSIER" | "NEUTRE",
    "volume_signal": "FORT_ACHAT" | "FORT_VENTE" | "NORMAL" | "FAIBLE",
    "momentum": "ACCÉLÈRE" | "RALENTIT" | "STABLE"
  }},
  "tendances": {{
    "journaliere":   {{ "sens": "HAUSSE"|"BAISSE"|"LATERAL", "force": 1-5, "note": "phrase courte" }},
    "hebdomadaire":  {{ "sens": "HAUSSE"|"BAISSE"|"LATERAL", "force": 1-5, "note": "phrase courte" }},
    "mensuelle":     {{ "sens": "HAUSSE"|"BAISSE"|"LATERAL", "force": 1-5, "note": "phrase courte" }},
    "trimestrielle": {{ "sens": "HAUSSE"|"BAISSE"|"LATERAL", "force": 1-5, "note": "phrase courte" }}
  }},
  "niveaux": {{
    "support_immediat":  nombre,
    "resistance_immediate": nombre,
    "vwap":              nombre | null,
    "objectif_haussier": nombre,
    "stop_suggere":      nombre
  }},
  "contexte": {{
    "secteur": "impact du secteur sur la valeur (phrase)",
    "geopolitique": "impact géopolitique pertinent (phrase)",
    "macro": "contexte macro (phrase)"
  }},
  "pronostic": {{
    "prochaine_seance": {{ "direction": "HAUSSE"|"BAISSE"|"NEUTRE", "cible": nombre, "confiance": 1-10 }},
    "cinq_jours":       {{ "direction": "HAUSSE"|"BAISSE"|"NEUTRE", "cible": nombre, "confiance": 1-10 }},
    "verdict": "ACHETER" | "RENFORCER" | "CONSERVER" | "ALLÉGER" | "ÉVITER",
    "risques": ["risque 1", "risque 2"],
    "catalyseurs": ["catalyseur 1", "catalyseur 2"]
  }},
  "analyse_narrative": "paragraphe complet de 4-6 phrases synthétisant tout"
}}"""


@router.post("/cloture")
def analyze_cloture(req: ClotureRequest):
    """
    Analyse de clôture IA — intègre séance intraday + historique multi-horizons
    + secteur + géopolitique → Diagnostic & Pronostic complet.
    """
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    groq_key   = os.getenv("GROQ_API_KEY", "")
    if not gemini_key and not groq_key:
        return {"error": "Aucune clé IA configurée"}

    # Patterns graphiques
    patterns = detect_patterns(req.candles, req.indicators)

    # Données intraday fraîches (5min bars)
    try:
        intraday = get_intraday(req.symbol, "5m")
    except Exception:
        intraday = {"candles": [], "session": {}, "market_state": "CLOSED"}

    prompt = _build_cloture_prompt(req, patterns, intraday)

    raw = None
    if gemini_key:
        for model in GEMINI_MODELS:
            try:
                raw = _call_gemini(gemini_key, model, prompt)
                print(f"[CLOTURE] {req.symbol} via Gemini/{model}")
                break
            except Exception as e:
                print(f"[CLOTURE] Gemini/{model} échec: {e}")
    if raw is None and groq_key:
        try:
            raw = _call_groq(groq_key, prompt)
        except Exception as e:
            print(f"[CLOTURE] Groq échec: {e}")

    try:
        if raw is None:
            raise ValueError("Tous les modèles ont échoué")
        result = _parse_json(raw)
        result["patterns_detected"] = patterns
        result["intraday_session"]  = intraday.get("session", {})
        return result
    except Exception as e:
        print(f"[CLOTURE ERROR] {e}")
        return {
            "error": str(e),
            "patterns_detected": patterns,
            "seance":   {"resume": "Analyse indisponible", "biais": "NEUTRE"},
            "pronostic":{"verdict": "CONSERVER", "risques": [], "catalyseurs": []},
        }


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
