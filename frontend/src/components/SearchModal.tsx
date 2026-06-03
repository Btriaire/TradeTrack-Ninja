import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, Plus, BookmarkPlus } from 'lucide-react'
import { searchStocks } from '../services/api'
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
  const [adding, setAdding] = useState<string | null>(null)  // symbol en cours d'ajout portfolio
  const [qty,    setQty]    = useState('1')
  const [price,  setPrice]  = useState('')
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
  }

  const confirmAddPortfolio = (r: SearchResult) => {
    onAddToPortfolio({
      symbol:    r.symbol,
      name:      r.name,
      quantity:  parseFloat(qty) || 1,
      buy_price: parseFloat(price) || 0,
      buy_date:  new Date().toISOString().split('T')[0],
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
              {adding === r.symbol && (
                <div className="px-4 py-3 bg-dark-700/60 border-b border-dark-600 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400">Ajouter au portfolio :</span>
                  <input
                    type="number" min="0.001" step="0.001"
                    value={qty} onChange={e => setQty(e.target.value)}
                    placeholder="Qté"
                    className="w-20 bg-dark-600 text-white text-xs rounded-lg px-2 py-1.5 outline-none border border-dark-500"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={price} onChange={e => setPrice(e.target.value)}
                    placeholder="Prix achat (€)"
                    className="w-32 bg-dark-600 text-white text-xs rounded-lg px-2 py-1.5 outline-none border border-dark-500"
                  />
                  <button
                    onClick={() => confirmAddPortfolio(r)}
                    className="bg-green-500/20 text-green-400 hover:bg-green-500/30 text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Confirmer
                  </button>
                  <button
                    onClick={() => setAdding(null)}
                    className="text-slate-500 hover:text-white text-xs px-2 py-1.5 transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
