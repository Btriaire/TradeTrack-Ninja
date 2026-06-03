import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, X, ChevronRight,
  BarChart2, Globe, Layers, Sparkles, BarChart,
} from 'lucide-react'
import { getTopSectors } from '../services/api'

interface StockInSector {
  symbol:       string
  name:         string
  country:      string
  index:        string
  price:        number
  change_pct:   number
  perf_5j:      number
  score:        number
  rsi:          number
  potential_pct:number
  tags:         string[]
  reason:       string
}

interface SectorData {
  sector:       string
  avg_score:    number
  avg_perf_5j:  number
  avg_potential:number
  avg_change:   number
  stock_count:  number
  countries:    string[]
  top_stocks:   StockInSector[]
  best_symbol:  string
  best_name:    string
}

interface TopSectorsResult {
  sectors:     SectorData[]
  all_sectors: SectorData[]
  brief:       string
  date:        string
}

// ── Barre de performance horizontale ───────────────────────────────────────
function PerfBar({ value, max = 10 }: { value: number; max?: number }) {
  const abs   = Math.min(Math.abs(value), max)
  const pct   = (abs / max) * 100
  const isUp  = value >= 0
  const color = isUp ? '#10b981' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold w-14 text-right ${isUp ? 'text-green-400' : 'text-red-400'}`}>
        {isUp ? '+' : ''}{value.toFixed(2)}%
      </span>
    </div>
  )
}

// ── Mini sparkline de score ─────────────────────────────────────────────────
function ScoreChip({ score }: { score: number }) {
  const color = score >= 2 ? 'text-green-400 bg-green-500/15 border-green-500/30'
              : score >= 0 ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
              : 'text-red-400 bg-red-500/15 border-red-500/30'
  return (
    <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {score > 0 ? '+' : ''}{score.toFixed(1)}
    </span>
  )
}

// ── Carte d'un secteur (dans la modale) ────────────────────────────────────
function SectorCard({
  sector, rank, onSelect,
}: {
  sector:   SectorData
  rank:     number
  onSelect: (s: string) => void
}) {
  const rankColors = [
    'from-emerald-500/20 border-emerald-500/40',
    'from-teal-500/10    border-teal-500/30',
    'from-cyan-500/10    border-cyan-500/30',
  ]
  const rankLabels = ['🥇', '🥈', '🥉']
  const rankAccent = ['text-emerald-400', 'text-teal-400', 'text-cyan-400']

  const isWeekUp = sector.avg_perf_5j >= 0

  return (
    <div className={`relative rounded-xl border bg-gradient-to-br ${rankColors[rank]} to-dark-800/50 p-4 overflow-hidden`}>
      {/* Rank badge */}
      <div className="absolute top-3 right-3 text-xl opacity-60">{rankLabels[rank]}</div>

      {/* Header secteur */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={14} className={rankAccent[rank]} />
          <span className={`font-bold text-sm tracking-wide ${rankAccent[rank]}`}>{sector.sector}</span>
        </div>
        {/* Pays */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {sector.countries.map((c, i) => (
            <span key={i} className="text-base">{c}</span>
          ))}
          <span className="text-xs text-slate-600 font-mono">· {sector.stock_count} valeur{sector.stock_count > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-dark-700/60 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-500 mb-0.5">Perf 5j</div>
          <div className={`text-sm font-mono font-bold ${isWeekUp ? 'text-green-400' : 'text-red-400'}`}>
            {isWeekUp ? '+' : ''}{sector.avg_perf_5j.toFixed(2)}%
          </div>
        </div>
        <div className="bg-dark-700/60 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-500 mb-0.5">Score moy.</div>
          <div className="flex justify-center">
            <ScoreChip score={sector.avg_score} />
          </div>
        </div>
        <div className="bg-dark-700/60 rounded-lg p-2 text-center">
          <div className="text-[10px] text-slate-500 mb-0.5">Potentiel</div>
          <div className={`text-sm font-mono font-bold ${sector.avg_potential >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {sector.avg_potential >= 0 ? '+' : ''}{sector.avg_potential.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Barre perf hebdo */}
      <div className="mb-3">
        <div className="text-[10px] text-slate-600 mb-1 tracking-wider">// PERF HEBDOMADAIRE</div>
        <PerfBar value={sector.avg_perf_5j} max={8} />
      </div>

      {/* Top stocks du secteur */}
      <div className="space-y-1.5 mb-3">
        <div className="text-[10px] text-slate-600 tracking-wider">// TOP VALEURS</div>
        {sector.top_stocks.map((s, i) => (
          <div
            key={s.symbol}
            onClick={() => onSelect(s.symbol)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-700/50 hover:bg-dark-700 cursor-pointer transition-colors group"
          >
            <span className="text-sm">{s.country}</span>
            <span className="font-mono text-xs font-bold text-white flex-1">{s.symbol}</span>
            <span className="text-xs text-slate-400 truncate max-w-[80px]">{s.name}</span>
            <span className={`text-xs font-mono font-semibold ${s.perf_5j >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {s.perf_5j >= 0 ? '+' : ''}{s.perf_5j.toFixed(1)}%
            </span>
            <ChevronRight size={10} className="text-slate-600 group-hover:text-white transition-colors" />
          </div>
        ))}
      </div>

      {/* CTA meilleure valeur */}
      <button
        onClick={() => onSelect(sector.best_symbol)}
        className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-semibold transition-colors border ${
          rank === 0
            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
            : rank === 1
            ? 'bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border-teal-500/30'
            : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/30'
        }`}
      >
        <BarChart2 size={12} />
        Analyser {sector.best_symbol}
        <ChevronRight size={12} />
      </button>
    </div>
  )
}

// ── Composant principal ─────────────────────────────────────────────────────
export function TopSectors({ onSelectSymbol }: { onSelectSymbol: (s: string) => void }) {
  const [modalOpen, setModalOpen] = useState(false)

  const { data, isLoading } = useQuery<TopSectorsResult>({
    queryKey:        ['top-sectors'],
    queryFn:         getTopSectors,
    staleTime:       30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  })

  if (isLoading || !data?.sectors?.length) return null

  const sectors = data.sectors

  const handleSelect = (symbol: string) => {
    setModalOpen(false)
    onSelectSymbol(symbol)
  }

  return (
    <>
      {/* ── Bannière slim ─────────────────────────────────────────────── */}
      <button
        onClick={() => setModalOpen(true)}
        className="w-full text-left group relative overflow-hidden shrink-0"
      >
        {/* Fond */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/35 via-dark-800 to-emerald-900/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/35 to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/15 to-transparent" />

        <div className="relative flex items-center gap-3 px-3 py-2 sm:px-4">
          {/* Badge gauche */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <TrendingUp size={14} className="text-emerald-400" />
              <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping opacity-60" />
            </div>
            <span className="text-emerald-400 font-bold text-xs tracking-widest uppercase hidden sm:block">
              Top Secteurs
            </span>
            <span className="text-emerald-400 font-bold text-[10px] tracking-widest uppercase sm:hidden">
              Secteurs
            </span>
          </div>

          {/* Séparateur */}
          <div className="h-4 w-px bg-emerald-500/30 shrink-0" />

          {/* Chips secteurs */}
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            {sectors.map((s, i) => {
              const isUp = s.avg_perf_5j >= 0
              return (
                <div key={s.sector} className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-lg border ${
                  i === 0
                    ? 'bg-emerald-500/15 border-emerald-500/30'
                    : 'bg-dark-700/60 border-slate-700/60'
                }`}>
                  {/* Flags */}
                  <span className="text-xs hidden sm:block">
                    {s.countries.slice(0, 2).join('')}
                  </span>
                  <span className={`font-semibold text-xs truncate max-w-[70px] ${i === 0 ? 'text-emerald-300' : 'text-slate-300'}`}>
                    {s.sector}
                  </span>
                  {isUp
                    ? <TrendingUp  size={9} className="text-green-400 shrink-0" />
                    : <TrendingDown size={9} className="text-red-400 shrink-0" />
                  }
                  <span className={`font-mono text-xs font-semibold shrink-0 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                    {isUp ? '+' : ''}{s.avg_perf_5j.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-1 text-emerald-400/70 group-hover:text-emerald-400 transition-colors text-xs font-semibold shrink-0">
            <span className="hidden sm:block">Détail</span>
            <ChevronRight size={12} />
          </div>
        </div>
      </button>

      {/* ── Modale détaillée ──────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:pt-12 overflow-y-auto">
          {/* Overlay */}
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} />

          {/* Contenu */}
          <div className="relative w-full max-w-2xl bg-dark-900 border border-emerald-500/20 rounded-2xl overflow-hidden shadow-2xl shadow-emerald-900/20">

            {/* Header */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-dark-800 to-dark-900" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

              <div className="relative flex items-start justify-between p-5">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-lg px-3 py-1">
                      <TrendingUp size={13} className="text-emerald-400" />
                      <span className="text-emerald-300 font-bold text-xs tracking-widest uppercase">Top Secteurs · Semaine</span>
                    </div>
                    <span className="text-slate-600 text-xs font-mono">{data.date}</span>
                  </div>

                  <p className="text-slate-300 text-sm leading-relaxed">
                    {data.brief
                      ? data.brief
                      : `Les 3 secteurs avec la plus forte dynamique haussière de la semaine, tous marchés confondus.`
                    }
                  </p>

                  {/* Stats globales */}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Globe size={11} className="text-emerald-400" />
                      <span>
                        {[...new Set(sectors.flatMap(s => s.countries))].join(' ')} couverts
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <BarChart size={11} className="text-cyan-400" />
                      <span>
                        {sectors.reduce((n, s) => n + s.stock_count, 0)} valeurs analysées
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Sparkles size={11} className="text-violet-400" />
                      <span>Perf moy. :</span>
                      <span className="text-green-400 font-mono font-semibold">
                        {sectors[0]?.avg_perf_5j >= 0 ? '+' : ''}{(sectors.reduce((s, sec) => s + sec.avg_perf_5j, 0) / sectors.length).toFixed(2)}% / 5j
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 text-slate-500 hover:text-white hover:bg-dark-700 rounded-lg transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Cards secteurs */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sectors.map((sector, i) => (
                <SectorCard key={sector.sector} sector={sector} rank={i} onSelect={handleSelect} />
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 pb-4 text-center">
              <p className="text-xs text-slate-700">
                // Performance 5 séances · Analyse algorithmique · Pas un conseil en investissement
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
