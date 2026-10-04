import { useEffect, useRef, useState } from 'react'

/** Pull distance (px, after resistance) that triggers a refresh on release. */
export const PULL_TRIGGER_PX = 64
const PULL_MAX_PX = 96
const RESISTANCE = 0.5

/**
 * Touch pull-to-refresh on a scroll container (pass the element via a callback
 * ref / state so listeners attach whenever it mounts). Only arms when the container is
 * scrolled to the very top, so normal scrolling is untouched. Listeners are
 * passive — we never block the browser's own scrolling.
 */
export function usePullToRefresh(
  el: HTMLElement | null,
  onRefresh: () => Promise<unknown>,
) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])
  const refreshingRef = useRef(false)

  useEffect(() => {
    if (!el || typeof window === 'undefined') return undefined
    if (!window.matchMedia('(pointer: coarse)').matches) return undefined

    let startY: number | null = null
    let distance = 0

    const reset = () => {
      startY = null
      distance = 0
    }
    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || el.scrollTop > 0 || e.touches.length !== 1) {
        reset()
        return
      }
      startY = e.touches[0].clientY
      distance = 0
    }
    const onMove = (e: TouchEvent) => {
      if (startY == null) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0 || el.scrollTop > 0) {
        if (distance !== 0) setPull(0)
        distance = 0
        return
      }
      distance = Math.min(PULL_MAX_PX, dy * RESISTANCE)
      setPull(distance)
    }
    const onEnd = () => {
      if (startY == null) return
      const triggered = distance >= PULL_TRIGGER_PX
      reset()
      if (!triggered) {
        setPull(0)
        return
      }
      refreshingRef.current = true
      setRefreshing(true)
      setPull(PULL_TRIGGER_PX)
      void onRefreshRef.current().finally(() => {
        refreshingRef.current = false
        setRefreshing(false)
        setPull(0)
      })
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [el])

  return { pull, refreshing }
}
