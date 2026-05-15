import { type ReactNode, useEffect } from 'react'

export function ThemeAndFeedbackProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('dark')
    root.classList.remove('theme-transparent')
    root.dataset.theme = 'dark'
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', '#111214')
  }, [])

  return <>{children}</>
}
