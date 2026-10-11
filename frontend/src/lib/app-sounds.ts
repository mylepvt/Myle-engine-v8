export type AppSound =
  | 'tap'
  | 'success'
  | 'error'
  | 'claim'
  | 'notify'
  | 'reward'
  | 'wheel_tick'
  | 'jackpot'
  | 'scratch'
  | 'level_up'

// ─── Global enable/mute (SaaS: user-controllable, persisted) ──────────────────
const SOUND_PREF_KEY = 'myle-sound-enabled'

function readInitialSoundPref(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_PREF_KEY)
    if (raw === '0') return false
    if (raw === '1') return true
    return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

let soundsEnabled = readInitialSoundPref()

export function getSoundsEnabled(): boolean {
  return soundsEnabled
}

export function setSoundsEnabled(value: boolean): void {
  soundsEnabled = value
  try {
    localStorage.setItem(SOUND_PREF_KEY, value ? '1' : '0')
  } catch { /* ignore */ }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type AudioContextCtor = typeof AudioContext

type AudioGraph = {
  ctx: AudioContext
  output: GainNode
}

type ToneOptions = {
  at: number
  frequency: number
  endFrequency?: number
  type?: OscillatorType
  peak: number
  attack?: number
  decay: number
  pan?: number
  detune?: number
  filter?: {
    type: BiquadFilterType
    frequency: number
    q?: number
    gain?: number
  }
}

type NoiseOptions = {
  at: number
  duration: number
  peak: number
  pan?: number
  highpass?: number
  lowpass?: number
}

const SOUND_COOLDOWN_MS: Record<AppSound, number> = {
  tap: 45,
  success: 850,
  error: 450,
  claim: 1100,
  notify: 800,
  reward: 1500,
  wheel_tick: 28,
  jackpot: 2500,
  scratch: 300,
  level_up: 2500,
}

const MASTER_GAIN = 2.6

let audioGraph: AudioGraph | null = null
let noiseCache: AudioBuffer | null = null
const lastPlayedAt: Partial<Record<AppSound, number>> = {}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function ensureAudioGraph(): AudioGraph | null {
  if (audioGraph) {
    if (audioGraph.ctx.state === 'suspended') void audioGraph.ctx.resume()
    return audioGraph
  }
  const Ctor = getAudioContextCtor()
  if (!Ctor) return null

  // iOS: let web audio play even with the ringer switch on silent (Safari 16.4+).
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
  } catch { /* not supported */ }

  const ctx = new Ctor()
  const output = ctx.createGain()
  const toneSoftener = ctx.createBiquadFilter()
  const limiter = ctx.createDynamicsCompressor()

  // The voices below are mixed quiet; this lifts them to a clearly audible level on phones
  // (the compressor keeps the loud moments — jackpot, coin shower — from clipping).
  output.gain.value = MASTER_GAIN
  toneSoftener.type = 'highshelf'
  toneSoftener.frequency.value = 2400
  toneSoftener.gain.value = -6
  limiter.threshold.value = -22
  limiter.knee.value = 22
  limiter.ratio.value = 3
  limiter.attack.value = 0.003
  limiter.release.value = 0.18

  output.connect(toneSoftener)
  toneSoftener.connect(limiter)
  limiter.connect(ctx.destination)

  audioGraph = { ctx, output }
  return audioGraph
}

function connectWithPan(ctx: AudioContext, source: AudioNode, destination: AudioNode, pan = 0) {
  const panner = ctx.createStereoPanner()
  source.connect(panner)
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime)
  panner.connect(destination)
}

function scheduleTone(ctx: AudioContext, destination: AudioNode, options: ToneOptions) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  let tail: AudioNode = osc

  if (options.filter) {
    const filter = ctx.createBiquadFilter()
    filter.type = options.filter.type
    filter.frequency.setValueAtTime(options.filter.frequency, options.at)
    if (typeof options.filter.q === 'number') filter.Q.value = options.filter.q
    if (typeof options.filter.gain === 'number') filter.gain.value = options.filter.gain
    tail.connect(filter)
    tail = filter
  }

  tail.connect(gain)
  connectWithPan(ctx, gain, destination, options.pan)

  const attack = options.attack ?? 0.01
  const stopAt = options.at + options.decay + 0.04
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(options.frequency, options.at)
  if (typeof options.endFrequency === 'number') {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, options.endFrequency), stopAt)
  }
  if (typeof options.detune === 'number') {
    osc.detune.setValueAtTime(options.detune, options.at)
  }

  gain.gain.setValueAtTime(0.0001, options.at)
  gain.gain.exponentialRampToValueAtTime(options.peak, options.at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt)

  osc.start(options.at)
  osc.stop(stopAt)
}

function getNoiseBuffer(ctx: AudioContext) {
  if (noiseCache && noiseCache.sampleRate === ctx.sampleRate) return noiseCache
  const length = Math.ceil(ctx.sampleRate * 0.35)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * (1 - i / length)
  }
  noiseCache = buffer
  return buffer
}

function scheduleNoise(ctx: AudioContext, destination: AudioNode, options: NoiseOptions) {
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  const highpass = ctx.createBiquadFilter()
  const lowpass = ctx.createBiquadFilter()

  source.buffer = getNoiseBuffer(ctx)
  highpass.type = 'highpass'
  highpass.frequency.setValueAtTime(options.highpass ?? 1200, options.at)
  lowpass.type = 'lowpass'
  lowpass.frequency.setValueAtTime(options.lowpass ?? 6400, options.at)

  source.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(gain)
  connectWithPan(ctx, gain, destination, options.pan)

  gain.gain.setValueAtTime(options.peak, options.at)
  gain.gain.exponentialRampToValueAtTime(0.0001, options.at + options.duration)

  source.start(options.at)
  source.stop(options.at + options.duration)
}

function canPlay(kind: AppSound) {
  const last = lastPlayedAt[kind] ?? 0
  const now = Date.now()
  if (now - last < SOUND_COOLDOWN_MS[kind]) return false
  lastPlayedAt[kind] = now
  return true
}

// ─── tap ─────────────────────────────────────────────────────────────────────
// Apple-keyboard-style keypress: crisp noise "tac" + soft low body "pock".
// NOT a pitched beep. Per-press jitter for natural typing feel.
function playTap(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.003
  const lvl = (0.82 + Math.random() * 0.34) * 0.42 // taps stay subtle under MASTER_GAIN
  const pitch = 1 + (Math.random() * 0.08 - 0.04)

  scheduleTone(ctx, output, {
    at: now,
    frequency: 176 * pitch,
    endFrequency: 112 * pitch,
    type: 'sine',
    peak: 0.036 * lvl,
    attack: 0.001,
    decay: 0.033,
    filter: { type: 'lowpass', frequency: 900, q: 0.6 },
  })
  scheduleNoise(ctx, output, {
    at: now,
    duration: 0.01,
    peak: 0.045 * lvl,
    highpass: 1400,
    lowpass: 5000,
  })
  scheduleNoise(ctx, output, {
    at: now + 0.0005,
    duration: 0.004,
    peak: 0.017 * lvl,
    highpass: 3800,
    lowpass: 8200,
  })
}

// ─── success ─────────────────────────────────────────────────────────────────
// Ascending major arpeggio — positive completion.
function playSuccess(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.02
  const notes = [
    { offset: 0, freq: 659.25, pan: -0.18 },
    { offset: 0.1, freq: 987.77, pan: 0 },
    { offset: 0.2, freq: 1318.51, pan: 0.18 },
  ]

  scheduleTone(ctx, output, {
    at: now, frequency: 329.63, type: 'sine', peak: 0.006, decay: 0.62,
  })
  scheduleNoise(ctx, output, {
    at: now, duration: 0.06, peak: 0.0015, highpass: 2800, lowpass: 9000,
  })

  notes.forEach((note, i) => {
    const at = now + note.offset
    const peak = i === notes.length - 1 ? 0.022 : 0.018
    scheduleTone(ctx, output, {
      at, frequency: note.freq, type: 'triangle', peak,
      decay: 0.5 + i * 0.08, pan: note.pan, detune: i === 1 ? -4 : 4,
    })
    scheduleTone(ctx, output, {
      at: at + 0.008, frequency: note.freq * 2, type: 'sine',
      peak: peak * 0.38, decay: 0.34 + i * 0.05, pan: note.pan * 0.7,
    })
    scheduleTone(ctx, output, {
      at: at + 0.18, frequency: note.freq, type: 'sine',
      peak: peak * 0.18, decay: 0.24, pan: note.pan * 0.5,
    })
  })
}

// ─── error ───────────────────────────────────────────────────────────────────
// Short descending minor — clear negative feedback.
function playError(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.01

  scheduleTone(ctx, output, {
    at: now, frequency: 493.88, endFrequency: 392, type: 'triangle',
    peak: 0.014, decay: 0.16, pan: -0.08,
  })
  scheduleTone(ctx, output, {
    at: now + 0.055, frequency: 392, endFrequency: 311.13, type: 'sine',
    peak: 0.011, decay: 0.18, pan: 0.06,
  })
}

// ─── claim ───────────────────────────────────────────────────────────────────
// Cash-register ka-ching — dopamine on lead claim / approval.
function playClaim(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.01

  scheduleNoise(ctx, output, {
    at: now, duration: 0.045, peak: 0.0026, highpass: 2200, lowpass: 8400,
  })

  const bell = (at: number, base: number, peak: number, pan: number) => {
    scheduleTone(ctx, output, {
      at, frequency: base, type: 'sine', peak, decay: 0.9, pan,
    })
    scheduleTone(ctx, output, {
      at: at + 0.004, frequency: base * 2.72, type: 'sine',
      peak: peak * 0.45, decay: 0.48, pan: pan * 0.8,
    })
    scheduleTone(ctx, output, {
      at: at + 0.01, frequency: base * 4.1, type: 'triangle',
      peak: peak * 0.18, decay: 0.26, pan: pan * 0.6,
    })
  }

  bell(now, 1046.5, 0.022, -0.12)
  bell(now + 0.07, 1567.98, 0.018, 0.14)

  ;[0.12, 0.18, 0.24].forEach((offset, i) => {
    scheduleTone(ctx, output, {
      at: now + offset, frequency: 1975.53 + i * 210,
      endFrequency: 1720 + i * 120, type: 'sine',
      peak: 0.0055 - i * 0.0009, decay: 0.13,
      pan: i === 1 ? 0.2 : -0.15 + i * 0.1,
    })
  })
}

// ─── notify ─────────────────────────────────────────────────────────────────
// Short two-tone ping — new event arrived, attention without urgency.
function playNotify(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.005

  scheduleTone(ctx, output, {
    at: now, frequency: 880, type: 'sine', peak: 0.012, decay: 0.12, pan: -0.1,
    filter: { type: 'lowpass', frequency: 2400 },
  })
  scheduleTone(ctx, output, {
    at: now + 0.075, frequency: 1174.66, type: 'sine', peak: 0.01, decay: 0.14, pan: 0.1,
    filter: { type: 'lowpass', frequency: 2200 },
  })
  scheduleNoise(ctx, output, {
    at: now, duration: 0.02, peak: 0.0012, highpass: 4000, lowpass: 10000,
  })
}

// ─── reward ──────────────────────────────────────────────────────────────────
// MYLE Points arrived — ASMR "coin into glass": a soft bubble pop, two bright coin
// clinks with metallic (inharmonic) partials, then a glassy pentatonic shimmer over a warm pad.
function coinClink(ctx: AudioContext, output: AudioNode, at: number, base: number, peak: number, pan: number) {
  ;[
    [1, 1, 0.28],
    [2.41, 0.42, 0.14],
    [3.87, 0.22, 0.08],
    [5.3, 0.1, 0.05],
  ].forEach(([ratio, gain, decay]) => {
    scheduleTone(ctx, output, {
      at, frequency: base * ratio, type: 'sine', peak: peak * gain, attack: 0.001, decay, pan,
    })
  })
  scheduleNoise(ctx, output, { at, duration: 0.012, peak: peak * 0.5, highpass: 5000, lowpass: 12000, pan })
}

function playReward(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.02
  // bubble pop
  scheduleTone(ctx, output, {
    at: now, frequency: 220, endFrequency: 90, type: 'sine', peak: 0.05, attack: 0.002, decay: 0.07,
  })
  coinClink(ctx, output, now + 0.035, 2093, 0.03, -0.25)
  coinClink(ctx, output, now + 0.12, 2637, 0.026, 0.25)
  // glassy shimmer, rising
  ;[1568, 1976, 2349, 3136].forEach((f, i) => {
    scheduleTone(ctx, output, {
      at: now + 0.2 + i * 0.055, frequency: f, type: 'sine', peak: 0.012 - i * 0.0015,
      attack: 0.004, decay: 0.55, pan: -0.3 + i * 0.2,
    })
  })
  // warm pad underneath
  ;[523.25, 659.25, 783.99].forEach((f, i) => {
    scheduleTone(ctx, output, {
      at: now + 0.05, frequency: f, type: 'triangle', peak: 0.006, attack: 0.06, decay: 0.9,
      pan: -0.15 + i * 0.15, filter: { type: 'lowpass', frequency: 1600, q: 0.5 },
    })
  })
}

// ─── level_up ────────────────────────────────────────────────────────────────
// A rising "whoosh" sweep into a bright arpeggio + sparkle rain.
function playLevelUp(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.02
  const src = ctx.createBufferSource()
  const bp = ctx.createBiquadFilter()
  const g = ctx.createGain()
  src.buffer = getNoiseBuffer(ctx)
  src.loop = true
  bp.type = 'bandpass'
  bp.Q.value = 1.4
  bp.frequency.setValueAtTime(300, now)
  bp.frequency.exponentialRampToValueAtTime(5200, now + 0.6)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.05, now + 0.45)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)
  src.connect(bp)
  bp.connect(g)
  g.connect(output)
  src.start(now)
  src.stop(now + 0.75)
  ;[523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
    scheduleTone(ctx, output, {
      at: now + 0.55 + i * 0.07, frequency: f, type: 'triangle', peak: 0.02, decay: 0.6,
      pan: -0.3 + i * 0.15,
    })
  })
  for (let i = 0; i < 8; i += 1) {
    scheduleTone(ctx, output, {
      at: now + 0.9 + i * 0.06, frequency: 2400 + ((i * 523) % 1600), type: 'sine', peak: 0.007,
      decay: 0.25, pan: i % 2 ? 0.4 : -0.4,
    })
  }
}

// ─── wheel_tick ──────────────────────────────────────────────────────────────
// Prize-wheel clicker: a crisp plastic "tk" each time a peg flicks the pointer.
// `speed` 0..1 — fast spin = light, quick clicks; the last slow clicks land heavy and woody.
function playWheelTick(graph: AudioGraph, speed = 0.5) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.002
  const s = Math.max(0, Math.min(1, speed))
  const heavy = 1 - s
  const pitch = 1 + (Math.random() * 0.06 - 0.03)
  scheduleNoise(ctx, output, {
    at: now, duration: 0.009, peak: 0.07 + heavy * 0.05, highpass: 2200, lowpass: 6500,
  })
  scheduleTone(ctx, output, {
    at: now, frequency: (1500 + s * 500) * pitch, endFrequency: 900, type: 'triangle',
    peak: 0.03 + heavy * 0.02, attack: 0.001, decay: 0.025,
    filter: { type: 'bandpass', frequency: 1800, q: 1.4 },
  })
  if (heavy > 0.5) {
    // body "thock" on the slow last clicks
    scheduleTone(ctx, output, {
      at: now, frequency: 160 * pitch, endFrequency: 90, type: 'sine', peak: 0.05 * heavy, attack: 0.001, decay: 0.06,
    })
  }
}

/** Continuous spin whoosh: filtered air that brightens and swells with speed. */
export type WheelWhoosh = { update: (speed: number) => void; stop: () => void }

export function startWheelWhoosh(): WheelWhoosh | null {
  if (!soundsEnabled) return null
  const graph = ensureAudioGraph()
  if (!graph) return null
  const { ctx, output } = graph
  const src = ctx.createBufferSource()
  const bp = ctx.createBiquadFilter()
  const g = ctx.createGain()
  src.buffer = getNoiseBuffer(ctx)
  src.loop = true
  bp.type = 'bandpass'
  bp.Q.value = 0.8
  bp.frequency.value = 1400
  g.gain.value = 0.0001
  src.connect(bp)
  bp.connect(g)
  g.connect(output)
  src.start()
  let stopped = false
  return {
    update(speed: number) {
      if (stopped) return
      const s = Math.max(0, Math.min(1, speed))
      const t = ctx.currentTime
      bp.frequency.setTargetAtTime(250 + s * 2200, t, 0.08)
      g.gain.setTargetAtTime(0.0002 + s * s * 0.03, t, 0.1)
    },
    stop() {
      if (stopped) return
      stopped = true
      const t = ctx.currentTime
      g.gain.setTargetAtTime(0.0001, t, 0.08)
      src.stop(t + 0.4)
    },
  }
}

// ─── jackpot ─────────────────────────────────────────────────────────────────
// Winner: a deep drum hit, a big bell, a major-chord swell and a shower of coins.
function playJackpot(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.03
  // drum hit
  scheduleTone(ctx, output, { at: now, frequency: 110, endFrequency: 42, type: 'sine', peak: 0.16, attack: 0.002, decay: 0.45 })
  scheduleNoise(ctx, output, { at: now, duration: 0.08, peak: 0.05, highpass: 200, lowpass: 2400 })
  // big bell
  ;[
    [1, 0.04, 2.2],
    [2.76, 0.016, 1.2],
    [5.4, 0.008, 0.6],
  ].forEach(([ratio, peak, decay]) => {
    scheduleTone(ctx, output, { at: now + 0.02, frequency: 523.25 * ratio, type: 'sine', peak, decay })
  })
  // chord swell
  ;[261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => {
    scheduleTone(ctx, output, {
      at: now + 0.1, frequency: f, type: i % 2 ? 'triangle' : 'sawtooth', peak: 0.009, attack: 0.25,
      decay: 2.2, pan: -0.4 + i * 0.2, detune: i * 4 - 8,
      filter: { type: 'lowpass', frequency: 2200, q: 0.6 },
    })
  })
  // coin shower
  for (let i = 0; i < 26; i += 1) {
    const at = now + 0.15 + Math.random() * 1.7
    coinClink(ctx, output, at, 2000 + Math.random() * 2200, 0.008 + Math.random() * 0.012, Math.random() * 1.6 - 0.8)
  }
}

// ─── scratch ─────────────────────────────────────────────────────────────────
// Coin scratching foil: a few quick filtered-noise strokes.
function playScratch(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.005
  ;[0, 0.07, 0.15, 0.22].forEach((t, i) => {
    scheduleNoise(ctx, output, {
      at: now + t, duration: 0.06, peak: 0.035, highpass: 2500 + i * 300, lowpass: 9000, pan: i % 2 ? 0.2 : -0.2,
    })
  })
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/** True once the browser lets us make sound (a tap has unlocked audio). */
export function audioReady(): boolean {
  return audioGraph?.ctx.state === 'running'
}

/** Call on every tap: unlocks audio, and wakes it again after the phone suspended it. */
export function primeAppSounds() {
  const graph = ensureAudioGraph()
  if (!graph) return
  if (graph.ctx.state !== 'running') void graph.ctx.resume()
}

/** A light buzz on phones that support it (Android). No-op elsewhere or when sounds are off. */
export function haptic(pattern: number | number[]) {
  if (!soundsEnabled) return
  try {
    navigator.vibrate?.(pattern)
  } catch { /* not supported */ }
}

export function playAppSound(kind: AppSound, opts?: { speed?: number }) {
  if (!soundsEnabled) return
  if (!canPlay(kind)) return
  const graph = ensureAudioGraph()
  if (!graph) return

  switch (kind) {
    case 'tap':    playTap(graph); break
    case 'success':  playSuccess(graph); break
    case 'error':    playError(graph); break
    case 'claim':    playClaim(graph); break
    case 'notify':   playNotify(graph); break
    case 'reward':   playReward(graph); break
    case 'wheel_tick': playWheelTick(graph, opts?.speed); break
    case 'jackpot':  playJackpot(graph); break
    case 'scratch':  playScratch(graph); break
    case 'level_up': playLevelUp(graph); break
  }
}
