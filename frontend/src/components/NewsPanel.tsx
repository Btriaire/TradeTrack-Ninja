import { useQuery } from '@tanstack/react-query'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { getNews } from '../services/api'
import type { Article } from '../types'

const SOURCE_COLORS: Record<string, string> = {
  'Boursorama': 'bg-blue-500/20 text-blue-300',
  'Figaro Economie': 'bg-purple-500/20 text-purple-300',
  'Zonebourse': 'bg-green-500/20 text-green-300',
  'ABC Bourse': 'bg-yellow-500/20 text-yellow-300',
}

function ArticleCard({ article }: { article: Article }) {
  const color = SOURCE_COLORS[article.source] ?? 'bg-slate-500/20 text-slate-300'
  const date = new Date(article.date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })

  return (
    <div className="border border-dark-600 rounded-lg p-3 hover:border-dark-500 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
          {article.source}
        </span>
        <span className="text-xs text-slate-600 whitespace-nowrap">{date}</span>
      </div>
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-white hover:text-accent-blue transition-colors flex items-start gap-1 mt-1"
      >
        <span className="line-clamp-2">{article.title}</span>
        <ExternalLink size={11} className="shrink-0 mt-0.5 text-slate-500" />
      </a>
      {article.summary && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{article.summary}</p>
      )}
    </div>
  )
}

interface Props {
  symbol?: string
}

export function NewsPanel({ symbol }: Props) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['news', symbol],
    queryFn: () => getNews(symbol),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="bg-dark-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Actualités {symbol ? `— ${symbol}` : '(marché)'}
        </span>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-slate-500 hover:text-white transition-colors"
        >
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-16 bg-dark-700 rounded-lg animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && (!data || data.length === 0) && (
        <p className="text-sm text-slate-600 text-center py-4">
          Aucun article trouvé.<br/>
          <span className="text-xs">Vérifiez la connexion au backend.</span>
        </p>
      )}

      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
        {data?.map((article, i) => (
          <ArticleCard key={i} article={article} />
        ))}
      </div>
    </div>
  )
}
