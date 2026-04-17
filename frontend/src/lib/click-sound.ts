/**
 * Zero-latency click sounds — MP3 data embedded inline (no network fetch).
 *
 * Strategy:
 *  1. Base64 → ArrayBuffer decoded on module import (synchronous, instant)
 *  2. AudioContext created + ArrayBuffers decoded to AudioBuffers on first gesture
 *  3. Every subsequent play: createBufferSource().start() — <1ms latency
 *
 * On desktop: AudioContext auto-resumed after 100ms (no gesture needed).
 * On mobile: AudioContext resumed on first pointerdown gesture.
 */

import { clickB64, tapB64, successB64 } from './sound-data'

type SoundName = 'click' | 'tap' | 'success'

// ─── Step 1: base64 → ArrayBuffer (runs synchronously on module load) ──────
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

// ─── Step 2: AudioContext + AudioBuffers ─────────────────────────────────────
let ctx: AudioContext | null = null
const audioBuffers = new Map<SoundName, AudioBuffer>()
let decoding = false
let decoded = false

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  try {
    ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    return ctx
  } catch {
    return null
  }
}

async function decodeAll(): Promise<void> {
  if (decoded || decoding) return
  decoding = true
  const ac = getCtx()
  if (!ac) { decoding = false; return }

  // Resume suspended context (mobile requires user gesture first)
  if (ac.state === 'suspended') {
    try { await ac.resume() } catch { /* ignore */ }
  }

  await Promise.all(
    (Object.keys(RAW) as SoundName[]).map(async (name) => {
      try {
        // slice() so each decodeAudioData gets its own copy of the buffer
        const buf = await ac.decodeAudioData(RAW[name].slice(0))
        audioBuffers.set(name, buf)
      } catch { /* sound unavailable — degrade silently */ }
    }),
  )
  decoded = true
  decoding = false
}

// ─── Step 3: Play ─────────────────────────────────────────────────────────────
function playBuffer(name: SoundName): void {
  const ac = getCtx()
  const buf = audioBuffers.get(name)
  if (!ac || !buf) return
  if (ac.state === 'suspended') { void ac.resume(); return }

  const gain = ac.createGain()
  gain.gain.value = VOLUMES[name]
  gain.connect(ac.destination)

  const src = ac.createBufferSource()
  src.buffer = buf
  src.connect(gain)
  src.start(0)
}

// ─── Public API ───────────────────────────────────────────────────────────────

let primed = false

/** Call once inside a user-gesture handler to unlock AudioContext + pre-decode. */
export function primeAudio(): void {
  if (primed) return
  primed = true
  void decodeAll()
}

/** On desktop (no touch) prime immediately — AudioContext doesn't need a gesture. */
if (typeof window !== 'undefined' && !('ontouchstart' in window)) {
  setTimeout(() => { primed = true; void decodeAll() }, 50)
}

export function playClick(): void  { playBuffer('click') }
export function playTap(): void    { playBuffer('tap') }
export function playSuccess(): void { playBuffer('success') }
