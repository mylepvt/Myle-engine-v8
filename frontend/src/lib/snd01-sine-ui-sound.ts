import Snd from 'snd-lib'

import { isLowEndDevice } from '@/lib/device-performance'

let _snd: Snd | null = null
let _loadPromise: Promise<void> | null = null

/** Clears cached client + load promise (Vitest only; safe no-op pattern for callers). */
export function resetSnd01SineUiSoundStateForTests(): void {
  _snd = null
  _loadPromise = null
}

function getSnd(): Snd {
  if (!_snd) {
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
    .load(Snd.KITS.SND01)
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
