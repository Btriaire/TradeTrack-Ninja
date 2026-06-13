import { useState, useEffect, lazy, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart2, Newspaper, Calculator, Sparkles,
  Activity, Menu, X, Monitor, Smartphone, RotateCcw,
  Search, PieChart, Zap, Globe, TrendingUp, Rss, Stethoscope, Telescope, Building2, Crosshair,
} from 'lucide-react'

// ── Imports directs — composants utilisés immédiatement au chargement ──────────
import { Watchlist }     from './components/Watchlist'
import { StockChart }    from './components/StockChart'
import { QuoteHeader }   from './components/QuoteHeader'
import { AuthButton }    from './components/AuthButton'
import { IndicesBar }    from './components/IndicesBar'
import { SearchModal }   from './components/SearchModal'
import { Portfolio }            from './components/Portfolio'
import { StockPortfolioPanel }  from './components/StockPortfolioPanel'
import { WelcomePage }          from './components/WelcomePage'
import { TickerBanner }  from './components/TickerBanner'
import { Dashboard }     from './components/Dashboard'

// ── Imports lazy — chargés seulement quand la vue/onglet est ouvert(e) ─────────
// Réduit le bundle initial de ~1 MB → ~450 KB (chargement 2× plus rapide)
const NewsPanel       = lazy(() => import('./components/NewsPanel').then(m => ({ default: m.NewsPanel })))
const OrderSimulator  = lazy(() => import('./components/OrderSimulator').then(m => ({ default: m.OrderSimulator })))
const AIPanel         = lazy(() => import('./components/AIPanel').then(m => ({ default: m.AIPanel })))
const DiagnosticPanel = lazy(() => import('./components/DiagnosticPanel').then(m => ({ default: m.DiagnosticPanel })))
const CloturePanel    = lazy(() => import('./components/CloturePanel').then(m => ({ default: m.CloturePanel })))
const CompanyProfile  = lazy(() => import('./components/CompanyProfile').then(m => ({ default: m.CompanyProfile })))
const IntradayChart   = lazy(() => import('./components/IntradayChart').then(m => ({ default: m.IntradayChart })))
const MagnifyPanel    = lazy(() => import('./components/MagnifyPanel').then(m => ({ default: m.MagnifyPanel })))
const GameOfDay       = lazy(() => import('./components/GameOfDay').then(m => ({ default: m.GameOfDay })))
const TopSectors      = lazy(() => import('./components/TopSectors').then(m => ({ default: m.TopSectors })))
const GeoEvents       = lazy(() => import('./components/GeoEvents').then(m => ({ default: m.GeoEvents })))
const DailySignals    = lazy(() => import('./components/DailySignals').then(m => ({ default: m.DailySignals })))
const Markets         = lazy(() => import('./components/Markets').then(m => ({ default: m.Markets })))
const FinancialNews   = lazy(() => import('./components/FinancialNews').then(m => ({ default: m.FinancialNews })))
import { useAuth }        from './hooks/useAuth'
import { useWatchlist }   from './hooks/useWatchlist'
import { usePortfolio }   from './hooks/usePortfolio'
import { useLayout }      from './hooks/useLayout'
import { getHistory, getIndicators, getQuote, getNews, getIndices, getGeoEvents, getTopSectors, getGameOfDay, pingBackend } from './services/api'
import { Logo } from './components/Logo'

// ── Fallback Suspense — défini HORS du composant pour éviter le remount à chaque render
function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-16 gap-3">
      <div className="w-4 h-4 rounded-full bg-accent-blue/40 animate-pulse" style={{ animationDelay: '0ms' }}/>
      <div className="w-4 h-4 rounded-full bg-accent-blue/40 animate-pulse" style={{ animationDelay: '150ms' }}/>
      <div className="w-4 h-4 rounded-full bg-accent-blue/40 animate-pulse" style={{ animationDelay: '300ms' }}/>
    </div>
  )
}

// ── Vues globales (pas liées à une valeur) ────────────────────────────────────
type GlobalView = 'welcome' | 'dashboard' | 'stock' | 'markets' | 'signals' | 'news' | 'portfolio'

const GLOBAL_VIEWS: { id: GlobalView; label: string; short: string; icon: any; desc: string }[] = [
  { id: 'dashboard', label: 'Dashboard',        short: 'Home',      icon: Activity,   desc: 'Vue d\'ensemble' },
  { id: 'stock',     label: 'Analyse Valeur',   short: 'Valeur',    icon: TrendingUp, desc: 'Graphique, news, IA…' },
  { id: 'markets',   label: 'Places de Marché', short: 'Marchés',   icon: Globe,      desc: 'CAC40, DAX, NASDAQ…' },
  { id: 'signals',   label: 'Signaux du Jour',  short: 'Signaux',   icon: Zap,        desc: 'Great Catch / Stay Away' },
  { id: 'news',      label: 'Actualités',       short: 'News',      icon: Rss,        desc: '15 sources FR + Monde' },
  { id: 'portfolio', label: 'Mon Portfolio',    short: 'Portfolio', icon: PieChart,   desc: 'Positions & P&L' },
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
type StockTab = 'chart' | 'news' | 'simulator' | 'ai' | 'diagnostic' | 'cloture' | 'fiche' | 'portfolio' | 'magnify'

const STOCK_TABS: { id: StockTab; label: string; icon: any; highlight?: boolean }[] = [
  { id: 'chart',      label: 'Graphique',   icon: BarChart2    },
  { id: 'magnify',    label: 'Magnify',     icon: Crosshair,   highlight: true },
  { id: 'news',       label: 'Actualités',  icon: Newspaper    },
  { id: 'simulator',  label: 'Simulateur',  icon: Calculator   },
  { id: 'ai',         label: 'Analyse IA',  icon: Sparkles     },
  { id: 'diagnostic', label: 'Diagnostic',  icon: Stethoscope  },
  { id: 'cloture',    label: 'Clôture IA',  icon: Telescope    },
  { id: 'fiche',      label: 'Fiche',       icon: Building2    },
  { id: 'portfolio',  label: 'Portfolio',   icon: PieChart     },
]

export default function App() {
  const [symbol,       setSymbol]       = useState('MC.PA')
  const [period,       setPeriod]       = useState('6mo')
  const [activeTab,    setActiveTab]    = useState<StockTab>('chart')
  const [globalView,   setGlobalView]   = useState<GlobalView>('welcome')
  const [sidebarOpen,  setSidebarOpen]  = useState(false)
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [showIntraday, setShowIntraday] = useState(false)
  // Dernier symbole visité — persisté pour le bouton "Reprendre" de la WelcomePage
  const [lastSymbol,   setLastSymbol]   = useState<string | null>(() => {
    try { return localStorage.getItem('tt_last_symbol') } catch { return null }
  })

  const queryClient = useQueryClient()
  const { user }                                         = useAuth()
  const { items: watchlistItems, addItem, removeItem }   = useWatchlist(user)
  const { positions, addPosition, removePosition }       = usePortfolio(user)
  const { isMobile, mode, setLayout }                    = useLayout()

  const { data: quote } = useQuery({
    queryKey: ['quote', symbol],
    queryFn:  () => getQuote(symbol),
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
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
    refetchOnWindowFocus: false,
  })

  useEffect(() => { setActiveTab('chart'); setShowIntraday(false) }, [symbol])
  useEffect(() => { if (!isMobile) setSidebarOpen(false) }, [isMobile])

  // Keep-alive + prefetch données dashboard au démarrage
  useEffect(() => {
    // Réveille le backend Render si dormant
    pingBackend()
    // Prefetch les données lentes en arrière-plan
    queryClient.prefetchQuery({ queryKey: ['indices'],     queryFn: getIndices,    staleTime: 0 })
    queryClient.prefetchQuery({ queryKey: ['geo-events'],  queryFn: getGeoEvents,  staleTime: 4 * 60 * 60 * 1000 })
    queryClient.prefetchQuery({ queryKey: ['top-sectors'], queryFn: getTopSectors, staleTime: 30 * 60 * 1000 })
    queryClient.prefetchQuery({ queryKey: ['game'],        queryFn: getGameOfDay,  staleTime: 60 * 60 * 1000 })
  }, [])

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
    setLastSymbol(s)
    try { localStorage.setItem('tt_last_symbol', s) } catch {}
    setGlobalView('stock')
    setActiveTab('chart')
    setShowIntraday(false)
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
          <button onClick={() => setGlobalView('welcome')} className="flex items-center">
            <Logo size={isMobile ? 26 : 32} showText={!isMobile} />
          </button>
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

      {/* ── Navigation globale ──────────────────────────────────────────── */}
      <div className={`border-b border-dark-700 bg-dark-900 shrink-0 ${isMobile ? 'px-2 py-2' : 'px-4 py-3'}`}>
        <div className={`flex gap-1.5 ${isMobile ? 'overflow-x-auto scrollbar-none' : 'max-w-3xl gap-2'}`}>
          {GLOBAL_VIEWS.map(({ id, label, short, icon: Icon, desc }) => {
            const isActive = globalView === id
            const isPortfolio = id === 'portfolio'

            const activeClass = isActive
              ? id === 'markets'   ? 'bg-blue-500/20   text-blue-400   border border-blue-500/30'
              : id === 'signals'   ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              : id === 'news'      ? 'bg-cyan-500/20   text-cyan-400   border border-cyan-500/30'
              : id === 'portfolio' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/35'
              : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
              : isPortfolio
                ? 'text-emerald-600 hover:text-emerald-400 hover:bg-emerald-950/40 border border-emerald-900/50'
                : 'text-slate-400 hover:text-white hover:bg-dark-800'

            return (
              <button
                key={id}
                onClick={() => setGlobalView(id)}
                className={`relative flex items-center justify-center gap-2 rounded-xl text-base font-semibold transition-all shrink-0 ${
                  isMobile ? 'px-3 py-3 flex-col gap-1' : 'flex-1 px-4 py-3'
                } ${activeClass}`}
              >
                <Icon size={isMobile ? 20 : 18} className="shrink-0" />
                {isMobile ? (
                  <span className="text-[12px] leading-none font-semibold whitespace-nowrap">{short}</span>
                ) : (
                  <div className="text-left min-w-0">
                    <div className="truncate flex items-center gap-1.5">
                      {label}
                      {/* Badge nb positions */}
                      {isPortfolio && positions.length > 0 && (
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
                          isActive ? 'bg-emerald-400/20 text-emerald-300' : 'bg-emerald-900/50 text-emerald-600'
                        }`}>
                          {positions.length}
                        </span>
                      )}
                    </div>
                    {!isActive && (
                      <div className={`font-normal text-xs truncate ${isPortfolio ? 'text-emerald-900' : 'text-slate-600'}`}>
                        {desc}
                      </div>
                    )}
                  </div>
                )}
                {/* Dot portfolio actif */}
                {isPortfolio && positions.length > 0 && (
                  <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                    isActive ? 'bg-emerald-400' : 'bg-emerald-700'
                  }`}/>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Bandeau ticker LCD ──────────────────────────────────────────── */}
      <TickerBanner onSelectSymbol={handleSelectSymbol} />

      {/* ── Barre des indices ────────────────────────────────────────────── */}
      <IndicesBar />

      {/* ── Banners contextuels ─────────────────────────────────────────
           • welcome  : tout afficher (vue de synthèse)
           • stock    : GameOfDay (inspiration valeurs)
           • markets  : TopSectors (contexte sectoriel)
           • dashboard : déjà intégré dans le Dashboard
           • signals/news/portfolio : pas de banners (contenu dédié) ── */}
      {globalView === 'welcome' && (
        <Suspense fallback={null}>
          <GameOfDay onSelectSymbol={handleSelectSymbol} />
          <TopSectors onSelectSymbol={handleSelectSymbol} />
          <GeoEvents />
        </Suspense>
      )}
      {globalView === 'stock' && (
        <Suspense fallback={null}>
          <GameOfDay onSelectSymbol={handleSelectSymbol} />
        </Suspense>
      )}
      {globalView === 'markets' && (
        <Suspense fallback={null}>
          <TopSectors onSelectSymbol={handleSelectSymbol} />
        </Suspense>
      )}

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
            positions={positions}
          />
        </aside>

        {/* ── Contenu principal ────────────────────────────────────────── */}
        <main className={`flex-1 overflow-y-auto space-y-3 min-w-0 ${isMobile ? 'p-3' : 'p-4'}`}>
          <Suspense fallback={<LazyFallback />}>

          {/* ── Vue WELCOME ─────────────────────────────────────────── */}
          {globalView === 'welcome' && (
            <WelcomePage
              positions={positions}
              lastSymbol={lastSymbol}
              onNavigate={v => setGlobalView(v as GlobalView)}
              onOpenSearch={() => setSearchOpen(true)}
              onSelectSymbol={handleSelectSymbol}
            />
          )}

          {/* ── Vue DASHBOARD ───────────────────────────────────────── */}
          {globalView === 'dashboard' && (
            <Dashboard
              onSelectSymbol={handleSelectSymbol}
              positions={positions}
            />
          )}

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

          {/* ── Vue PORTFOLIO ───────────────────────────────────────── */}
          {globalView === 'portfolio' && (
            <>
              <Portfolio
                positions={positions}
                onRemove={removePosition}
                onSelect={handleSelectSymbol}
                onOpenSearch={() => setSearchOpen(true)}
                user={user}
              />
              <Suspense fallback={<LazyFallback />}>
                <OrderSimulator symbol="" currentPrice={undefined} />
              </Suspense>
            </>
          )}

          {/* ── Vue VALEUR (stock-specific) ─────────────────────────── */}
          {globalView === 'stock' && (
            <>
              <QuoteHeader symbol={symbol} isMobile={isMobile} positions={positions} />

              {/* Période + bouton Intraday */}
              {activeTab === 'chart' && (
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => setShowIntraday(v => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                      showIntraday
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                        : 'bg-dark-800 text-slate-500 hover:text-cyan-400 border-transparent'
                    }`}
                  >
                    <Activity size={11} />
                    Intraday
                  </button>
                  <div className="h-4 w-px bg-dark-600 mx-0.5" />
                  {['1mo','3mo','6mo','1y','2y','5y'].map(p => (
                    <button key={p}
                      onClick={() => { setPeriod(p); setShowIntraday(false) }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        !showIntraday && period === p
                          ? 'bg-accent-blue text-white'
                          : 'bg-dark-800 text-slate-500 hover:text-white'
                      }`}>
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}

              {/* Onglets valeur */}
              <div className={`flex gap-1 bg-dark-800 rounded-xl p-1 ${isMobile ? 'overflow-x-auto scrollbar-none' : ''}`}>
                {STOCK_TABS.map(({ id, label, icon: Icon, highlight }) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                      isMobile ? 'flex-none px-3.5' : 'flex-1'
                    } ${
                      activeTab === id
                        ? highlight
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : 'bg-dark-600 text-white'
                        : highlight
                          ? 'text-cyan-600 hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent'
                          : 'text-slate-500 hover:text-slate-300'
                    }`}>
                    <Icon size={12} />
                    {isMobile
                      ? <span className="text-[10px]">{label.split(' ')[0]}</span>
                      : <span>{label}</span>
                    }
                  </button>
                ))}
              </div>

              {activeTab === 'magnify'    && <MagnifyPanel symbol={symbol} />}
              {activeTab === 'chart' && showIntraday && <IntradayChart symbol={symbol} />}
              {activeTab === 'chart' && !showIntraday && <StockChart candles={candles} indicators={indicators} symbol={symbol} />}
              {activeTab === 'news'       && <NewsPanel symbol={symbol} />}
              {activeTab === 'simulator'  && <OrderSimulator symbol={symbol} currentPrice={quote?.price} />}
              {activeTab === 'ai'         && <AIPanel symbol={symbol} articles={articles} indicators={indicators} candles={candles} />}
              {activeTab === 'diagnostic' && (
                <DiagnosticPanel
                  symbol={symbol}
                  name={SYMBOL_META[symbol]?.name
                    || watchlistItems.find(i => i.symbol === symbol)?.name
                    || positions.find(p => p.symbol === symbol)?.name
                    || symbol}
                  sector={SYMBOL_META[symbol]?.sector || ''}
                  index={SYMBOL_META[symbol]?.index || ''}
                  candles={candles}
                  indicators={indicators}
                  articles={articles}
                />
              )}
              {activeTab === 'fiche' && (
                <CompanyProfile symbol={symbol} />
              )}
              {activeTab === 'cloture' && (
                <CloturePanel
                  symbol={symbol}
                  name={SYMBOL_META[symbol]?.name
                    || watchlistItems.find(i => i.symbol === symbol)?.name
                    || positions.find(p => p.symbol === symbol)?.name
                    || symbol}
                  sector={SYMBOL_META[symbol]?.sector || ''}
                  index={SYMBOL_META[symbol]?.index || ''}
                  candles={candles}
                  indicators={indicators || {}}
                  articles={articles}
                />
              )}
              {activeTab === 'portfolio' && (
                <StockPortfolioPanel
                  symbol={symbol}
                  positions={positions}
                  onRemove={removePosition}
                  onAdd={addPosition}
                  user={user}
                />
              )}
            </>
          )}

          </Suspense>
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
