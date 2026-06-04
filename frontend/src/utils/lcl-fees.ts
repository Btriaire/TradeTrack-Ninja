/**
 * Calcul des frais LCL Bourse — grille tarifaire 2024
 * Ordres internet, compte-titres ordinaire (pas PEA, pas SRD)
 */

/**
 * Détermine si une valeur est éligible au PEA français.
 * Règle simplifiée (applicable pour LCL PEA) :
 *   - Actions de sociétés domiciliées dans l'UE / EEE sont éligibles
 *   - UK (.L) exclue depuis le Brexit
 *   - USA, Japon, etc. exclus
 *   - ETF : seuls les ETF UCITS domiciliés dans l'UE sont éligibles
 *     (on ne peut pas le savoir depuis le symbole seul → false par défaut)
 */
export function isPeaEligible(symbol: string): boolean {
  const s = symbol.toUpperCase()
  // Suffixes Euronext / marchés UE+EEE
  const EU_SUFFIXES = [
    '.PA',  // Euronext Paris (France)
    '.DE',  // XETRA (Allemagne)
    '.AS',  // Euronext Amsterdam (Pays-Bas)
    '.BE',  // Euronext Bruxelles (Belgique)
    '.MI',  // Borsa Italiana (Italie)
    '.MC',  // Bolsa de Madrid (Espagne)
    '.LS',  // Euronext Lisbonne (Portugal)
    '.HE',  // Helsinki (Finlande)
    '.ST',  // Stockholm (Suède)
    '.CO',  // Copenhague (Danemark)
    '.OL',  // Oslo (Norvège)
    '.VI',  // Vienne (Autriche)
    '.WA',  // Varsovie (Pologne)
    '.PR',  // Prague (Tchéquie)
    '.BD',  // Budapest (Hongrie)
  ]
  return EU_SUFFIXES.some(sfx => s.endsWith(sfx))
}

export interface LclFeeBreakdown {
  courtage:     number   // frais de courtage
  ttf:          number   // taxe sur transactions financières (0.3% actions FR)
  stampDuty:    number   // stamp duty UK (0.5% actions .L)
  total:        number   // total frais pour cet ordre (achat)
  totalAller:   number   // frais achat (= total)
  tauxEffectif: number   // % du montant brut
  label:        string   // description lisible
}

/** Courtage internet LCL sur le montant de l'ordre */
function calcCourtage(montant: number): number {
  if (montant <= 800)  return 8.50
  if (montant <= 3000) return montant * 0.007
  return Math.max(montant * 0.005, 15)
}

/**
 * Détermine si la TTF (0.30%) s'applique.
 * S'applique aux achats d'actions françaises avec cap. boursière > 1 Mrd€.
 * On considère tous les titres Euronext Paris (.PA) comme éligibles par défaut
 * (hors micro-caps — mais conservatif = on l'applique toujours pour .PA).
 */
function isTtfEligible(symbol: string): boolean {
  return symbol.toUpperCase().endsWith('.PA')
}

/** Stamp duty UK (0.5% à l'achat uniquement) */
function isUkStamp(symbol: string): boolean {
  return symbol.toUpperCase().endsWith('.L')
}

/**
 * Calcule les frais LCL pour un ordre d'achat.
 * @param symbol   Symbole Yahoo Finance (ex: MC.PA, AAPL, SHEL.L)
 * @param qty      Quantité d'actions
 * @param price    Prix unitaire en €
 */
export function calcLclFees(symbol: string, qty: number, price: number): LclFeeBreakdown {
  const montant  = qty * price
  if (!montant || montant <= 0) {
    return { courtage: 0, ttf: 0, stampDuty: 0, total: 0, totalAller: 0, tauxEffectif: 0, label: '' }
  }

  const courtage  = round2(calcCourtage(montant))
  const ttf       = isTtfEligible(symbol)  ? round2(montant * 0.003)  : 0
  const stampDuty = isUkStamp(symbol)      ? round2(montant * 0.005)  : 0
  const total     = round2(courtage + ttf + stampDuty)
  const tauxEffectif = montant > 0 ? round4(total / montant * 100) : 0

  const parts: string[] = [`courtage ${courtage.toFixed(2)} €`]
  if (ttf > 0)       parts.push(`TTF ${ttf.toFixed(2)} €`)
  if (stampDuty > 0) parts.push(`stamp duty ${stampDuty.toFixed(2)} €`)

  return {
    courtage,
    ttf,
    stampDuty,
    total,
    totalAller:   total,
    tauxEffectif,
    label: parts.join(' + '),
  }
}

/** Seuil de rentabilité : prix de revente minimum pour couvrir les frais A/R */
export function calcBreakeven(buyPrice: number, qty: number, fees: number): number {
  if (!qty || !buyPrice) return 0
  // On estime les frais de vente = même courtage sur même montant
  const montantAchat = buyPrice * qty
  const fraisVente   = calcCourtage(montantAchat)
  return round2(buyPrice + (fees + fraisVente) / qty)
}

function round2(v: number) { return Math.round(v * 100) / 100 }
function round4(v: number) { return Math.round(v * 10000) / 10000 }
