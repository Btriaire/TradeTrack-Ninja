import { useState, useEffect } from 'react'
import {
  collection, doc, setDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy
} from 'firebase/firestore'
import { User } from 'firebase/auth'
import { db } from '../firebase'
import type { PortfolioPosition } from '../types'

export function usePortfolio(user: User | null) {
  const [positions, setPositions] = useState<PortfolioPosition[]>([])

  useEffect(() => {
    if (!user) { setPositions([]); return }

    const q = query(
      collection(db, 'users', user.uid, 'portfolio'),
      orderBy('buy_date', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      setPositions(snap.docs.map(d => ({ id: d.id, ...d.data() } as PortfolioPosition)))
    })
    return unsub
  }, [user])

  const addPosition = async (pos: Omit<PortfolioPosition, 'id'>) => {
    if (!user) return
    const id = `${pos.symbol}_${Date.now()}`
    await setDoc(doc(db, 'users', user.uid, 'portfolio', id), {
      ...pos,
      createdAt: Date.now(),
    })
  }

  const removePosition = async (id: string) => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'portfolio', id))
  }

  const updatePosition = async (id: string, patch: Partial<PortfolioPosition>) => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'portfolio', id), patch)
  }

  return { positions, addPosition, removePosition, updatePosition }
}
