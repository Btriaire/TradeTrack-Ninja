import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, Newspaper, Calculator, Sparkles, Activity, Menu, X } from 'lucide-react'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
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

  // close sidebar on scroll/tap outside on mobile
  const handleSelectSymbol = (s: string) => {
    setSymbol(s)
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">

      {/* ── Top bar ────────────────────────────────────── */}
      <header className="border-b border-dark-700 px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        {/* Left: hamburger (mobile) + logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="md:hidden text-slate-400 hover:text-white transition-colors p-1"
            aria-label="Ouvrir la watchlist"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-accent-blue" />
            <span className="font-bold text-white text-base md:text-lg tracking-tight">TradeTrack-Ninja</span>
            <span className="hidden sm:inline text-xs text-slate-600 ml-1">LCL Bourse</span>
          </div>
        </div>

        {/* Right: status dot + auth */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Alpha Vantage · RSS
          </div>
          <AuthButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Mobile backdrop ───────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar / Watchlist drawer ────────────────── */}
        <aside className={`
          fixed md:relative inset-y-0 left-0 z-40
          w-72 md:w-64 shrink-0
          border-r border-dark-700
          bg-dark-900 overflow-y-auto p-3
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          {/* Close button (mobile only) */}
          <div className="flex items-center justify-between mb-2 md:hidden">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Watchlist</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-slate-500 hover:text-white transition-colors p-1"
            >
              <X size={16} />
            </button>
          </div>

          <Watchlist
            selected={symbol}
            onSelect={handleSelectSymbol}
            items={watchlistItems}
            onAdd={addItem}
            onRemove={removeItem}
          />
        </aside>

        {/* ── Main content ──────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 min-w-0">

          {/* Quote header */}
          <QuoteHeader symbol={symbol} />

          {/* Period selector — chart tab only */}
          {activeTab === 'chart' && (
            <div className="flex gap-1 flex-wrap">
              {['1mo','3mo','6mo','1y','2y','5y'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
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
                className={`flex-1 flex items-center justify-center gap-1 md:gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === id
                    ? 'bg-dark-600 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={13} />
                {/* Label: hidden on very small screens */}
                <span className="hidden sm:inline">{label}</span>
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

      {/* ── Footer ────────────────────────────────────── */}
      <footer className="border-t border-dark-700 px-4 md:px-6 py-2 text-xs text-slate-700 flex flex-col sm:flex-row sm:justify-between gap-1">
        <span>⚠️ Usage informatif — pas un conseil en investissement.</span>
        <span className="hidden sm:block">Frais simulés selon grille LCL Bourse 2024</span>
      </footer>
    </div>
  )
}
