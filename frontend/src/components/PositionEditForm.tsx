/**
 * PositionEditForm — édition inline d'une ligne du portfolio.
 * Permet de corriger le prix d'achat, la quantité, les frais et la date.
 * Recalcule la plus/moins-value en direct pendant la saisie.
 */
import { useState, useMemo } from 'react'
import { Check, X, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { calcLclFees } from '../utils/lcl-fees'
import type { PortfolioPosition } from '../types'

function fmtEur(v: number, dec = 2) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'
}
function fmtPct(v: number) {
  return (v >= 0 ? '+' : '') + v.toFixed(2) + ' %'
}

interface Props {
  pos:        PortfolioPosition
  livePrice:  number | null
  onSave:     (patch: Partial<PortfolioPosition>) => void
  onCancel:   () => void
}

export function PositionEditForm({ pos, livePrice, onSave, onCancel }: Props) {
  const [qty,       setQty]       = useState(String(pos.quantity))
  const [price,     setPrice]     = useState(pos.buy_price.toFixed(2))
  const [date,      setDate]      = useState(pos.buy_date)
  const [feesMode,  setFeesMode]  = useState<'keep' | 'auto' | 'manual'>('keep')
  const [feesManual, setFeesManual] = useState(String(pos.fees ?? ''))

  const q = parseFloat(qty)   || 0
  const p = parseFloat(price) || 0

  const lcl = useMemo(() => calcLclFees(pos.symbol, q, p), [pos.symbol, q, p])

  const fees =
    feesMode === 'auto'   ? lcl.total
    : feesMode === 'manual' ? (parseFloat(feesManual) || 0)
    : (pos.fees ?? 0)

  // Recalcul live de la plus/moins-value
  const current   = livePrice ?? p
  const costBasis = p * q + fees
  const value     = current * q
  const pnl       = value - costBasis
  const pnlPct    = costBasis > 0 ? (pnl / costBasis) * 100 : 0
  const up        = pnl >= 0

  // Comparaison avec l'ancien coût de revient
  const oldFees      = pos.fees ?? 0
  const oldCostBasis = pos.buy_price * pos.quantity + oldFees
  const oldPnl       = (livePrice ?? pos.buy_price) * pos.quantity - oldCostBasis
  const pnlDelta     = pnl - oldPnl
  const changed      = q !== pos.quantity || p !== pos.buy_price || date !== pos.buy_date || fees !== oldFees

  function handleSave() {
    if (!q || !p) return
    const patch: Partial<PortfolioPosition> = {
      quantity:  q,
      buy_price: p,
      buy_date:  date,
    }
    if (feesMode === 'auto')        patch.fees = lcl.total
    else if (feesMode === 'manual') patch.fees = parseFloat(feesManual) || 0
    onSave(patch)
  }

  return (
    <div className="mx-3 mb-3 mt-1 rounded-xl border border-accent-blue/30 bg-dark-700/50 px-4 py-3 space-y-3">
      <div className="text-[10px] uppercase tracking-widest text-accent-blue font-semibold">
        Corriger la ligne
      </div>

      {/* Quantité / Prix / Date */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Quantité</label>
          <input
            type="number" min="0.001" step="0.001" value={qty}
            onChange={e => setQty(e.target.value)}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-2.5 py-2 outline-none
              border border-dark-600 focus:border-accent-blue font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Prix achat (€)</label>
          <input
            type="number" min="0" step="0.01" value={price}
            onChange={e => setPrice(e.target.value)}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-2.5 py-2 outline-none
              border border-dark-600 focus:border-accent-blue font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Date</label>
          <input
            type="date" value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-dark-700 text-white text-xs rounded-lg px-2 py-2 outline-none
              border border-dark-600 focus:border-accent-blue font-mono"
          />
        </div>
      </div>

      {/* Frais */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Frais</span>
          {(['keep', 'auto', 'manual'] as const).map(m => (
            <button
              key={m}
              onClick={() => setFeesMode(m)}
              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors font-mono ${
                feesMode === m
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'bg-dark-600 text-slate-500 border border-dark-500'
              }`}
            >
              {m === 'keep' ? `Garder (${oldFees.toFixed(2)} €)` : m === 'auto' ? '⚡ Auto LCL' : '✏️ Manuel'}
            </button>
          ))}
        </div>
        {feesMode === 'auto' && (
          <div className="flex items-center justify-between text-[11px] font-mono bg-dark-700/60 rounded-lg px-3 py-2">
            <span className="text-slate-500 flex items-center gap-1"><Zap size={10} className="text-amber-400" /> Frais LCL recalculés</span>
            <span className="text-amber-400 font-bold">{fmtEur(lcl.total)}</span>
          </div>
        )}
        {feesMode === 'manual' && (
          <input
            type="number" min="0" step="0.01" value={feesManual}
            onChange={e => setFeesManual(e.target.value)}
            placeholder="Frais réels (€)"
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 outline-none
              border border-dark-600 focus:border-amber-500 font-mono"
          />
        )}
      </div>

      {/* Aperçu plus/moins-value recalculée */}
      <div className={`rounded-lg border px-3 py-2 ${up ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
            {up ? <TrendingUp size={11} className="text-emerald-400" /> : <TrendingDown size={11} className="text-red-400" />}
            {up ? 'Plus-value' : 'Moins-value'} recalculée
          </span>
          <span className={`text-sm font-mono font-bold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? '+' : '−'}{fmtEur(Math.abs(pnl))}
            <span className="text-[10px] ml-1 opacity-70">{fmtPct(pnlPct)}</span>
          </span>
        </div>
        {changed && Math.abs(pnlDelta) >= 0.01 && (
          <div className="text-[10px] font-mono text-slate-500 mt-1 text-right">
            Impact correction&nbsp;
            <span className={pnlDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {pnlDelta >= 0 ? '+' : '−'}{fmtEur(Math.abs(pnlDelta))}
            </span>
            &nbsp;vs valeurs actuelles
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!q || !p || !changed}
          className="flex-1 flex items-center justify-center gap-2 bg-accent-blue/20 hover:bg-accent-blue/30
            text-accent-blue font-semibold py-2 rounded-xl transition-colors text-sm
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} /> Enregistrer
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
