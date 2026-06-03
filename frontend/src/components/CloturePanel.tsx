import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Telescope, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Zap, Target, Shield,
  ChevronDown, ChevronUp, RefreshCw, BarChart2,
  ArrowUpRight, ArrowDownRight, ArrowRight,
  Activity, Globe, PieChart,
} from 'lucide-react'
import { analyzeClotureIA, getGeoEvents, getTopSectors } from '../services/api'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TendanceItem {
  sens:  'HAUSSE' | 'BAISSE' | 'LATERAL'
  force: number   // 1–5
  note:  string
}

interface ClotureResult {
  seance: {
    resume:       string
    biais:        'HAUSSIER' | 'BAISSIER' | 'NEUTRE'
    volume_signal:'FORT_ACHAT' | 'FORT_VENTE' | 'NORMAL' | 'FAIBLE'
    momentum:     'ACCÉLÈRE' | 'RALENTIT' | 'STABLE'
  }
  tendances: {
    journaliere:   TendanceItem
    hebdomadaire:  TendanceItem
    mensuelle:     TendanceItem
    trimestrielle: TendanceItem
  }
  niveaux: {
    support_immediat:     number
    resistance_immediate: number
    vwap:                 number | null
    objectif_haussier:    number
    stop_suggere:         number
  }
  contexte: {
    secteur:     string
    geopolitique:string
    macro:       string
  }
  pronostic: {
    prochaine_seance: { direction: string; cible: number; confiance: number }
    cinq_jours:       { direction: string; cible: number; confiance: number }
    verdict:          string
    risques:          string[]
    catalyseurs:      string[]
  }
  analyse_narrative: string
  patterns_detected: Record<string, any>
  intraday_session:  Record<string, any>
  error?: string
}

interface Props {
  symbol:     string
  name:       string
  sector:     string
  index:      string
  candles:    object[]
  indicators: object
  articles:   object[]
}

// ── Helpers couleur ───────────────────────────────────────────────────────────
const BIAIS_CFG = {
  HAUSSIER: { color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/25',  icon: TrendingUp   },
  BAISSIER: { color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/25',    icon: TrendingDown },
  NEUTRE:   { color: 'text-slate-400',  bg: 'bg-slate-700/30',  border: 'border-slate-600/30',  icon: Minus        },
}
const SENS_CFG = {
  HAUSSE:  { color: 'text-green-400', icon: ArrowUpRight   },
  BAISSE:  { color: 'text-red-400',   icon: ArrowDownRight },
  LATERAL: { color: 'text-slate-400', icon: ArrowRight     },
}
const VERDICT_CFG: Record<string, { color: string; bg: string; border: string }> = {
  'ACHETER':   { color: 'text-green-300',  bg: 'bg-green-500/20',  border: 'border-green-500/40'  },
  'RENFORCER': { color: 'text-emerald-300',bg: 'bg-emerald-500/15',border: 'border-emerald-500/35'},
  'CONSERVER': { color: 'text-amber-300',  bg: 'bg-amber-500/15',  border: 'border-amber-500/35'  },
  'ALLÉGER':   { color: 'text-orange-300', bg: 'bg-orange-500/15', border: 'border-orange-500/35' },
  'ÉVITER':    { color: 'text-red-300',    bg: 'bg-red-500/20',    border: 'border-red-500/40'    },
}
const VOL_CFG: Record<string, { label: string; color: string }> = {
  FORT_ACHAT: { label: 'Fort achat',  color: 'text-green-400' },
  FORT_VENTE: { label: 'Fort vente',  color: 'text-red-400'   },
  NORMAL:     { label: 'Normal',      color: 'text-slate-400' },
  FAIBLE:     { label: 'Faible',      color: 'text-slate-600' },
}
const MOM_CFG: Record<string, { label: string; color: string }> = {
  'ACCÉLÈRE': { label: 'Accélère', color: 'text-cyan-400'   },
  'RALENTIT': { label: 'Ralentit', color: 'text-amber-400'  },
  'STABLE':   { label: 'Stable',   color: 'text-slate-400'  },
}

// ── Composants réutilisables ──────────────────────────────────────────────────
function ForceBar({ force, color }: { force: number; color: string }) {
  return (
    <div className="flex gap-0.5 items-center">
      {[1,2,3,4,5].map(i => (
        <div key={i} className={`h-2 w-3 rounded-sm ${i <= force ? color.replace('text-','bg-') : 'bg-dark-600'}`} />
      ))}
    </div>
  )
}

function ConfidenceRing({ value }: { value: number }) {
  const r = 16, circ = 2 * Math.PI * r
  const dash = (value / 10) * circ
  const color = value >= 7 ? '#10b981' : value >= 4 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={42} height={42} className="shrink-0">
      <circle cx={21} cy={21} r={r} fill="none" stroke="#1a1a1a" strokeWidth={4} />
      <circle cx={21} cy={21} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 21 21)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={21} y={25} textAnchor="middle" fill={color} fontSize={11} fontFamily="JetBrains Mono" fontWeight="bold">
        {value}
      </text>
    </svg>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
export function CloturePanel({ symbol, name, sector, index, candles, indicators, articles }: Props) {
  const [result,       setResult]       = useState<ClotureResult | null>(null)
  const [showNarrative, setShowNarrative] = useState(false)

  // Fetch geo & sectors en parallèle (pour enrichir le prompt)
  const { data: geoData }    = useQuery({ queryKey: ['geo-events'],  queryFn: getGeoEvents,   staleTime: 4 * 60 * 60 * 1000 })
  const { data: sectorsData } = useQuery({ queryKey: ['top-sectors'], queryFn: getTopSectors,  staleTime: 30 * 60 * 1000 })

  // Trouver la perf du secteur correspondant
  const sectorPerf = (() => {
    if (!sectorsData?.length || !sector) return {}
    const match = sectorsData.find((s: any) =>
      s.sector?.toLowerCase().includes(sector.toLowerCase()) ||
      sector.toLowerCase().includes(s.sector?.toLowerCase())
    )
    return match || {}
  })()

  const mutation = useMutation({
    mutationFn: () => analyzeClotureIA({
      symbol,
      name,
      sector,
      index,
      candles: candles as any[],
      indicators: indicators as any,
      articles:   articles as any[],
      geo_events: (geoData?.events || []).slice(0, 5),
      sector_perf: sectorPerf,
      market_date: new Date().toLocaleDateString('fr-FR'),
    }),
    onSuccess: (data) => setResult(data),
  })

  const price = (candles as any[])?.slice(-1)[0]?.close ?? 0

  // ── État vide ────────────────────────────────────────────────────────────────
  if (!result && !mutation.isPending) {
    return (
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-600/50">
          <Telescope size={13} className="text-violet-400" />
          <span className="text-xs font-mono font-bold text-white tracking-wide">ANALYSE DE CLÔTURE IA</span>
          <span className="text-[10px] text-slate-600 font-mono ml-1">{symbol}</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 py-12 px-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Telescope size={22} className="text-violet-400 opacity-70" />
            </div>
            <p className="text-sm text-slate-400 font-mono">
              Diagnostic & Pronostic IA complet
            </p>
            <p className="text-xs text-slate-600 max-w-sm leading-relaxed">
              Analyse la clôture du jour en tenant compte des tendances multi-horizons,
              de la géopolitique et du contexte sectoriel.
            </p>
          </div>
          <button
            onClick={() => mutation.mutate()}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 hover:border-violet-500/50 rounded-xl text-sm font-mono font-semibold transition-all"
          >
            <Zap size={14} />
            Lancer l'analyse de clôture
          </button>
          <p className="text-[10px] text-slate-700 font-mono">Propulsé par Groq · llama-3.1-8b</p>
        </div>
      </div>
    )
  }

  // ── Chargement ───────────────────────────────────────────────────────────────
  if (mutation.isPending) {
    return (
      <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-600/50">
          <Telescope size={13} className="text-violet-400" />
          <span className="text-xs font-mono font-bold text-white tracking-wide">ANALYSE DE CLÔTURE IA</span>
        </div>
        <div className="flex flex-col items-center justify-center gap-4 py-14">
          <div className="relative">
            <RefreshCw size={28} className="text-violet-400 animate-spin" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-mono text-slate-400">Analyse en cours…</p>
            <p className="text-xs font-mono text-slate-600">Intégration intraday · secteur · géopolitique</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Erreur ───────────────────────────────────────────────────────────────────
  if (result?.error && !result.seance) {
    return (
      <div className="bg-dark-800 border border-red-500/20 rounded-xl p-4">
        <p className="text-red-400 text-sm font-mono">{result.error}</p>
        <button onClick={() => { setResult(null); mutation.reset() }}
          className="mt-3 text-xs text-slate-500 hover:text-white font-mono underline">
          Réessayer
        </button>
      </div>
    )
  }

  if (!result) return null

  const { seance, tendances, niveaux, contexte, pronostic, analyse_narrative } = result
  const biais   = BIAIS_CFG[seance?.biais ?? 'NEUTRE']  ?? BIAIS_CFG.NEUTRE
  const verdict = VERDICT_CFG[pronostic?.verdict ?? 'CONSERVER'] ?? VERDICT_CFG.CONSERVER
  const BiaisIcon = biais.icon

  const TENDANCE_ROWS = [
    { label: 'Journalière',   key: 'journaliere'   },
    { label: 'Hebdomadaire',  key: 'hebdomadaire'  },
    { label: 'Mensuelle',     key: 'mensuelle'     },
    { label: 'Trimestrielle', key: 'trimestrielle' },
  ] as const

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden space-y-0 divide-y divide-dark-600/40">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Telescope size={13} className="text-violet-400" />
          <span className="text-xs font-mono font-bold text-white tracking-wide">ANALYSE DE CLÔTURE IA</span>
          <span className="text-[10px] text-slate-600 font-mono">· {symbol} · {new Date().toLocaleDateString('fr-FR')}</span>
        </div>
        <button
          onClick={() => { setResult(null); mutation.reset() }}
          className="p-1.5 text-slate-600 hover:text-violet-400 hover:bg-dark-700 rounded-lg transition-colors"
          title="Relancer l'analyse"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* ── Biais séance + verdict ───────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        {/* Biais */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${biais.bg} ${biais.border}`}>
          <BiaisIcon size={14} className={biais.color} />
          <div>
            <div className={`text-xs font-mono font-bold ${biais.color}`}>
              Biais {seance?.biais ?? '–'}
            </div>
            <div className="text-[10px] text-slate-600 font-mono">
              Vol: <span className={VOL_CFG[seance?.volume_signal]?.color ?? 'text-slate-400'}>
                {VOL_CFG[seance?.volume_signal]?.label ?? seance?.volume_signal}
              </span>
              {' · '}Mom: <span className={MOM_CFG[seance?.momentum]?.color ?? 'text-slate-400'}>
                {MOM_CFG[seance?.momentum]?.label ?? seance?.momentum}
              </span>
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-mono font-bold text-sm ${verdict.color} ${verdict.bg} ${verdict.border}`}>
          <Target size={14} />
          {pronostic?.verdict ?? '–'}
        </div>
      </div>

      {/* ── Résumé séance ────────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <p className="text-xs text-slate-400 font-mono leading-relaxed">{seance?.resume}</p>
      </div>

      {/* ── Tendances multi-horizons ─────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 mb-3">
          <BarChart2 size={11} className="text-slate-500" />
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Tendances</span>
        </div>
        <div className="space-y-2">
          {TENDANCE_ROWS.map(({ label, key }) => {
            const t = tendances?.[key]
            if (!t) return null
            const sc = SENS_CFG[t.sens] ?? SENS_CFG.LATERAL
            const SensIcon = sc.icon
            return (
              <div key={key} className="flex items-center gap-3 py-1.5 px-2.5 bg-dark-700/40 rounded-lg">
                <div className="w-24 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">{label}</span>
                </div>
                <div className="flex items-center gap-1.5 w-20 shrink-0">
                  <SensIcon size={12} className={sc.color} />
                  <span className={`text-xs font-mono font-bold ${sc.color}`}>{t.sens}</span>
                </div>
                <ForceBar force={t.force} color={sc.color} />
                <span className="text-[10px] text-slate-600 font-mono flex-1 min-w-0 truncate">{t.note}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Niveaux clés ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 mb-3">
          <Shield size={11} className="text-slate-500" />
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Niveaux Clés</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { label: 'Support',     value: niveaux?.support_immediat,     color: 'text-green-400'  },
            { label: 'Résistance',  value: niveaux?.resistance_immediate, color: 'text-red-400'    },
            { label: 'VWAP',        value: niveaux?.vwap,                 color: 'text-amber-400'  },
            { label: 'Objectif ↑',  value: niveaux?.objectif_haussier,    color: 'text-cyan-400'   },
            { label: 'Stop',        value: niveaux?.stop_suggere,         color: 'text-orange-400' },
          ].map(({ label, value, color }) => value != null && (
            <div key={label} className="flex flex-col items-center px-2 py-2 bg-dark-700/50 rounded-lg border border-dark-600/30">
              <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">{label}</span>
              <span className={`text-sm font-mono font-bold mt-0.5 ${color}`}>{(value as number).toFixed(2)}</span>
              {price > 0 && (
                <span className="text-[9px] font-mono text-slate-700 mt-0.5">
                  {(((value as number) - price) / price * 100 > 0 ? '+' : '')}{(((value as number) - price) / price * 100).toFixed(1)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Pronostic ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-1.5 mb-3">
          <Zap size={11} className="text-slate-500" />
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Pronostic</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Prochaine séance', data: pronostic?.prochaine_seance },
            { label: '5 prochains jours', data: pronostic?.cinq_jours },
          ].map(({ label, data }) => {
            if (!data) return null
            const sc = SENS_CFG[data.direction as keyof typeof SENS_CFG] ?? SENS_CFG.LATERAL
            const DirIcon = sc.icon
            return (
              <div key={label} className="flex items-center gap-3 px-3 py-3 bg-dark-700/50 rounded-lg border border-dark-600/30">
                <ConfidenceRing value={data.confiance ?? 5} />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono text-slate-600">{label}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <DirIcon size={13} className={sc.color} />
                    <span className={`text-sm font-mono font-bold ${sc.color}`}>{data.direction}</span>
                  </div>
                  {data.cible && (
                    <div className="text-xs font-mono text-slate-400 mt-0.5">
                      Cible: <span className="text-white font-bold">{(data.cible as number).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Risques & Catalyseurs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          {pronostic?.risques?.length > 0 && (
            <div className="px-3 py-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={10} className="text-red-400" />
                <span className="text-[10px] font-mono font-bold text-red-400/70 uppercase tracking-wider">Risques</span>
              </div>
              <ul className="space-y-1">
                {pronostic.risques.map((r: string, i: number) => (
                  <li key={i} className="text-[11px] font-mono text-slate-500 flex gap-1.5">
                    <span className="text-red-500/50 shrink-0">·</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pronostic?.catalyseurs?.length > 0 && (
            <div className="px-3 py-2.5 bg-green-500/5 border border-green-500/15 rounded-lg">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap size={10} className="text-green-400" />
                <span className="text-[10px] font-mono font-bold text-green-400/70 uppercase tracking-wider">Catalyseurs</span>
              </div>
              <ul className="space-y-1">
                {pronostic.catalyseurs.map((c: string, i: number) => (
                  <li key={i} className="text-[11px] font-mono text-slate-500 flex gap-1.5">
                    <span className="text-green-500/50 shrink-0">·</span>{c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Contexte sectoriel + géopolitique ───────────────────────────────── */}
      {contexte && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-3">
            <Globe size={11} className="text-slate-500" />
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">Contexte</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Secteur', icon: PieChart, value: contexte.secteur, color: 'text-cyan-400' },
              { label: 'Géopolitique', icon: Globe, value: contexte.geopolitique, color: 'text-amber-400' },
              { label: 'Macro', icon: Activity, value: contexte.macro, color: 'text-slate-400' },
            ].map(({ label, icon: Icon, value, color }) => value && (
              <div key={label} className="flex gap-2.5 items-start">
                <Icon size={11} className={`${color} mt-0.5 shrink-0`} />
                <div className="min-w-0">
                  <span className="text-[10px] font-mono text-slate-600">{label}: </span>
                  <span className="text-xs font-mono text-slate-400">{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Analyse narrative ───────────────────────────────────────────────── */}
      {analyse_narrative && (
        <div className="px-4 py-3">
          <button
            onClick={() => setShowNarrative(v => !v)}
            className="flex items-center gap-2 text-[10px] font-mono text-slate-600 hover:text-slate-300 transition-colors w-full"
          >
            <Telescope size={10} />
            <span className="uppercase tracking-wider font-bold">Analyse Narrative Complète</span>
            {showNarrative ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
          </button>
          {showNarrative && (
            <p className="mt-3 text-xs text-slate-400 font-mono leading-relaxed border-l-2 border-violet-500/30 pl-3">
              {analyse_narrative}
            </p>
          )}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-700">Groq · llama-3.1-8b-instant · usage informatif uniquement</span>
        <span className="text-[10px] font-mono text-violet-600/50">
          {result.intraday_session?.volume ? `Vol séance: ${Number(result.intraday_session.volume).toLocaleString('fr-FR')}` : ''}
        </span>
      </div>
    </div>
  )
}
