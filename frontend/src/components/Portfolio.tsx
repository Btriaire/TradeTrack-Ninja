import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Trash2, TrendingUp, TrendingDown, PieChart, Plus,
  ChevronDown, ChevronUp, Undo2, ChevronRight, Receipt,
} from 'lucide-react'
import { getQuote } from '../services/api'
import type { PortfolioPosition } from '../types'

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtEur(v: number, dec = 0) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'
}
function fmtPct(v: number) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + ' %'
}

// ── Toast Annuler ─────────────────────────────────────────────────────────────
function UndoToast({ symbol, onUndo, onDone }: {
  symbol: string; onUndo: () => void; onDone: () => void
}) {
  const [pct, setPct] = useState(100)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const DURATION = 4000

  useEffect(() => {
    const start = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setPct(remaining)
      if (remaining === 0) { clearInterval(timerRef.current!); onDone() }
    }, 50)
    return () => clearInterval(timerRef.current!)
  }, [])

  return (
    <div className="relative flex items-center gap-3 bg-dark-600 border border-dark-500 rounded-xl px-4 py-3 shadow-xl overflow-hidden">
      <Trash2 size={14} className="text-red-400 shrink-0" />
      <span className="text-xs font-mono text-slate-300 flex-1">
        <span className="font-bold text-white">{symbol}</span> retiré du portfolio
      </span>
      <button
        onClick={() => { clearInterval(timerRef.current!); onUndo() }}
        className="flex items-center gap-1.5 text-xs font-mono font-bold text-accent-blue
          hover:text-white bg-accent-blue/10 hover:bg-accent-blue/20
          border border-accent-blue/30 px-2.5 py-1 rounded-lg transition-colors shrink-0"
      >
        <Undo2 size={11} /> Annuler
      </button>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-500">
        <div className="h-full bg-accent-blue transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Ligne position ─────────────────────────────────────────────────────────────
function PositionRow({
  pos, onRemove, onSelect,
}: {
  pos: PortfolioPosition; onRemove: (id: string) => void; onSelect: (symbol: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: quote } = useQuery({
    queryKey:        ['quote', pos.symbol],
    queryFn:         () => getQuote(pos.symbol),
    refetchInterval: 30_000,
  })

  const currentPrice  = quote?.price ?? pos.buy_price
  const currentValue  = currentPrice * pos.quantity
  const fees          = pos.fees ?? 0
  // Coût de revient réel = prix achat × qté + frais
  const costBasis     = pos.buy_price * pos.quantity + fees
  // Plus-value latente = valeur actuelle − coût de revient
  const pnl           = currentValue - costBasis
  const pnlPct        = costBasis > 0 ? (pnl / costBasis) * 100 : 0
  const pnlPerShare   = costBasis > 0 ? pnl / pos.quantity : 0
  const up            = pnl >= 0
  const hasQuote      = !!quote?.price

  const green = up ? 'text-emerald-400' : 'text-red-400'
  const greenBg = up
    ? 'bg-emerald-500/10 border-emerald-500/25'
    : 'bg-red-500/10 border-red-500/25'
  const pnlLabel = up ? 'PLUS-VALUE' : 'MOINS-VALUE'

  return (
    <div className="border-b border-dark-700/50 last:border-b-0">

      {/* ── Ligne principale ──────────────────────────────────────────────── */}
      <div className="flex items-stretch gap-0 hover:bg-dark-700/25 transition-colors">

        {/* Bande couleur gauche */}
        <div className={`w-0.5 shrink-0 self-stretch ${up ? 'bg-emerald-500/40' : 'bg-red-500/40'}`} />

        {/* Info valeur — cliquable → analyse */}
        <div
          className="flex-1 min-w-0 px-4 py-3 cursor-pointer"
          onClick={() => onSelect(pos.symbol)}
        >
          {/* Ligne 1 : symbole + nom */}
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-white font-mono leading-none">{pos.symbol}</span>
            <span className="text-xs text-slate-500 truncate max-w-[140px] leading-none">{pos.name}</span>
          </div>

          {/* Ligne 2 : détails position */}
          <div className="flex items-center gap-2 mt-1.5 text-[11px] font-mono flex-wrap">
            <span className="text-slate-500">
              {pos.quantity} act. × <span className="text-slate-400">{pos.buy_price.toFixed(2)} €</span>
            </span>
            {hasQuote && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-slate-500">
                  cours <span className="text-white font-semibold">{currentPrice.toFixed(2)} €</span>
                </span>
              </>
            )}
            {fees > 0 && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-amber-600/80 flex items-center gap-0.5">
                  <Receipt size={9} />
                  {fees.toFixed(2)} €
                </span>
              </>
            )}
          </div>

          {/* Ligne 3 : valeur actuelle */}
          <div className="mt-1 text-[11px] text-slate-600 font-mono">
            Valeur actuelle&nbsp;
            <span className="text-slate-400 font-semibold">{fmtEur(currentValue, 2)}</span>
            <span className="ml-2 text-slate-700">·</span>
            <span className="ml-2 text-slate-600">coût {fmtEur(costBasis, 2)}</span>
          </div>
        </div>

        {/* ── Bloc P&L — côté droit ─────────────────────────────────────── */}
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          className={`shrink-0 flex flex-col items-center justify-center px-4 py-3
            border-l border-dark-700/50 min-w-[110px] group/pnl transition-colors
            ${up ? 'hover:bg-emerald-500/5' : 'hover:bg-red-500/5'}`}
          title="Détail plus/moins-value"
        >
          {/* Montant en grand */}
          <span className={`text-xl font-black font-mono tabular-nums leading-none ${green}`}>
            {up ? '+' : '−'}{fmtEur(Math.abs(pnl), 0)}
          </span>

          {/* Label PLUS-VALUE / MOINS-VALUE */}
          <span className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${green} opacity-70`}>
            {pnlLabel}
          </span>

          {/* Pourcentage */}
          <span className={`text-xs font-mono font-semibold tabular-nums mt-0.5 ${green}`}>
            {fmtPct(pnlPct)}
          </span>

          {/* Chevron expand */}
          <ChevronRight
            size={10}
            className={`mt-1.5 opacity-30 group-hover/pnl:opacity-70 transition-all duration-200
              ${expanded ? 'rotate-90' : ''} ${green}`}
          />
        </button>

        {/* Bouton supprimer */}
        <button
          onClick={e => { e.stopPropagation(); onRemove(pos.id) }}
          className="shrink-0 flex items-center justify-center w-9 self-stretch
            text-slate-700 hover:text-white hover:bg-red-500/80
            border-l border-dark-700/50 transition-all duration-150"
          title={`Supprimer ${pos.symbol}`}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* ── Détail dépliable ──────────────────────────────────────────────── */}
      {expanded && (
        <div className={`mx-3 mb-3 mt-1 rounded-xl border px-4 py-3 ${greenBg}`}>
          <div className="grid grid-cols-3 gap-4 text-xs font-mono">

            {/* Colonne 1 : par action */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">Par action</div>
              <Row label="Prix achat"   value={`${pos.buy_price.toFixed(2)} €`} />
              <Row label="Prix actuel"  value={`${currentPrice.toFixed(2)} €`} />
              <Row label="Δ / action"   value={`${pnlPerShare >= 0 ? '+' : ''}${pnlPerShare.toFixed(2)} €`}
                   className={`font-bold border-t border-current/20 pt-1 mt-1 ${green}`} />
            </div>

            {/* Colonne 2 : total brut */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">
                Total ({pos.quantity} act.)
              </div>
              <Row label="Investi"      value={fmtEur(pos.buy_price * pos.quantity, 2)} />
              <Row label="Valeur"       value={fmtEur(currentValue, 2)} />
              <Row label={pnlLabel.substring(0, 4) + '.'} value={`${up ? '+' : ''}${fmtEur(pnl, 2)}`}
                   className={`font-bold border-t border-current/20 pt-1 mt-1 ${green}`} />
            </div>

            {/* Colonne 3 : frais + net */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-2">Frais & net</div>
              <Row label="Frais cour."  value={fees > 0 ? `− ${fees.toFixed(2)} €` : '—'}
                   className={fees > 0 ? 'text-amber-500' : 'text-slate-600'} />
              <Row label="Coût réel"    value={fmtEur(costBasis, 2)} />
              <Row
                label="Net final"
                value={`${up ? '+' : ''}${fmtEur(pnl, 2)}`}
                subValue={fmtPct(pnlPct)}
                className={`font-bold border-t border-current/20 pt-1 mt-1 ${green}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, subValue, className = 'text-slate-400' }: {
  label: string; value: string; subValue?: string; className?: string
}) {
  return (
    <div className={`flex justify-between items-baseline gap-1 py-0.5 ${className}`}>
      <span className={className.includes('bold') ? '' : 'text-slate-600'}>{label}</span>
      <span className="tabular-nums text-right">
        {value}
        {subValue && <span className="ml-1 text-[10px] opacity-70">{subValue}</span>}
      </span>
    </div>
  )
}


// ── Composant principal ───────────────────────────────────────────────────────
interface Props {
  positions:    PortfolioPosition[]
  onRemove:     (id: string) => void
  onSelect:     (symbol: string) => void
  onOpenSearch: () => void
  user:         any
}

export function Portfolio({ positions, onRemove, onSelect, onOpenSearch, user }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [pending,   setPending]   = useState<{ id: string; symbol: string } | null>(null)

  // Prix actuels pour le résumé global
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
    enabled:         positions.length > 0,
    refetchInterval: 60_000,
  })

  const visiblePositions = positions.filter(p => p.id !== pending?.id)

  // Totaux avec frais
  const totalCostBasis = visiblePositions.reduce((s, p) => s + p.buy_price * p.quantity + (p.fees ?? 0), 0)
  const totalCurrent   = visiblePositions.reduce((s, p) => {
    const price = quotes?.[p.symbol] ?? p.buy_price
    return s + price * p.quantity
  }, 0)
  const totalFees  = visiblePositions.reduce((s, p) => s + (p.fees ?? 0), 0)
  const totalPnl   = totalCurrent - totalCostBasis
  const totalPct   = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0
  const globalUp   = totalPnl >= 0

  function handleRemove(id: string) {
    const pos = positions.find(p => p.id === id)
    if (!pos) return
    setPending({ id, symbol: pos.symbol })
  }
  function confirmRemove() { if (pending) { onRemove(pending.id); setPending(null) } }
  function cancelRemove()  { setPending(null) }

  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden border border-dark-600/50 relative">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <PieChart size={14} className="text-accent-blue shrink-0" />
          <span className="text-sm font-semibold text-white">Mon Portfolio</span>
          {visiblePositions.length > 0 && (
            <span className="text-xs bg-dark-600 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {visiblePositions.length} ligne{visiblePositions.length > 1 ? 's' : ''}
            </span>
          )}
          {positions.length > 0 && (
            collapsed
              ? <ChevronDown size={13} className="text-slate-600"/>
              : <ChevronUp   size={13} className="text-slate-600"/>
          )}
        </button>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1 text-xs bg-accent-blue/20 hover:bg-accent-blue/30
            text-accent-blue px-2.5 py-1.5 rounded-lg transition-colors font-mono"
        >
          <Plus size={12}/> Ajouter
        </button>
      </div>

      {/* ── Résumé global ───────────────────────────────────────────────────── */}
      {visiblePositions.length > 0 && (
        <div className={`border-b border-dark-700 ${globalUp ? 'bg-emerald-950/20' : 'bg-red-950/20'}`}>
          <div className="grid grid-cols-4 divide-x divide-dark-700">
            <div className="px-3 py-2.5 text-center">
              <div className="text-[9px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">Coût réel</div>
              <div className="text-sm font-mono font-bold text-white tabular-nums">{fmtEur(totalCostBasis)}</div>
            </div>
            <div className="px-3 py-2.5 text-center">
              <div className="text-[9px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">Valeur</div>
              <div className="text-sm font-mono font-bold text-white tabular-nums">{fmtEur(totalCurrent)}</div>
            </div>
            {totalFees > 0 && (
              <div className="px-3 py-2.5 text-center">
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">Frais</div>
                <div className="text-sm font-mono font-bold text-amber-500/80 tabular-nums">−{fmtEur(totalFees)}</div>
              </div>
            )}
            <div className={`${totalFees > 0 ? '' : 'col-span-2'} px-3 py-2.5 text-center`}>
              <div className={`text-[9px] font-mono uppercase tracking-wider mb-0.5 ${globalUp ? 'text-emerald-600' : 'text-red-600'}`}>
                {globalUp ? 'Plus-value' : 'Moins-value'}
              </div>
              <div className={`text-sm font-mono font-bold tabular-nums ${globalUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {globalUp ? '+' : '−'}{fmtEur(Math.abs(totalPnl))}
              </div>
              <div className={`text-[10px] font-mono tabular-nums ${globalUp ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                {fmtPct(totalPct)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Positions ───────────────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          {visiblePositions.length === 0 && !pending ? (
            <div className="py-12 text-center text-slate-600">
              <PieChart size={28} className="mx-auto mb-2 opacity-20"/>
              <div className="text-sm">Portfolio vide</div>
              {!user ? (
                <div className="text-xs mt-1 text-slate-700">Connectez-vous pour sauvegarder votre portfolio</div>
              ) : (
                <button onClick={onOpenSearch} className="mt-3 text-xs text-accent-blue hover:underline">
                  + Rechercher une action
                </button>
              )}
            </div>
          ) : (
            <div>
              {visiblePositions.map(pos => (
                <PositionRow key={pos.id} pos={pos} onRemove={handleRemove} onSelect={onSelect} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Toast Annuler ─────────────────────────────────────────────────── */}
      {pending && (
        <div className="px-4 pb-3 pt-2">
          <UndoToast symbol={pending.symbol} onUndo={cancelRemove} onDone={confirmRemove} />
        </div>
      )}
    </div>
  )
}
