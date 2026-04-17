import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import { App } from '@/App'
import { playClick, playTap, primeAudio } from '@/lib/click-sound'
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

document.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement
  // Prime AudioContext on first touch (required by browser autoplay policy)
  primeAudio()
  // Tap sound: checkbox, radio, select
  if (
    t.closest('input[type="checkbox"]') ||
    t.closest('input[type="radio"]') ||
    t.closest('select')
  ) {
    playTap()
    return
  }
  // Click sound: buttons, tabs, nav links, role=button
  if (
    t.closest('button') ||
    t.closest('a') ||
    t.closest('[role="button"]') ||
    t.closest('[role="tab"]')
  ) {
    playClick()
  }
}, { passive: true })

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
