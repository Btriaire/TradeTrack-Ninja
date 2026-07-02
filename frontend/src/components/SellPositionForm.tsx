/**
 * SellPositionForm — vendre tout ou partie d'une position.
 * Demande le prix (cours actuel ou différent) et la quantité (tout ou partie),
 * puis calcule la plus/moins-value réalisée avant confirmation.
 */
import { useState } from 'react'
import { Check, X, Banknote, TrendingUp, TrendingDown } from 'lucide-react'
import type { PortfolioPosition } from '../types'

function fmtEur(v: number, dec = 2) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'
}
function fmtPct(v: number) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + ' %'
}

export interface SellResult {
  full:          boolean
  soldQty:       number
  sellPrice:     number
  realizedPnl:   number
  remainingQty:  number
  remainingFees: number
}

interface Props {
  pos:       PortfolioPosition
  livePrice: number | null
  onConfirm: (result: SellResult) => void
  onCancel:  () => void
}

export function SellPositionForm({ pos, livePrice, onConfirm, onCancel }: Props) {
  const [qtyMode,    setQtyMode]    = useState<'all' | 'partial'>('all')
  const [qtyInput,   setQtyInput]   = useState(String(pos.quantity))
  const [priceMode,  setPriceMode]  = useState<'current' | 'custom'>('current')
  const [priceInput, setPriceInput] = useState((livePrice ?? pos.buy_price).toFixed(2))

  const fees = pos.fees ?? 0

  const rawQty  = qtyMode === 'all' ? pos.quantity : (parseFloat(qtyInput) || 0)
  const soldQty = Math.min(Math.max(rawQty, 0), pos.quantity)

  const sellPrice = priceMode === 'current'
    ? (livePrice ?? pos.buy_price)
    : (parseFloat(priceInput) || 0)

  const proceeds         = sellPrice * soldQty
  const proportionalCost = pos.buy_price * soldQty + fees * (pos.quantity > 0 ? soldQty / pos.quantity : 0)
  const realizedPnl      = proceeds - proportionalCost
  const realizedPct      = proportionalCost > 0 ? (realizedPnl / proportionalCost) * 100 : 0
  const up                = realizedPnl >= 0
  const remainingQty      = pos.quantity - soldQty
  const isFull             = remainingQty <= 0.0001
  const remainingFees      = isFull ? 0 : fees * (pos.quantity > 0 ? remainingQty / pos.quantity : 0)

  const valid = soldQty > 0 && soldQty <= pos.quantity && sellPrice > 0

  function handleConfirm() {
    if (!valid) return
    onConfirm({
      full:          isFull,
      soldQty,
      sellPrice,
      realizedPnl,
      remainingQty:  isFull ? 0 : remainingQty,
      remainingFees,
    })
  }

  return (
    <div className="mx-3 mb-3 mt-1 rounded-xl border border-amber-500/30 bg-dark-700/50 px-4 py-3 space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold flex items-center gap-1.5">
        <Banknote size={12} /> Vendre {pos.symbol}
      </div>

      {/* Quantité : tout ou partie */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Quantité</span>
          {(['all', 'partial'] as const).map(m => (
            <button
              key={m}
              onClick={() => setQtyMode(m)}
              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors font-mono ${
                qtyMode === m
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-dark-600 text-slate-500 border border-dark-500'
              }`}
            >
              {m === 'all' ? `Tout (${pos.quantity})` : 'Une partie'}
            </button>
          ))}
        </div>
        {qtyMode === 'partial' && (
          <input
            type="number" min="0.001" max={pos.quantity} step="0.001" value={qtyInput}
            onChange={e => setQtyInput(e.target.value)}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 outline-none
              border border-dark-600 focus:border-amber-500 font-mono"
          />
        )}
      </div>

      {/* Prix : cours actuel ou différent */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Prix de vente</span>
          {(['current', 'custom'] as const).map(m => (
            <button
              key={m}
              onClick={() => setPriceMode(m)}
              disabled={m === 'current' && livePrice == null}
              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors font-mono disabled:opacity-30 disabled:cursor-not-allowed ${
                priceMode === m
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-dark-600 text-slate-500 border border-dark-500'
              }`}
            >
              {m === 'current' ? `Cours actuel${livePrice ? ` (${livePrice.toFixed(2)} €)` : ''}` : 'Prix différent'}
            </button>
          ))}
        </div>
        {priceMode === 'custom' && (
          <input
            type="number" min="0" step="0.01" value={priceInput}
            onChange={e => setPriceInput(e.target.value)}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 outline-none
              border border-dark-600 focus:border-amber-500 font-mono"
          />
        )}
      </div>

      {/* Aperçu vente */}
      <div className={`rounded-lg border px-3 py-2 ${up ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1">
          <span>Montant vente</span>
          <span className="text-white font-semibold">{fmtEur(proceeds)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
            {up ? <TrendingUp size={11} className="text-emerald-400" /> : <TrendingDown size={11} className="text-red-400" />}
            Plus/moins-value réalisée
          </span>
          <span className={`text-sm font-mono font-bold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? '+' : '−'}{fmtEur(Math.abs(realizedPnl))}
            <span className="text-[10px] ml-1 opacity-70">{fmtPct(realizedPct)}</span>
          </span>
        </div>
        {!isFull && (
          <div className="text-[10px] font-mono text-slate-500 mt-1 text-right">
            Reste en portfolio&nbsp;<span className="text-slate-300">{remainingQty} act.</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={!valid}
          className="flex-1 flex items-center justify-center gap-2 bg-amber-500/20 hover:bg-amber-500/30
            text-amber-400 font-semibold py-2 rounded-xl transition-colors text-sm
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} /> {isFull ? 'Vendre tout' : `Vendre ${soldQty} act.`}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-slate-500 hover:text-white text-sm transition-colors
            flex items-center gap-1.5"
        >
          <X size={14} /> Annuler
        </button>
      </div>
    </div>
  )
}
