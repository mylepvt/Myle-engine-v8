import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, LogOut, Menu, PanelLeftClose, Search, Settings } from 'lucide-react'

import { ShellHeaderFeedbackControls } from '@/components/layout/ShellHeaderFeedbackControls'
import { DashboardMobileTabBar } from '@/components/layout/DashboardMobileTabBar'
import { Button } from '@/components/ui/button'
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
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useShellStore()
  const logout = useAuthStore((s) => s.logout)
  const [headerSearch, setHeaderSearch] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false)
    }
  }, [setSidebarOpen])

  function submitHeaderSearch(e: FormEvent) {
    e.preventDefault()
    const q = headerSearch.trim()
    if (q) {
      navigate(`/dashboard/work/leads?q=${encodeURIComponent(q)}`)
    } else {
      navigate('/dashboard/work/leads')
    }
  }

  const navFlags = useMemo(
    () => ({ intelligence: meta?.features.intelligence ?? true }),
    [meta?.features.intelligence],
  )

  const trainingStatusLc = (me?.training_status ?? '').toLowerCase()
  const trainingLocked =
    me?.training_required === true && trainingStatusLc !== 'completed'
  const onTrainingRoute =
    location.pathname === '/dashboard/system/training' ||
    location.pathname.startsWith('/dashboard/system/training/')

  const sections = useMemo(() => {
    if (shellRole == null) return []
    const full = filterDashboardNav(shellRole, navFlags)
    if (!trainingLocked) return full
    const flat = full.flatMap((s) => s.items)
    const tr = flat.find((i) => i.path === 'system/training')
    if (tr) {
      return [{ id: 'training-only', label: '', items: [tr] }]
    }
    return full
  }, [shellRole, trainingLocked, navFlags])

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
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'flex min-h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width,transform] duration-300 ease-out',
          sidebarOpen ? 'md:w-[17rem]' : 'md:w-0 md:overflow-hidden md:border-0',
          'max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:h-dvh max-md:w-[min(19rem,88vw)] max-md:pt-[env(safe-area-inset-top)] max-md:shadow-[0_0_48px_rgba(0,0,0,0.65)]',
          sidebarOpen
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

        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 py-3 pb-2">
          {rolePending && shellRole == null ? (
            <div className="space-y-2 px-2" aria-busy="true" aria-label="Loading navigation">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-11 animate-pulse rounded-[0.625rem] bg-muted/60"
                />
              ))}
            </div>
          ) : null}
          {shellRole != null
            ? sections.map((section) => (
                <div key={section.id}>
                  {section.label ? (
                    <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold uppercase tracking-label-wide text-muted-foreground">
                      {section.label}
                    </p>
                  ) : null}
                  <ul
                    className={cn(
                      'flex flex-col overflow-hidden rounded-[0.625rem] border border-border/90 bg-card/40',
                      section.label ? '' : '',
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
                          className="border-b border-border/80 last:border-b-0"
                        >
                          <NavLink
                            to={to}
                            end={item.end ?? false}
                            onClick={() => {
                              if (window.matchMedia('(max-width: 767px)').matches) {
                                setSidebarOpen(false)
                              }
                            }}
                            className={({ isActive }) =>
                              cn(
                                'flex min-h-[44px] items-center gap-3 px-3 py-2.5 text-ds-body transition-colors active:opacity-80',
                                isActive
                                  ? 'bg-primary font-semibold text-primary-foreground'
                                  : 'text-foreground/90 hover:bg-muted/50',
                              )
                            }
                          >
                            {({ isActive }) => (
                              <>
                                <Icon
                                  className={cn(
                                    'size-[1.25rem] shrink-0',
                                    isActive ? 'text-primary-foreground' : 'text-muted-foreground',
                                  )}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1 truncate">{label}</span>
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
        <header className="relative z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 shadow-ios-bar backdrop-blur-md supports-[backdrop-filter]:bg-background/80 md:gap-3 md:px-3">
          {/* Left: menu + compact admin preview (no stacked label on small screens) */}
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <PanelLeftClose className="size-5" /> : <Menu className="size-5" />}
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

          {/* Right: tools — single row, no horizontal scroll strip on phone */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
            <ShellHeaderFeedbackControls />
            <Button variant="ghost" size="icon" className="size-9 shrink-0" asChild aria-label="Settings">
              <Link to="/dashboard/settings/profile">
                <Settings className="size-[1.15rem] md:size-[1.25rem]" aria-hidden />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="relative size-9 shrink-0" asChild aria-label="Notice board">
              <Link to="/dashboard/other/notice-board" title="Notice board & announcements">
                <Bell className="size-[1.2rem] md:size-[1.35rem]" aria-hidden />
                <span
                  className="pointer-events-none absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary ring-2 ring-background"
                  aria-hidden
                />
              </Link>
            </Button>

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
            flags={navFlags}
            trainingLocked={trainingLocked}
            onOpenMenu={() => setSidebarOpen(true)}
          />
        ) : null}
      </div>
    </div>
  )
}
