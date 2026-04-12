/**
 * UI sounds — Web Audio API only, zero deps.
 *
 * Design: ASMR-style taps (short, dry, percussive) — avoid long triangle/sine chords
 * that read as “harmonium”. Payment moments use a soft cash-drawer “ka-chink”.
 */

// ─── Note frequency table (A4 = 440 Hz) ──────────────────────────────────────
const NOTE: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0,  A3: 220.0,  B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,  A4: 440.0,  B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,  B5: 987.77,
  C6: 1046.5, E6: 1318.5, G6: 1568.0,
}

// ─── Shared AudioContext + master chain ───────────────────────────────────────
let _ctx: AudioContext | null = null
let _master: DynamicsCompressorNode | null = null
let _masterGain: GainNode | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!_ctx) {
      _ctx = new AudioContext()
      _master = _ctx.createDynamicsCompressor()
      _master.threshold.value = -18
      _master.knee.value = 8
      _master.ratio.value = 4
      _master.attack.value = 0.003
      _master.release.value = 0.15

      _masterGain = _ctx.createGain()
      _masterGain.gain.value = 0.62

      _master.connect(_masterGain)
      _masterGain.connect(_ctx.destination)
    }
    return _ctx
  } catch {
    return null
  }
}

async function resume(ac: AudioContext) {
  if (ac.state === 'suspended') {
    try { await ac.resume() } catch { /* ignore */ }
  }
}

/** Must be called from a user gesture so browser allows audio. */
export function primeAudioContextSync(): void {
  if (typeof window === 'undefined') return
  try {
    const ac = getCtx()
    if (ac?.state === 'suspended') void ac.resume()
  } catch { /* ignore */ }
}

function dest(ac: AudioContext): AudioNode {
  return _master ?? ac.destination
}

// ─── Utility: create oscillator with ADSR gain ────────────────────────────────
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

// ─── Utility: white-noise burst ───────────────────────────────────────────────
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

// ─── Utility: play a sequence of (note, duration, gap) ───────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
//  SOUND LIBRARY
// ═══════════════════════════════════════════════════════════════════════════════

/** 1. CLICK — ASMR micro-tap (keyboard cap). No sustained harmonics. */
export async function playUiClickSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  makeOsc(ac, 'sine', 2650, t, 0.02, 0.038, 0.0008, 0.004, 0.25, 0.012)
  makeNoise(ac, t, 0.006, 0.018, 4200, 'highpass')
}

/** 2. SATISFACTION — two tiny ticks (not a held chord). */
export async function playUiSatisfactionSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  makeOsc(ac, 'sine', 1400, t, 0.018, 0.032, 0.001, 0.005, 0.3, 0.01)
  makeOsc(ac, 'sine', 2100, t + 0.032, 0.018, 0.03, 0.001, 0.005, 0.28, 0.01)
}

/** 3. SUCCESS — quick dry blips. */
export async function playUiSuccessSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  playArpeggio(ac, t, [NOTE.C5, NOTE.E5, NOTE.G5], 0.055, 0.018, 'sine', 0.045, 0.004, 0.045)
}

/** 4. STAGE ADVANCE — two fast taps (pipeline move). */
export async function playUiStageAdvanceSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  makeOsc(ac, 'sine', 880, t, 0.022, 0.04, 0.001, 0.006, 0.3, 0.014)
  makeOsc(ac, 'sine', 1180, t + 0.038, 0.022, 0.038, 0.001, 0.006, 0.32, 0.014)
}

/** 5. ERROR — descending minor 3rd, slightly rough tone. */
export async function playUiErrorSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  // B3 → G3 (minor 3rd down) with sawtooth for edge
  makeOsc(ac, 'sawtooth', NOTE.B3, t, 0.08, 0.055, 0.005, 0.02, 0.6, 0.055)
  makeOsc(ac, 'sawtooth', NOTE.G3, t + 0.07, 0.12, 0.05, 0.006, 0.03, 0.5, 0.08)
  // Soft noise thud on attack
  makeNoise(ac, t, 0.05, 0.035, 300, 'lowpass')
}

/** 6. WARNING — dissonant two-tone alert. */
export async function playUiWarningSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  // E4 + Eb4 (minor 2nd — dissonant but not harsh)
  makeOsc(ac, 'sine', NOTE.E4, t, 0.18, 0.06, 0.01, 0.04, 0.55, 0.1)
  makeOsc(ac, 'sine', NOTE.E4 * Math.pow(2, -1 / 12), t + 0.06, 0.15, 0.04, 0.01, 0.04, 0.45, 0.1)
}

/**
 * Soft cash-register / drawer “ka-chink” — wallet, payment submit, converted lead.
 * Kept intentionally quiet; no long metallic ring.
 */
export async function playUiPaymentCashSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  makeNoise(ac, t, 0.022, 0.028, 900, 'bandpass')
  makeOsc(ac, 'sine', 1240, t + 0.018, 0.026, 0.042, 0.002, 0.008, 0.45, 0.018)
  makeOsc(ac, 'sine', 1880, t + 0.052, 0.024, 0.038, 0.002, 0.008, 0.4, 0.016)
  makeNoise(ac, t + 0.045, 0.012, 0.015, 2400, 'highpass')
}

/** Alias: coin / money moments use the same soft cash register. */
export async function playUiCoinSound(): Promise<void> {
  return playUiPaymentCashSound()
}

/** 8. LEVEL UP — 5-note pentatonic ascending arpeggio. Milestone / achievement. */
export async function playUiLevelUpSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  // C4-D4-E4-G4-A4 pentatonic scale
  const scale = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4]
  playArpeggio(ac, t, scale, 0.09, 0.01, 'sine', 0.055, 0.007, 0.08)
  makeOsc(ac, 'sine', NOTE.C5, t + scale.length * 0.1, 0.2, 0.055, 0.01, 0.04, 0.55, 0.12)
}

/** 9. WHOOSH — filtered noise sweep for navigation / page transitions. */
export async function playUiWhooshSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  // Sweeping BPF noise
  const bufLen = Math.ceil(ac.sampleRate * 0.22)
  const buf = ac.createBuffer(1, bufLen, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1

  const src = ac.createBufferSource()
  src.buffer = buf

  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(200, t)
  filter.frequency.exponentialRampToValueAtTime(3200, t + 0.18)
  filter.Q.value = 2.5

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(0.045, t + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)

  src.connect(filter)
  filter.connect(gain)
  gain.connect(dest(ac))
  src.start(t)
  src.stop(t + 0.22)

  // Subtle high tone trail
  makeOsc(ac, 'sine', 1200, t + 0.12, 0.08, 0.015, 0.01, 0.04, 0.3, 0.06)
}

/** 10. TICK — ultra-short counter increment / typing feedback. */
export async function playUiTickSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  makeOsc(ac, 'sine', 820, t, 0.028, 0.038, 0.003, 0.008, 0.3, 0.016)
  makeNoise(ac, t, 0.018, 0.012, 3500, 'highpass')
}

/** 11. DELETE / REMOVE — soft descending thud. */
export async function playUiDeleteSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(260, t)
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.13)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(0.065, t + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
  osc.connect(gain)
  gain.connect(dest(ac))
  osc.start(t)
  osc.stop(t + 0.15)
  // Low noise impact
  makeNoise(ac, t, 0.07, 0.03, 180, 'lowpass')
}

/** 12. NOTIFICATION — gentle double ping. Incoming alert. */
export async function playUiNotificationSound(): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  // C5 then E5 (major 3rd) — friendly notification
  makeOsc(ac, 'sine', NOTE.C5, t, 0.09, 0.06, 0.008, 0.02, 0.55, 0.065)
  makeOsc(ac, 'sine', NOTE.E5, t + 0.10, 0.14, 0.065, 0.009, 0.025, 0.6, 0.1)
  makeOsc(ac, 'sine', NOTE.G5, t + 0.12, 0.09, 0.022, 0.008, 0.02, 0.35, 0.06)
}

/** 13. STREAK — escalating single note per combo level (C→D→E→G→A→C5+).
 *  Call with the current streak count (1–7+). Higher streaks = higher, brighter note. */
export async function playUiStreakSound(streak: number): Promise<void> {
  primeAudioContextSync()
  const ac = getCtx(); if (!ac) return
  await resume(ac)
  const t = ac.currentTime
  const scale = [NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5, NOTE.E5]
  const idx = Math.min(streak - 1, scale.length - 1)
  const freq = scale[idx]
  const gain = 0.055 + idx * 0.007
  const dur = 0.10 + idx * 0.015

  makeOsc(ac, 'sine', freq, t, dur, gain, 0.006, 0.025, 0.6, dur * 0.5)
  if (streak >= 3) {
    // Add a 5th above for harmony on higher streaks
    makeOsc(ac, 'sine', freq * 1.5, t + 0.01, dur * 0.9, gain * 0.4, 0.008, 0.03, 0.45, dur * 0.45)
  }
  if (streak >= 6) {
    // Epic octave doubling on max streak
    makeOsc(ac, 'sine', freq * 2, t + 0.02, dur * 0.8, gain * 0.25, 0.01, 0.04, 0.4, dur * 0.4)
  }
}
