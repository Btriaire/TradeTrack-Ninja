import { useMutation } from '@tanstack/react-query'
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import { analyzeSentiment } from '../services/api'
import type { Article, Indicators, AIAnalysis } from '../types'

interface Props {
  symbol: string
  articles: Article[]
  indicators?: Indicators
}

export function AIPanel({ symbol, articles, indicators }: Props) {
  const mutation = useMutation({
    mutationFn: () => analyzeSentiment({
      symbol,
      articles: articles.slice(0, 8),
      indicators: indicators ?? {},
    }),
  })

  const result = mutation.data

  return (
    <div className="bg-dark-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">Analyse IA</span>
          <span className="text-xs bg-gradient-to-r from-blue-500 to-cyan-400 text-white px-2 py-0.5 rounded-full font-semibold">
            Gemini
          </span>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="text-xs bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg px-3 py-1 transition-colors disabled:opacity-40"
        >
          {mutation.isPending ? 'Gemini analyse…' : 'Analyser avec Gemini'}
        </button>
      </div>

      {!result && !mutation.isPending && (
        <div className="text-center py-6 text-slate-600 text-sm">
          <Sparkles size={24} className="mx-auto mb-2 opacity-30" />
          Cliquez sur "Analyser" pour obtenir une synthèse IA<br/>
          <span className="text-xs">(Boursorama · Figaro · Zonebourse · ABC Bourse)</span>
        </div>
      )}

      {mutation.isPending && (
        <div className="flex flex-col gap-2">
          {[1,2,3].map(i => <div key={i} className="h-8 bg-dark-700 rounded animate-pulse" />)}
        </div>
      )}

      {result && <AnalysisResult result={result} />}
    </div>
  )
}

function AnalysisResult({ result }: { result: AIAnalysis }) {
  const SentimentIcon = result.sentiment === 'HAUSSIER' ? TrendingUp
    : result.sentiment === 'BAISSIER' ? TrendingDown : Minus

  const sentimentColor = result.sentiment === 'HAUSSIER' ? 'text-green-400 bg-green-500/10 border-green-500/20'
    : result.sentiment === 'BAISSIER' ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : 'text-slate-400 bg-slate-500/10 border-slate-500/20'

  const scoreColor = result.score > 20 ? 'bg-green-500'
    : result.score < -20 ? 'bg-red-500' : 'bg-yellow-500'

  return (
    <div className="space-y-3">
      {/* Sentiment badge + score */}
      <div className={`flex items-center justify-between rounded-lg px-3 py-2 border ${sentimentColor}`}>
        <div className="flex items-center gap-2">
          <SentimentIcon size={16} />
          <span className="font-bold text-sm">{result.sentiment}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">Score</div>
          <div className="w-20 h-1.5 bg-dark-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreColor}`}
              style={{ width: `${Math.abs(result.score)}%`, marginLeft: result.score < 0 ? `${100 - Math.abs(result.score)}%` : '0' }}
            />
          </div>
          <span className="text-xs font-mono">{result.score > 0 ? '+' : ''}{result.score}</span>
        </div>
      </div>

      {/* Résumé */}
      <p className="text-sm text-slate-300 leading-relaxed">{result.resume}</p>

      {/* Points clés */}
      {result.points_cles?.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-1">Points clés</div>
          <ul className="space-y-1">
            {result.points_cles.map((p, i) => (
              <li key={i} className="text-xs text-slate-300 flex gap-2">
                <span className="text-green-400 mt-0.5">▸</span>{p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risques */}
      {result.risques?.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <AlertTriangle size={11} /> Risques
          </div>
          <ul className="space-y-1">
            {result.risques.map((r, i) => (
              <li key={i} className="text-xs text-slate-400 flex gap-2">
                <span className="text-yellow-500 mt-0.5">▸</span>{r}
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
