import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, TrendingUp, TrendingDown, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react'
import { getMarkets } from '../services/api'

interface MarketStock {
  symbol:     string
  name:       string
  index:      string
  country:    string
  price:      number
  change_pct: number
  volume:     number
  day_high:   number
  day_low:    number
  market_cap: number
}

type SortKey = 'name' | 'price' | 'change_pct' | 'volume'
type SortDir = 'asc' | 'desc'

const INDEX_ORDER = ['CAC 40', 'DAX', 'NASDAQ', 'S&P 500', 'FTSE 100', 'AEX']

const INDEX_META: Record<string, { flag: string; place: string }> = {
  'CAC 40':   { flag: '🇫🇷', place: 'Euronext Paris'    },
  'DAX':      { flag: '🇩🇪', place: 'XETRA Francfort'   },
  'NASDAQ':   { flag: '🇺🇸', place: 'NASDAQ New York'   },
  'S&P 500':  { flag: '🇺🇸', place: 'NYSE New York'     },
  'FTSE 100': { flag: '🇬🇧', place: 'London Stock Exch.'},
  'AEX':      { flag: '🇳🇱', place: 'Euronext Amsterdam'},
}

function fmtVolume(v: number): string {
  if (!v) return '—'
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'G'
  if (v >= 1_000_000)     return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)         return (v / 1_000).toFixed(0) + 'K'
  return v.toString()
}

function fmtCap(v: number): string {
  if (!v) return '—'
  if (v >= 1_000_000_000_000) return (v / 1_000_000_000_000).toFixed(1) + 'T€'
  if (v >= 1_000_000_000)     return (v / 1_000_000_000).toFixed(1) + 'Md€'
  if (v >= 1_000_000)         return (v / 1_000_000).toFixed(0) + 'M€'
  return '—'
}

function MarketSection({
  indexName, stocks, onSelect,
}: {
  indexName: string
  stocks:    MarketStock[]
  onSelect:  (s: string) => void
}) {
  const [open,    setOpen]    = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('change_pct')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const meta = INDEX_META[indexName] ?? { flag: '🌍', place: '' }

  const avgChange = stocks.length
    ? stocks.reduce((acc, s) => acc + s.change_pct, 0) / stocks.length
    : 0

  const sorted = [...stocks].sort((a, b) => {
    const va = a[sortKey] as number | string
    const vb = b[sortKey] as number | string
    if (typeof va === 'string' && typeof vb === 'string')
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc'
      ? (va as number) - (vb as number)
      : (vb as number) - (va as number)
  })

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    return (
      <button
        onClick={() => handleSort(k)}
        className={`flex items-center gap-0.5 hover:text-white transition-colors ${sortKey === k ? 'text-white' : 'text-slate-500'}`}
      >
        {label}
        {sortKey === k
          ? (sortDir === 'desc' ? <ChevronDown size={11}/> : <ChevronUp size={11}/>)
          : <ArrowUpDown size={10} className="opacity-40"/>
        }
      </button>
    )
  }

  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden">
      {/* Header section */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{meta.flag}</span>
          <div className="text-left">
            <div className="font-bold text-white text-sm">{indexName}</div>
            <div className="text-xs text-slate-500">{meta.place} · {stocks.length} valeurs</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-mono font-bold ${avgChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}% moy.
          </div>
          {open ? <ChevronUp size={15} className="text-slate-500"/> : <ChevronDown size={15} className="text-slate-500"/>}
        </div>
      </button>

      {/* Table */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-t border-dark-700 text-slate-500">
                <th className="px-4 py-2 text-left font-medium w-8">#</th>
                <th className="px-2 py-2 text-left font-medium">
                  <SortBtn k="name" label="Valeur" />
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <SortBtn k="price" label="Prix" />
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <SortBtn k="change_pct" label="Var. %" />
                </th>
                <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">Haut / Bas</th>
                <th className="px-2 py-2 text-right font-medium hidden md:table-cell">
                  <SortBtn k="volume" label="Volume" />
                </th>
                <th className="px-4 py-2 text-right font-medium hidden lg:table-cell">Cap.</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const up = s.change_pct >= 0
                return (
                  <tr
                    key={s.symbol}
                    onClick={() => onSelect(s.symbol)}
                    className="border-t border-dark-700/50 hover:bg-dark-700/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5 text-slate-600">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{s.symbol.replace(/\.[A-Z]+$/, '')}</span>
                        <span className="text-slate-400 truncate max-w-[140px]">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-white">
                      {s.price > 0 ? s.price.toFixed(2) : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <span className={`inline-flex items-center gap-0.5 font-mono font-bold px-1.5 py-0.5 rounded text-xs ${
                        up ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                        {up ? '+' : ''}{s.change_pct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-slate-500 hidden sm:table-cell">
                      {s.day_high > 0
                        ? <><span className="text-green-400/70">{s.day_high.toFixed(2)}</span> / <span className="text-red-400/70">{s.day_low.toFixed(2)}</span></>
                        : '—'
                      }
                    </td>
                    <td className="px-2 py-2.5 text-right font-mono text-slate-500 hidden md:table-cell">
                      {fmtVolume(s.volume)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500 hidden lg:table-cell">
                      {fmtCap(s.market_cap)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


export function Markets({ onSelectSymbol }: { onSelectSymbol: (s: string) => void }) {
  const { data = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey:       ['markets'],
    queryFn:        getMarkets,
    staleTime:      2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  // Groupe par index
  const grouped = INDEX_ORDER.reduce<Record<string, MarketStock[]>>((acc, idx) => {
    acc[idx] = data.filter((s: MarketStock) => s.index === idx)
    return acc
  }, {})

  // Stats globales
  const allWithPrice = data.filter((s: MarketStock) => s.price > 0)
  const gainers = allWithPrice.filter((s: MarketStock) => s.change_pct > 0).length
  const losers  = allWithPrice.filter((s: MarketStock) => s.change_pct < 0).length

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="bg-dark-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-white">Places de Marché</span>
            <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full">
              {allWithPrice.length} valeurs
            </span>
            {allWithPrice.length > 0 && (
              <>
                <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full">
                  ▲ {gainers} en hausse
                </span>
                <span className="text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full">
                  ▼ {losers} en baisse
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">
            CAC 40 · DAX · NASDAQ · S&P 500 · FTSE 100 · AEX
            {lastUpdate && <span className="ml-2 text-slate-600">· {lastUpdate}</span>}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-dark-700 hover:bg-dark-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-dark-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Sections par marché */}
      {!isLoading && INDEX_ORDER.map(idx => (
        grouped[idx]?.length > 0 && (
          <MarketSection
            key={idx}
            indexName={idx}
            stocks={grouped[idx]}
            onSelect={onSelectSymbol}
          />
        )
      ))}

      <p className="text-xs text-slate-700 text-center pb-2">
        Cliquez sur une valeur pour afficher son graphique · Données différées ~15 min
      </p>
    </div>
  )
}
