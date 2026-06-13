import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'

import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { PushNotificationBootstrap } from '@/components/notifications/PushNotificationBootstrap'
import { InstallAppBanner } from '@/components/pwa/InstallAppBanner'
import { ProtectedRoute } from '@/components/routing/ProtectedRoute'
import { SkeletonPremium } from '@/components/ui/skeleton-premium'
import { DashboardHomePage } from '@/pages/DashboardHomePage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { BatchWatchPage } from '@/pages/BatchWatchPage'
import { ContentWatchPage } from '@/pages/ContentWatchPage'
import { Day2TestPage } from '@/pages/Day2TestPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { WatchPage } from '@/pages/WatchPage'
import { EnrollmentWatchPage } from '@/pages/EnrollmentWatchPage'
import { LivePremierePage } from '@/pages/LivePremierePage'
import { Day6LivePage } from '@/pages/Day6LivePage'
import { t } from '@/lib/i18n'

const DashboardNestedPage = lazy(async () => {
  const m = await import('@/pages/DashboardNestedPage')
  return { default: m.DashboardNestedPage }
})

function DashboardRouteFallback() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <SkeletonPremium className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <SkeletonPremium className="h-5 w-48" />
          <SkeletonPremium className="h-3 w-32" />
        </div>
      </div>
      <SkeletonPremium className="h-3 w-full max-w-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <SkeletonPremium className="h-28 w-full rounded-xl" />
        <SkeletonPremium className="h-28 w-full rounded-xl" />
        <SkeletonPremium className="h-28 w-full rounded-xl" />
      </div>
      <SkeletonPremium className="h-3 w-56 mt-4" />
      <SkeletonPremium className="h-20 w-full max-w-xl rounded-lg" />
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
          ? 'flex min-h-[100dvh] w-full min-w-0 flex-1 flex-col overflow-hidden'
          : 'flex min-h-[100dvh] w-full flex-col overflow-x-hidden overflow-y-visible'
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/watch/batch/:slot/:version" element={<BatchWatchPage />} />
        <Route path="/watch/content" element={<ContentWatchPage />} />
        <Route path="/watch/:token" element={<WatchPage />} />
        <Route path="/enroll/:token" element={<EnrollmentWatchPage />} />
        <Route path="/premiere" element={<LivePremierePage />} />
        <Route path="/watch/live/day6" element={<Day6LivePage />} />
        <Route path="/test/d2/:token" element={<Day2TestPage />} />

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
