/**
 * UI sound library — Apple-quality pure synthesis.
 *
 * Design rules:
 *   1. ONLY sine oscillators — no triangle, sawtooth, or noise.
 *   2. Ultra-fast attack (0.5 ms), natural exponential decay — no sustain phase.
 *   3. Gain values intentionally low (felt, not heard consciously).
 *   4. Every sound sits in a single harmonic world (A = 440 Hz equal temperament).
 *   5. Sequences use consonant intervals: major 3rd, perfect 5th, octave.
 */

import {
  getAudioContext,
  getDestination,
  primeAudioContextSync as primeEngine,
  resumeAudioContext,
} from '@/lib/ui-audio-engine'
import { UI_SOUND_GAIN } from '@/lib/ui-sound-config'

export { unlockUiAudioFromUserGesture } from '@/lib/ui-audio-engine'
export type { UiSampleId } from '@/lib/ui-sound-samples'

export function primeAudioContextSync(): void {
  primeEngine()
}

// ─── Equal-temperament note table ─────────────────────────────────────────────
const N: Record<string, number> = {
  G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.5,
}

// ─── Core primitive: one pure sine, fast attack, exponential decay ─────────────
function sine(
  ac: AudioContext,
  freq: number,
  startT: number,
  duration: number,
  peak: number,
  attackMs = 0.5,
): void {
  const osc = ac.createOscillator()
  const g   = ac.createGain()
  osc.type  = 'sine'
  osc.frequency.setValueAtTime(freq, startT)
  g.gain.setValueAtTime(0.0001, startT)
  g.gain.linearRampToValueAtTime(peak, startT + attackMs / 1000)
  g.gain.exponentialRampToValueAtTime(0.0001, startT + duration)
  osc.connect(g)
  g.connect(getDestination(ac))
  osc.start(startT)
  osc.stop(startT + duration + 0.002)
}

// ─── Sequence helper ───────────────────────────────────────────────────────────
function seq(
  ac: AudioContext,
  t: number,
  notes: [freq: number, dur: number, gap: number][],
  peak: number,
): void {
  let cursor = t
  for (const [freq, dur, gap] of notes) {
    sine(ac, freq, cursor, dur, peak)
    cursor += dur + gap
  }
}

async function ready(): Promise<AudioContext | null> {
  primeEngine()
  const ac = getAudioContext()
  if (!ac) return null
  await resumeAudioContext(ac)
  return ac
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORTED SOUND FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CLICK — single pure sine, 1050 Hz, 40 ms.
 * Inspired by macOS click: barely perceptible, crisp, clean.
 */
export async function playUiClickSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  sine(ac, 1050, ac.currentTime, 0.040, UI_SOUND_GAIN.tap)
}

/**
 * SATISFACTION — two quick sines, perfect 5th (A4 → E5), 30 ms gap.
 * Feels like a gentle "good job" from the app.
 */
export async function playUiSatisfactionSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  const t = ac.currentTime
  const p = UI_SOUND_GAIN.tap * 1.1
  sine(ac, N.A4, t,        0.048, p)
  sine(ac, N.E5, t + 0.058, 0.062, p * 0.92)
}

/**
 * SUCCESS — ascending major 3rd, E5 → B5 (680 Hz apart).
 * Same interval as iOS "Mail Sent". Pure, satisfying.
 */
export async function playUiSuccessSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  const t = ac.currentTime
  const p = UI_SOUND_GAIN.success
  sine(ac, N.E5, t,         0.075, p)
  sine(ac, N.B5, t + 0.080, 0.095, p * 0.88)
}

/**
 * STAGE ADVANCE — A4 → D5 (perfect 4th), pipeline move.
 * Slightly lower register than success — signals progress, not completion.
 */
export async function playUiStageAdvanceSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  const t = ac.currentTime
  const p = UI_SOUND_GAIN.success * 0.82
  sine(ac, N.A4, t,         0.068, p)
  sine(ac, N.D5, t + 0.072, 0.086, p * 0.90)
}

/**
 * ERROR — single low G3, 90 ms, no pitch change.
 * Dignified, not alarming. Like a soft knock.
 */
export async function playUiErrorSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  sine(ac, N.G3, ac.currentTime, 0.090, UI_SOUND_GAIN.error)
}

/**
 * WARNING — E4, 80 ms. Slightly higher than error for distinction.
 */
export async function playUiWarningSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  sine(ac, N.E4, ac.currentTime, 0.080, UI_SOUND_GAIN.warning)
}

/**
 * COIN / PAYMENT — C5 → E5 → G5 major triad, 35 ms per note.
 * Premium, rewarding. Like a polished cash register.
 */
export async function playUiPaymentCashSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  seq(ac, ac.currentTime, [
    [N.C5, 0.038, 0.010],
    [N.E5, 0.042, 0.010],
    [N.G5, 0.055, 0],
  ], UI_SOUND_GAIN.paymentChime)
}

export async function playUiCoinSound(): Promise<void> {
  return playUiPaymentCashSound()
}

/**
 * LEVEL UP — pentatonic 4-note ascending, C4→D4→E4→G4, 32 ms each.
 * Fast enough to feel instant, distinct enough to feel earned.
 */
export async function playUiLevelUpSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  seq(ac, ac.currentTime, [
    [N.C4, 0.032, 0.010],
    [N.D4, 0.032, 0.010],
    [N.E4, 0.038, 0.010],
    [N.G4, 0.055, 0],
  ], UI_SOUND_GAIN.success * 0.85)
}

/**
 * WHOOSH / NAV — single very brief, very quiet sine glide 1100→700 Hz, 28 ms.
 * Subtle page-transition whisper. Almost inaudible.
 */
export async function playUiWhooshSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  const t  = ac.currentTime
  const p  = UI_SOUND_GAIN.nav
  const osc = ac.createOscillator()
  const g   = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1100, t)
  osc.frequency.exponentialRampToValueAtTime(700, t + 0.028)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(p, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028)
  osc.connect(g)
  g.connect(getDestination(ac))
  osc.start(t)
  osc.stop(t + 0.032)
}

/**
 * TICK — very short 880 Hz sine, 22 ms. Checkbox / counter feedback.
 */
export async function playUiTickSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  sine(ac, 880, ac.currentTime, 0.022, UI_SOUND_GAIN.tap * 0.80)
}

/**
 * DELETE — pitch drop 220 Hz → 80 Hz over 80 ms. Soft, final thud.
 */
export async function playUiDeleteSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  const t   = ac.currentTime
  const p   = UI_SOUND_GAIN.delete
  const osc = ac.createOscillator()
  const g   = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(220, t)
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.080)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(p, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085)
  osc.connect(g)
  g.connect(getDestination(ac))
  osc.start(t)
  osc.stop(t + 0.090)
}

/**
 * NOTIFICATION — G5 then E5 (descending major 3rd). Gentle, non-intrusive.
 */
export async function playUiNotificationSound(): Promise<void> {
  const ac = await ready(); if (!ac) return
  const t = ac.currentTime
  const p = UI_SOUND_GAIN.nav * 1.4
  sine(ac, N.G5, t,         0.065, p)
  sine(ac, N.E5, t + 0.075, 0.085, p * 0.86)
}

/**
 * STREAK — tap pitch rises one diatonic step per level (C5 scale).
 * Each rapid consecutive click sounds slightly higher and brighter.
 */
export async function playUiStreakSound(streak: number): Promise<void> {
  const ac = await ready(); if (!ac) return
  const scale = [N.C5, N.D5, N.E5, N.G5, N.A5, N.B5, N.C6]
  const idx   = Math.min(streak - 1, scale.length - 1)
  const boost = 1 + idx * 0.06
  sine(ac, scale[idx], ac.currentTime, 0.042, UI_SOUND_GAIN.tap * boost)
}
