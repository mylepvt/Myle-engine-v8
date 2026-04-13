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
import {
  delayUiSound,
  UI_SOUND_DELAY_MS,
  UI_SOUND_THROTTLE_MS,
} from '@/lib/ui-sound-config'
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
 * Theme + **opt-in** UI feedback: only elements with `data-ui-sound` play audio/haptics
 * (no sound on every bare `<button>`). Timing follows `ui-sound-config` delays.
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

    const handler = async (e: MouseEvent) => {
      primeAudioContextSync()
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
        interactive.closest('[data-ui-sound]')?.getAttribute('data-ui-sound')

      if (!raw || raw === 'none') return

      await unlockUiAudioFromUserGesture()

      try {
        switch (raw) {
          case 'success':
            await delayUiSound(UI_SOUND_DELAY_MS.success)
            if (soundEnabled) await playUiSuccessSound()
            if (hapticsEnabled) hapticSuccess()
            useUiFeedbackStore.getState().addSatisfactionPoints(5)
            break

          case 'stage':
            await delayUiSound(UI_SOUND_DELAY_MS.stage)
            if (soundEnabled) await playUiStageAdvanceSound()
            if (hapticsEnabled) hapticImpact()
            useUiFeedbackStore.getState().addSatisfactionPoints(10)
            break

          case 'satisfaction':
            await delayUiSound(UI_SOUND_DELAY_MS.satisfaction)
            if (soundEnabled) await playUiSatisfactionSound()
            if (hapticsEnabled) hapticTapMedium()
            useUiFeedbackStore.getState().addSatisfactionPoints(2)
            break

          case 'coin':
            await delayUiSound(UI_SOUND_DELAY_MS.payment)
            if (soundEnabled) await playUiPaymentCashSound()
            if (hapticsEnabled) hapticCoin()
            useUiFeedbackStore.getState().addSatisfactionPoints(15)
            break

          case 'levelup':
            await delayUiSound(UI_SOUND_DELAY_MS.success)
            if (soundEnabled) await playUiLevelUpSound()
            if (hapticsEnabled) hapticSuccessStrong()
            useUiFeedbackStore.getState().addSatisfactionPoints(50)
            break

          case 'whoosh':
            await delayUiSound(UI_SOUND_DELAY_MS.nav)
            if (soundEnabled) await playUiWhooshSound()
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
            await delayUiSound(UI_SOUND_DELAY_MS.notification)
            if (soundEnabled) await playUiNotificationSound()
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
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [soundEnabled, hapticsEnabled])

  return <>{children}</>
}
