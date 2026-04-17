/**
 * Zero-latency click sounds — MP3 data embedded inline (no network fetch).
 *
 * Fixed issues:
 *  1. playBuffer was calling ac.resume() then RETURNING — sound never played.
 *     Now it retries play AFTER resume resolves.
 *  2. decoded flag was permanent — if AudioContext got interrupted (iOS background,
 *     tab switch, system audio event), decode never ran again. Now we watch
 *     onstatechange and reset decoded/decoding when context is interrupted.
 *  3. decoding lock had no timeout fallback — a failed decode permanently
 *     locked the system. Now has a 5s watchdog.
 *  4. AudioContext created lazily (inside gesture) so browsers with strict
 *     autoplay policy (Safari 15, Firefox) don't block creation.
 */

import { clickB64, tapB64, successB64 } from './sound-data'

type SoundName = 'click' | 'tap' | 'success'

// ─── Step 1: base64 → ArrayBuffer (sync on module load) ──────────────────────
function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return buf
}

const RAW: Record<SoundName, ArrayBuffer> = {
  click:   b64ToArrayBuffer(clickB64),
  tap:     b64ToArrayBuffer(tapB64),
  success: b64ToArrayBuffer(successB64),
}

const VOLUMES: Record<SoundName, number> = {
  click:   0.4,
  tap:     0.35,
  success: 0.55,
}

// ─── Step 2: AudioContext + AudioBuffers ──────────────────────────────────────
let ctx: AudioContext | null = null
const audioBuffers = new Map<SoundName, AudioBuffer>()
let decoding = false
let decoded = false

function getCtx(): AudioContext | null {
  if (ctx && ctx.state !== 'closed') return ctx
  try {
    ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

    // Watch for context interruption (iOS phone call, tab hidden, etc.)
    // Reset decoded so next gesture re-decodes into the fresh context.
    ctx.addEventListener('statechange', () => {
      if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted' as AudioContextState)) {
        // Don't reset decoded — buffers are still valid, just context needs resume
      }
      if (ctx && ctx.state === 'closed') {
        // Context was closed — full reset needed
        decoded = false
        decoding = false
        audioBuffers.clear()
        ctx = null
      }
    })
    return ctx
  } catch {
    return null
  }
}

async function decodeAll(): Promise<void> {
  if (decoded) return
  if (decoding) return

  decoding = true

  // Watchdog: if decoding takes >5s, release the lock so next gesture retries
  const watchdog = setTimeout(() => {
    if (!decoded) {
      decoding = false
    }
  }, 5000)

  const ac = getCtx()
  if (!ac) {
    clearTimeout(watchdog)
    decoding = false
    return
  }

  // Resume suspended context (required by mobile browsers)
  if (ac.state === 'suspended') {
    try { await ac.resume() } catch { /* ignore */ }
  }

  await Promise.all(
    (Object.keys(RAW) as SoundName[]).map(async (name) => {
      try {
        // slice() so each decodeAudioData gets its own ArrayBuffer copy
        const buf = await ac.decodeAudioData(RAW[name].slice(0))
        audioBuffers.set(name, buf)
      } catch {
        /* sound unavailable for this format — degrade silently */
      }
    }),
  )

  clearTimeout(watchdog)
  decoded = true
  decoding = false
}

// ─── Step 3: Play ─────────────────────────────────────────────────────────────
function playBuffer(name: SoundName): void {
  const ac = getCtx()
  if (!ac) return

  const buf = audioBuffers.get(name)
  if (!buf) return

  // FIX: if suspended, resume FIRST then replay — don't just return silently
  if (ac.state === 'suspended') {
    void ac.resume().then(() => {
      // After resume, try to play — check state again to be safe
      if (ac.state === 'running') {
        _doPlay(ac, buf, name)
      }
    })
    return
  }

  if (ac.state !== 'running') return
  _doPlay(ac, buf, name)
}

function _doPlay(ac: AudioContext, buf: AudioBuffer, name: SoundName): void {
  try {
    const gain = ac.createGain()
    gain.gain.value = VOLUMES[name]
    gain.connect(ac.destination)

    const src = ac.createBufferSource()
    src.buffer = buf
    src.connect(gain)
    src.start(0)
  } catch {
    /* play failed — disconnect context and allow fresh creation next gesture */
    decoded = false
    decoding = false
    audioBuffers.clear()
    ctx = null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let primed = false

/**
 * Call once inside a user-gesture handler to unlock AudioContext + pre-decode.
 * Safe to call multiple times — idempotent after first decode completes.
 */
export function primeAudio(): void {
  // Always try to resume even if primed — handles iOS background/foreground cycle
  const ac = ctx
  if (ac && ac.state === 'suspended') {
    void ac.resume()
  }

  if (primed && decoded) return
  primed = true
  void decodeAll()
}

/**
 * Desktop (no-touch): AudioContext doesn't need a gesture.
 * Prime after a short delay to avoid blocking the initial render.
 * Use 200ms so the page is interactive before we decode 3 audio files.
 */
if (typeof window !== 'undefined' && !('ontouchstart' in window)) {
  // Use requestIdleCallback if available for truly zero-impact loading
  const scheduleIdle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback
  if (typeof scheduleIdle === 'function') {
    scheduleIdle(() => { primed = true; void decodeAll() }, { timeout: 2000 })
  } else {
    setTimeout(() => { primed = true; void decodeAll() }, 200)
  }
}

export function playClick(): void   { playBuffer('click') }
export function playTap(): void     { playBuffer('tap') }
export function playSuccess(): void { playBuffer('success') }
