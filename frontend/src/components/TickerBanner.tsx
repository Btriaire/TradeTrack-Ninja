/**
 * TickerBanner — panneau LCD dot-matrix style années 80
 * Police pixelisée VT323, scanlines, effet phosphore vert
 */
import { useQuery } from '@tanstack/react-query'
import { getIndices } from '../services/api'

interface IndexQuote {
  name:          string
  symbol:        string
  price:         number
  change_pct:    number
  change:        number
  is_open?:      boolean
  market_state?: string
}

function fmt(v: number | null | undefined, dec = 2) {
  if (v == null || !isFinite(v)) return '---'
  return v.toFixed(dec)
}
function sign(v: number) { return v >= 0 ? '+' : '' }

// ── Item LCD ──────────────────────────────────────────────────────────────────
function TickerItem({ item }: { item: IndexQuote }) {
  const pct    = item.change_pct ?? 0
  const up     = pct >= 0
  const isOpen = item.is_open ?? false

  // Couleurs phosphore
  const neonGreen = '#39ff14'
  const softGreen = '#7fff50'
  const neonRed   = '#ff3333'
  const softRed   = '#ff7777'

  const col       = up ? (isOpen ? neonGreen : softGreen) : (isOpen ? neonRed : softRed)
  const nameCol   = isOpen ? '#a0ffa0' : '#80cc80'
  const priceCol  = isOpen ? '#e8ffe8' : '#b8eeb8'

  const glow = isOpen
    ? `0 0 8px ${col}cc, 0 0 20px ${col}66`
    : 'none'

  return (
    <span className="inline-flex items-center gap-2 px-4 whitespace-nowrap select-none font-lcd">

      {/* Séparateur gauche — pixel */}
      <span style={{ color: '#1a4a1a', fontSize: 16 }}>█</span>

      {/* Nom indice */}
      <span
        style={{
          color:      nameCol,
          fontSize:   13,
          textShadow: isOpen ? `0 0 10px ${nameCol}bb` : 'none',
          letterSpacing: '0.08em',
        }}
      >
        {item.name ?? item.symbol}
      </span>

      {/* Prix */}
      <span
        style={{
          color:      priceCol,
          fontSize:   15,
          fontWeight: 700,
          textShadow: isOpen ? `0 0 12px ${priceCol}99` : 'none',
        }}
      >
        {(item.price ?? 0) > 0
          ? item.price.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
          : '----'}
      </span>

      {/* Badge variation */}
      <span
        style={{
          color:      col,
          fontSize:   14,
          fontWeight: 700,
          background: up ? 'rgba(0,80,0,0.5)' : 'rgba(80,0,0,0.5)',
          border:     `1px solid ${col}55`,
          borderRadius: 3,
          padding:    '1px 6px',
          textShadow: glow,
          boxShadow:  isOpen ? `0 0 8px ${col}44, inset 0 0 6px ${col}22` : 'none',
          display:    'inline-block',
        }}
      >
        {up ? '▲' : '▼'} {sign(pct)}{fmt(pct)}%
      </span>

    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
const SKELETON_LABELS = ['CAC 40', 'DAX', 'S&P 500', 'NASDAQ', 'FTSE 100', 'Nikkei 225', 'Euro Stoxx 50']

function SkeletonItem({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 whitespace-nowrap font-lcd opacity-40">
      <span style={{ color: '#1a4a1a', fontSize: 16 }}>█</span>
      <span style={{ color: '#669966', fontSize: 13, letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color: '#446644', fontSize: 15 }}>----</span>
      <span style={{ color: '#446644', fontSize: 14, border: '1px solid #224422',
                     borderRadius: 3, padding: '1px 6px', background: 'rgba(0,40,0,0.4)' }}>
        ▲ --.--%
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
    retry:           3,
  })

  const hasData = indices.length > 0
  const anyOpen = indices.some(i => i.is_open)
  const dur     = hasData ? Math.max(25, indices.length * 6) : 20

  const items = hasData ? [...indices, ...indices] : null
  const skels = hasData ? null : [...SKELETON_LABELS, ...SKELETON_LABELS]

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height:      42,
        background:  'linear-gradient(180deg, #020d02 0%, #041004 50%, #020d02 100%)',
        borderBottom: '1px solid #1a3a1a',
        borderTop:    '1px solid #0d200d',
        boxShadow: anyOpen
          ? 'inset 0 1px 0 rgba(57,255,20,0.08), inset 0 -1px 0 rgba(57,255,20,0.12), 0 2px 12px rgba(0,0,0,0.8)'
          : 'inset 0 1px 0 rgba(0,60,0,0.3), 0 2px 12px rgba(0,0,0,0.8)',
      }}
    >
      {/* Overlay scanlines LCD */}
      <div
        className="absolute inset-0 pointer-events-none z-20 lcd-scanlines"
        style={{ opacity: 0.5 }}
      />
      {/* Overlay dot-matrix */}
      <div
        className="absolute inset-0 pointer-events-none z-20 lcd-dots"
        style={{ opacity: 0.3 }}
      />

      {/* Label gauche — style borne d'arcade */}
      <div
        className="absolute left-0 top-0 bottom-0 z-30 flex items-center gap-2 px-3 font-lcd"
        style={{
          background:  'linear-gradient(90deg, #020d02 70%, transparent)',
          minWidth:    80,
          borderRight: '1px solid #1a3a1a',
        }}
      >
        {/* Indicateur LED */}
        <span
          style={{
            display:    'inline-block',
            width:      8,
            height:     8,
            borderRadius: 2,
            background: anyOpen ? '#39ff14' : '#336633',
            boxShadow:  anyOpen
              ? '0 0 6px #39ff14, 0 0 14px #39ff1488'
              : '0 0 4px #33663366',
            animation:  anyOpen ? 'lcd-blink 1.4s step-end infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color:      anyOpen ? '#39ff14' : '#559955',
            fontSize:   11,
            letterSpacing: '0.2em',
            textShadow: anyOpen ? '0 0 10px #39ff14cc' : 'none',
            fontWeight: 700,
          }}
        >
          {isLoading && !hasData ? 'SYNC' : anyOpen ? 'LIVE' : 'CLÔ'}
        </span>
      </div>

      {/* Zone défilement */}
      <div className="absolute inset-0 flex items-center" style={{ paddingLeft: 86 }}>
        <div
          className="ticker-scroll flex items-center h-full"
          style={{ '--ticker-dur': `${dur}s` } as React.CSSProperties}
        >
          {items
            ? items.map((idx, i) => (
                <span key={`${idx.symbol}-${i}`}>
                  <button
                    onClick={() => onSelectSymbol?.(idx.symbol)}
                    className="focus:outline-none"
                    tabIndex={-1}
                    style={{ cursor: onSelectSymbol ? 'pointer' : 'default' }}
                  >
                    <TickerItem item={idx} />
                  </button>
                </span>
              ))
            : skels!.map((label, i) => (
                <span key={`sk-${i}`}>
                  <SkeletonItem label={label} />
                </span>
              ))
          }
        </div>
      </div>

      {/* Fades phosphore côtés */}
      <div className="absolute left-[86px] top-0 bottom-0 w-8 pointer-events-none z-10"
           style={{ background: 'linear-gradient(90deg, #041004, transparent)' }}/>
      <div className="absolute right-0 top-0 bottom-0 w-12 pointer-events-none z-10"
           style={{ background: 'linear-gradient(270deg, #020d02, transparent)' }}/>
    </div>
  )
}
