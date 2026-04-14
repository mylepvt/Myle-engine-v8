import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, LogOut, Menu, PanelLeftClose, Search, Settings } from 'lucide-react'

import { ShellHeaderFeedbackControls } from '@/components/layout/ShellHeaderFeedbackControls'
import { DashboardMobileTabBar } from '@/components/layout/DashboardMobileTabBar'
import { Button } from '@/components/ui/button'
import { SidebarSkeleton } from '@/components/ui/skeleton-premium'
import { DashboardOutletErrorBoundary } from '@/components/routing/DashboardOutletErrorBoundary'
import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import { filterDashboardNav, resolveItemLabel } from '@/config/dashboard-nav'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useMetaQuery } from '@/hooks/use-meta-query'
import { useRealtimeInvalidation } from '@/hooks/use-realtime-invalidation'
import { useSyncRoleFromMe } from '@/hooks/use-sync-role-from-me'
import { MyleSidebarMark } from '@/components/brand/MyleSidebarMark'
import { cn } from '@/lib/utils'
import { authLogout } from '@/lib/auth-api'
import { apiUrl } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useShellPreviewStore } from '@/stores/shell-preview-store'
import { useShellStore } from '@/stores/shell-store'
import { useUiFeedbackStore } from '@/stores/ui-feedback-store'
import { roleShortLabel, type Role } from '@/types/role'

export function DashboardLayout() {
  useSyncRoleFromMe()
  useRealtimeInvalidation(true)
  const location = useLocation()
  const { data: meta } = useMetaQuery()
  const { data: me } = useAuthMeQuery()
  const {
    role: shellRole,
    serverRole,
    isPending: rolePending,
    isAdminPreviewing,
    setViewAsRole,
  } = useDashboardShellRole()
  const viewAsRole = useShellPreviewStore((s) => s.viewAsRole)
  const navigate = useNavigate()
  const {
    sidebarOpen,
    mobileMenuOpen,
    toggleSidebar,
    setMobileMenuOpen,
    syncForViewport,
  } = useShellStore()
  const theme = useUiFeedbackStore((s) => s.theme)
  const logout = useAuthStore((s) => s.logout)
  const [headerSearch, setHeaderSearch] = useState('')
  const [isMobile, setIsMobile] = useState(false)

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
    // Prevent "stuck overlay" reports after heavy global repaint (theme switch).
    setMobileMenuOpen(false)
  }, [theme, isMobile, setMobileMenuOpen])

  function submitHeaderSearch(e: FormEvent) {
    e.preventDefault()
    const q = headerSearch.trim()
    if (q) {
      navigate(`/dashboard/work/leads?q=${encodeURIComponent(q)}`)
    } else {
      navigate('/dashboard/work/leads')
    }
  }

  const trainingStatusLc = (me?.training_status ?? '').toLowerCase()
  const trainingLocked =
    me?.training_required === true && trainingStatusLc !== 'completed'
  const onTrainingRoute =
    location.pathname === '/dashboard/system/training' ||
    location.pathname.startsWith('/dashboard/system/training/')

  const sections = useMemo(() => {
    if (shellRole == null) return []
    const full = filterDashboardNav(shellRole)
    if (!trainingLocked) return full
    const flat = full.flatMap((s) => s.items)
    const tr = flat.find((i) => i.path === 'system/training')
    if (tr) {
      return [{ id: 'training-only', label: '', items: [tr] }]
    }
    return full
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
  const envLabel = meta?.environment

  const displayInitial =
    me?.fbo_id?.[0]?.toUpperCase() ??
    me?.username?.[0]?.toUpperCase() ??
    me?.email?.[0]?.toUpperCase() ??
    me?.role?.[0]?.toUpperCase() ??
    shellRole?.[0]?.toUpperCase() ??
    '?'

  async function handleLogout() {
    try {
      await authLogout()
    } catch {
      /* still clear local session */
    }
    useShellPreviewStore.getState().setViewAsRole(null)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-dvh w-full min-w-0 max-w-full overflow-x-hidden bg-background">
      {isMobile && mobileMenuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-all duration-300 md:hidden"
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'flex min-h-dvh shrink-0 flex-col border-r border-border/80 bg-surface/95 backdrop-blur-xl',
          'transition-[transform,width,border-color] duration-300 ease-out',
          sidebarOpen ? 'md:w-[18rem]' : 'md:w-0 md:overflow-hidden md:border-0',
          'max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:h-dvh max-md:w-[min(20rem,85vw)] max-md:pt-[env(safe-area-inset-top)]',
          'max-md:shadow-[0_0_60px_rgba(0,0,0,0.4)]',
          mobileMenuOpen
            ? 'max-md:translate-x-0'
            : 'max-md:pointer-events-none max-md:-translate-x-full',
        )}
      >
        <div className="flex h-[52px] shrink-0 items-center border-b border-border px-4">
          <Link to="/dashboard" className="min-w-0">
            <MyleSidebarMark />
          </Link>
          {envLabel && envLabel !== 'production' ? (
            <span
              className="ml-2 shrink-0 rounded-md border border-warning/45 bg-warning/12 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-warning"
              title="Server-reported environment (APP_ENV)"
            >
              {envLabel}
            </span>
          ) : null}
        </div>

        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3 py-4 pb-2">
          {rolePending && shellRole == null ? (
            <SidebarSkeleton />
          ) : null}
          {shellRole != null
            ? sections.map((section) => (
                <div key={section.id}>
                  {section.label ? (
                    <p className="mb-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">
                      {section.label}
                    </p>
                  ) : null}
                  <ul
                    className={cn(
                      'flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/30',
                      'shadow-sm',
                    )}
                  >
                    {section.items.map((item) => {
                      const to =
                        item.path === '' ? '/dashboard' : `/dashboard/${item.path}`
                      const label = resolveItemLabel(item, shellRole)
                      const Icon = getDashboardNavIcon(item.path)
                      return (
                        <li
                          key={item.path || 'index'}
                          className="border-b border-border/40 last:border-b-0"
                        >
                          <NavLink
                            to={to}
                            end={item.end ?? false}
                            onClick={() => {
                              if (isMobile) {
                                setMobileMenuOpen(false)
                              }
                            }}
                            className={({ isActive }) =>
                              cn(
                                'group flex min-h-[48px] items-center gap-3 px-4 py-3 text-sm font-medium',
                                'transition-[background-color,color,transform] duration-200 ease-out',
                                'active:scale-[0.98]',
                                isActive
                                  ? [
                                      'bg-gradient-to-r from-primary to-primary/90',
                                      'text-primary-foreground font-semibold',
                                      'shadow-lg shadow-primary/25',
                                      'relative overflow-hidden',
                                    ]
                                  : [
                                      'text-foreground/80 hover:text-foreground',
                                      'hover:bg-muted/60',
                                      'hover:translate-x-0.5',
                                    ],
                              )
                            }
                          >
                            {({ isActive }) => (
                              <>
                                <div
                                  className={cn(
                                    'flex items-center justify-center rounded-lg p-1.5 transition-[background-color,transform] duration-200',
                                    isActive
                                      ? 'bg-white/20'
                                      : 'bg-muted/50 group-hover:bg-muted'
                                  )}
                                >
                                  <Icon
                                    className={cn(
                                      'size-[1.1rem] shrink-0 transition-[color,transform] duration-200',
                                      isActive
                                        ? 'text-primary-foreground'
                                        : 'text-muted-foreground group-hover:text-foreground',
                                    )}
                                    aria-hidden
                                  />
                                </div>
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                                {isActive && (
                                  <span className="absolute inset-y-0 left-0 w-1 bg-white/50 rounded-r-full" />
                                )}
                              </>
                            )}
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            : null}
        </nav>

        <div className="mt-auto shrink-0 border-t border-border p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => void handleLogout()}
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </Button>
      </div>
    </aside>

    <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden pt-[env(safe-area-inset-top)]">
      <header className="relative z-20 flex h-[56px] shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-3 shadow-ios-bar backdrop-blur-xl supports-[backdrop-filter]:bg-background/85 md:gap-3 md:px-4">
        {/* Left: menu + compact admin preview (no stacked label on small screens) */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => {
              if (isMobile) {
                setMobileMenuOpen(!mobileMenuOpen)
              } else {
                toggleSidebar()
              }
            }}
            aria-label="Toggle sidebar"
          >
            {(isMobile ? mobileMenuOpen : sidebarOpen) ? (
              <PanelLeftClose className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </Button>

            {serverRole === 'admin' ? (
              <>
                <label htmlFor="header-view-as" className="sr-only">
                  Preview dashboard as role
                </label>
                <select
                  id="header-view-as"
                  className={cn(
                    'h-9 max-w-[6.25rem] shrink-0 truncate rounded-lg border border-border bg-muted/40 py-0 pl-2 pr-7 text-[0.7rem] font-medium text-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/30 md:max-w-[11rem] md:text-xs',
                  )}
                  value={viewAsRole ?? 'admin'}
                  title="UI preview only — your account stays admin"
                  onChange={(e) => {
                    const v = e.target.value as Role | 'admin'
                    setViewAsRole(v === 'admin' ? null : v)
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="leader">Leader</option>
                  <option value="team">Team</option>
                </select>
              </>
            ) : null}
          </div>

          <form
            className={cn(
              'relative mx-auto hidden min-w-0 max-w-xl flex-1 sm:block',
              trainingLocked && 'sm:hidden',
            )}
            onSubmit={submitHeaderSearch}
            role="search"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              name="q"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder="Search leads"
              className="h-9 w-full rounded-[0.625rem] border border-border bg-muted/50 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Search leads"
              autoComplete="off"
            />
          </form>
          <div className="hidden min-w-0 flex-1 sm:flex md:hidden">
            <p className="truncate text-sm font-semibold text-foreground">{currentPageLabel}</p>
          </div>

          {/* Right: tools — single row, no horizontal scroll strip on phone */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
            <ShellHeaderFeedbackControls />
            <Link
              to="/dashboard/settings/profile"
              className="hidden sm:flex relative size-10 items-center justify-center rounded-full transition-[background-color,transform] duration-200 hover:bg-muted hover:scale-105 active:scale-95"
              aria-label="Settings"
            >
              <Settings className="size-[1.15rem] md:size-[1.25rem]" />
            </Link>
            <div className="relative">
              <Link
                to="/dashboard/other/notice-board"
                className="relative flex size-10 items-center justify-center rounded-full transition-[background-color,transform] duration-200 hover:bg-muted hover:scale-105 active:scale-95"
                aria-label="Notice board"
              >
                <Bell className="size-[1.2rem] md:size-[1.35rem]" />
              </Link>
              <span
                className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-primary shadow-[0_0_8px_rgba(84,101,255,0.6)] animate-pulse"
                aria-hidden
              />
            </div>

            {shellRole != null ? (
              <span
                className="hidden max-w-[10rem] truncate rounded-md border border-border bg-muted/35 px-2 py-1 text-center text-[0.7rem] font-medium text-foreground md:inline-flex"
                title={
                  isAdminPreviewing && serverRole === 'admin'
                    ? `Nav as ${roleShortLabel(shellRole)} · signed in as Admin`
                    : 'Your role from the signed-in account'
                }
              >
                {isAdminPreviewing && serverRole === 'admin'
                  ? `${roleShortLabel(shellRole)} (view)`
                  : roleShortLabel(shellRole)}
              </span>
            ) : rolePending ? (
              <span className="hidden h-8 w-14 animate-pulse rounded-md bg-muted/60 md:inline-block" />
            ) : null}

            <Link
              to="/dashboard/settings/profile"
              className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-semibold text-foreground transition-opacity hover:opacity-90 active:opacity-80"
              title={
                me?.fbo_id
                  ? `${me.fbo_id}${me.username ? ` · ${me.username}` : ''}${me.email ? ` · ${me.email}` : ''}`
                  : (me?.email ?? shellRole ?? '')
              }
              aria-label="Open profile settings"
            >
              {me?.avatar_url ? (
                <img
                  src={apiUrl(me.avatar_url)}
                  alt=""
                  className="size-full object-cover"
                  width={36}
                  height={36}
                />
              ) : (
                displayInitial
              )}
            </Link>

            <Button variant="ghost" size="sm" asChild className="hidden lg:inline-flex">
              <Link to="/" className="gap-1.5 text-muted-foreground">
                <Home className="size-4" />
                Home
              </Link>
            </Button>
          </div>
        </header>

        <main
          className={cn(
            'relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-4 md:p-6 lg:p-8',
            'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-6 lg:pb-8',
          )}
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
          />
        ) : null}
      </div>
    </div>
  )
}
