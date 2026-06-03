import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  RefreshCw, TrendingUp, TrendingDown, Star, Gem,
  ChevronDown, ChevronUp, ArrowUpDown, Settings, X,
} from 'lucide-react'
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
  gem:        'buy' | 'sell' | 'momentum+' | 'dip' | null
}

type SortKey = 'name' | 'price' | 'change_pct'
type ViewMode = 'sector' | 'market'

// ── Définition des secteurs ────────────────────────────────────────────────
const SECTORS: { id: string; label: string; icon: string }[] = [
  { id: 'all',           label: 'Tout',           icon: '🌍' },
  { id: 'gems',          label: 'Pépites',        icon: '💎' },
  { id: 'Technologie',   label: 'Technologie',    icon: '🖥️' },
  { id: 'Finance',       label: 'Finance',        icon: '🏦' },
  { id: 'Santé',         label: 'Santé',          icon: '🏥' },
  { id: 'Énergie',       label: 'Énergie',        icon: '⚡' },
  { id: 'Automobile',    label: 'Automobile',     icon: '🚗' },
  { id: 'Aérospatiale',  label: 'Aérospatiale',   icon: '✈️' },
  { id: 'Luxe & Mode',   label: 'Luxe & Mode',    icon: '👜' },
  { id: 'Industrie',     label: 'Industrie',      icon: '🏭' },
  { id: 'Matériaux',     label: 'Matériaux',      icon: '🧪' },
  { id: 'Consommation',  label: 'Consommation',   icon: '🛒' },
]

const INDEX_ORDER = ['CAC 40', 'DAX', 'NASDAQ', 'S&P 500', 'FTSE 100', 'AEX']

const INDEX_META: Record<string, { flag: string }> = {
  'CAC 40':   { flag: '🇫🇷' },
  'DAX':      { flag: '🇩🇪' },
  'NASDAQ':   { flag: '🇺🇸' },
  'S&P 500':  { flag: '🇺🇸' },
  'FTSE 100': { flag: '🇬🇧' },
  'AEX':      { flag: '🇳🇱' },
}

function fmtVolume(v: number) {
  if (!v) return '—'
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return (v / 1_000).toFixed(0) + 'K'
  return String(v)
}

function GemBadge({ gem }: { gem: SectorStock['gem'] }) {
  if (!gem) return null
  const cfg = {
    'buy':       { label: '💎 Pépite',     cls: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40' },
    'sell':      { label: '⚠️ Éviter',     cls: 'bg-red-500/15 text-red-400 border border-red-500/30' },
    'momentum+': { label: '🚀 Momentum',   cls: 'bg-green-500/15 text-green-400 border border-green-500/30' },
    'dip':       { label: '📉 Opportunité',cls: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
  }[gem]
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function StockRow({
  s, rank, onSelect,
}: {
  s: SectorStock; rank: number; onSelect: (sym: string) => void
}) {
  const up      = s.change_pct >= 0
  const isGem   = s.gem === 'buy' || s.gem === 'momentum+'
  const isDanger= s.gem === 'sell'

  return (
    <tr
      onClick={() => onSelect(s.symbol)}
      className={`border-t border-dark-700/50 cursor-pointer transition-colors hover:bg-dark-700/50 ${
        isGem ? 'bg-yellow-500/5' : isDanger ? 'bg-red-500/5' : ''
      }`}
    >
      <td className="px-3 py-2.5 text-slate-600 text-xs w-8">{rank}</td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs">{s.country}</span>
          <span className="font-mono font-bold text-white text-xs">
            {s.symbol.replace(/\.[A-Z]+$/, '')}
          </span>
          <span className="text-slate-400 text-xs truncate max-w-[120px]">{s.name}</span>
          {s.gem && <GemBadge gem={s.gem} />}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">{s.index}</div>
      </td>
      <td className="px-2 py-2.5 text-right font-mono text-white text-xs">
        {s.price > 0 ? s.price.toFixed(2) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={`inline-flex items-center gap-0.5 font-mono font-bold text-xs px-1.5 py-0.5 rounded ${
          up ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
        }`}>
          {up ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}
          {up ? '+' : ''}{s.change_pct.toFixed(2)}%
        </span>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-slate-500 text-xs hidden md:table-cell">
        {fmtVolume(s.volume)}
      </td>
    </tr>
  )
}

// ── Section par groupe (secteur ou marché) ────────────────────────────────
function GroupSection({
  title, icon, stocks, onSelect, defaultOpen = true,
}: {
  title: string; icon: string; stocks: SectorStock[]
  onSelect: (s: string) => void; defaultOpen?: boolean
}) {
  const [open, setOpen]   = useState(defaultOpen)
  const [sort, setSort]   = useState<SortKey>('change_pct')
  const [dir,  setDir]    = useState<'asc'|'desc'>('desc')

  const gems = stocks.filter(s => s.gem === 'buy' || s.gem === 'momentum+').length
  const avg  = stocks.length
    ? stocks.reduce((a, s) => a + s.change_pct, 0) / stocks.length : 0

  function handleSort(k: SortKey) {
    if (sort === k) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(k); setDir('desc') }
  }

  const sorted = [...stocks].sort((a, b) => {
    const va = a[sort] as any
    const vb = b[sort] as any
    if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return dir === 'asc' ? va - vb : vb - va
  })

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button onClick={() => handleSort(k)}
        className={`flex items-center gap-0.5 hover:text-white transition-colors ${sort===k?'text-white':'text-slate-500'}`}>
        {label}
        {sort === k ? (dir==='desc'?<ChevronDown size={10}/>:<ChevronUp size={10}/>) : <ArrowUpDown size={9} className="opacity-30"/>}
      </button>
    )
  }

  return (
    <div className={`rounded-xl overflow-hidden border ${
      gems > 0 ? 'border-yellow-500/20 bg-dark-800' : 'border-dark-700 bg-dark-800'
    }`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">{title}</span>
              {gems > 0 && (
                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                  💎 {gems} pépite{gems > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">{stocks.length} valeurs</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-mono font-bold ${avg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {avg >= 0 ? '+' : ''}{avg.toFixed(2)}%
          </span>
          {open ? <ChevronUp size={14} className="text-slate-500"/> : <ChevronDown size={14} className="text-slate-500"/>}
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-dark-700 text-slate-500">
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-2 py-2 text-left font-medium"><SortBtn k="name" label="Valeur"/></th>
                <th className="px-2 py-2 text-right font-medium"><SortBtn k="price" label="Prix"/></th>
                <th className="px-3 py-2 text-right font-medium"><SortBtn k="change_pct" label="Var. %"/></th>
                <th className="px-3 py-2 text-right font-medium hidden md:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <StockRow key={s.symbol} s={s} rank={i + 1} onSelect={onSelect} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ── Composant principal ───────────────────────────────────────────────────
export function Markets({ onSelectSymbol }: { onSelectSymbol: (s: string) => void }) {
  const [activeSector,   setActiveSector]   = useState('all')
  const [viewMode,       setViewMode]       = useState<ViewMode>('sector')
  const [favSectors,     setFavSectors]     = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('favSectors') || '[]') } catch { return [] }
  })
  const [showPersonalize, setShowPersonalize] = useState(false)
  const [hiddenSectors,  setHiddenSectors]  = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('hiddenSectors') || '[]') } catch { return [] }
  })

  const { data = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey:        ['sectors'],
    queryFn:         getSectors,
    staleTime:       3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  // Persist préférences
  useEffect(() => { localStorage.setItem('favSectors', JSON.stringify(favSectors)) }, [favSectors])
  useEffect(() => { localStorage.setItem('hiddenSectors', JSON.stringify(hiddenSectors)) }, [hiddenSectors])

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  const allStocks   = data as SectorStock[]
  const gemStocks   = allStocks.filter(s => s.gem !== null)
  const withPrice   = allStocks.filter(s => s.price > 0)
  const gainers     = withPrice.filter(s => s.change_pct > 0).length
  const losers      = withPrice.filter(s => s.change_pct < 0).length

  // ── Filtrage ────────────────────────────────────────────────────────────
  const filtered = activeSector === 'all'  ? allStocks
                 : activeSector === 'gems' ? gemStocks
                 : allStocks.filter(s => s.sector === activeSector)

  // ── Groupement ─────────────────────────────────────────────────────────
  function groupBySector(stocks: SectorStock[]) {
    const map: Record<string, SectorStock[]> = {}
    stocks.forEach(s => { (map[s.sector] ??= []).push(s) })
    return map
  }

  function groupByMarket(stocks: SectorStock[]) {
    const map: Record<string, SectorStock[]> = {}
    stocks.forEach(s => { (map[s.index] ??= []).push(s) })
    return map
  }

  function toggleFav(id: string) {
    setFavSectors(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleHide(id: string) {
    setHiddenSectors(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Secteurs dans l'ordre : favoris d'abord, puis le reste
  const sectorEntries = Object.entries(groupBySector(filtered))
  const orderedSectors = [
    ...sectorEntries.filter(([k]) => favSectors.includes(k)),
    ...sectorEntries.filter(([k]) => !favSectors.includes(k) && !hiddenSectors.includes(k)),
  ]

  return (
    <div className="space-y-3">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="bg-dark-800 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-sm">Places de Marché</span>
              <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full">{withPrice.length} valeurs</span>
              {withPrice.length > 0 && <>
                <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full">▲ {gainers}</span>
                <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full">▼ {losers}</span>
                {gemStocks.length > 0 && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                    💎 {gemStocks.length} pépites
                  </span>
                )}
              </>}
            </div>
            {lastUpdate && <p className="text-xs text-slate-600 mt-1">Mis à jour {lastUpdate}</p>}
          </div>
          <div className="flex items-center gap-2">
            {/* Vue mode toggle */}
            <div className="flex bg-dark-700 rounded-lg p-0.5 text-xs">
              <button onClick={() => setViewMode('sector')}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${viewMode==='sector'?'bg-dark-600 text-white':'text-slate-500 hover:text-white'}`}>
                Secteur
              </button>
              <button onClick={() => setViewMode('market')}
                className={`px-2.5 py-1.5 rounded-md transition-colors ${viewMode==='market'?'bg-dark-600 text-white':'text-slate-500 hover:text-white'}`}>
                Marché
              </button>
            </div>
            <button onClick={() => setShowPersonalize(p => !p)}
              className={`p-2 rounded-lg text-slate-400 hover:text-white transition-colors ${showPersonalize ? 'bg-dark-600 text-white' : 'hover:bg-dark-700'}`}>
              <Settings size={13} />
            </button>
            <button onClick={() => refetch()} disabled={isLoading}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-dark-700 hover:bg-dark-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              {!isLoading && 'Actualiser'}
            </button>
          </div>
        </div>

        {/* ── Personnalisation ────────────────────────────────────────── */}
        {showPersonalize && (
          <div className="mt-3 pt-3 border-t border-dark-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">Personnaliser les secteurs</span>
              <button onClick={() => setShowPersonalize(false)} className="text-slate-600 hover:text-white">
                <X size={13}/>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SECTORS.filter(s => s.id !== 'all' && s.id !== 'gems').map(({ id, label, icon }) => {
                const isFav    = favSectors.includes(id)
                const isHidden = hiddenSectors.includes(id)
                return (
                  <div key={id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
                    isHidden ? 'border-dark-600 bg-dark-700/30 text-slate-600 line-through'
                    : isFav  ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'
                    : 'border-dark-600 bg-dark-700 text-slate-400'
                  }`}>
                    <span>{icon}</span>
                    <span>{label}</span>
                    <button onClick={() => toggleFav(id)} title="Mettre en favori"
                      className={`ml-1 transition-colors ${isFav ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}>
                      <Star size={10} fill={isFav ? 'currentColor' : 'none'}/>
                    </button>
                    <button onClick={() => toggleHide(id)} title="Masquer"
                      className={`transition-colors ${isHidden ? 'text-red-400' : 'text-slate-600 hover:text-red-400'}`}>
                      <X size={10}/>
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-slate-600 mt-2">⭐ Favori = affiché en premier · ✕ Masqué = caché par défaut</p>
          </div>
        )}
      </div>

      {/* ── Filtres secteur ──────────────────────────────────────────── */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-1.5 pb-1 min-w-max">
          {SECTORS.filter(s => s.id === 'all' || s.id === 'gems' || !hiddenSectors.includes(s.id)).map(({ id, label, icon }) => {
            const count = id === 'all'  ? allStocks.length
                        : id === 'gems' ? gemStocks.length
                        : allStocks.filter(s => s.sector === id).length
            if (count === 0 && id !== 'all' && id !== 'gems') return null
            return (
              <button key={id} onClick={() => setActiveSector(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  activeSector === id
                    ? id === 'gems' ? 'bg-yellow-500/25 text-yellow-300 border border-yellow-500/40'
                    : 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                    : 'bg-dark-800 text-slate-400 hover:text-white border border-dark-700'
                }`}>
                <span>{icon}</span>
                <span>{label}</span>
                <span className={`text-xs opacity-60 ${favSectors.includes(id) ? 'text-yellow-400' : ''}`}>
                  {count}
                </span>
                {favSectors.includes(id) && <Star size={9} fill="currentColor" className="text-yellow-400"/>}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Skeleton ─────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-40 bg-dark-800 rounded-xl animate-pulse"/>)}
        </div>
      )}

      {/* ── Contenu ──────────────────────────────────────────────────── */}
      {!isLoading && filtered.length === 0 && (
        <div className="bg-dark-800 rounded-xl p-8 text-center text-slate-500 text-sm">
          Aucune valeur dans ce filtre
        </div>
      )}

      {!isLoading && filtered.length > 0 && viewMode === 'sector' && (
        <div className="space-y-3">
          {orderedSectors.map(([sector, stocks]) => {
            const meta = SECTORS.find(s => s.id === sector)
            return (
              <GroupSection
                key={sector}
                title={sector}
                icon={meta?.icon ?? '📊'}
                stocks={stocks}
                onSelect={onSelectSymbol}
                defaultOpen={favSectors.includes(sector) || stocks.some(s => s.gem)}
              />
            )
          })}
        </div>
      )}

      {!isLoading && filtered.length > 0 && viewMode === 'market' && (
        <div className="space-y-3">
          {INDEX_ORDER.map(idx => {
            const stocks = filtered.filter(s => s.index === idx)
            if (!stocks.length) return null
            const flag = INDEX_META[idx]?.flag ?? '🌍'
            return (
              <GroupSection
                key={idx}
                title={idx}
                icon={flag}
                stocks={stocks}
                onSelect={onSelectSymbol}
                defaultOpen={true}
              />
            )
          })}
        </div>
      )}

      <p className="text-xs text-slate-700 text-center pb-2">
        Clic sur une ligne → graphique · 💎 pépite = signal technique favorable · données différées ~15 min
      </p>
    </div>
  )
}
