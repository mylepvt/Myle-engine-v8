import { useEffect, useRef } from 'react'

/**
 * Pressing browser/device Back closes a modal/panel instead of navigating away.
 *
 * Usage — call unconditionally in the modal (before any early `return null`):
 *   useBackClose({ open: !!target, onClose: () => setTarget(null) })
 *
 * How it works:
 *   1. On open → push a placeholder history entry (keeping react-router's state)
 *      so Back pops it instead of leaving the page.
 *   2. Back (popstate) → onClose().
 *   3. Closed any other way (✕, Cancel, Escape, success) → remove the placeholder,
 *      otherwise the next Back press would appear to do nothing.
 */
// Placeholder removal is deferred one tick so a close immediately followed by a
// re-open (React StrictMode's mount→unmount→mount, or quickly reopening) reuses
// the entry instead of popping it out from under the new modal.
let pendingPlaceholderRemoval: ReturnType<typeof setTimeout> | undefined

export function useBackClose({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Latest onClose without re-running the effect (callers often pass inline fns,
  // which used to push a new history entry on every render).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined

    const prevState: unknown = window.history.state
    if (pendingPlaceholderRemoval !== undefined) {
      clearTimeout(pendingPlaceholderRemoval)
      pendingPlaceholderRemoval = undefined
    }
    if (!(prevState as { backClose?: boolean } | null)?.backClose) {
      window.history.pushState(
        { ...(typeof prevState === 'object' && prevState !== null ? prevState : {}), backClose: true },
        '',
      )
    }

    let closedByBack = false
    const handlePop = () => {
      closedByBack = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', handlePop, { once: true })

    return () => {
      window.removeEventListener('popstate', handlePop)
      if (closedByBack) return
      pendingPlaceholderRemoval = setTimeout(() => {
        pendingPlaceholderRemoval = undefined
        const state = window.history.state as { backClose?: boolean } | null
        if (state?.backClose) window.history.back()
      }, 0)
    }
  }, [open])
}
