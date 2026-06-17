import { useEffect, useRef } from 'react'

/**
 * Pressing browser/device Back closes a modal/panel instead of navigating away.
 *
 * Usage — mount inside the modal component:
 *   useBackClose({ open: !!target, onClose: () => setTarget(null) })
 *
 * How it works:
 *   1. On `open` → pushes a dummy history entry so Back can pop it.
 *   2. On `popstate` → calls `onClose` and re-pushes (so a second Back navigates).
 */
export function useBackClose({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pushedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      pushedRef.current = false
      return
    }

    // Push a placeholder so that pressing Back pops this entry instead of leaving the page.
    window.history.pushState({ backClose: true }, '')
    pushedRef.current = true

    const handlePop = () => {
      if (!pushedRef.current) return
      pushedRef.current = false
      onClose()
    }

    window.addEventListener('popstate', handlePop)
    return () => {
      window.removeEventListener('popstate', handlePop)
    }
  }, [open, onClose])
}
