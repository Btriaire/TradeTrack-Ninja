export interface Quote {
  symbol: string
  price: number
  prev_close: number
  change: number
  change_pct: number
  volume: number
  market_cap: number
  currency: string
}

export interface Candle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Indicators {
  rsi: number
  macd: number
  macd_signal: number
  bb_upper: number
  bb_lower: number
  sma20: number
  sma50: number | null
  signal: 'HAUSSIER' | 'BAISSIER' | 'NEUTRE'
}

export interface Article {
  source: string
  title: string
  summary: string
  url: string
  date: string
}

export interface FeeBreakdown {
  montant_brut: number
  courtage: number
  ttf: number
  srd: number
  droits_garde_annuels: number
  total_frais: number
  montant_net_achat: number
  montant_net_vente: number
  taux_effectif_pct: number
  seuil_rentabilite_par_action: number
  methode: string
  types_ordres: string[]
  note: string
}

export interface AIAnalysis {
  sentiment: 'HAUSSIER' | 'BAISSIER' | 'NEUTRE'
  score: number
  resume: string
  points_cles: string[]
  risques: string[]
  horizon: string
}

export interface WatchlistItem {
  symbol: string
  name: string
}
