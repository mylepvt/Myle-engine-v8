import type { Transition } from 'motion/react'

/**
 * Spring presets in Apple's terms (WWDC "Designing Fluid Interfaces"):
 * response = how fast the value reaches its target (Motion's `visualDuration`),
 * damping ratio = overshoot (Motion's `bounce` ≈ 1 − damping ratio).
 *
 * Springs start from the value's current position and velocity, so any of
 * these can be interrupted mid-flight without a jump.
 */
export const SPRING = {
  /** Default for UI that just appears (damping 1.0, response 0.35): no overshoot. */
  default: { type: 'spring', visualDuration: 0.35, bounce: 0 },
  /** Small controls: switch knobs, tab indicators (damping 1.0, response 0.25). */
  snappy: { type: 'spring', visualDuration: 0.25, bounce: 0 },
  /** After a flick or drag release (damping 0.8, response 0.3): a little bounce, earned by momentum. */
  flick: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
} as const satisfies Record<string, Transition>

/** Reduced-motion stand-in: a short cross-fade instead of movement. */
export const FADE: Transition = { duration: 0.2, ease: 'easeOut' }

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
