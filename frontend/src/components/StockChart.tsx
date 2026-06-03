import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import type { Candle, Indicators } from '../types'

type ChartType = 'candles' | 'heikin' | 'line' | 'area' | 'bars'

interface Props {
  candles:     Candle[]
  indicators?: Indicators
  symbol:      string
}

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'candles', label: '🕯 Chandeliers' },
  { id: 'heikin',  label: '🕯 Heikin-Ashi' },
  { id: 'bars',    label: '📊 Barres OHLC'  },
  { id: 'line',    label: '📈 Ligne'        },
  { id: 'area',    label: '🏔 Aire'         },
]

/** Calcule les bougies Heikin-Ashi à partir des bougies normales */
function toHeikinAshi(candles: Candle[]): Candle[] {
  const ha: Candle[] = []
  for (let i = 0; i < candles.length; i++) {
    const c  = candles[i]
    const ha_close = (c.open + c.high + c.low + c.close) / 4
    const ha_open  = i === 0
      ? (c.open + c.close) / 2
      : (ha[i - 1].open + ha[i - 1].close) / 2
    const ha_high  = Math.max(c.high, ha_open, ha_close)
    const ha_low   = Math.min(c.low,  ha_open, ha_close)
    ha.push({ ...c, open: ha_open, high: ha_high, low: ha_low, close: ha_close })
  }
  return ha
}

export function StockChart({ candles, indicators, symbol }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [chartType, setChartType] = useState<ChartType>('candles')

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1629' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e2d47' },
        horzLines: { color: '#1e2d47' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#1e2d47' },
      timeScale: { borderColor: '#1e2d47', timeVisible: true },
      width:  chartRef.current.clientWidth,
      height: 380,
    })

    const data = chartType === 'heikin' ? toHeikinAshi(candles) : candles

    // ── Série principale selon le type ──────────────────────────────────────
    if (chartType === 'candles' || chartType === 'heikin') {
      const series = chart.addCandlestickSeries({
        upColor:       '#10b981',
        downColor:     '#ef4444',
        borderVisible: false,
        wickUpColor:   '#10b981',
        wickDownColor: '#ef4444',
      })
      series.setData(data as any)

    } else if (chartType === 'bars') {
      const series = chart.addBarSeries({
        upColor:   '#10b981',
        downColor: '#ef4444',
      })
      series.setData(data as any)

    } else if (chartType === 'line') {
      const series = chart.addLineSeries({
        color:     '#3b82f6',
        lineWidth: 2,
      })
      series.setData(candles.map(c => ({ time: c.time, value: c.close })) as any)

    } else if (chartType === 'area') {
      const series = chart.addAreaSeries({
        lineColor:    '#3b82f6',
        topColor:     '#3b82f620',
        bottomColor:  '#3b82f600',
        lineWidth:    2,
      })
      series.setData(candles.map(c => ({ time: c.time, value: c.close })) as any)
    }

    // ── Indicateurs ─────────────────────────────────────────────────────────
    if (indicators?.sma20) {
      const sma20 = chart.addLineSeries({
        color: '#f59e0b', lineWidth: 1, title: 'SMA20',
      })
      sma20.setData(candles.map(c => ({ time: c.time, value: indicators.sma20 })) as any)
    }

    if (indicators?.sma50) {
      const sma50 = chart.addLineSeries({
        color: '#a78bfa', lineWidth: 1, title: 'SMA50',
      })
      sma50.setData(candles.map(c => ({ time: c.time, value: indicators.sma50 })) as any)
    }

    if (indicators?.bb_upper && indicators?.bb_lower) {
      const bbUp = chart.addLineSeries({
        color: '#3b82f688', lineWidth: 1, lineStyle: 2, title: 'BB+',
      })
      const bbLo = chart.addLineSeries({
        color: '#3b82f688', lineWidth: 1, lineStyle: 2, title: 'BB-',
      })
      bbUp.setData(candles.map(c => ({ time: c.time, value: indicators.bb_upper })) as any)
      bbLo.setData(candles.map(c => ({ time: c.time, value: indicators.bb_lower })) as any)
    }

    // ── Volume ───────────────────────────────────────────────────────────────
    const volSeries = chart.addHistogramSeries({
      color:        '#253654',
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volSeries.setData(candles.map(c => ({
      time:  c.time,
      value: c.volume,
      color: c.close >= c.open ? '#10b98133' : '#ef444433',
    })) as any)

    chart.timeScale().fitContent()

    const handleResize = () => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [candles, indicators, chartType])

  return (
    <div className="bg-dark-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-slate-400 text-sm font-mono">{symbol}</span>
        {indicators && (
          <div className="flex gap-2 text-xs">
            <span className="text-yellow-400">RSI {indicators.rsi}</span>
            <span className={indicators.macd > indicators.macd_signal ? 'text-green-400' : 'text-red-400'}>
              MACD {indicators.macd > indicators.macd_signal ? '▲' : '▼'}
            </span>
            <span className={
              indicators.signal === 'HAUSSIER' ? 'text-green-400' :
              indicators.signal === 'BAISSIER' ? 'text-red-400' : 'text-slate-400'
            }>
              {indicators.signal}
            </span>
          </div>
        )}
      </div>

      {/* Sélecteur de type */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {CHART_TYPES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setChartType(id)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              chartType === id
                ? 'bg-accent-blue text-white'
                : 'bg-dark-700 text-slate-500 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {candles.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-slate-600 text-sm">
          Données non disponibles — vérifiez la connexion backend.
        </div>
      ) : (
        <div ref={chartRef} />
      )}
    </div>
  )
}
