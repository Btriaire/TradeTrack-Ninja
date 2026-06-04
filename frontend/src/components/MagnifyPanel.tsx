/**
 * MagnifyPanel — vue "laser focus" sur une valeur
 * Prix live clignotant, refresh 5s, chandelier intraday, countdown.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createChart, ColorType, CrosshairMode, CandlestickSeriesOptions } from 'lightweight-charts'
import {
  TrendingUp, TrendingDown, RefreshCw, Crosshair,
  Clock, Zap, Activity, BarChart2,
} from 'lucide-react'
import { getLiveQuote, getIntraday } from '../services/api'

// ── Types ──────────────────────────────────────────────────────────────────────
interface LiveQuote {
  symbol:       string
  price:        number | null
  change:       number | null
  change_pct:   number | null
  volume:       number | null
  high:         number | null
  low:          number | null
  market_state: string
  is_open:      boolean
  currency:     string
}
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface Session { open: number|null; high: number|null; low: number|null; vwap: number|null; volume: number; current: number|null; delta_open: number|null }
interface IntradayData { symbol: string; interval: string; candles: Candle[]; market_state: string; session: Session }

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(v: number|null|undefined, dec=2) { return v == null || !isFinite(v) ? '—' : v.toFixed(dec) }
function sign(v: number) { return v >= 0 ? '+' : '' }
function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `${(v/1_000).toFixed(0)}K`
  return String(v)
}
function fmtTime(ts: number) {
  const d = new Date(ts * 1000)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

// ── Countdown hook ─────────────────────────────────────────────────────────────
function useCountdown(total: number, running: boolean) {
  const [left, setLeft] = useState(total)
  const startRef = useRef(Date.now())

  useEffect(() => { startRef.current = Date.now(); setLeft(total) }, [running, total])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000
      setLeft(Math.max(0, total - elapsed))
    }, 100)
    return () => clearInterval(id)
  }, [running, total])

  return left
}

// ── Stat box ───────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color='text-slate-200' }: { label:string; value:string; sub?:string; color?:string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 bg-dark-700/50 rounded-lg border border-dark-600/40 min-w-[80px]">
      <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-mono font-bold tabular-nums ${color}`}>{value}</span>
      {sub && <span className="text-[9px] font-mono text-slate-700">{sub}</span>}
    </div>
  )
}

// ── Candlestick chart ──────────────────────────────────────────────────────────
function CandleChart({ data, interval }: { data: IntradayData; interval: string }) {
  const ref   = useRef<HTMLDivElement>(null)
  const chart = useRef<ReturnType<typeof createChart>|null>(null)

  useEffect(() => {
    if (!ref.current || !data.candles.length) return
    chart.current?.remove(); chart.current = null

    const el = ref.current
    const c = createChart(el, {
      width:  el.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor:  '#475569',
        fontSize:   10,
        fontFamily: '"JetBrains Mono", monospace',
      },
      grid:      { vertLines: { color: '#0d0d0d' }, horzLines: { color: '#0d0d0d' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#22d3ee55', width: 1, style: 3 }, horzLine: { color: '#22d3ee55', width: 1, style: 3 } },
      rightPriceScale: { borderColor: '#1a1a1a', scaleMargins: { top: 0.06, bottom: 0.22 } },
      timeScale: {
        borderColor: '#1a1a1a', timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (t: number) => fmtTime(t),
      },
    })

    // Chandelier
    const cs = c.addCandlestickSeries({
      upColor:        '#10b981', downColor:   '#ef4444',
      borderUpColor:  '#10b981', borderDownColor: '#ef4444',
      wickUpColor:    '#10b981', wickDownColor:   '#ef4444',
    } as Partial<CandlestickSeriesOptions>)
    cs.setData(data.candles.map(cd => ({ time: cd.time as any, open: cd.open, high: cd.high, low: cd.low, close: cd.close })))

    // VWAP
    if (data.session.vwap) {
      const vs = c.addLineSeries({ color: '#f59e0b', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, title: 'VWAP' })
      vs.setData(data.candles.map(cd => ({ time: cd.time as any, value: data.session.vwap! })))
    }

    // Volume
    const vol = c.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' } })
    vol.setData(data.candles.map(cd => ({ time: cd.time as any, value: cd.volume, color: cd.close >= cd.open ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)' })))
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    c.timeScale().fitContent()
    chart.current = c

    const ro = new ResizeObserver(() => c.applyOptions({ width: el.clientWidth }))
    ro.observe(el)
    return () => { ro.disconnect(); c.remove(); chart.current = null }
  }, [data])

  return <div ref={ref} className="w-full" />
}

// ── Composant principal ────────────────────────────────────────────────────────
const INTERVALS = [
  { id: '1m',  label: '1m',  refresh: 5  },
  { id: '2m',  label: '2m',  refresh: 8  },
  { id: '5m',  label: '5m',  refresh: 15 },
  { id: '15m', label: '15m', refresh: 30 },
]

export function MagnifyPanel({ symbol }: { symbol: string }) {
  const [interval, setInterval] = useState('5m')
  const ivConf = INTERVALS.find(i => i.id === interval) ?? INTERVALS[1]

  // ── Live quote — refresh rapide ────────────────────────────────────────
  const { data: live, dataUpdatedAt } = useQuery<LiveQuote>({
    queryKey:        ['live', symbol],
    queryFn:         () => getLiveQuote(symbol),
    refetchInterval: ivConf.refresh * 1000,
    staleTime:       0,
    refetchOnWindowFocus: true,
  })

  // ── Intraday chart — refresh selon intervalle ──────────────────────────
  const { data: intraday, isLoading: chartLoading, isFetching: chartFetching, refetch: refetchChart } = useQuery<IntradayData>({
    queryKey:        ['intraday', symbol, interval],
    queryFn:         () => getIntraday(symbol, interval),
    refetchInterval: ivConf.refresh * 1000,
    staleTime:       0,
  })

  // ── Animation flash sur changement de prix ─────────────────────────────
  const [flash, setFlash]       = useState<'up'|'down'|null>(null)
  const prevPriceRef            = useRef<number|null>(null)

  useEffect(() => {
    if (!live?.price) return
    const prev = prevPriceRef.current
    if (prev !== null && live.price !== prev) {
      setFlash(live.price > prev ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 600)
      return () => clearTimeout(t)
    }
    prevPriceRef.current = live.price
  }, [live?.price])

  // ── Countdown prochain refresh ─────────────────────────────────────────
  const countdown = useCountdown(ivConf.refresh, true)
  const pct = (countdown / ivConf.refresh) * 100

  const up      = (live?.change_pct ?? 0) >= 0
  const isOpen  = live?.market_state === 'REGULAR'
  const isPre   = live?.market_state === 'PRE'
  const isPost  = live?.market_state === 'POST'
  const s       = intraday?.session
  const dUp     = (s?.delta_open ?? 0) >= 0

  return (
    <div className="space-y-3">

      {/* ── Bandeau prix live ──────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl border overflow-hidden transition-colors duration-300"
        style={{
          background:  'linear-gradient(135deg,#000 0%,#050505 60%,#000 100%)',
          borderColor: flash === 'up'   ? '#10b981'
                     : flash === 'down' ? '#ef4444'
                     : up              ? '#10b98130'
                     :                   '#ef444430',
          boxShadow: flash === 'up'   ? '0 0 24px rgba(16,185,129,0.15)'
                   : flash === 'down' ? '0 0 24px rgba(239,68,68,0.15)'
                   : 'none',
        }}
      >
        {/* Glow fond */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: up
              ? 'radial-gradient(ellipse at 50% 100%, rgba(16,185,129,0.06) 0%, transparent 70%)'
              : 'radial-gradient(ellipse at 50% 100%, rgba(239,68,68,0.06) 0%, transparent 70%)',
          }}
        />

        <div className="relative px-5 py-4">
          {/* Ligne du haut : symbole + état marché + countdown */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Crosshair size={16} className="text-cyan-400 shrink-0" />
              <span className="text-base font-mono font-black text-white tracking-wider">{symbol}</span>
              {/* État */}
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                isOpen ? 'text-green-400 bg-green-500/10 border-green-500/25'
                : isPre  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                : isPost ? 'text-blue-400  bg-blue-500/10  border-blue-500/20'
                :          'text-slate-500 bg-dark-700      border-dark-600'
              }`}>
                {isOpen ? '● OUVERT' : isPre ? '◐ PRÉ-MARCHÉ' : isPost ? '◑ POST' : '○ FERMÉ'}
              </span>
              {/* Mode Magnify */}
              <span className="flex items-center gap-1 text-[9px] font-mono text-cyan-500/70 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                <Zap size={8}/> MAGNIFY
              </span>
            </div>

            {/* Countdown + refresh */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] font-mono text-slate-700 uppercase">
                  refresh {ivConf.refresh}s
                </span>
                {/* Barre countdown */}
                <div className="w-24 h-1 bg-dark-600 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isOpen ? 'bg-cyan-500' : 'bg-slate-600'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <button
                onClick={() => refetchChart()}
                className="p-1.5 text-slate-600 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                title="Forcer le refresh"
              >
                <RefreshCw size={13} className={chartFetching ? 'animate-spin text-cyan-400' : ''} />
              </button>
            </div>
          </div>

          {/* Prix géant */}
          <div className="flex items-end gap-4 flex-wrap">
            <div
              className="text-5xl font-mono font-black tabular-nums tracking-tight transition-colors duration-300"
              style={{
                color: flash === 'up'   ? '#34d399'
                     : flash === 'down' ? '#f87171'
                     : up              ? '#e2e8f0'
                     :                   '#e2e8f0',
                textShadow: flash
                  ? `0 0 30px ${flash === 'up' ? '#10b98160' : '#ef444460'}`
                  : 'none',
              }}
            >
              {live?.price != null ? live.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '———'}
            </div>

            <div className="flex flex-col gap-1 pb-1">
              <div className={`flex items-center gap-1.5 text-xl font-mono font-bold tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
                {up ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
                {sign(live?.change_pct ?? 0)}{fmt(live?.change_pct)}%
              </div>
              <div className={`text-sm font-mono tabular-nums ${up ? 'text-green-500/70' : 'text-red-500/70'}`}>
                {sign(live?.change ?? 0)}{fmt(live?.change)} {live?.currency ?? '€'}
              </div>
            </div>
          </div>

          {/* Flash label */}
          {flash && (
            <div className={`absolute top-4 right-16 text-xs font-mono font-black animate-ping pointer-events-none ${flash === 'up' ? 'text-green-400' : 'text-red-400'}`}>
              {flash === 'up' ? '▲' : '▼'}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats de séance ────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap">
        {s?.open     != null && <StatBox label="Ouverture"  value={fmt(s.open)}  />}
        {s?.high     != null && <StatBox label="Haut séance" value={fmt(s.high)}  color="text-green-400" />}
        {s?.low      != null && <StatBox label="Bas séance"  value={fmt(s.low)}   color="text-red-400"   />}
        {s?.vwap     != null && <StatBox label="VWAP"        value={fmt(s.vwap)}  color="text-amber-400" />}
        {(live?.volume ?? 0) > 0 && <StatBox label="Volume" value={fmtVol(live!.volume!)} />}
        {s?.delta_open != null && (
          <StatBox
            label="Δ Ouverture"
            value={`${dUp?'+':''}${fmt(s.delta_open)}%`}
            color={dUp ? 'text-green-400' : 'text-red-400'}
          />
        )}
        {live?.high != null && <StatBox label="H jour" value={fmt(live.high)} color="text-green-500/80" sub="live" />}
        {live?.low  != null && <StatBox label="B jour"  value={fmt(live.low)}  color="text-red-500/80"   sub="live" />}
      </div>

      {/* ── Sélecteur intervalle ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity size={12} className="text-cyan-400/60" />
          <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Intervalle chandelier</span>
        </div>
        <div className="flex gap-0.5 bg-dark-800 border border-dark-600/50 rounded-lg p-0.5">
          {INTERVALS.map(iv => (
            <button
              key={iv.id}
              onClick={() => setInterval(iv.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors ${
                interval === iv.id
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-500 hover:text-white border border-transparent'
              }`}
            >
              {iv.label}
              <span className="ml-1 text-[9px] opacity-50">↺{iv.refresh}s</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart chandelier ─────────────────────────────────────────────── */}
      <div className="bg-dark-800 border border-dark-600/50 rounded-xl overflow-hidden">
        {/* Header chart */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-600/30">
          <div className="flex items-center gap-2">
            <BarChart2 size={11} className="text-slate-600" />
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
              Chandeliers {interval} · {symbol}
            </span>
            {intraday && (
              <span className="text-[9px] font-mono text-slate-700">
                {intraday.candles.length} bougies
                {intraday.candles.length > 0 && (
                  <> · {fmtTime(intraday.candles[0].time)}–{fmtTime(intraday.candles[intraday.candles.length-1].time)}</>
                )}
              </span>
            )}
          </div>
          {/* Légendes */}
          <div className="flex items-center gap-3 text-[9px] font-mono text-slate-700">
            <span className="flex items-center gap-1">
              <span className="w-3 border-t border-dashed border-amber-500/60"/>VWAP
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-green-500/50"/>↑
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-red-500/50"/>↓
            </span>
          </div>
        </div>

        {/* Chart */}
        {chartLoading ? (
          <div className="h-72 flex items-center justify-center gap-3 text-slate-700">
            <RefreshCw size={14} className="animate-spin"/>
            <span className="text-xs font-mono">Chargement données intraday…</span>
          </div>
        ) : (!intraday?.candles?.length) ? (
          <div className="h-72 flex flex-col items-center justify-center gap-2 text-slate-700">
            <BarChart2 size={22} className="opacity-25"/>
            <span className="text-xs font-mono">Pas de données intraday</span>
            <span className="text-[10px] text-slate-800">Marché fermé ou données indisponibles</span>
          </div>
        ) : (
          <CandleChart data={intraday} interval={interval} />
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[9px] font-mono text-slate-800 px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Clock size={8}/>Refresh {ivConf.refresh}s · Yahoo Finance ~15min delay</span>
          {dataUpdatedAt > 0 && (
            <span>Dernière MAJ : {new Date(dataUpdatedAt).toLocaleTimeString('fr-FR')}</span>
          )}
        </div>
        <span className="text-slate-800">⚡ Mode Laser</span>
      </div>

    </div>
  )
}
