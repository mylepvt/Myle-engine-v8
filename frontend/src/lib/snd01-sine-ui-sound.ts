import SndImport from 'snd-lib'

import { isLowEndDevice } from '@/lib/device-performance'

type SndConstructor = typeof import('snd-lib').default
type SndInstance = InstanceType<SndConstructor>

/** CJS `module.exports` interop: production bundle may expose `{ default: Snd }` instead of `Snd`. */
function resolveSndConstructor(): SndConstructor {
  const mod: unknown = SndImport
  if (typeof mod === 'function') return mod as SndConstructor
  const d = mod && typeof (mod as { default: unknown }).default === 'function'
    ? (mod as { default: SndConstructor }).default
    : null
  if (d) return d
  throw new Error('snd-lib: Snd constructor not found (check default export interop)')
}

let _snd: SndInstance | null = null
let _loadPromise: Promise<void> | null = null

/** Clears cached client + load promise (Vitest only; safe no-op pattern for callers). */
export function resetSnd01SineUiSoundStateForTests(): void {
  _snd = null
  _loadPromise = null
}

function getSnd(): SndInstance {
  if (!_snd) {
    const Snd = resolveSndConstructor()
    _snd = new Snd({ muteOnWindowBlur: true, easySetup: false })
  }
  return _snd
}

/**
 * Gate for optional micro-sounds: skip on low-end heuristics and when the user
 * asks for reduced motion (many teams treat decorative audio the same way).
 */
export function shouldEnableSnd01SineUiSound(): boolean {
  if (typeof window === 'undefined') return false
  if (isLowEndDevice()) return false
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (mq.matches) return false
  return true
}

/**
 * Preloads the SND01 ("sine") kit (snd.dev kit 01). Safe to call multiple times.
 */
export function preloadSnd01SineKit(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (!shouldEnableSnd01SineUiSound()) return Promise.resolve()
  if (_loadPromise) return _loadPromise

  _loadPromise = getSnd()
    .load(resolveSndConstructor().KITS.SND01)
    .then(() => undefined)
    .catch((err) => {
      _loadPromise = null
      throw err
    })

  return _loadPromise
}

/**
 * Best-effort tap from the SND01 sine kit. Never throws to callers.
 */
export function playSnd01SineTap(): void {
  if (!shouldEnableSnd01SineUiSound()) return
  void preloadSnd01SineKit()
    .then(() => {
      getSnd().playTap()
    })
    .catch(() => {
      /* ignore: network / autoplay policy */
    })
}
