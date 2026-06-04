import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Activity, AlertTriangle, TrendingUp, TrendingDown,
  Minus, ChevronDown, ChevronUp, Zap, Eye, EyeOff, RefreshCw,
  Users, Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { analyzeDiagnostic, getTargets } from '../services/api'
import type { Candle, Indicators, Article } from '../types'

interface Props {
  symbol:     string
  name?:      string
  sector?:    string
  index?:     string
  candles:    Candle[]
  indicators?: Indicators
  articles:   Article[]
}

interface DiagResult {
  diagnostic: {
    etat:             'HAUSSIER' | 'BAISSIER' | 'NEUTRE'
    force:            number
    technique:        string
    pattern_principal:string
    support:          number | null
    resistance:       number | null
    sentiment_news:   'POSITIF' | 'NÉGATIF' | 'NEUTRE'
    resume:           string
  }
  pronostic: {
    court_terme: { horizon: string; direction: string; cible_prix: number; confiance: number }
    moyen_terme: { horizon: string; direction: string; cible_prix: number; confiance: number }
    risques:     string[]
    catalyseurs: string[]
    verdict:     'ACHETER' | 'RENFORCER' | 'CONSERVER' | 'ALLÉGER' | 'ÉVITER'
  }
  explanation?:        string
  patterns_detected?:  Record<string, any>
}

// ── SVG Gauge ─────────────────────────────────────────────────────────────────
function Gauge({ score, label }: { score: number; label: string }) {
  // score: 1–10, arc semi-circulaire
  const R = 52, cx = 64, cy = 68
  const startAngle = -180
  const endAngle   = 0
  const angle = startAngle + (score / 10) * 180

  function polar(deg: number, r = R): [number, number] {
    const rad = (deg * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }

  // Arc de fond
  const [x1, y1] = polar(startAngle)
  const [x2, y2] = polar(endAngle)

  // Arc rempli
  const fillAngle = angle
  const [fx, fy] = polar(fillAngle)

  const color = score >= 7 ? '#10b981' : score >= 4 ? '#f59e0b' : '#ef4444'
  const zone   = score >= 7 ? 'FORT'   : score >= 4 ? 'MODÉRÉ' : 'FAIBLE'

  // Aiguille
  const [nx, ny] = polar(angle, R - 8)

  return (
    <svg width="128" height="72" viewBox="0 0 128 72" className="overflow-visible">
      {/* Fond arc */}
      <path d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
        fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round"/>
      {/* Zones couleur */}
      {[
        { start: -180, end: -120, c: '#ef4444' },
        { start: -120, end: -60,  c: '#f59e0b' },
        { start: -60,  end: 0,    c: '#10b981' },
      ].map(({ start, end, c }, i) => {
        const [ax, ay] = polar(start)
        const [bx, by] = polar(end)
        const large = Math.abs(end - start) > 180 ? 1 : 0
        return (
          <path key={i}
            d={`M ${ax} ${ay} A ${R} ${R} 0 ${large} 1 ${bx} ${by}`}
            fill="none" stroke={c} strokeWidth="10" strokeLinecap="butt" opacity="0.25"/>
        )
      })}
      {/* Arc rempli jusqu'à la valeur */}
      <path d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${fx} ${fy}`}
        fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" opacity="0.85"/>
      {/* Aiguille */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r="4" fill={color}/>
      {/* Score */}
      <text x={cx} y={cy - 16} textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="monospace">
        {score}/10
      </text>
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="9" fontFamily="monospace" letterSpacing="1">
        {zone}
      </text>
    </svg>
  )
}

// ── Badge direction ────────────────────────────────────────────────────────────
function DirectionBadge({ dir }: { dir: string }) {
  const cfg: Record<string, { icon: any; cls: string }> = {
    'HAUSSE':   { icon: TrendingUp,   cls: 'text-green-400 bg-green-500/15 border-green-500/30' },
    'BAISSE':   { icon: TrendingDown, cls: 'text-red-400   bg-red-500/15   border-red-500/30'   },
    'LATÉRAL':  { icon: Minus,        cls: 'text-slate-400 bg-slate-500/15 border-slate-500/30' },
    'HAUSSIER': { icon: TrendingUp,   cls: 'text-green-400 bg-green-500/15 border-green-500/30' },
    'BAISSIER': { icon: TrendingDown, cls: 'text-red-400   bg-red-500/15   border-red-500/30'   },
    'NEUTRE':   { icon: Minus,        cls: 'text-slate-400 bg-slate-500/15 border-slate-500/30' },
  }
  const { icon: Icon, cls } = cfg[dir] ?? cfg['NEUTRE']
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono font-bold ${cls}`}>
      <Icon size={11}/>{dir}
    </span>
  )
}

// ── Badge verdict ─────────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: string }) {
  const cfg: Record<string, string> = {
    'ACHETER':  'bg-green-500/20 text-green-300 border-green-500/40',
    'RENFORCER':'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    'CONSERVER':'bg-slate-500/20 text-slate-300 border-slate-500/40',
    'ALLÉGER':  'bg-orange-500/20 text-orange-300 border-orange-500/40',
    'ÉVITER':   'bg-red-500/20 text-red-300 border-red-500/40',
  }
  return (
    <span className={`px-3 py-1 rounded-lg border font-mono font-bold text-sm tracking-wider ${cfg[verdict] || cfg['CONSERVER']}`}>
      {verdict}
    </span>
  )
}

// ── Barre de confiance ────────────────────────────────────────────────────────
function ConfidenceBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = (value / max) * 100
  const color = value >= 7 ? '#10b981' : value >= 4 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <svg width="80" height="6">
        <rect x="0" y="0" width="80" height="6" rx="3" fill="#1e293b"/>
        <rect x="0" y="0" width={pct * 0.8} height="6" rx="3" fill={color} opacity="0.85"/>
      </svg>
      <span className="text-xs font-mono text-slate-400">{value}/10</span>
    </div>
  )
}


// ── Consensus Analystes ───────────────────────────────────────────────────────
function AnalystConsensus({ symbol }: { symbol: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['targets', symbol],
    queryFn:  () => getTargets(symbol),
    staleTime: 12 * 60 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-dark-800 border border-slate-700/60 rounded-xl p-4 animate-pulse">
        <div className="h-3 w-40 bg-dark-700 rounded mb-3"/>
        <div className="h-20 bg-dark-700 rounded"/>
      </div>
    )
  }
  if (!data || data.nb_analysts === 0) return null

  const d = data
  const totalDist = (d.distribution.strongBuy + d.distribution.buy + d.distribution.hold + d.distribution.sell + d.distribution.strongSell) || 1
  const bullPct  = Math.round((d.distribution.strongBuy + d.distribution.buy) / totalDist * 100)
  const holdPct  = Math.round(d.distribution.hold / totalDist * 100)
  const bearPct  = Math.round((d.distribution.sell + d.distribution.strongSell) / totalDist * 100)

  const recoLabel: Record<string, string> = {
    'strong_buy': 'ACHAT FORT', 'buy': 'ACHAT', 'hold': 'CONSERVER',
    'sell': 'VENDRE', 'strong_sell': 'VENTE FORTE', 'underperform': 'SOUS-PERFORMER',
  }
  const recoColor: Record<string, string> = {
    'strong_buy': 'text-emerald-400', 'buy': 'text-green-400', 'hold': 'text-amber-400',
    'sell': 'text-orange-400', 'strong_sell': 'text-red-400', 'underperform': 'text-red-400',
  }
  const rKey = d.recommendation_key?.toLowerCase().replace(' ', '_') || 'hold'
  const up   = d.upside_mean != null && d.upside_mean > 0

  return (
    <div className="bg-dark-800 border border-indigo-500/25 rounded-xl overflow-hidden">
      {/* Ligne déco */}
      <div className="h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent"/>

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={13} className="text-indigo-400"/>
            <span className="text-xs font-bold tracking-widest text-slate-300">CONSENSUS ANALYSTES</span>
            <span className="text-[10px] text-slate-600 font-mono bg-dark-700 px-1.5 py-0.5 rounded">{d.nb_analysts} analystes</span>
          </div>
          <span className={`text-xs font-bold tracking-wider ${recoColor[rKey] || 'text-slate-400'}`}>
            {recoLabel[rKey] || d.recommendation_key?.toUpperCase()}
          </span>
        </div>

        {/* Prix cibles */}
        {d.target_mean != null && d.current_price > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {/* Bas */}
            <div className="bg-dark-700/60 rounded-lg px-3 py-2 text-center border border-slate-800">
              <div className="text-[9px] text-red-400/70 uppercase tracking-widest mb-1">Objectif bas</div>
              <div className="text-sm font-bold font-mono text-white">{d.target_low?.toFixed(0)}</div>
              {d.target_low && d.current_price && (
                <div className={`text-[10px] font-mono ${d.target_low >= d.current_price ? 'text-green-400' : 'text-red-400'}`}>
                  {((d.target_low / d.current_price - 1) * 100).toFixed(1)}%
                </div>
              )}
            </div>

            {/* Consensus (central + gros) */}
            <div className={`rounded-lg px-3 py-2 text-center border ${up ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <Target size={9} className={up ? 'text-emerald-400' : 'text-red-400'}/>
                <span className="text-[9px] uppercase tracking-widest text-slate-500">Consensus</span>
              </div>
              <div className={`text-lg font-black font-mono ${up ? 'text-emerald-300' : 'text-red-300'}`}>
                {d.target_mean?.toFixed(0)}
              </div>
              {d.upside_mean != null && (
                <div className={`flex items-center justify-center gap-0.5 text-xs font-bold font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {up ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
                  {up ? '+' : ''}{d.upside_mean}%
                </div>
              )}
            </div>

            {/* Haut */}
            <div className="bg-dark-700/60 rounded-lg px-3 py-2 text-center border border-slate-800">
              <div className="text-[9px] text-green-400/70 uppercase tracking-widest mb-1">Objectif haut</div>
              <div className="text-sm font-bold font-mono text-white">{d.target_high?.toFixed(0)}</div>
              {d.target_high && d.current_price && (
                <div className="text-[10px] font-mono text-green-400">
                  +{((d.target_high / d.current_price - 1) * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        )}

        {/* Barre de distribution buy / hold / sell */}
        <div className="space-y-1.5">
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {bullPct > 0 && (
              <div className="bg-emerald-500/70 transition-all" style={{ width: `${bullPct}%` }}
                title={`Achat: ${d.distribution.strongBuy + d.distribution.buy} analystes`}/>
            )}
            {holdPct > 0 && (
              <div className="bg-amber-400/60 transition-all" style={{ width: `${holdPct}%` }}
                title={`Conserver: ${d.distribution.hold} analystes`}/>
            )}
            {bearPct > 0 && (
              <div className="bg-red-500/60 transition-all" style={{ width: `${bearPct}%` }}
                title={`Vendre: ${d.distribution.sell + d.distribution.strongSell} analystes`}/>
            )}
          </div>
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-emerald-400">
              ▲ Achat {d.distribution.strongBuy + d.distribution.buy}
              {d.distribution.strongBuy > 0 && <span className="text-emerald-300 ml-1">({d.distribution.strongBuy} fort)</span>}
            </span>
            <span className="text-amber-400">≈ Conserver {d.distribution.hold}</span>
            <span className="text-red-400">▼ Vendre {d.distribution.sell + d.distribution.strongSell}</span>
          </div>
        </div>

        {/* Score de conviction */}
        {d.recommendation_score != null && (
          <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
            <span>Score conviction :</span>
            <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
              {/* 1=Strong Buy (gauche/vert), 5=Strong Sell (droite/rouge) */}
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500"
                style={{ width: `${((d.recommendation_score - 1) / 4) * 100}%` }}
              />
            </div>
            <span className={recoColor[rKey] || 'text-slate-400'}>
              {d.recommendation_score?.toFixed(2)} / 5
            </span>
          </div>
        )}

        <p className="text-[10px] text-slate-700 font-mono">
          Source : Yahoo Finance · Agrège {d.nb_analysts} banques & brokers · Mis à jour quotidiennement
        </p>
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
export function DiagnosticPanel({ symbol, name, sector, index, candles, indicators, articles }: Props) {
  const [result,      setResult]      = useState<DiagResult | null>(null)
  const [showExplain, setShowExplain] = useState(false)
  const [withExplain, setWithExplain] = useState(false)

  const mutation = useMutation({
    mutationFn: () => analyzeDiagnostic({
      symbol, name: name || symbol, sector: sector || '', index: index || '',
      candles, indicators: indicators || {}, articles,
      with_explanation: withExplain,
    }),
    onSuccess: (data) => setResult(data as DiagResult),
  })

  const d = result?.diagnostic
  const p = result?.pronostic

  const etatColor = d?.etat === 'HAUSSIER' ? 'text-green-400' : d?.etat === 'BAISSIER' ? 'text-red-400' : 'text-slate-400'
  const sentimentColor = d?.sentiment_news === 'POSITIF' ? 'text-green-400' : d?.sentiment_news === 'NÉGATIF' ? 'text-red-400' : 'text-slate-400'

  return (
    <div className="space-y-4 font-mono">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="relative rounded-xl border border-slate-700/60 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent"/>
        <div className="bg-gradient-to-br from-slate-900 to-dark-800 p-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity size={15} className="text-violet-400"/>
                <span className="text-white font-bold tracking-wide">DIAGNOSTIC & PRONOSTIC</span>
              </div>
              <p className="text-xs text-slate-500">
                Analyse holistique : graphique · indicateurs · news · secteur · macro
              </p>
              {sector && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-slate-600">{symbol}</span>
                  <span className="text-slate-700">·</span>
                  <span className="text-xs text-slate-500">{sector}</span>
                  {index && <><span className="text-slate-700">·</span><span className="text-xs text-slate-500">{index}</span></>}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              {/* Option explication */}
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-500 hover:text-white transition-colors">
                <span>Inclure explication</span>
                <div
                  onClick={() => setWithExplain(v => !v)}
                  className={`w-8 h-4 rounded-full transition-colors relative ${withExplain ? 'bg-violet-500' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${withExplain ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                </div>
              </label>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                {mutation.isPending
                  ? <><RefreshCw size={12} className="animate-spin"/> Analyse en cours…</>
                  : <><Zap size={12}/> Lancer le diagnostic</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Consensus Analystes — chargé automatiquement ─────────────── */}
      <AnalystConsensus symbol={symbol} />

      {/* ── Résultat ────────────────────────────────────────────────────── */}
      {mutation.isPending && (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="h-24 bg-dark-800 border border-slate-800 rounded-xl animate-pulse"/>
          ))}
        </div>
      )}

      {result && !mutation.isPending && d && p && (
        <div className="space-y-3">

          {/* ── Verdict + Gauge ────────────────────────────────────────── */}
          <div className="bg-dark-800 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              {/* Gauge */}
              <div className="flex flex-col items-center">
                <Gauge score={d.force} label={d.etat}/>
                <span className={`text-xs font-bold tracking-wider mt-1 ${etatColor}`}>{d.etat}</span>
              </div>

              {/* Verdict central */}
              <div className="flex-1 flex flex-col items-center gap-3">
                <VerdictBadge verdict={p.verdict}/>
                <p className="text-slate-300 text-xs text-center leading-relaxed max-w-xs">{d.resume}</p>
              </div>

              {/* Niveaux clés */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                  <span className="text-green-500">▲ RÉSISTANCE</span>
                  <span className="text-white font-bold">{d.resistance?.toFixed(2) ?? '—'}</span>
                </div>
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <span className="text-red-500">▼ SUPPORT</span>
                  <span className="text-white font-bold">{d.support?.toFixed(2) ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Diagnostic détaillé ────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Technique */}
            <div className="bg-dark-800 border border-slate-700/60 rounded-xl p-3">
              <div className="text-slate-500 text-xs tracking-wider mb-2">// TECHNIQUE</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 text-xs">État</span>
                  <DirectionBadge dir={d.etat}/>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Analyse</span>
                  <p className="text-xs text-slate-300 mt-0.5">{d.technique}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Pattern</span>
                  <p className="text-xs text-cyan-400 font-mono mt-0.5">{d.pattern_principal}</p>
                </div>
              </div>
            </div>

            {/* News Sentiment */}
            <div className="bg-dark-800 border border-slate-700/60 rounded-xl p-3">
              <div className="text-slate-500 text-xs tracking-wider mb-2">// SENTIMENT NEWS</div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 text-xs">Sentiment</span>
                <span className={`text-xs font-bold tracking-wider ${sentimentColor}`}>
                  {d.sentiment_news}
                </span>
              </div>
              {articles.slice(0, 3).map((a, i) => (
                <div key={i} className="text-xs text-slate-600 truncate py-0.5 border-t border-slate-800">
                  <span className="text-slate-500">{a.source}</span> — {a.title}
                </div>
              ))}
            </div>

            {/* Patterns détectés */}
            <div className="bg-dark-800 border border-slate-700/60 rounded-xl p-3">
              <div className="text-slate-500 text-xs tracking-wider mb-2">// PATTERNS GRAPHIQUES</div>
              {result.patterns_detected && (
                <div className="space-y-1.5 text-xs">
                  {[
                    ['Tendance', result.patterns_detected.trend],
                    ['Force',    result.patterns_detected.trend_force],
                    ['Bougie',   result.patterns_detected.candle_pattern],
                    ['BB Pos.',  result.patterns_detected.bb_position],
                    ['Volume',   result.patterns_detected.volume_signal],
                    ['Perf 5j',  `${result.patterns_detected.perf_5j > 0 ? '+' : ''}${result.patterns_detected.perf_5j}%`],
                  ].map(([label, val]) => (
                    <div key={label as string} className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">{label}</span>
                      <span className="text-slate-300 text-right text-xs truncate max-w-[120px]">{val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Pronostic ──────────────────────────────────────────────── */}
          <div className="bg-dark-800 border border-slate-700/60 rounded-xl p-4">
            <div className="text-slate-500 text-xs tracking-wider mb-3">// PRONOSTIC</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {/* Court terme */}
              {[p.court_terme, p.moyen_terme].map((term, i) => (
                <div key={i} className="bg-dark-700/60 rounded-lg p-3 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500 tracking-wider">{i === 0 ? 'COURT TERME' : 'MOYEN TERME'}</span>
                    <span className="text-xs text-slate-600">{term.horizon}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <DirectionBadge dir={term.direction}/>
                    <span className="text-white font-bold text-sm font-mono">
                      {term.cible_prix > 0 ? `→ ${term.cible_prix.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Confiance</span>
                    <ConfidenceBar value={term.confiance}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Risques & Catalyseurs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-xs text-red-400/70 tracking-wider">
                  <AlertTriangle size={11}/> RISQUES
                </div>
                <div className="space-y-1">
                  {p.risques.map((r, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                      <span className="text-red-500 mt-0.5 shrink-0">▸</span>{r}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-2 text-xs text-green-400/70 tracking-wider">
                  <Zap size={11}/> CATALYSEURS
                </div>
                <div className="space-y-1">
                  {p.catalyseurs.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                      <span className="text-green-500 mt-0.5 shrink-0">▸</span>{c}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Explication narrative ──────────────────────────────────── */}
          {result.explanation && (
            <div className="bg-dark-800 border border-violet-500/20 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowExplain(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs text-violet-400">
                  {showExplain ? <EyeOff size={13}/> : <Eye size={13}/>}
                  <span className="tracking-wider">{showExplain ? 'MASQUER' : 'VOIR'} L'EXPLICATION COMPLÈTE</span>
                </div>
                {showExplain ? <ChevronUp size={14} className="text-slate-500"/> : <ChevronDown size={14} className="text-slate-500"/>}
              </button>
              {showExplain && (
                <div className="px-4 pb-4 border-t border-violet-500/10">
                  <p className="text-sm text-slate-300 leading-relaxed pt-3 whitespace-pre-line font-sans">
                    {result.explanation}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <p className="text-xs text-slate-700 text-center pb-1">
            // Analyse générée par IA · Pas un conseil en investissement · {new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}
          </p>
        </div>
      )}

      {/* Erreur */}
      {mutation.isError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          Erreur lors de l'analyse. Vérifiez la connexion au backend.
        </div>
      )}
    </div>
  )
}
