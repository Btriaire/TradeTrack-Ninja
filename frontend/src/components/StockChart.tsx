import { useEffect, useRef } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'
import type { Candle, Indicators } from '../types'

interface Props {
  candles: Candle[]
  indicators?: Indicators
  symbol: string
}

export function StockChart({ candles, indicators, symbol }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)

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
      width: chartRef.current.clientWidth,
      height: 380,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })
    candleSeries.setData(candles as any)

    if (indicators?.sma20) {
      const sma20 = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'SMA20' })
      sma20.setData(candles.map((c, i) => ({ time: c.time, value: indicators.sma20 })) as any)
    }

    if (indicators?.bb_upper && indicators?.bb_lower) {
      const bbUp = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, lineStyle: 2, title: 'BB+' })
      const bbLo = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, lineStyle: 2, title: 'BB-' })
      bbUp.setData(candles.map(c => ({ time: c.time, value: indicators.bb_upper })) as any)
      bbLo.setData(candles.map(c => ({ time: c.time, value: indicators.bb_lower })) as any)
    }

    const volSeries = chart.addHistogramSeries({
      color: '#253654',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    volSeries.setData(candles.map(c => ({
      time: c.time,
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
  }, [candles, indicators])

  return (
    <div className="bg-dark-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm font-mono">{symbol}</span>
        {indicators && (
          <div className="flex gap-3 text-xs">
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
      <div ref={chartRef} />
    </div>
  )
}
