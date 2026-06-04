import { useRef } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, Wifi, Briefcase } from 'lucide-react'
import { useRealtime, type MarketState } from '../hooks/useRealtime'
import { isPeaEligible } from '../utils/lcl-fees'
import type { PortfolioPosition } from '../types'

interface Props {
  symbol:     string
  isMobile?:  boolean
  positions?: PortfolioPosition[]
}

// ── Badge état du marché ────────────────────────────────────────────────────
function MarketBadge({ state, isPolling }: { state: MarketState; isPolling: boolean }) {
  const cfg: Record<string, { label: string; dot: string; text: string; bg: string }> = {
    REGULAR:  { label: 'OUVERT',       dot: 'bg-green-400 animate-ping',  text: 'text-green-400', bg: 'bg-green-500/10 border-green-500/25'  },
    PRE:      { label: 'PRÉ-MARCHÉ',   dot: 'bg-amber-400',               text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25'  },
    PREPRE:   { label: 'PRÉ-MARCHÉ',   dot: 'bg-amber-400',               text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/25'  },
    POST:     { label: 'APRÈS-MARCHÉ', dot: 'bg-blue-400',                text: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/25'    },
    POSTPOST: { label: 'APRÈS-MARCHÉ', dot: 'bg-blue-400',                text: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/25'    },
    CLOSED:   { label: 'FERMÉ',        dot: 'bg-slate-500',               text: 'text-slate-500', bg: 'bg-slate-700/30 border-slate-600/20'  },
  }
  const c = cfg[state] ?? cfg.CLOSED
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono font-bold ${c.bg} ${c.text}`}>
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${c.dot}`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${c.dot.replace(' animate-ping', '')}`} />
      </span>
      {c.label}
      {isPolling && state === 'REGULAR' && <Wifi size={8} className="opacity-60" />}
    </div>
  )
}

// ── Badge P&L portfolio ────────────────────────────────────────────────────
function PortfolioPnlBadge({
  positions, symbol, livePrice,
}: {
  positions: PortfolioPosition[]; symbol: string; livePrice: number | null | undefined
}) {
  // Agréger toutes les lignes pour ce symbole
  const lots = positions.filter(p => p.symbol === symbol)
  if (!lots.length || !livePrice) return null

  const totalQty      = lots.reduce((s, p) => s + p.quantity, 0)
  const totalCost     = lots.reduce((s, p) => s + p.buy_price * p.quantity + (p.fees ?? 0), 0)
  const currentValue  = livePrice * totalQty
  const pnl           = currentValue - totalCost
  const pnlPct        = totalCost > 0 ? (pnl / totalCost) * 100 : 0
  const up            = pnl >= 0

  const fmtEur = (v: number) =>
    Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
  const fmtPct = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) + ' %'

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border mt-2
        ${up
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : 'bg-red-500/10 border-red-500/20'
        }`}
    >
      {/* Icône portefeuille */}
      <Briefcase size={14} className={up ? 'text-emerald-400 shrink-0' : 'text-red-400 shrink-0'} />

      {/* Label */}
      <div className="flex flex-col leading-none">
        <span className={`text-[9px] font-bold uppercase tracking-widest ${up ? 'text-emerald-600' : 'text-red-600'}`}>
          En portefeuille · {totalQty} action{totalQty > 1 ? 's' : ''}
        </span>
        <span className={`text-[10px] font-mono text-slate-500 mt-0.5`}>
          coût {totalCost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
        </span>
      </div>

      {/* Séparateur */}
      <div className="w-px h-8 bg-dark-600 shrink-0" />

      {/* P&L montant — EN GROS */}
      <div className="flex flex-col items-end leading-none">
        <span className={`text-[9px] font-bold uppercase tracking-widest mb-1
          ${up ? 'text-emerald-600' : 'text-red-600'}`}>
          {up ? 'Plus-value' : 'Moins-value'}
        </span>
        <div className="flex items-baseline gap-2">
          <span className={`text-xl font-black font-mono tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? '+' : '−'}{fmtEur(pnl)}
          </span>
          <span className={`text-sm font-mono font-bold tabular-nums ${up ? 'text-emerald-500' : 'text-red-500'}`}>
            {fmtPct(pnlPct)}
          </span>
        </div>
      </div>

      {/* Valeur actuelle totale */}
      <div className="ml-auto flex flex-col items-end leading-none text-right">
        <span className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Valeur actuelle</span>
        <span className="text-sm font-mono font-bold text-white tabular-nums">
          {currentValue.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
        </span>
      </div>
    </div>
  )
}

// ── Composant principal ─────────────────────────────────────────────────────
export function QuoteHeader({ symbol, isMobile = false, positions = [] }: Props) {
  const { live, flash, isPolling } = useRealtime(symbol)

  const up = live ? (live.change_pct ?? 0) >= 0 : true

  const flashStyle: React.CSSProperties = flash === 'up'
    ? { boxShadow: '0 0 0 2px rgba(16,185,129,0.35)', transition: 'box-shadow 0.6s ease' }
    : flash === 'down'
    ? { boxShadow: '0 0 0 2px rgba(239,68,68,0.35)',  transition: 'box-shadow 0.6s ease' }
    : { boxShadow: '0 0 0 0px transparent',           transition: 'box-shadow 0.6s ease' }

  const priceColor = flash === 'up'   ? 'text-green-300'
                   : flash === 'down' ? 'text-red-300'
                   : 'text-white'

  // Vérifier si en portfolio
  const inPortfolio = positions.some(p => p.symbol === symbol)

  return (
    <div
      className={`bg-dark-800 rounded-xl ${isMobile ? 'px-4 py-3' : 'px-5 py-4'}`}
      style={flashStyle}
    >
      {/* ── Ligne prix principale ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Symbole + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold font-mono ${isMobile ? 'text-lg' : 'text-xl'} ${
              live ? 'text-white' : 'text-slate-400'
            }`}>
              {symbol}
            </span>
            {/* Badge PEA */}
            {isPeaEligible(symbol) ? (
              <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-mono tracking-wide">
                ✓ PEA
              </span>
            ) : (
              <span className="text-[10px] font-bold bg-red-500/10 text-red-500/70 border border-red-500/20 px-2 py-0.5 rounded font-mono tracking-wide">
                ✗ PEA
              </span>
            )}
            {live?.currency && (
              <span className="text-xs text-slate-500 bg-dark-700 px-2 py-0.5 rounded shrink-0">
                {live.currency}
              </span>
            )}
            {live?.market_state && (
              <MarketBadge state={live.market_state} isPolling={isPolling} />
            )}
            {live && !live.is_open && (
              <span className="text-[10px] text-slate-600 font-mono hidden sm:block">~15min delay</span>
            )}
          </div>

          {/* Skeleton */}
          {!live && (
            <div className="h-8 w-32 bg-dark-700 rounded animate-pulse mt-1" />
          )}

          {/* Prix + variation */}
          {live?.price != null && (
            <div className="flex items-end gap-2 mt-0.5 flex-wrap">
              <span className={`font-bold font-mono leading-none transition-colors duration-300 ${
                isMobile ? 'text-2xl' : 'text-3xl'
              } ${priceColor}`}>
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
            <span className="text-[11px]">Vol {(live.volume / 1000).toFixed(0)}K</span>
          )}
          <div className="flex items-center gap-1 mt-0.5">
            {live?.is_open ? (
              <span className="text-[10px] text-green-600/70 font-mono">
                {isPolling ? '↻ live' : '● 8s'}
              </span>
            ) : (
              <RefreshCw size={11} className={`text-slate-600 ${isPolling ? 'animate-spin' : ''}`} />
            )}
          </div>
        </div>
      </div>

      {/* ── Bloc P&L portfolio — affiché si la valeur est en portefeuille ── */}
      {inPortfolio && (
        <PortfolioPnlBadge
          positions={positions}
          symbol={symbol}
          livePrice={live?.price}
        />
      )}
    </div>
  )
}
