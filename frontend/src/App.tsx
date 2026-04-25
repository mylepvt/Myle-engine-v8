import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'

import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { PushNotificationBootstrap } from '@/components/notifications/PushNotificationBootstrap'
import { InstallAppBanner } from '@/components/pwa/InstallAppBanner'
import { ProtectedRoute } from '@/components/routing/ProtectedRoute'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardHomePage } from '@/pages/DashboardHomePage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { BatchWatchPage } from '@/pages/BatchWatchPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { WatchPage } from '@/pages/WatchPage'
import { t } from '@/lib/i18n'

const DashboardNestedPage = lazy(async () => {
  const m = await import('@/pages/DashboardNestedPage')
  return { default: m.DashboardNestedPage }
})

function DashboardRouteFallback() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full max-w-2xl" />
    </div>
  )
}

export function App() {
  const location = useLocation()

  useEffect(() => {
    document.title = t('appTitle')
  }, [])

  const isDashboardRoute = location.pathname.startsWith('/dashboard')

  return (
    <div
      className={
        isDashboardRoute
          ? 'flex w-full min-h-0 flex-1 flex-col overflow-hidden'
          : 'flex min-h-screen w-full flex-col overflow-x-hidden overflow-y-visible'
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/watch/batch/:slot/:version" element={<BatchWatchPage />} />
        <Route path="/watch/:token" element={<WatchPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHomePage />} />
            <Route
              path="*"
              element={
                <Suspense fallback={<DashboardRouteFallback />}>
                  <DashboardNestedPage />
                </Suspense>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <PushNotificationBootstrap />
      <InstallAppBanner />
    </div>
  )
}
