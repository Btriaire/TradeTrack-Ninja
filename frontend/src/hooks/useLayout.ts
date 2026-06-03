import { useState, useEffect } from 'react'

type Mode = 'auto' | 'mobile' | 'desktop'

const BREAKPOINT = 768 // px — en dessous = mobile

export function useLayout() {
  const [mode, setMode] = useState<Mode>(() => {
    return (localStorage.getItem('layoutMode') as Mode) ?? 'auto'
  })

  const [screenWidth, setScreenWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )

  // Mise à jour au resize
  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // En mode 'auto', on suit la largeur écran ; sinon le choix est forcé
  const isMobile = mode === 'auto' ? screenWidth < BREAKPOINT : mode === 'mobile'

  const setLayout = (m: Mode) => {
    setMode(m)
    if (m === 'auto') localStorage.removeItem('layoutMode')
    else localStorage.setItem('layoutMode', m)
  }

  return { isMobile, mode, setLayout }
}
