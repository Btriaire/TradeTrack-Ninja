import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, Newspaper, Calculator, Sparkles, Activity } from 'lucide-react'
import { Watchlist } from './components/Watchlist'
import { StockChart } from './components/StockChart'
import { QuoteHeader } from './components/QuoteHeader'
import { NewsPanel } from './components/NewsPanel'
import { OrderSimulator } from './components/OrderSimulator'
import { AIPanel } from './components/AIPanel'
import { AuthButton } from './components/AuthButton'
import { useAuth } from './hooks/useAuth'
import { useWatchlist } from './hooks/useWatchlist'
import { getHistory, getIndicators, getQuote, getNews } from './services/api'

type Tab = 'chart' | 'news' | 'simulator' | 'ai'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'chart',     label: 'Graphique',  icon: BarChart2  },
  { id: 'news',      label: 'Actualités', icon: Newspaper  },
  { id: 'simulator', label: 'Simulateur', icon: Calculator },
  { id: 'ai',        label: 'Analyse IA', icon: Sparkles   },
]

export default function App() {
  const [symbol, setSymbol] = useState('MC.PA')
  const [period, setPeriod] = useState('6mo')
  const [activeTab, setActiveTab] = useState<Tab>('chart')
  const { user } = useAuth()
  const { items: watchlistItems, addItem, removeItem } = useWatchlist(user)

  const { data: quote } = useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => getQuote(symbol),
    refetchInterval: 30000,
  })

  const { data: candles = [] } = useQuery({
    queryKey: ['history', symbol, period],
    queryFn: () => getHistory(symbol, period),
  })

  const { data: indicators } = useQuery({
    queryKey: ['indicators', symbol],
    queryFn: () => getIndicators(symbol),
    refetchInterval: 60000,
  })

  const { data: articles = [] } = useQuery({
    queryKey: ['news', symbol],
    queryFn: () => getNews(symbol),
    staleTime: 5 * 60 * 1000,
  })

  // reset tab to chart on symbol change
  useEffect(() => { setActiveTab('chart') }, [symbol])

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-dark-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-accent-blue" />
          <span className="font-bold text-white text-lg tracking-tight">TradeTrack-Ninja</span>
          <span className="text-xs text-slate-600 ml-1">LCL Bourse</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Yahoo Finance · RSS temps réel
          </div>
          <AuthButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar watchlist */}
        <aside className="w-64 shrink-0 border-r border-dark-700 overflow-y-auto p-3">
          <Watchlist
            selected={symbol}
            onSelect={setSymbol}
            items={watchlistItems}
            onAdd={addItem}
            onRemove={removeItem}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Quote header */}
          <QuoteHeader symbol={symbol} />

          {/* Period selector (only visible on chart tab) */}
          {activeTab === 'chart' && (
            <div className="flex gap-1">
              {['1mo','3mo','6mo','1y','2y','5y'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    period === p
                      ? 'bg-accent-blue text-white'
                      : 'bg-dark-800 text-slate-500 hover:text-white'
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Tab navigation */}
          <div className="flex gap-1 bg-dark-800 rounded-xl p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === id
                    ? 'bg-dark-600 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'chart' && (
            <StockChart candles={candles} indicators={indicators} symbol={symbol} />
          )}
          {activeTab === 'news' && (
            <NewsPanel symbol={symbol} />
          )}
          {activeTab === 'simulator' && (
            <OrderSimulator symbol={symbol} currentPrice={quote?.price} />
          )}
          {activeTab === 'ai' && (
            <AIPanel symbol={symbol} articles={articles} indicators={indicators} />
          )}
        </main>
      </div>

      <footer className="border-t border-dark-700 px-6 py-2 text-xs text-slate-700 flex justify-between">
        <span>⚠️ Application à usage informatif uniquement — pas un conseil en investissement.</span>
        <span>Frais simulés selon grille tarifaire LCL Bourse 2024</span>
      </footer>
    </div>
  )
}
