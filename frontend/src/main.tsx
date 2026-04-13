import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from '@/App'
import { ThemeAndFeedbackProvider } from '@/components/providers/ThemeAndFeedbackProvider'
import { AppErrorBoundary } from '@/components/routing/AppErrorBoundary'
import { initPerformanceProfile, isLowEndDevice } from '@/lib/device-performance'
import { primeAudioContextSync } from '@/lib/ui-sounds'
import './index.css'

initPerformanceProfile()

/** First pointer unlocks Web Audio (autoplay policy). */
if (typeof window !== 'undefined') {
  const unlock = () => {
    primeAudioContextSync()
    window.removeEventListener('touchstart', unlock, true)
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('click', unlock, true)
  }
  window.addEventListener('touchstart', unlock, { passive: true, capture: true })
  window.addEventListener('pointerdown', unlock, { passive: true, capture: true })
  window.addEventListener('click', unlock, { passive: true, capture: true })
}

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
