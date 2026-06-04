/**
 * StockPortfolioPanel — affiché dans l'onglet "Portfolio" d'une valeur spécifique.
 * - Si la valeur est en portfolio : affiche les lignes de cette valeur uniquement
 * - Sinon : propose de l'ajouter avec un formulaire inline
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Plus, Trash2, TrendingUp, TrendingDown,
  ChevronRight, Receipt, PackagePlus, Check,
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

// ── Ligne d'un lot ─────────────────────────────────────────────────────────────
function LotRow({
  pos, livePrice, onRemove,
}: {
  pos: PortfolioPosition
  livePrice: number
  onRemove: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const fees       = pos.fees ?? 0
  const costBasis  = pos.buy_price * pos.quantity + fees
  const currentVal = livePrice * pos.quantity
  const pnl        = currentVal - costBasis
  const pnlPct     = costBasis > 0 ? (pnl / costBasis) * 100 : 0
  const pnlPerShr  = pos.quantity > 0 ? pnl / pos.quantity : 0
  const up         = pnl >= 0

  const col   = up ? 'text-emerald-400' : 'text-red-400'
  const bgCol = up ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'

  return (
    <div className="border-b border-dark-700/40 last:border-b-0">
      <div className="flex items-stretch hover:bg-dark-700/20 transition-colors">
        {/* Bande couleur */}
        <div className={`w-0.5 shrink-0 self-stretch ${up ? 'bg-emerald-500/50' : 'bg-red-500/50'}`} />

        {/* Infos lot */}
        <div className="flex-1 px-4 py-3 min-w-0">
          <div className="flex items-baseline gap-2 text-xs font-mono">
            <span className="text-slate-400 font-semibold">
              {pos.quantity} act. × <span className="text-white">{pos.buy_price.toFixed(2)} €</span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-600">{pos.buy_date}</span>
            {fees > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-amber-600/80 flex items-center gap-0.5 text-[10px]">
                  <Receipt size={9} /> {fees.toFixed(2)} €
                </span>
              </>
            )}
          </div>
          <div className="text-[10px] text-slate-600 font-mono mt-0.5">
            coût réel {fmtEur(costBasis, 2)} · valeur {fmtEur(currentVal, 2)}
          </div>
        </div>

        {/* P&L — clic pour détail */}
        <button
          onClick={() => setExpanded(v => !v)}
          className={`shrink-0 flex flex-col items-center justify-center px-4 py-3 min-w-[110px]
            border-l border-dark-700/40 transition-colors
            ${up ? 'hover:bg-emerald-500/5' : 'hover:bg-red-500/5'}`}
        >
          <span className={`text-xl font-black font-mono tabular-nums leading-none ${col}`}>
            {up ? '+' : '−'}{fmtEur(Math.abs(pnl), 0)}
          </span>
          <span className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${col} opacity-70`}>
            {up ? 'plus-value' : 'moins-value'}
          </span>
          <span className={`text-xs font-mono tabular-nums mt-0.5 ${col}`}>{fmtPct(pnlPct)}</span>
          <ChevronRight size={9} className={`mt-1 opacity-30 transition-transform ${expanded ? 'rotate-90' : ''} ${col}`} />
        </button>

        {/* Supprimer */}
        <button
          onClick={() => onRemove(pos.id)}
          className="shrink-0 w-9 flex items-center justify-center self-stretch
            text-slate-700 hover:text-white hover:bg-red-500/80
            border-l border-dark-700/40 transition-all"
          title="Retirer cette ligne"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Détail dépliable */}
      {expanded && (
        <div className={`mx-3 mb-3 mt-1 rounded-xl border px-4 py-3 text-xs font-mono ${bgCol}`}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Par action</div>
              <div className="flex justify-between"><span className="text-slate-600">Achat</span><span>{pos.buy_price.toFixed(2)} €</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Actuel</span><span className="text-white">{livePrice.toFixed(2)} €</span></div>
              <div className={`flex justify-between font-bold border-t border-current/20 pt-1 mt-1 ${col}`}>
                <span>Δ / action</span><span>{pnlPerShr >= 0 ? '+' : ''}{pnlPerShr.toFixed(2)} €</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Total ({pos.quantity} act.)</div>
              <div className="flex justify-between"><span className="text-slate-600">Investi</span><span>{fmtEur(pos.buy_price * pos.quantity, 2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Valeur</span><span className="text-white">{fmtEur(currentVal, 2)}</span></div>
              <div className={`flex justify-between font-bold border-t border-current/20 pt-1 mt-1 ${col}`}>
                <span>Δ total</span><span>{up ? '+' : ''}{fmtEur(pnl, 2)}</span>
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-slate-600 mb-1.5">Frais & net</div>
              <div className="flex justify-between"><span className="text-slate-600">Frais</span>
                <span className={fees > 0 ? 'text-amber-500' : 'text-slate-600'}>{fees > 0 ? `−${fees.toFixed(2)} €` : '—'}</span>
              </div>
              <div className="flex justify-between"><span className="text-slate-600">Coût réel</span><span>{fmtEur(costBasis, 2)}</span></div>
              <div className={`flex justify-between font-bold border-t border-current/20 pt-1 mt-1 ${col}`}>
                <span>Net</span><span>{up ? '+' : ''}{fmtEur(pnl, 2)} <span className="opacity-60 font-normal">({fmtPct(pnlPct)})</span></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Formulaire d'ajout ─────────────────────────────────────────────────────────
function AddForm({
  symbol, livePrice, onAdd, onCancel,
}: {
  symbol: string
  livePrice: number | null
  onAdd: (pos: Omit<PortfolioPosition, 'id'>) => void
  onCancel?: () => void
}) {
  const [qty,   setQty]   = useState('1')
  const [price, setPrice] = useState(livePrice ? livePrice.toFixed(2) : '')
  const [fees,  setFees]  = useState('')

  const q = parseFloat(qty)   || 0
  const p = parseFloat(price) || 0
  const f = parseFloat(fees)  || 0
  const totalCost = q * p + f

  function handleConfirm() {
    if (!q || !p) return
    onAdd({
      symbol,
      name:      symbol,
      quantity:  q,
      buy_price: p,
      buy_date:  new Date().toISOString().split('T')[0],
      fees:      f || undefined,
    })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Quantité</label>
          <input
            type="number" min="0.001" step="0.001" value={qty}
            onChange={e => setQty(e.target.value)}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 outline-none
              border border-dark-600 focus:border-accent-blue font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Prix achat (€)</label>
          <input
            type="number" min="0" step="0.01" value={price}
            onChange={e => setPrice(e.target.value)}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 outline-none
              border border-dark-600 focus:border-accent-blue font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Frais (€)</label>
          <input
            type="number" min="0" step="0.01" value={fees}
            onChange={e => setFees(e.target.value)}
            placeholder="0.00"
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2 outline-none
              border border-dark-600 focus:border-amber-500 font-mono"
          />
        </div>
      </div>

      {/* Aperçu coût */}
      {q > 0 && p > 0 && (
        <div className="bg-dark-700/60 rounded-lg px-4 py-2.5 text-xs font-mono flex items-center justify-between">
          <span className="text-slate-500">Coût total estimé</span>
          <span className="text-white font-bold text-sm">{fmtEur(totalCost, 2)}</span>
          {fees ? <span className="text-amber-600/80 text-[10px]">dont {f.toFixed(2)} € de frais</span> : null}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={!q || !p}
          className="flex-1 flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30
            text-emerald-400 font-semibold py-2.5 rounded-xl transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          <Check size={14} /> Ajouter au portfolio
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-slate-500 hover:text-white text-sm transition-colors"
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────────
interface Props {
  symbol:      string
  positions:   PortfolioPosition[]
  onRemove:    (id: string) => void
  onAdd:       (pos: Omit<PortfolioPosition, 'id'>) => void
  user:        any
}

export function StockPortfolioPanel({ symbol, positions, onRemove, onAdd, user }: Props) {
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: quote } = useQuery({
    queryKey:        ['quote', symbol],
    queryFn:         () => getQuote(symbol),
    refetchInterval: 30_000,
  })

  const livePrice   = quote?.price ?? null
  const lots        = positions.filter(p => p.symbol === symbol)
  const inPortfolio = lots.length > 0

  // Totaux agrégés
  const totalQty     = lots.reduce((s, p) => s + p.quantity, 0)
  const totalCost    = lots.reduce((s, p) => s + p.buy_price * p.quantity + (p.fees ?? 0), 0)
  const totalCurrent = livePrice ? livePrice * totalQty : totalCost
  const totalPnl     = totalCurrent - totalCost
  const totalPct     = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  const globalUp     = totalPnl >= 0

  if (!user) {
    return (
      <div className="bg-dark-800 rounded-xl p-8 text-center">
        <PieChart size={32} className="mx-auto mb-3 text-slate-600 opacity-40" />
        <div className="text-sm text-slate-500">Connectez-vous pour gérer votre portfolio</div>
      </div>
    )
  }

  return (
    <div className="bg-dark-800 rounded-xl overflow-hidden border border-dark-600/50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart size={14} className="text-accent-blue shrink-0" />
          <span className="text-sm font-semibold text-white">
            {symbol} dans mon portfolio
          </span>
          {inPortfolio && (
            <span className="text-xs bg-dark-600 text-slate-400 px-2 py-0.5 rounded-full font-mono">
              {lots.length} lot{lots.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {inPortfolio && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs bg-accent-blue/20 hover:bg-accent-blue/30
              text-accent-blue px-2.5 py-1.5 rounded-lg transition-colors font-mono"
          >
            <Plus size={12} /> Ajouter un lot
          </button>
        )}
      </div>

      {/* ── Pas en portfolio ────────────────────────────────────────────── */}
      {!inPortfolio && !showAddForm && (
        <div className="py-10 px-6 text-center">
          <PackagePlus size={36} className="mx-auto mb-3 text-slate-600 opacity-30" />
          <div className="text-sm font-semibold text-slate-400 mb-1">
            {symbol} n'est pas encore dans votre portfolio
          </div>
          <div className="text-xs text-slate-600 mb-4">
            Ajoutez-le pour suivre votre plus ou moins-value en temps réel
          </div>
          {livePrice && (
            <div className="text-xs text-slate-500 font-mono mb-5">
              Cours actuel : <span className="text-white font-bold text-base">{livePrice.toFixed(2)} €</span>
            </div>
          )}
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-accent-blue/20 hover:bg-accent-blue/30
              text-accent-blue font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <Plus size={15} /> Ajouter {symbol} au portfolio
          </button>
        </div>
      )}

      {/* ── Formulaire ajout ────────────────────────────────────────────── */}
      {showAddForm && (
        <>
          <div className="px-4 py-2 bg-dark-700/40 border-b border-dark-700 text-xs text-slate-500 font-mono">
            {inPortfolio ? `Nouveau lot · cours actuel ${livePrice?.toFixed(2) ?? '—'} €` : `Cours actuel : ${livePrice?.toFixed(2) ?? '—'} €`}
          </div>
          <AddForm
            symbol={symbol}
            livePrice={livePrice}
            onAdd={pos => { onAdd(pos); setShowAddForm(false) }}
            onCancel={() => setShowAddForm(false)}
          />
        </>
      )}

      {/* ── Lots existants ──────────────────────────────────────────────── */}
      {inPortfolio && !showAddForm && (
        <>
          {/* Résumé agrégé (si plusieurs lots) */}
          {lots.length > 1 && livePrice && (
            <div className={`grid grid-cols-3 divide-x divide-dark-700 border-b border-dark-700
              ${globalUp ? 'bg-emerald-950/20' : 'bg-red-950/20'}`}>
              <div className="px-4 py-2.5 text-center">
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">Coût total</div>
                <div className="text-sm font-mono font-bold text-white tabular-nums">{fmtEur(totalCost)}</div>
              </div>
              <div className="px-4 py-2.5 text-center">
                <div className="text-[9px] font-mono text-slate-600 uppercase tracking-wider mb-0.5">Valeur actuelle</div>
                <div className="text-sm font-mono font-bold text-white tabular-nums">{fmtEur(totalCurrent)}</div>
              </div>
              <div className="px-4 py-2.5 text-center">
                <div className={`text-[9px] font-mono uppercase tracking-wider mb-0.5 ${globalUp ? 'text-emerald-600' : 'text-red-600'}`}>
                  {globalUp ? 'Plus-value totale' : 'Moins-value totale'}
                </div>
                <div className={`text-sm font-mono font-bold tabular-nums ${globalUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  {globalUp ? '+' : '−'}{fmtEur(Math.abs(totalPnl))}
                  <span className="text-[10px] ml-1 opacity-60">{fmtPct(totalPct)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Liste des lots */}
          {lots.map(lot => (
            <LotRow
              key={lot.id}
              pos={lot}
              livePrice={livePrice ?? lot.buy_price}
              onRemove={onRemove}
            />
          ))}
        </>
      )}
    </div>
  )
}
