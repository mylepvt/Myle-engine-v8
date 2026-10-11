import { type CSSProperties, type FormEvent, type UIEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, RefreshCw, WifiOff, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'

import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { DashboardMobileTabBar } from '@/components/layout/DashboardMobileTabBar'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { DashboardOutletErrorBoundary } from '@/components/routing/DashboardOutletErrorBoundary'
import { filterDashboardNav, resolveItemLabel } from '@/config/dashboard-nav'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useFlpMinBillingApprovalsAlertBanner } from '@/hooks/use-flp-min-billing-approvals-alert'
import { useFlpMinBillingApprovalsPendingQuery } from '@/hooks/use-team-query'
import { useOnline } from '@/hooks/use-online'
import { useAppUpdate } from '@/hooks/use-app-update'
import { PULL_TRIGGER_PX, usePullToRefresh } from '@/hooks/use-pull-to-refresh'
import { useRealtimeInvalidation } from '@/hooks/use-realtime-invalidation'
import { useWinsToaster } from '@/hooks/use-wins-toaster'
import { PushNotificationGate } from '@/components/notifications/PushNotificationGate'
import { useReportDeviceStatus } from '@/hooks/use-report-device-status'
import { InstallAppGate } from '@/components/pwa/InstallAppGate'
import { useSyncRoleFromMe } from '@/hooks/use-sync-role-from-me'
import { cn } from '@/lib/utils'
import { authLogout } from '@/lib/auth-api'
import { notifyDashboardMainScrolled } from '@/lib/main-scroll-gate'
import { useAuthStore } from '@/stores/auth-store'
import { useShellPreviewStore } from '@/stores/shell-preview-store'
import { useShellStore } from '@/stores/shell-store'
import { useUiFeedbackStore } from '@/stores/ui-feedback-store'
import { OnboardingTour } from '@/components/onboarding/OnboardingTour'
import { ONBOARDING_STEPS } from '@/lib/onboarding-steps'
import { useCompleteTutorialMutation } from '@/hooks/use-tutorial-query'

function isEditableElement(node: Element | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  return node.isContentEditable || node.matches('input, textarea, select, [contenteditable="true"]')
}

export function DashboardLayout() {
  useSyncRoleFromMe()
  useRealtimeInvalidation(true)
  useWinsToaster(true)
  const isOnline = useOnline()
  const queryClient = useQueryClient()
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null)
  const appUpdate = useAppUpdate()
  const checkAppUpdate = appUpdate.check
  const handlePullRefresh = useCallback(async () => {
    // A newer deploy wins over a data refetch: reload into the new build.
    if (await checkAppUpdate()) {
      window.location.reload()
      return
    }
    await queryClient.refetchQueries({ type: 'active' })
  }, [checkAppUpdate, queryClient])
  const pullToRefresh = usePullToRefresh(mainEl, handlePullRefresh)
  const location = useLocation()
  const { data: me } = useAuthMeQuery()
  // Team and leaders must install the app and turn notifications on; admins may skip.
  const mustSetUpApp = me?.authenticated === true && (me.role === 'team' || me.role === 'leader')
  // Report even while an install / notification screen is blocking, so the admin sees "Using browser".
  useReportDeviceStatus(me?.authenticated === true, false)
  const { role: shellRole } = useDashboardShellRole()
  const navigate = useNavigate()
  const {
    sidebarOpen,
    mobileMenuOpen,
    toggleSidebar,
    setMobileMenuOpen,
    syncForViewport,
  } = useShellStore(
    useShallow((s) => ({
      sidebarOpen: s.sidebarOpen,
      mobileMenuOpen: s.mobileMenuOpen,
      toggleSidebar: s.toggleSidebar,
      setMobileMenuOpen: s.setMobileMenuOpen,
      syncForViewport: s.syncForViewport,
    })),
  )
  const theme = useUiFeedbackStore((s) => s.theme)
  const logout = useAuthStore((s) => s.logout)
  const enrollmentPending = useFlpMinBillingApprovalsPendingQuery()
  const pendingEnrollCount = enrollmentPending.data?.total ?? 0
  const approverForEnroll =
    Boolean(me?.authenticated) && me?.role === 'admin'
  const enrollmentAlert = useFlpMinBillingApprovalsAlertBanner(pendingEnrollCount, {
    enabled: approverForEnroll,
  })
  const [headerSearch, setHeaderSearch] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [isMainScrolled, setIsMainScrolled] = useState(false)
  const [viewportDebug, setViewportDebug] = useState<{
    innerH: number; vvH: number; clientH: number
    shellH: number; mainH: number; navH: number
    navBottomGap: number; safeBottom: number
  } | null>(null)
  const [androidShellProbe, setAndroidShellProbe] = useState<{
    shellH: number; navH: number; navBottomGap: number; innerH: number
  } | null>(null)
  const debugViewport = new URLSearchParams(location.search).get('debugViewport') === '1'
  const shellProbe = new URLSearchParams(location.search).get('shellProbe') === '1'
  const shellStyle = useMemo(
    () => ({ '--keyboard-inset-height': `${keyboardInset}px` }) as CSSProperties,
    [keyboardInset],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      syncForViewport(mobile)
    }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [syncForViewport])

  useEffect(() => {
    if (!isMobile) return
    setMobileMenuOpen(false)
  }, [theme, isMobile, setMobileMenuOpen])

  useEffect(() => {
    if (!isMobile) {
      setKeyboardInset(0)
      setKeyboardOpen(false)
      return
    }
    const syncKeyboardState = () => {
      const vv = window.visualViewport
      if (!vv) { setKeyboardInset(0); setKeyboardOpen(false); return }
      const rawInset = Math.round(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
      const active = document.activeElement
      const editing = isEditableElement(active)
      const keyboardLikelyOpen = rawInset > 56 || (editing && window.innerHeight - vv.height > 40)
      setKeyboardInset(keyboardLikelyOpen ? rawInset : 0)
      setKeyboardOpen(keyboardLikelyOpen && rawInset > 0)
    }
    const onFocusIn = () => window.setTimeout(syncKeyboardState, 0)
    const onFocusOut = () => window.setTimeout(syncKeyboardState, 36)
    syncKeyboardState()
    window.addEventListener('resize', syncKeyboardState, { passive: true })
    window.visualViewport?.addEventListener('resize', syncKeyboardState, { passive: true })
    window.visualViewport?.addEventListener('scroll', syncKeyboardState, { passive: true })
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    return () => {
      window.removeEventListener('resize', syncKeyboardState)
      window.visualViewport?.removeEventListener('resize', syncKeyboardState)
      window.visualViewport?.removeEventListener('scroll', syncKeyboardState)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
    }
  }, [isMobile])

  useEffect(() => {
    if (keyboardOpen) setMobileMenuOpen(false)
  }, [keyboardOpen, setMobileMenuOpen])

  useEffect(() => {
    setIsMainScrolled(false)
  }, [location.pathname])

  useEffect(() => {
    if (!debugViewport) { setViewportDebug(null); return }
    const readSafeInsetBottom = () => {
      const probe = document.createElement('div')
      probe.style.position = 'fixed'
      probe.style.bottom = '0'
      probe.style.left = '0'
      probe.style.paddingBottom = 'env(safe-area-inset-bottom)'
      probe.style.visibility = 'hidden'
      document.body.appendChild(probe)
      const px = parseFloat(window.getComputedStyle(probe).paddingBottom || '0')
      probe.remove()
      return Number.isFinite(px) ? Math.round(px) : 0
    }
    const collect = () => {
      const shell = document.querySelector('.dashboard-shell') as HTMLElement | null
      const main = document.querySelector('.content-dashboard-main') as HTMLElement | null
      const nav = document.querySelector('nav[aria-label="Main tabs"]') as HTMLElement | null
      const navBottomGap = nav ? Math.max(0, Math.round(window.innerHeight - nav.getBoundingClientRect().bottom)) : 0
      setViewportDebug({
        innerH: Math.round(window.innerHeight),
        vvH: Math.round(window.visualViewport?.height ?? 0),
        clientH: Math.round(document.documentElement.clientHeight),
        shellH: Math.round(shell?.getBoundingClientRect().height ?? 0),
        mainH: Math.round(main?.getBoundingClientRect().height ?? 0),
        navH: Math.round(nav?.getBoundingClientRect().height ?? 0),
        navBottomGap,
        safeBottom: readSafeInsetBottom(),
      })
    }
    collect()
    window.addEventListener('resize', collect, { passive: true })
    window.addEventListener('orientationchange', collect, { passive: true })
    window.visualViewport?.addEventListener('resize', collect, { passive: true })
    return () => {
      window.removeEventListener('resize', collect)
      window.removeEventListener('orientationchange', collect)
      window.visualViewport?.removeEventListener('resize', collect)
    }
  }, [debugViewport, location.pathname, location.search])

  useEffect(() => {
    if (!isMobile || !shellProbe) { setAndroidShellProbe(null); return }
    if (typeof navigator === 'undefined' || !/android/i.test(navigator.userAgent)) { setAndroidShellProbe(null); return }
    const collectProbe = () => {
      const shell = document.querySelector('.dashboard-shell') as HTMLElement | null
      const nav = document.querySelector('nav[aria-label="Main tabs"]') as HTMLElement | null
      const navBottomGap = nav ? Math.max(0, Math.round(window.innerHeight - nav.getBoundingClientRect().bottom)) : 0
      setAndroidShellProbe({
        shellH: Math.round(shell?.getBoundingClientRect().height ?? 0),
        navH: Math.round(nav?.getBoundingClientRect().height ?? 0),
        navBottomGap,
        innerH: Math.round(window.innerHeight),
      })
    }
    collectProbe()
    window.addEventListener('resize', collectProbe, { passive: true })
    window.visualViewport?.addEventListener('resize', collectProbe, { passive: true })
    return () => {
      window.removeEventListener('resize', collectProbe)
      window.visualViewport?.removeEventListener('resize', collectProbe)
    }
  }, [isMobile, location.pathname, shellProbe])

  function submitHeaderSearch(e: FormEvent) {
    e.preventDefault()
    const q = headerSearch.trim()
    navigate(q ? `/dashboard/work/leads?q=${encodeURIComponent(q)}` : '/dashboard/work/leads')
  }

  function handleMainScroll(e: UIEvent<HTMLElement>) {
    notifyDashboardMainScrolled()
    setIsMainScrolled(e.currentTarget.scrollTop > 8)
  }

  const trainingStatusLc = (me?.training_status ?? '').toLowerCase()
  const trainingLocked = me?.training_required === true && trainingStatusLc !== 'completed'
  const showTutorial = me?.tutorial_pending === true && trainingStatusLc === 'completed'

  const onTrainingRoute =
    location.pathname === '/dashboard/system/training' ||
    location.pathname.startsWith('/dashboard/system/training/')

  const sections = useMemo(() => {
    if (shellRole == null) return []
    const capped = filterDashboardNav(shellRole)
    if (!trainingLocked) return capped
    const flat = capped.flatMap((s) => s.items)
    const tr = flat.find((i) => i.path === 'system/training')
    return tr ? [{ id: 'training-only', label: '', items: [tr] }] : capped
  }, [shellRole, trainingLocked])

  const currentPageLabel = useMemo(() => {
    const rel = location.pathname.replace('/dashboard/', '')
    const all = sections.flatMap((s) => s.items)
    const hit = all.find((item) => {
      if (item.path === '') return location.pathname === '/dashboard'
      return rel === item.path || rel.startsWith(`${item.path}/`)
    })
    return hit ? resolveItemLabel(hit, shellRole ?? 'team') : 'Dashboard'
  }, [location.pathname, sections, shellRole])

  const completeTutorial = useCompleteTutorialMutation()

  if (trainingLocked && !onTrainingRoute) {
    return <Navigate to="/dashboard/system/training" replace />
  }

  if (showTutorial && completeTutorial.isIdle) {
    return (
      <>
        <div className="dashboard-shell flex min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden bg-background">
          <div className="flex h-full min-w-0 max-w-full flex-1 flex-col overflow-hidden">
            <main data-tour="dashboard" className="content-dashboard-main relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-4 md:p-6 lg:p-8">
              <Outlet />
            </main>
          </div>
        </div>
        <OnboardingTour steps={ONBOARDING_STEPS} onNext={() => {}} onSkip={() => completeTutorial.mutate()} onDone={() => completeTutorial.mutate()} />
      </>
    )
  }

  const displayInitial =
    me?.fbo_id?.[0]?.toUpperCase() ??
    me?.username?.[0]?.toUpperCase() ??
    me?.email?.[0]?.toUpperCase() ??
    me?.role?.[0]?.toUpperCase() ??
    shellRole?.[0]?.toUpperCase() ??
    '?'

  async function handleLogout() {
    try { await authLogout() } catch { /* still clear local session */ }
    useShellPreviewStore.getState().setViewAsRole(null)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <InstallAppGate allowSkip={!mustSetUpApp}>
    <PushNotificationGate allowSkip={!mustSetUpApp}>
    <div
      className="dashboard-shell flex min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden bg-background"
      style={shellStyle}
    >
      {isMobile && mobileMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-all duration-300 md:hidden"
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <DashboardSidebar
        sections={sections}
        sidebarOpen={sidebarOpen}
        mobileMenuOpen={mobileMenuOpen}
        isMobile={isMobile}
        setMobileMenuOpen={setMobileMenuOpen}
        pendingEnrollCount={pendingEnrollCount}
        onLogout={handleLogout}
      />

      <div className="flex h-full min-w-0 max-w-full flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        <DashboardHeader
          isMobile={isMobile}
          isMainScrolled={isMainScrolled}
          sidebarOpen={sidebarOpen}
          mobileMenuOpen={mobileMenuOpen}
          toggleSidebar={toggleSidebar}
          setMobileMenuOpen={setMobileMenuOpen}
          headerSearch={headerSearch}
          setHeaderSearch={setHeaderSearch}
          onSubmitSearch={submitHeaderSearch}
          currentPageLabel={currentPageLabel}
          trainingLocked={trainingLocked}
          displayInitial={displayInitial}
        />

        <div className="max-h-[132px] space-y-0 overflow-y-auto">
        {enrollmentAlert.open && approverForEnroll ? (
          <div
            role="status"
            className="flex shrink-0 items-center justify-between gap-3 border-b border-warning/35 bg-warning/10 px-3 py-2.5 text-warning-ink"
          >
            <p className="min-w-0 text-sm text-warning-ink">
              <span className="font-semibold">New Min. FLP approval request</span>
              {enrollmentAlert.delta === 1
                ? ' — 1 FLP invoice needs review.'
                : ` — ${enrollmentAlert.delta} FLP invoices need review.`}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/dashboard/team/flp-min-billing"
                className="text-sm font-semibold text-warning-ink underline underline-offset-2"
                onClick={() => enrollmentAlert.dismiss()}
              >
                Open queue
              </Link>
              <button
                type="button"
                className="rounded-md p-2 text-warning-ink transition hover:bg-warning/20"
                aria-label="Dismiss"
                onClick={() => enrollmentAlert.dismiss()}
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        {me?.compliance_level === 'final_warning' ? (
          <div
            role="alert"
            aria-live="assertive"
            className="flex shrink-0 items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-3 py-3"
          >
            <AlertTriangle className="size-5 shrink-0 text-destructive-ink" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-destructive-ink">
              <span className="font-bold">Final Warning — You will be removed tomorrow.</span>
              {me.compliance_summary ? ` ${me.compliance_summary}` : ' You have not met your daily targets for 3 days in a row. Complete today\'s calls and daily report before midnight to avoid removal.'}
            </p>
          </div>
        ) : me?.compliance_level === 'strong_warning' ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex shrink-0 items-center gap-3 border-b border-warning/40 bg-warning/10 px-3 py-2.5"
          >
            <AlertTriangle className="size-4 shrink-0 text-warning-ink" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-warning-ink">
              <span className="font-semibold">Strong Warning.</span>
              {me.compliance_summary ? ` ${me.compliance_summary}` : ' 2 days of missed targets. One more day and you will receive a final warning.'}
            </p>
          </div>
        ) : null}

        {appUpdate.updateAvailable ? (
          <div
            role="status"
            aria-live="polite"
            className="flex shrink-0 items-center gap-2.5 border-b border-primary/30 bg-primary/10 px-3 py-2"
          >
            <RefreshCw className="size-3.5 shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1 text-xs text-foreground">
              <span className="font-semibold">New version of Myle is ready.</span>
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
            >
              Update
            </button>
          </div>
        ) : null}

        {!isOnline ? (
          <div
            role="status"
            aria-live="polite"
            className="flex shrink-0 items-center gap-2.5 border-b border-border/30 bg-muted/10 px-3 py-2"
          >
            <WifiOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 text-xs text-foreground">
              <span className="font-semibold">You&apos;re offline</span>
              {' — '}
              viewing cached data. Changes will sync when connected.
            </p>
          </div>
        ) : null}

        </div>

        <main
          ref={setMainEl}
          data-tour="dashboard"
          className={cn(
            'content-dashboard-main relative min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden bg-background p-4 md:p-6 lg:p-8',
            'scroll-ios',
          )}
          onScroll={handleMainScroll}
        >
          {pullToRefresh.pull > 0 ? (
            <div
              aria-hidden={!pullToRefresh.refreshing}
              role={pullToRefresh.refreshing ? 'status' : undefined}
              aria-label={pullToRefresh.refreshing ? 'Refreshing' : undefined}
              className={cn(
                'flex items-end justify-center overflow-hidden',
                !pullToRefresh.refreshing && pullToRefresh.pull === 0 && 'transition-[height]',
              )}
              style={{ height: pullToRefresh.pull }}
            >
              <span className="mb-2 flex size-8 items-center justify-center rounded-full border border-border bg-card shadow-sm">
                <RefreshCw
                  className={cn('size-4 text-primary', pullToRefresh.refreshing && 'animate-spin')}
                  style={
                    pullToRefresh.refreshing
                      ? undefined
                      : { transform: `rotate(${Math.round((pullToRefresh.pull / PULL_TRIGGER_PX) * 270)}deg)` }
                  }
                />
              </span>
            </div>
          ) : null}
          <DashboardOutletErrorBoundary>
            <Outlet />
          </DashboardOutletErrorBoundary>
        </main>

        {shellRole != null ? (
          <DashboardMobileTabBar
            role={shellRole}
            trainingLocked={trainingLocked}
            onOpenMenu={() => setMobileMenuOpen(true)}
            keyboardOpen={keyboardOpen}
            scrolled={isMainScrolled}
          />
        ) : null}
        {debugViewport && viewportDebug ? (
          <div className="fixed left-2 top-[60px] z-[120] rounded-md border border-warning/60 bg-black/80 px-2 py-1 text-ds-micro leading-tight text-warning-ink md:hidden">
            <div>inner:{viewportDebug.innerH} vv:{viewportDebug.vvH} client:{viewportDebug.clientH}</div>
            <div>shell:{viewportDebug.shellH} main:{viewportDebug.mainH} nav:{viewportDebug.navH}</div>
            <div>gap:{viewportDebug.navBottomGap} safeB:{viewportDebug.safeBottom} kb:{keyboardInset}</div>
          </div>
        ) : null}
        {shellProbe && androidShellProbe ? (
          <div
            className={cn(
              'fixed right-2 top-[60px] z-[120] rounded-md border px-2 py-1 text-ds-micro leading-tight md:hidden',
              androidShellProbe.navBottomGap > 0
                ? 'border-destructive/70 bg-destructive/85 text-destructive-ink'
                : 'border-success/70 bg-success/85 text-success-ink',
            )}
          >
            <div>Android shell probe</div>
            <div>inner:{androidShellProbe.innerH} shell:{androidShellProbe.shellH}</div>
            <div>nav:{androidShellProbe.navH} gap:{androidShellProbe.navBottomGap}</div>
          </div>
        ) : null}
      </div>
    </div>
    </PushNotificationGate>
    </InstallAppGate>
  )
}
