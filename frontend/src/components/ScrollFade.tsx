/**
 * ScrollFade — enveloppe une rangée défilante horizontalement et affiche un
 * dégradé de fondu sur le(s) bord(s) qui cachent du contenu, pour signaler
 * qu'il faut swiper. Le fondu apparaît/disparaît selon la position réelle
 * de scroll (jamais affiché s'il n'y a rien à découvrir).
 */
import { useRef, useState, useEffect, type ReactNode } from 'react'

interface Props {
  children:  ReactNode
  className: string   // classes du conteneur scrollable (doit inclure overflow-x-auto)
  fadeFrom:  string    // classe Tailwind "from-*" correspondant au fond de la rangée
}

export function ScrollFade({ children, className, fadeFrom }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [showLeft,  setShowLeft]  = useState(false)
  const [showRight, setShowRight] = useState(false)

  function update() {
    const el = ref.current
    if (!el) return
    setShowLeft(el.scrollLeft > 4)
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children])

  return (
    <div className="relative min-w-0">
      <div ref={ref} onScroll={update} className={className}>
        {children}
      </div>
      {showLeft && (
        <div className={`pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r ${fadeFrom} to-transparent z-10`} />
      )}
      {showRight && (
        <div className={`pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l ${fadeFrom} to-transparent z-10`} />
      )}
    </div>
  )
}
