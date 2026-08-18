/**
 * useSimulatorPortfolio — portefeuille 100% fictif ("Labo Trading").
 * Isolé dans sa propre sous-collection Firestore (users/{uid}/simulator/*),
 * jamais mélangé avec le vrai portfolio (users/{uid}/portfolio).
 */
import { useState, useEffect } from 'react'
import {
  collection, doc, setDoc, deleteDoc, updateDoc,
  onSnapshot, query, orderBy, getDoc,
} from 'firebase/firestore'
import { User } from 'firebase/auth'
import { db } from '../firebase'
import type { VirtualPosition, SimulatorCapital } from '../types'

export const STARTING_CAPITAL = 10_000

export function useSimulatorPortfolio(user: User | null) {
  const [positions, setPositions] = useState<VirtualPosition[]>([])
  const [capital,   setCapital]   = useState<SimulatorCapital>({
    balance: STARTING_CAPITAL, starting_capital: STARTING_CAPITAL,
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) { setPositions([]); setCapital({ balance: STARTING_CAPITAL, starting_capital: STARTING_CAPITAL }); setLoaded(false); return }

    const q = query(
      collection(db, 'users', user.uid, 'simulator_positions'),
      orderBy('buy_date', 'desc'),
    )
    const unsubPositions = onSnapshot(q, snap => {
      setPositions(snap.docs.map(d => ({ id: d.id, ...d.data() } as VirtualPosition)))
    })

    const capitalRef = doc(db, 'users', user.uid, 'simulator_meta', 'capital')
    const unsubCapital = onSnapshot(capitalRef, async snap => {
      if (snap.exists()) {
        setCapital(snap.data() as SimulatorCapital)
      } else {
        const initial = { balance: STARTING_CAPITAL, starting_capital: STARTING_CAPITAL }
        await setDoc(capitalRef, initial)
        setCapital(initial)
      }
      setLoaded(true)
    })

    return () => { unsubPositions(); unsubCapital() }
  }, [user])

  async function _setBalance(delta: number) {
    if (!user) return
    const capitalRef = doc(db, 'users', user.uid, 'simulator_meta', 'capital')
    const snap = await getDoc(capitalRef)
    const current = snap.exists() ? (snap.data() as SimulatorCapital).balance : STARTING_CAPITAL
    await updateDoc(capitalRef, { balance: current + delta })
  }

  /** Achat virtuel : débite le capital (montant + frais). Retourne false si capital insuffisant. */
  const buyVirtual = async (pos: Omit<VirtualPosition, 'id'>): Promise<boolean> => {
    if (!user) return false
    const cost = pos.buy_price * pos.quantity + (pos.fees ?? 0)
    if (cost > capital.balance) return false
    const id = `${pos.symbol}_${Date.now()}`
    await setDoc(doc(db, 'users', user.uid, 'simulator_positions', id), {
      ...pos, createdAt: Date.now(),
    })
    await _setBalance(-cost)
    return true
  }

  /** Vente virtuelle : recrédite le capital du montant de la vente. */
  const sellVirtual = async (id: string, proceeds: number) => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'simulator_positions', id))
    await _setBalance(proceeds)
  }

  /** Vente partielle : réduit la position et recrédite le montant vendu. */
  const updateVirtual = async (id: string, patch: Partial<VirtualPosition>, proceeds = 0) => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'simulator_positions', id), patch)
    if (proceeds > 0) await _setBalance(proceeds)
  }

  const removeVirtual = async (id: string) => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'simulator_positions', id))
  }

  /** Réinitialise le labo : supprime toutes les positions, remet le capital de départ. */
  const resetSimulator = async () => {
    if (!user) return
    await Promise.all(positions.map(p =>
      deleteDoc(doc(db, 'users', user.uid, 'simulator_positions', p.id))
    ))
    const capitalRef = doc(db, 'users', user.uid, 'simulator_meta', 'capital')
    await setDoc(capitalRef, { balance: STARTING_CAPITAL, starting_capital: STARTING_CAPITAL })
  }

  return { positions, capital, loaded, buyVirtual, sellVirtual, updateVirtual, removeVirtual, resetSimulator }
}
