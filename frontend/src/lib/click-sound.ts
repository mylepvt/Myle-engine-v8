/**
 * Sound system using Web Audio API + fetch/decodeAudioData.
 * Much more reliable than HTMLAudioElement on mobile (no autoplay issues).
 *
 * Sounds are loaded lazily on first user gesture, then cached in memory.
 * click.mp3  → buttons, tabs, links
 * tap.mp3    → checkbox, radio, select
 * success.mp3 → login, save success
 */

type SoundName = 'click' | 'tap' | 'success'

let ctx: AudioContext | null = null
const buffers = new Map<SoundName, AudioBuffer>()
let loading = false
let loaded = false

const VOLUMES: Record<SoundName, number> = {
  click: 0.4,
  tap: 0.35,
  success: 0.55,
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  try {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    return ctx
  } catch {
    return null
  }
}

async function loadAll(): Promise<void> {
  if (loaded || loading) return
  loading = true
  const ac = getCtx()
  if (!ac) { loading = false; return }

  const names: SoundName[] = ['click', 'tap', 'success']
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`/sounds/${name}.mp3`)
        const arr = await res.arrayBuffer()
        const buf = await ac.decodeAudioData(arr)
        buffers.set(name, buf)
      } catch {
        /* sound unavailable — silent fail */
      }
    })
  )
  loaded = true
  loading = false
}

// Kick off preload on first user gesture
let preloadStarted = false
export function primeAudio(): void {
  if (preloadStarted) return
  preloadStarted = true
  const ac = getCtx()
  if (!ac) return
  // Resume suspended context (required on mobile)
  if (ac.state === 'suspended') {
    void ac.resume().then(() => void loadAll())
  } else {
    void loadAll()
  }
}

function playBuffer(name: SoundName): void {
  const ac = getCtx()
  const buf = buffers.get(name)
  if (!ac || !buf) return
  if (ac.state === 'suspended') { void ac.resume(); return }

  const gain = ac.createGain()
  gain.gain.value = VOLUMES[name]
  gain.connect(ac.destination)

  const src = ac.createBufferSource()
  src.buffer = buf
  src.connect(gain)
  src.start()
}

/** Light click — buttons, tabs, links */
export function playClick(): void {
  playBuffer('click')
}

/** Tap — checkboxes, radios, selects */
export function playTap(): void {
  playBuffer('tap')
}

/** Success chime — login, saves */
export function playSuccess(): void {
  playBuffer('success')
}

// On desktop (non-touch), prime audio immediately — no gesture required
if (typeof window !== 'undefined' && !('ontouchstart' in window)) {
  setTimeout(() => primeAudio(), 100)
}
