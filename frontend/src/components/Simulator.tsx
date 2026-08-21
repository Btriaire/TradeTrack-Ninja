/**
 * Simulator — "Labo Trading", portefeuille 100% fictif.
 * Thème cyan néon volontairement très différent du vrai Portfolio (bleu/vert/rouge classique)
 * pour qu'il soit impossible de confondre argent réel et argent fictif.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  FlaskConical, Plus, TrendingUp, TrendingDown, RotateCcw,
  Trash2, ChevronRight, Receipt, X, Check,
} from 'lucide-react'
import { getQuote } from '../services/api'
import { useSimulatorPortfolio, STARTING_CAPITAL } from '../hooks/useSimulatorPortfolio'
import { VirtualBuyModal } from './VirtualBuyModal'
import type { VirtualPosition } from '../types'
import type { User } from 'firebase/auth'

function fmtEur(v: number, dec = 2) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'
}
function fmtPct(v: number) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + ' %'
}

// ── Ligne position virtuelle ───────────────────────────────────────────────────
function VirtualPositionRow({
  pos, onSell, onSelect,
}: {
  pos: VirtualPosition
  onSell: (pos: VirtualPosition, proceeds: number) => void
  onSelect: (symbol: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const { data: quote } = useQuery({
    queryKey:        ['virtual-quote-live', pos.symbol],
    queryFn:         () => getQuote(pos.symbol),
    refetchInterval: 30_000,
  })

  const currentPrice = quote?.price ?? pos.buy_price
  const currentValue = currentPrice * pos.quantity
  const fees         = pos.fees ?? 0
  const costBasis     = pos.buy_price * pos.quantity + fees
  const pnl           = currentValue - costBasis
  const pnlPct        = costBasis > 0 ? (pnl / costBasis) * 100 : 0
  const up             = pnl >= 0

  const col   = up ? 'text-cyan-300' : 'text-fuchsia-400'
  const glow  = up ? 'shadow-[0_0_12px_rgba(34,211,238,0.12)]' : 'shadow-[0_0_12px_rgba(232,121,249,0.12)]'
  const border= up ? 'border-cyan-500/30' : 'border-fuchsia-500/30'

  function handleSellConfirmed() {
    onSell(pos, currentValue)
    setConfirming(false)
  }

  return (
    <div className={`rounded-xl border border-dashed ${border} ${glow} bg-black/60 overflow-hidden`}>
      <div className="flex items-stretch">
        <div className="flex-1 min-w-0 px-4 py-3 cursor-pointer" onClick={() => onSelect(pos.symbol)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-white font-mono leading-none">{pos.symbol}</span>
            <span className="text-[9px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded font-mono tracking-widest leading-none">
              🧪 FICTIF
            </span>
            <span className="text-xs text-slate-500 truncate max-w-[120px] leading-none">{pos.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono flex-wrap">
            <span className={`${col} font-semibold`}>
              {pos.quantity} act. × <span className="text-white">{pos.buy_price.toFixed(2)} €</span>
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-slate-500">cours <span className="text-white font-semibold">{currentPrice.toFixed(2)} €</span></span>
            {fees > 0 && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-amber-600/80 flex items-center gap-0.5"><Receipt size={9} />{fees.toFixed(2)} €</span>
              </>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-600 font-mono">
            Valeur virtuelle&nbsp;<span className="text-slate-400 font-semibold">{fmtEur(currentValue)}</span>
          </div>
        </div>

        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          className="shrink-0 flex flex-col items-center justify-center px-4 py-3 border-l border-dashed border-cyan-500/20 min-w-[100px]"
        >
          <span className={`text-lg font-black font-mono tabular-nums leading-none ${col}`}>
            {up ? '+' : '−'}{fmtEur(Math.abs(pnl), 0)}
          </span>
          <span className={`text-xs font-mono tabular-nums mt-0.5 ${col}`}>{fmtPct(pnlPct)}</span>
          <ChevronRight size={10} className={`mt-1 opacity-40 transition-transform ${expanded ? 'rotate-90' : ''} ${col}`} />
        </button>

        <button
          onClick={e => { e.stopPropagation(); setConfirming(true) }}
          className="shrink-0 flex items-center justify-center px-3 border-l border-dashed border-cyan-500/20 text-slate-600 hover:text-fuchsia-400 hover:bg-fuchsia-500/10 transition-colors"
          title="Vendre (fictif)"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mx-3 mb-3 mt-1 rounded-lg border border-dashed border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-mono grid grid-cols-2 gap-3">
          <div>
            <div className="text-slate-600">Investi (fictif)</div>
            <div className="text-white">{fmtEur(pos.buy_price * pos.quantity)}</div>
          </div>
          <div>
            <div className="text-slate-600">Coût réel (+ frais)</div>
            <div className="text-white">{fmtEur(costBasis)}</div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="mx-3 mb-3 mt-1 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-2.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-fuchsia-300 font-mono">
            Vendre à {currentPrice.toFixed(2)} € · recrédite {fmtEur(currentValue)} ?
          </span>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={handleSellConfirmed}
              className="p-1.5 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300"><Check size={13} /></button>
            <button onClick={() => setConfirming(false)}
              className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-400"><X size={13} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
interface Props {
  user:       User | null
  onSelectSymbol: (symbol: string) => void
}

export function Simulator({ user, onSelectSymbol }: Props) {
  const { positions, capital, buyVirtual, sellVirtual, resetSimulator } = useSimulatorPortfolio(user)
  const [showBuy, setShowBuy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const { data: quotes } = useQuery({
    queryKey: ['virtual-portfolio-quotes', positions.map(p => p.symbol).join(',')],
    queryFn: async () => {
      const out: Record<string, number> = {}
      await Promise.all(positions.map(async p => {
        try { const q = await getQuote(p.symbol); if (q.price) out[p.symbol] = q.price } catch {}
      }))
      return out
    },
    enabled: positions.length > 0,
    refetchInterval: 60_000,
  })

  const totalCostBasis = positions.reduce((s, p) => s + p.buy_price * p.quantity + (p.fees ?? 0), 0)
  const totalCurrent   = positions.reduce((s, p) => s + (quotes?.[p.symbol] ?? p.buy_price) * p.quantity, 0)
  const totalPnl        = totalCurrent - totalCostBasis
  const totalPct         = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0
  const globalUp        = totalPnl >= 0
  const netWorth         = capital.balance + totalCurrent
  const capitalPct       = Math.max(0, Math.min(100, (capital.balance / capital.starting_capital) * 100))

  if (!user) {
    return (
      <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-black p-10 text-center">
        <FlaskConical size={32} className="mx-auto mb-3 text-cyan-600 opacity-50" />
        <div className="text-sm text-cyan-400 font-mono">Connectez-vous pour accéder au Labo Trading</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Bandeau simulation permanent */}
      <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/5 to-cyan-500/10 px-4 py-2.5 flex items-center gap-2"
        style={{ boxShadow: '0 0 20px rgba(34,211,238,0.08)' }}>
        <span className="text-cyan-400 animate-pulse">⚡</span>
        <span className="text-[11px] font-mono text-cyan-300 tracking-wide uppercase">
          Simulation — argent fictif, ne reflète pas votre vrai capital
        </span>
      </div>

      {/* Header + capital */}
      <div className="rounded-2xl border border-cyan-500/30 bg-black overflow-hidden"
        style={{ boxShadow: '0 0 30px rgba(34,211,238,0.06)' }}>
        <div className="px-4 py-3 border-b border-cyan-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <FlaskConical size={16} className="text-cyan-400 shrink-0" />
            <span className="text-sm font-bold text-cyan-300 font-mono tracking-wide whitespace-nowrap">LABO TRADING</span>
            {positions.length > 0 && (
              <span className="text-[10px] bg-cyan-500/10 text-cyan-500 px-2 py-0.5 rounded-full font-mono border border-cyan-500/20 whitespace-nowrap shrink-0">
                {positions.length} position{positions.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1 text-xs text-slate-600 hover:text-fuchsia-400 p-1.5 rounded-lg transition-colors font-mono shrink-0"
              title="Réinitialiser le labo"
            >
              <RotateCcw size={12} />
            </button>
            <button
              onClick={() => setShowBuy(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 px-2.5 py-1.5 rounded-lg transition-colors font-mono whitespace-nowrap"
            >
              <Plus size={12} className="shrink-0" /> Acheter <span className="hidden sm:inline">virtuellement</span>
            </button>
          </div>
        </div>

        {confirmReset && (
          <div className="px-4 py-3 bg-fuchsia-500/5 border-b border-fuchsia-500/20 flex items-center justify-between gap-2">
            <span className="text-xs text-fuchsia-300 font-mono">
              Effacer toutes les positions fictives et repartir avec {fmtEur(STARTING_CAPITAL, 0)} ?
            </span>
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => { resetSimulator(); setConfirmReset(false) }}
                className="text-xs px-2.5 py-1 rounded-lg bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-300 font-mono">Confirmer</button>
              <button onClick={() => setConfirmReset(false)}
                className="text-xs px-2.5 py-1 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-400 font-mono">Annuler</button>
            </div>
          </div>
        )}

        {/* Barre capital */}
        <div className="px-4 py-3 border-b border-cyan-500/20">
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[10px] font-mono text-cyan-600 uppercase tracking-widest">Capital virtuel restant</span>
            <span className="text-sm font-mono font-bold text-cyan-300">
              {fmtEur(capital.balance, 0)} <span className="text-slate-600 font-normal">/ {fmtEur(capital.starting_capital, 0)}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-dark-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${capitalPct}%`, boxShadow: '0 0 8px rgba(34,211,238,0.6)' }}
            />
          </div>
        </div>

        {/* Résumé */}
        {positions.length > 0 && (
          <div className="grid grid-cols-3 divide-x divide-cyan-500/10">
            <div className="px-3 py-2.5 text-center">
              <div className="text-[9px] font-mono text-cyan-700 uppercase tracking-wider mb-0.5">Valeur nette totale</div>
              <div className="text-sm font-mono font-bold text-white tabular-nums">{fmtEur(netWorth, 0)}</div>
            </div>
            <div className="px-3 py-2.5 text-center">
              <div className="text-[9px] font-mono text-cyan-700 uppercase tracking-wider mb-0.5">Investi</div>
              <div className="text-sm font-mono font-bold text-slate-300 tabular-nums">{fmtEur(totalCostBasis, 0)}</div>
            </div>
            <div className="px-3 py-2.5 text-center">
              <div className={`text-[9px] font-mono uppercase tracking-wider mb-0.5 ${globalUp ? 'text-cyan-500' : 'text-fuchsia-500'}`}>
                {globalUp ? 'Plus-value fictive' : 'Moins-value fictive'}
              </div>
              <div className={`text-sm font-mono font-bold tabular-nums ${globalUp ? 'text-cyan-300' : 'text-fuchsia-400'}`}>
                {globalUp ? '+' : '−'}{fmtEur(Math.abs(totalPnl), 0)}
                <span className="ml-1 text-[10px] opacity-70">{fmtPct(totalPct)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Positions */}
      {positions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cyan-500/25 bg-black p-10 text-center">
          <FlaskConical size={28} className="mx-auto mb-2 text-cyan-700 opacity-50" />
          <div className="text-sm text-cyan-400 font-mono">Labo vide</div>
          <div className="text-xs text-slate-600 mt-1 font-mono">Testez une stratégie sans risque avec {fmtEur(STARTING_CAPITAL, 0)} fictifs</div>
          <button onClick={() => setShowBuy(true)}
            className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 hover:underline font-mono">
            + Premier achat virtuel
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {positions.map(pos => (
            <VirtualPositionRow
              key={pos.id} pos={pos}
              onSelect={onSelectSymbol}
              onSell={(p, proceeds) => sellVirtual(p.id, proceeds)}
            />
          ))}
        </div>
      )}

      {showBuy && (
        <VirtualBuyModal
          balance={capital.balance}
          onBuy={buyVirtual}
          onClose={() => setShowBuy(false)}
        />
      )}
    </div>
  )
}
