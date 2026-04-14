import {
  getAudioContext,
  getDestination,
  getReadyAudioContext,
  resumeAudioContext,
} from '@/lib/ui-audio-engine'
import { UI_SOUND_GAIN } from '@/lib/ui-sound-config'

export type UiSampleId = 'tap' | 'success' | 'pop' | 'notify'

const SAMPLE_IDS: UiSampleId[] = ['tap', 'success', 'pop', 'notify']

function assetUrl(name: UiSampleId): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}sounds/${name}.mp3`
}

const buffers: Partial<Record<UiSampleId, AudioBuffer>> = {}
const inflight = new Map<UiSampleId, Promise<AudioBuffer | null>>()
const HTML_POOL_SIZE = 3
const htmlPools = new Map<UiSampleId, HTMLAudioElement[]>()
const htmlPoolIdx = new Map<UiSampleId, number>()

async function loadBuffer(id: UiSampleId): Promise<AudioBuffer | null> {
  const ac = getAudioContext()
  if (!ac) return null
  if (buffers[id]) return buffers[id]!
  if (inflight.has(id)) return inflight.get(id)!

  const p = (async (): Promise<AudioBuffer | null> => {
    try {
      const res = await fetch(assetUrl(id))
      if (!res.ok) return null
      const raw = await res.arrayBuffer()
      return await ac.decodeAudioData(raw.slice(0))
    } catch {
      return null
    }
  })()

  inflight.set(id, p)
  const decoded = await p
  inflight.delete(id)
  if (decoded) buffers[id] = decoded
  return decoded
}

/** Warm decode after first user gesture (optional). */
export async function preloadUiSoundSamples(): Promise<void> {
  const ac = await getReadyAudioContext()
  if (ac) await Promise.all(SAMPLE_IDS.map((id) => loadBuffer(id)))
  preloadHtmlPools()
}

/** HTMLAudio `volume` is a different curve than WebAudio gain — floor so clips aren’t silent. */
const HTML_VOL_MIN = 0.32

export function playHtmlOneShot(sample: UiSampleId, volume = 0.85): void {
  if (typeof window === 'undefined') return
  try {
    const pool = getHtmlPool(sample)
    const idx = htmlPoolIdx.get(sample) ?? 0
    const el = pool[idx] ?? new Audio(assetUrl(sample))
    htmlPoolIdx.set(sample, (idx + 1) % Math.max(pool.length, 1))
    el.volume = Math.min(1, Math.max(HTML_VOL_MIN, volume))
    el.currentTime = 0
    void el.play().catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore */
  }
}

function getHtmlPool(sample: UiSampleId): HTMLAudioElement[] {
  let pool = htmlPools.get(sample)
  if (pool) return pool
  pool = Array.from({ length: HTML_POOL_SIZE }, () => {
    const el = new Audio(assetUrl(sample))
    el.preload = 'auto'
    return el
  })
  htmlPools.set(sample, pool)
  htmlPoolIdx.set(sample, 0)
  return pool
}

function preloadHtmlPools(): void {
  for (const id of SAMPLE_IDS) {
    const pool = getHtmlPool(id)
    for (const el of pool) {
      try {
        el.load()
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Snappy one-shot: soft attack, no long tail — safe for 15–35 ms slices.
 */
export function playBufferSlice(
  ac: AudioContext,
  buffer: AudioBuffer,
  when: number,
  opts?: {
    gain?: number
    trimStart?: number
    duration?: number
    playbackRate?: number
  },
): void {
  const gain = opts?.gain ?? 1
  const trim = Math.max(0, opts?.trimStart ?? 0.002)
  const rate = opts?.playbackRate ?? 1
  const maxDur = Math.max(0.001, buffer.duration - trim)
  const dur = Math.min(opts?.duration ?? maxDur, maxDur)

  const src = ac.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate

  const g = ac.createGain()
  const attack = Math.min(0.0018, dur * 0.28)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(gain, when + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)

  src.connect(g)
  g.connect(getDestination(ac))
  src.start(when, trim, dur)
}

async function playSampleOrHtml(
  id: UiSampleId,
  slice: { gain?: number; trimStart?: number; duration?: number; playbackRate?: number },
): Promise<void> {
  const ac = await getReadyAudioContext()
  const htmlVol = Math.min(1, Math.max(HTML_VOL_MIN, (slice.gain ?? 0.45) * 1.35))
  if (!ac) {
    playHtmlOneShot(id, htmlVol)
    return
  }
  const buf = await loadBuffer(id)
  if (!buf) {
    playHtmlOneShot(id, htmlVol)
    return
  }
  const t = ac.currentTime
  playBufferSlice(ac, buf, t, slice)
}

/** Main tap — short slice + fast attack so taps feel immediate. */
export async function playTapSample(): Promise<void> {
  await playSampleOrHtml('tap', {
    gain: UI_SOUND_GAIN.tap,
    trimStart: 0.0015,
    duration: 0.018,
    playbackRate: 1.04,
  })
}

/** Counter / checkbox — slightly shorter. */
export async function playTapMicro(): Promise<void> {
  await playSampleOrHtml('tap', {
    gain: UI_SOUND_GAIN.tap * 0.88,
    trimStart: 0.002,
    duration: 0.016,
  })
}

/** Nav “whoosh” — airy micro slice from same tap pack (consistency). */
export async function playWhooshTap(): Promise<void> {
  await playSampleOrHtml('tap', {
    gain: UI_SOUND_GAIN.nav,
    trimStart: 0.001,
    duration: 0.03,
    playbackRate: 1.12,
  })
}

export async function playSuccessSample(): Promise<void> {
  await playSampleOrHtml('success', {
    gain: UI_SOUND_GAIN.success,
    trimStart: 0.004,
    duration: 0.14,
  })
}

export async function playPopSample(rate = 1): Promise<void> {
  await playSampleOrHtml('pop', {
    gain: UI_SOUND_GAIN.success * 0.72,
    trimStart: 0.002,
    duration: 0.09,
    playbackRate: rate,
  })
}

export async function playNotifySample(): Promise<void> {
  await playSampleOrHtml('notify', {
    gain: UI_SOUND_GAIN.nav * 1.1,
    trimStart: 0.008,
    duration: 0.2,
  })
}

/** Two micro hits — same tap asset, very tight. */
export async function playDoubleTapSample(): Promise<void> {
  const g = UI_SOUND_GAIN.tap * 0.55
  const d = 0.016
  const ac = await getReadyAudioContext()
  if (!ac) {
    playHtmlOneShot('tap', g)
    window.setTimeout(() => playHtmlOneShot('tap', g * 0.92), 36)
    return
  }
  const buf = await loadBuffer('tap')
  if (!buf) {
    playHtmlOneShot('tap', g)
    window.setTimeout(() => playHtmlOneShot('tap', g * 0.92), 36)
    return
  }
  await resumeAudioContext(ac)
  const t = ac.currentTime
  playBufferSlice(ac, buf, t, { gain: g, trimStart: 0.002, duration: d })
  playBufferSlice(ac, buf, t + 0.038, { gain: g * 0.92, trimStart: 0.002, duration: d })
}

/** Very low “cash” bed + louder success chime — same two files, tuned. */
export async function playPaymentLayeredSample(): Promise<void> {
  const bed = UI_SOUND_GAIN.paymentCashBed
  const ch = UI_SOUND_GAIN.paymentChime
  const ac = await getReadyAudioContext()
  if (!ac) {
    playHtmlOneShot('tap', bed * 4)
    window.setTimeout(() => playHtmlOneShot('success', ch), 32)
    return
  }
  const tapBuf = await loadBuffer('tap')
  const okBuf = await loadBuffer('success')
  if (!tapBuf || !okBuf) {
    playHtmlOneShot('tap', bed * 4)
    window.setTimeout(() => playHtmlOneShot('success', ch), 32)
    return
  }
  const t = ac.currentTime
  playBufferSlice(ac, tapBuf, t, { gain: bed, trimStart: 0.003, duration: 0.018, playbackRate: 1.04 })
  playBufferSlice(ac, okBuf, t + 0.028, { gain: ch * 0.95, trimStart: 0.006, duration: 0.2 })
}
