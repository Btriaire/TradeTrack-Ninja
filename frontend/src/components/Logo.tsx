interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export function Logo({ size = 32, showText = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img src="/favicon.svg" width={size} height={size} alt="" />

      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-bold tracking-tight text-white" style={{ fontSize: size * 0.38, letterSpacing: '-0.02em' }}>
            TradeTrack
          </span>
          <span className="font-black tracking-widest uppercase" style={{ fontSize: size * 0.26, color: '#60a5fa', letterSpacing: '0.15em' }}>
            Ninja
          </span>
        </div>
      )}
    </div>
  )
}

export function LogoIcon({ size = 24 }: { size?: number }) {
  return <Logo size={size} showText={false} />
}
