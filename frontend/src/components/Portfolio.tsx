import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Trash2, TrendingUp, TrendingDown, PieChart, Plus,
  X, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { getQuote } from '../services/api'
import type { PortfolioPosition } from '../types'

// ── Ligne position ─────────────────────────────────────────────────────────────
function PositionRow({
  pos, onRemove, onSelect,
}: {
  pos:      PortfolioPosition
  onRemove: (id: string) => void
  onSelect: (symbol: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

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
  const up            = pnl >= 0

  return (
    <div className={`border-b border-dark-700/60 transition-colors ${confirmDelete ? 'bg-red-950/20' : 'hover:bg-dark-700/30'}`}>

      {/* ── Ligne principale ────────────────────────────────────────────── */}
      <div
        onClick={() => !confirmDelete && onSelect(pos.symbol)}
        className={`grid grid-cols-[1fr_auto] gap-2 px-4 py-3 ${!confirmDelete ? 'cursor-pointer' : ''}`}
      >
        {/* Identité + prix d'achat */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white font-mono">{pos.symbol}</span>
            <span className="text-xs text-slate-500 truncate max-w-[140px]">{pos.name}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
            <span className="font-mono tabular-nums">
              {pos.quantity} × {pos.buy_price.toFixed(2)} €
              <span className="ml-1 text-slate-700">= {investedValue.toFixed(0)} € investi</span>
            </span>
            {quote && (
              <span className="text-slate-400">
                actuel : <span className="text-white font-mono tabular-nums">{currentPrice.toFixed(2)} €</span>
              </span>
            )}
          </div>
        </div>

        {/* Valeur + P&L + bouton supprimer */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-mono font-bold text-white tabular-nums">
            {currentValue.toFixed(0)} €
          </span>
          <div className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
            {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
            {up ? '+' : ''}{pnl.toFixed(0)} €
            <span className="text-[10px] opacity-70">({up ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
          </div>

          {/* Bouton Supprimer — visible et rouge */}
          {!confirmDelete ? (
            <button
              onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
              className="flex items-center gap-1 text-[10px] font-mono text-red-500/60 hover:text-red-400
                hover:bg-red-500/10 border border-transparent hover:border-red-500/25
                px-2 py-0.5 rounded-md transition-all mt-0.5"
              title="Supprimer cette position"
            >
              <Trash2 size={10}/> Supprimer
            </button>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
              className="flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-white
                px-2 py-0.5 rounded-md transition-colors mt-0.5"
            >
              <X size={10}/> Annuler
            </button>
          )}
        </div>
      </div>

      {/* ── Confirmation suppression ─────────────────────────────────────── */}
      {confirmDelete && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-red-950/30 border-t border-red-500/20">
          <div className="flex items-center gap-2 text-xs font-mono text-red-300">
            <AlertTriangle size={12} className="text-red-400 shrink-0"/>
            Supprimer <span className="font-bold">{pos.symbol}</span> du portfolio ?
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs font-mono text-slate-500 hover:text-white px-2.5 py-1 rounded-lg
                bg-dark-600 hover:bg-dark-500 transition-colors"
            >
              Non
            </button>
            <button
              onClick={() => { onRemove(pos.id); setConfirmDelete(false) }}
              className="flex items-center gap-1.5 text-xs font-mono font-bold text-white px-2.5 py-1 rounded-lg
                bg-red-600 hover:bg-red-500 transition-colors"
            >
              <Trash2 size={11}/> Confirmer
            </button>
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
  const [collapsed, setCollapsed] = useState(false)

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

  const totalInvested = positions.reduce((s, p) => s + p.buy_price * p.quantity, 0)
  const totalCurrent  = positions.reduce((s, p) => {
    const price = quotes?.[p.symbol] ?? p.buy_price
    return s + price * p.quantity
  }, 0)
  const totalPnl    = totalCurrent - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const up          = totalPnl >= 0

  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden border border-dark-600/50">

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
              {positions.length} ligne{positions.length > 1 ? 's' : ''}
            </span>
          )}
          {positions.length > 0 && (collapsed ? <ChevronDown size={13} className="text-slate-600"/> : <ChevronUp size={13} className="text-slate-600"/>)}
        </button>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1 text-xs bg-accent-blue/20 hover:bg-accent-blue/30 text-accent-blue px-2.5 py-1.5 rounded-lg transition-colors font-mono"
        >
          <Plus size={12}/> Ajouter
        </button>
      </div>

      {/* ── Résumé global ───────────────────────────────────────────────── */}
      {positions.length > 0 && (
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
          {positions.length === 0 ? (
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
              {positions.map(pos => (
                <PositionRow
                  key={pos.id}
                  pos={pos}
                  onRemove={onRemove}
                  onSelect={onSelect}
                />
              ))}
              {/* Footer */}
              <div className="px-4 py-2 text-[10px] font-mono text-slate-700 text-right">
                Cliquez sur une ligne pour analyser · Trash pour supprimer
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
