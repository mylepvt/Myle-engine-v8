import { type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ClipboardCheck, Home, Menu, PanelLeftClose, Search, Settings } from 'lucide-react'

import { ShellHeaderFeedbackControls } from '@/components/layout/ShellHeaderFeedbackControls'
import { Button } from '@/components/ui/button'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useEnrollmentApprovalsPendingQuery } from '@/hooks/use-team-query'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import { useShellPreviewStore } from '@/stores/shell-preview-store'
import { apiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { roleShortLabel, type Role } from '@/types/role'

type Props = {
  isMobile: boolean
  isMainScrolled: boolean
  sidebarOpen: boolean
  mobileMenuOpen: boolean
  toggleSidebar: () => void
  setMobileMenuOpen: (v: boolean) => void
  headerSearch: string
  setHeaderSearch: (v: string) => void
  onSubmitSearch: (e: FormEvent) => void
  currentPageLabel: string
  trainingLocked: boolean
  displayInitial: string
}

export function DashboardHeader({
  isMobile,
  isMainScrolled,
  sidebarOpen,
  mobileMenuOpen,
  toggleSidebar,
  setMobileMenuOpen,
  headerSearch,
  setHeaderSearch,
  onSubmitSearch,
  currentPageLabel,
  trainingLocked,
  displayInitial,
}: Props) {
  const { role: shellRole, serverRole, isPending: rolePending, isAdminPreviewing } = useDashboardShellRole()
  const viewAsRole = useShellPreviewStore((s) => s.viewAsRole)
  const setViewAsRole = useShellPreviewStore((s) => s.setViewAsRole)
  const { data: me } = useAuthMeQuery()
  const { unread: noticeBoardUnread } = useNoticeBoardUnread()
  const enrollmentPending = useEnrollmentApprovalsPendingQuery()
  const pendingEnrollCount = enrollmentPending.data?.total ?? 0
  const push = usePushNotifications()
  const approverForEnroll =
    Boolean(me?.authenticated) && me?.role === 'admin'

  return (
    <header
      className={cn(
        'dashboard-shell-header relative z-20 flex h-[56px] shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 shadow-ios-bar md:gap-3 md:px-4 supports-[backdrop-filter]:bg-background/92 supports-[backdrop-filter]:backdrop-blur-md',
        isMainScrolled && 'dashboard-shell-header--scrolled',
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
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
                'h-10 min-w-[5.5rem] max-w-[9rem] shrink-0 rounded-lg border border-border bg-muted/40 py-0 pl-2 pr-7 text-ds-caption font-medium text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/30',
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
        onSubmit={onSubmitSearch}
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

      <div className="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
        <ShellHeaderFeedbackControls />
        <Link
          to="/dashboard/settings/profile"
          className="relative hidden size-10 items-center justify-center rounded-full transition-colors duration-200 hover:bg-muted active:opacity-80"
          aria-label="Settings"
        >
          <Settings className="size-[1.15rem] md:size-[1.25rem]" />
        </Link>
        {approverForEnroll && pendingEnrollCount > 0 ? (
          <div className="relative">
            <Link
              to="/dashboard/team/enrollment-approvals"
              className="relative flex size-10 items-center justify-center rounded-full transition-colors duration-200 hover:bg-muted active:opacity-80"
              aria-label={`Min. FLP approvals — ${pendingEnrollCount} pending`}
            >
              <ClipboardCheck className="size-[1.15rem] md:size-[1.25rem] text-emerald-400" />
            </Link>
            <span
              className="pointer-events-none absolute right-0.5 top-0.5 flex min-w-[1rem] items-center justify-center rounded-full bg-emerald-600 px-0.5 text-ds-label font-bold text-white shadow-[0_0_8px_rgba(22,163,74,0.55)]"
              aria-hidden
            >
              {pendingEnrollCount > 9 ? '9+' : pendingEnrollCount}
            </span>
          </div>
        ) : null}
        <div className="relative">
          <Link
            to="/dashboard/other/notice-board"
            className="relative flex size-10 items-center justify-center rounded-full transition-colors duration-200 hover:bg-muted active:opacity-80"
            aria-label={noticeBoardUnread > 0 ? `Notice board — ${noticeBoardUnread} new` : 'Notice board'}
          >
            <Bell className="size-[1.2rem] md:size-[1.35rem]" />
          </Link>
          {noticeBoardUnread > 0 ? (
            <span
              className="pointer-events-none absolute right-0.5 top-0.5 flex min-w-[1rem] items-center justify-center rounded-full bg-primary px-0.5 text-ds-label font-bold text-primary-foreground shadow-[0_0_8px_rgba(84,101,255,0.6)] animate-pulse"
              aria-hidden
            >
              {noticeBoardUnread > 9 ? '9+' : noticeBoardUnread}
            </span>
          ) : null}
        </div>

        {shellRole != null ? (
          <span
            className="hidden max-w-[10rem] truncate rounded-md border border-border bg-muted/35 px-2 py-1 text-center text-ds-caption font-medium text-foreground md:inline-flex"
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
          className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-ds-caption font-semibold text-foreground transition-opacity hover:opacity-90 active:opacity-80"
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
              alt={
                me.username
                  ? `Profile photo for ${me.username}`
                  : me.email
                    ? `Profile photo for ${me.email}`
                    : 'Your profile photo'
              }
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
  )
}


