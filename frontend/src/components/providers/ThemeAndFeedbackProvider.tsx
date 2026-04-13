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
  playUiClickSound,
  playUiPaymentCashSound,
  playUiDeleteSound,
  playUiErrorSound,
  playUiLevelUpSound,
  playUiNotificationSound,
  playUiSatisfactionSound,
  playUiStageAdvanceSound,
  playUiStreakSound,
  playUiSuccessSound,
  playUiTickSound,
  playUiWarningSound,
  playUiWhooshSound,
  primeAudioContextSync,
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
 * Global UI feedback provider.
 *
 * Sound dispatch via `data-ui-sound` attribute on any interactive element:
 *
 *   data-ui-sound="click"        — default button tap
 *   data-ui-sound="success"      — save / create confirmed
 *   data-ui-sound="stage"        — pipeline status advance
 *   data-ui-sound="satisfaction" — gamified reward tap
 *   data-ui-sound="coin"         — wallet / points credited
 *   data-ui-sound="levelup"      — milestone / achievement
 *   data-ui-sound="whoosh"       — navigation / page transition
 *   data-ui-sound="tick"         — counter increment / typing
 *   data-ui-sound="delete"       — remove / delete action
 *   data-ui-sound="error"        — validation / reject
 *   data-ui-sound="warning"      — caution action
 *   data-ui-sound="notification" — incoming alert ping
 *   data-ui-sound="streak"       — auto-played based on streak count
 *   data-ui-sound="none"         — explicitly silent
 *   data-ui-silent (attribute)   — silence entire subtree
 */
export function ThemeAndFeedbackProvider({ children }: { children: ReactNode }) {
  const theme = useUiFeedbackStore((s) => s.theme)
  const soundEnabled = useUiFeedbackStore((s) => s.soundEnabled)
  const hapticsEnabled = useUiFeedbackStore((s) => s.hapticsEnabled)

  const lastSoundAt = useRef(0)

  // ── Theme application ─────────────────────────────────────────────────────
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

  // ── Sound + haptic dispatch ───────────────────────────────────────────────
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

      // Throttle: max one sound per 120 ms (allows faster clicking without stacking)
      const now = Date.now()
      if (now - lastSoundAt.current < 120) return
      lastSoundAt.current = now

      const raw =
        interactive.getAttribute('data-ui-sound') ??
        interactive.closest('[data-ui-sound]')?.getAttribute('data-ui-sound') ??
        'click'

      if (raw === 'none') return

      // Increment streak for every non-silent interaction (used by explicit `streak` only)
      const streak = useUiFeedbackStore.getState().incrementStreak()

      try {
        switch (raw) {
          case 'success':
            if (soundEnabled) await playUiSuccessSound()
            if (hapticsEnabled) hapticSuccess()
            useUiFeedbackStore.getState().addSatisfactionPoints(5)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'stage':
            if (soundEnabled) await playUiStageAdvanceSound()
            if (hapticsEnabled) hapticImpact()
            useUiFeedbackStore.getState().addSatisfactionPoints(10)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'satisfaction':
            if (soundEnabled) await playUiSatisfactionSound()
            if (hapticsEnabled) hapticTapMedium()
            useUiFeedbackStore.getState().addSatisfactionPoints(2)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'coin':
            if (soundEnabled) await playUiPaymentCashSound()
            if (hapticsEnabled) hapticCoin()
            useUiFeedbackStore.getState().addSatisfactionPoints(15)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'levelup':
            if (soundEnabled) await playUiLevelUpSound()
            if (hapticsEnabled) hapticSuccessStrong()
            useUiFeedbackStore.getState().addSatisfactionPoints(50)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'whoosh':
            if (soundEnabled) await playUiWhooshSound()
            if (hapticsEnabled) hapticTapLight()
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
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
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'error':
            if (soundEnabled) await playUiErrorSound()
            if (hapticsEnabled) hapticError()
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'warning':
            if (soundEnabled) await playUiWarningSound()
            if (hapticsEnabled) hapticWarning()
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'notification':
            if (soundEnabled) await playUiNotificationSound()
            if (hapticsEnabled) hapticNotification()
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          case 'streak':
            if (soundEnabled) await playUiStreakSound(streak)
            if (hapticsEnabled) hapticStreak(streak)
            useUiFeedbackStore.getState().addSatisfactionPoints(streak)
            await iosNoVibrateAudioFallback(hapticsEnabled, soundEnabled, playUiTickSound)
            break

          default: {
            // Default nav / buttons: always soft tap — no streak escalation on sidebar
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
