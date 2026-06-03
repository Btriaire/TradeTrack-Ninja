import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Globe, X, ChevronRight, AlertTriangle, TrendingUp,
  TrendingDown, Minus, ShieldAlert, Eye, Sparkles,
} from 'lucide-react'
import { getGeoEvents } from '../services/api'

interface GeoEvent {
  title:   string
  flags:   string[]
  regions: string
  impact:  'HAUSSIER' | 'BAISSIER' | 'MIXTE' | 'INCERTAIN'
  sectors: string[]
  brief:   string
  signal:  'OPPORTUNITÉ' | 'RISQUE' | 'SURVEILLER'
}

interface GeoData {
  events:          GeoEvent[]
  synthesis:       string
  date:            string
  headline_count?: number
}

// ── Couleurs selon impact ───────────────────────────────────────────────────
const IMPACT_CFG = {
  HAUSSIER:  { cls: 'text-green-400 bg-green-500/15 border-green-500/30',  icon: TrendingUp,   label: 'HAUSSIER'  },
  BAISSIER:  { cls: 'text-red-400   bg-red-500/15   border-red-500/30',    icon: TrendingDown, label: 'BAISSIER'  },
  MIXTE:     { cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30',  icon: Minus,        label: 'MIXTE'     },
  INCERTAIN: { cls: 'text-slate-400 bg-slate-500/15 border-slate-500/30',  icon: Minus,        label: 'INCERTAIN' },
}

const SIGNAL_CFG = {
  OPPORTUNITÉ: { cls: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', icon: TrendingUp   },
  RISQUE:      { cls: 'text-rose-300    bg-rose-500/15    border-rose-500/30',    icon: ShieldAlert  },
  SURVEILLER:  { cls: 'text-amber-300   bg-amber-500/15   border-amber-500/30',   icon: Eye          },
}

const RANK_RING = [
  'border-rose-500/40   from-rose-900/20',
  'border-pink-500/30   from-pink-900/10',
  'border-fuchsia-500/30 from-fuchsia-900/10',
]
const RANK_ACCENT = ['text-rose-400', 'text-pink-400', 'text-fuchsia-400']
const RANK_LABEL  = ['🥇', '🥈', '🥉']

// ── Carte d'un événement géopolitique ─────────────────────────────────────
function EventCard({ event, rank }: { event: GeoEvent; rank: number }) {
  const impact = IMPACT_CFG[event.impact] ?? IMPACT_CFG.INCERTAIN
  const signal = SIGNAL_CFG[event.signal] ?? SIGNAL_CFG.SURVEILLER
  const ImpactIcon = impact.icon
  const SignalIcon = signal.icon

  return (
    <div className={`relative rounded-xl border bg-gradient-to-br ${RANK_RING[rank]} to-dark-800/50 p-4 overflow-hidden`}>
      {/* Rank */}
      <div className="absolute top-3 right-3 text-xl opacity-50">{RANK_LABEL[rank]}</div>

      {/* Flags + titre */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <div className="flex gap-0.5">
            {event.flags.map((f, i) => <span key={i} className="text-xl">{f}</span>)}
          </div>
          <span className={`text-[11px] font-mono text-slate-500 bg-dark-700/60 px-2 py-0.5 rounded-full`}>
            {event.regions}
          </span>
        </div>
        <h3 className={`font-bold text-sm leading-snug ${RANK_ACCENT[rank]}`}>{event.title}</h3>
      </div>

      {/* Impact + Signal */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono font-bold ${impact.cls}`}>
          <ImpactIcon size={10} />{impact.label}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono font-bold ${signal.cls}`}>
          <SignalIcon size={10} />{event.signal}
        </span>
      </div>

      {/* Brief */}
      <div className="flex items-start gap-2 mb-3 bg-dark-700/40 rounded-lg p-2.5">
        <Sparkles size={11} className="text-violet-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-300 leading-relaxed italic">{event.brief}</p>
      </div>

      {/* Secteurs affectés */}
      {event.sectors.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-600 tracking-wider mb-1.5">// SECTEURS AFFECTÉS</div>
          <div className="flex flex-wrap gap-1.5">
            {event.sectors.map((s, i) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-rose-500/10 text-rose-300/80 border border-rose-500/20">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Composant principal ─────────────────────────────────────────────────────
export function GeoEvents() {
  const [modalOpen, setModalOpen] = useState(false)

  const { data, isLoading } = useQuery<GeoData>({
    queryKey:        ['geo-events'],
    queryFn:         getGeoEvents,
    staleTime:       60 * 60 * 1000,   // 1h
    refetchInterval: 4 * 60 * 60 * 1000, // 4h
  })

  if (isLoading || !data?.events?.length) return null

  const events = data.events
  // Couleur de l'impact dominant pour la bannière
  const dominantImpact = events[0]?.impact ?? 'INCERTAIN'
  const dominantSignal = events[0]?.signal ?? 'SURVEILLER'
  const hasDanger = events.some(e => e.signal === 'RISQUE')

  return (
    <>
      {/* ── Bannière slim ─────────────────────────────────────────────── */}
      <button
        onClick={() => setModalOpen(true)}
        className="w-full text-left group relative overflow-hidden shrink-0"
      >
        {/* Fond */}
        <div className="absolute inset-0 bg-gradient-to-r from-rose-900/30 via-dark-800 to-rose-900/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-rose-500/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-500/35 to-transparent" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-400/15 to-transparent" />

        <div className="relative flex items-center gap-3 px-3 py-2 sm:px-4">

          {/* Badge gauche */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <Globe size={14} className="text-rose-400" />
              {hasDanger && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-rose-400 rounded-full animate-ping opacity-75" />
              )}
            </div>
            <span className="text-rose-400 font-bold text-xs tracking-widest uppercase hidden sm:block">
              Géopolitique
            </span>
            <span className="text-rose-400 font-bold text-[10px] tracking-widest uppercase sm:hidden">
              Géopol.
            </span>
          </div>

          {/* Séparateur */}
          <div className="h-4 w-px bg-rose-500/30 shrink-0" />

          {/* Chips événements */}
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
            {events.map((ev, i) => {
              const impactCfg = IMPACT_CFG[ev.impact] ?? IMPACT_CFG.INCERTAIN
              const ImpIc = impactCfg.icon
              return (
                <div key={i} className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-lg border ${
                  i === 0
                    ? 'bg-rose-500/15 border-rose-500/30'
                    : 'bg-dark-700/60 border-slate-700/60'
                }`}>
                  <span className="text-xs hidden sm:block">
                    {ev.flags.slice(0, 2).join('')}
                  </span>
                  <span className={`font-semibold text-xs truncate max-w-[72px] ${i === 0 ? 'text-rose-300' : 'text-slate-300'}`}>
                    {ev.title}
                  </span>
                  <ImpIc size={9} className={
                    ev.impact === 'HAUSSIER' ? 'text-green-400' :
                    ev.impact === 'BAISSIER' ? 'text-red-400' : 'text-amber-400'
                  } />
                </div>
              )
            })}
          </div>

          {/* CTA */}
          <div className="flex items-center gap-1 text-rose-400/70 group-hover:text-rose-400 transition-colors text-xs font-semibold shrink-0">
            <span className="hidden sm:block">Détail</span>
            <ChevronRight size={12} />
          </div>
        </div>
      </button>

      {/* ── Modale ────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:pt-12 overflow-y-auto">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} />

          <div className="relative w-full max-w-2xl bg-dark-900 border border-rose-500/20 rounded-2xl overflow-hidden shadow-2xl shadow-rose-900/20">

            {/* Header */}
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-rose-900/30 via-dark-800 to-dark-900" />
              <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />

              <div className="relative flex items-start justify-between p-5">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-rose-500/20 border border-rose-500/40 rounded-lg px-3 py-1">
                      <Globe size={13} className="text-rose-400" />
                      <span className="text-rose-300 font-bold text-xs tracking-widest uppercase">
                        Géopolitique &amp; Marchés
                      </span>
                    </div>
                    <span className="text-slate-600 text-xs font-mono">{data.date}</span>
                    {data.headline_count && (
                      <span className="text-slate-700 text-[10px] font-mono">
                        {data.headline_count} titres analysés
                      </span>
                    )}
                  </div>

                  {/* Synthèse */}
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {data.synthesis || "Analyse des principaux événements géopolitiques influençant les marchés."}
                  </p>

                  {/* Indicateurs globaux */}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <AlertTriangle size={11} className={hasDanger ? 'text-rose-400' : 'text-amber-400'} />
                      <span>{hasDanger ? 'Niveau de risque élevé' : 'Risque modéré'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Globe size={11} className="text-cyan-400" />
                      <span>
                        {[...new Set(events.flatMap(e => e.flags))].slice(0, 6).join(' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Eye size={11} className="text-violet-400" />
                      <span>
                        {[...new Set(events.flatMap(e => e.sectors))].slice(0, 4).join(' · ')}
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

            {/* Cards */}
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {events.slice(0, 3).map((ev, i) => (
                <EventCard key={i} event={ev} rank={i} />
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 pb-4 text-center">
              <p className="text-xs text-slate-700">
                // Analyse basée sur flux d'actualités temps réel · IA générative · Pas un conseil en investissement
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
