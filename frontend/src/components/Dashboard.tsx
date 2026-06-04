import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useId, Component, type ReactNode, type ErrorInfo } from 'react'
import {
  TrendingUp, TrendingDown, Zap, Globe, Activity,
  Newspaper, BarChart2, RefreshCw, ArrowUpRight,
  ArrowRight, Shield, Radio, AlertTriangle,
} from 'lucide-react'
import { getIndices, getGeoEvents, getTopSectors, getGameOfDay, getGeneralNews } from '../services/api'
import { Logo } from './Logo'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Index  { name: string; symbol: string; price: number; change_pct: number; change: number }
interface GeoEv  { title: string; impact: 'HIGH'|'MEDIUM'|'LOW'; signal?: string; brief?: string }
interface Sector { sector: string; avg_perf_5j: number; avg_score: number; top_stocks?: any[] }
interface Pick   { symbol: string; name: string; score: number; potential_pct: number; reason?: string; price?: number; change_pct?: number }

// ── Null-safe helpers ─────────────────────────────────────────────────────────
function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? v : []
}
function fmt(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(dec)
}
function sign(v: number): string { return v >= 0 ? '+' : '' }
function n(v: unknown): number {
  const f = parseFloat(String(v))
  return isFinite(f) ? f : 0
}

// ── Clock ─────────────────────────────────────────────────────────────────────
function useTime() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

// ── Error Boundary ─────────────────────────────────────────────────────────────
class DashboardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Dashboard] render error:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
          <AlertTriangle size={32} className="text-red-400 opacity-60"/>
          <div>
            <p className="text-sm font-mono text-slate-400">Erreur d'affichage du dashboard</p>
            <p className="text-xs font-mono text-slate-700 mt-1">{this.state.error.message}</p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs font-mono text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            Réessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Sparkline (IDs uniques via index prop) ─────────────────────────────────────
function MiniSpark({ pct, uid }: { pct: number; uid: string }) {
  const pts = pct >= 0
    ? '0,16 8,14 16,11 24,8 32,6 40,4'
    : '0,4 8,6 16,8 24,11 32,14 40,16'
  const c      = pct >= 0 ? '#10b981' : '#ef4444'
  const gradId = `ms-${uid}`
  return (
    <svg width="40" height="20" viewBox="0 0 40 20" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={c} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={c} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <polygon  points={`0,20 ${pts} 40,20`} fill={`url(#${gradId})`}/>
    </svg>
  )
}

// ── Circuit background (ID unique via useId) ────────────────────────────────────
function CircuitBg() {
  const uid = useId().replace(/:/g, '')
  const patId = `circuit-${uid}`
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.035] pointer-events-none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <pattern id={patId} x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
          <circle cx="4"  cy="4"  r="1.5" fill="#DC2626"/>
          <circle cx="30" cy="30" r="1.5" fill="#DC2626"/>
          <circle cx="56" cy="4"  r="1.5" fill="#DC2626"/>
          <circle cx="4"  cy="56" r="1.5" fill="#DC2626"/>
          <line x1="4"  y1="4"  x2="30" y2="4"  stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="30" y1="4"  x2="30" y2="30" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="56" y1="4"  x2="56" y2="30" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="30" y1="30" x2="56" y2="30" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="4"  y1="4"  x2="4"  y2="56" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="4"  y1="56" x2="30" y2="56" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="30" y1="30" x2="30" y2="56" stroke="#DC2626" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patId})`}/>
    </svg>
  )
}

// ── Glass card ─────────────────────────────────────────────────────────────────
function GlassCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative bg-dark-800/70 backdrop-blur-md border border-white/[0.06] rounded-2xl overflow-hidden ${className}`}>
      <CircuitBg />
      <div className="relative">{children}</div>
    </div>
  )
}

function CardHeader({ icon: Icon, label, accent = false, extra }: {
  icon: any; label: string; accent?: boolean; extra?: ReactNode
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 border-b border-white/[0.05] ${accent ? 'bg-red-950/20' : ''}`}>
      <div className="flex items-center gap-2">
        <Icon size={12} className={accent ? 'text-red-400' : 'text-slate-500'} />
        <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${accent ? 'text-red-300' : 'text-slate-500'}`}>
          {label}
        </span>
      </div>
      {extra}
    </div>
  )
}

// ── Index card ─────────────────────────────────────────────────────────────────
function IndexCard({ idx }: { idx: Index }) {
  const up    = (idx.change_pct ?? 0) >= 0
  const price = n(idx.price)
  const pct   = n(idx.change_pct)
  const chg   = n(idx.change)
  return (
    <div className={`relative flex flex-col gap-2 px-4 py-3 rounded-xl border backdrop-blur-sm
      transition-all duration-200 hover:scale-[1.02] hover:shadow-lg overflow-hidden
      ${up
        ? 'bg-emerald-950/30 border-emerald-500/20 hover:border-emerald-500/40'
        : 'bg-red-950/30    border-red-500/20    hover:border-red-500/40'
      }`}
    >
      <div className={`absolute inset-0 opacity-5 ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
           style={{ filter: 'blur(20px)', transform: 'translateY(50%)' }}/>
      <div className="flex items-center justify-between relative">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest truncate pr-2">{idx.name}</span>
        <MiniSpark pct={pct} uid={idx.symbol ?? String(Math.random())} />
      </div>
      <div className="relative">
        <div className="text-lg font-mono font-bold text-white tabular-nums leading-none">
          {price > 0 ? price.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : '—'}
        </div>
        <div className={`flex items-center gap-1 mt-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
          <span className="text-xs font-mono font-bold tabular-nums">
            {sign(pct)}{fmt(pct)}%
          </span>
          <span className="text-xs font-mono text-slate-600 ml-1">
            {sign(chg)}{fmt(chg, 0)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Geo event row ──────────────────────────────────────────────────────────────
function GeoRow({ ev }: { ev: GeoEv }) {
  const imp   = ev.impact ?? 'LOW'
  const style = imp === 'HIGH'
    ? { dot: 'bg-red-500 animate-pulse', text: 'text-red-400',   border: 'border-red-500/20',   bg: 'bg-red-950/20'   }
    : imp === 'MEDIUM'
    ? { dot: 'bg-amber-500',             text: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-950/10' }
    : { dot: 'bg-slate-600',             text: 'text-slate-500', border: 'border-slate-700/40', bg: 'bg-dark-700/30'  }
  return (
    <div className={`flex gap-2.5 px-3 py-2.5 rounded-lg border ${style.border} ${style.bg}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${style.dot} mt-1.5 shrink-0`}/>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-mono text-slate-300 leading-snug line-clamp-2">{ev.title ?? '—'}</p>
        {ev.brief && <p className="text-[10px] font-mono text-slate-600 mt-0.5 line-clamp-1">{ev.brief}</p>}
      </div>
      {ev.signal && (
        <span className={`shrink-0 text-[9px] font-mono font-bold uppercase mt-0.5 ${style.text}`}>
          {ev.signal}
        </span>
      )}
    </div>
  )
}

// ── Pick card ──────────────────────────────────────────────────────────────────
const RANK_COLORS = ['#DC2626', '#B91C1C', '#991B1B']

function PickCard({ pick, rank, onClick }: { pick: Pick; rank: number; onClick: () => void }) {
  const up  = (pick.change_pct ?? 0) >= 0
  const col = RANK_COLORS[rank - 1] ?? '#6b7280'
  return (
    <div onClick={onClick}
      className="relative flex items-center gap-3 px-3 py-3 rounded-xl border border-white/5
        bg-dark-700/60 cursor-pointer hover:border-red-500/25 hover:bg-dark-600/60
        transition-all group overflow-hidden"
    >
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl" style={{ background: col }}/>
      <div className="text-lg font-mono font-black tabular-nums shrink-0" style={{ color: col, opacity: 0.85 }}>
        {String(rank).padStart(2, '0')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-mono font-bold text-white group-hover:text-red-300 transition-colors">
            {(pick.symbol ?? '').replace(/\.[A-Z]+$/, '')}
          </span>
          {pick.change_pct != null && (
            <span className={`text-xs font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
              {sign(pick.change_pct)}{fmt(pick.change_pct)}%
            </span>
          )}
        </div>
        <p className="text-[10px] font-mono text-slate-600 truncate">{pick.name ?? ''}</p>
      </div>
      {pick.potential_pct != null && (
        <div className="shrink-0 text-right">
          <div className="text-sm font-mono font-bold text-emerald-400">
            +{fmt(pick.potential_pct)}%
          </div>
          <div className="text-[9px] font-mono text-slate-700">potentiel</div>
        </div>
      )}
    </div>
  )
}

// ── Sector row ─────────────────────────────────────────────────────────────────
function SectorRow({ sec }: { sec: Sector }) {
  const perf = n(sec.avg_perf_5j)
  const up   = perf >= 0
  const w    = Math.min(Math.abs(perf) * 8, 100)
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className="w-24 shrink-0">
        <span className="text-[10px] font-mono text-slate-400 truncate block">{sec.sector ?? '—'}</span>
      </div>
      <div className="flex-1 h-1.5 bg-dark-600 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${up ? 'bg-emerald-500' : 'bg-red-500'}`}
          style={{ width: `${w}%`, opacity: 0.7 }}
        />
      </div>
      <div className={`text-xs font-mono font-bold tabular-nums w-14 text-right ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {sign(perf)}{fmt(perf)}%
      </div>
    </div>
  )
}

// ── News row ───────────────────────────────────────────────────────────────────
function NewsRow({ article }: { article: any }) {
  const url = article?.url || article?.link
  const handleClick = () => { if (url) window.open(url, '_blank', 'noopener') }
  return (
    <div onClick={handleClick}
      className={`flex gap-3 px-3 py-2.5 ${url ? 'cursor-pointer' : ''} hover:bg-dark-700/50 transition-colors group`}
    >
      <div className="w-1 shrink-0 bg-dark-600 rounded-full mt-1"/>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-mono text-slate-300 line-clamp-2 group-hover:text-white transition-colors leading-relaxed">
          {article?.title ?? '—'}
        </p>
        <span className="text-[9px] font-mono text-slate-700 mt-0.5 block">{article?.source ?? ''}</span>
      </div>
      <ArrowRight size={10} className="text-slate-700 group-hover:text-slate-500 transition-colors shrink-0 mt-1"/>
    </div>
  )
}

// ── Inner dashboard (wrapped by error boundary) ────────────────────────────────
function DashboardInner({
  onSelectSymbol,
  positions = [],
}: {
  onSelectSymbol: (s: string) => void
  positions?: any[]
}) {
  const now   = useTime()
  const day   = now.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const clock = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: indicesRaw, isLoading: idxLoading } = useQuery({
    queryKey:        ['indices'],
    queryFn:         getIndices,
    refetchInterval: 30_000,
    staleTime:       0,
    retry:           1,
  })
  const { data: geoRaw }     = useQuery({ queryKey: ['geo-events'],   queryFn: getGeoEvents,   staleTime: 4 * 60 * 60 * 1000, retry: 1 })
  const { data: sectorsRaw } = useQuery({ queryKey: ['top-sectors'],  queryFn: getTopSectors,  staleTime: 30 * 60 * 1000,     retry: 1 })
  const { data: gameRaw }    = useQuery({ queryKey: ['game'],         queryFn: getGameOfDay,   staleTime: 60 * 60 * 1000,     retry: 1 })
  const { data: newsRaw }    = useQuery({
    queryKey:              ['news-general'],
    queryFn:               () => getGeneralNews(),
    staleTime:             10 * 60 * 1000,
    refetchOnWindowFocus:  false,   // évite les refetch intempestifs
    retry:                 1,
  })

  // ── Data — null-safe extraction ──────────────────────────────────────────────
  const indices  = safeArr<Index>(indicesRaw)
  const events   = safeArr<GeoEv>(geoRaw?.events)
  const sectors  = safeArr<Sector>(sectorsRaw)
  const picks    = safeArr<Pick>(gameRaw?.picks)
  const articles = safeArr<any>(newsRaw).slice(0, 8)

  // ── Aggregates ───────────────────────────────────────────────────────────────
  const posIdx      = indices.filter(i => n(i.change_pct) > 0).length
  const negIdx      = indices.filter(i => n(i.change_pct) < 0).length
  const moodUp      = posIdx >= negIdx
  const highImpact  = events.filter(e => e.impact === 'HIGH').length

  // Portfolio P&L (defensive)
  const safePos       = safeArr<any>(positions)
  const portfolioVal  = safePos.reduce((s, p) => s + n(p.current_price ?? p.buy_price) * n(p.quantity), 0)
  const portfolioCost = safePos.reduce((s, p) => s + n(p.buy_price) * n(p.quantity), 0)
  const pnl           = portfolioVal - portfolioCost
  const pnlPct        = portfolioCost > 0 ? (pnl / portfolioCost) * 100 : 0

  return (
    <div className="space-y-4 pb-6">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl overflow-hidden border border-white/[0.07]"
        style={{ background: 'linear-gradient(135deg,#0a0000 0%,#0e0202 45%,#0a0a0a 100%)' }}
      >
        <CircuitBg />
        {/* Glow rouge coin haut-droit */}
        <div className="absolute top-0 right-0 w-80 h-44 opacity-[0.12] pointer-events-none"
             style={{ background: 'radial-gradient(ellipse at 80% 15%, #DC2626 0%, transparent 65%)' }}/>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-800/30 to-transparent"/>

        <div className="relative px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Logo + horloge */}
          <div className="flex items-center gap-4">
            <Logo size={48} />
            <div>
              <div className="text-[10px] font-mono text-slate-600 capitalize">{day}</div>
              <div className="text-xl font-mono font-bold text-white tabular-nums tracking-wider">{clock}</div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  moodUp
                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40'
                    : 'text-red-400    border-red-500/30    bg-red-950/40'
                }`}>
                  {moodUp ? '▲' : '▼'} Marché {moodUp ? 'Haussier' : 'Baissier'}
                </span>
                {highImpact > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border text-amber-400 border-amber-500/30 bg-amber-950/30 animate-pulse">
                    ⚡ {highImpact} alerte{highImpact > 1 ? 's' : ''} haute{highImpact > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* KPI pills */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Indices',       val: `${posIdx}↑ ${negIdx}↓`,   col: moodUp ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Picks du jour', val: `${picks.length} signaux`, col: 'text-yellow-400' },
              { label: 'Secteurs ↑',    val: `${sectors.filter(s => n(s.avg_perf_5j) > 0).length}`, col: 'text-cyan-400' },
              ...(safePos.length > 0 ? [{
                label: 'Portfolio P&L',
                val:   `${pnlPct >= 0 ? '+' : ''}${fmt(pnlPct)}%`,
                col:   pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400',
              }] : []),
            ].map(({ label, val, col }) => (
              <div key={label} className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center min-w-[76px]">
                <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest mb-0.5">{label}</div>
                <div className={`text-sm font-mono font-bold ${col}`}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Indices grid ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Radio size={9} className="text-slate-700"/>
          <span className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">Indices mondiaux</span>
          {idxLoading && <RefreshCw size={9} className="text-slate-700 animate-spin ml-1"/>}
        </div>
        {idxLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-dark-800/70 rounded-xl animate-pulse border border-white/5"/>
            ))}
          </div>
        ) : indices.length === 0 ? (
          <div className="text-center text-xs font-mono text-slate-700 py-6">Chargement des indices…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {indices.map(idx => <IndexCard key={idx.symbol ?? idx.name} idx={idx}/>)}
          </div>
        )}
      </div>

      {/* ── Grille 3 colonnes ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Game of Day */}
        <GlassCard>
          <CardHeader icon={Zap} label="Game of Day — Top Picks" accent extra={
            <span className="text-[9px] font-mono text-red-500/50">·  IA picks</span>
          }/>
          <div className="p-3 space-y-2">
            {picks.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <RefreshCw size={14} className="text-slate-700 mx-auto animate-spin"/>
                <p className="text-xs font-mono text-slate-700">Calcul des picks en cours…</p>
              </div>
            ) : picks.slice(0, 3).map((pick, i) => (
              <PickCard key={pick.symbol ?? i} pick={pick} rank={i + 1}
                onClick={() => onSelectSymbol(pick.symbol)} />
            ))}
            {gameRaw?.brief && (
              <div className="mt-2 pt-2.5 border-t border-white/[0.04] px-1">
                <p className="text-[10px] font-mono text-slate-600 italic leading-relaxed line-clamp-3">
                  "{gameRaw.brief}"
                </p>
              </div>
            )}
          </div>
          <div className="px-4 py-2.5 border-t border-white/[0.04] flex justify-end">
            <button onClick={() => onSelectSymbol(picks[0]?.symbol ?? '')}
              className="flex items-center gap-1 text-[10px] font-mono text-red-400/50 hover:text-red-400 transition-colors">
              Analyser le top pick <ArrowUpRight size={9}/>
            </button>
          </div>
        </GlassCard>

        {/* Géopolitique */}
        <GlassCard>
          <CardHeader icon={Shield} label="Géopolitique & Marchés" extra={
            highImpact > 0 && (
              <span className="text-[9px] font-mono text-red-400 animate-pulse">
                ⚡ {highImpact} HIGH
              </span>
            )
          }/>
          <div className="p-3 space-y-2">
            {events.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-slate-700">
                Analyse géopolitique en cours…
              </div>
            ) : events.slice(0, 4).map((ev, i) => <GeoRow key={i} ev={ev}/>)}
          </div>
          {geoRaw?.synthesis && (
            <div className="px-4 pb-3 pt-2 border-t border-white/[0.04]">
              <p className="text-[10px] font-mono text-slate-600 italic leading-relaxed line-clamp-3">
                {geoRaw.synthesis}
              </p>
            </div>
          )}
        </GlassCard>

        {/* Top Secteurs */}
        <GlassCard>
          <CardHeader icon={BarChart2} label="Top Secteurs — 5 jours"/>
          <div className="px-4 py-3">
            {sectors.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-slate-700">Chargement secteurs…</div>
            ) : (
              <>
                {sectors.slice(0, 6).map(s => <SectorRow key={s.sector} sec={s}/>)}
                {/* Valeurs en vedette */}
                <div className="mt-3 pt-3 border-t border-white/[0.04]">
                  <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest mb-2">Valeurs en vedette</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sectors.slice(0, 3)
                      .flatMap(s => safeArr<string>(s.top_stocks).slice(0, 2))
                      .map((sym, i) => (
                        <button key={`${sym}-${i}`} onClick={() => onSelectSymbol(String(sym))}
                          className="text-[10px] font-mono px-2 py-1 rounded-lg bg-dark-600/80 text-slate-400
                            hover:text-white hover:bg-dark-500 border border-white/[0.05] transition-colors tabular-nums">
                          {String(sym).replace(/\.[A-Z]+$/, '')}
                        </button>
                      ))
                    }
                  </div>
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ── Actualités + Accès rapide ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Actualités — 2/3 */}
        <GlassCard className="lg:col-span-2">
          <CardHeader icon={Newspaper} label="Actualités Récentes" extra={
            <span className="text-[9px] font-mono text-slate-700">FR + Monde</span>
          }/>
          <div className="divide-y divide-white/[0.03]">
            {articles.length === 0 ? (
              <div className="py-10 text-center text-xs font-mono text-slate-700">Chargement actualités…</div>
            ) : articles.map((a, i) => <NewsRow key={i} article={a}/>)}
          </div>
        </GlassCard>

        {/* Accès rapide — 1/3 */}
        <GlassCard>
          <CardHeader icon={Activity} label="Accès Rapide"/>
          <div className="p-3 space-y-2">
            {/* Portfolio */}
            {safePos.length > 0 ? (
              <div className={`px-3 py-3 rounded-xl border ${
                pnlPct >= 0
                  ? 'bg-emerald-950/30 border-emerald-500/20'
                  : 'bg-red-950/30    border-red-500/20'
              }`}>
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Portfolio</div>
                <div className="text-xl font-mono font-bold text-white mt-1 tabular-nums">
                  {fmt(portfolioVal, 0)} €
                </div>
                <div className={`text-xs font-mono font-bold ${pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {sign(pnl)}{fmt(pnl, 0)} € ({sign(pnlPct)}{fmt(pnlPct)}%)
                </div>
                <div className="text-[9px] font-mono text-slate-700 mt-1">
                  {safePos.length} position{safePos.length > 1 ? 's' : ''}
                </div>
              </div>
            ) : (
              <div className="px-3 py-3 rounded-xl border border-white/[0.04] bg-dark-700/40 text-center">
                <div className="text-[10px] font-mono text-slate-600">Portfolio vide</div>
                <div className="text-[9px] font-mono text-slate-700 mt-0.5">Ajoutez des positions depuis Analyse Valeur</div>
              </div>
            )}

            {/* Quick links */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest px-1 mb-2">Navigation rapide</div>
              {[
                { label: 'LVMH',          sym: 'MC.PA',  flag: '🇫🇷' },
                { label: 'TotalEnergies', sym: 'TTE.PA', flag: '🇫🇷' },
                { label: 'Nvidia',        sym: 'NVDA',   flag: '🇺🇸' },
                { label: 'Apple',         sym: 'AAPL',   flag: '🇺🇸' },
                { label: 'SAP',           sym: 'SAP',    flag: '🇩🇪' },
                { label: 'Siemens',       sym: 'SIE.DE', flag: '🇩🇪' },
              ].map(({ label, sym, flag }) => (
                <button key={sym} onClick={() => onSelectSymbol(sym)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg bg-dark-700/40
                    hover:bg-dark-600/60 border border-white/[0.04] hover:border-white/[0.08]
                    text-left transition-all group">
                  <span className="text-sm">{flag}</span>
                  <span className="text-xs font-mono text-slate-400 group-hover:text-white transition-colors">{label}</span>
                  <span className="ml-auto text-[9px] font-mono text-slate-700 group-hover:text-slate-500">{sym}</span>
                  <ArrowRight size={9} className="text-slate-700 group-hover:text-slate-400 transition-colors"/>
                </button>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* ── Status bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-2 text-[9px] font-mono text-slate-800 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Globe size={8}/> Yahoo Finance · ~15 min delay
        </div>
        <div className="flex items-center gap-1.5">
          <Zap size={8}/> IA Groq · llama-3.1-8b
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-700 animate-pulse"/>
          Système opérationnel
        </div>
      </div>
    </div>
  )
}

// ── Export public (avec error boundary) ────────────────────────────────────────
export function Dashboard(props: { onSelectSymbol: (s: string) => void; positions?: any[] }) {
  return (
    <DashboardErrorBoundary>
      <DashboardInner {...props}/>
    </DashboardErrorBoundary>
  )
}
