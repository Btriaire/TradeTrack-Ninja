import { useQuery } from '@tanstack/react-query'
import { getIndices } from '../services/api'
import type { MarketIndex } from '../types'

function IndexChip({ idx }: { idx: MarketIndex }) {
  const up = idx.change_pct >= 0
  return (
    <div className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors cursor-default">
      <span className="text-xs text-slate-400 font-medium whitespace-nowrap">{idx.name}</span>
      <span className="text-xs font-mono text-white">{idx.price?.toLocaleString('fr-FR')}</span>
      <span className={`text-xs font-mono font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
        {up ? '+' : ''}{idx.change_pct?.toFixed(2)}%
      </span>
    </div>
  )
}

export function IndicesBar() {
  const { data: indices = [], isLoading } = useQuery({
    queryKey: ['indices'],
    queryFn:  getIndices,
    refetchInterval: 60000,  // refresh toutes les minutes
    staleTime: 30000,
  })

  if (isLoading) {
    return (
      <div className="border-b border-dark-700 px-4 py-2 flex gap-2 overflow-hidden">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-7 w-32 bg-dark-800 rounded-lg animate-pulse shrink-0" />
        ))}
      </div>
    )
  }

  if (!indices.length) return null

  return (
    <div className="border-b border-dark-700 px-3 py-2 overflow-x-auto scrollbar-none">
      <div className="flex gap-2 w-max">
        {indices.map(idx => <IndexChip key={idx.symbol} idx={idx} />)}
      </div>
    </div>
  )
}
