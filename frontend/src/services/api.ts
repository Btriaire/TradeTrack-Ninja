import axios from 'axios'
import type {
  Quote, Candle, Indicators, Article, FeeBreakdown,
  AIAnalysis, SearchResult, MarketIndex,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
const api = axios.create({ baseURL: BASE_URL })

export const getQuote = (symbol: string): Promise<Quote> =>
  api.get(`/stocks/quote/${symbol}`).then(r => r.data)

export const getLiveQuote = (symbol: string) =>
  api.get(`/stocks/live/${symbol}`).then(r => r.data)

export const getIntraday = (symbol: string, interval = '5m') =>
  api.get(`/stocks/intraday/${symbol}`, { params: { interval } }).then(r => r.data)

export const getHistory = (symbol: string, period = '6mo', interval = '1d'): Promise<Candle[]> =>
  api.get(`/stocks/history/${symbol}`, { params: { period, interval } }).then(r => r.data)

export const getIndicators = (symbol: string): Promise<Indicators> =>
  api.get(`/stocks/indicators/${symbol}`).then(r => r.data)

export const getNews = (symbol?: string): Promise<Article[]> =>
  api.get('/news/', { params: symbol ? { symbol } : {} }).then(r => r.data)

export const searchStocks = (q: string, market = 'ALL'): Promise<SearchResult[]> =>
  api.get('/stocks/search', { params: { q, market } }).then(r => r.data)

export const getIndices = (): Promise<MarketIndex[]> =>
  api.get('/stocks/indices').then(r => r.data)

export const simulateOrder = (payload: {
  montant: number
  quantite: number
  prix_unitaire: number
  action_francaise: boolean
  eligible_ttf: boolean
  srd: boolean
  marche: string
}): Promise<FeeBreakdown> =>
  api.post('/simulator/order', payload).then(r => r.data)

export const getTarifs = () =>
  api.get('/simulator/tarifs').then(r => r.data)

export const analyzeSentiment = (payload: {
  symbol: string
  articles: Article[]
  indicators: Indicators | {}
  prompt_config?: object
  candles?: object[]
}): Promise<AIAnalysis> =>
  api.post('/analysis/sentiment', payload).then(r => r.data)

export const getMarkets = () =>
  api.get('/stocks/markets').then(r => r.data)

export const getSectors = () =>
  api.get('/stocks/sectors').then(r => r.data)

export const getGeneralNews = (category = 'Tout') =>
  api.get('/news/general', { params: category !== 'Tout' ? { category } : {} }).then(r => r.data)

export const getSignals = () =>
  api.get('/signals/daily').then(r => r.data)

export const getGameOfDay = () =>
  api.get('/signals/game').then(r => r.data)

export const getTopSectors = () =>
  api.get('/signals/top-sectors').then(r => r.data)

export const getGeoEvents = () =>
  api.get('/signals/geo-events').then(r => r.data)

export const refreshSignals = () =>
  api.post('/signals/refresh').then(r => r.data)

export const analyzeDiagnostic = (payload: {
  symbol: string
  name: string
  sector: string
  index: string
  candles: object[]
  indicators: object
  articles: object[]
  with_explanation: boolean
}) => api.post('/analysis/diagnostic', payload).then(r => r.data)

export const getProfile = (symbol: string) =>
  api.get(`/stocks/profile/${symbol}`).then(r => r.data)

export const analyzeClotureIA = (payload: {
  symbol:      string
  name:        string
  sector:      string
  index:       string
  candles:     object[]
  indicators:  object
  articles:    object[]
  geo_events:  object[]
  sector_perf: object
  market_date: string
}) => api.post('/analysis/cloture', payload).then(r => r.data)

export const pingBackend = () =>
  api.get('/ping').catch(() => null)   // silencieux si le backend dort encore

export const getBatchQuotes = (symbols: string[]) =>
  api.get('/stocks/batch-quotes', { params: { symbols: symbols.join(',') } }).then(r => r.data)
