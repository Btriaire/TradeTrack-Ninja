import { useQuery } from '@tanstack/react-query'
import { Trash2, TrendingUp, TrendingDown, PieChart, Plus } from 'lucide-react'
import { getQuote } from '../services/api'
import type { PortfolioPosition } from '../types'

interface PositionRowProps {
  pos:      PortfolioPosition
  onRemove: (id: string) => void
  onSelect: (symbol: string) => void
}

function PositionRow({ pos, onRemove, onSelect }: PositionRowProps) {
  const { data: quote } = useQuery({
    queryKey: ['quote', pos.symbol],
    queryFn:  () => getQuote(pos.symbol),
    refetchInterval: 30000,
  })

  const currentPrice  = quote?.price ?? pos.buy_price
  const currentValue  = currentPrice * pos.quantity
  const investedValue = pos.buy_price * pos.quantity
  const pnl           = currentValue - investedValue
  const pnlPct        = investedValue > 0 ? (pnl / investedValue) * 100 : 0
  const up            = pnl >= 0

  return (
    <div
      onClick={() => onSelect(pos.symbol)}
      className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 border-b border-dark-700/60 hover:bg-dark-700/40 cursor-pointer transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white font-mono">{pos.symbol}</span>
          <span className="text-xs text-slate-500 truncate">{pos.name}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
          <span>{pos.quantity} × {pos.buy_price.toFixed(2)} €</span>
          {quote && (
            <span className="text-slate-400">
              actuel : <span className="text-white font-mono">{currentPrice.toFixed(2)} €</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm font-mono font-bold text-white">
          {currentValue.toFixed(0)} €
        </span>
        <div className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {up ? '+' : ''}{pnl.toFixed(0)} € ({up ? '+' : ''}{pnlPct.toFixed(2)}%)
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRemove(pos.id) }}
          className="text-slate-700 hover:text-red-400 transition-colors mt-0.5"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}


interface Props {
  positions:    PortfolioPosition[]
  onRemove:     (id: string) => void
  onSelect:     (symbol: string) => void
  onOpenSearch: () => void
  user:         any
}

export function Portfolio({ positions, onRemove, onSelect, onOpenSearch, user }: Props) {
  // Calcul global (valeur totale + P&L total)
  const { data: quotes } = useQuery({
    queryKey: ['portfolio-quotes', positions.map(p => p.symbol).join(',')],
    queryFn: async () => {
      const results: Record<string, number> = {}
      await Promise.all(positions.map(async p => {
        try {
          const q = await getQuote(p.symbol)
          if (q.price) results[p.symbol] = q.price
        } catch {}
      }))
      return results
    },
    enabled:  positions.length > 0,
    refetchInterval: 60000,
  })

  const totalInvested = positions.reduce((s, p) => s + p.buy_price * p.quantity, 0)
  const totalCurrent  = positions.reduce((s, p) => {
    const price = quotes?.[p.symbol] ?? p.buy_price
    return s + price * p.quantity
  }, 0)
  const totalPnl    = totalCurrent - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const up          = totalPnl >= 0

  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart size={15} className="text-accent-blue" />
          <span className="text-sm font-semibold text-white">Mon Portfolio</span>
          {positions.length > 0 && (
            <span className="text-xs bg-dark-600 text-slate-400 px-2 py-0.5 rounded-full">
              {positions.length} ligne{positions.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1 text-xs bg-accent-blue/20 hover:bg-accent-blue/30 text-accent-blue px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {/* Résumé global */}
      {positions.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-dark-700 border-b border-dark-700">
          <div className="px-4 py-3 text-center">
            <div className="text-xs text-slate-500 mb-0.5">Investi</div>
            <div className="text-sm font-mono font-bold text-white">{totalInvested.toFixed(0)} €</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-xs text-slate-500 mb-0.5">Valeur actuelle</div>
            <div className="text-sm font-mono font-bold text-white">{totalCurrent.toFixed(0)} €</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-xs text-slate-500 mb-0.5">P&amp;L</div>
            <div className={`text-sm font-mono font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{totalPnl.toFixed(0)} €
              <span className="text-xs ml-1">({up ? '+' : ''}{totalPnlPct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* Liste des positions */}
      {positions.length === 0 ? (
        <div className="py-12 text-center text-slate-600">
          <PieChart size={28} className="mx-auto mb-2 opacity-20" />
          <div className="text-sm">Portfolio vide</div>
          {!user ? (
            <div className="text-xs mt-1">Connectez-vous pour sauvegarder votre portfolio</div>
          ) : (
            <button
              onClick={onOpenSearch}
              className="mt-3 text-xs text-accent-blue hover:underline"
            >
              + Rechercher une action
            </button>
          )}
        </div>
      ) : (
        <div>
          {positions.map(pos => (
            <PositionRow
              key={pos.id}
              pos={pos}
              onRemove={onRemove}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
