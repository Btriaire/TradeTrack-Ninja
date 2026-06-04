import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ExternalLink, RefreshCw, Newspaper, Clock, ChevronRight, User, Globe, AlertCircle, Loader2 } from 'lucide-react'
import { getGeneralNews, getArticleContent } from '../services/api'

interface Article {
  source:   string
  category: string
  flag:     string
  title:    string
  summary:  string
  url:      string
  date:     string
  image:    string | null
}

const CATEGORIES = [
  { id: 'Tout',          label: 'Tout',          icon: '◈' },
  { id: 'France',        label: 'France',        icon: '🇫🇷' },
  { id: 'Marchés FR',   label: 'Marchés FR',    icon: '📊' },
  { id: 'International', label: 'International', icon: '🌍' },
  { id: 'Marchés',       label: 'Marchés',       icon: '📈' },
]

const SOURCE_COLORS: Record<string, string> = {
  'Les Echos':        'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'BFM Business':     'bg-red-500/15 text-red-400 border-red-500/30',
  'Capital.fr':       'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'Figaro Economie':  'bg-blue-600/15 text-blue-300 border-blue-600/30',
  'Boursorama':       'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Zone Bourse':      'bg-teal-500/15 text-teal-400 border-teal-500/30',
  'La Tribune':       'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'Reuters Business': 'bg-orange-600/15 text-orange-300 border-orange-600/30',
  'CNBC':             'bg-blue-400/15 text-blue-300 border-blue-400/30',
  'Guardian Business':'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  'MarketWatch':      'bg-green-500/15 text-green-400 border-green-500/30',
  'Investing.com':    'bg-slate-500/15 text-slate-300 border-slate-500/30',
  'Yahoo Finance':    'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'Seeking Alpha':    'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  'WSJ Markets':      'bg-amber-500/15 text-amber-400 border-amber-500/30',
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000
    if (diff < 3600)  return `il y a ${Math.round(diff/60)} min`
    if (diff < 86400) return `il y a ${Math.round(diff/3600)} h`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  } catch { return dateStr }
}

// ── Modal article ─────────────────────────────────────────────────────────────
function ArticleModal({ article, onClose }: { article: Article; onClose: () => void }) {
  const badgeCls = SOURCE_COLORS[article.source] || 'bg-slate-700 text-slate-300 border-slate-600'

  // Fermer sur Escape
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose() }

  // Chargement du contenu complet via scraping backend
  const { data: full, isLoading: loadingFull, isError: errorFull } = useQuery({
    queryKey: ['article-content', article.url],
    queryFn:  () => getArticleContent(article.url),
    staleTime: 60 * 60 * 1000, // 1h
    retry: 1,
  })

  // Image : préférer l'OG scrapée, sinon celle du RSS
  const displayImage = full?.image || article.image
  // Contenu : scrapé si disponible, sinon résumé RSS
  const hasFullContent = full?.content && full.content.length > 100
  // Paragraphes du contenu complet
  const paragraphs = hasFullContent
    ? full!.content.split('\n').map(p => p.trim()).filter(p => p.length > 20)
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKey}
    >
      <div
        className="relative bg-dark-800 border border-dark-600 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Scan line déco */}
        <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent rounded-t-2xl"/>

        {/* Image hero */}
        {displayImage ? (
          <div className="relative h-52 rounded-t-2xl overflow-hidden shrink-0">
            <img
              src={displayImage}
              alt=""
              className="w-full h-full object-cover"
              onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-dark-800 via-dark-800/40 to-transparent"/>
            <div className="absolute bottom-3 left-4">
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${badgeCls}`}>
                {article.flag} {article.source}
              </span>
            </div>
            <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors">
              <X size={16}/>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${badgeCls}`}>
              {article.flag} {article.source}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-dark-700 transition-colors">
              <X size={16}/>
            </button>
          </div>
        )}

        {/* Content scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin scrollbar-thumb-dark-600">

          {/* Méta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {displayImage && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeCls}`}>
                {article.flag} {article.source}
              </span>
            )}
            <span className="text-xs bg-dark-700 text-slate-500 px-2 py-0.5 rounded-full border border-dark-600">
              {article.category}
            </span>
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <Clock size={10}/>{formatDate(article.date)}
            </div>
            {full?.author && (
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <User size={10}/>{full.author}
              </div>
            )}
            {full?.sitename && !displayImage && (
              <div className="flex items-center gap-1 text-xs text-slate-600">
                <Globe size={10}/>{full.sitename}
              </div>
            )}
          </div>

          {/* Titre */}
          <h2 className="text-white font-bold text-lg leading-snug">{full?.title || article.title}</h2>

          {/* ── Contenu principal ───────────────────────────── */}
          {loadingFull && (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
              <Loader2 size={16} className="animate-spin text-cyan-500"/>
              Chargement de l'article complet…
            </div>
          )}

          {!loadingFull && hasFullContent && (
            <div className="space-y-3">
              {paragraphs!.map((p, i) => (
                <p key={i} className="text-slate-300 text-sm leading-relaxed">{p}</p>
              ))}
            </div>
          )}

          {/* Résumé RSS si pas de contenu complet */}
          {!loadingFull && !hasFullContent && (
            <>
              {article.summary ? (
                <p className="text-slate-300 text-sm leading-relaxed">{article.summary}</p>
              ) : null}
              {errorFull || (!hasFullContent && !loadingFull) ? (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs text-amber-400/80">
                  <AlertCircle size={14} className="shrink-0 mt-0.5"/>
                  <span>
                    Contenu complet non disponible (site protégé ou JavaScript requis).
                    Cliquez sur "Lire l'article" pour accéder à la version originale.
                  </span>
                </div>
              ) : null}
            </>
          )}

          {/* Lien vers source */}
          <div className="border-t border-dark-700 pt-3 flex items-center gap-2">
            <Globe size={11} className="text-slate-600"/>
            <a href={article.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-slate-600 hover:text-cyan-400 transition-colors truncate">
              {article.url}
            </a>
          </div>
        </div>

        {/* Footer sticky */}
        <div className="shrink-0 px-6 py-4 border-t border-dark-700 flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-white transition-colors">
            Fermer
          </button>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm bg-accent-blue hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            Lire sur {article.source}
            <ExternalLink size={13}/>
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Carte article ─────────────────────────────────────────────────────────────
function ArticleCard({ article, onClick }: { article: Article; onClick: () => void }) {
  const badgeCls = SOURCE_COLORS[article.source] || 'bg-slate-700 text-slate-300 border-slate-600'

  return (
    <div
      onClick={onClick}
      className="group bg-dark-800 border border-dark-700 rounded-xl overflow-hidden cursor-pointer hover:border-slate-600 hover:shadow-lg transition-all duration-200 flex flex-col"
    >
      {/* Image */}
      {article.image && (
        <div className="relative h-40 overflow-hidden shrink-0">
          <img
            src={article.image}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-800/80 to-transparent"/>
        </div>
      )}

      <div className="flex flex-col flex-1 p-4 gap-2.5">
        {/* Source + date */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badgeCls}`}>
            {article.flag} {article.source}
          </span>
          <span className="text-xs text-slate-600 shrink-0">{formatDate(article.date)}</span>
        </div>

        {/* Titre */}
        <h3 className="text-white text-sm font-semibold leading-snug group-hover:text-cyan-300 transition-colors line-clamp-3">
          {article.title}
        </h3>

        {/* Excerpt */}
        {article.summary && (
          <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 flex-1">
            {article.summary}
          </p>
        )}

        {/* Lire */}
        <div className="flex items-center gap-1 text-xs text-slate-600 group-hover:text-cyan-400 transition-colors mt-auto">
          <span>Lire</span>
          <ChevronRight size={11}/>
        </div>
      </div>
    </div>
  )
}


// ── Composant principal ───────────────────────────────────────────────────────
export function FinancialNews() {
  const [activeCategory, setActiveCategory] = useState('Tout')
  const [search,         setSearch]         = useState('')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)

  const { data = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey:        ['general-news', activeCategory],
    queryFn:         () => getGeneralNews(activeCategory),
    staleTime:       5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  const articles = data as Article[]

  const filtered = search.trim()
    ? articles.filter(a =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.source.toLowerCase().includes(search.toLowerCase()) ||
        a.summary.toLowerCase().includes(search.toLowerCase())
      )
    : articles

  // Compter par catégorie
  const countByCategory = (cat: string) =>
    cat === 'Tout' ? articles.length : articles.filter(a => a.category === cat).length

  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  // Sources uniques affichées
  const sources = [...new Set(articles.map(a => a.source))]

  return (
    <div className="space-y-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-700 rounded-xl p-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Newspaper size={16} className="text-cyan-400"/>
              <span className="font-bold text-white">Actualités Financières</span>
              <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full border border-dark-600">
                {filtered.length} articles
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {sources.length} sources · Les Echos, Reuters, CNBC, BFM, Capital, MarketWatch, Investing.com…
              {lastUpdate && <span className="ml-2 text-slate-600">· {lastUpdate}</span>}
            </p>
          </div>
          <button onClick={() => refetch()} disabled={isLoading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-dark-700 hover:bg-dark-600 border border-dark-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''}/>
            Actualiser
          </button>
        </div>

        {/* Recherche */}
        <div className="mt-3 relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un titre, une source…"
            className="w-full bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
              <X size={13}/>
            </button>
          )}
        </div>
      </div>

      {/* ── Filtres catégorie ──────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setActiveCategory(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              activeCategory === id
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                : 'bg-dark-800 text-slate-500 hover:text-white border-dark-700'
            }`}>
            <span>{icon}</span>
            <span>{label}</span>
            <span className={`tabular-nums ${activeCategory === id ? 'text-cyan-400' : 'text-slate-700'}`}>
              {countByCategory(id)}
            </span>
          </button>
        ))}
      </div>

      {/* ── Sources badge strip ────────────────────────────────────────────── */}
      {!isLoading && sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map(src => (
            <span key={src} onClick={() => setSearch(src)}
              className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${SOURCE_COLORS[src] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
              {src}
            </span>
          ))}
        </div>
      )}

      {/* ── Skeleton ──────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-xl overflow-hidden border border-dark-700 animate-pulse">
              <div className="h-40 bg-dark-700"/>
              <div className="p-4 space-y-2">
                <div className="h-3 bg-dark-700 rounded w-1/3"/>
                <div className="h-4 bg-dark-700 rounded w-full"/>
                <div className="h-4 bg-dark-700 rounded w-3/4"/>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Grille articles ────────────────────────────────────────────────── */}
      {!isLoading && filtered.length === 0 && (
        <div className="bg-dark-800 rounded-xl p-10 text-center border border-dark-700">
          <Newspaper size={32} className="mx-auto text-slate-700 mb-3"/>
          <p className="text-slate-500 text-sm">Aucun article trouvé</p>
          {search && <button onClick={() => setSearch('')} className="mt-2 text-xs text-cyan-400 hover:underline">Effacer la recherche</button>}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((article, i) => (
            <ArticleCard key={`${article.url}-${i}`} article={article} onClick={() => setSelectedArticle(article)}/>
          ))}
        </div>
      )}

      {/* Footer sources */}
      {!isLoading && (
        <p className="text-xs text-slate-700 text-center pb-2">
          Sources : Les Echos · BFM Business · Capital · Figaro Éco · Boursorama · Zone Bourse · La Tribune · Reuters · CNBC · Guardian Business · MarketWatch · Investing.com · Yahoo Finance · Seeking Alpha · WSJ
        </p>
      )}

      {/* ── Modal article ──────────────────────────────────────────────────── */}
      {selectedArticle && (
        <ArticleModal article={selectedArticle} onClose={() => setSelectedArticle(null)}/>
      )}
    </div>
  )
}
