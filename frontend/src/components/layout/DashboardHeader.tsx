import { type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ClipboardCheck, Home, Menu, PanelLeftClose, Search, Settings } from 'lucide-react'

import { ShellHeaderFeedbackControls } from '@/components/layout/ShellHeaderFeedbackControls'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/status-dot'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useFlpMinBillingApprovalsPendingQuery } from '@/hooks/use-team-query'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'
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
  const enrollmentPending = useFlpMinBillingApprovalsPendingQuery()
  const pendingEnrollCount = enrollmentPending.data?.total ?? 0
  const approverForEnroll =
    Boolean(me?.authenticated) && me?.role === 'admin'

  return (
    <header
      className={cn(
        'dashboard-shell-header relative z-20 flex h-[48px] shrink-0 items-center gap-2 border-b border-border bg-background/96 px-3 md:px-4',
        'supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-sm',
        isMainScrolled && 'dashboard-shell-header--scrolled',
      )}
    >
      {/* Left: toggle + role picker */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => {
            if (isMobile) setMobileMenuOpen(!mobileMenuOpen)
            else toggleSidebar()
          }}
          aria-label="Toggle sidebar"
        >
          {(isMobile ? mobileMenuOpen : sidebarOpen) ? (
            <PanelLeftClose className="size-[18px]" />
          ) : (
            <Menu className="size-[18px]" />
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
                'h-8 min-w-[5rem] max-w-[8rem] shrink-0 rounded border border-border bg-muted/60 py-0 pl-2 pr-6 text-ds-caption font-medium text-foreground',
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

      {/* Center: search */}
      <form
        className={cn(
          'relative mx-auto hidden min-w-0 max-w-lg flex-1 sm:block',
          trainingLocked && 'sm:hidden',
        )}
        onSubmit={onSubmitSearch}
        role="search"
      >
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          value={headerSearch}
          onChange={(e) => setHeaderSearch(e.target.value)}
          placeholder="Search leads"
          className="h-8 w-full rounded border border-border bg-muted/50 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Search leads"
          autoComplete="off"
        />
      </form>

      {/* Mobile page label */}
      <div className="hidden min-w-0 flex-1 sm:flex md:hidden">
        <p className="truncate text-sm font-semibold text-foreground">{currentPageLabel}</p>
      </div>

      {/* Right: actions + avatar */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <ShellHeaderFeedbackControls />

        <Link
          to="/dashboard/settings/profile"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded transition-colors duration-100 text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground md:flex"
          aria-label="Settings"
        >
          <Settings className="size-[17px]" />
        </Link>

        {approverForEnroll && pendingEnrollCount > 0 ? (
          <div className="relative">
            <Link
              to="/dashboard/team/flp-min-billing"
              className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded transition-colors duration-100 text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground"
              aria-label={`Min. FLP approvals — ${pendingEnrollCount} pending`}
            >
              <ClipboardCheck className="size-[17px] text-success" />
            </Link>
            <span
              className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded bg-success px-1 text-[10px] font-bold leading-4 text-white"
              aria-hidden
            >
              {pendingEnrollCount > 9 ? '9+' : pendingEnrollCount}
            </span>
          </div>
        ) : null}

        <div className="relative">
          <Link
            to="/dashboard/other/notice-board"
            className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded transition-colors duration-100 text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground"
            aria-label={noticeBoardUnread > 0 ? `Notice board — ${noticeBoardUnread} new` : 'Notice board'}
          >
            <Bell className="size-[17px]" />
          </Link>
          {noticeBoardUnread > 0 ? (
            <span
              className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded bg-destructive px-1 text-[10px] font-bold leading-4 text-white"
              aria-hidden
            >
              {noticeBoardUnread > 9 ? '9+' : noticeBoardUnread}
            </span>
          ) : null}
        </div>

        {shellRole != null ? (
          <span
            className="hidden rounded border border-border bg-muted/40 px-2 py-0.5 text-ds-caption font-medium text-foreground md:inline-flex"
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
          <span className="hidden h-7 w-12 animate-pulse rounded bg-muted/60 md:inline-block" />
        ) : null}

        <Link
          to="/dashboard/settings/profile"
          className="relative ml-1 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-ds-caption font-semibold text-foreground transition-opacity hover:opacity-85 active:opacity-70"
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
              alt={me.username ? `Profile photo for ${me.username}` : me.email ? `Profile photo for ${me.email}` : 'Your profile photo'}
              className="size-8 object-cover"
              width={32}
              height={32}
            />
          ) : (
            displayInitial
          )}
          <StatusDot status="online" />
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
