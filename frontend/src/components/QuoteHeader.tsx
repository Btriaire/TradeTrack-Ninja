import { useRef } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, Wifi } from 'lucide-react'
import { useRealtime, type MarketState } from '../hooks/useRealtime'

interface Props {
  symbol:    string
  isMobile?: boolean
}

// ── Badge état du marché ───────────────────────────────────────────────────
function MarketBadge({ state, isPolling }: { state: MarketState; isPolling: boolean }) {
  const cfg: Record<string, { label: string; dot: string; text: string; bg: string }> = {
    REGULAR:  { label: 'OUVERT',       dot: 'bg-green-400 animate-ping',  text: 'text-green-400', bg: 'bg-green-500/10 border-green-500/25' },
    PRE:      { label: 'PRÉ-MARCHÉ',   dot: 'bg-amber-400',               text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
    PREPRE:   { label: 'PRÉ-MARCHÉ',   dot: 'bg-amber-400',               text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25' },
    POST:     { label: 'APRÈS-MARCHÉ', dot: 'bg-blue-400',                text: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/25'   },
    POSTPOST: { label: 'APRÈS-MARCHÉ', dot: 'bg-blue-400',                text: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/25'   },
    CLOSED:   { label: 'FERMÉ',        dot: 'bg-slate-500',               text: 'text-slate-500', bg: 'bg-slate-700/30 border-slate-600/20' },
  }
  const c = cfg[state] ?? cfg.CLOSED
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold ${c.bg} ${c.text}`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${c.dot}`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${c.dot.replace(' animate-ping', '')}`} />
      </span>
      {c.label}
      {isPolling && state === 'REGULAR' && (
        <Wifi size={8} className="opacity-60" />
      )}
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────
export function QuoteHeader({ symbol, isMobile = false }: Props) {
  const { live, flash, isPolling } = useRealtime(symbol)

  const up = live ? (live.change_pct ?? 0) >= 0 : true

  // Couleurs flash selon direction du changement de prix
  const flashStyle: React.CSSProperties = flash === 'up'
    ? { boxShadow: '0 0 0 2px rgba(16,185,129,0.35)', transition: 'box-shadow 0.6s ease' }
    : flash === 'down'
    ? { boxShadow: '0 0 0 2px rgba(239,68,68,0.35)',  transition: 'box-shadow 0.6s ease' }
    : { boxShadow: '0 0 0 0px transparent',           transition: 'box-shadow 0.6s ease' }

  // Couleur du prix selon direction du flash
  const priceColor = flash === 'up'   ? 'text-green-300'
                   : flash === 'down' ? 'text-red-300'
                   : 'text-white'

  return (
    <div
      className={`bg-dark-800 rounded-xl flex items-center justify-between gap-2 ${
        isMobile ? 'px-4 py-3' : 'px-5 py-4'
      }`}
      style={flashStyle}
    >
      <div className="min-w-0 flex-1">
        {/* Ligne 1 : symbole + devise + badge marché */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-bold font-mono ${isMobile ? 'text-lg' : 'text-xl'} ${
            live ? 'text-white' : 'text-slate-400'
          }`}>
            {symbol}
          </span>
          {live?.currency && (
            <span className="text-xs text-slate-500 bg-dark-700 px-2 py-0.5 rounded shrink-0">
              {live.currency}
            </span>
          )}
          {live?.market_state && (
            <MarketBadge state={live.market_state} isPolling={isPolling} />
          )}
          {/* Label délai */}
          {live && !live.is_open && (
            <span className="text-[10px] text-slate-600 font-mono hidden sm:block">~15min delay</span>
          )}
        </div>

        {/* Skeleton loading */}
        {!live && (
          <div className="h-8 w-32 bg-dark-700 rounded animate-pulse mt-1" />
        )}

        {/* Prix + variation */}
        {live?.price != null && (
          <div className="flex items-end gap-2 mt-0.5 flex-wrap">
            <span
              className={`font-bold font-mono leading-none transition-colors duration-300 ${
                isMobile ? 'text-2xl' : 'text-3xl'
              } ${priceColor}`}
            >
              {live.price.toFixed(2)}
            </span>
            <div className={`flex items-center gap-1 font-semibold pb-0.5 text-sm ${
              up ? 'text-green-400' : 'text-red-400'
            }`}>
              {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {live.change != null && (
                <span>{up ? '+' : ''}{live.change.toFixed(2)}</span>
              )}
              {live.change_pct != null && (
                <span className="text-xs opacity-80">
                  ({up ? '+' : ''}{live.change_pct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Infos droite */}
      <div className="flex flex-col items-end gap-1 text-xs text-slate-500 shrink-0">
        {!isMobile && live?.high && live?.low && (
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-green-600">H {live.high.toFixed(2)}</span>
            <span className="text-slate-700">·</span>
            <span className="text-red-600">B {live.low.toFixed(2)}</span>
          </div>
        )}
        {live?.volume && (
          <span className="text-[11px]">
            Vol {(live.volume / 1000).toFixed(0)}K
          </span>
        )}

        {/* Indicateur polling live */}
        <div className="flex items-center gap-1 mt-0.5">
          {live?.is_open ? (
            <span className="text-[10px] text-green-600/70 font-mono">
              {isPolling ? '↻ live' : '● 8s'}
            </span>
          ) : (
            <RefreshCw
              size={11}
              className={`text-slate-600 ${isPolling ? 'animate-spin' : ''}`}
            />
          )}
        </div>
      </div>
    </div>
  )
}
