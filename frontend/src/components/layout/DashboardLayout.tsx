import { type CSSProperties, type FormEvent, type UIEvent, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { DashboardHeader } from '@/components/layout/DashboardHeader'
import { DashboardMobileTabBar } from '@/components/layout/DashboardMobileTabBar'
import { DashboardSidebar } from '@/components/layout/DashboardSidebar'
import { DashboardOutletErrorBoundary } from '@/components/routing/DashboardOutletErrorBoundary'
import { filterDashboardNav, resolveItemLabel } from '@/config/dashboard-nav'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useEnrollmentApprovalsAlertBanner } from '@/hooks/use-enrollment-approvals-alert'
import { useEnrollmentApprovalsPendingQuery } from '@/hooks/use-team-query'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { useRealtimeInvalidation } from '@/hooks/use-realtime-invalidation'
import { useSyncRoleFromMe } from '@/hooks/use-sync-role-from-me'
import { cn } from '@/lib/utils'
import { authLogout } from '@/lib/auth-api'
import { notifyDashboardMainScrolled } from '@/lib/main-scroll-gate'
import { useAuthStore } from '@/stores/auth-store'
import { useShellPreviewStore } from '@/stores/shell-preview-store'
import { useShellStore } from '@/stores/shell-store'
import { useUiFeedbackStore } from '@/stores/ui-feedback-store'

function isEditableElement(node: Element | null): boolean {
  if (!(node instanceof HTMLElement)) return false
  return node.isContentEditable || node.matches('input, textarea, select, [contenteditable="true"]')
}

export function DashboardLayout() {
  useSyncRoleFromMe()
  useRealtimeInvalidation(true)
  const location = useLocation()
  const { data: me } = useAuthMeQuery()
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
  const enrollmentPending = useEnrollmentApprovalsPendingQuery()
  const pendingEnrollCount = enrollmentPending.data?.total ?? 0
  const approverForEnroll =
    Boolean(me?.authenticated) && me?.role === 'admin'
  const enrollmentAlert = useEnrollmentApprovalsAlertBanner(pendingEnrollCount, {
    enabled: approverForEnroll,
  })
  const push = usePushNotifications()
  const showPushPrompt =
    Boolean(me?.authenticated) &&
    push.isSupported &&
    !push.isSubscribed &&
    push.permission !== 'denied'
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
  const onTrainingRoute =
    location.pathname === '/dashboard/system/training' ||
    location.pathname.startsWith('/dashboard/system/training/') ||
    location.pathname === '/dashboard/other/training' ||
    location.pathname.startsWith('/dashboard/other/training/')

  const sections = useMemo(() => {
    if (shellRole == null) return []
    const full = filterDashboardNav(shellRole)
    if (!trainingLocked) return full
    const flat = full.flatMap((s) => s.items)
    const tr = flat.find((i) => i.path === 'system/training')
    return tr ? [{ id: 'training-only', label: '', items: [tr] }] : full
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

  if (trainingLocked && !onTrainingRoute) {
    return <Navigate to="/dashboard/system/training" replace />
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

        {enrollmentAlert.open && approverForEnroll ? (
          <div
            role="status"
            className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-50"
          >
            <p className="min-w-0 text-sm text-amber-950 dark:text-amber-50">
              <span className="font-semibold">New Min. FLP approval request</span>
              {enrollmentAlert.delta === 1
                ? ' — 1 FLP invoice needs review.'
                : ` — ${enrollmentAlert.delta} FLP invoices need review.`}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/dashboard/team/enrollment-approvals"
                className="text-sm font-semibold text-amber-950 underline underline-offset-2 dark:text-amber-50"
                onClick={() => enrollmentAlert.dismiss()}
              >
                Open queue
              </Link>
              <button
                type="button"
                className="rounded-md p-1 text-amber-950/80 transition hover:bg-amber-500/20 dark:text-amber-100/90"
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
            className="flex shrink-0 items-center gap-3 border-b border-red-600/40 bg-red-600/10 px-3 py-3 dark:border-red-500/30 dark:bg-red-500/10"
          >
            <span className="shrink-0 text-lg" aria-hidden>⚠️</span>
            <p className="min-w-0 flex-1 text-sm text-red-900 dark:text-red-100">
              <span className="font-bold">Final Warning — You will be removed tomorrow.</span>
              {me.compliance_summary ? ` ${me.compliance_summary}` : ' You have not met your daily targets for 3 days in a row. Complete today\'s calls and daily report before midnight to avoid removal.'}
            </p>
          </div>
        ) : me?.compliance_level === 'strong_warning' ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex shrink-0 items-center gap-3 border-b border-orange-500/40 bg-orange-500/10 px-3 py-2.5 dark:border-orange-400/30 dark:bg-orange-400/10"
          >
            <span className="shrink-0 text-base" aria-hidden>⚠️</span>
            <p className="min-w-0 flex-1 text-sm text-orange-900 dark:text-orange-100">
              <span className="font-semibold">Strong Warning.</span>
              {me.compliance_summary ? ` ${me.compliance_summary}` : ' 2 days of missed targets. One more day and you will receive a final warning.'}
            </p>
          </div>
        ) : null}

        {showPushPrompt ? (
          <div
            role="status"
            className="flex shrink-0 items-center justify-between gap-3 border-b border-blue-500/30 bg-blue-500/10 px-3 py-2.5 dark:border-blue-400/25 dark:bg-blue-400/10"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Bell className="size-4 shrink-0 text-blue-700 dark:text-blue-300" aria-hidden />
              <p className="min-w-0 text-sm text-blue-900 dark:text-blue-100">
                <span className="font-semibold">Enable notifications</span>
                {' — '}
                {push.requiresStandaloneInstall
                  ? push.supportMessage
                  : 'Get reminders for daily targets, reports, and compliance alerts.'}
              </p>
            </div>
            {!push.requiresStandaloneInstall ? (
              <button
                type="button"
                onClick={() => void push.subscribe()}
                disabled={push.isLoading}
                className="shrink-0 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                {push.isLoading ? 'Enabling…' : 'Enable'}
              </button>
            ) : null}
          </div>
        ) : null}

        <main
          className={cn(
            'content-dashboard-main relative min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden bg-background p-4 md:p-6 lg:p-8',
            'scroll-ios',
          )}
          onScroll={handleMainScroll}
        >
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
          <div className="fixed left-2 top-[60px] z-[120] rounded-md border border-amber-300/60 bg-black/80 px-2 py-1 text-[10px] leading-tight text-amber-200 md:hidden">
            <div>inner:{viewportDebug.innerH} vv:{viewportDebug.vvH} client:{viewportDebug.clientH}</div>
            <div>shell:{viewportDebug.shellH} main:{viewportDebug.mainH} nav:{viewportDebug.navH}</div>
            <div>gap:{viewportDebug.navBottomGap} safeB:{viewportDebug.safeBottom} kb:{keyboardInset}</div>
          </div>
        ) : null}
        {shellProbe && androidShellProbe ? (
          <div
            className={cn(
              'fixed right-2 top-[60px] z-[120] rounded-md border px-2 py-1 text-[10px] leading-tight md:hidden',
              androidShellProbe.navBottomGap > 0
                ? 'border-rose-300/70 bg-rose-950/85 text-rose-100'
                : 'border-emerald-300/70 bg-emerald-950/85 text-emerald-100',
            )}
          >
            <div>Android shell probe</div>
            <div>inner:{androidShellProbe.innerH} shell:{androidShellProbe.shellH}</div>
            <div>nav:{androidShellProbe.navH} gap:{androidShellProbe.navBottomGap}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
