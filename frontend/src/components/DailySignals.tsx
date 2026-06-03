import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, RefreshCw, Plus, Zap,
  Clock, Target, BarChart2, BookmarkPlus,
} from 'lucide-react'
import { getSignals, refreshSignals } from '../services/api'
import type { WatchlistItem, PortfolioPosition } from '../types'

interface SignalCard {
  symbol:        string
  name:          string
  index:         string
  country:       string
  price:         number
  change_pct:    number
  score:         number
  rsi:           number
  tags:          string[]
  potential_pct: number
  horizon:       string
  signal:        string
  reason:        string
}

interface Props {
  onSelectSymbol:   (s: string) => void
  onAddWatchlist:   (item: WatchlistItem) => void
  onAddPortfolio:   (item: Omit<PortfolioPosition, 'id'>) => void
  watchlistSymbols: string[]
}

function SignalCardUI({
  s, type, onSelectSymbol, onAddWatchlist, onAddPortfolio, inWatchlist,
}: {
  s: SignalCard
  type: 'buy' | 'sell'
  onSelectSymbol: (sym: string) => void
  onAddWatchlist: (item: WatchlistItem) => void
  onAddPortfolio: (item: Omit<PortfolioPosition, 'id'>) => void
  inWatchlist: boolean
}) {
  const isBuy     = type === 'buy'
  const up        = s.change_pct >= 0
  const colorMain = isBuy ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
  const colorBadge= isBuy ? 'text-green-400' : 'text-red-400'
  const potColor  = s.potential_pct >= 0 ? 'text-green-400' : 'text-red-400'

  return (
    <div className={`rounded-xl border p-3.5 flex flex-col gap-2 hover:brightness-110 transition-all cursor-pointer ${colorMain}`}
      onClick={() => onSelectSymbol(s.symbol)}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs">{s.country}</span>
            <span className="font-bold text-white text-sm font-mono">{s.symbol}</span>
            <span className="text-xs bg-dark-600 text-slate-500 px-1.5 py-0.5 rounded">{s.index}</span>
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">{s.name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-mono font-bold text-white">{s.price.toFixed(2)} €</div>
          <div className={`text-xs font-mono ${up ? 'text-green-400' : 'text-red-400'}`}>
            {up ? '+' : ''}{s.change_pct?.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Tags */}
      {s.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {s.tags.map(t => (
            <span key={t} className={`text-xs px-2 py-0.5 rounded-full bg-dark-700 ${colorBadge}`}>{t}</span>
          ))}
        </div>
      )}

      {/* Raison IA */}
      {s.reason && (
        <p className="text-xs text-slate-300 leading-relaxed italic">"{s.reason}"</p>
      )}

      {/* Métriques */}
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div className="bg-dark-700/60 rounded-lg px-2 py-1.5 text-center">
          <div className="text-slate-500 mb-0.5 flex items-center justify-center gap-1"><BarChart2 size={9}/> RSI</div>
          <div className={`font-mono font-bold ${s.rsi < 40 ? 'text-green-400' : s.rsi > 60 ? 'text-red-400' : 'text-white'}`}>
            {s.rsi.toFixed(0)}
          </div>
        </div>
        <div className="bg-dark-700/60 rounded-lg px-2 py-1.5 text-center">
          <div className="text-slate-500 mb-0.5 flex items-center justify-center gap-1"><Target size={9}/> Potentiel</div>
          <div className={`font-mono font-bold ${potColor}`}>
            {s.potential_pct > 0 ? '+' : ''}{s.potential_pct}%
          </div>
        </div>
        <div className="bg-dark-700/60 rounded-lg px-2 py-1.5 text-center">
          <div className="text-slate-500 mb-0.5 flex items-center justify-center gap-1"><Clock size={9}/> Horizon</div>
          <div className="font-mono text-white text-xs">{s.horizon}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 mt-0.5" onClick={e => e.stopPropagation()}>
        {!inWatchlist && (
          <button
            onClick={() => onAddWatchlist({ symbol: s.symbol, name: s.name })}
            className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-400 hover:text-white transition-colors"
          >
            <Plus size={11} /> Watchlist
          </button>
        )}
        <button
          onClick={() => onAddPortfolio({
            symbol: s.symbol, name: s.name,
            quantity: 1, buy_price: s.price,
            buy_date: new Date().toISOString().split('T')[0],
          })}
          className={`flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg transition-colors ${
            isBuy
              ? 'bg-green-500/15 hover:bg-green-500/25 text-green-400'
              : 'bg-red-500/15 hover:bg-red-500/25 text-red-400'
          }`}
        >
          <BookmarkPlus size={11} /> Portfolio
        </button>
      </div>
    </div>
  )
}


export function DailySignals({ onSelectSymbol, onAddWatchlist, onAddPortfolio, watchlistSymbols }: Props) {
  const queryClient = useQueryClient()

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey:       ['signals'],
    queryFn:        getSignals,
    staleTime:      5 * 60 * 1000,   // considéré frais 5 min
    refetchInterval: 10 * 60 * 1000, // refresh toutes les 10 min
  })

  const refresh = useMutation({
    mutationFn: refreshSignals,
    onSuccess: () => {
      // Relancer le fetch après 60s (temps de calcul)
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['signals'] }), 60000)
    },
  })

  const great = data?.great_catch ?? []
  const away  = data?.stay_away   ?? []
  const isGenerating = data?.generating || false

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-dark-800 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-yellow-400" />
              <span className="text-sm font-bold text-white">Signaux du Jour</span>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                {data?.universe_size ?? '—'} valeurs analysées
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Scoring technique (RSI · MACD · Bollinger) + analyse IA · horizon 2-10 jours
              {lastUpdate && <span className="ml-2 text-slate-600">· mis à jour {lastUpdate}</span>}
            </p>
          </div>
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending || isGenerating}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-dark-700 hover:bg-dark-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={refresh.isPending ? 'animate-spin' : ''} />
            {refresh.isPending ? 'Calcul…' : 'Rafraîchir'}
          </button>
        </div>

        {refresh.isPending && (
          <div className="mt-3 text-xs text-slate-600 bg-dark-700 rounded-lg px-3 py-2">
            ⏳ Analyse de {data?.universe_size ?? 40} valeurs en cours… (~60 secondes)
          </div>
        )}
      </div>

      {/* Skeleton loading */}
      {isLoading && (
        <div className="grid md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-52 bg-dark-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Résultats */}
      {!isLoading && (
        <div className="grid md:grid-cols-2 gap-4">

          {/* Great Catch */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-green-400" />
              <span className="text-sm font-bold text-green-400">Great Catch</span>
              <span className="text-xs text-slate-600">({great.length})</span>
            </div>
            {great.length === 0 ? (
              <div className="bg-dark-800 rounded-xl p-6 text-center text-slate-600 text-sm">
                Aucune opportunité détectée actuellement
              </div>
            ) : (
              great.map((s: SignalCard) => (
                <SignalCardUI
                  key={s.symbol} s={s} type="buy"
                  onSelectSymbol={onSelectSymbol}
                  onAddWatchlist={onAddWatchlist}
                  onAddPortfolio={onAddPortfolio}
                  inWatchlist={watchlistSymbols.includes(s.symbol)}
                />
              ))
            )}
          </div>

          {/* Stay Away */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown size={14} className="text-red-400" />
              <span className="text-sm font-bold text-red-400">Stay Away</span>
              <span className="text-xs text-slate-600">({away.length})</span>
            </div>
            {away.length === 0 ? (
              <div className="bg-dark-800 rounded-xl p-6 text-center text-slate-600 text-sm">
                Aucun signal de vente détecté actuellement
              </div>
            ) : (
              away.map((s: SignalCard) => (
                <SignalCardUI
                  key={s.symbol} s={s} type="sell"
                  onSelectSymbol={onSelectSymbol}
                  onAddWatchlist={onAddWatchlist}
                  onAddPortfolio={onAddPortfolio}
                  inWatchlist={watchlistSymbols.includes(s.symbol)}
                />
              ))
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-700 text-center pb-2">
        ⚠️ Signaux basés sur l'analyse technique uniquement — pas des conseils en investissement.
      </p>
    </div>
  )
}
