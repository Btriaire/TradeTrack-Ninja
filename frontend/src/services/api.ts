import axios from 'axios'
import type {
  Quote, Candle, Indicators, Article, FeeBreakdown,
  AIAnalysis, SearchResult, MarketIndex,
} from '../types'

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'
const api = axios.create({ baseURL: BASE_URL })

export const getQuote = (symbol: string): Promise<Quote> =>
  api.get(`/stocks/quote/${symbol}`).then(r => r.data)

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
