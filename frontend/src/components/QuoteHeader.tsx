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
    <div className="bg-dark-800 rounded-xl px-4 md:px-5 py-3 md:py-4 flex items-center justify-between gap-2">
      <div className="min-w-0">
        {/* Symbol + currency */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg md:text-xl font-bold text-white font-mono truncate">{symbol}</span>
          {data?.currency && (
            <span className="text-xs text-slate-500 bg-dark-700 px-2 py-0.5 rounded shrink-0">
              {data.currency}
            </span>
          )}
        </div>

        {/* Price skeleton */}
        {isLoading && <div className="h-8 w-28 bg-dark-700 rounded animate-pulse mt-1" />}

        {/* Price + change */}
        {data && (
          <div className="flex items-end gap-2 mt-0.5 flex-wrap">
            <span className="text-2xl md:text-3xl font-bold font-mono text-white leading-none">
              {data.price?.toFixed(2)}
            </span>
            <div className={`flex items-center gap-1 text-sm font-semibold pb-0.5 ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {up ? '+' : ''}{data.change?.toFixed(2)}
              <span className="hidden sm:inline">({up ? '+' : ''}{data.change_pct?.toFixed(2)}%)</span>
              <span className="sm:hidden">{up ? '+' : ''}{data.change_pct?.toFixed(2)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Meta info — right side */}
      <div className="flex flex-col items-end gap-1 text-xs text-slate-500 shrink-0">
        {data?.market_cap && (
          <span className="hidden sm:block">Cap. {(data.market_cap / 1e9).toFixed(1)} Mrd €</span>
        )}
        {data?.prev_close && (
          <span>Clôt. {data.prev_close.toFixed(2)}</span>
        )}
        <button
          onClick={() => refetch()}
          className="text-slate-600 hover:text-white transition-colors mt-1"
          aria-label="Rafraîchir"
        >
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
