/**
 * UI sounds — Web Audio + short MP3 slices where they help (success / payment / notify).
 * Taps, nav, and errors are **designed** here (ultra-short, consistent) — not long MP3 tails.
 */

import {
  getAudioContext,
  getDestination,
  primeAudioContextSync as primeEngine,
  resumeAudioContext,
} from '@/lib/ui-audio-engine'
import { UI_SOUND_GAIN } from '@/lib/ui-sound-config'
import {
  playDoubleTapSample,
  playNotifySample,
  playPaymentLayeredSample,
  playPopSample,
  playSuccessSample,
  playTapMicro,
} from '@/lib/ui-sound-samples'

export { unlockUiAudioFromUserGesture } from '@/lib/ui-audio-engine'
export type { UiSampleId } from '@/lib/ui-sound-samples'

export function primeAudioContextSync(): void {
  primeEngine()
}

const NOTE: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.5, G6: 1568.0,
}

function dest(ac: AudioContext): AudioNode {
  return getDestination(ac)
}

function makeOsc(
  ac: AudioContext,
  type: OscillatorType,
  freq: number,
  startT: number,
  duration: number,
  peakGain: number,
  attackTime = 0.008,
  decayTime = 0.04,
  sustainLevel = 0.6,
  releaseTime = 0.08,
): OscillatorNode {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startT)
  gain.gain.setValueAtTime(0.0001, startT)
  gain.gain.linearRampToValueAtTime(peakGain, startT + attackTime)
  gain.gain.linearRampToValueAtTime(peakGain * sustainLevel, startT + attackTime + decayTime)
  gain.gain.setValueAtTime(peakGain * sustainLevel, startT + duration - releaseTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, startT + duration)
  osc.connect(gain)
  gain.connect(dest(ac))
  osc.start(startT)
  osc.stop(startT + duration + 0.01)
  return osc
}

function makeNoise(
  ac: AudioContext,
  startT: number,
  duration: number,
  peakGain: number,
  filterFreq = 2000,
  filterType: BiquadFilterType = 'bandpass',
): void {
  const bufLen = Math.ceil(ac.sampleRate * (duration + 0.05))
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

  const src = ac.createBufferSource()
  src.buffer = buf

  const filter = ac.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = filterFreq
  filter.Q.value = 1.5

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, startT)
  gain.gain.linearRampToValueAtTime(peakGain, startT + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, startT + duration)

  src.connect(filter)
  filter.connect(gain)
  gain.connect(dest(ac))
  src.start(startT)
  src.stop(startT + duration + 0.05)
}

function playArpeggio(
  ac: AudioContext,
  t: number,
  notes: number[],
  noteDur: number,
  gap: number,
  oscType: OscillatorType,
  peakGain: number,
  attackTime?: number,
  releaseTime?: number,
): void {
  notes.forEach((freq, i) => {
    const start = t + i * (noteDur + gap)
    makeOsc(ac, oscType, freq, start, noteDur, peakGain, attackTime, 0.02, 0.5, releaseTime ?? 0.06)
  })
}

/** 18–22 ms warm body + 10–12 ms digital tick — same recipe everywhere. */
function playDesignedDigitalTap(ac: AudioContext, t: number, scale = 1): void {
  const peak = UI_SOUND_GAIN.tap * scale
  const bodyMs = 0.02
  const o1 = ac.createOscillator()
  o1.type = 'triangle'
  o1.frequency.setValueAtTime(168, t)
  const g1 = ac.createGain()
  g1.gain.setValueAtTime(0.0001, t)
  g1.gain.linearRampToValueAtTime(peak * 0.52, t + 0.002)
  g1.gain.exponentialRampToValueAtTime(0.0001, t + bodyMs)
  o1.connect(g1)
  g1.connect(dest(ac))
  o1.start(t)
  o1.stop(t + bodyMs + 0.004)

  const o2 = ac.createOscillator()
  o2.type = 'sine'
  o2.frequency.setValueAtTime(2480, t)
  const g2 = ac.createGain()
  g2.gain.setValueAtTime(0.0001, t)
  g2.gain.linearRampToValueAtTime(peak * 0.4, t + 0.001)
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.011)
  o2.connect(g2)
  g2.connect(dest(ac))
  o2.start(t)
  o2.stop(t + 0.014)
}

/** ~32 ms airy band-pass noise — no long sweep. */
function playMicroWhoosh(ac: AudioContext, t: number): void {
  const peak = UI_SOUND_GAIN.nav
  const dur = 0.034
  const bufLen = Math.ceil(ac.sampleRate * (dur + 0.02))
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

  const src = ac.createBufferSource()
  src.buffer = buf
  const f = ac.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(900, t)
  f.frequency.exponentialRampToValueAtTime(5200, t + dur * 0.85)
  f.Q.value = 0.85

  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak * 0.55, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(f)
  f.connect(g)
  g.connect(dest(ac))
  src.start(t)
  src.stop(t + dur + 0.01)
}

/** 1. CLICK — designed tap (no long sample = no “harmonium”). */
export async function playUiClickSound(): Promise<void> {
  primeEngine()
  const ac = getAudioContext()
  if (!ac) return
  await resumeAudioContext(ac)
  playDesignedDigitalTap(ac, ac.currentTime, 1)
}

/** 2. SATISFACTION — two tight taps from the same pack / synth. */
export async function playUiSatisfactionSound(): Promise<void> {
  try {
    await playDoubleTapSample()
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    const t = ac.currentTime
    playDesignedDigitalTap(ac, t, 0.92)
    playDesignedDigitalTap(ac, t + 0.036, 0.85)
  }
}

/** 3. SUCCESS — short success slice from one file. */
export async function playUiSuccessSound(): Promise<void> {
  try {
    await playSuccessSample()
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    const t = ac.currentTime
    const g = UI_SOUND_GAIN.success * 0.55
    playArpeggio(ac, t, [NOTE.C5, NOTE.E5], 0.04, 0.012, 'sine', g, 0.003, 0.028)
  }
}

/** 4. STAGE — two micro hits. */
export async function playUiStageAdvanceSound(): Promise<void> {
  try {
    await playDoubleTapSample()
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    const t = ac.currentTime
    playDesignedDigitalTap(ac, t, 0.88)
    playDesignedDigitalTap(ac, t + 0.042, 0.82)
  }
}

/** 5. ERROR — dull, low, instant — not a harsh alarm. */
export async function playUiErrorSound(): Promise<void> {
  primeEngine()
  const ac = getAudioContext()
  if (!ac) return
  await resumeAudioContext(ac)
  const t = ac.currentTime
  const peak = UI_SOUND_GAIN.error
  const f1 = 185
  const f2 = 198
  const o1 = ac.createOscillator()
  o1.type = 'sine'
  o1.frequency.setValueAtTime(f1, t)
  const g1 = ac.createGain()
  g1.gain.setValueAtTime(0.0001, t)
  g1.gain.linearRampToValueAtTime(peak * 0.55, t + 0.004)
  g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.095)
  o1.connect(g1)
  g1.connect(dest(ac))
  o1.start(t)
  o1.stop(t + 0.1)

  const o2 = ac.createOscillator()
  o2.type = 'sine'
  o2.frequency.setValueAtTime(f2, t)
  const g2 = ac.createGain()
  g2.gain.setValueAtTime(0.0001, t)
  g2.gain.linearRampToValueAtTime(peak * 0.42, t + 0.005)
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.088)
  o2.connect(g2)
  g2.connect(dest(ac))
  o2.start(t)
  o2.stop(t + 0.095)

  makeNoise(ac, t, 0.055, peak * 0.22, 420, 'bandpass')
}

/** 6. WARNING — soft dissonant pair, low level. */
export async function playUiWarningSound(): Promise<void> {
  primeEngine()
  const ac = getAudioContext()
  if (!ac) return
  await resumeAudioContext(ac)
  const t = ac.currentTime
  const p = UI_SOUND_GAIN.warning
  makeOsc(ac, 'sine', NOTE.E4, t, 0.14, p * 0.5, 0.008, 0.03, 0.5, 0.08)
  makeOsc(ac, 'sine', NOTE.E4 * Math.pow(2, -1 / 12), t + 0.04, 0.12, p * 0.38, 0.008, 0.03, 0.45, 0.08)
}

/** Payment — quiet cash bed + chime (same two samples, tuned in samples module). */
export async function playUiPaymentCashSound(): Promise<void> {
  try {
    await playPaymentLayeredSample()
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    const t = ac.currentTime
    const bed = UI_SOUND_GAIN.paymentCashBed
    makeNoise(ac, t, 0.018, bed * 2.2, 700, 'bandpass')
    makeOsc(ac, 'sine', 1320, t + 0.02, 0.08, UI_SOUND_GAIN.paymentChime * 0.45, 0.002, 0.02, 0.5, 0.05)
  }
}

export async function playUiCoinSound(): Promise<void> {
  return playUiPaymentCashSound()
}

/** 8. LEVEL UP — short pop slice. */
export async function playUiLevelUpSound(): Promise<void> {
  try {
    await playPopSample(1.04)
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    const t = ac.currentTime
    const scale = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4]
    const g = UI_SOUND_GAIN.success * 0.45
    playArpeggio(ac, t, scale, 0.06, 0.008, 'sine', g, 0.004, 0.04)
  }
}

/** 9. NAV / WHOOSH — micro airy burst (caller may delay 10 ms for motion sync). */
export async function playUiWhooshSound(): Promise<void> {
  primeEngine()
  const ac = getAudioContext()
  if (!ac) return
  await resumeAudioContext(ac)
  const t = ac.currentTime
  playMicroWhoosh(ac, t)
}

/** 10. TICK — sample micro-slice or designed tap. */
export async function playUiTickSound(): Promise<void> {
  try {
    await playTapMicro()
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    playDesignedDigitalTap(ac, ac.currentTime, 0.82)
  }
}

/** 11. DELETE — soft thud. */
export async function playUiDeleteSound(): Promise<void> {
  primeEngine()
  const ac = getAudioContext()
  if (!ac) return
  await resumeAudioContext(ac)
  const t = ac.currentTime
  const p = UI_SOUND_GAIN.delete
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(220, t)
  osc.frequency.exponentialRampToValueAtTime(75, t + 0.1)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(p * 0.9, t + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)
  osc.connect(gain)
  gain.connect(dest(ac))
  osc.start(t)
  osc.stop(t + 0.12)
  makeNoise(ac, t, 0.05, p * 0.35, 200, 'lowpass')
}

/** 12. NOTIFICATION — one pack, short slice. */
export async function playUiNotificationSound(): Promise<void> {
  try {
    await playNotifySample()
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    const t = ac.currentTime
    const g = UI_SOUND_GAIN.nav * 0.9
    makeOsc(ac, 'sine', NOTE.C5, t, 0.07, g, 0.006, 0.02, 0.5, 0.05)
    makeOsc(ac, 'sine', NOTE.E5, t + 0.06, 0.08, g * 0.85, 0.006, 0.02, 0.5, 0.055)
  }
}

/** 13. STREAK — short pop, pitch by level. */
export async function playUiStreakSound(streak: number): Promise<void> {
  const rate = 1 + Math.min(Math.max(streak - 1, 0), 7) * 0.022
  try {
    await playPopSample(rate)
  } catch {
    primeEngine()
    const ac = getAudioContext()
    if (!ac) return
    await resumeAudioContext(ac)
    const t = ac.currentTime
    playDesignedDigitalTap(ac, t, 0.95 + (streak - 1) * 0.04)
  }
}
