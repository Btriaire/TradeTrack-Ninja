"""
Détecteur de patterns techniques sur données OHLCV.
Analyse les configurations graphiques pour enrichir le prompt IA.
"""
from typing import Optional


def detect_patterns(candles: list[dict], indicators: dict = {}) -> dict:
    """
    Analyse les données OHLCV et retourne un rapport de patterns techniques.
    """
    if not candles or len(candles) < 10:
        return {"trend": "INCONNU", "patterns": [], "support": None, "resistance": None}

    closes  = [c["close"] for c in candles]
    highs   = [c["high"]  for c in candles]
    lows    = [c["low"]   for c in candles]
    opens   = [c["open"]  for c in candles]
    volumes = [c.get("volume", 0) for c in candles]
    last    = candles[-1]

    result = {
        "trend":         _detect_trend(closes, indicators),
        "trend_force":   _trend_force(closes),
        "patterns":      [],
        "support":       _find_support(lows),
        "resistance":    _find_resistance(highs),
        "volume_signal": _volume_signal(volumes, closes),
        "perf_5j":       _perf_n(closes, 5),
        "perf_20j":      _perf_n(closes, 20),
        "bb_position":   _bb_position(closes[-1], indicators),
        "candle_pattern":_last_candle_pattern(candles[-5:]),
        "divergence":    _detect_divergence(closes, volumes),
    }
    return result


def _detect_trend(closes: list, indicators: dict) -> str:
    """Tendance basée sur SMA20 vs SMA50 et pente."""
    sma20 = indicators.get("sma20")
    sma50 = indicators.get("sma50")
    price = closes[-1]

    if sma20 and sma50:
        if price > sma20 > sma50:
            return "HAUSSIER"
        elif price < sma20 < sma50:
            return "BAISSIER"
        elif price > sma20:
            return "HAUSSIER_MODÉRÉ"
        elif price < sma20:
            return "BAISSIER_MODÉRÉ"

    # Fallback: comparaison 20 premières vs 20 dernières clôtures
    n = min(20, len(closes) // 2)
    avg_first = sum(closes[:n]) / n
    avg_last  = sum(closes[-n:]) / n
    diff = (avg_last - avg_first) / avg_first * 100
    if diff > 3:    return "HAUSSIER"
    if diff < -3:   return "BAISSIER"
    return "LATÉRAL"


def _trend_force(closes: list) -> str:
    """Force de la tendance sur 20 dernières séances."""
    if len(closes) < 20:
        return "FAIBLE"
    n = min(20, len(closes))
    c = closes[-n:]
    # Proportion de séances dans le sens de la tendance
    trend_days = sum(1 for i in range(1, len(c)) if c[i] > c[i-1])
    ratio = trend_days / (len(c) - 1)
    if ratio > 0.65:   return "FORTE"
    if ratio > 0.50:   return "MODÉRÉE"
    return "FAIBLE"


def _find_support(lows: list) -> Optional[float]:
    """Trouve le support principal (plus bas local récent)."""
    if len(lows) < 10:
        return None
    recent = lows[-30:]
    # Filtrer les creux locaux
    troughs = []
    for i in range(1, len(recent) - 1):
        if recent[i] <= recent[i-1] and recent[i] <= recent[i+1]:
            troughs.append(recent[i])
    if troughs:
        return round(min(troughs), 2)
    return round(min(recent), 2)


def _find_resistance(highs: list) -> Optional[float]:
    """Trouve la résistance principale (plus haut local récent)."""
    if len(highs) < 10:
        return None
    recent = highs[-30:]
    peaks = []
    for i in range(1, len(recent) - 1):
        if recent[i] >= recent[i-1] and recent[i] >= recent[i+1]:
            peaks.append(recent[i])
    if peaks:
        return round(max(peaks), 2)
    return round(max(recent), 2)


def _volume_signal(volumes: list, closes: list) -> str:
    """Signal volume : divergence ou confirmation."""
    if len(volumes) < 10:
        return "NEUTRE"
    avg_vol = sum(volumes[-10:]) / 10
    last_vol = volumes[-1]
    price_up = closes[-1] > closes[-2] if len(closes) >= 2 else True

    if last_vol > avg_vol * 1.5:
        return "VOLUME_FORT_HAUSSE" if price_up else "VOLUME_FORT_BAISSE"
    if last_vol < avg_vol * 0.5:
        return "VOLUME_FAIBLE"
    return "VOLUME_NORMAL"


def _perf_n(closes: list, n: int) -> float:
    """Performance sur n séances."""
    if len(closes) <= n:
        return 0.0
    return round((closes[-1] - closes[-n-1]) / closes[-n-1] * 100, 2)


def _bb_position(price: float, indicators: dict) -> str:
    """Position par rapport aux bandes de Bollinger."""
    bb_upper = indicators.get("bb_upper")
    bb_lower = indicators.get("bb_lower")
    if not bb_upper or not bb_lower:
        return "INCONNU"
    if price >= bb_upper:
        return "SURACHAT_BB"
    if price <= bb_lower:
        return "SURVENTE_BB"
    mid = (bb_upper + bb_lower) / 2
    if price > mid:
        return "MOITIÉ_HAUTE"
    return "MOITIÉ_BASSE"


def _last_candle_pattern(last5: list) -> str:
    """Détecte le pattern de la dernière bougie / des dernières bougies."""
    if not last5:
        return "INCONNU"
    c = last5[-1]
    body  = abs(c["close"] - c["open"])
    total = c["high"] - c["low"]
    if total == 0:
        return "INCONNU"

    body_ratio  = body / total
    upper_wick  = c["high"] - max(c["open"], c["close"])
    lower_wick  = min(c["open"], c["close"]) - c["low"]
    is_bullish  = c["close"] > c["open"]

    # Doji
    if body_ratio < 0.1:
        return "DOJI (indécision)"

    # Marteau / Pendu
    if lower_wick > body * 2 and upper_wick < body * 0.5:
        return "MARTEAU (signal haussier potentiel)" if not is_bullish else "PENDU (signal baissier potentiel)"

    # Étoile filante
    if upper_wick > body * 2 and lower_wick < body * 0.5:
        return "ÉTOILE FILANTE (signal baissier)"

    # Marubozu
    if body_ratio > 0.85:
        return "MARUBOZU HAUSSIER (fort momentum)" if is_bullish else "MARUBOZU BAISSIER (fort momentum)"

    # Engulfing sur 2 dernières bougies
    if len(last5) >= 2:
        prev = last5[-2]
        prev_body = abs(prev["close"] - prev["open"])
        if body > prev_body * 1.5:
            if is_bullish and prev["close"] < prev["open"]:
                return "ENGLOUTISSANT HAUSSIER"
            if not is_bullish and prev["close"] > prev["open"]:
                return "ENGLOUTISSANT BAISSIER"

    return "BOUGIE HAUSSIÈRE" if is_bullish else "BOUGIE BAISSIÈRE"


def _detect_divergence(closes: list, volumes: list) -> str:
    """Détecte les divergences prix/volume sur les 5 dernières séances."""
    if len(closes) < 5 or len(volumes) < 5:
        return "INCONNU"
    c5, v5 = closes[-5:], volumes[-5:]
    price_trend  = c5[-1] > c5[0]
    volume_trend = v5[-1] > v5[0]
    if price_trend and not volume_trend:
        return "DIVERGENCE_BAISSIÈRE (hausse sans volume)"
    if not price_trend and volume_trend:
        return "DIVERGENCE_HAUSSIÈRE (baisse avec volume)"
    return "PAS_DE_DIVERGENCE"


def format_for_prompt(patterns: dict) -> str:
    """Formate les patterns pour inclusion dans le prompt IA."""
    return f"""
ANALYSE GRAPHIQUE AUTOMATIQUE:
- Tendance: {patterns.get('trend','?')} (force: {patterns.get('trend_force','?')})
- Pattern bougie: {patterns.get('candle_pattern','?')}
- Position Bollinger: {patterns.get('bb_position','?')}
- Signal volume: {patterns.get('volume_signal','?')}
- Divergence prix/volume: {patterns.get('divergence','?')}
- Performance 5j: {patterns.get('perf_5j',0):+.2f}% | Performance 20j: {patterns.get('perf_20j',0):+.2f}%
- Support estimé: {patterns.get('support') or 'N/A'} | Résistance estimée: {patterns.get('resistance') or 'N/A'}
"""
