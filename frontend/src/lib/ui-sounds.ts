/**
 * UI sounds — Web Audio with **audio-timeline** delays (works after `await` in click handlers).
 * HTML5 fallback when the context never reaches `running`.
 */

import {
  getAudioContext,
  getDestination,
  primeAudioContextSync as primeEngine,
  resumeAudioContext,
} from '@/lib/ui-audio-engine'
import { UI_SOUND_GAIN } from '@/lib/ui-sound-config'
import { playHtmlOneShot, playTapSample } from '@/lib/ui-sound-samples'

export { unlockUiAudioFromUserGesture } from '@/lib/ui-audio-engine'
export type { UiSampleId } from '@/lib/ui-sound-samples'

/** Schedule sounds at `context.currentTime + delaySec` so they still fire after microtask delays. */
export type UiSoundScheduleOpts = { delaySec?: number }

export function primeAudioContextSync(): void {
  primeEngine()
}

const N: Record<string, number> = {
  G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.0, A4: 440.0,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5,
}

const ctxRunning = (ac: AudioContext) => ac.state === 'running'

async function ready(): Promise<AudioContext | null> {
  primeEngine()
  const ac = getAudioContext()
  if (!ac) return null
  if (ctxRunning(ac)) return ac
  const maxFrames = 3
  for (let i = 0; i < maxFrames; i++) {
    await resumeAudioContext(ac)
    if (ctxRunning(ac)) return ac
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }
  return null
}

function lag(opts?: UiSoundScheduleOpts): number {
  return Math.max(0, opts?.delaySec ?? 0)
}

function sine(
  ac: AudioContext,
  freq: number,
  startT: number,
  duration: number,
  peak: number,
  attackMs = 0.5,
): void {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startT)
  g.gain.setValueAtTime(0.0001, startT)
  g.gain.linearRampToValueAtTime(peak, startT + attackMs / 1000)
  g.gain.exponentialRampToValueAtTime(0.0001, startT + duration)
  osc.connect(g)
  g.connect(getDestination(ac))
  osc.start(startT)
  osc.stop(startT + duration + 0.002)
}

function seq(
  ac: AudioContext,
  t0: number,
  notes: [freq: number, dur: number, gap: number][],
  peak: number,
): void {
  let cursor = t0
  for (const [freq, dur, gap] of notes) {
    sine(ac, freq, cursor, dur, peak)
    cursor += dur + gap
  }
}

/** HTML fallback after wall-clock delay (e.g. mutation completed — no running context). */
function htmlLater(sample: Parameters<typeof playHtmlOneShot>[0], vol: number, delaySec: number): void {
  window.setTimeout(() => playHtmlOneShot(sample, vol), Math.max(0, delaySec) * 1000)
}

export async function playUiClickSound(): Promise<void> {
  await playTapSample()
}

export async function playUiSatisfactionSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) {
    htmlLater('tap', 0.42, d)
    return
  }
  const t = ac.currentTime + d
  const p = UI_SOUND_GAIN.tap * 1.1
  sine(ac, N.A4, t, 0.048, p)
  sine(ac, N.E5, t + 0.058, 0.062, p * 0.92)
}

export async function playUiSuccessSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  // MP3 provides much better audio quality than sine synthesis
  await playSuccessSample()
  return
  
  // Fallback to synthesis if MP3 unavailable:
  const ac = await ready()
  if (!ac) {
    htmlLater('success', 0.48, d)
    return
  }
  const t = ac.currentTime + d
  const p = UI_SOUND_GAIN.success
  sine(ac, N.E5, t, 0.075, p)
  sine(ac, N.B5, t + 0.08, 0.095, p * 0.88)
}

export async function playUiStageAdvanceSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) {
    htmlLater('tap', 0.4, d)
    return
  }
  const t = ac.currentTime + d
  const p = UI_SOUND_GAIN.success * 0.82
  sine(ac, N.A4, t, 0.068, p)
  sine(ac, N.D5, t + 0.072, 0.086, p * 0.9)
}

export async function playUiErrorSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) return
  sine(ac, N.G3, ac.currentTime + d, 0.09, UI_SOUND_GAIN.error)
}

export async function playUiWarningSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) return
  sine(ac, N.E4, ac.currentTime + d, 0.08, UI_SOUND_GAIN.warning)
}

export async function playUiPaymentCashSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) {
    htmlLater('tap', 0.38, d)
    window.setTimeout(() => playHtmlOneShot('success', 0.48), d * 1000 + 40)
    return
  }
  const t = ac.currentTime + d
  seq(
    ac,
    t,
    [
      [N.C5, 0.038, 0.01],
      [N.E5, 0.042, 0.01],
      [N.G5, 0.055, 0],
    ],
    UI_SOUND_GAIN.paymentChime,
  )
}

export async function playUiCoinSound(opts?: UiSoundScheduleOpts): Promise<void> {
  return playUiPaymentCashSound(opts)
}

export async function playUiLevelUpSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) {
    htmlLater('success', 0.5, d)
    return
  }
  const t = ac.currentTime + d
  seq(
    ac,
    t,
    [
      [N.C4, 0.032, 0.01],
      [N.D4, 0.032, 0.01],
      [N.E4, 0.038, 0.01],
      [N.G4, 0.055, 0],
    ],
    UI_SOUND_GAIN.success * 0.85,
  )
}

export async function playUiWhooshSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) return
  const t = ac.currentTime + d
  const p = UI_SOUND_GAIN.nav
  const osc = ac.createOscillator()
  const g = ac.createGain()
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

export async function playUiTickSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) {
    htmlLater('tap', 0.4, d)
    return
  }
  sine(ac, 880, ac.currentTime + d, 0.022, UI_SOUND_GAIN.tap * 0.8)
}

export async function playUiDeleteSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) return
  const t = ac.currentTime + d
  const p = UI_SOUND_GAIN.delete
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(220, t)
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.08)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(p, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085)
  osc.connect(g)
  g.connect(getDestination(ac))
  osc.start(t)
  osc.stop(t + 0.09)
}

export async function playUiNotificationSound(opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  // Use professional notification sound
  await playNotifySample()
  return
  
  // Fallback to synthesis:
  const ac = await ready()
  if (!ac) {
    htmlLater('notify', 0.45, d)
    return
  }
  const t = ac.currentTime + d
  const p = UI_SOUND_GAIN.nav * 1.4
  sine(ac, N.G5, t, 0.065, p)
  sine(ac, N.E5, t + 0.075, 0.085, p * 0.86)
}

export async function playUiStreakSound(streak: number, opts?: UiSoundScheduleOpts): Promise<void> {
  const d = lag(opts)
  const ac = await ready()
  if (!ac) return
  const scale = [N.C5, N.D5, N.E5, N.G5, N.A5, N.B5, N.C6]
  const idx = Math.min(streak - 1, scale.length - 1)
  const boost = 1 + idx * 0.06
  sine(ac, scale[idx], ac.currentTime + d, 0.042, UI_SOUND_GAIN.tap * boost)
}
