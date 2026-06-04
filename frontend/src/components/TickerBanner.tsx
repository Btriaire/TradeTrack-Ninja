/**
 * TickerBanner — bandeau défilant style Bloomberg/LCD
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
  const col = up ? '#00ff88' : '#ff5555'

  return (
    <span className="inline-flex items-center gap-2.5 px-5 whitespace-nowrap select-none">
      {/* Nom */}
      <span
        className="text-[11px] font-mono font-bold uppercase tracking-widest"
        style={{ color: '#7dd87d', textShadow: '0 0 10px #00ff6650' }}
      >
        {item.name ?? item.symbol}
      </span>

      {/* Prix */}
      <span
        className="text-[13px] font-mono font-black tabular-nums"
        style={{ color: '#e8ffe8', textShadow: `0 0 12px ${col}70` }}
      >
        {(item.price ?? 0) > 0
          ? item.price.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
          : '—'}
      </span>

      {/* Variation badge */}
      <span
        className="text-[11px] font-mono font-bold tabular-nums px-2 py-0.5 rounded"
        style={{
          color:      col,
          background: up ? 'rgba(0,255,136,0.14)' : 'rgba(255,85,85,0.14)',
          textShadow: `0 0 10px ${col}90`,
          border:     `1px solid ${col}35`,
          boxShadow:  `0 0 8px ${col}20`,
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
      style={{ color: '#1a5a2a', textShadow: '0 0 4px #00ff4430' }}
      aria-hidden
    >◆</span>
  )
}

// ── Skeleton animé (pendant le chargement) ────────────────────────────────────
const SKELETON_LABELS = ['CAC 40', 'DAX', 'S&P 500', 'NASDAQ', 'FTSE 100', 'Nikkei', 'Euro Stoxx']

function SkeletonItem({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 px-5 whitespace-nowrap">
      <span style={{ color: '#2a5a2a', textShadow: '0 0 6px #00ff2215' }}
            className="text-[11px] font-mono font-bold uppercase tracking-widest">
        {label}
      </span>
      <span style={{ color: '#1a4a1a' }} className="text-[13px] font-mono font-black tabular-nums">
        ─────
      </span>
      <span style={{ color: '#163a16', background: 'rgba(0,255,80,0.04)', border: '1px solid #0e2a0e' }}
            className="text-[11px] font-mono px-2 py-0.5 rounded">
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

  const hasData = indices.length > 0
  const dur     = hasData ? Math.max(25, indices.length * 5) : 18

  const realItems  = hasData ? [...indices, ...indices] : null
  const skeleItems = hasData ? null : [...SKELETON_LABELS, ...SKELETON_LABELS]

  return (
    <div
      className="relative h-9 border-b overflow-hidden flex items-center"
      style={{
        // Fond visible — vert très sombre mais pas noir
        background:  'linear-gradient(90deg, #020f02 0%, #031503 50%, #020f02 100%)',
        borderColor: '#0d2a0d',
        boxShadow:   'inset 0 -1px 0 rgba(0,255,80,0.08), 0 1px 0 rgba(0,0,0,0.5)',
      }}
    >
      {/* Scanlines CRT légères */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)',
        }}
      />

      {/* Label LIVE fixe */}
      <div
        className="shrink-0 z-20 h-full flex items-center gap-2 px-3 border-r"
        style={{ background: 'linear-gradient(90deg, #021202, #031a03)', borderColor: '#0d2a0d' }}
      >
        <span
          className="text-[9px] font-mono font-black tracking-[0.3em] uppercase"
          style={{ color: '#00dd55', textShadow: '0 0 10px #00ff6680' }}
        >
          {isLoading && !hasData ? 'SYNC' : 'LIVE'}
        </span>
        <span
          className="w-2 h-2 rounded-full animate-pulse shrink-0"
          style={{
            background: hasData ? '#00ff66' : '#005a20',
            boxShadow:  hasData ? '0 0 8px #00ff66, 0 0 16px #00ff6640' : 'none',
          }}
        />
      </div>

      {/* Bandeau défilant */}
      <div
        className="ticker-scroll flex items-center h-full"
        style={{ '--ticker-dur': `${dur}s` } as React.CSSProperties}
      >
        {hasData && realItems
          ? realItems.map((idx, i) => (
              <span key={`${idx.symbol}-${i}`} className="inline-flex items-center">
                <button
                  onClick={() => onSelectSymbol?.(idx.symbol)}
                  className="focus:outline-none hover:brightness-125 transition-[filter] duration-150"
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
      <div className="absolute left-[74px] top-0 bottom-0 w-8 pointer-events-none z-10"
           style={{ background: 'linear-gradient(90deg, #020f02, transparent)' }}/>
      <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none z-10"
           style={{ background: 'linear-gradient(270deg, #020f02, transparent)' }}/>
    </div>
  )
}
