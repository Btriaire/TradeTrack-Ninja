import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { getQuote } from '../services/api'

interface Props {
  symbol: string
}

export function QuoteHeader({ symbol }: Props) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['quote', symbol],
    queryFn: () => getQuote(symbol),
    refetchInterval: 30000,
  })

  const up = data && data.change_pct >= 0

  return (
    <div className="bg-dark-800 rounded-xl px-5 py-4 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white font-mono">{symbol}</span>
          {data?.currency && (
            <span className="text-xs text-slate-500 bg-dark-700 px-2 py-0.5 rounded">
              {data.currency}
            </span>
          )}
        </div>
        {isLoading && <div className="h-8 w-32 bg-dark-700 rounded animate-pulse mt-1" />}
        {data && (
          <div className="flex items-end gap-3 mt-1">
            <span className="text-3xl font-bold font-mono text-white">
              {data.price?.toFixed(2)}
            </span>
            <div className={`flex items-center gap-1 text-sm font-semibold pb-0.5 ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
              {up ? '+' : ''}{data.change?.toFixed(2)} ({up ? '+' : ''}{data.change_pct?.toFixed(2)}%)
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
        {data?.market_cap && (
          <span>Cap. {(data.market_cap / 1e9).toFixed(1)} Mrd €</span>
        )}
        {data?.prev_close && (
          <span>Clôture préc. {data.prev_close.toFixed(2)}</span>
        )}
        <button
          onClick={() => refetch()}
          className="text-slate-600 hover:text-white transition-colors mt-1"
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
