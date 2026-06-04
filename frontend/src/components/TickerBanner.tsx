/**
 * TickerBanner — bandeau défilant style Bloomberg
 * Vert fluo néon si marché ouvert, vert clair si fermé — toujours lisible.
 */
import { useQuery } from '@tanstack/react-query'
import { getIndices } from '../services/api'

interface IndexQuote {
  name:         string
  symbol:       string
  price:        number
  change_pct:   number
  change:       number
  is_open?:     boolean
  market_state?: string
}

function fmt(v: number | null | undefined, dec = 2) {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(dec)
}
function sign(v: number) { return v >= 0 ? '+' : '' }

// ── Item LCD ──────────────────────────────────────────────────────────────────
function TickerItem({ item }: { item: IndexQuote }) {
  const pct    = item.change_pct ?? 0
  const up     = pct >= 0
  const isOpen = item.is_open ?? false

  // OUVERT : néon pur / FERMÉ : couleurs claires et lisibles quand même
  const upColor   = isOpen ? '#39ff14' : '#66ff66'
  const downColor = isOpen ? '#ff4444' : '#ff8888'
  const col       = up ? upColor : downColor
  const nameColor = isOpen ? '#b8ffb8' : '#99dd99'
  const priceColor = isOpen ? '#ffffff' : '#ddffdd'

  return (
    <span className="inline-flex items-center gap-3 px-5 whitespace-nowrap select-none">

      {/* Nom indice */}
      <span
        className="text-[11px] font-mono font-bold uppercase tracking-widest"
        style={{
          color:      nameColor,
          textShadow: isOpen ? `0 0 14px ${nameColor}` : 'none',
        }}
      >
        {item.name ?? item.symbol}
      </span>

      {/* Prix */}
      <span
        className="text-[13px] font-mono font-black tabular-nums"
        style={{
          color:      priceColor,
          textShadow: isOpen ? `0 0 12px ${col}aa` : 'none',
        }}
      >
        {(item.price ?? 0) > 0
          ? item.price.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
          : '—'}
      </span>

      {/* Badge variation */}
      <span
        className="text-[12px] font-mono font-bold tabular-nums px-2 py-0.5 rounded"
        style={{
          color:      col,
          background: up ? 'rgba(0,255,0,0.18)' : 'rgba(255,60,60,0.18)',
          border:     `1px solid ${col}66`,
          textShadow: isOpen ? `0 0 12px ${col}` : 'none',
          boxShadow:  isOpen ? `0 0 10px ${col}55` : 'none',
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
    <span className="inline-block px-2 text-[11px] font-mono select-none" style={{ color: '#336633' }} aria-hidden>
      ◆
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const SKELETON_LABELS = ['CAC 40', 'DAX', 'S&P 500', 'NASDAQ', 'FTSE 100', 'Nikkei', 'Euro Stoxx']

function SkeletonItem({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-3 px-5 whitespace-nowrap opacity-50">
      <span className="text-[11px] font-mono font-bold uppercase tracking-widest" style={{ color: '#66aa66' }}>{label}</span>
      <span className="text-[13px] font-mono font-black" style={{ color: '#558855' }}>─ ─ ─ ─</span>
      <span className="text-[12px] font-mono px-2 py-0.5 rounded"
            style={{ color: '#44aa44', background: 'rgba(0,200,0,0.10)', border: '1px solid #224422' }}>
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
  const anyOpen = indices.some(i => i.is_open)
  const dur     = hasData ? Math.max(20, indices.length * 5) : 16

  const items = hasData ? [...indices, ...indices] : null
  const skels = hasData ? null : [...SKELETON_LABELS, ...SKELETON_LABELS]

  return (
    <div
      className="relative h-9 border-b overflow-hidden flex items-center"
      style={{
        /* Fond vert foncé — visible, pas noir */
        background:  '#061406',
        borderColor: '#1a3a1a',
        boxShadow:   anyOpen
          ? 'inset 0 0 20px rgba(57,255,20,0.06), inset 0 -1px 0 rgba(57,255,20,0.15)'
          : 'inset 0 -1px 0 rgba(0,200,0,0.08)',
      }}
    >
      {/* Scanlines légères */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.1) 3px,rgba(0,0,0,0.1) 4px)' }}
      />

      {/* Label gauche */}
      <div
        className="shrink-0 z-20 h-full flex items-center gap-2 px-3 border-r"
        style={{ background: '#071607', borderColor: '#1a3a1a', minWidth: 68 }}
      >
        <span
          className="text-[9px] font-mono font-black tracking-[0.25em] uppercase"
          style={{
            color:      anyOpen ? '#39ff14' : '#55cc55',
            textShadow: anyOpen ? '0 0 12px #39ff14' : 'none',
          }}
        >
          {isLoading && !hasData ? 'SYNC' : anyOpen ? 'LIVE' : 'CLÔ'}
        </span>
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: anyOpen ? '#39ff14' : '#44bb44',
            boxShadow:  anyOpen ? '0 0 8px #39ff14, 0 0 18px #39ff1466' : '0 0 4px #44bb4466',
            animation:  anyOpen ? 'pulse 1.2s ease-in-out infinite' : 'none',
          }}
        />
      </div>

      {/* Défilement */}
      <div
        className="ticker-scroll flex items-center h-full"
        style={{ '--ticker-dur': `${dur}s` } as React.CSSProperties}
      >
        {items
          ? items.map((idx, i) => (
              <span key={`${idx.symbol}-${i}`} className="inline-flex items-center">
                <button
                  onClick={() => onSelectSymbol?.(idx.symbol)}
                  className="focus:outline-none"
                  tabIndex={-1}
                  style={{ cursor: onSelectSymbol ? 'pointer' : 'default' }}
                >
                  <TickerItem item={idx} />
                </button>
                {i < items.length - 1 && <Sep />}
              </span>
            ))
          : skels!.map((label, i) => (
              <span key={`sk-${i}`} className="inline-flex items-center">
                <SkeletonItem label={label} />
                {i < skels!.length - 1 && <Sep />}
              </span>
            ))
        }
      </div>

      {/* Fades côtés */}
      <div className="absolute left-[68px] top-0 bottom-0 w-6 pointer-events-none z-10"
           style={{ background: 'linear-gradient(90deg,#061406,transparent)' }}/>
      <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none z-10"
           style={{ background: 'linear-gradient(270deg,#061406,transparent)' }}/>
    </div>
  )
}
