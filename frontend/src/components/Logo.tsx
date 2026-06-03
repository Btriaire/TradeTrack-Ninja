interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export function Logo({ size = 32, showText = true, className = '' }: LogoProps) {
  const s = size
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* ── SVG Mark ─────────────────────────────────────────────────── */}
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Outer hexagon glow */}
        <polygon
          points="20,1 37,10.5 37,29.5 20,39 3,29.5 3,10.5"
          fill="#1a0000"
          stroke="#7F1D1D"
          strokeWidth="1.2"
          opacity="0.9"
        />
        {/* Inner hexagon fill */}
        <polygon
          points="20,4 34,12 34,28 20,36 6,28 6,12"
          fill="url(#logoGrad)"
          opacity="0.15"
        />
        {/* Chart bars — rising */}
        <rect x="9"  y="23" width="3.5" height="8"  rx="0.8" fill="#7F1D1D" opacity="0.7"/>
        <rect x="14" y="19" width="3.5" height="12" rx="0.8" fill="#991B1B" opacity="0.85"/>
        <rect x="19" y="14" width="3.5" height="17" rx="0.8" fill="#B91C1C" />
        <rect x="24" y="10" width="3.5" height="21" rx="0.8" fill="#DC2626" />
        {/* Trend line */}
        <polyline
          points="10.75,21 15.75,17 20.75,12 26.25,8"
          stroke="#FECACA"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Arrow tip at top right */}
        <polyline
          points="23.5,7 26.25,8 25.5,10.5"
          stroke="#FECACA"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Ninja shuriken star — top left accent */}
        <g transform="translate(8,5) rotate(15 4 4)" opacity="0.85">
          <polygon points="4,1 5,3.5 7.5,4 5,5 4,7.5 3,5 0.5,4 3,3.5" fill="#EF4444" strokeWidth="0"/>
        </g>
        {/* Gradient def */}
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#DC2626" stopOpacity="1"/>
            <stop offset="100%" stopColor="#7F1D1D" stopOpacity="1"/>
          </linearGradient>
        </defs>
      </svg>

      {/* ── Wordmark ────────────────────────────────────────────────── */}
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold tracking-tight text-white" style={{ fontSize: size * 0.38, letterSpacing: '-0.02em' }}>
            TradeTrack
          </span>
          <span className="font-black tracking-widest uppercase" style={{ fontSize: size * 0.26, color: '#DC2626', letterSpacing: '0.15em' }}>
            Ninja
          </span>
        </div>
      )}
    </div>
  )
}

/* Compact icon-only variant */
export function LogoIcon({ size = 24 }: { size?: number }) {
  return <Logo size={size} showText={false} />
}
