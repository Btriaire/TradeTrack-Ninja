import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import { getQuote } from '../services/api'

interface Props {
  symbol:   string
  isMobile?: boolean
}

export function QuoteHeader({ symbol, isMobile = false }: Props) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['quote', symbol],
    queryFn:  () => getQuote(symbol),
    refetchInterval: 30000,
  })

  const up = data && data.change_pct >= 0

  return (
    <div className={`bg-dark-800 rounded-xl flex items-center justify-between gap-2 ${
      isMobile ? 'px-4 py-3' : 'px-5 py-4'
    }`}>
      <div className="min-w-0">
        {/* Symbole + devise */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-bold text-white font-mono ${isMobile ? 'text-lg' : 'text-xl'}`}>
            {symbol}
          </span>
          {data?.currency && (
            <span className="text-xs text-slate-500 bg-dark-700 px-2 py-0.5 rounded shrink-0">
              {data.currency}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="h-8 w-28 bg-dark-700 rounded animate-pulse mt-1" />
        )}

        {data && (
          <div className="flex items-end gap-2 mt-0.5 flex-wrap">
            <span className={`font-bold font-mono text-white leading-none ${
              isMobile ? 'text-2xl' : 'text-3xl'
            }`}>
              {data.price?.toFixed(2)}
            </span>
            <div className={`flex items-center gap-1 font-semibold pb-0.5 text-sm ${
              up ? 'text-green-400' : 'text-red-400'
            }`}>
              {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {up ? '+' : ''}{data.change?.toFixed(2)}
              {!isMobile && (
                <span className="text-xs opacity-80">
                  ({up ? '+' : ''}{data.change_pct?.toFixed(2)}%)
                </span>
              )}
              {isMobile && (
                <span className="text-xs">
                  {up ? '+' : ''}{data.change_pct?.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Infos droite */}
      <div className="flex flex-col items-end gap-1 text-xs text-slate-500 shrink-0">
        {!isMobile && data?.market_cap && (
          <span>Cap. {(data.market_cap / 1e9).toFixed(1)} Mrd €</span>
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
