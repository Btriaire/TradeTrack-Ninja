import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X, TrendingUp, TrendingDown } from 'lucide-react'
import { getQuote } from '../services/api'
import type { WatchlistItem } from '../types'

interface Props {
  selected: string
  onSelect: (symbol: string) => void
  items: WatchlistItem[]
  onAdd: (item: WatchlistItem) => void
  onRemove: (symbol: string) => void
}

function WatchlistRow({ item, selected, onSelect, onRemove }: {
  item: WatchlistItem
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const { data } = useQuery({
    queryKey: ['quote', item.symbol],
    queryFn: () => getQuote(item.symbol),
    refetchInterval: 30000,
  })

  const up = data && data.change_pct >= 0

  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        selected ? 'bg-dark-600 border border-accent-blue/30' : 'hover:bg-dark-700'
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white truncate">{item.name}</div>
        <div className="text-xs text-slate-500">{item.symbol}</div>
      </div>
      <div className="flex items-center gap-2 ml-2">
        {data ? (
          <div className="text-right">
            <div className="text-sm font-mono text-white">{data.price?.toFixed(2)}</div>
            <div className={`text-xs font-mono ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{data.change_pct?.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-600">…</div>
        )}
        {up !== undefined && (
          up ? <TrendingUp size={14} className="text-green-400" />
             : <TrendingDown size={14} className="text-red-400" />
        )}
        <button
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="text-slate-600 hover:text-red-400 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

export function Watchlist({ selected, onSelect, items, onAdd, onRemove }: Props) {
  const [input, setInput] = useState('')

  const add = () => {
    const sym = input.trim().toUpperCase()
    if (!sym || items.find(i => i.symbol === sym)) return
    onAdd({ symbol: sym, name: sym })
    setInput('')
  }

  return (
    <div className="bg-dark-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
        Watchlist
      </div>

      <div className="flex gap-1 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Ex: SAN.PA"
          className="flex-1 bg-dark-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none border border-dark-500 focus:border-accent-blue/50 placeholder:text-slate-600"
        />
        <button
          onClick={add}
          className="bg-accent-blue hover:bg-blue-600 text-white rounded-lg px-2 py-1.5 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {items.map(item => (
          <WatchlistRow
            key={item.symbol}
            item={item}
            selected={selected === item.symbol}
            onSelect={() => onSelect(item.symbol)}
            onRemove={() => onRemove(item.symbol)}
          />
        ))}
      </div>
    </div>
  )
}
