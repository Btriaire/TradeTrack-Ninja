"""
Moteur de signaux quotidiens — scoring technique + narrative IA
Analyse ~40 valeurs majeures (CAC40, DAX, S&P500, UK) toutes les 6h.
"""
import time, asyncio
from concurrent.futures import ThreadPoolExecutor
from services.yahoo_finance import get_history, get_indicators, get_quote

# ── Univers de valeurs à analyser ─────────────────────────────────────────────
UNIVERSE = [
    # ── CAC 40 ──────────────────────────────────────────────────────────────
    {"symbol": "MC.PA",   "name": "LVMH",             "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "AIR.PA",  "name": "Airbus",            "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "TTE.PA",  "name": "TotalEnergies",     "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "BNP.PA",  "name": "BNP Paribas",       "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "SAN.PA",  "name": "Sanofi",            "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "OR.PA",   "name": "L'Oréal",           "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "RI.PA",   "name": "Pernod Ricard",     "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "SU.PA",   "name": "Schneider Electric","index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "KER.PA",  "name": "Kering",            "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "DSY.PA",  "name": "Dassault Systèmes", "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "CAP.PA",  "name": "Capgemini",         "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "STM.PA",  "name": "STMicroelectronics","index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "RMS.PA",  "name": "Hermès",            "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "ACA.PA",  "name": "Crédit Agricole",   "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "SAF.PA",  "name": "Safran",            "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "GLE.PA",  "name": "Société Générale",  "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "RNO.PA",  "name": "Renault",           "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "ENGI.PA", "name": "Engie",             "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "AI.PA",   "name": "Air Liquide",       "index": "CAC 40", "country": "🇫🇷"},
    {"symbol": "DG.PA",   "name": "Vinci",             "index": "CAC 40", "country": "🇫🇷"},
    # ── DAX ─────────────────────────────────────────────────────────────────
    {"symbol": "SAP.DE",  "name": "SAP",               "index": "DAX",    "country": "🇩🇪"},
    {"symbol": "SIE.DE",  "name": "Siemens",           "index": "DAX",    "country": "🇩🇪"},
    {"symbol": "ALV.DE",  "name": "Allianz",           "index": "DAX",    "country": "🇩🇪"},
    {"symbol": "BMW.DE",  "name": "BMW",               "index": "DAX",    "country": "🇩🇪"},
    {"symbol": "BAYN.DE", "name": "Bayer",             "index": "DAX",    "country": "🇩🇪"},
    {"symbol": "BAS.DE",  "name": "BASF",              "index": "DAX",    "country": "🇩🇪"},
    {"symbol": "ADS.DE",  "name": "Adidas",            "index": "DAX",    "country": "🇩🇪"},
    # ── S&P 500 / NASDAQ ────────────────────────────────────────────────────
    {"symbol": "AAPL",    "name": "Apple",             "index": "NASDAQ", "country": "🇺🇸"},
    {"symbol": "MSFT",    "name": "Microsoft",         "index": "NASDAQ", "country": "🇺🇸"},
    {"symbol": "NVDA",    "name": "NVIDIA",            "index": "NASDAQ", "country": "🇺🇸"},
    {"symbol": "AMZN",    "name": "Amazon",            "index": "NASDAQ", "country": "🇺🇸"},
    {"symbol": "META",    "name": "Meta",              "index": "NASDAQ", "country": "🇺🇸"},
    {"symbol": "TSLA",    "name": "Tesla",             "index": "NASDAQ", "country": "🇺🇸"},
    {"symbol": "JPM",     "name": "JPMorgan",          "index": "S&P 500","country": "🇺🇸"},
    {"symbol": "JNJ",     "name": "Johnson & Johnson", "index": "S&P 500","country": "🇺🇸"},
    # ── FTSE 100 ────────────────────────────────────────────────────────────
    {"symbol": "SHEL.L",  "name": "Shell",             "index": "FTSE 100","country": "🇬🇧"},
    {"symbol": "AZN.L",   "name": "AstraZeneca",       "index": "FTSE 100","country": "🇬🇧"},
    {"symbol": "HSBA.L",  "name": "HSBC",              "index": "FTSE 100","country": "🇬🇧"},
    # ── Euronext Amsterdam ──────────────────────────────────────────────────
    {"symbol": "ASML.AS", "name": "ASML",              "index": "AEX",    "country": "🇳🇱"},
    {"symbol": "PHIA.AS", "name": "Philips",           "index": "AEX",    "country": "🇳🇱"},
]

# ── Cache ─────────────────────────────────────────────────────────────────────
_cache: dict = {"ts": 0, "data": None, "generating": False}
CACHE_TTL = 6 * 3600  # 6 heures


def _score_stock(stock: dict) -> dict | None:
    """Calcule un score technique pour une valeur. Retourne None si données insuffisantes."""
    sym = stock["symbol"]
    try:
        candles    = get_history(sym, "3mo")
        indicators = get_indicators(sym, "3mo")
        quote      = get_quote(sym)

        if not candles or not indicators or not quote.get("price"):
            return None

        price  = quote["price"]
        score  = 0.0
        tags   = []   # raisons courtes pour l'UI
        detail = []   # détail pour le prompt IA

        rsi        = indicators.get("rsi", 50) or 50
        macd       = indicators.get("macd", 0) or 0
        macd_sig   = indicators.get("macd_signal", 0) or 0
        bb_upper   = indicators.get("bb_upper") or 0
        bb_lower   = indicators.get("bb_lower") or 0
        sma20      = indicators.get("sma20") or price
        sma50      = indicators.get("sma50") or price

        # ── RSI ──────────────────────────────────────────────────────────────
        if rsi <= 25:
            score += 3; tags.append("RSI fortement survendu"); detail.append(f"RSI={rsi:.0f} (≤25, fort signal achat)")
        elif rsi <= 35:
            score += 2; tags.append("RSI survendu");           detail.append(f"RSI={rsi:.0f} (survendu)")
        elif rsi <= 45:
            score += 0.5;                                       detail.append(f"RSI={rsi:.0f} (neutre bas)")
        elif rsi >= 75:
            score -= 3; tags.append("RSI fortement suracheté");detail.append(f"RSI={rsi:.0f} (≥75, fort signal vente)")
        elif rsi >= 65:
            score -= 2; tags.append("RSI suracheté");          detail.append(f"RSI={rsi:.0f} (suracheté)")
        elif rsi >= 55:
            score -= 0.5;                                       detail.append(f"RSI={rsi:.0f} (neutre haut)")

        # ── MACD ─────────────────────────────────────────────────────────────
        if macd > macd_sig:
            score += 1; detail.append("MACD > signal (momentum haussier)")
        else:
            score -= 1; detail.append("MACD < signal (momentum baissier)")

        # ── Bandes de Bollinger ───────────────────────────────────────────────
        if bb_lower and price < bb_lower:
            score += 2; tags.append("Sous BB inférieure"); detail.append("Prix sous bande de Bollinger inférieure (rebond probable)")
        elif bb_upper and price > bb_upper:
            score -= 2; tags.append("Sur BB supérieure");  detail.append("Prix sur bande de Bollinger supérieure (résistance)")

        # ── Tendance SMA ─────────────────────────────────────────────────────
        if price > sma20 > sma50:
            score += 1; detail.append("Au-dessus SMA20 et SMA50 (uptrend)")
        elif price < sma20 < sma50:
            score -= 1; detail.append("Sous SMA20 et SMA50 (downtrend)")
        elif price < sma20:
            score -= 0.5

        # ── Performance récente 5j ───────────────────────────────────────────
        if len(candles) >= 5:
            perf5 = (candles[-1]["close"] - candles[-5]["close"]) / candles[-5]["close"] * 100
            if perf5 <= -8:
                score += 1.5; tags.append(f"Recul {perf5:.1f}% / 5j"); detail.append(f"Recul de {perf5:.1f}% sur 5 séances (opportunité)")
            elif perf5 <= -4:
                score += 0.5; tags.append(f"Recul {perf5:.1f}% / 5j")
            elif perf5 >= 10:
                score -= 1.5; tags.append(f"Hausse {perf5:.1f}% / 5j"); detail.append(f"Hausse de {perf5:.1f}% sur 5 séances (risque essoufflement)")
        else:
            perf5 = 0.0

        # ── Estimation potentiel ──────────────────────────────────────────────
        if score > 0 and bb_upper and price:
            # Potentiel haussier = distance vers BB supérieure
            potential_pct = round((bb_upper - price) / price * 100, 1)
        elif score < 0 and bb_lower and price:
            # Potentiel baissier = distance vers BB inférieure
            potential_pct = round((price - bb_lower) / price * 100 * -1, 1)
        else:
            potential_pct = 0.0

        # ── Horizon estimé ────────────────────────────────────────────────────
        abs_rsi_dist = abs(rsi - 50)
        if abs_rsi_dist >= 25:
            horizon = "2-4 jours"
        elif abs_rsi_dist >= 15:
            horizon = "3-7 jours"
        else:
            horizon = "5-10 jours"

        return {
            "symbol":       sym,
            "name":         stock["name"],
            "index":        stock["index"],
            "country":      stock["country"],
            "price":        round(price, 2),
            "change_pct":   quote.get("change_pct") or 0.0,
            "score":        round(score, 2),
            "rsi":          round(rsi, 1),
            "tags":         tags[:3],
            "detail":       detail,
            "potential_pct":potential_pct,
            "horizon":      horizon,
            "signal":       indicators.get("signal", "NEUTRE"),
            "reason":       "",   # rempli par l'IA après
        }
    except Exception as e:
        print(f"[SIGNAL] {sym}: {e}")
        return None


def compute_signals() -> dict:
    """Calcule les signaux pour tout l'univers (synchrone, appelé en thread)."""
    scored = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(_score_stock, s): s for s in UNIVERSE}
        for future in futures:
            res = future.result()
            if res:
                scored.append(res)

    scored.sort(key=lambda x: x["score"], reverse=True)

    great_catch = [s for s in scored if s["score"] >= 2.0][:6]
    stay_away   = [s for s in scored if s["score"] <= -2.0][-6:]
    stay_away   = list(reversed(stay_away))  # plus négatif en premier

    return {
        "great_catch": great_catch,
        "stay_away":   stay_away,
        "all_scores":  scored,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "universe_size": len(scored),
    }


def get_signals_cached() -> dict:
    """Retourne les signaux depuis le cache, ou calcule si expiré."""
    now = time.time()
    if _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["data"]

    if _cache["generating"]:
        # Calcul en cours → retourner ancien cache ou vide
        return _cache["data"] or {"great_catch": [], "stay_away": [], "generating": True}

    _cache["generating"] = True
    try:
        data = compute_signals()
        _cache["data"] = data
        _cache["ts"]   = time.time()
        return data
    finally:
        _cache["generating"] = False
