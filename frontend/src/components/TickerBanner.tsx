/**
 * TickerBanner — bandeau défilant style Bloomberg/LCD
 * Vert fluo néon quand le marché est ouvert, vert doux quand fermé.
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

function fmt(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(dec)
}
function sign(v: number) { return v >= 0 ? '+' : '' }

// ── Item LCD ──────────────────────────────────────────────────────────────────
function TickerItem({ item }: { item: IndexQuote }) {
  const pct    = item.change_pct ?? 0
  const up     = pct >= 0
  const isOpen = item.is_open ?? false

  // Couleurs : fluo néon si séance ouverte, doux si fermé
  const upCol   = isOpen ? '#39ff14' : '#00cc55'   // néon lime vs vert doux
  const downCol = isOpen ? '#ff3b3b' : '#cc3333'   // rouge vif vs rouge doux
  const col     = up ? upCol : downCol

  // Intensité des glows
  const nameGlow  = isOpen ? '0 0 12px #39ff1470' : '0 0 6px #00cc2230'
  const priceGlow = isOpen ? `0 0 16px ${col}80`  : `0 0 6px ${col}30`
  const badgeGlow = isOpen ? `0 0 12px ${col}80`  : 'none'

  return (
    <span className="inline-flex items-center gap-2.5 px-5 whitespace-nowrap select-none">
      {/* Nom */}
      <span
        className="text-[11px] font-mono font-bold uppercase tracking-widest"
        style={{
          color:      isOpen ? '#a8ff78' : '#5a9a5a',
          textShadow: nameGlow,
        }}
      >
        {item.name ?? item.symbol}
      </span>

      {/* Prix */}
      <span
        className="text-[13px] font-mono font-black tabular-nums"
        style={{
          color:      isOpen ? '#f0fff0' : '#c8e8c8',
          textShadow: priceGlow,
        }}
      >
        {(item.price ?? 0) > 0
          ? item.price.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
          : '—'}
      </span>

      {/* Badge variation */}
      <span
        className="text-[11px] font-mono font-bold tabular-nums px-2 py-0.5 rounded"
        style={{
          color:      col,
          background: up
            ? (isOpen ? 'rgba(57,255,20,0.16)'  : 'rgba(0,204,85,0.10)')
            : (isOpen ? 'rgba(255,59,59,0.16)'  : 'rgba(204,51,51,0.10)'),
          textShadow: `0 0 10px ${col}${isOpen ? 'cc' : '50'}`,
          border:     `1px solid ${col}${isOpen ? '55' : '25'}`,
          boxShadow:  badgeGlow,
        }}
      >
        {up ? '▲' : '▼'} {sign(pct)}{fmt(pct)}%
      </span>

      {/* Indicateur OPEN/CLOSED en micro */}
      {!isOpen && (
        <span
          className="text-[8px] font-mono uppercase tracking-widest"
          style={{ color: '#1a3a1a' }}
        >CLÔ</span>
      )}
    </span>
  )
}

// ── Séparateur ────────────────────────────────────────────────────────────────
function Sep({ anyOpen }: { anyOpen: boolean }) {
  return (
    <span
      className="inline-block px-2 text-[10px] font-mono pointer-events-none"
      style={{ color: anyOpen ? '#1a6a2a' : '#0e3a0e', textShadow: anyOpen ? '0 0 4px #39ff1430' : 'none' }}
      aria-hidden
    >◆</span>
  )
}

// ── Skeleton animé ────────────────────────────────────────────────────────────
const SKELETON_LABELS = ['CAC 40', 'DAX', 'S&P 500', 'NASDAQ', 'FTSE 100', 'Nikkei', 'Euro Stoxx']

function SkeletonItem({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 px-5 whitespace-nowrap">
      <span style={{ color: '#2a5a2a' }} className="text-[11px] font-mono font-bold uppercase tracking-widest">{label}</span>
      <span style={{ color: '#1a4a1a' }} className="text-[13px] font-mono font-black tabular-nums">─────</span>
      <span style={{ color: '#163a16', background: 'rgba(0,255,80,0.04)', border: '1px solid #0e2a0e' }}
            className="text-[11px] font-mono px-2 py-0.5 rounded">▲ --.-%</span>
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

  const hasData  = indices.length > 0
  const anyOpen  = indices.some(i => i.is_open)   // au moins un marché ouvert
  const dur      = hasData ? Math.max(25, indices.length * 5) : 18

  const realItems  = hasData ? [...indices, ...indices] : null
  const skeleItems = hasData ? null : [...SKELETON_LABELS, ...SKELETON_LABELS]

  // Fond et label selon état ouvert/fermé
  const bgFrom   = anyOpen ? '#021402' : '#020f02'
  const bgMid    = anyOpen ? '#031a03' : '#031503'
  const dotColor = anyOpen ? '#39ff14' : (hasData ? '#00cc55' : '#005a20')
  const dotGlow  = anyOpen ? '0 0 10px #39ff14, 0 0 20px #39ff1450' : (hasData ? '0 0 6px #00cc5540' : 'none')
  const liveCol  = anyOpen ? '#39ff14' : '#00aa44'
  const liveGlow = anyOpen ? '0 0 12px #39ff1490' : '0 0 8px #00cc5550'

  return (
    <div
      className="relative h-9 border-b overflow-hidden flex items-center"
      style={{
        background:  `linear-gradient(90deg, ${bgFrom} 0%, ${bgMid} 50%, ${bgFrom} 100%)`,
        borderColor: anyOpen ? '#0d3a0d' : '#0d2a0d',
        boxShadow:   anyOpen
          ? 'inset 0 -1px 0 rgba(57,255,20,0.12), 0 1px 0 rgba(0,0,0,0.5)'
          : 'inset 0 -1px 0 rgba(0,255,80,0.06), 0 1px 0 rgba(0,0,0,0.5)',
      }}
    >
      {/* Scanlines CRT */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.07) 3px,rgba(0,0,0,0.07) 4px)',
        }}
      />

      {/* Label LIVE fixe */}
      <div
        className="shrink-0 z-20 h-full flex items-center gap-2 px-3 border-r"
        style={{
          background:  `linear-gradient(90deg, ${bgFrom}, ${bgMid})`,
          borderColor: anyOpen ? '#0d3a0d' : '#0d2a0d',
        }}
      >
        <span
          className="text-[9px] font-mono font-black tracking-[0.3em] uppercase"
          style={{ color: liveCol, textShadow: liveGlow }}
        >
          {isLoading && !hasData ? 'SYNC' : anyOpen ? 'LIVE' : 'CLÔ'}
        </span>
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background: dotColor,
            boxShadow:  dotGlow,
            animation:  anyOpen ? 'pulse 1.5s ease-in-out infinite' : 'none',
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
                {i < realItems.length - 1 && <Sep anyOpen={anyOpen} />}
              </span>
            ))
          : skeleItems!.map((label, i) => (
              <span key={`sk-${label}-${i}`} className="inline-flex items-center">
                <SkeletonItem label={label} />
                {i < skeleItems!.length - 1 && <Sep anyOpen={false} />}
              </span>
            ))
        }
      </div>

      {/* Fades latéraux */}
      <div className="absolute left-[74px] top-0 bottom-0 w-8 pointer-events-none z-10"
           style={{ background: `linear-gradient(90deg, ${bgFrom}, transparent)` }}/>
      <div className="absolute right-0 top-0 bottom-0 w-10 pointer-events-none z-10"
           style={{ background: `linear-gradient(270deg, ${bgFrom}, transparent)` }}/>
    </div>
  )
}
