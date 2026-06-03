import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Zap, Globe, Activity,
  Newspaper, BarChart2, RefreshCw, ArrowUpRight,
  ArrowRight, Shield, Radio,
} from 'lucide-react'
import { getIndices, getGeoEvents, getTopSectors, getGameOfDay, getGeneralNews } from '../services/api'
import { Logo } from './Logo'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Index  { name: string; symbol: string; price: number; change_pct: number; change: number }
interface Event  { title: string; impact: 'HIGH'|'MEDIUM'|'LOW'; signal: string; brief: string; flags?: string[] }
interface Sector { sector: string; avg_perf_5j: number; avg_score: number; top_stocks: any[]; countries?: string[] }
interface Pick   { symbol: string; name: string; score: number; potential_pct: number; reason: string; price: number; change_pct: number }

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(v: number, dec = 2) { return v.toFixed(dec) }
function sign(v: number) { return v >= 0 ? '+' : '' }

function useTime() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id) }, [])
  return t
}

// ── Sparkline mini SVG ─────────────────────────────────────────────────────────
function MiniSpark({ pct }: { pct: number }) {
  const pts = pct >= 0
    ? '0,16 8,14 16,11 24,8 32,6 40,4'
    : '0,4 8,6 16,8 24,11 32,14 40,16'
  const c = pct >= 0 ? '#10b981' : '#ef4444'
  return (
    <svg width="40" height="20" viewBox="0 0 40 20">
      <defs>
        <linearGradient id={`sg${pct > 0 ? 'up' : 'dn'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={c} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <polygon points={`0,20 ${pts} 40,20`} fill={`url(#sg${pct > 0 ? 'up' : 'dn'})`}/>
    </svg>
  )
}

// ── Decorative SVG backgrounds ─────────────────────────────────────────────────
function CircuitBg() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none" preserveAspectRatio="none">
      <defs>
        <pattern id="circuit" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.5" fill="#DC2626"/>
          <circle cx="30" cy="30" r="1.5" fill="#DC2626"/>
          <circle cx="56" cy="4" r="1.5" fill="#DC2626"/>
          <circle cx="4" cy="56" r="1.5" fill="#DC2626"/>
          <line x1="4" y1="4"  x2="30" y2="4"  stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="30" y1="4" x2="30" y2="30" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="56" y1="4" x2="56" y2="30" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="30" y1="30" x2="56" y2="30" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="4" y1="4"  x2="4"  y2="56" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="4" y1="56" x2="30" y2="56" stroke="#DC2626" strokeWidth="0.5"/>
          <line x1="30" y1="30" x2="30" y2="56" stroke="#DC2626" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#circuit)"/>
    </svg>
  )
}

// ── Index card ────────────────────────────────────────────────────────────────
function IndexCard({ idx, onClick }: { idx: Index; onClick?: () => void }) {
  const up = idx.change_pct >= 0
  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col gap-2 px-4 py-3 rounded-xl border backdrop-blur-sm cursor-default
        transition-all duration-200 hover:scale-[1.02] hover:shadow-lg overflow-hidden
        ${up
          ? 'bg-emerald-950/30 border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-emerald-900/20'
          : 'bg-red-950/30    border-red-500/20    hover:border-red-500/40    hover:shadow-red-900/20'
        }`}
    >
      {/* bg glow */}
      <div className={`absolute inset-0 opacity-5 ${up ? 'bg-emerald-400' : 'bg-red-400'}`}
           style={{ filter: 'blur(20px)', transform: 'translateY(50%)' }} />

      <div className="flex items-center justify-between relative">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest truncate">{idx.name}</span>
        <MiniSpark pct={idx.change_pct} />
      </div>

      <div className="relative">
        <div className="text-lg font-mono font-bold text-white tabular-nums leading-none">
          {idx.price.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </div>
        <div className={`flex items-center gap-1 mt-1 ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
          <span className="text-xs font-mono font-bold tabular-nums">
            {sign(idx.change_pct)}{fmt(idx.change_pct)}%
          </span>
          <span className="text-xs font-mono text-slate-600 ml-1">
            {sign(idx.change)}{fmt(idx.change, 0)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Geo event row ─────────────────────────────────────────────────────────────
function GeoRow({ ev }: { ev: Event }) {
  const impact = {
    HIGH:   { dot: 'bg-red-500',    text: 'text-red-400',    border: 'border-red-500/20'    },
    MEDIUM: { dot: 'bg-amber-500',  text: 'text-amber-400',  border: 'border-amber-500/20'  },
    LOW:    { dot: 'bg-slate-500',  text: 'text-slate-400',  border: 'border-slate-500/20'  },
  }[ev.impact] ?? { dot: 'bg-slate-500', text: 'text-slate-400', border: 'border-slate-500/20' }

  return (
    <div className={`flex gap-2.5 px-3 py-2.5 rounded-lg border ${impact.border} bg-dark-700/40`}>
      <div className={`w-1.5 h-1.5 rounded-full ${impact.dot} mt-1.5 shrink-0 ${ev.impact==='HIGH' ? 'animate-pulse' : ''}`}/>
      <div className="min-w-0">
        <p className="text-xs font-mono text-slate-300 leading-snug line-clamp-2">{ev.title}</p>
        {ev.brief && <p className="text-[10px] font-mono text-slate-600 mt-0.5 line-clamp-1">{ev.brief}</p>}
      </div>
      {ev.signal && (
        <span className={`shrink-0 text-[9px] font-mono font-bold uppercase ${impact.text}`}>{ev.signal}</span>
      )}
    </div>
  )
}

// ── Pick card ──────────────────────────────────────────────────────────────────
function PickCard({ pick, rank, onClick }: { pick: Pick; rank: number; onClick: () => void }) {
  const up = pick.change_pct >= 0
  const RANK_COLOR = ['#DC2626','#B91C1C','#991B1B']
  return (
    <div onClick={onClick}
      className="relative flex items-center gap-3 px-3 py-3 rounded-xl border border-white/5 bg-dark-700/60
        backdrop-blur-sm cursor-pointer hover:border-red-500/25 hover:bg-dark-600/60 transition-all group overflow-hidden">
      {/* Rank glow */}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
           style={{ background: RANK_COLOR[rank-1] ?? '#6b7280' }}/>
      {/* Rank */}
      <div className="text-lg font-mono font-black tabular-nums shrink-0"
           style={{ color: RANK_COLOR[rank-1] ?? '#6b7280', opacity: 0.8 }}>
        {String(rank).padStart(2,'0')}
      </div>
      {/* Symbol + name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-mono font-bold text-white group-hover:text-red-300 transition-colors">
            {pick.symbol.replace(/\.[A-Z]+$/, '')}
          </span>
          <span className={`text-xs font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {sign(pick.change_pct)}{fmt(pick.change_pct)}%
          </span>
        </div>
        <p className="text-[10px] font-mono text-slate-600 truncate">{pick.name}</p>
      </div>
      {/* Potential */}
      <div className="shrink-0 text-right">
        <div className="text-sm font-mono font-bold text-emerald-400">+{fmt(pick.potential_pct)}%</div>
        <div className="text-[9px] font-mono text-slate-700">potentiel</div>
      </div>
    </div>
  )
}

// ── Sector bar ─────────────────────────────────────────────────────────────────
function SectorRow({ sec }: { sec: Sector }) {
  const up = sec.avg_perf_5j >= 0
  const w  = Math.min(Math.abs(sec.avg_perf_5j) * 8, 100)
  return (
    <div className="flex items-center gap-2.5 py-2">
      <div className="w-24 shrink-0">
        <span className="text-[10px] font-mono text-slate-400 truncate block">{sec.sector}</span>
      </div>
      <div className="flex-1 h-1.5 bg-dark-600 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${up ? 'bg-emerald-500' : 'bg-red-500'}`}
             style={{ width: `${w}%`, opacity: 0.7 }}/>
      </div>
      <div className={`text-xs font-mono font-bold tabular-nums w-14 text-right ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {sign(sec.avg_perf_5j)}{fmt(sec.avg_perf_5j)}%
      </div>
    </div>
  )
}

// ── News headline ──────────────────────────────────────────────────────────────
function NewsRow({ article, onClick }: { article: any; onClick?: () => void }) {
  return (
    <div onClick={onClick}
      className="flex gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-700/50 cursor-pointer transition-colors group">
      <div className="w-1 shrink-0 bg-dark-600 rounded-full mt-1"/>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-mono text-slate-300 line-clamp-2 group-hover:text-white transition-colors leading-relaxed">
          {article.title}
        </p>
        <span className="text-[9px] font-mono text-slate-700 mt-0.5 block">{article.source}</span>
      </div>
      <ArrowRight size={10} className="text-slate-700 group-hover:text-slate-500 transition-colors shrink-0 mt-1"/>
    </div>
  )
}

// ── Glass card wrapper ─────────────────────────────────────────────────────────
function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative bg-dark-800/70 backdrop-blur-md border border-white/[0.06] rounded-2xl overflow-hidden ${className}`}>
      <CircuitBg />
      <div className="relative">{children}</div>
    </div>
  )
}

function CardHeader({ icon: Icon, label, accent = false, extra }: {
  icon: any; label: string; accent?: boolean; extra?: React.ReactNode
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

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export function Dashboard({
  onSelectSymbol,
  positions = [],
}: {
  onSelectSymbol: (s: string) => void
  positions?: any[]
}) {
  const now   = useTime()
  const day   = now.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
  const clock = now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

  const { data: indicesRaw = [], isLoading: idxLoading } = useQuery({
    queryKey: ['indices'],
    queryFn:  getIndices,
    refetchInterval: 30_000,
    staleTime: 0,
  })
  const { data: geoRaw }     = useQuery({ queryKey: ['geo-events'],  queryFn: getGeoEvents,   staleTime: 4*60*60*1000 })
  const { data: sectorsRaw } = useQuery({ queryKey: ['top-sectors'], queryFn: getTopSectors,  staleTime: 30*60*1000 })
  const { data: gameRaw }    = useQuery({ queryKey: ['game'],        queryFn: getGameOfDay,   staleTime: 60*60*1000 })
  const { data: newsRaw }    = useQuery({ queryKey: ['news-general'],queryFn: () => getGeneralNews(), staleTime: 10*60*1000 })

  const indices  = (indicesRaw  as Index[])  ?? []
  const events   = (geoRaw?.events ?? [])    as Event[]
  const sectors  = (sectorsRaw  ?? [])       as Sector[]
  const picks    = (gameRaw?.picks ?? [])    as Pick[]
  const articles = (newsRaw     ?? []).slice(0, 8) as any[]

  // Market global score
  const posIndices = indices.filter(i => i.change_pct > 0).length
  const negIndices = indices.filter(i => i.change_pct < 0).length
  const moodUp     = posIndices > negIndices
  const highImpact = events.filter(e => e.impact === 'HIGH').length

  // Portfolio P&L simple
  const portfolioValue = positions.reduce((sum, p) => sum + (p.current_price ?? p.buy_price) * p.quantity, 0)
  const portfolioCost  = positions.reduce((sum, p) => sum + p.buy_price * p.quantity, 0)
  const portfolioPnl   = portfolioValue - portfolioCost
  const portfolioPct   = portfolioCost > 0 ? (portfolioPnl / portfolioCost) * 100 : 0

  return (
    <div className="space-y-4 pb-6">

      {/* ── Hero band ─────────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden border border-white/[0.07]"
           style={{ background: 'linear-gradient(135deg, #0a0000 0%, #0d0000 40%, #0a0a0a 100%)' }}>
        <CircuitBg />
        {/* Red accent glow top-right */}
        <div className="absolute top-0 right-0 w-72 h-40 opacity-10 pointer-events-none"
             style={{ background: 'radial-gradient(ellipse at 80% 20%, #DC2626 0%, transparent 70%)' }}/>
        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-800/40 to-transparent"/>

        <div className="relative px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo size={48} />
            <div>
              <div className="text-[10px] font-mono text-slate-600 capitalize">{day}</div>
              <div className="text-xl font-mono font-bold text-white tabular-nums tracking-wider">{clock}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  moodUp ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/40' : 'text-red-400 border-red-500/30 bg-red-950/40'
                }`}>
                  {moodUp ? '▲' : '▼'} Marché {moodUp ? 'Haussier' : 'Baissier'}
                </span>
                {highImpact > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border text-red-400 border-red-500/30 bg-red-950/40 animate-pulse">
                    ⚡ {highImpact} alerte{highImpact > 1 ? 's' : ''} haute
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'Indices', val: `${posIndices}↑ ${negIndices}↓`, color: moodUp ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Signaux', val: `${picks.length} picks`, color: 'text-yellow-400' },
              { label: 'Secteurs top', val: `${sectors.filter((s:Sector)=>s.avg_perf_5j>0).length}`, color: 'text-cyan-400' },
              ...(positions.length > 0 ? [{
                label: 'Portfolio P&L',
                val: `${portfolioPct >= 0 ? '+' : ''}${fmt(portfolioPct)}%`,
                color: portfolioPct >= 0 ? 'text-emerald-400' : 'text-red-400',
              }] : []),
            ].map(({ label, val, color }) => (
              <div key={label} className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center min-w-[72px]">
                <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">{label}</div>
                <div className={`text-sm font-mono font-bold ${color}`}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Indices ──────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Radio size={10} className="text-slate-600"/>
          <span className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">Indices mondiaux</span>
          {idxLoading && <RefreshCw size={9} className="text-slate-700 animate-spin"/>}
        </div>
        {idxLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {[...Array(6)].map((_,i) => (
              <div key={i} className="h-20 bg-dark-800/70 rounded-xl animate-pulse border border-white/5"/>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {indices.map(idx => <IndexCard key={idx.symbol} idx={idx} />)}
          </div>
        )}
      </div>

      {/* ── Main grid 3-col ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Col 1: Game of Day ────────────────────────────────────────────── */}
        <GlassCard>
          <CardHeader icon={Zap} label="Game of Day — Top Picks" accent />
          <div className="p-3 space-y-2">
            {picks.length === 0 ? (
              <div className="py-6 text-center text-slate-700 text-xs font-mono">
                Données en cours de calcul…
              </div>
            ) : (
              picks.slice(0, 3).map((pick, i) => (
                <PickCard key={pick.symbol} pick={pick} rank={i+1}
                  onClick={() => onSelectSymbol(pick.symbol)} />
              ))
            )}
            {gameRaw?.brief && (
              <div className="mt-2 pt-2 border-t border-white/[0.04]">
                <p className="text-[10px] font-mono text-slate-600 italic leading-relaxed px-1">
                  "{gameRaw.brief}"
                </p>
              </div>
            )}
          </div>
          {/* Bottom CTA */}
          <div className="px-4 py-2.5 border-t border-white/[0.04] flex justify-end">
            <button onClick={() => {}} className="flex items-center gap-1 text-[10px] font-mono text-red-400/60 hover:text-red-400 transition-colors">
              Voir les signaux <ArrowUpRight size={9}/>
            </button>
          </div>
        </GlassCard>

        {/* ── Col 2: Géopolitique ───────────────────────────────────────────── */}
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
              <div className="py-6 text-center text-slate-700 text-xs font-mono">
                Analyse géopolitique en cours…
              </div>
            ) : (
              events.slice(0, 4).map((ev, i) => <GeoRow key={i} ev={ev} />)
            )}
          </div>
          {geoRaw?.synthesis && (
            <div className="px-4 pb-3 border-t border-white/[0.04] pt-2">
              <p className="text-[10px] font-mono text-slate-600 leading-relaxed line-clamp-2 italic">
                {geoRaw.synthesis}
              </p>
            </div>
          )}
        </GlassCard>

        {/* ── Col 3: Top Secteurs ───────────────────────────────────────────── */}
        <GlassCard>
          <CardHeader icon={BarChart2} label="Top Secteurs — 5 jours" />
          <div className="px-4 py-3">
            {sectors.length === 0 ? (
              <div className="py-6 text-center text-slate-700 text-xs font-mono">
                Chargement secteurs…
              </div>
            ) : (
              <>
                {sectors.slice(0, 6).map((s) => <SectorRow key={s.sector} sec={s} />)}
                {/* Top stock badges */}
                <div className="mt-3 pt-3 border-t border-white/[0.04]">
                  <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest mb-2">Valeurs en vedette</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sectors.slice(0,3).flatMap((s:Sector) => s.top_stocks?.slice(0,2) ?? []).map((sym: string, i: number) => (
                      <button key={i} onClick={() => onSelectSymbol(sym)}
                        className="text-[10px] font-mono px-2 py-1 rounded-lg bg-dark-600/80 text-slate-400
                          hover:text-white hover:bg-dark-500 transition-colors border border-white/[0.05] tabular-nums">
                        {String(sym).replace(/\.[A-Z]+$/, '')}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ── Actualités + Portfolio summary ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* News — 2/3 width */}
        <GlassCard className="lg:col-span-2">
          <CardHeader icon={Newspaper} label="Actualités Récentes" extra={
            <span className="text-[9px] font-mono text-slate-700">sources FR + Monde</span>
          }/>
          <div className="divide-y divide-white/[0.03]">
            {articles.length === 0 ? (
              <div className="py-8 text-center text-slate-700 text-xs font-mono">
                Chargement des actualités…
              </div>
            ) : (
              articles.map((a: any, i: number) => (
                <NewsRow key={i} article={a} />
              ))
            )}
          </div>
        </GlassCard>

        {/* Portfolio / Quick actions — 1/3 width */}
        <GlassCard>
          <CardHeader icon={Activity} label="Accès Rapide" />
          <div className="p-3 space-y-2">
            {/* Portfolio summary */}
            {positions.length > 0 ? (
              <div className={`px-3 py-3 rounded-xl border ${
                portfolioPct >= 0
                  ? 'bg-emerald-950/30 border-emerald-500/20'
                  : 'bg-red-950/30 border-red-500/20'
              }`}>
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Portfolio</div>
                <div className="text-xl font-mono font-bold text-white mt-1 tabular-nums">
                  {fmt(portfolioValue, 0)} €
                </div>
                <div className={`text-xs font-mono font-bold ${portfolioPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {sign(portfolioPnl)}{fmt(portfolioPnl, 0)} € ({sign(portfolioPct)}{fmt(portfolioPct)}%)
                </div>
                <div className="text-[9px] font-mono text-slate-700 mt-1">{positions.length} position{positions.length > 1 ? 's' : ''}</div>
              </div>
            ) : (
              <div className="px-3 py-3 rounded-xl border border-white/[0.04] bg-dark-700/40 text-center">
                <div className="text-[10px] font-mono text-slate-600">Portfolio vide</div>
                <div className="text-[9px] font-mono text-slate-700 mt-0.5">Ajoutez des positions depuis Analyse Valeur</div>
              </div>
            )}

            {/* Quick actions */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest px-1">Navigation rapide</div>
              {[
                { label: 'LVMH',       sym: 'MC.PA',  flag: '🇫🇷' },
                { label: 'TotalEnergies', sym: 'TTE.PA', flag: '🇫🇷' },
                { label: 'Nvidia',     sym: 'NVDA',   flag: '🇺🇸' },
                { label: 'Apple',      sym: 'AAPL',   flag: '🇺🇸' },
                { label: 'SAP',        sym: 'SAP',    flag: '🇩🇪' },
                { label: 'Siemens',    sym: 'SIE.DE', flag: '🇩🇪' },
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

      {/* ── Bottom status bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-2 text-[9px] font-mono text-slate-800">
        <div className="flex items-center gap-1.5">
          <Globe size={8}/>
          <span>Données Yahoo Finance · ~15min delay</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap size={8}/>
          <span>IA Groq · llama-3.1-8b</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"/>
          <span>Système opérationnel</span>
        </div>
      </div>
    </div>
  )
}
