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

  const updateVh = () => {
    const vv = window.visualViewport
    const vh = Math.round((vv?.height ?? window.innerHeight))
    document.documentElement.style.setProperty('--app-vh', `${vh}px`)
  }

  updateVh()
  window.addEventListener('resize', updateVh, { passive: true })
  window.addEventListener('orientationchange', updateVh, { passive: true })
  window.visualViewport?.addEventListener('resize', updateVh, { passive: true })
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
