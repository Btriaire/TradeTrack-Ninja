import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Star, Settings, X, ChevronDown, ChevronUp } from 'lucide-react'
import { getSectors } from '../services/api'

interface SectorStock {
  symbol:     string
  name:       string
  index:      string
  country:    string
  sector:     string
  price:      number
  change_pct: number
  volume:     number
  score:      number
  sparkline:  number[]
  gem:        'buy' | 'sell' | 'momentum+' | 'dip' | null
}

type ViewMode = 'sector' | 'market'

const SECTORS = [
  { id: 'all',          label: 'Tout',          icon: '⬡' },
  { id: 'gems',         label: 'Pépites',       icon: '◈' },
  { id: 'Technologie',  label: 'Technologie',   icon: '⬡' },
  { id: 'Finance',      label: 'Finance',       icon: '◈' },
  { id: 'Santé',        label: 'Santé',         icon: '⊕' },
  { id: 'Énergie',      label: 'Énergie',       icon: '◉' },
  { id: 'Automobile',   label: 'Automobile',    icon: '◎' },
  { id: 'Aérospatiale', label: 'Aérospatiale',  icon: '⟁' },
  { id: 'Luxe & Mode',  label: 'Luxe',          icon: '◆' },
  { id: 'Industrie',    label: 'Industrie',     icon: '⬔' },
  { id: 'Matériaux',    label: 'Matériaux',     icon: '◇' },
  { id: 'Consommation', label: 'Consommation',  icon: '◉' },
]

const INDEX_ORDER = ['CAC 40', 'DAX', 'NASDAQ', 'S&P 500', 'FTSE 100', 'AEX']
const INDEX_FLAG: Record<string, string> = {
  'CAC 40': '🇫🇷', 'DAX': '🇩🇪', 'NASDAQ': '🇺🇸',
  'S&P 500': '🇺🇸', 'FTSE 100': '🇬🇧', 'AEX': '🇳🇱',
}

function fmtVol(v: number) {
  if (!v) return '—'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K'
  return String(v)
}

// ── SVG Sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, positive, id }: { data: number[]; positive: boolean; id: string }) {
  if (data.length < 2) {
    return <svg width="56" height="24"><line x1="0" y1="12" x2="56" y2="12" stroke="#334155" strokeWidth="1" strokeDasharray="2,2"/></svg>
  }
  const W = 56, H = 24, pad = 1
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 0.001
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (W - pad * 2),
    pad + (1 - (v - min) / range) * (H - pad * 2),
  ])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${(W - pad).toFixed(1)},${H} L${pad},${H} Z`
  const color = positive ? '#10b981' : '#ef4444'
  const gradId = `sp-${id}`

  return (
    <svg width={W} height={H} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`}/>
      <path d={line} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Dot final */}
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={color}/>
    </svg>
  )
}

// ── SVG Score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ score }: { score: number }) {
  const abs   = Math.min(Math.abs(score), 5)
  const w     = (abs / 5) * 40
  const color = score > 0 ? '#10b981' : score < 0 ? '#ef4444' : '#334155'
  return (
    <svg width="44" height="8">
      <rect x="0" y="2" width="44" height="4" rx="2" fill="#1e293b"/>
      <rect x={score >= 0 ? 22 : 22 - w} y="2" width={w} height="4" rx="2" fill={color} opacity="0.8"/>
      <line x1="22" y1="0" x2="22" y2="8" stroke="#334155" strokeWidth="1"/>
    </svg>
  )
}

// ── SVG Hex background décoratif ──────────────────────────────────────────────
function HexGrid({ width = 300, height = 40, color = '#1e293b' }: { width?: number; height?: number; color?: string }) {
  const hexes = []
  const r = 8, w = r * 2, h = Math.sqrt(3) * r
  let col = 0
  for (let x = 0; x < width + w; x += w * 0.75) {
    const offset = (col % 2) * (h / 2)
    for (let y = -h / 2 + offset; y < height + h; y += h) {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 180) * (60 * i - 30)
        return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`
      }).join(' ')
      hexes.push(<polygon key={`${x}-${y}`} points={pts} fill="none" stroke={color} strokeWidth="0.5" opacity="0.6"/>)
    }
    col++
  }
  return (
    <svg width="100%" height={height} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ width: '100%' }}>
      {hexes}
    </svg>
  )
}

// ── Badge pépite ───────────────────────────────────────────────────────────────
function GemBadge({ gem }: { gem: SectorStock['gem'] }) {
  if (!gem) return null
  const cfg = {
    'buy':       { svg: '◈', label: 'PÉPITE',      cls: 'text-yellow-300 bg-yellow-500/15 border-yellow-500/40' },
    'sell':      { svg: '⊗', label: 'ÉVITER',      cls: 'text-red-400   bg-red-500/10    border-red-500/30' },
    'momentum+': { svg: '▲', label: 'MOMENTUM',    cls: 'text-green-400 bg-green-500/10  border-green-500/30' },
    'dip':       { svg: '◎', label: 'DIP',         cls: 'text-blue-400  bg-blue-500/10   border-blue-500/30' },
  }[gem]
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded border ${cfg.cls}`} style={{ fontSize: '9px', letterSpacing: '0.05em' }}>
      <span>{cfg.svg}</span>
      {cfg.label}
    </span>
  )
}

// ── Ligne stock ───────────────────────────────────────────────────────────────
function StockRow({ s, rank, onSelect }: { s: SectorStock; rank: number; onSelect: (sym: string) => void }) {
  const up      = s.change_pct >= 0
  const isGem   = s.gem === 'buy' || s.gem === 'momentum+'
  const isDanger= s.gem === 'sell'

  return (
    <tr
      onClick={() => onSelect(s.symbol)}
      className={`group border-t cursor-pointer transition-all duration-150 ${
        isGem   ? 'border-yellow-500/10 hover:bg-yellow-500/5  bg-yellow-500/[0.03]' :
        isDanger? 'border-red-500/10    hover:bg-red-500/5     bg-red-500/[0.02]'    :
                  'border-slate-800     hover:bg-slate-800/60'
      }`}
    >
      {/* Rank */}
      <td className="pl-4 pr-1 py-2.5 text-slate-700 font-mono text-xs w-6 tabular-nums">{rank.toString().padStart(2,'0')}</td>

      {/* Identité */}
      <td className="px-2 py-2.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm leading-none">{s.country}</span>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-bold text-white text-xs tracking-wider group-hover:text-cyan-300 transition-colors">
                {s.symbol.replace(/\.[A-Z]+$/, '')}
              </span>
              {s.gem && <GemBadge gem={s.gem} />}
            </div>
            <div className="text-slate-500 text-xs truncate max-w-[150px]">{s.name}</div>
          </div>
        </div>
      </td>

      {/* Sparkline */}
      <td className="px-2 py-2.5 hidden sm:table-cell">
        <Sparkline data={s.sparkline} positive={up} id={s.symbol} />
      </td>

      {/* Prix */}
      <td className="px-2 py-2.5 text-right font-mono text-white text-xs tabular-nums">
        {s.price > 0 ? s.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
      </td>

      {/* Variation */}
      <td className="px-2 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <svg width="8" height="8" viewBox="0 0 8 8">
            {up
              ? <polygon points="4,0 8,8 0,8" fill="#10b981"/>
              : <polygon points="0,0 8,0 4,8" fill="#ef4444"/>
            }
          </svg>
          <span className={`font-mono font-bold text-xs tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
            {up ? '+' : ''}{s.change_pct.toFixed(2)}%
          </span>
        </div>
      </td>

      {/* Score bar */}
      <td className="px-2 py-2.5 hidden md:table-cell">
        <ScoreBar score={s.score} />
      </td>

      {/* Volume */}
      <td className="pr-4 py-2.5 text-right font-mono text-slate-600 text-xs hidden lg:table-cell">
        {fmtVol(s.volume)}
      </td>
    </tr>
  )
}

// ── Section groupe ─────────────────────────────────────────────────────────────
function GroupSection({ title, icon, stocks, onSelect, defaultOpen = true }:
  { title: string; icon: string; stocks: SectorStock[]; onSelect: (s: string) => void; defaultOpen?: boolean }
) {
  const [open, setOpen] = useState(defaultOpen)
  const [sort, setSort] = useState<'change_pct' | 'price' | 'name'>('change_pct')
  const [dir,  setDir]  = useState<'asc'|'desc'>('desc')

  const gems = stocks.filter(s => s.gem === 'buy' || s.gem === 'momentum+').length
  const avg  = stocks.length ? stocks.reduce((a, s) => a + s.change_pct, 0) / stocks.length : 0
  const hasGems = gems > 0

  function handleSort(k: typeof sort) {
    if (sort === k) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(k); setDir('desc') }
  }

  const sorted = [...stocks].sort((a, b) => {
    const va = a[sort] as any, vb = b[sort] as any
    if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return dir === 'asc' ? va - vb : vb - va
  })

  return (
    <div className={`rounded-xl overflow-hidden border transition-all ${
      hasGems ? 'border-yellow-500/20' : 'border-slate-800'
    }`}>
      {/* Header */}
      <button
        className={`relative w-full flex items-center justify-between px-4 py-3 transition-colors overflow-hidden ${
          hasGems ? 'bg-gradient-to-r from-yellow-500/5 to-dark-800 hover:from-yellow-500/10' : 'bg-dark-800 hover:bg-dark-700/60'
        }`}
        onClick={() => setOpen(o => !o)}
      >
        {/* Hex background décor */}
        <div className="absolute inset-0 opacity-30">
          <HexGrid color={hasGems ? '#854d0e' : '#1e293b'} height={48} />
        </div>

        {/* Scan line top */}
        <div className={`absolute top-0 left-0 right-0 h-px ${hasGems ? 'bg-yellow-500/30' : 'bg-slate-700/50'}`}/>

        <div className="relative flex items-center gap-3">
          {/* Icon SVG */}
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg border font-mono text-sm ${
            hasGems ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' : 'border-slate-700 bg-slate-800/80 text-slate-400'
          }`}>
            {icon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white text-sm tracking-wide">{title}</span>
              {hasGems && (
                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                  ◈ {gems} pépite{gems > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-600 font-mono">{stocks.length} valeurs</div>
          </div>
        </div>

        <div className="relative flex items-center gap-4">
          {/* Mini bar chart des variations */}
          <svg width="48" height="20" className="hidden sm:block">
            {stocks.slice(0, 8).map((s, i) => {
              const h = Math.min(Math.abs(s.change_pct) * 2, 18)
              const col = s.change_pct >= 0 ? '#10b981' : '#ef4444'
              return <rect key={i} x={i * 6} y={20 - h} width="4" height={h} rx="1" fill={col} opacity="0.7"/>
            })}
          </svg>

          <div className={`font-mono font-bold text-sm ${avg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {avg >= 0 ? '+' : ''}{avg.toFixed(2)}%
          </div>
          {open ? <ChevronUp size={14} className="text-slate-500"/> : <ChevronDown size={14} className="text-slate-500"/>}
        </div>
      </button>

      {/* Table */}
      {open && (
        <div className="bg-dark-900/80 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 text-slate-600 font-mono text-xs">
                <th className="pl-4 pr-1 py-2 text-left w-6">#</th>
                <th className="px-2 py-2 text-left">
                  <button onClick={() => handleSort('name')} className="hover:text-white transition-colors flex items-center gap-1">
                    VALEUR {sort==='name' && (dir==='desc'?'↓':'↑')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left hidden sm:table-cell text-slate-700">TREND 7J</th>
                <th className="px-2 py-2 text-right">
                  <button onClick={() => handleSort('price')} className="hover:text-white transition-colors">
                    COURS {sort==='price' && (dir==='desc'?'↓':'↑')}
                  </button>
                </th>
                <th className="px-2 py-2 text-right">
                  <button onClick={() => handleSort('change_pct')} className="hover:text-white transition-colors">
                    VAR% {sort==='change_pct' && (dir==='desc'?'↓':'↑')}
                  </button>
                </th>
                <th className="px-2 py-2 hidden md:table-cell text-slate-700">SIGNAL</th>
                <th className="pr-4 py-2 text-right hidden lg:table-cell text-slate-700">VOL</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => <StockRow key={s.symbol} s={s} rank={i+1} onSelect={onSelect}/>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ── Composant principal ───────────────────────────────────────────────────────
export function Markets({ onSelectSymbol }: { onSelectSymbol: (s: string) => void }) {
  const [activeSector,    setActiveSector]    = useState('all')
  const [viewMode,        setViewMode]        = useState<ViewMode>('sector')
  const [showPersonalize, setShowPersonalize] = useState(false)
  const [favSectors,      setFavSectors]      = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('favSectors') || '[]') } catch { return [] }
  })
  const [hiddenSectors, setHiddenSectors] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('hiddenSectors') || '[]') } catch { return [] }
  })

  const { data = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey:        ['sectors'],
    queryFn:         getSectors,
    staleTime:       3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  useEffect(() => { localStorage.setItem('favSectors', JSON.stringify(favSectors)) }, [favSectors])
  useEffect(() => { localStorage.setItem('hiddenSectors', JSON.stringify(hiddenSectors)) }, [hiddenSectors])

  const allStocks = data as SectorStock[]
  const gemStocks = allStocks.filter(s => s.gem !== null)
  const withPrice = allStocks.filter(s => s.price > 0)
  const gainers   = withPrice.filter(s => s.change_pct > 0).length
  const losers    = withPrice.filter(s => s.change_pct < 0).length

  const filtered = activeSector === 'all'  ? allStocks
                 : activeSector === 'gems' ? gemStocks
                 : allStocks.filter(s => s.sector === activeSector)

  function groupBy(key: keyof SectorStock, stocks: SectorStock[]) {
    const map: Record<string, SectorStock[]> = {}
    stocks.forEach(s => { const k = s[key] as string; (map[k] ??= []).push(s) })
    return map
  }

  function toggleFav(id: string) {
    setFavSectors(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }
  function toggleHide(id: string) {
    setHiddenSectors(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  }

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  const sectorGroups  = Object.entries(groupBy('sector', filtered))
  const orderedGroups = [
    ...sectorGroups.filter(([k]) => favSectors.includes(k)),
    ...sectorGroups.filter(([k]) => !favSectors.includes(k) && !hiddenSectors.includes(k)),
  ]
  const marketGroups = INDEX_ORDER.map(idx => [idx, filtered.filter(s => s.index === idx)] as [string, SectorStock[]])
    .filter(([, stocks]) => stocks.length > 0)

  return (
    <div className="space-y-3 font-mono">

      {/* ── Header terminal ──────────────────────────────────────────────── */}
      <div className="relative rounded-xl overflow-hidden border border-slate-700/60">
        {/* BG décoratif */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-dark-800 to-slate-900"/>
        <div className="absolute inset-0 opacity-20">
          <HexGrid color="#334155" height={88} />
        </div>
        {/* Scan lines */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent"/>
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"/>

        <div className="relative p-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              {/* Title */}
              <div className="flex items-center gap-2 mb-2">
                {/* Live indicator SVG */}
                <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
                  <circle cx="12" cy="12" r="4" fill="#06b6d4"/>
                  <circle cx="12" cy="12" r="8" fill="none" stroke="#06b6d4" strokeWidth="1" opacity="0.4"/>
                  <circle cx="12" cy="12" r="11" fill="none" stroke="#06b6d4" strokeWidth="0.5" opacity="0.2"/>
                </svg>
                <span className="text-white font-bold tracking-widest text-sm uppercase">MARKET_SCAN</span>
                <span className="text-cyan-500/60 text-xs">v2.0</span>
              </div>

              {/* Stats en ligne */}
              <div className="flex flex-wrap gap-3 text-xs">
                {[
                  { label: 'VALEURS',  val: withPrice.length, color: 'text-slate-300' },
                  { label: 'HAUSSIER', val: gainers,           color: 'text-green-400' },
                  { label: 'BAISSIER', val: losers,            color: 'text-red-400'   },
                  { label: 'PÉPITES',  val: gemStocks.length,  color: 'text-yellow-400'},
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex items-center gap-1.5 bg-slate-800/60 px-2 py-1 rounded border border-slate-700/60">
                    <span className="text-slate-600">{label}</span>
                    <span className={`font-bold ${color}`}>{val}</span>
                  </div>
                ))}
                {lastUpdate && (
                  <div className="flex items-center gap-1.5 bg-slate-800/60 px-2 py-1 rounded border border-slate-700/60 text-slate-600">
                    <span>⟳</span> <span>{lastUpdate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex bg-slate-800 rounded-lg border border-slate-700/60 p-0.5 text-xs">
                {(['sector', 'market'] as ViewMode[]).map(m => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`px-3 py-1.5 rounded-md transition-colors tracking-wider uppercase ${
                      viewMode === m ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                    {m === 'sector' ? 'SECTEUR' : 'MARCHÉ'}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowPersonalize(p => !p)}
                className={`p-2 rounded-lg border transition-colors text-xs ${
                  showPersonalize ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'
                }`}>
                <Settings size={13}/>
              </button>
              <button onClick={() => refetch()} disabled={isLoading}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''}/>
                {!isLoading && 'SYNC'}
              </button>
            </div>
          </div>

          {/* Personnalisation */}
          {showPersonalize && (
            <div className="mt-3 pt-3 border-t border-slate-700/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 tracking-wider">// PERSONNALISATION SECTEURS</span>
                <button onClick={() => setShowPersonalize(false)} className="text-slate-600 hover:text-white"><X size={13}/></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SECTORS.filter(s => s.id !== 'all' && s.id !== 'gems').map(({ id, label }) => {
                  const isFav    = favSectors.includes(id)
                  const isHidden = hiddenSectors.includes(id)
                  return (
                    <div key={id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
                      isHidden ? 'border-slate-700 text-slate-700 line-through'
                      : isFav  ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
                    }`}>
                      <span className="tracking-wider uppercase" style={{ fontSize: '10px' }}>{label}</span>
                      <button onClick={() => toggleFav(id)} className={`ml-1 ${isFav ? 'text-yellow-400' : 'text-slate-700 hover:text-yellow-400'} transition-colors`}>
                        <Star size={10} fill={isFav ? 'currentColor' : 'none'}/>
                      </button>
                      <button onClick={() => toggleHide(id)} className={`${isHidden ? 'text-red-400' : 'text-slate-700 hover:text-red-400'} transition-colors`}>
                        <X size={10}/>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Filtres secteur ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <div className="flex gap-1.5 pb-1 min-w-max">
          {SECTORS.filter(s => s.id === 'all' || s.id === 'gems' || !hiddenSectors.includes(s.id)).map(({ id, label }) => {
            const count = id === 'all' ? allStocks.length : id === 'gems' ? gemStocks.length : allStocks.filter(s => s.sector === id).length
            if (!count && id !== 'all' && id !== 'gems') return null
            const isActive = activeSector === id
            const isGems   = id === 'gems'
            const isFav    = favSectors.includes(id)
            return (
              <button key={id} onClick={() => setActiveSector(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap border tracking-wider uppercase ${
                  isActive
                    ? isGems ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                    : 'bg-dark-800 text-slate-500 hover:text-white border-slate-800 hover:border-slate-700'
                }`} style={{ fontSize: '10px' }}>
                {isFav && <Star size={9} fill="currentColor" className="text-yellow-500"/>}
                {label}
                <span className={`tabular-nums ${isActive ? '' : 'text-slate-700'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Skeleton ─────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-xl overflow-hidden border border-slate-800">
              <div className="h-12 bg-slate-800/60 animate-pulse"/>
              <div className="bg-slate-900/60 divide-y divide-slate-800">
                {[1,2,3].map(j => <div key={j} className="h-10 animate-pulse bg-slate-800/20"/>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sections ─────────────────────────────────────────────────────── */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-xl border border-slate-800 p-8 text-center text-slate-600 text-xs tracking-widest">
          // AUCUNE VALEUR DANS CE FILTRE
        </div>
      )}

      {!isLoading && viewMode === 'sector' && (
        <div className="space-y-2">
          {orderedGroups.map(([sector, stocks]) => {
            const meta = SECTORS.find(s => s.id === sector)
            return <GroupSection key={sector} title={sector} icon={meta?.icon ?? '◆'} stocks={stocks} onSelect={onSelectSymbol} defaultOpen={favSectors.includes(sector) || stocks.some(s => s.gem)}/>
          })}
        </div>
      )}

      {!isLoading && viewMode === 'market' && (
        <div className="space-y-2">
          {marketGroups.map(([idx, stocks]) => (
            <GroupSection key={idx} title={idx} icon={INDEX_FLAG[idx] ?? '🌍'} stocks={stocks} onSelect={onSelectSymbol} defaultOpen/>
          ))}
        </div>
      )}

      {/* Footer terminal */}
      <div className="flex items-center gap-2 text-slate-800 text-xs pb-2">
        <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#1e293b"/></svg>
        <span>// données différées ~15min · clic = graphique · ◈ pépite = signal technique favorable</span>
      </div>
    </div>
  )
}
