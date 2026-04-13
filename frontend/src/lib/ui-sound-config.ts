/**
 * Single place for UI sound **taste**: perceived level + when to fire (vs animation).
 * Values are linear gain (0–1) on top of the shared master chain.
 */
export const UI_SOUND_GAIN = {
  tap: 0.2,
  nav: 0.15,
  success: 0.4,
  error: 0.25,
  warning: 0.22,
  delete: 0.2,
  /** Payment / wallet: chime leads; “cash” layer stays very low */
  paymentChime: 0.4,
  paymentCashBed: 0.06,
} as const

/** ms from user gesture before playing (stack with CSS press / route transition). */
export const UI_SOUND_DELAY_MS = {
  /** Navigation / whoosh */
  nav: 10,
  /** Save / approve / payment chime — after short button / sheet motion */
  success: 100,
  /** Wallet credit / converted lead */
  payment: 120,
  /** Pipeline stage change */
  stage: 45,
  /** Light reward double-tick */
  satisfaction: 20,
  notification: 55,
} as const

/** Max one global UI sound per this window (prevents machine-gun on fast taps). */
export const UI_SOUND_THROTTLE_MS = 100

export function delayUiSound(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
