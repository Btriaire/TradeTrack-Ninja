import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Zap, TrendingUp, TrendingDown, X, Target, ChevronRight,
  BarChart2, Clock, Award, Sparkles,
} from 'lucide-react'
import { getGameOfDay } from '../services/api'

interface Pick {
  symbol:       string
  name:         string
  index:        string
  country:      string
  price:        number
  change_pct:   number
  score:        number
  rsi:          number
  tags:         string[]
  potential_pct:number
  horizon:      string
  reason:       string
  signal:       string
}

interface GameData {
  picks:        Pick[]
  brief:        string
  date:         string
  generated_at: string
}

// ── Mini score arc ──────────────────────────────────────────────────────────
function ScoreArc({ score }: { score: number }) {
  // score peut aller de -5 à +8, on normalise à 0-10
  const normalized = Math.min(10, Math.max(0, (score + 2) * 1.25))
  const R = 22, cx = 26, cy = 28
  const startAngle = -180, endAngle = 0
  const angle = startAngle + (normalized / 10) * 180
  const toXY = (deg: number, r = R) => {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const [x1, y1] = toXY(startAngle)
  const [x2, y2] = toXY(endAngle)
  const [fx, fy] = toXY(angle)
  const color = score >= 3 ? '#10b981' : score >= 1.5 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="52" height="30" viewBox="0 0 52 30" className="overflow-visible">
      <path d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
        fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round"/>
      <path d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${fx} ${fy}`}
        fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" opacity="0.9"/>
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold" fontFamily="monospace">
        {score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1)}
      </text>
    </svg>
  )
}

// ── Carte détaillée d'un pick (dans la modale) ──────────────────────────────
function PickCard({ pick, rank, onSelect }: { pick: Pick; rank: number; onSelect: (s: string) => void }) {
  const isUp = pick.potential_pct >= 0
  const rankColors = ['from-amber-500/20 border-amber-500/40', 'from-slate-400/10 border-slate-500/30', 'from-orange-600/10 border-orange-600/30']
  const rankIcons  = ['🥇', '🥈', '🥉']

  return (
    <div className={`relative rounded-xl border bg-gradient-to-br ${rankColors[rank]} to-dark-800/50 p-4 overflow-hidden`}>
      {/* Rank badge */}
      <div className="absolute top-3 right-3 text-xl opacity-60">{rankIcons[rank]}</div>

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <ScoreArc score={pick.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{pick.country}</span>
            <span className="font-mono font-bold text-white text-sm">{pick.symbol}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-dark-700 text-slate-400 font-mono">{pick.index}</span>
          </div>
          <div className="text-slate-300 text-sm font-medium truncate">{pick.name}</div>
        </div>
      </div>

      {/* Prix + potentiel */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 bg-dark-700/60 rounded-lg px-3 py-2">
          <div className="text-xs text-slate-500 mb-0.5">Prix actuel</div>
          <div className="font-mono font-bold text-white">{pick.price.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</div>
        </div>
        <div className={`flex-1 rounded-lg px-3 py-2 ${isUp ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
          <div className="text-xs text-slate-500 mb-0.5">Potentiel</div>
          <div className={`font-mono font-bold text-lg ${isUp ? 'text-green-400' : 'text-red-400'}`}>
            {isUp ? '+' : ''}{pick.potential_pct.toFixed(1)}%
          </div>
        </div>
        <div className="flex-1 bg-dark-700/60 rounded-lg px-3 py-2">
          <div className="text-xs text-slate-500 mb-0.5">Horizon</div>
          <div className="text-xs font-mono text-cyan-400">{pick.horizon}</div>
        </div>
      </div>

      {/* RSI + tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono border ${
          pick.rsi <= 35 ? 'bg-green-500/15 text-green-400 border-green-500/30' :
          pick.rsi >= 65 ? 'bg-red-500/15 text-red-400 border-red-500/30' :
          'bg-slate-500/15 text-slate-400 border-slate-500/30'
        }`}>
          RSI {pick.rsi.toFixed(0)}
        </span>
        {pick.tags.map((t, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-amber-500/10 text-amber-300/80 border border-amber-500/20">
            {t}
          </span>
        ))}
      </div>

      {/* Raison IA */}
      {pick.reason && (
        <div className="flex items-start gap-2 mb-3 bg-dark-700/40 rounded-lg p-2.5">
          <Sparkles size={11} className="text-violet-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 italic leading-relaxed">{pick.reason}</p>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => onSelect(pick.symbol)}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors"
      >
        <BarChart2 size={12} /> Analyser {pick.symbol}
        <ChevronRight size={12} />
      </button>
    </div>
  )
}

// ── Composant principal ─────────────────────────────────────────────────────
export function GameOfDay({ onSelectSymbol }: { onSelectSymbol: (s: string) => void }) {
  const [modalOpen, setModalOpen] = useState(false)

  const { data, isLoading } = useQuery<GameData>({
    queryKey:      ['game-of-day'],
    queryFn:       getGameOfDay,
    staleTime:     30 * 60 * 1000,   // 30 min
    refetchInterval: 60 * 60 * 1000, // 1h
  })

  if (isLoading || !data?.picks?.length) return null

  const top = data.picks[0]
  const picks = data.picks

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
        {/* Fond dégradé animé */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-900/40 via-dark-800 to-amber-900/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />

        <div className="relative flex items-center gap-3 px-3 py-2 sm:px-4">
          {/* Badge gauche */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <Zap size={14} className="text-amber-400" fill="currentColor" />
              <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping opacity-75" />
            </div>
            <span className="text-amber-400 font-bold text-xs tracking-widest uppercase hidden sm:block">
              Game of Today
            </span>
            <span className="text-amber-400 font-bold text-[10px] tracking-widest uppercase sm:hidden">
              Game
            </span>
          </div>

          {/* Séparateur */}
          <div className="h-4 w-px bg-amber-500/30 shrink-0" />

          {/* Picks en ligne */}
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            {picks.map((p, i) => (
              <div key={p.symbol} className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-lg border ${
                i === 0
                  ? 'bg-amber-500/15 border-amber-500/30'
                  : 'bg-dark-700/60 border-slate-700/60'
              }`}>
                <span className="text-xs hidden sm:block">{p.country}</span>
                <span className={`font-mono font-bold text-xs ${i === 0 ? 'text-amber-300' : 'text-slate-300'}`}>
                  {p.symbol}
                </span>
                <TrendingUp size={10} className="text-green-400" />
                <span className="text-green-400 font-mono text-xs font-semibold">
                  +{p.potential_pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>

          {/* Date + CTA */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-600 text-[10px] font-mono hidden md:block">{data.date}</span>
            <div className="flex items-center gap-1 text-amber-400/70 group-hover:text-amber-400 transition-colors text-xs font-semibold">
              <span className="hidden sm:block">Détail</span>
              <ChevronRight size={12} />
            </div>
          </div>
        </div>
      </button>

      {/* ── Modale détaillée ──────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:pt-12 overflow-y-auto">
          {/* Overlay */}
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} />

          {/* Contenu */}
          <div className="relative w-full max-w-2xl bg-dark-900 border border-amber-500/20 rounded-2xl overflow-hidden shadow-2xl shadow-amber-900/20">

            {/* Header modale */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-900/30 via-dark-800 to-dark-900" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

              <div className="relative flex items-start justify-between p-5">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/40 rounded-lg px-3 py-1">
                      <Zap size={13} className="text-amber-400" fill="currentColor" />
                      <span className="text-amber-300 font-bold text-xs tracking-widest uppercase">The Game of Today</span>
                    </div>
                    <span className="text-slate-600 text-xs font-mono">{data.date}</span>
                  </div>

                  <p className="text-slate-300 text-sm leading-relaxed max-w-lg">
                    {data.brief
                      ? data.brief
                      : `Top ${picks.length} valeurs avec le meilleur potentiel de hausse à court terme, sélectionnées par analyse technique.`
                    }
                  </p>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Target size={11} className="text-amber-400" />
                      <span>Potentiel moyen :</span>
                      <span className="text-green-400 font-mono font-semibold">
                        +{(picks.reduce((s, p) => s + p.potential_pct, 0) / picks.length).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock size={11} className="text-cyan-400" />
                      <span>Horizon :</span>
                      <span className="text-cyan-400 font-mono">{top.horizon}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Award size={11} className="text-violet-400" />
                      <span>{picks.length} valeurs sélectionnées sur {40}+ analysées</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 text-slate-500 hover:text-white hover:bg-dark-700 rounded-lg transition-colors shrink-0 ml-3"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Cards picks */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {picks.map((pick, i) => (
                <PickCard key={pick.symbol} pick={pick} rank={i} onSelect={handleSelect} />
              ))}
            </div>

            {/* Footer disclaimer */}
            <div className="px-5 pb-4 text-center">
              <p className="text-xs text-slate-700">
                // Sélection algorithmique basée sur indicateurs techniques · Pas un conseil en investissement
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
