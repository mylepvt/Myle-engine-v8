import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'motion/react'

import { useBackClose } from '@/hooks/use-back-close'
import { SPRING, project, rubberband } from '@/lib/springs'

/** Past the drawer's own width so its shadow is fully off-screen when closed. */
const SHADOW_CLEARANCE = 32
const DRAG_SLOP = 10
const VELOCITY_WINDOW_MS = 100

type Drag = {
  pointerId: number
  startX: number
  startY: number
  origin: number
  active: boolean
  samples: { t: number; x: number }[]
}

/**
 * Left drawer that behaves like a physical panel on phones: open/close are
 * interruptible springs, a horizontal drag tracks 1:1 (rubber-banding past
 * fully open), and release momentum decides whether it closes — carrying the
 * finger's velocity into the spring. Back and Escape close it.
 *
 * Off (x pinned to 0) when `enabled` is false, i.e. the desktop sidebar.
 */
export function useDrawerGesture({
  enabled,
  open,
  onClose,
}: {
  enabled: boolean
  open: boolean
  onClose: () => void
}) {
  const reduced = useReducedMotion() ?? false
  const panelRef = useRef<HTMLElement>(null)
  const x = useMotionValue(0)
  const closedX = useMotionValue(-(240 + SHADOW_CLEARANCE))
  const scrimOpacity = useTransform([x, closedX], ([v, c]: number[]) => Math.min(1, Math.max(0, 1 - v / c)))
  const running = useRef<AnimationPlaybackControls | null>(null)
  const drag = useRef<Drag | null>(null)
  const releaseVelocity = useRef(0)
  const placed = useRef(false)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useBackClose({ open: enabled && open, onClose })

  useEffect(() => {
    if (!enabled || !open) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, open])

  function run(controls: AnimationPlaybackControls) {
    running.current?.stop()
    running.current = controls
  }

  // Follow `open`: spring from wherever the panel is now (so a tap mid-flight
  // reverses it smoothly). The first placement, and reduced motion, jump.
  useLayoutEffect(() => {
    if (!enabled) {
      running.current?.stop()
      x.set(0)
      placed.current = false
      return
    }
    const width = panelRef.current?.offsetWidth ?? 240
    closedX.set(-(width + SHADOW_CLEARANCE))
    const target = open ? 0 : closedX.get()
    if (!placed.current || reduced) {
      placed.current = true
      running.current?.stop()
      x.set(target)
      return
    }
    // No overshoot when opening: the drawer is pinned to the screen edge, and a
    // bounce past it would flash a gap on the left.
    run(animate(x, target, { ...(open ? SPRING.edge : SPRING.exit), velocity: releaseVelocity.current }))
    releaseVelocity.current = 0
  }, [enabled, open, reduced, x, closedX])

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (!enabled || !open || reduced || e.button !== 0) return
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: x.get(),
      active: false,
      samples: [],
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.active) {
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP) return
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null // vertical: the nav list scrolls instead
        return
      }
      running.current?.stop()
      d.active = true
      d.startX = e.clientX
      d.origin = x.get()
      d.samples = [{ t: e.timeStamp, x: d.origin }]
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    const raw = d.origin + (e.clientX - d.startX)
    const width = -closedX.get() - SHADOW_CLEARANCE
    const next = raw > 0 ? rubberband(raw, width) : Math.max(raw, closedX.get())
    x.set(next)
    d.samples.push({ t: e.timeStamp, x: next })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    if (!d.active) return

    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const dt = (last.t - first.t) / 1000
    const velocity = e.timeStamp - last.t <= 50 && dt > 0 ? (last.x - first.x) / dt : 0
    const restingPoint = x.get() + project(velocity)
    // Close on direction of travel: still moving right (back open) keeps it.
    const close = e.type === 'pointerup' && velocity < 20 && restingPoint < closedX.get() / 2

    if (close) {
      releaseVelocity.current = velocity
      onCloseRef.current()
    } else {
      run(animate(x, 0, { ...SPRING.edge, velocity })) // edge-pinned: no overshoot
    }
  }

  return {
    panelRef,
    x,
    scrimOpacity,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  }
}
