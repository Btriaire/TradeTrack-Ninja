import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLiveQuote } from '../services/api'

export type MarketState = 'REGULAR' | 'PRE' | 'POST' | 'CLOSED' | 'PREPRE' | 'POSTPOST'
export type FlashDir    = 'up' | 'down' | null

export interface LiveData {
  price:        number | null
  change:       number | null
  change_pct:   number | null
  volume:       number | null
  high:         number | null
  low:          number | null
  market_state: MarketState
  is_open:      boolean
  currency:     string
  delay_min:    number
  market_time:  number | null
}

export interface UseRealtimeResult {
  live:     LiveData | null
  flash:    FlashDir        // 'up' | 'down' | null — déclenche l'animation
  isPolling:boolean
}

// Interval de poll selon l'état du marché
const POLL_OPEN   =  8_000   //  8s  pendant les heures d'ouverture
const POLL_CLOSED = 60_000   // 60s  marché fermé (pre/post/closed)

export function useRealtime(symbol: string): UseRealtimeResult {
  const prevPriceRef = useRef<number | null>(null)
  const [flash, setFlash] = useState<FlashDir>(null)

  const { data, isFetching } = useQuery<LiveData>({
    queryKey:        ['live', symbol],
    queryFn:         () => getLiveQuote(symbol),
    refetchInterval: (query) => {
      const d = query.state.data as LiveData | undefined
      return d?.is_open ? POLL_OPEN : POLL_CLOSED
    },
    staleTime: 0,       // toujours considéré stale → refetch systématique
  })

  useEffect(() => {
    if (!data?.price) return
    const prev = prevPriceRef.current

    if (prev !== null && data.price !== prev) {
      setFlash(data.price > prev ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 700)
      return () => clearTimeout(t)
    }
    prevPriceRef.current = data.price
  }, [data?.price])

  // Sync ref on symbol change
  useEffect(() => {
    prevPriceRef.current = null
    setFlash(null)
  }, [symbol])

  return {
    live:      data ?? null,
    flash,
    isPolling: isFetching,
  }
}
