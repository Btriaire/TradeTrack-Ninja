import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Calculator, Info, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { simulateOrder, getTarifs } from '../services/api'
import type { FeeBreakdown } from '../types'

interface Props {
  symbol: string
  currentPrice?: number
}

export function OrderSimulator({ symbol, currentPrice }: Props) {
  const [quantite, setQuantite]   = useState(10)
  const [prix, setPrix]           = useState(currentPrice ?? 100)
  const [direction, setDirection] = useState<'achat' | 'vente'>('achat')
  const [srd, setSrd]             = useState(false)
  const [actionFr, setActionFr]   = useState(true)
  const [ttf, setTtf]             = useState(true)
  const [showTarifs, setShowTarifs] = useState(false)

  const montant = quantite * prix

  const mutation = useMutation({
    mutationFn: () => simulateOrder({
      montant,
      quantite,
      prix_unitaire: prix,
      action_francaise: actionFr,
      eligible_ttf: ttf,
      srd,
      marche: 'Euronext Paris',
    }),
  })

  const { data: tarifs } = useQuery({
    queryKey: ['tarifs'],
    queryFn: getTarifs,
    staleTime: Infinity,
  })

  const fees = mutation.data

  return (
    <div className="bg-dark-800 rounded-xl p-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calculator size={15} className="text-accent-blue" />
          <span className="text-sm font-semibold text-white">Simulateur LCL Bourse</span>
        </div>
        <button
          onClick={() => setShowTarifs(!showTarifs)}
          className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1"
        >
          <Info size={12} />
          <span className="hidden sm:inline">Grille tarifaire</span>
        </button>
      </div>

      {/* Tarifs panel */}
      {showTarifs && tarifs && (
        <div className="mb-4 p-3 bg-dark-700 rounded-lg text-xs space-y-1.5">
          <div className="font-semibold text-slate-300 mb-2">Tarifs LCL Bourse 2024 — Internet</div>
          {tarifs.courtage_internet?.map((t: any, i: number) => (
            <div key={i} className="flex justify-between text-slate-400">
              <span>{t.tranche}</span>
              <span className="text-yellow-400">{t.tarif}</span>
            </div>
          ))}
          <div className="border-t border-dark-600 pt-2 mt-2 space-y-1 text-slate-500">
            <div>TTF : {tarifs.ttf}</div>
            <div>SRD : {tarifs.srd}</div>
            <div>Droits de garde : {tarifs.droits_garde}</div>
          </div>
        </div>
      )}

      {/* Achat / Vente toggle */}
      <div className="flex rounded-lg overflow-hidden mb-4 border border-dark-600">
        <button
          onClick={() => setDirection('achat')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
            direction === 'achat' ? 'bg-green-500/20 text-green-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <TrendingUp size={14} /> ACHAT
        </button>
        <button
          onClick={() => setDirection('vente')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-1 ${
            direction === 'vente' ? 'bg-red-500/20 text-red-400' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <TrendingDown size={14} /> VENTE
        </button>
      </div>

      {/* Inputs — 2 colonnes sur tous les écrans */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Quantité</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={quantite}
            onChange={e => setQuantite(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2.5 outline-none border border-dark-600 focus:border-accent-blue/50"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Prix unitaire (€)</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0.01}
            value={prix}
            onChange={e => setPrix(parseFloat(e.target.value) || 0)}
            className="w-full bg-dark-700 text-white text-sm rounded-lg px-3 py-2.5 outline-none border border-dark-600 focus:border-accent-blue/50"
          />
        </div>
      </div>

      {/* Montant brut */}
      <div className="bg-dark-700 rounded-lg px-3 py-2.5 mb-4 flex justify-between items-center">
        <span className="text-xs text-slate-500">Montant brut</span>
        <span className="text-base font-bold text-white font-mono">{montant.toFixed(2)} €</span>
      </div>

      {/* Options */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-4 text-xs">
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={actionFr} onChange={e => setActionFr(e.target.checked)}
            className="accent-blue-500 w-4 h-4" />
          Action française
        </label>
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={ttf} onChange={e => setTtf(e.target.checked)}
            className="accent-blue-500 w-4 h-4" disabled={!actionFr} />
          Éligible TTF (cap &gt; 1 Mrd€)
        </label>
        <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
          <input type="checkbox" checked={srd} onChange={e => setSrd(e.target.checked)}
            className="accent-blue-500 w-4 h-4" />
          SRD (report)
        </label>
      </div>

      {/* CTA */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || montant <= 0}
        className="w-full bg-accent-blue hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg py-3 text-sm transition-colors"
      >
        {mutation.isPending ? 'Calcul en cours…' : 'Calculer les frais'}
      </button>

      {/* Résultats */}
      {fees && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Détail des frais
          </div>

          <div className="bg-dark-700 rounded-lg p-3 space-y-2 text-sm">
            <FeeRow label="Courtage internet"  value={fees.courtage} />
            <FeeRow label="TTF (0,30%)"        value={fees.ttf}  dimIfZero />
            <FeeRow label="SRD (0,032%)"       value={fees.srd}  dimIfZero />
            <div className="border-t border-dark-600 pt-2">
              <FeeRow label="Total frais" value={fees.total_frais} highlight />
              <div className="flex justify-between mt-1">
                <span className="text-slate-500 text-xs">Taux effectif</span>
                <span className="text-yellow-400 text-xs font-mono">{fees.taux_effectif_pct}%</span>
              </div>
            </div>
          </div>

          <div className={`rounded-lg p-3 text-sm font-bold flex justify-between items-center ${
            direction === 'achat'
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            <span className="text-slate-300 text-xs sm:text-sm">
              {direction === 'achat' ? 'Montant total à débiter' : 'Montant net à créditer'}
            </span>
            <span className={`font-mono ${direction === 'achat' ? 'text-green-400' : 'text-red-400'}`}>
              {direction === 'achat'
                ? fees.montant_net_achat?.toFixed(2)
                : fees.montant_net_vente?.toFixed(2)} €
            </span>
          </div>

          {direction === 'achat' && (
            <div className="bg-dark-700 rounded-lg px-3 py-2 flex justify-between text-xs">
              <span className="text-slate-500">Seuil de rentabilité / action</span>
              <span className="text-yellow-400 font-mono">{fees.seuil_rentabilite_par_action} €</span>
            </div>
          )}

          {fees.types_ordres?.length > 0 && (
            <div className="bg-dark-700 rounded-lg px-3 py-2">
              <div className="text-xs text-slate-500 mb-1">Types d'ordres disponibles</div>
              <div className="flex flex-wrap gap-1">
                {fees.types_ordres.map((t: string) => (
                  <span key={t} className="text-xs bg-dark-600 text-slate-300 rounded px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-slate-600 mt-2">
            <AlertCircle size={12} className="shrink-0 mt-0.5" />
            <span>{fees.note}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function FeeRow({ label, value, highlight, dimIfZero }: {
  label: string; value: number; highlight?: boolean; dimIfZero?: boolean
}) {
  const dim = dimIfZero && value === 0
  return (
    <div className={`flex justify-between ${dim ? 'opacity-30' : ''}`}>
      <span className={highlight ? 'text-white font-semibold' : 'text-slate-400'}>{label}</span>
      <span className={`font-mono ${highlight ? 'text-white font-semibold' : 'text-slate-300'}`}>
        {value?.toFixed(2)} €
      </span>
    </div>
  )
}
