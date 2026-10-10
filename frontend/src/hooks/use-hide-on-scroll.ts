import { useEffect, useState } from 'react'

/** True while the user scrolls down (hide floating buttons so they never cover
 * content); false again as soon as they scroll up or stop near the top. */
export function useHideOnScroll(threshold = 12): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const last = new WeakMap<EventTarget, number>()
    const onScroll = (e: Event) => {
      const el = e.target === document ? document.scrollingElement : (e.target as Element | null)
      if (!el || !(el instanceof Element)) return
      const y = el.scrollTop
      const prev = last.get(el) ?? y
      if (Math.abs(y - prev) < threshold) return
      last.set(el, y)
      setHidden(y > prev && y > 80)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [threshold])
  return hidden
}
