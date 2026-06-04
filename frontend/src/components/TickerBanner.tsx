/**
 * TickerBanner — bandeau défilant style LCD Wall Street
 * Affiche les indices + les actions de l'univers les plus actives.
 */
import { useQuery } from '@tanstack/react-query'
import { getIndices } from '../services/api'

interface IndexQuote {
  name: string
  symbol: string
  price: number
  change_pct: number
  change: number
}

function fmt(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(dec)
}

function sign(v: number) { return v >= 0 ? '+' : '' }

// Petites cases LCD individuelles
function TickerItem({ item }: { item: IndexQuote }) {
  const pct = item.change_pct ?? 0
  const up  = pct >= 0
  const col = up ? '#00ff88' : '#ff4444'

  return (
    <span className="inline-flex items-center gap-2 px-4 border-r border-[#1a2a1a]/60 last:border-r-0 whitespace-nowrap">
      {/* Symbole */}
      <span
        className="text-[11px] font-mono font-bold uppercase tracking-widest"
        style={{ color: '#a0c0a0', textShadow: '0 0 6px #00ff4420' }}
      >
        {item.name ?? item.symbol}
      </span>

      {/* Prix */}
      <span
        className="text-[12px] font-mono font-black tabular-nums"
        style={{ color: '#e8ffe8', textShadow: `0 0 8px ${col}60` }}
      >
        {item.price > 0
          ? item.price.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
          : '—'
        }
      </span>

      {/* Variation */}
      <span
        className="text-[11px] font-mono font-bold tabular-nums px-1.5 py-0.5 rounded"
        style={{
          color: col,
          background: up ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)',
          textShadow: `0 0 8px ${col}80`,
          border: `1px solid ${col}20`,
        }}
      >
        {up ? '▲' : '▼'} {sign(pct)}{fmt(pct)}%
      </span>
    </span>
  )
}

// Séparateur losange style terminal
function Sep() {
  return (
    <span
      className="inline-block px-3 text-[10px] font-mono select-none"
      style={{ color: '#1a4a2a', textShadow: '0 0 4px #00ff4420' }}
    >
      ◆
    </span>
  )
}

export function TickerBanner({ onSelectSymbol }: { onSelectSymbol?: (s: string) => void }) {
  const { data: indices = [] } = useQuery<IndexQuote[]>({
    queryKey:        ['indices'],
    queryFn:         getIndices,
    refetchInterval: 30_000,
    staleTime:       0,
  })

  if (!indices.length) {
    // Placeholder skeleton
    return (
      <div
        className="h-8 border-b border-[#0a1a0a] flex items-center px-4 overflow-hidden"
        style={{ background: '#020c02' }}
      >
        <span className="text-[10px] font-mono text-[#1a3a1a] animate-pulse tracking-widest">
          ■■■■ CONNEXION MARCHÉ ■■■■
        </span>
      </div>
    )
  }

  // Dupliquer pour boucle fluide (50% = 1 passage complet)
  const items = [...indices, ...indices]

  return (
    <div
      className="relative h-8 border-b border-[#0a1a0a] overflow-hidden flex items-center select-none"
      style={{
        background: 'linear-gradient(90deg, #010801 0%, #020d02 50%, #010801 100%)',
        boxShadow: 'inset 0 1px 0 rgba(0,255,100,0.04), inset 0 -1px 0 rgba(0,0,0,0.6)',
      }}
    >
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
        }}
      />

      {/* Label fixe */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 z-20 h-full border-r border-[#0a1a0a]"
        style={{ background: 'linear-gradient(90deg, #010a01, #021202)' }}
      >
        <span
          className="text-[9px] font-mono font-black tracking-[0.25em] uppercase"
          style={{ color: '#00cc66', textShadow: '0 0 8px #00ff6640' }}
        >
          LIVE
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: '#00ff66', boxShadow: '0 0 6px #00ff66' }}
        />
      </div>

      {/* Bandeau défilant */}
      <div
        className="flex items-center h-full"
        style={{
          animation: `ticker ${Math.max(30, indices.length * 6)}s linear infinite`,
          willChange: 'transform',
        }}
      >
        {items.map((idx, i) => (
          <span key={`${idx.symbol}-${i}`} className="inline-flex items-center">
            <button
              onClick={() => onSelectSymbol && idx.symbol && onSelectSymbol(idx.symbol)}
              className="focus:outline-none"
              style={{ cursor: onSelectSymbol ? 'pointer' : 'default' }}
            >
              <TickerItem item={idx} />
            </button>
            {i < items.length - 1 && <Sep />}
          </span>
        ))}
      </div>

      {/* Fade gauche (après label fixe) */}
      <div
        className="absolute left-[72px] top-0 bottom-0 w-8 pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, #010801, transparent)' }}
      />
      {/* Fade droite */}
      <div
        className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10"
        style={{ background: 'linear-gradient(270deg, #010801, transparent)' }}
      />
    </div>
  )
}
