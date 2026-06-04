import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Trash2, TrendingUp, TrendingDown, PieChart, Plus,
  ChevronDown, ChevronUp, Undo2, ChevronRight,
} from 'lucide-react'
import { getQuote } from '../services/api'
import type { PortfolioPosition } from '../types'

// ── Toast Annuler ─────────────────────────────────────────────────────────────
function UndoToast({ symbol, onUndo, onDone }: {
  symbol: string
  onUndo: () => void
  onDone: () => void
}) {
  const [pct, setPct] = useState(100)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const DURATION = 4000 // ms

  useEffect(() => {
    const start = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setPct(remaining)
      if (remaining === 0) {
        clearInterval(timerRef.current!)
        onDone()
      }
    }, 50)
    return () => clearInterval(timerRef.current!)
  }, [])

  return (
    <div className="flex items-center gap-3 bg-dark-600 border border-dark-500 rounded-xl px-4 py-3 shadow-xl">
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
      {/* Barre de progression */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-500 rounded-b-xl overflow-hidden">
        <div
          className="h-full bg-accent-blue transition-none rounded-b-xl"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Ligne position ─────────────────────────────────────────────────────────────
function PositionRow({
  pos,
  onRemove,
  onSelect,
}: {
  pos: PortfolioPosition
  onRemove: (id: string) => void
  onSelect:  (symbol: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const { data: quote } = useQuery({
    queryKey:        ['quote', pos.symbol],
    queryFn:         () => getQuote(pos.symbol),
    refetchInterval: 30_000,
  })

  const currentPrice  = quote?.price ?? pos.buy_price
  const currentValue  = currentPrice * pos.quantity
  const investedValue = pos.buy_price * pos.quantity
  const pnl           = currentValue - investedValue
  const pnlPct        = investedValue > 0 ? (pnl / investedValue) * 100 : 0
  const pnlPerShare   = currentPrice - pos.buy_price
  const up            = pnl >= 0

  const col  = up ? 'text-green-400' : 'text-red-400'
  const bg   = up ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'
  const sign = up ? '+' : ''

  return (
    <div className="border-b border-dark-700/60">
      {/* ── Ligne principale ─────────────────────────────────────────── */}
      <div className="group relative flex items-center gap-3 px-4 py-3 hover:bg-dark-700/30 transition-colors">

        {/* Contenu cliquable → analyse */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onSelect(pos.symbol)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white font-mono">{pos.symbol}</span>
            <span className="text-xs text-slate-500 truncate max-w-[160px]">{pos.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
            <span className="font-mono tabular-nums">
              {pos.quantity} × {pos.buy_price.toFixed(2)} €
            </span>
            {quote && (
              <span className="text-slate-400">
                actuel : <span className="text-white font-mono tabular-nums">{currentPrice.toFixed(2)} €</span>
              </span>
            )}
          </div>
        </div>

        {/* Valeur + P&L — clic → détail */}
        <button
          onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
          className="flex flex-col items-end gap-0.5 shrink-0 group/pnl"
          title="Voir le détail P&L"
        >
          <span className="text-sm font-mono font-bold text-white tabular-nums">
            {currentValue.toFixed(0)} €
          </span>
          <div className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${col}`}>
            {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
            {sign}{pnl.toFixed(0)} €
            <span className="text-[10px] opacity-70">({sign}{pnlPct.toFixed(1)}%)</span>
            <ChevronRight
              size={10}
              className={`opacity-40 group-hover/pnl:opacity-100 transition-all duration-200
                ${expanded ? 'rotate-90' : ''}`}
            />
          </div>
        </button>

        {/* Bouton supprimer */}
        <button
          onClick={e => { e.stopPropagation(); onRemove(pos.id) }}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg
            text-slate-600 hover:text-white hover:bg-red-500
            border border-transparent hover:border-red-400
            transition-all duration-150 active:scale-90"
          title={`Supprimer ${pos.symbol}`}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* ── Panneau détail P&L (dépliable) ───────────────────────────── */}
      {expanded && (
        <div className={`mx-3 mb-3 rounded-xl border px-4 py-3 ${bg}`}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">

            {/* Colonne par action */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Par action</div>
              <div className="flex justify-between">
                <span className="text-slate-500">Achat</span>
                <span className="text-white tabular-nums">{pos.buy_price.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Actuel</span>
                <span className="text-white tabular-nums">{currentPrice.toFixed(2)} €</span>
              </div>
              <div className={`flex justify-between font-bold mt-1 pt-1 border-t border-current/20 ${col}`}>
                <span>Δ / action</span>
                <span className="tabular-nums">{sign}{pnlPerShare.toFixed(2)} €</span>
              </div>
            </div>

            {/* Colonne total */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Total ({pos.quantity} act.)</div>
              <div className="flex justify-between">
                <span className="text-slate-500">Investi</span>
                <span className="text-white tabular-nums">{investedValue.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valeur</span>
                <span className="text-white tabular-nums">{currentValue.toFixed(2)} €</span>
              </div>
              <div className={`flex justify-between font-bold mt-1 pt-1 border-t border-current/20 ${col}`}>
                <span>Δ total</span>
                <span className="tabular-nums">{sign}{pnl.toFixed(2)} €&nbsp;
                  <span className="opacity-70 font-normal text-[10px]">({sign}{pnlPct.toFixed(2)}%)</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
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
  const [collapsed,  setCollapsed]  = useState(false)
  // Suppression avec undo : { id, symbol, pos (pour restaurer si besoin) }
  const [pending, setPending] = useState<{ id: string; symbol: string } | null>(null)

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

  // Filtre les positions qui ne sont pas en attente de suppression
  const visiblePositions = positions.filter(p => p.id !== pending?.id)

  const totalInvested = visiblePositions.reduce((s, p) => s + p.buy_price * p.quantity, 0)
  const totalCurrent  = visiblePositions.reduce((s, p) => {
    const price = quotes?.[p.symbol] ?? p.buy_price
    return s + price * p.quantity
  }, 0)
  const totalPnl    = totalCurrent - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const up          = totalPnl >= 0

  function handleRemove(id: string) {
    const pos = positions.find(p => p.id === id)
    if (!pos) return
    setPending({ id, symbol: pos.symbol })
  }

  function confirmRemove() {
    if (pending) {
      onRemove(pending.id)
      setPending(null)
    }
  }

  function cancelRemove() {
    setPending(null)
  }

  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden border border-dark-600/50 relative">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <PieChart size={14} className="text-accent-blue shrink-0" />
          <span className="text-sm font-semibold text-white">Mon Portfolio</span>
          {positions.length > 0 && (
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

      {/* ── Résumé global ───────────────────────────────────────────────── */}
      {visiblePositions.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-dark-700 border-b border-dark-700">
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">Investi</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">{totalInvested.toFixed(0)} €</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">Valeur</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">{totalCurrent.toFixed(0)} €</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">P&amp;L</div>
            <div className={`text-sm font-mono font-bold tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
              {up ? '+' : ''}{totalPnl.toFixed(0)} €
              <span className="text-[10px] ml-1 opacity-70">({up ? '+' : ''}{totalPnlPct.toFixed(1)}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Positions ───────────────────────────────────────────────────── */}
      {!collapsed && (
        <>
          {visiblePositions.length === 0 && !pending ? (
            <div className="py-12 text-center text-slate-600">
              <PieChart size={28} className="mx-auto mb-2 opacity-20"/>
              <div className="text-sm">Portfolio vide</div>
              {!user ? (
                <div className="text-xs mt-1 text-slate-700">
                  Connectez-vous pour sauvegarder votre portfolio
                </div>
              ) : (
                <button
                  onClick={onOpenSearch}
                  className="mt-3 text-xs text-accent-blue hover:underline"
                >
                  + Rechercher une action
                </button>
              )}
            </div>
          ) : (
            <div>
              {visiblePositions.map(pos => (
                <PositionRow
                  key={pos.id}
                  pos={pos}
                  onRemove={handleRemove}
                  onSelect={onSelect}
                />
              ))}
              <div className="px-4 py-2 text-[10px] font-mono text-slate-700 text-right">
                Cliquez sur une ligne pour analyser · 🗑 pour supprimer
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Toast Annuler (fixé en bas du composant) ─────────────────────── */}
      {pending && (
        <div className="relative px-4 pb-3 pt-1">
          <UndoToast
            symbol={pending.symbol}
            onUndo={cancelRemove}
            onDone={confirmRemove}
          />
        </div>
      )}
    </div>
  )
}
