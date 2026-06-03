import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import {
  TrendingUp, TrendingDown, RefreshCw, Activity,
  BarChart2, Clock,
} from 'lucide-react'
import { getIntraday } from '../services/api'

interface Candle {
  time:   number
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

interface Session {
  open:       number | null
  high:       number | null
  low:        number | null
  vwap:       number | null
  volume:     number
  current:    number | null
  delta_open: number | null
}

interface IntradayData {
  symbol:       string
  interval:     string
  candles:      Candle[]
  market_state: string
  session:      Session
}

const INTERVALS = [
  { id: '1m',  label: '1 min' },
  { id: '5m',  label: '5 min' },
  { id: '15m', label: '15 min' },
  { id: '30m', label: '30 min' },
]

function fmtVol(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// ── Stat pill ─────────────────────────────────────────────────────────────
function Stat({ label, value, color = 'text-slate-300' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-1.5 bg-dark-700/60 rounded-lg border border-dark-600/50 min-w-[70px]">
      <span className="text-[10px] text-slate-600 tracking-wider font-mono uppercase">{label}</span>
      <span className={`text-xs font-mono font-bold mt-0.5 ${color}`}>{value}</span>
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────
export function IntradayChart({ symbol }: { symbol: string }) {
  const [interval, setInterval] = useState('5m')
  const chartRef = useRef<HTMLDivElement>(null)
  const chartObj = useRef<ReturnType<typeof createChart> | null>(null)

  const isOpen = (state: string) => state === 'REGULAR'

  const { data, isLoading, refetch, isFetching } = useQuery<IntradayData>({
    queryKey:        ['intraday', symbol, interval],
    queryFn:         () => getIntraday(symbol, interval),
    refetchInterval: (q) => {
      const d = q.state.data as IntradayData | undefined
      if (!d) return 60_000
      return isOpen(d.market_state)
        ? (interval === '1m' ? 30_000 : 60_000)
        : 5 * 60_000
    },
    staleTime: 0,
  })

  // ── Construction du chart lightweight-charts ──────────────────────────
  useEffect(() => {
    if (!chartRef.current || !data?.candles?.length) return

    // Nettoyage précédent
    chartObj.current?.remove()
    chartObj.current = null

    const el = chartRef.current
    const chart = createChart(el, {
      width:  el.clientWidth,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor:  '#64748b',
        fontSize:   11,
        fontFamily: '"JetBrains Mono", monospace',
      },
      grid: {
        vertLines: { color: '#111111' },
        horzLines: { color: '#111111' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#3b82f6', width: 1, style: 3 },
        horzLine: { color: '#3b82f6', width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: '#1a1a1a',
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor:    '#1a1a1a',
        timeVisible:    true,
        secondsVisible: false,
        tickMarkFormatter: (t: number) => fmtTime(t),
      },
      handleScroll:   { mouseWheel: true, pressedMouseMove: true },
      handleScale:    { mouseWheel: true, pinch: true },
    })

    // ── Série prix (area) ───────────────────────────────────────────────
    const lastClose  = data.candles[data.candles.length - 1].close
    const firstClose = data.candles[0].open
    const isPositive = lastClose >= firstClose

    const areaSeries = chart.addAreaSeries({
      lineColor:       isPositive ? '#10b981' : '#ef4444',
      topColor:        isPositive ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)',
      bottomColor:     'rgba(0,0,0,0)',
      lineWidth:       2,
      priceLineVisible:false,
      lastValueVisible:true,
    })
    areaSeries.setData(
      data.candles.map(c => ({ time: c.time as any, value: c.close }))
    )

    // ── Ligne VWAP ──────────────────────────────────────────────────────
    if (data.session.vwap) {
      const vwapSeries = chart.addLineSeries({
        color:            '#f59e0b',
        lineWidth:        1,
        lineStyle:        2,   // dashed
        priceLineVisible: false,
        lastValueVisible: false,
        title:            'VWAP',
      })
      // Trace une ligne horizontale VWAP sur toute la séance
      vwapSeries.setData(
        data.candles.map(c => ({ time: c.time as any, value: data.session.vwap! }))
      )
    }

    // ── Histogramme volume ──────────────────────────────────────────────
    const volSeries = chart.addHistogramSeries({
      priceScaleId: 'volume',
      priceFormat:  { type: 'volume' },
    })
    volSeries.setData(
      data.candles.map(c => ({
        time:  c.time as any,
        value: c.volume,
        color: c.close >= c.open
          ? 'rgba(16,185,129,0.45)'
          : 'rgba(239,68,68,0.45)',
      }))
    )
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    chart.timeScale().fitContent()
    chartObj.current = chart

    // Responsive resize
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartObj.current = null
    }
  }, [data])

  const s = data?.session
  const deltaUp = (s?.delta_open ?? 0) >= 0

  return (
    <div className="bg-dark-800 border border-dark-600 rounded-xl overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600/50">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-cyan-400" />
          <span className="text-xs font-mono font-bold text-white tracking-wide">
            INTRADAY · {symbol}
          </span>
          {/* État marché */}
          {data && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              isOpen(data.market_state)
                ? 'text-green-400 bg-green-500/10 border-green-500/25'
                : 'text-slate-500 bg-dark-700 border-dark-600'
            }`}>
              {data.market_state === 'REGULAR'  ? '● OUVERT'
               : data.market_state === 'PRE'    ? '◐ PRÉ'
               : data.market_state === 'POST'   ? '◑ POST'
               : '○ FERMÉ'}
            </span>
          )}
        </div>

        {/* Sélecteur intervalle + refresh */}
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-dark-700 rounded-lg p-0.5">
            {INTERVALS.map(iv => (
              <button
                key={iv.id}
                onClick={() => setInterval(iv.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors ${
                  interval === iv.id
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="p-1.5 text-slate-600 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
          >
            <RefreshCw size={12} className={isFetching ? 'animate-spin text-cyan-400' : ''} />
          </button>
        </div>
      </div>

      {/* ── Stats de séance ──────────────────────────────────────────── */}
      {s && (
        <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none border-b border-dark-600/30 flex-wrap">
          {s.open     != null && <Stat label="Ouverture" value={s.open.toFixed(2)} />}
          {s.high     != null && <Stat label="Haut" value={s.high.toFixed(2)} color="text-green-400" />}
          {s.low      != null && <Stat label="Bas"  value={s.low.toFixed(2)}  color="text-red-400" />}
          {s.vwap     != null && <Stat label="VWAP" value={s.vwap.toFixed(2)} color="text-amber-400" />}
          {s.volume   > 0     && <Stat label="Volume" value={fmtVol(s.volume)} color="text-slate-300" />}
          {s.delta_open != null && (
            <Stat
              label="Δ Ouv."
              value={`${deltaUp ? '+' : ''}${s.delta_open.toFixed(2)}%`}
              color={deltaUp ? 'text-green-400' : 'text-red-400'}
            />
          )}
          {/* Nombre de bougies */}
          {data && (
            <div className="flex items-center gap-1 text-[10px] text-slate-700 font-mono ml-auto shrink-0">
              <Clock size={9} />
              {data.candles.length} bougies
              {data.candles.length > 0 && ` · ${fmtTime(data.candles[0].time)}–${fmtTime(data.candles[data.candles.length - 1].time)}`}
            </div>
          )}
        </div>
      )}

      {/* ── Chart ────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="h-80 flex items-center justify-center gap-3 text-slate-600">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm font-mono">Chargement séance…</span>
        </div>
      )}

      {!isLoading && (!data?.candles?.length) && (
        <div className="h-80 flex flex-col items-center justify-center gap-2 text-slate-600">
          <BarChart2 size={24} className="opacity-30" />
          <span className="text-sm font-mono">Pas de données intraday disponibles</span>
          <span className="text-xs text-slate-700">Le marché est peut-être fermé ou les données ne sont pas disponibles</span>
        </div>
      )}

      {!isLoading && (data?.candles?.length ?? 0) > 0 && (
        <div ref={chartRef} className="w-full" />
      )}

      {/* ── Légende VWAP ─────────────────────────────────────────────── */}
      {data?.session?.vwap && (
        <div className="flex items-center gap-3 px-4 py-2 border-t border-dark-600/30 text-[10px] font-mono text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t-2 border-dashed border-amber-500/70" />
            VWAP {data.session.vwap.toFixed(2)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-green-500/40" />
            Hausse
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-red-500/40" />
            Baisse
          </span>
          <span className="ml-auto text-slate-700">Yahoo Finance · ~15min delay</span>
        </div>
      )}
    </div>
  )
}
