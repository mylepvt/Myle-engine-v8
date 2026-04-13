import {
  getAudioContext,
  getDestination,
  getReadyAudioContext,
  resumeAudioContext,
} from '@/lib/ui-audio-engine'

export type UiSampleId = 'tap' | 'success' | 'pop' | 'notify'

const SAMPLE_IDS: UiSampleId[] = ['tap', 'success', 'pop', 'notify']

function assetUrl(name: UiSampleId): string {
  const base = import.meta.env.BASE_URL ?? '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}sounds/${name}.mp3`
}

const buffers: Partial<Record<UiSampleId, AudioBuffer>> = {}
const inflight = new Map<UiSampleId, Promise<AudioBuffer | null>>()

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
  if (!ac) return
  await Promise.all(SAMPLE_IDS.map((id) => loadBuffer(id)))
}

export function playHtmlOneShot(sample: UiSampleId, volume = 0.85): void {
  if (typeof window === 'undefined') return
  try {
    const el = new Audio(assetUrl(sample))
    el.volume = volume
    void el.play().catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore */
  }
}

/**
 * Snappy one-shot from decoded buffer (trim attack, optional rate / slice).
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
  const trim = Math.max(0, opts?.trimStart ?? 0.004)
  const rate = opts?.playbackRate ?? 1
  const maxDur = buffer.duration - trim
  const dur = Math.min(opts?.duration ?? maxDur, maxDur)

  const src = ac.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate

  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(gain, when + 0.006)
  g.gain.setValueAtTime(gain, when + dur - 0.02)
  g.gain.linearRampToValueAtTime(0.0001, when + dur)

  src.connect(g)
  g.connect(getDestination(ac))
  src.start(when, trim, dur)
}

async function playSampleOrHtml(
  id: UiSampleId,
  slice: { gain?: number; trimStart?: number; duration?: number; playbackRate?: number },
): Promise<void> {
  const ac = await getReadyAudioContext()
  if (!ac) {
    playHtmlOneShot(id)
    return
  }
  let buf = await loadBuffer(id)
  if (!buf) {
    playHtmlOneShot(id)
    return
  }
  const t = ac.currentTime
  playBufferSlice(ac, buf, t, slice)
}

export async function playTapSample(): Promise<void> {
  await playSampleOrHtml('tap', { gain: 0.95, trimStart: 0.002, duration: 0.09 })
}

/** Checkbox / counter tick — shorter than full tap. */
export async function playTapMicro(): Promise<void> {
  await playSampleOrHtml('tap', { gain: 0.72, trimStart: 0.002, duration: 0.042 })
}

/** Nav / transition — one soft dry tap (no noise sweep). */
export async function playWhooshTap(): Promise<void> {
  await playSampleOrHtml('tap', { gain: 0.52, trimStart: 0.001, duration: 0.1 })
}

export async function playSuccessSample(): Promise<void> {
  await playSampleOrHtml('success', { gain: 0.88, trimStart: 0.004, duration: 0.45 })
}

export async function playPopSample(rate = 1): Promise<void> {
  await playSampleOrHtml('pop', { gain: 0.82, trimStart: 0.002, duration: 0.2, playbackRate: rate })
}

export async function playNotifySample(): Promise<void> {
  await playSampleOrHtml('notify', { gain: 0.55, trimStart: 0.01, duration: 0.35 })
}

/** Double tap using tap sample twice (satisfaction / stage). */
export async function playDoubleTapSample(): Promise<void> {
  const ac = await getReadyAudioContext()
  if (!ac) {
    playHtmlOneShot('tap', 0.7)
    window.setTimeout(() => playHtmlOneShot('tap', 0.65), 45)
    return
  }
  const buf = await loadBuffer('tap')
  if (!buf) {
    playHtmlOneShot('tap', 0.7)
    window.setTimeout(() => playHtmlOneShot('tap', 0.65), 45)
    return
  }
  await resumeAudioContext(ac)
  const t = ac.currentTime
  playBufferSlice(ac, buf, t, { gain: 0.85, trimStart: 0.002, duration: 0.07 })
  playBufferSlice(ac, buf, t + 0.045, { gain: 0.8, trimStart: 0.002, duration: 0.07 })
}

export async function playPaymentLayeredSample(): Promise<void> {
  const ac = await getReadyAudioContext()
  if (!ac) {
    playHtmlOneShot('tap', 0.55)
    window.setTimeout(() => playHtmlOneShot('success', 0.75), 28)
    return
  }
  const tapBuf = await loadBuffer('tap')
  const okBuf = await loadBuffer('success')
  if (!tapBuf || !okBuf) {
    playHtmlOneShot('tap', 0.55)
    window.setTimeout(() => playHtmlOneShot('success', 0.75), 28)
    return
  }
  const t = ac.currentTime
  playBufferSlice(ac, tapBuf, t, { gain: 0.42, trimStart: 0.003, duration: 0.06, playbackRate: 1.05 })
  playBufferSlice(ac, okBuf, t + 0.03, { gain: 0.72, trimStart: 0.006, duration: 0.38 })
}
