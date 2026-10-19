import type { Transition } from 'motion/react'

/**
 * Spring presets in Apple's terms (WWDC "Designing Fluid Interfaces"):
 * response = how fast the value reaches its target (Motion's `visualDuration`),
 * damping ratio = overshoot (Motion's `bounce` ≈ 1 − damping ratio).
 *
 * House feel is punchy: short responses with a hint of snap (damping ~0.9)
 * instead of fully critically damped, whose long settling tail read as slow.
 * Leaving is quicker than arriving.
 *
 * Springs start from the value's current position and velocity, so any of
 * these can be interrupted mid-flight without a jump.
 */
export const SPRING = {
  /** Things arriving: sheets, dialogs, drawers (damping ~0.9, response 0.24). */
  default: { type: 'spring', visualDuration: 0.24, bounce: 0.12 },
  /** Small controls: switch knobs, tab indicators, popovers (response 0.16). */
  snappy: { type: 'spring', visualDuration: 0.16, bounce: 0.15 },
  /** After a flick or drag release (damping ~0.75, response 0.24): bounce earned by momentum. */
  flick: { type: 'spring', visualDuration: 0.24, bounce: 0.25 },
  /** Things leaving along a path (px), keeping release velocity: quick, no overshoot, and
   *  called done at ~1px instead of crawling through the last sub-pixel tail. */
  exit: { type: 'spring', visualDuration: 0.18, bounce: 0, restDelta: 1, restSpeed: 20 },
} as const satisfies Record<string, Transition>

/** Fades/scales out (0–1 values, nothing to carry): a crisp accelerate-out. */
export const EXIT_FADE: Transition = { duration: 0.14, ease: [0.4, 0, 1, 1] }

/** Reduced-motion stand-in: a short cross-fade instead of movement. */
export const FADE: Transition = { duration: 0.15, ease: 'easeOut' }

/**
 * Where a flick would come to rest, as scroll deceleration does
 * (exponential decay, Apple's sample code). `velocity` in px/s.
 * decelerationRate 0.998 ≈ normal scroll, 0.99 ≈ snappier.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/**
 * Progressive resistance past a boundary: the further past it, the less the
 * element follows. `overshoot` is how far past the edge (px), `dimension` the
 * size of the moving element along that axis.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}
