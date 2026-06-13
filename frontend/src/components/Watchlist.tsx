import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, TrendingUp, TrendingDown, Briefcase, Eye } from 'lucide-react'
import { getQuote } from '../services/api'
import { isPeaEligible } from '../utils/lcl-fees'
import type { WatchlistItem, PortfolioPosition } from '../types'

interface Props {
  selected:   string
  onSelect:   (symbol: string) => void
  items:      WatchlistItem[]
  onAdd:      (item: WatchlistItem) => void
  onRemove:   (symbol: string) => void
  positions:  PortfolioPosition[]
}

/* ─── Ligne générique (watchlist ou portfolio) ──────────────────────────── */
function QuoteRow({
  symbol, name, selected, onSelect, onRemove,
  extraBadge,
}: {
  symbol:     string
  name:       string
  selected:   boolean
  onSelect:   () => void
  onRemove?:  () => void
  extraBadge?: React.ReactNode
}) {
  const { data } = useQuery({
    queryKey: ['quote', symbol],
    queryFn:  () => getQuote(symbol),
    refetchInterval: 30000,
  })

  const up = data && data.change_pct >= 0

  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
        selected ? 'bg-dark-600 border border-accent-blue/30' : 'hover:bg-dark-700'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white truncate leading-tight">{name}</div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-500 font-mono">{symbol}</span>
          {isPeaEligible(symbol) && (
            <span className="text-[8px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1 py-0.5 rounded font-mono tracking-wide leading-none">PEA</span>
          )}
          {extraBadge}
        </div>
      </div>

      <div className="flex items-center gap-1.5 ml-2 shrink-0">
        {data ? (
          <div className="text-right">
            <div className="text-sm font-mono text-white tabular-nums">{data.price?.toFixed(2)}</div>
            <div className={`text-xs font-mono tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{data.change_pct?.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-600">…</div>
        )}
        {data && (
          up
            ? <TrendingUp  size={13} className="text-green-400" />
            : <TrendingDown size={13} className="text-red-400"  />
        )}
        {onRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ─── Section header ────────────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, label, count, color }: {
  icon:  React.ElementType
  label: string
  count: number
  color: string
}) {
  return (
    <div className={`flex items-center gap-1.5 px-1 mb-1`}>
      <Icon size={11} className={color} />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${color}`}>{label}</span>
      {count > 0 && (
        <span className="text-[9px] font-mono text-slate-600 ml-auto">{count}</span>
      )}
    </div>
  )
}

/* ─── Composant principal ───────────────────────────────────────────────── */
export function Watchlist({ selected, onSelect, items, onAdd, onRemove, positions }: Props) {
  const [input,    setInput]    = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const add = () => {
    const sym = input.trim().toUpperCase()
    if (!sym) return

    // Feedback si déjà présent
    if (items.find(i => i.symbol === sym)) {
      setAddError('Déjà dans la watchlist')
      setTimeout(() => setAddError(null), 2500)
      return
    }
    if (positions.some(p => p.symbol === sym)) {
      setAddError('Déjà en portefeuille')
      setTimeout(() => setAddError(null), 2500)
      return
    }

    onAdd({ symbol: sym, name: sym })
    setInput('')
    setAddError(null)
  }

  // Dédupliquer : ne pas afficher dans watchlist ce qui est déjà en portfolio
  const portfolioSymbols = new Set(positions.map(p => p.symbol))
  const watchlistOnly    = items.filter(i => !portfolioSymbols.has(i.symbol))

  // Regrouper les positions par symbole (somme quantités)
  const portfolioBySymbol = positions.reduce<Record<string, { symbol: string; name: string; qty: number }>>((acc, p) => {
    if (acc[p.symbol]) {
      acc[p.symbol].qty += p.quantity
    } else {
      acc[p.symbol] = { symbol: p.symbol, name: p.name, qty: p.quantity }
    }
    return acc
  }, {})
  const portfolioRows = Object.values(portfolioBySymbol)

  return (
    <div className="flex flex-col gap-0">

      {/* ── Section Portfolio ───────────────────────────────────────── */}
      {portfolioRows.length > 0 && (
        <div className="mb-3">
          <SectionHeader icon={Briefcase} label="Portfolio" count={portfolioRows.length} color="text-emerald-500" />
          <div className="flex flex-col gap-0.5">
            {portfolioRows.map(p => (
              <QuoteRow
                key={p.symbol}
                symbol={p.symbol}
                name={p.name}
                selected={selected === p.symbol}
                onSelect={() => onSelect(p.symbol)}
                extraBadge={
                  <span className="text-[9px] font-mono text-emerald-700 bg-emerald-950/60 px-1 py-0.5 rounded">
                    ×{p.qty % 1 === 0 ? p.qty : p.qty.toFixed(3)}
                  </span>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Séparateur */}
      {portfolioRows.length > 0 && (
        <div className="border-t border-dark-700/70 mb-3" />
      )}

      {/* ── Section Valeurs suivies ──────────────────────────────────── */}
      <div>
        <SectionHeader icon={Eye} label="Valeurs suivies" count={watchlistOnly.length} color="text-slate-400" />

        {/* Input ajout */}
        <div className="mb-2">
          <div className="flex gap-1">
            <input
              value={input}
              onChange={e => { setInput(e.target.value); setAddError(null) }}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="Ex: SAN.PA"
              className={`flex-1 bg-dark-700 text-white text-xs rounded-lg px-3 py-1.5 outline-none border transition-colors placeholder:text-slate-600 ${
                addError
                  ? 'border-amber-500/60 focus:border-amber-500'
                  : 'border-dark-600 focus:border-accent-blue/50'
              }`}
            />
            <button
              onClick={add}
              className="bg-accent-blue hover:bg-blue-600 text-white rounded-lg px-2 py-1.5 transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          {addError && (
            <p className="text-[10px] text-amber-400/80 font-mono mt-1 px-1 animate-fade-in">
              ⚠ {addError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          {watchlistOnly.length === 0 && (
            <div className="text-[11px] text-slate-600 text-center py-3">
              Aucune valeur suivie
            </div>
          )}
          {watchlistOnly.map(item => (
            <QuoteRow
              key={item.symbol}
              symbol={item.symbol}
              name={item.name}
              selected={selected === item.symbol}
              onSelect={() => onSelect(item.symbol)}
              onRemove={() => onRemove(item.symbol)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
