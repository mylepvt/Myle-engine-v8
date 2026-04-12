import { type ReactNode, useEffect, useRef } from 'react'

import { playUiSatisfactionSound } from '@/lib/ui-sounds'
import { useUiFeedbackStore, type ThemePreference } from '@/stores/ui-feedback-store'

function resolveDark(theme: ThemePreference): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeColorMeta(isDark: boolean) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  meta.setAttribute('content', isDark ? '#252525' : '#fafafa')
}

export function ThemeAndFeedbackProvider({ children }: { children: ReactNode }) {
  const theme = useUiFeedbackStore((s) => s.theme)
  const soundEnabled = useUiFeedbackStore((s) => s.soundEnabled)

  const lastSoundAt = useRef(0)

  useEffect(() => {
    const isDark = resolveDark(theme)
    document.documentElement.classList.toggle('dark', isDark)
    applyThemeColorMeta(isDark)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const t = useUiFeedbackStore.getState().theme
      if (t !== 'system') return
      const dark = mq.matches
      document.documentElement.classList.toggle('dark', dark)
      applyThemeColorMeta(dark)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!soundEnabled) return

    const handler = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-ui-silent]')) return

      const interactive = target.closest(
        'button, a[href], [role="button"], [role="tab"], [role="menuitem"], input[type="submit"], input[type="checkbox"], input[type="radio"], summary',
      )
      if (!interactive) return

      const now = Date.now()
      if (now - lastSoundAt.current < 160) return
      lastSoundAt.current = now

      void (async () => {
        await playUiSatisfactionSound()
        useUiFeedbackStore.getState().addSatisfactionPoints(1)
      })()
    }

    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [soundEnabled])

  return <>{children}</>
}
