import { type ReactNode, useEffect } from 'react'

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
  meta.setAttribute('content', theme === 'transparent' || isDark ? '#000000' : '#eef2ff')
}

function applyThemeClasses(theme: ThemePreference) {
  const isDark = resolveDark(theme)
  const root = document.documentElement
  root.classList.toggle('dark', isDark)
  root.classList.toggle('theme-transparent', theme === 'transparent' && isDark)
  root.dataset.theme = theme
  applyThemeColorMeta(theme, isDark)
}

export function ThemeAndFeedbackProvider({ children }: { children: ReactNode }) {
  const theme = useUiFeedbackStore((s) => s.theme)

  useEffect(() => {
    applyThemeClasses(theme)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (useUiFeedbackStore.getState().theme !== 'system') return
      applyThemeClasses('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return <>{children}</>
}
