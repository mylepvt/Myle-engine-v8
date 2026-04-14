import * as sndLibModule from 'snd-lib'
import type Snd from 'snd-lib'

import type { ButtonVariantProps } from '@/components/ui/button-variants'

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

export function playUiSwipe(): void {
  playWhenReady((s) => s.playSwipe())
}

export function playUiType(): void {
  playWhenReady((s) => s.playType())
}

export function playUiCaution(): void {
  playWhenReady((s) => s.playCaution())
}

export function playUiCelebration(): void {
  playWhenReady((s) => s.playCelebration())
}

export function playUiDisabled(): void {
  playWhenReady((s) => s.playDisabled())
}

export function playUiNotification(): void {
  playWhenReady((s) => s.playNotification())
}

export function playUiProgressLoop(): void {
  playWhenReady((s) => s.playProgressLoop({ loop: true }))
}

export function playUiRingtoneLoop(): void {
  playWhenReady((s) => s.playRingtoneLoop({ loop: true }))
}

export function playUiSelect(): void {
  playWhenReady((s) => s.playSelect())
}

export function playUiTransitionUp(): void {
  playWhenReady((s) => s.playTransitionUp())
}

export function playUiTransitionDown(): void {
  playWhenReady((s) => s.playTransitionDown())
}

export function playUiToggleOn(): void {
  playWhenReady((s) => s.playToggleOn())
}

export function playUiToggleOff(): void {
  playWhenReady((s) => s.playToggleOff())
}

export function stopUiProgressLoop(): void {
  const s = getSnd()
  if (!s || !SndCtor) return
  void ensureKit(s)
    .then(() => {
      s.stop(SndCtor.SOUNDS.PROGRESS_LOOP)
    })
    .catch(() => {})
}

export function stopUiRingtoneLoop(): void {
  const s = getSnd()
  if (!s || !SndCtor) return
  void ensureKit(s)
    .then(() => {
      s.stop(SndCtor.SOUNDS.RINGTONE_LOOP)
    })
    .catch(() => {})
}

/** Every `snd-lib` SOUNDS key mapped to a player (for buttons / explicit wiring). */
export const UI_SOUND_KINDS = [
  'tap',
  'button',
  'swipe',
  'type',
  'caution',
  'celebration',
  'disabled',
  'notification',
  'progress_loop',
  'ringtone_loop',
  'select',
  'transition_up',
  'transition_down',
  'toggle_on',
  'toggle_off',
] as const

export type UiSoundKind = (typeof UI_SOUND_KINDS)[number]

export function emitUiSound(kind: UiSoundKind): void {
  switch (kind) {
    case 'tap':
      playUiTap()
      break
    case 'button':
      playUiButton()
      break
    case 'swipe':
      playUiSwipe()
      break
    case 'type':
      playUiType()
      break
    case 'caution':
      playUiCaution()
      break
    case 'celebration':
      playUiCelebration()
      break
    case 'disabled':
      playUiDisabled()
      break
    case 'notification':
      playUiNotification()
      break
    case 'progress_loop':
      playUiProgressLoop()
      break
    case 'ringtone_loop':
      playUiRingtoneLoop()
      break
    case 'select':
      playUiSelect()
      break
    case 'transition_up':
      playUiTransitionUp()
      break
    case 'transition_down':
      playUiTransitionDown()
      break
    case 'toggle_on':
      playUiToggleOn()
      break
    case 'toggle_off':
      playUiToggleOff()
      break
  }
}

function isUiSoundKind(s: string): s is UiSoundKind {
  return (UI_SOUND_KINDS as readonly string[]).includes(s)
}

/** Pointer feedback for `<Button />` (and premium buttons): default `button` vs `tap` by variant. */
export function resolveButtonPointerSound(props: {
  variant?: ButtonVariantProps['variant']
  type?: string
  disabled?: boolean
  'data-ui-sound'?: string
  'data-ui-silent'?: unknown
}): UiSoundKind | null {
  if (props['data-ui-silent'] !== undefined && props['data-ui-silent'] !== false) {
    return null
  }
  const explicit = props['data-ui-sound']
  if (explicit === 'silent' || explicit === 'none') return null
  if (explicit && isUiSoundKind(explicit)) return explicit

  if (props.disabled) return null

  const t = props.type
  if (t === 'submit' || t === 'reset') return 'button'

  const v = props.variant ?? 'default'
  if (v === 'default') return 'button'
  return 'tap'
}
