import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AnimatePresence,
  animate,
  m,
  useMotionValue,
  usePresence,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'motion/react'

import { useBackClose } from '@/hooks/use-back-close'
import { useMediaQuery } from '@/hooks/use-media-query'
import { FADE, SPRING, project, rubberband } from '@/lib/springs'
import { cn } from '@/lib/utils'

/**
 * Modal surface for every dialog in the app.
 *
 * Phones: a bottom sheet that tracks the finger 1:1 and is dismissed by a
 * drag or flick (momentum is projected, release velocity carries into the
 * spring). Larger screens: a centred dialog that springs in from 96% scale.
 * Reduced motion: both become a short cross-fade.
 *
 * Owns the modal plumbing callers used to repeat: portal, scrim, Escape,
 * device Back (useBackClose), body scroll lock, focus trap + restore.
 *
 * Keep `<Sheet>` mounted and drive it with `open` — returning null instead
 * skips the exit animation.
 */
export interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Accessible name; or point `labelledBy` at the visible title's id. */
  label?: string
  labelledBy?: string
  size?: 'sm' | 'md' | 'lg'
  /** Applied to the scrolling content area (padding, spacing, text size). */
  className?: string
  /** False while a mutation must not be interrupted: no scrim tap, Escape, Back or drag dismiss. */
  dismissible?: boolean
}

const SIZE_CLASS = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg' } as const

/** Gap kept between a dismissed sheet and the screen edge so its shadow clears too. */
const EDGE_GAP = 24
/** Movement before a body drag commits to moving the sheet (taps stay taps). */
const DRAG_SLOP = 10
const VELOCITY_WINDOW_MS = 100
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Only the top-most open sheet answers Escape.
const sheetStack: object[] = []
let scrollLocks = 0
let restoreOverflow = ''

export function Sheet(props: SheetProps) {
  const { open, onClose, dismissible = true } = props
  // The Back placeholder lives for the whole time the sheet is open; while not
  // dismissible, Back is swallowed rather than toggling history entries.
  useBackClose({
    open,
    onClose: () => {
      if (dismissible) onClose()
    },
  })
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>{open ? <SheetSurface {...props} dismissible={dismissible} /> : null}</AnimatePresence>,
    document.body,
  )
}

type DragState = {
  pointerId: number
  startY: number
  origin: number
  active: boolean
  samples: { t: number; y: number }[]
}

function SheetSurface({
  onClose,
  children,
  label,
  labelledBy,
  size = 'md',
  className,
  dismissible = true,
}: SheetProps) {
  const [isPresent, safeToRemove] = usePresence()
  const reduced = useReducedMotion() ?? false
  const compact = useMediaQuery('(max-width: 639px)')
  const mode = reduced ? 'fade' : compact ? 'sheet' : 'dialog'

  const panelRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const running = useRef<AnimationPlaybackControls | null>(null)
  const drag = useRef<DragState | null>(null)
  const releaseVelocity = useRef(0)
  const present = useRef(true)
  const enteredMode = useRef<string | null>(null)
  const stackToken = useRef<object>({})

  // sheet: y = px below rest, travel = px to fully hidden. dialog/fade: progress 0 → 1.
  const y = useMotionValue(0)
  const travel = useMotionValue(1)
  const progress = useMotionValue(0)
  const sheetShown = useTransform([y, travel], ([v, t]: number[]) => Math.min(1, Math.max(0, 1 - v / t)))
  const scale = useTransform(progress, [0, 1], [0.96, 1])
  const scrimOpacity = mode === 'sheet' ? sheetShown : progress

  function run(controls: AnimationPlaybackControls) {
    running.current?.stop()
    running.current = controls
  }

  // Enter on mount; if the layout mode flips while open (rotation, setting change), snap to rest.
  // A re-run with the same mode (StrictMode) leaves the running entrance alone.
  useLayoutEffect(() => {
    const height = panelRef.current?.offsetHeight ?? window.innerHeight
    travel.set(height + EDGE_GAP)
    if (enteredMode.current === mode) return
    if (enteredMode.current !== null) {
      enteredMode.current = mode
      running.current?.stop()
      y.set(0)
      progress.set(1)
      return
    }
    enteredMode.current = mode
    if (mode === 'sheet') {
      progress.set(1)
      y.set(height + EDGE_GAP)
      run(animate(y, 0, SPRING.default))
    } else {
      run(animate(progress, 1, mode === 'fade' ? FADE : SPRING.default))
    }
  }, [mode, progress, travel, y])

  // Exit: continue from wherever the sheet is, at the speed it was released.
  useEffect(() => {
    present.current = isPresent
    if (isPresent) return
    const controls =
      mode === 'sheet'
        ? animate(y, travel.get(), { ...SPRING.default, velocity: releaseVelocity.current })
        : animate(progress, 0, mode === 'fade' ? FADE : { ...SPRING.default, visualDuration: 0.25 })
    run(controls)
    controls.then(safeToRemove)
  }, [isPresent, mode, progress, safeToRemove, travel, y])

  // Stack (for Escape), scroll lock, focus in + restore.
  useEffect(() => {
    const token = stackToken.current
    sheetStack.push(token)
    if (scrollLocks++ === 0) {
      restoreOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    const previousFocus = document.activeElement
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })

    return () => {
      sheetStack.splice(sheetStack.indexOf(token), 1)
      if (--scrollLocks === 0) document.body.style.overflow = restoreOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!dismissible) return undefined
    const token = stackToken.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheetStack[sheetStack.length - 1] === token && present.current) {
        e.preventDefault()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissible])

  // A sheet whose content doesn't scroll is dragged from anywhere on touch, so
  // the browser must not claim the pan; scrolling content keeps native touch.
  useEffect(() => {
    const content = contentRef.current
    if (!content || mode !== 'sheet') return undefined
    const sync = () => {
      content.style.touchAction = content.scrollHeight > content.clientHeight + 1 ? '' : 'none'
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(content)
    for (const child of content.children) observer.observe(child)
    return () => {
      observer.disconnect()
      content.style.touchAction = ''
    }
  }, [mode])

  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.getClientRects().length > 0,
    )
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // ── Drag (phones only) ────────────────────────────────────────────────
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (mode !== 'sheet' || !present.current || e.button !== 0) return
    const target = e.target as Element
    const fromHandle = target.closest('[data-sheet-handle]') != null
    if (!fromHandle) {
      // The body drags only on touch, away from text fields, and when there is
      // no inner scroll to fight with; the handle always drags.
      if (e.pointerType === 'mouse') return
      if (target.closest('input, textarea, select, [contenteditable="true"], [data-sheet-no-drag]')) return
      const content = contentRef.current
      if (content && content.scrollHeight > content.clientHeight + 1) return
    }
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      origin: y.get(),
      active: false,
      samples: [],
    }
    if (fromHandle) beginDrag(e)
  }

  function beginDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    running.current?.stop() // grab it mid-flight: continue from where it is
    d.active = true
    d.startY = e.clientY
    d.origin = y.get()
    d.samples = [{ t: e.timeStamp, y: d.origin }]
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.active) {
      const dy = e.clientY - d.startY
      if (Math.abs(dy) < DRAG_SLOP) return
      if (dy < 0) {
        drag.current = null // upward on the body: not a dismiss gesture
        return
      }
      beginDrag(e)
      return
    }
    const raw = d.origin + (e.clientY - d.startY)
    const t = travel.get()
    const next = raw < 0 ? -rubberband(-raw, t) : dismissible ? raw : rubberband(raw, t)
    y.set(next)
    d.samples.push({ t: e.timeStamp, y: next })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    if (!d.active) return

    const first = d.samples[0]
    const last = d.samples[d.samples.length - 1]
    const stale = e.timeStamp - last.t > 50 // finger rested before lifting
    const dt = (last.t - first.t) / 1000
    const velocity = !stale && dt > 0 ? (last.y - first.y) / dt : 0

    const current = y.get()
    const restingPoint = current + project(velocity)
    // Commit on the direction of travel, not just position: moving back up keeps it open.
    const dismiss =
      dismissible && e.type === 'pointerup' && velocity > -20 && restingPoint > (travel.get() - EDGE_GAP) / 2

    if (dismiss) {
      releaseVelocity.current = velocity
      onCloseRef.current()
      // If the caller kept it open (e.g. a save is in flight), settle back.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (present.current) run(animate(y, 0, { ...SPRING.flick, velocity }))
        }),
      )
    } else {
      run(animate(y, 0, { ...SPRING.flick, velocity }))
    }
  }

  return (
    <div
      className={cn(
        'keyboard-safe-modal fixed inset-0 z-[60] flex items-end justify-center px-2 sm:items-center sm:p-4',
        !isPresent && 'pointer-events-none',
      )}
    >
      <m.div
        aria-hidden
        className="absolute inset-0"
        style={{ opacity: scrimOpacity, background: 'var(--scrim)' }}
        onClick={dismissible ? () => onCloseRef.current() : undefined}
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={trapTab}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={
          mode === 'sheet'
            ? { y }
            : mode === 'dialog'
              ? { opacity: progress, scale }
              : { opacity: progress }
        }
        className={cn(
          'keyboard-safe-sheet relative flex w-full flex-col overflow-hidden rounded-4xl border border-border bg-card text-card-foreground shadow-sheet outline-none sm:rounded-3xl',
          SIZE_CLASS[size],
        )}
      >
        {mode === 'sheet' ? (
          <div
            data-sheet-handle
            aria-hidden
            className="absolute left-1/2 top-0 z-20 flex h-7 w-24 -translate-x-1/2 cursor-grab touch-none justify-center pt-2 active:cursor-grabbing"
          >
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          </div>
        ) : null}
        <div
          ref={contentRef}
          className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', className)}
        >
          {children}
        </div>
      </m.div>
    </div>
  )
}
