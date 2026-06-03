import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Sparkles, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Settings, RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react'
import { analyzeSentiment } from '../services/api'
import { usePromptConfig } from '../hooks/usePromptConfig'
import type { Article, Indicators, AIAnalysis } from '../types'

interface Props {
  symbol:      string
  articles:    Article[]
  indicators?: Indicators
}

// ── Composant config ─────────────────────────────────────────────────────────
function PromptConfigPanel({ onClose }: { onClose: () => void }) {
  const { config, update, reset } = usePromptConfig()

  const STYLES = [
    { id: 'journalistique', label: 'Journalistique' },
    { id: 'technique',      label: 'Technique'      },
    { id: 'synthétique',    label: 'Synthétique'    },
    { id: 'optimiste',      label: 'Optimiste'      },
    { id: 'pessimiste',     label: 'Pessimiste'     },
  ] as const

  const HORIZONS = [
    { id: 'auto',  label: 'Auto'        },
    { id: 'court', label: 'Court terme' },
    { id: 'moyen', label: 'Moyen terme' },
    { id: 'long',  label: 'Long terme'  },
  ] as const

  const FOCUS_LABELS: Record<string, string> = {
    fondamentaux: 'Fondamentaux',
    technique:    'Technique',
    actualites:   'Actualités',
    risques:      'Risques',
  }

  return (
    <div className="bg-dark-700 rounded-xl p-4 space-y-4 border border-dark-600">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Settings size={12} /> Configuration du prompt IA
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="text-xs text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors"
            title="Réinitialiser"
          >
            <RotateCcw size={11} /> Reset
          </button>
          <button
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Style */}
      <div>
        <label className="text-xs text-slate-500 block mb-1.5">Style d'analyse</label>
        <div className="flex flex-wrap gap-1">
          {STYLES.map(s => (
            <button
              key={s.id}
              onClick={() => update({ style: s.id })}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                config.style === s.id
                  ? 'bg-accent-blue text-white'
                  : 'bg-dark-600 text-slate-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Horizon */}
      <div>
        <label className="text-xs text-slate-500 block mb-1.5">Horizon préféré</label>
        <div className="flex gap-1">
          {HORIZONS.map(h => (
            <button
              key={h.id}
              onClick={() => update({ horizon: h.id })}
              className={`flex-1 text-xs py-1 rounded-lg transition-colors ${
                config.horizon === h.id
                  ? 'bg-accent-blue text-white'
                  : 'bg-dark-600 text-slate-400 hover:text-white'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Focus */}
      <div>
        <label className="text-xs text-slate-500 block mb-1.5">Points à analyser</label>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(config.focus) as Array<keyof typeof config.focus>).map(key => (
            <label key={key} className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={config.focus[key]}
                onChange={e => update({ focus: { ...config.focus, [key]: e.target.checked } })}
                className="accent-blue-500 w-3.5 h-3.5"
              />
              {FOCUS_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      {/* Langue */}
      <div>
        <label className="text-xs text-slate-500 block mb-1.5">Langue de réponse</label>
        <div className="flex gap-1">
          {[{ id: 'fr', label: '🇫🇷 Français' }, { id: 'en', label: '🇬🇧 English' }].map(l => (
            <button
              key={l.id}
              onClick={() => update({ langue: l.id as 'fr' | 'en' })}
              className={`flex-1 text-xs py-1 rounded-lg transition-colors ${
                config.langue === l.id
                  ? 'bg-accent-blue text-white'
                  : 'bg-dark-600 text-slate-400 hover:text-white'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions libres */}
      <div>
        <label className="text-xs text-slate-500 block mb-1.5">
          Instructions personnalisées
          <span className="text-slate-600 ml-1">(ajoutées à la fin du prompt)</span>
        </label>
        <textarea
          value={config.instructions}
          onChange={e => update({ instructions: e.target.value })}
          placeholder="Ex: Concentre-toi sur les catalyseurs de court terme. Mentionne les niveaux techniques clés. Compare avec le secteur..."
          rows={3}
          className="w-full bg-dark-600 text-white text-xs rounded-lg px-3 py-2 outline-none border border-dark-500 focus:border-accent-blue/50 placeholder:text-slate-600 resize-none"
        />
        <div className="text-right text-xs text-slate-700 mt-0.5">
          {config.instructions.length} / 500 car.
        </div>
      </div>
    </div>
  )
}


// ── Panel principal ──────────────────────────────────────────────────────────
export function AIPanel({ symbol, articles, indicators }: Props) {
  const [showConfig, setShowConfig] = useState(false)
  const { config } = usePromptConfig()

  const mutation = useMutation({
    mutationFn: () => analyzeSentiment({
      symbol,
      articles: articles.slice(0, 8),
      indicators: indicators ?? {},
      prompt_config: config,
    }),
  })

  const result = mutation.data

  return (
    <div className="bg-dark-800 rounded-xl p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">Analyse IA</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(v => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
              showConfig
                ? 'bg-dark-600 text-white'
                : 'text-slate-500 hover:text-white hover:bg-dark-700'
            }`}
            title="Configurer le prompt"
          >
            <Settings size={12} />
            <span className="hidden sm:inline">Config</span>
            {showConfig ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg px-3 py-1 transition-colors disabled:opacity-40"
          >
            {mutation.isPending ? 'Analyse…' : 'Analyser'}
          </button>
        </div>
      </div>

      {/* Indicateur de config active */}
      {!showConfig && (config.style !== 'journalistique' || config.horizon !== 'auto' || config.instructions) && (
        <div className="flex flex-wrap gap-1">
          {config.style !== 'journalistique' && (
            <span className="text-xs bg-accent-blue/20 text-accent-blue px-2 py-0.5 rounded-full">
              {config.style}
            </span>
          )}
          {config.horizon !== 'auto' && (
            <span className="text-xs bg-dark-600 text-slate-400 px-2 py-0.5 rounded-full">
              {config.horizon} terme
            </span>
          )}
          {config.instructions && (
            <span className="text-xs bg-dark-600 text-slate-400 px-2 py-0.5 rounded-full">
              + instructions perso
            </span>
          )}
        </div>
      )}

      {/* Config panel */}
      {showConfig && <PromptConfigPanel onClose={() => setShowConfig(false)} />}

      {/* État vide */}
      {!result && !mutation.isPending && !showConfig && (
        <div className="text-center py-6 text-slate-600 text-sm">
          <Sparkles size={24} className="mx-auto mb-2 opacity-30" />
          Cliquez sur "Analyser" pour une synthèse IA
          <br />
          <span className="text-xs">Configurez le style via le bouton Config</span>
        </div>
      )}

      {/* Loading */}
      {mutation.isPending && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-dark-700 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Résultat */}
      {result && <AnalysisResult result={result} />}
    </div>
  )
}


// ── Affichage résultat ───────────────────────────────────────────────────────
function AnalysisResult({ result }: { result: AIAnalysis }) {
  const SentimentIcon =
    result.sentiment === 'HAUSSIER' ? TrendingUp :
    result.sentiment === 'BAISSIER' ? TrendingDown : Minus

  const sentimentColor =
    result.sentiment === 'HAUSSIER' ? 'text-green-400 bg-green-500/10 border-green-500/20' :
    result.sentiment === 'BAISSIER' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
    'text-slate-400 bg-slate-500/10 border-slate-500/20'

  const scoreColor =
    result.score > 20 ? 'bg-green-500' :
    result.score < -20 ? 'bg-red-500' : 'bg-yellow-500'

  return (
    <div className="space-y-3">
      {/* Sentiment + score */}
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${sentimentColor}`}>
        <div className="flex items-center gap-2">
          <SentimentIcon size={16} />
          <span className="font-bold text-sm">{result.sentiment}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Score</span>
          <div className="w-16 h-1.5 bg-dark-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${scoreColor}`}
              style={{
                width: `${Math.abs(result.score)}%`,
                marginLeft: result.score < 0 ? `${100 - Math.abs(result.score)}%` : '0',
              }}
            />
          </div>
          <span className="text-xs font-mono">{result.score > 0 ? '+' : ''}{result.score}</span>
        </div>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed">{result.resume}</p>

      {result.points_cles?.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-1">Points clés</div>
          <ul className="space-y-1">
            {result.points_cles.map((p, i) => (
              <li key={i} className="text-xs text-slate-300 flex gap-2">
                <span className="text-green-400 mt-0.5 shrink-0">▸</span>{p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.risques?.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <AlertTriangle size={11} /> Risques
          </div>
          <ul className="space-y-1">
            {result.risques.map((r, i) => (
              <li key={i} className="text-xs text-slate-400 flex gap-2">
                <span className="text-yellow-500 mt-0.5 shrink-0">▸</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-slate-600 border-t border-dark-600 pt-2">
        Horizon : {result.horizon}
      </div>
    </div>
  )
}
