import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart2, Newspaper, Calculator, Sparkles,
  Activity, Menu, X, Monitor, Smartphone, RotateCcw,
  Search, PieChart,
} from 'lucide-react'
import { Watchlist }       from './components/Watchlist'
import { StockChart }      from './components/StockChart'
import { QuoteHeader }     from './components/QuoteHeader'
import { NewsPanel }       from './components/NewsPanel'
import { OrderSimulator }  from './components/OrderSimulator'
import { AIPanel }         from './components/AIPanel'
import { AuthButton }      from './components/AuthButton'
import { IndicesBar }      from './components/IndicesBar'
import { SearchModal }     from './components/SearchModal'
import { Portfolio }       from './components/Portfolio'
import { useAuth }         from './hooks/useAuth'
import { useWatchlist }    from './hooks/useWatchlist'
import { usePortfolio }    from './hooks/usePortfolio'
import { useLayout }       from './hooks/useLayout'
import { getHistory, getIndicators, getQuote, getNews } from './services/api'

type Tab = 'chart' | 'news' | 'simulator' | 'ai' | 'portfolio'

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'chart',     label: 'Graphique',  icon: BarChart2  },
  { id: 'news',      label: 'Actualités', icon: Newspaper  },
  { id: 'simulator', label: 'Simulateur', icon: Calculator },
  { id: 'ai',        label: 'Analyse IA', icon: Sparkles   },
  { id: 'portfolio', label: 'Portfolio',  icon: PieChart   },
]

export default function App() {
  const [symbol,      setSymbol]      = useState('MC.PA')
  const [period,      setPeriod]      = useState('6mo')
  const [activeTab,   setActiveTab]   = useState<Tab>('chart')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen,  setSearchOpen]  = useState(false)

  const { user }                                         = useAuth()
  const { items: watchlistItems, addItem, removeItem }   = useWatchlist(user)
  const { positions, addPosition, removePosition }       = usePortfolio(user)
  const { isMobile, mode, setLayout }                    = useLayout()

  const { data: quote } = useQuery({
    queryKey: ['quote', symbol],
    queryFn:  () => getQuote(symbol),
    refetchInterval: 30000,
  })
  const { data: candles = [] } = useQuery({
    queryKey: ['history', symbol, period],
    queryFn:  () => getHistory(symbol, period),
  })
  const { data: indicators } = useQuery({
    queryKey: ['indicators', symbol],
    queryFn:  () => getIndicators(symbol),
    refetchInterval: 60000,
  })
  const { data: articles = [] } = useQuery({
    queryKey: ['news', symbol],
    queryFn:  () => getNews(symbol),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => { setActiveTab('chart') }, [symbol])
  useEffect(() => { if (!isMobile) setSidebarOpen(false) }, [isMobile])

  // Raccourci clavier Cmd/Ctrl+K → ouvrir recherche
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const handleSelectSymbol = (s: string) => {
    setSymbol(s)
    setActiveTab('chart')
    if (isMobile) setSidebarOpen(false)
  }

  function LayoutToggle() {
    return (
      <div className="flex items-center gap-0.5 bg-dark-800 rounded-lg p-0.5">
        <button title="Mobile"  onClick={() => setLayout('mobile')}
          className={`p-1.5 rounded-md transition-colors ${mode==='mobile'  ?'bg-accent-blue text-white':'text-slate-500 hover:text-white'}`}>
          <Smartphone size={12} />
        </button>
        <button title="Auto"    onClick={() => setLayout('auto')}
          className={`p-1.5 rounded-md transition-colors ${mode==='auto'    ?'bg-dark-600 text-white'  :'text-slate-500 hover:text-white'}`}>
          <RotateCcw  size={12} />
        </button>
        <button title="Bureau"  onClick={() => setLayout('desktop')}
          className={`p-1.5 rounded-md transition-colors ${mode==='desktop' ?'bg-accent-blue text-white':'text-slate-500 hover:text-white'}`}>
          <Monitor    size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="border-b border-dark-700 px-4 py-3 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isMobile && (
            <button onClick={() => setSidebarOpen(o => !o)}
              className="text-slate-400 hover:text-white transition-colors p-1 shrink-0">
              <Menu size={20} />
            </button>
          )}
          <Activity size={18} className="text-accent-blue shrink-0" />
          <span className="font-bold text-white text-base tracking-tight truncate">TradeTrack-Ninja</span>
          {!isMobile && <span className="text-xs text-slate-600 ml-1 shrink-0">LCL Bourse</span>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Bouton recherche */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-600 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Search size={13} />
            {!isMobile && <span>Rechercher</span>}
            {!isMobile && <span className="text-slate-700 text-xs">⌘K</span>}
          </button>

          {!isMobile && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </div>
          )}
          <LayoutToggle />
          <AuthButton />
        </div>
      </header>

      {/* ── Barre des indices ────────────────────────────────────────────── */}
      <IndicesBar />

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Backdrop sidebar mobile */}
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className={[
          'bg-dark-900 border-r border-dark-700 overflow-y-auto p-3 shrink-0',
          isMobile
            ? `fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : 'relative w-64',
        ].join(' ')}>
          {isMobile && (
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Watchlist</span>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <X size={15} />
              </button>
            </div>
          )}
          <Watchlist
            selected={symbol}
            onSelect={handleSelectSymbol}
            items={watchlistItems}
            onAdd={addItem}
            onRemove={removeItem}
          />
        </aside>

        {/* ── Contenu principal ────────────────────────────────────────── */}
        <main className={`flex-1 overflow-y-auto space-y-3 min-w-0 ${isMobile ? 'p-3' : 'p-4'}`}>

          <QuoteHeader symbol={symbol} isMobile={isMobile} />

          {/* Période (onglet chart uniquement) */}
          {activeTab === 'chart' && (
            <div className="flex gap-1 flex-wrap">
              {['1mo','3mo','6mo','1y','2y','5y'].map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    period === p ? 'bg-accent-blue text-white' : 'bg-dark-800 text-slate-500 hover:text-white'
                  }`}>
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Onglets */}
          <div className="flex gap-1 bg-dark-800 rounded-xl p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === id ? 'bg-dark-600 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}>
                <Icon size={12} />
                {!isMobile && <span>{label}</span>}
              </button>
            ))}
          </div>

          {/* Contenu */}
          {activeTab === 'chart'     && <StockChart candles={candles} indicators={indicators} symbol={symbol} />}
          {activeTab === 'news'      && <NewsPanel symbol={symbol} />}
          {activeTab === 'simulator' && <OrderSimulator symbol={symbol} currentPrice={quote?.price} />}
          {activeTab === 'ai'        && <AIPanel symbol={symbol} articles={articles} indicators={indicators} candles={candles} />}
          {activeTab === 'portfolio' && (
            <Portfolio
              positions={positions}
              onRemove={removePosition}
              onSelect={handleSelectSymbol}
              onOpenSearch={() => setSearchOpen(true)}
              user={user}
            />
          )}
        </main>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className={`border-t border-dark-700 px-4 py-2 text-xs text-slate-700 ${isMobile ? 'text-center' : 'flex justify-between'}`}>
        <span>⚠️ Usage informatif — pas un conseil en investissement.</span>
        {!isMobile && <span>Frais simulés selon grille LCL Bourse 2024</span>}
      </footer>

      {/* ── Modal de recherche ──────────────────────────────────────────── */}
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onSelectSymbol={handleSelectSymbol}
          onAddToWatchlist={addItem}
          onAddToPortfolio={addPosition}
          watchlistSymbols={watchlistItems.map(i => i.symbol)}
        />
      )}
    </div>
  )
}
