export type AppSound = 'softTap' | 'success' | 'cashier' | 'decline'

// ─── File-based sounds ───────────────────────────────────────────────────────

export type FileSoundName = 'ching' | 'paySuccess' | 'notify' | 'pop'

const FILE_SOUND_URLS: Record<FileSoundName, string> = {
  ching: '/sounds/ching.mp3',
  paySuccess: '/sounds/pay-success.mp3',
  notify: '/sounds/notify.mp3',
  pop: '/sounds/pop.mp3',
}

const fileBufferCache: Partial<Record<FileSoundName, AudioBuffer>> = {}
const fileLoadPromise: Partial<Record<FileSoundName, Promise<AudioBuffer | null>>> = {}

async function loadFileBuffer(name: FileSoundName): Promise<AudioBuffer | null> {
  const cached = fileBufferCache[name]
  if (cached) return cached

  if (fileLoadPromise[name]) return fileLoadPromise[name]!

  const Ctor = getAudioContextCtor()
  if (!Ctor) return null

  const promise = (async () => {
    try {
      const res = await fetch(FILE_SOUND_URLS[name])
      const arrayBuffer = await res.arrayBuffer()
      const tmpCtx = new Ctor()
      const decoded = await tmpCtx.decodeAudioData(arrayBuffer)
      void tmpCtx.close()
      fileBufferCache[name] = decoded
      return decoded
    } catch {
      return null
    }
  })()

  fileLoadPromise[name] = promise
  return promise
}

/** Preload all file-based sounds into AudioBuffer cache. */
export function preloadFileSounds() {
  for (const name of Object.keys(FILE_SOUND_URLS) as FileSoundName[]) {
    void loadFileBuffer(name)
  }
}

const fileLastPlayedAt: Partial<Record<FileSoundName, number>> = {}
const FILE_SOUND_COOLDOWN_MS: Record<FileSoundName, number> = {
  ching: 1000,
  paySuccess: 1200,
  notify: 800,
  pop: 300,
}

/** Play a real MP3 sound effect via Web Audio API (decoded, low-latency). */
export async function playFileSound(name: FileSoundName, volume = 1.0) {
  const last = fileLastPlayedAt[name] ?? 0
  if (Date.now() - last < FILE_SOUND_COOLDOWN_MS[name]) return
  fileLastPlayedAt[name] = Date.now()

  const graph = ensureAudioGraph()
  if (!graph) return

  const buffer = await loadFileBuffer(name)
  if (!buffer) return

  const { ctx, output } = graph
  const source = ctx.createBufferSource()
  const gainNode = ctx.createGain()

  source.buffer = buffer
  gainNode.gain.setValueAtTime(Math.min(1, Math.max(0, volume)), ctx.currentTime)

  source.connect(gainNode)
  gainNode.connect(output)
  source.start(ctx.currentTime + 0.005)
}

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
  softTap: 45,
  success: 850,
  cashier: 1100,
  decline: 450,
}

let audioGraph: AudioGraph | null = null
let noiseCache: AudioBuffer | null = null
const lastPlayedAt: Partial<Record<AppSound, number>> = {}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const withWebkit = window as Window & typeof globalThis & {
    webkitAudioContext?: AudioContextCtor
  }
  return withWebkit.AudioContext ?? withWebkit.webkitAudioContext ?? null
}

function ensureAudioGraph(): AudioGraph | null {
  if (audioGraph) {
    if (audioGraph.ctx.state === 'suspended') void audioGraph.ctx.resume()
    return audioGraph
  }

  const Ctor = getAudioContextCtor()
  if (!Ctor) return null

  const ctx = new Ctor()
  const output = ctx.createGain()
  const toneSoftener = ctx.createBiquadFilter()
  const limiter = ctx.createDynamicsCompressor()

  output.gain.value = 0.9
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

function playSoftTap(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.005
  scheduleTone(ctx, output, {
    at: now,
    frequency: 960,
    endFrequency: 720,
    type: 'triangle',
    peak: 0.018,
    decay: 0.055,
    pan: -0.04,
  })
  scheduleTone(ctx, output, {
    at: now + 0.003,
    frequency: 1920,
    endFrequency: 1480,
    type: 'sine',
    peak: 0.0065,
    decay: 0.035,
    pan: 0.08,
  })
  scheduleNoise(ctx, output, {
    at: now,
    duration: 0.02,
    peak: 0.0018,
    highpass: 2400,
    lowpass: 7600,
  })
}

function playSuccess(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.02
  const notes = [
    { offset: 0, freq: 659.25, pan: -0.18 },
    { offset: 0.1, freq: 987.77, pan: 0 },
    { offset: 0.2, freq: 1318.51, pan: 0.18 },
  ]

  scheduleTone(ctx, output, {
    at: now,
    frequency: 329.63,
    type: 'sine',
    peak: 0.006,
    decay: 0.62,
  })
  scheduleNoise(ctx, output, {
    at: now,
    duration: 0.06,
    peak: 0.0015,
    highpass: 2800,
    lowpass: 9000,
  })

  notes.forEach((note, index) => {
    const at = now + note.offset
    const peak = index === notes.length - 1 ? 0.022 : 0.018

    scheduleTone(ctx, output, {
      at,
      frequency: note.freq,
      type: 'triangle',
      peak,
      decay: 0.5 + index * 0.08,
      pan: note.pan,
      detune: index === 1 ? -4 : 4,
    })
    scheduleTone(ctx, output, {
      at: at + 0.008,
      frequency: note.freq * 2,
      type: 'sine',
      peak: peak * 0.38,
      decay: 0.34 + index * 0.05,
      pan: note.pan * 0.7,
    })
    scheduleTone(ctx, output, {
      at: at + 0.18,
      frequency: note.freq,
      type: 'sine',
      peak: peak * 0.18,
      decay: 0.24,
      pan: note.pan * 0.5,
    })
  })
}

function playCashier(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.01

  scheduleNoise(ctx, output, {
    at: now,
    duration: 0.045,
    peak: 0.0026,
    highpass: 2200,
    lowpass: 8400,
  })

  const bell = (at: number, base: number, peak: number, pan: number) => {
    scheduleTone(ctx, output, {
      at,
      frequency: base,
      type: 'sine',
      peak,
      decay: 0.9,
      pan,
    })
    scheduleTone(ctx, output, {
      at: at + 0.004,
      frequency: base * 2.72,
      type: 'sine',
      peak: peak * 0.45,
      decay: 0.48,
      pan: pan * 0.8,
    })
    scheduleTone(ctx, output, {
      at: at + 0.01,
      frequency: base * 4.1,
      type: 'triangle',
      peak: peak * 0.18,
      decay: 0.26,
      pan: pan * 0.6,
    })
  }

  bell(now, 1046.5, 0.022, -0.12)
  bell(now + 0.07, 1567.98, 0.018, 0.14)

  ;[0.12, 0.18, 0.24].forEach((offset, index) => {
    scheduleTone(ctx, output, {
      at: now + offset,
      frequency: 1975.53 + index * 210,
      endFrequency: 1720 + index * 120,
      type: 'sine',
      peak: 0.0055 - index * 0.0009,
      decay: 0.13,
      pan: index === 1 ? 0.2 : -0.15 + index * 0.1,
    })
  })
}

function playDecline(graph: AudioGraph) {
  const { ctx, output } = graph
  const now = ctx.currentTime + 0.01

  scheduleTone(ctx, output, {
    at: now,
    frequency: 493.88,
    endFrequency: 392,
    type: 'triangle',
    peak: 0.014,
    decay: 0.16,
    pan: -0.08,
  })
  scheduleTone(ctx, output, {
    at: now + 0.055,
    frequency: 392,
    endFrequency: 311.13,
    type: 'sine',
    peak: 0.011,
    decay: 0.18,
    pan: 0.06,
  })
}

export function primeAppSounds() {
  const graph = ensureAudioGraph()
  if (!graph) return
  if (graph.ctx.state === 'suspended') void graph.ctx.resume()
}

export function playAppSound(kind: AppSound) {
  if (!canPlay(kind)) return
  const graph = ensureAudioGraph()
  if (!graph) return

  switch (kind) {
    case 'softTap':
      playSoftTap(graph)
      break
    case 'success':
      playSuccess(graph)
      break
    case 'cashier':
      playCashier(graph)
      break
    case 'decline':
      playDecline(graph)
      break
  }
}
