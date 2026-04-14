import * as sndLibModule from 'snd-lib'
import type Snd from 'snd-lib'

type SndClass = typeof import('snd-lib').default

/**
 * `snd-lib` ships CJS `exports.default = …`; Vite/Rolldown can surface nested
 * `{ default: { default: Snd } }`, which breaks `new (import('snd-lib').default)()`.
 */
function resolveSndClass(): SndClass | null {
  const root = sndLibModule as unknown as Record<string, unknown>
  const d = root.default
  if (typeof d === 'function') return d as SndClass
  if (d && typeof d === 'object' && 'default' in d) {
    const inner = (d as { default: unknown }).default
    if (typeof inner === 'function') return inner as SndClass
  }
  return null
}

const SndCtor = resolveSndClass()

let snd: Snd | null = null
let kitLoad: Promise<void> | null = null

function getSnd(): Snd | null {
  if (typeof window === 'undefined' || !SndCtor) return null
  if (!snd) {
    snd = new SndCtor({
      easySetup: false,
      muteOnWindowBlur: true,
      preloadSoundKit: null,
    })
  }
  return snd
}

function ensureKit(s: Snd): Promise<void> {
  if (!SndCtor) return Promise.resolve()
  if (!kitLoad) {
    kitLoad = s.load(SndCtor.KITS.SND01).catch(() => {
      kitLoad = null
      throw new Error('ui-sound: kit load failed')
    })
  }
  return kitLoad
}

/** Start downloading / decoding the default kit early (safe to call on mount). */
export function preloadUiSounds(): void {
  const s = getSnd()
  if (!s) return
  void ensureKit(s).catch(() => {})
}

function playWhenReady(fn: (s: Snd) => void): void {
  const s = getSnd()
  if (!s) return
  void ensureKit(s)
    .then(() => {
      fn(s)
    })
    .catch(() => {})
}

export function playUiTap(): void {
  playWhenReady((s) => s.playTap())
}

export function playUiButton(): void {
  playWhenReady((s) => s.playButton())
}

export function playUiCelebration(): void {
  playWhenReady((s) => s.playCelebration())
}

export function playUiTransitionUp(): void {
  playWhenReady((s) => s.playTransitionUp())
}
