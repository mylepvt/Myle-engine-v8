import { type ReactNode, useEffect } from 'react'
import { Toaster } from 'sonner'

import { useUiFeedbackStore } from '@/stores/ui-feedback-store'

/** Android status bar / browser chrome colour — must equal --background in index.css. */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  dark: '#111214',
  light: '#e9edf4',
}

export function ThemeAndFeedbackProvider({ children }: { children: ReactNode }) {
  const theme = useUiFeedbackStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.remove('theme-transparent')
    root.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', THEME_COLOR[theme])
  }, [theme])

  return (
    <>
      {children}
      <Toaster
        richColors
        closeButton
        position="bottom-right"
        theme={theme}
        toastOptions={{
          duration: 4000,
        }}
      />
    </>
  )
}
