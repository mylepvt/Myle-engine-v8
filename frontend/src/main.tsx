import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from '@/App'
import { ThemeAndFeedbackProvider } from '@/components/providers/ThemeAndFeedbackProvider'
import { AppErrorBoundary } from '@/components/routing/AppErrorBoundary'
import { initPerformanceProfile, isLowEndDevice } from '@/lib/device-performance'
import './index.css'

initPerformanceProfile()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* non-fatal: PWA install hint only */
    })
  })
}

const low = isLowEndDevice()
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: low ? 90_000 : 30_000,
      gcTime: low ? 1_200_000 : 600_000,
      retry: low ? 0 : 1,
      refetchOnWindowFocus: !low,
      refetchOnReconnect: true,
    },
  },
})

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Missing #root — index.html must define <div id="root">')
}

function setupIosViewportLock() {
  if (typeof window === 'undefined') return
  const ua = navigator.userAgent
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
  if (!isIos) return
  if (typeof CSS !== 'undefined' && CSS.supports('height', '100lvh')) return

  const rootStyle = document.documentElement.style
  let lockedVh = 0

  const readStableVh = () => {
    const vv = window.visualViewport?.height ?? 0
    return Math.round(Math.max(window.innerHeight, vv))
  }

  const applyStableVh = () => {
    lockedVh = readStableVh()
    rootStyle.setProperty('--app-shell-vh', `${lockedVh}px`)
  }

  const refreshStableVh = () => {
    const active = document.activeElement
    const editing =
      active instanceof HTMLElement &&
      (active.isContentEditable ||
        active.matches('input, textarea, select, [contenteditable="true"]'))
    if (editing) return

    const next = readStableVh()
    if (next > lockedVh || Math.abs(next - lockedVh) >= 120) {
      lockedVh = next
      rootStyle.setProperty('--app-shell-vh', `${next}px`)
    }
  }

  applyStableVh()

  // Avoid tracking every visualViewport frame on iOS — it can desync taps from painted pixels.
  window.addEventListener('resize', refreshStableVh, { passive: true })
  window.addEventListener('pageshow', refreshStableVh, { passive: true })
  window.addEventListener(
    'orientationchange',
    () => {
      window.setTimeout(applyStableVh, 160)
    },
    { passive: true },
  )
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      window.setTimeout(refreshStableVh, 0)
    }
  })
}

setupIosViewportLock()

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeAndFeedbackProvider>
<App />
          </ThemeAndFeedbackProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
