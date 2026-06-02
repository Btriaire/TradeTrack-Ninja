import { useState, useEffect } from 'react'
import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, query, orderBy
} from 'firebase/firestore'
import { User } from 'firebase/auth'
import { db } from '../firebase'
import type { WatchlistItem } from '../types'

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: 'MC.PA',  name: 'LVMH' },
  { symbol: 'AIR.PA', name: 'Airbus' },
  { symbol: 'BNP.PA', name: 'BNP Paribas' },
  { symbol: 'OR.PA',  name: "L'Oréal" },
  { symbol: 'TTE.PA', name: 'TotalEnergies' },
]

export function useWatchlist(user: User | null) {
  const [items, setItems] = useState<WatchlistItem[]>(DEFAULT_WATCHLIST)

  useEffect(() => {
    if (!user) {
      setItems(DEFAULT_WATCHLIST)
      return
    }

    // Écoute Firestore en temps réel
    const q = query(
      collection(db, 'users', user.uid, 'watchlist'),
      orderBy('addedAt', 'asc')
    )
    const unsubscribe = onSnapshot(q, (snap) => {
      if (snap.empty) {
        // Premier login : on initialise avec la watchlist par défaut
        DEFAULT_WATCHLIST.forEach(item => addItem(item, user))
      } else {
        setItems(snap.docs.map(d => d.data() as WatchlistItem))
      }
    })
    return unsubscribe
  }, [user])

  const addItem = async (item: WatchlistItem, u?: User | null) => {
    const target = u ?? user
    if (!target) {
      setItems(prev => prev.find(i => i.symbol === item.symbol) ? prev : [...prev, item])
      return
    }
    await setDoc(doc(db, 'users', target.uid, 'watchlist', item.symbol), {
      ...item,
      addedAt: Date.now(),
    })
  }

  const removeItem = async (symbol: string) => {
    if (!user) {
      setItems(prev => prev.filter(i => i.symbol !== symbol))
      return
    }
    await deleteDoc(doc(db, 'users', user.uid, 'watchlist', symbol))
  }

  return { items, addItem, removeItem }
}
