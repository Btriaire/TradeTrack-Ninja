/**
 * TickerBanner — bandeau défilant style LCD Wall Street
 * Indices boursiers mondiaux en défilement continu.
 * Fonctionne marché ouvert ET fermé (affiche le dernier cours connu).
 */
import { useQuery } from '@tanstack/react-query'
import { getIndices } from '../services/api'

interface IndexQuote {
  name:       string
  symbol:     string
  price:      number
  change_pct: number
  change:     number
}

function fmt(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(dec)
}
function sign(v: number) { return v >= 0 ? '+' : '' }

// ── Item LCD ──────────────────────────────────────────────────────────────────
function TickerItem({ item }: { item: IndexQuote }) {
  const pct = item.change_pct ?? 0
  const up  = pct >= 0
  const col = up ? '#00ff88' : '#ff4444'

  return (
    <span className="inline-flex items-center gap-2 px-4 whitespace-nowrap select-none">
      {/* Nom / symbole */}
      <span
        className="text-[11px] font-mono font-bold uppercase tracking-widest"
        style={{ color: '#8ab88a', textShadow: '0 0 6px #00ff4420' }}
      >
        {item.name ?? item.symbol}
      </span>

      {/* Prix */}
      <span
        className="text-[12px] font-mono font-black tabular-nums"
        style={{ color: '#d8f0d8', textShadow: `0 0 6px ${col}40` }}
      >
        {(item.price ?? 0) > 0
          ? item.price.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
          : '—'}
      </span>

      {/* Variation */}
      <span
        className="text-[11px] font-mono font-bold tabular-nums px-1.5 py-px rounded"
        style={{
          color:      col,
          background: up ? 'rgba(0,255,136,0.07)' : 'rgba(255,68,68,0.07)',
          textShadow: `0 0 6px ${col}60`,
          border:     `1px solid ${col}18`,
        }}
      >
        {up ? '▲' : '▼'} {sign(pct)}{fmt(pct)}%
      </span>
    </span>
  )
}

// ── Séparateur ────────────────────────────────────────────────────────────────
function Sep() {
  return (
    <span
      className="inline-block px-2 text-[10px] font-mono pointer-events-none"
      style={{ color: '#0d2a0d' }}
      aria-hidden
    >◆</span>
  )
}

// ── Skeleton items quand les données arrivent ─────────────────────────────────
const SKELETON_LABELS = ['CAC 40','DAX','S&P 500','NASDAQ','FTSE 100','Nikkei','Euro Stoxx']

function SkeletonItem({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 whitespace-nowrap">
      <span className="text-[11px] font-mono font-bold uppercase tracking-widest"
            style={{ color: '#1a3a1a' }}>
        {label}
      </span>
      <span className="text-[12px] font-mono font-black tabular-nums"
            style={{ color: '#0f240f' }}>
        ████
      </span>
      <span className="text-[11px] font-mono px-1.5 py-px rounded"
            style={{ color: '#0a1e0a', background: 'rgba(0,255,136,0.03)', border: '1px solid #081408' }}>
        ▲ --.-%
      </span>
    </span>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
export function TickerBanner({ onSelectSymbol }: { onSelectSymbol?: (s: string) => void }) {
  const { data: indices = [], isLoading } = useQuery<IndexQuote[]>({
    queryKey:        ['indices'],
    queryFn:         getIndices,
    refetchInterval: 30_000,
    staleTime:       0,
    retry:           2,
  })

  // Toujours afficher quelque chose — données réelles ou skeleton animé
  const hasData = indices.length > 0
  const dur     = hasData ? Math.max(25, indices.length * 5) : 18  // secondes

  // Dupliquer pour boucle fluide (50% = 1 passage complet)
  const realItems    = hasData ? [...indices, ...indices]              : null
  const skeleItems   = hasData ? null : [...SKELETON_LABELS, ...SKELETON_LABELS]

  return (
    <div
      className="relative h-8 border-b overflow-hidden flex items-center"
      style={{
        background:   'linear-gradient(90deg, #010901 0%, #011301 50%, #010901 100%)',
        borderColor:  '#091409',
        boxShadow:    'inset 0 1px 0 rgba(0,255,80,0.03), inset 0 -1px 0 rgba(0,0,0,0.5)',
      }}
    >
      {/* Scanlines CRT */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.12) 2px,rgba(0,0,0,0.12) 4px)',
        }}
      />

      {/* Label fixe gauche */}
      <div
        className="shrink-0 z-20 h-full flex items-center gap-1.5 px-3 border-r"
        style={{ background: 'linear-gradient(90deg,#010a01,#011501)', borderColor: '#091409' }}
      >
        <span
          className="text-[9px] font-mono font-black tracking-[0.3em] uppercase"
          style={{ color: '#00b84a', textShadow: '0 0 8px #00ff6630' }}
        >
          {isLoading && !hasData ? 'SYNC' : 'LIVE'}
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
          style={{
            background: isLoading && !hasData ? '#005a20' : '#00e85a',
            boxShadow:  isLoading && !hasData ? 'none' : '0 0 5px #00e85a',
          }}
        />
      </div>

      {/* Bandeau défilant — utilise la classe CSS ticker-scroll + CSS var pour la durée */}
      <div
        className="ticker-scroll flex items-center h-full"
        style={{ '--ticker-dur': `${dur}s` } as React.CSSProperties}
      >
        {hasData && realItems
          ? realItems.map((idx, i) => (
              <span key={`${idx.symbol}-${i}`} className="inline-flex items-center">
                <button
                  onClick={() => onSelectSymbol?.(idx.symbol)}
                  className="focus:outline-none"
                  tabIndex={-1}
                >
                  <TickerItem item={idx} />
                </button>
                {i < realItems.length - 1 && <Sep />}
              </span>
            ))
          : skeleItems!.map((label, i) => (
              <span key={`sk-${label}-${i}`} className="inline-flex items-center">
                <SkeletonItem label={label} />
                {i < skeleItems!.length - 1 && <Sep />}
              </span>
            ))
        }
      </div>

      {/* Fades latéraux */}
      <div className="absolute left-[68px] top-0 bottom-0 w-6 pointer-events-none z-10"
           style={{ background: 'linear-gradient(90deg,#010901,transparent)' }}/>
      <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10"
           style={{ background: 'linear-gradient(270deg,#010901,transparent)' }}/>
    </div>
  )
}
