import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart2, Newspaper, Calculator, Sparkles,
  Activity, Menu, X, Monitor, Smartphone, RotateCcw,
  Search, PieChart, Zap, Globe, TrendingUp, Rss, Stethoscope,
} from 'lucide-react'
import { Watchlist }      from './components/Watchlist'
import { StockChart }     from './components/StockChart'
import { QuoteHeader }    from './components/QuoteHeader'
import { NewsPanel }      from './components/NewsPanel'
import { OrderSimulator } from './components/OrderSimulator'
import { AIPanel }        from './components/AIPanel'
import { DiagnosticPanel } from './components/DiagnosticPanel'
import { AuthButton }     from './components/AuthButton'
import { IndicesBar }     from './components/IndicesBar'
import { GameOfDay }      from './components/GameOfDay'
import { SearchModal }    from './components/SearchModal'
import { Portfolio }      from './components/Portfolio'
import { DailySignals }   from './components/DailySignals'
import { Markets }        from './components/Markets'
import { FinancialNews }  from './components/FinancialNews'
import { useAuth }        from './hooks/useAuth'
import { useWatchlist }   from './hooks/useWatchlist'
import { usePortfolio }   from './hooks/usePortfolio'
import { useLayout }      from './hooks/useLayout'
import { getHistory, getIndicators, getQuote, getNews } from './services/api'

// ── Vues globales (pas liées à une valeur) ────────────────────────────────────
type GlobalView = 'stock' | 'markets' | 'signals' | 'news'

const GLOBAL_VIEWS: { id: GlobalView; label: string; short: string; icon: any; desc: string }[] = [
  { id: 'stock',   label: 'Analyse Valeur',   short: 'Valeur',  icon: TrendingUp, desc: 'Graphique, news, IA…' },
  { id: 'markets', label: 'Places de Marché', short: 'Marchés', icon: Globe,      desc: 'CAC40, DAX, NASDAQ…' },
  { id: 'signals', label: 'Signaux du Jour',  short: 'Signaux', icon: Zap,        desc: 'Great Catch / Stay Away' },
  { id: 'news',    label: 'Actualités',       short: 'News',    icon: Rss,        desc: '15 sources FR + Monde' },
]

// ── Lookup secteur/indice par symbole ─────────────────────────────────────────
const SYMBOL_META: Record<string, { sector: string; index: string; name: string }> = {
  'MC.PA':  { name: 'LVMH',          sector: 'Luxe & Mode',    index: 'CAC 40'  },
  'TTE.PA': { name: 'TotalEnergies', sector: 'Énergie',        index: 'CAC 40'  },
  'AI.PA':  { name: 'Air Liquide',   sector: 'Chimie',         index: 'CAC 40'  },
  'BNP.PA': { name: 'BNP Paribas',   sector: 'Finance',        index: 'CAC 40'  },
  'SAN.PA': { name: 'Sanofi',        sector: 'Santé',          index: 'CAC 40'  },
  'OR.PA':  { name: "L'Oréal",       sector: 'Consommation',   index: 'CAC 40'  },
  'CS.PA':  { name: 'AXA',           sector: 'Finance',        index: 'CAC 40'  },
  'DG.PA':  { name: 'Vinci',         sector: 'Infrastructures',index: 'CAC 40'  },
  'DSY.PA': { name: 'Dassault Sys.', sector: 'Technologie',    index: 'CAC 40'  },
  'CAP.PA': { name: 'Capgemini',     sector: 'Technologie',    index: 'CAC 40'  },
  'AAPL':   { name: 'Apple',         sector: 'Technologie',    index: 'NASDAQ'  },
  'MSFT':   { name: 'Microsoft',     sector: 'Technologie',    index: 'NASDAQ'  },
  'GOOGL':  { name: 'Alphabet',      sector: 'Technologie',    index: 'NASDAQ'  },
  'AMZN':   { name: 'Amazon',        sector: 'E-Commerce',     index: 'NASDAQ'  },
  'NVDA':   { name: 'Nvidia',        sector: 'Semi-conducteurs',index: 'NASDAQ' },
  'TSLA':   { name: 'Tesla',         sector: 'Automobile',     index: 'NASDAQ'  },
  'META':   { name: 'Meta',          sector: 'Technologie',    index: 'NASDAQ'  },
  'JPM':    { name: 'JPMorgan',      sector: 'Finance',        index: 'NYSE'    },
  'JNJ':    { name: 'Johnson & J.',  sector: 'Santé',          index: 'NYSE'    },
  'XOM':    { name: 'ExxonMobil',    sector: 'Énergie',        index: 'NYSE'    },
  'SAP':    { name: 'SAP',           sector: 'Technologie',    index: 'DAX'     },
  'SIE.DE': { name: 'Siemens',       sector: 'Industrie',      index: 'DAX'     },
}

// ── Onglets spécifiques à une valeur ─────────────────────────────────────────
type StockTab = 'chart' | 'news' | 'simulator' | 'ai' | 'diagnostic' | 'portfolio'

const STOCK_TABS: { id: StockTab; label: string; icon: any }[] = [
  { id: 'chart',      label: 'Graphique',   icon: BarChart2    },
  { id: 'news',       label: 'Actualités',  icon: Newspaper    },
  { id: 'simulator',  label: 'Simulateur',  icon: Calculator   },
  { id: 'ai',         label: 'Analyse IA',  icon: Sparkles     },
  { id: 'diagnostic', label: 'Diagnostic',  icon: Stethoscope  },
  { id: 'portfolio',  label: 'Portfolio',   icon: PieChart     },
]

export default function App() {
  const [symbol,      setSymbol]      = useState('MC.PA')
  const [period,      setPeriod]      = useState('6mo')
  const [activeTab,   setActiveTab]   = useState<StockTab>('chart')
  const [globalView,  setGlobalView]  = useState<GlobalView>('stock')
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

  // Raccourci ⌘K
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const handleSelectSymbol = (s: string) => {
    setSymbol(s)
    setGlobalView('stock')
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
      <header className={`border-b border-dark-700 flex items-center justify-between shrink-0 gap-2 ${isMobile ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {isMobile && (
            <button onClick={() => setSidebarOpen(o => !o)}
              className="text-slate-400 hover:text-white transition-colors p-1 shrink-0">
              <Menu size={18} />
            </button>
          )}
          <Activity size={16} className="text-accent-blue shrink-0" />
          <span className={`font-bold text-white tracking-tight truncate ${isMobile ? 'text-sm' : 'text-base'}`}>
            {isMobile ? 'TradeTrack' : 'TradeTrack-Ninja'}
          </span>
          {!isMobile && <span className="text-xs text-slate-600 ml-1 shrink-0">LCL Bourse</span>}
        </div>

        <div className={`flex items-center shrink-0 ${isMobile ? 'gap-1.5' : 'gap-2'}`}>
          <button
            onClick={() => setSearchOpen(true)}
            className={`flex items-center gap-2 text-xs text-slate-500 hover:text-white bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg transition-colors ${isMobile ? 'p-1.5' : 'px-3 py-1.5'}`}
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
          {!isMobile && <LayoutToggle />}
          <AuthButton />
        </div>
      </header>

      {/* ── Barre des indices ────────────────────────────────────────────── */}
      <IndicesBar />

      {/* ── Game of Today ───────────────────────────────────────────────── */}
      <GameOfDay onSelectSymbol={handleSelectSymbol} />

      {/* ── Navigation globale ──────────────────────────────────────────── */}
      <div className={`border-b border-dark-700 bg-dark-900 shrink-0 ${isMobile ? 'px-2 py-1.5' : 'px-4 py-2'}`}>
        <div className={`flex gap-1.5 ${isMobile ? '' : 'max-w-lg gap-2'}`}>
          {GLOBAL_VIEWS.map(({ id, label, short, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => setGlobalView(id)}
              className={`flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-all flex-1 ${
                isMobile ? 'px-2 py-2 flex-col gap-0.5' : 'px-3 py-2'
              } ${
                globalView === id
                  ? id === 'markets' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : id === 'signals' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : id === 'news'    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'text-slate-500 hover:text-white hover:bg-dark-800'
              }`}
            >
              <Icon size={isMobile ? 15 : 13} className="shrink-0" />
              {isMobile ? (
                <span className="text-[10px] leading-none font-medium">{short}</span>
              ) : (
                <div className="text-left min-w-0">
                  <div className="truncate">{label}</div>
                  {globalView !== id && (
                    <div className="text-slate-600 font-normal text-xs truncate">{desc}</div>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Backdrop sidebar mobile */}
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Sidebar (watchlist) — visible en mode stock ou toujours ─── */}
        <aside className={[
          'bg-dark-900 border-r border-dark-700 overflow-y-auto p-3 shrink-0',
          isMobile
            ? `fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
            : globalView !== 'stock' ? 'hidden' : 'relative w-64',
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

          {/* ── Vue ACTUALITÉS ──────────────────────────────────────── */}
          {globalView === 'news' && <FinancialNews />}

          {/* ── Vue MARCHÉS ─────────────────────────────────────────── */}
          {globalView === 'markets' && (
            <Markets onSelectSymbol={handleSelectSymbol} />
          )}

          {/* ── Vue SIGNAUX ─────────────────────────────────────────── */}
          {globalView === 'signals' && (
            <DailySignals
              onSelectSymbol={handleSelectSymbol}
              onAddWatchlist={addItem}
              onAddPortfolio={addPosition}
              watchlistSymbols={watchlistItems.map(i => i.symbol)}
            />
          )}

          {/* ── Vue VALEUR (stock-specific) ─────────────────────────── */}
          {globalView === 'stock' && (
            <>
              <QuoteHeader symbol={symbol} isMobile={isMobile} />

              {/* Période */}
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

              {/* Onglets valeur */}
              <div className={`flex gap-1 bg-dark-800 rounded-xl p-1 ${isMobile ? 'overflow-x-auto scrollbar-none' : ''}`}>
                {STOCK_TABS.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                      isMobile ? 'flex-none px-3.5' : 'flex-1'
                    } ${activeTab === id ? 'bg-dark-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                    <Icon size={12} />
                    {isMobile
                      ? <span className="text-[10px]">{label.split(' ')[0]}</span>
                      : <span>{label}</span>
                    }
                  </button>
                ))}
              </div>

              {activeTab === 'chart'      && <StockChart candles={candles} indicators={indicators} symbol={symbol} />}
              {activeTab === 'news'       && <NewsPanel symbol={symbol} />}
              {activeTab === 'simulator'  && <OrderSimulator symbol={symbol} currentPrice={quote?.price} />}
              {activeTab === 'ai'         && <AIPanel symbol={symbol} articles={articles} indicators={indicators} candles={candles} />}
              {activeTab === 'diagnostic' && (
                <DiagnosticPanel
                  symbol={symbol}
                  name={SYMBOL_META[symbol]?.name || symbol}
                  sector={SYMBOL_META[symbol]?.sector || ''}
                  index={SYMBOL_META[symbol]?.index || ''}
                  candles={candles}
                  indicators={indicators}
                  articles={articles}
                />
              )}
              {activeTab === 'portfolio' && (
                <Portfolio
                  positions={positions}
                  onRemove={removePosition}
                  onSelect={handleSelectSymbol}
                  onOpenSearch={() => setSearchOpen(true)}
                  user={user}
                />
              )}
            </>
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
