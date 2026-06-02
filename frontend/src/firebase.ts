import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyB8XpGwEUEbtO7i20QDMAPNcpuP_WM0vEk",
  authDomain: "tradetrack-ninja.firebaseapp.com",
  projectId: "tradetrack-ninja",
  storageBucket: "tradetrack-ninja.firebasestorage.app",
  messagingSenderId: "63142549499",
  appId: "1:63142549499:web:1b18cabb03c1b14d24dd5e",
  measurementId: "G-8TP4KQTSGE"
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
