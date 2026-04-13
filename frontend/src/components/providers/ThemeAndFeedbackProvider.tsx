import { type ReactNode, useEffect, useRef } from 'react'

import { iosNoVibrateAudioFallback } from '@/lib/haptic-audio-fallback'
import {
  hapticCoin,
  hapticDelete,
  hapticError,
  hapticImpact,
  hapticNotification,
  hapticSelection,
  hapticStreak,
  hapticSuccess,
  hapticSuccessStrong,
  hapticTapLight,
  hapticTapMedium,
  hapticWarning,
} from '@/lib/haptics'
import { UI_SOUND_DELAY_MS, UI_SOUND_THROTTLE_MS } from '@/lib/ui-sound-config'
import {
  playUiClickSound,
  playUiDeleteSound,
  playUiErrorSound,
  playUiLevelUpSound,
  playUiNotificationSound,
  playUiPaymentCashSound,
  playUiSatisfactionSound,
  playUiStageAdvanceSound,
  playUiStreakSound,
  playUiSuccessSound,
  playUiTickSound,
  playUiWarningSound,
  playUiWhooshSound,
  primeAudioContextSync,
  unlockUiAudioFromUserGesture,
} from '@/lib/ui-sounds'
import { preloadUiSoundSamples } from '@/lib/ui-sound-samples'
import { useUiFeedbackStore, type ThemePreference } from '@/stores/ui-feedback-store'

function sec(ms: number): number {
  return ms / 1000
}

function resolveDark(theme: ThemePreference): boolean {
  if (theme === 'transparent') return true
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeColorMeta(theme: ThemePreference, isDark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  meta.setAttribute('content', theme === 'transparent' || isDark ? '#050208' : '#e8ecf8')
}

/**
 * Theme + UI feedback. Default tap on interactive controls; override with `data-ui-sound`
 * or silence with `data-ui-sound="none"`. Delays use the **audio timeline** (not wall sleep
 * before resume) so sound still works after `await` in the handler.
 */
export function ThemeAndFeedbackProvider({ children }: { children: ReactNode }) {
  const theme = useUiFeedbackStore((s) => s.theme)
  const soundEnabled = useUiFeedbackStore((s) => s.soundEnabled)
  const hapticsEnabled = useUiFeedbackStore((s) => s.hapticsEnabled)

  const lastSoundAt = useRef(0)

  useEffect(() => {
    const isDark = resolveDark(theme)
    document.documentElement.classList.toggle('dark', isDark)
    document.documentElement.classList.toggle('theme-transparent', theme === 'transparent')
    applyThemeColorMeta(theme, isDark)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (useUiFeedbackStore.getState().theme !== 'system') return
      const dark = mq.matches
      document.documentElement.classList.toggle('dark', dark)
      applyThemeColorMeta('system', dark)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!soundEnabled) return
    void preloadUiSoundSamples()
  }, [soundEnabled])

  useEffect(() => {
    if (!soundEnabled && !hapticsEnabled) return

    /** Microtask deferral: keeps taps snappy vs one full rAF frame of latency. */
    const handler = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-ui-silent]')) return

      const interactive = target.closest(
        'button, a[href], [role="button"], [role="tab"], [role="menuitem"], ' +
          'input[type="submit"], input[type="checkbox"], input[type="radio"], ' +
          'summary, select, [role="switch"], [role="option"]',
      )
      if (!interactive) return

      const now = Date.now()
      if (now - lastSoundAt.current < UI_SOUND_THROTTLE_MS) return
      lastSoundAt.current = now

      const raw =
        interactive.getAttribute('data-ui-sound') ??
        interactive.closest('[data-ui-sound]')?.getAttribute('data-ui-sound') ??
        'click'

      if (raw === 'none') return

      primeAudioContextSync()

      void Promise.resolve().then(() => {
        void (async () => {
          await unlockUiAudioFromUserGesture()

          try {
            switch (raw) {
          case 'success':
            if (soundEnabled) await playUiSuccessSound({ delaySec: sec(UI_SOUND_DELAY_MS.success) })
            if (hapticsEnabled) hapticSuccess()
            useUiFeedbackStore.getState().addSatisfactionPoints(5)
            break

          case 'stage':
            if (soundEnabled) await playUiStageAdvanceSound({ delaySec: sec(UI_SOUND_DELAY_MS.stage) })
            if (hapticsEnabled) hapticImpact()
            useUiFeedbackStore.getState().addSatisfactionPoints(10)
            break

          case 'satisfaction':
            if (soundEnabled) await playUiSatisfactionSound({ delaySec: sec(UI_SOUND_DELAY_MS.satisfaction) })
            if (hapticsEnabled) hapticTapMedium()
            useUiFeedbackStore.getState().addSatisfactionPoints(2)
            break

          case 'coin':
            if (soundEnabled) await playUiPaymentCashSound({ delaySec: sec(UI_SOUND_DELAY_MS.payment) })
            if (hapticsEnabled) hapticCoin()
            useUiFeedbackStore.getState().addSatisfactionPoints(15)
            break

          case 'levelup':
            if (soundEnabled) await playUiLevelUpSound({ delaySec: sec(UI_SOUND_DELAY_MS.success) })
            if (hapticsEnabled) hapticSuccessStrong()
            useUiFeedbackStore.getState().addSatisfactionPoints(50)
            break

          case 'whoosh':
            if (soundEnabled) await playUiWhooshSound({ delaySec: sec(UI_SOUND_DELAY_MS.nav) })
            if (hapticsEnabled) hapticTapLight()
            break

          case 'tick':
            if (soundEnabled) await playUiTickSound()
            if (hapticsEnabled) hapticSelection()
            useUiFeedbackStore.getState().addSatisfactionPoints(1)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'delete':
            if (soundEnabled) await playUiDeleteSound()
            if (hapticsEnabled) hapticDelete()
            break

          case 'error':
            if (soundEnabled) await playUiErrorSound()
            if (hapticsEnabled) hapticError()
            break

          case 'warning':
            if (soundEnabled) await playUiWarningSound()
            if (hapticsEnabled) hapticWarning()
            break

          case 'notification':
            if (soundEnabled) await playUiNotificationSound({ delaySec: sec(UI_SOUND_DELAY_MS.notification) })
            if (hapticsEnabled) hapticNotification()
            break

          case 'streak': {
            const s = useUiFeedbackStore.getState().incrementStreak()
            if (soundEnabled) await playUiStreakSound(s)
            if (hapticsEnabled) hapticStreak(s)
            useUiFeedbackStore.getState().addSatisfactionPoints(s)
            break
          }

          case 'click': {
            if (soundEnabled) await playUiClickSound()
            if (hapticsEnabled) hapticTapLight()
            useUiFeedbackStore.getState().addSatisfactionPoints(1)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break
          }
            }
          } catch {
            /* ignore */
          }
        })()
      })
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [soundEnabled, hapticsEnabled])

  return <>{children}</>
}
