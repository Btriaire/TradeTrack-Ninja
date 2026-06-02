import { useState, useEffect } from 'react'
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, User
} from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Récupère le résultat après un redirect Google
    getRedirectResult(auth).catch(() => {})

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const loginWithGoogle = async () => {
    try {
      // Essai popup d'abord
      await signInWithPopup(auth, googleProvider)
    } catch {
      // Si popup bloqué → redirect
      await signInWithRedirect(auth, googleProvider)
    }
  }

  const logout = () => signOut(auth)

  return { user, loading, loginWithGoogle, logout }
}
