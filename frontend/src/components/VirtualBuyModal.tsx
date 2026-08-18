/**
 * VirtualBuyModal — achat virtuel dans le Labo Trading.
 * Thème cyan néon volontairement très distinct du SearchModal du vrai portfolio.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Search, FlaskConical, Zap, Check } from 'lucide-react'
import { searchStocks, getQuote } from '../services/api'
import { calcLclFees } from '../utils/lcl-fees'
import type { SearchResult, VirtualPosition } from '../types'

function fmtEur(v: number, dec = 2) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'
}

interface Props {
  onClose:    () => void
  onBuy:      (pos: Omit<VirtualPosition, 'id'>) => Promise<boolean>
  balance:    number
}

export function VirtualBuyModal({ onClose, onBuy, balance }: Props) {
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [qty,      setQty]      = useState('1')
  const [price,    setPrice]    = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [buying,   setBuying]   = useState(false)
  const [done,     setDone]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const { data: results = [] } = useQuery({
    queryKey: ['virtual-search', query],
    queryFn:  () => searchStocks(query, 'ALL'),
    enabled:  query.length >= 2 && !selected,
  })

  const { data: quote } = useQuery({
    queryKey: ['virtual-quote', selected?.symbol],
    queryFn:  () => getQuote(selected!.symbol),
    enabled:  !!selected,
  })

  useEffect(() => {
    if (quote?.price && !price) setPrice(quote.price.toFixed(2))
  }, [quote])

  const q = parseFloat(qty) || 0
  const p = parseFloat(price) || 0
  const lcl = useMemo(() => selected ? calcLclFees(selected.symbol, q, p) : null, [selected, q, p])
  const totalCost = q * p + (lcl?.total ?? 0)
  const insufficient = totalCost > balance

  async function handleConfirm() {
    if (!selected || !q || !p || insufficient) return
    setBuying(true); setError(null)
    const ok = await onBuy({
      symbol: selected.symbol,
      name:   selected.name || selected.symbol,
      quantity: q,
      buy_price: p,
      buy_date: new Date().toISOString().split('T')[0],
      fees: lcl && lcl.total > 0 ? lcl.total : undefined,
    })
    setBuying(false)
    if (ok) { setDone(true); setTimeout(onClose, 1100) }
    else setError('Capital virtuel insuffisant pour cet ordre.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-black border border-cyan-500/40 rounded-2xl overflow-hidden mt-16 sm:mt-0"
        style={{ boxShadow: '0 0 40px rgba(34,211,238,0.15), 0 0 0 1px rgba(34,211,238,0.1) inset' }}
      >
        {/* Header néon */}
        <div className="px-4 py-3 border-b border-cyan-500/30 flex items-center justify-between bg-cyan-500/5">
          <div className="flex items-center gap-2">
            <FlaskConical size={15} className="text-cyan-400" />
            <span className="text-sm font-bold text-cyan-300 font-mono tracking-wide">ACHAT VIRTUEL</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-cyan-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <Check size={32} className="mx-auto mb-3 text-cyan-400" />
            <div className="text-cyan-300 font-mono text-sm">Ordre fictif exécuté ✓</div>
          </div>
        ) : !selected ? (
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-600" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher une action…"
                className="w-full bg-dark-900 border border-cyan-500/20 focus:border-cyan-400/60 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white outline-none font-mono placeholder:text-slate-700"
              />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {results.map(r => (
                <button
                  key={r.symbol}
                  onClick={() => setSelected(r)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <div className="text-sm font-bold text-white font-mono group-hover:text-cyan-300">{r.symbol}</div>
                    <div className="text-xs text-slate-500 truncate max-w-[220px]">{r.name}</div>
                  </div>
                  <span className="text-[10px] text-cyan-600 font-mono">{r.exchange}</span>
                </button>
              ))}
              {query.length >= 2 && results.length === 0 && (
                <div className="text-center text-xs text-slate-600 py-6 font-mono">Aucun résultat</div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <button
              onClick={() => { setSelected(null); setPrice('') }}
              className="text-xs text-cyan-600 hover:text-cyan-400 font-mono mb-1"
            >
              ← changer de valeur
            </button>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-white font-mono">{selected.symbol}</div>
                <div className="text-xs text-slate-500">{selected.name}</div>
              </div>
              {quote?.price && (
                <div className="text-right">
                  <div className="text-[10px] text-cyan-600 font-mono uppercase tracking-wider">Cours</div>
                  <div className="text-cyan-300 font-mono font-bold">{quote.price.toFixed(2)} €</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-cyan-600 uppercase tracking-wider block mb-1 font-mono">Quantité</label>
                <input
                  type="number" min="0.001" step="0.001" value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="w-full bg-dark-900 border border-cyan-500/20 focus:border-cyan-400/60 rounded-lg px-3 py-2 text-sm text-white outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-cyan-600 uppercase tracking-wider block mb-1 font-mono">Prix (€)</label>
                <input
                  type="number" min="0" step="0.01" value={price}
                  onChange={e => setPrice(e.target.value)}
                  className="w-full bg-dark-900 border border-cyan-500/20 focus:border-cyan-400/60 rounded-lg px-3 py-2 text-sm text-white outline-none font-mono"
                />
              </div>
            </div>

            {lcl && q > 0 && p > 0 && (
              <div className="bg-dark-900 border border-cyan-500/15 rounded-lg px-3 py-2 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-slate-500">
                  <span>Montant ordre</span><span className="text-slate-300">{fmtEur(q * p)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span className="flex items-center gap-1"><Zap size={9} className="text-amber-400" />Frais LCL</span>
                  <span className="text-amber-400">{fmtEur(lcl.total)}</span>
                </div>
                <div className={`flex justify-between font-bold border-t border-cyan-500/15 pt-1 mt-1 ${insufficient ? 'text-red-400' : 'text-cyan-300'}`}>
                  <span>Coût total</span><span>{fmtEur(totalCost)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between text-[10px] font-mono text-slate-600">
              <span>Capital disponible</span>
              <span className={insufficient ? 'text-red-400' : 'text-cyan-500'}>{fmtEur(balance)}</span>
            </div>

            {error && <div className="text-xs text-red-400 font-mono">{error}</div>}

            <button
              onClick={handleConfirm}
              disabled={!q || !p || insufficient || buying}
              className="w-full flex items-center justify-center gap-2 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 disabled:opacity-30 disabled:cursor-not-allowed text-cyan-300 font-bold font-mono py-2.5 rounded-xl transition-colors text-sm"
            >
              <FlaskConical size={14} />
              {buying ? 'Exécution…' : insufficient ? 'Capital insuffisant' : `Acheter ${q || 0} act. (fictif)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
