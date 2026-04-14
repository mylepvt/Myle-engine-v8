/**
 * Perceived loudness (linear gain into the master chain).
 *
 * Values ~0.01 were inaudible on laptop/phone speakers (tab still showed “playing”
 * because Web Audio woke up). Keep in a range that is clearly audible but not harsh.
 * With masterGain ≈ 0.78, effective peak ≈ gain × 0.78.
 */
/**
 * Audio gains tuned for professional MP3 samples.
 * MP3s are pre-mastered, so gains can be lower while sounding louder.
 * Master gain is 0.78, effective peak = gain × 0.78.
 */
export const UI_SOUND_GAIN = {
  tap: 0.18,        // Reduced - MP3 tap is naturally loud
  nav: 0.14,        // Reduced - professional sample
  success: 0.32,    // Reduced - pre-mastered sounds louder
  error: 0.20,      // Reduced - MP3 is punchy
  warning: 0.18,    // Reduced 
  delete: 0.16,     // Reduced - nice pop already in MP3
  paymentChime: 0.36, // Reduced - professional chime
  paymentCashBed: 0.08,
} as const

/** ms from user gesture before playing (stack with CSS press / route transition). */
export const UI_SOUND_DELAY_MS = {
  nav: 4,
  success: 28,
  payment: 38,
  stage: 18,
  satisfaction: 6,
  notification: 20,
} as const

/** Max one global UI sound per this window (prevents machine-gun on fast taps). */
export const UI_SOUND_THROTTLE_MS = 55

export function delayUiSound(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
