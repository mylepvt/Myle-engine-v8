/**
 * Perceived loudness (linear gain into the master chain).
 *
 * Values ~0.01 were inaudible on laptop/phone speakers (tab still showed “playing”
 * because Web Audio woke up). Keep in a range that is clearly audible but not harsh.
 * With masterGain ≈ 0.78, effective peak ≈ gain × 0.78.
 */
export const UI_SOUND_GAIN = {
  tap: 0.22,
  nav: 0.16,
  success: 0.38,
  error: 0.24,
  warning: 0.2,
  delete: 0.18,
  paymentChime: 0.42,
  paymentCashBed: 0.08,
} as const

/** ms from user gesture before playing (stack with CSS press / route transition). */
export const UI_SOUND_DELAY_MS = {
  nav: 10,
  success: 80,
  payment: 90,
  stage: 40,
  satisfaction: 15,
  notification: 45,
} as const

/** Max one global UI sound per this window (prevents machine-gun on fast taps). */
export const UI_SOUND_THROTTLE_MS = 100

export function delayUiSound(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
