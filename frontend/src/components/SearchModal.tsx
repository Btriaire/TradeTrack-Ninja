import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Plus, BookmarkPlus, Zap } from 'lucide-react'
import { searchStocks } from '../services/api'
import { calcLclFees, calcBreakeven, isPeaEligible } from '../utils/lcl-fees'
import type { SearchResult, WatchlistItem, PortfolioPosition } from '../types'

const MARKETS = [
  { id: 'ALL', flag: '🌍', label: 'Tous'        },
  { id: 'FR',  flag: '🇫🇷', label: 'France'      },
  { id: 'US',  flag: '🇺🇸', label: 'États-Unis'  },
  { id: 'DE',  flag: '🇩🇪', label: 'Allemagne'   },
  { id: 'GB',  flag: '🇬🇧', label: 'Royaume-Uni' },
  { id: 'NL',  flag: '🇳🇱', label: 'Pays-Bas'    },
  { id: 'BE',  flag: '🇧🇪', label: 'Belgique'    },
  { id: 'ES',  flag: '🇪🇸', label: 'Espagne'     },
  { id: 'IT',  flag: '🇮🇹', label: 'Italie'      },
  { id: 'JP',  flag: '🇯🇵', label: 'Japon'       },
]

const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'Action', ETF: 'ETF', INDEX: 'Indice',
}

interface Props {
  onClose:           () => void
  onSelectSymbol:    (symbol: string) => void
  onAddToWatchlist:  (item: WatchlistItem) => void
  onAddToPortfolio:  (item: Omit<PortfolioPosition, 'id'>) => void
  watchlistSymbols:  string[]
}

export function SearchModal({
  onClose, onSelectSymbol, onAddToWatchlist, onAddToPortfolio, watchlistSymbols,
}: Props) {
  const [query,  setQuery]  = useState('')
  const [market, setMarket] = useState('ALL')
  const [adding,    setAdding]    = useState<string | null>(null)
  const [qty,       setQty]       = useState('1')
  const [price,     setPrice]     = useState('')
  const [feesAuto,  setFeesAuto]  = useState(true)
  const [feesManual,setFeesManual]= useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Fermer sur Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', query, market],
    queryFn:  () => searchStocks(query, market),
    enabled:  query.length >= 1,
    staleTime: 30000,
  })

  const handleSelect = (r: SearchResult) => {
    onSelectSymbol(r.symbol)
    onClose()
  }

  const handleAddWatchlist = (e: React.MouseEvent, r: SearchResult) => {
    e.stopPropagation()
    onAddToWatchlist({ symbol: r.symbol, name: r.name })
  }

  const handleOpenPortfolio = (e: React.MouseEvent, r: SearchResult) => {
    e.stopPropagation()
    setAdding(r.symbol)
    setPrice('')
    setFeesManual('')
    setFeesAuto(true)
  }

  const confirmAddPortfolio = (r: SearchResult, feesValue: number) => {
    onAddToPortfolio({
      symbol:    r.symbol,
      name:      r.name,
      quantity:  parseFloat(qty) || 1,
      buy_price: parseFloat(price) || 0,
      buy_date:  new Date().toISOString().split('T')[0],
      fees:      feesValue > 0 ? feesValue : undefined,
    })
    setAdding(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-dark-800 rounded-2xl shadow-2xl border border-dark-600 overflow-hidden">

        {/* Barre de recherche */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-700">
          <Search size={18} className="text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher une action, ETF… ex: LVMH, Apple, TotalEnergies"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-600"
          />
          {isFetching && <div className="w-4 h-4 border-2 border-accent-blue border-t-transparent rounded-full animate-spin shrink-0" />}
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Filtres marché */}
        <div className="flex gap-1.5 px-4 py-2.5 border-b border-dark-700 overflow-x-auto scrollbar-none">
          {MARKETS.map(m => (
            <button
              key={m.id}
              onClick={() => setMarket(m.id)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                market === m.id
                  ? 'bg-accent-blue text-white'
                  : 'bg-dark-700 text-slate-400 hover:text-white'
              }`}
            >
              <span>{m.flag}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Résultats */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query && (
            <div className="py-10 text-center text-slate-600 text-sm">
              <Search size={28} className="mx-auto mb-2 opacity-20" />
              Tapez le nom ou symbole d'une valeur
            </div>
          )}

          {query && results.length === 0 && !isFetching && (
            <div className="py-8 text-center text-slate-600 text-sm">
              Aucun résultat pour "{query}" sur {MARKETS.find(m => m.id === market)?.label}
            </div>
          )}

          {results.map(r => (
            <div key={r.symbol}>
              <div
                onClick={() => handleSelect(r)}
                className="flex items-center justify-between px-4 py-3 hover:bg-dark-700 cursor-pointer transition-colors border-b border-dark-700/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white font-mono">{r.symbol}</span>
                    <span className="text-xs bg-dark-600 text-slate-400 px-1.5 py-0.5 rounded">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </span>
                    <span className="text-xs text-slate-600">{r.exchange}</span>
                    {isPeaEligible(r.symbol) && (
                      <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono tracking-wide">PEA</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{r.name}</div>
                </div>

                <div className="flex items-center gap-1 ml-3 shrink-0">
                  {!watchlistSymbols.includes(r.symbol) && (
                    <button
                      onClick={e => handleAddWatchlist(e, r)}
                      title="Ajouter à la watchlist"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-accent-blue hover:bg-accent-blue/10 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  <button
                    onClick={e => handleOpenPortfolio(e, r)}
                    title="Ajouter au portfolio"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                  >
                    <BookmarkPlus size={14} />
                  </button>
                </div>
              </div>

              {/* Formulaire ajout portfolio inline */}
              {adding === r.symbol && (() => {
                const q2 = parseFloat(qty) || 0
                const p2 = parseFloat(price) || 0
                const lcl2 = calcLclFees(r.symbol, q2, p2)
                const feesVal = feesAuto ? lcl2.total : (parseFloat(feesManual) || 0)
                const totalCost2 = q2 * p2 + feesVal
                const bk = calcBreakeven(p2, q2, feesVal)
                return (
                  <div className="px-4 py-3 bg-dark-700/60 border-b border-dark-600 space-y-2">
                    <div className="text-xs text-slate-400 font-semibold">Ajouter au portfolio</div>

                    {/* Qté + Prix */}
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-600 uppercase tracking-wider">Quantité</span>
                        <input type="number" min="0.001" step="0.001" value={qty}
                          onChange={e => setQty(e.target.value)} placeholder="1"
                          className="w-20 bg-dark-600 text-white text-xs rounded-lg px-2 py-1.5 outline-none border border-dark-500 focus:border-accent-blue font-mono" />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-600 uppercase tracking-wider">Prix achat (€)</span>
                        <input type="number" min="0" step="0.01" value={price}
                          onChange={e => setPrice(e.target.value)} placeholder="0.00"
                          className="w-28 bg-dark-600 text-white text-xs rounded-lg px-2 py-1.5 outline-none border border-dark-500 focus:border-accent-blue font-mono" />
                      </div>
                    </div>

                    {/* Frais LCL auto */}
                    <div className="bg-dark-600/60 rounded-lg border border-dark-500 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-dark-500">
                        <div className="flex items-center gap-1.5">
                          <Zap size={10} className="text-amber-400" />
                          <span className="text-[10px] font-semibold text-slate-300">Frais LCL Bourse</span>
                        </div>
                        <button onClick={() => setFeesAuto(v => !v)}
                          className={`text-[9px] px-2 py-0.5 rounded font-mono transition-colors ${
                            feesAuto ? 'bg-amber-500/20 text-amber-400' : 'bg-dark-500 text-slate-500'
                          }`}>
                          {feesAuto ? '⚡ Auto' : '✏️ Manuel'}
                        </button>
                      </div>
                      {feesAuto && q2 > 0 && p2 > 0 ? (
                        <div className="px-3 py-1.5 text-[10px] font-mono space-y-0.5">
                          <div className="flex justify-between text-slate-500"><span>Courtage</span><span>{lcl2.courtage.toFixed(2)} €</span></div>
                          {lcl2.ttf > 0 && <div className="flex justify-between text-slate-500"><span>TTF (0,30% FR)</span><span>{lcl2.ttf.toFixed(2)} €</span></div>}
                          {lcl2.stampDuty > 0 && <div className="flex justify-between text-slate-500"><span>Stamp UK (0,50%)</span><span>{lcl2.stampDuty.toFixed(2)} €</span></div>}
                          <div className="flex justify-between font-bold text-amber-400 border-t border-dark-500 pt-0.5 mt-0.5">
                            <span>Total frais</span><span>{lcl2.total.toFixed(2)} €</span>
                          </div>
                        </div>
                      ) : feesAuto ? (
                        <div className="px-3 py-1.5 text-[10px] text-slate-600 font-mono">Saisissez qté + prix</div>
                      ) : (
                        <div className="px-3 py-1.5">
                          <input type="number" min="0" step="0.01" value={feesManual}
                            onChange={e => setFeesManual(e.target.value)} placeholder="Frais réels (€)"
                            className="w-full bg-dark-500 text-white text-xs rounded px-2 py-1 outline-none border border-dark-400 focus:border-amber-500 font-mono" />
                        </div>
                      )}
                    </div>

                    {/* Récap + seuil */}
                    {q2 > 0 && p2 > 0 && (
                      <div className="flex gap-2 text-[10px] font-mono">
                        <div className="flex-1 bg-dark-600/50 rounded px-2 py-1.5">
                          <div className="text-slate-600">Coût réel</div>
                          <div className="text-white font-bold">{totalCost2.toFixed(2)} €</div>
                        </div>
                        <div className="flex-1 bg-dark-600/50 rounded px-2 py-1.5">
                          <div className="text-slate-600">Seuil rentabilité</div>
                          <div className="text-amber-400 font-bold">{bk > 0 ? bk.toFixed(2) + ' €' : '—'}</div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={() => confirmAddPortfolio(r, feesVal)}
                        className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold">
                        ✓ Confirmer
                      </button>
                      <button onClick={() => setAdding(null)}
                        className="text-slate-500 hover:text-white text-xs px-2 py-1.5 transition-colors">
                        Annuler
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
