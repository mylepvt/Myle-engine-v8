import { type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Home, Menu, PanelLeftClose, Search, Settings } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
import { NotificationsBell } from '@/components/layout/NotificationsBell'
import { ShellHeaderFeedbackControls } from '@/components/layout/ShellHeaderFeedbackControls'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/ui/status-dot'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'
import { useShellPreviewStore } from '@/stores/shell-preview-store'
import { apiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { roleShortLabel, type Role } from '@/types/role'

type Props = {
  isMobile: boolean
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
  const approverForEnroll =
    Boolean(me?.authenticated) && me?.role === 'admin'

  return (
    // A floating glass pill, detached from the screen edges; <main> scrolls underneath.
    <div className="pointer-events-none px-3 pt-2 sm:px-6">
    <header className="glass pointer-events-auto relative z-20 flex h-12 shrink-0 items-center gap-1 rounded-full px-1.5 min-[400px]:gap-2 sm:h-14 sm:px-2">
      {/* Left: toggle + role picker */}
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-foreground"
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
            <NativeSelect
              id="header-view-as"
              className={cn(
                'h-8 min-w-[5rem] max-w-[8rem] shrink-0 rounded-full bg-muted py-0 pl-3 pr-6 text-ds-caption font-medium text-foreground',
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
            </NativeSelect>
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
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          value={headerSearch}
          onChange={(e) => setHeaderSearch(e.target.value)}
          placeholder="Search leads"
          className="h-9 w-full rounded-full border border-transparent bg-muted pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/15 sm:h-10"
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

        {/* Hidden on narrow phones: the avatar opens the same page. */}
        <Link
          to="/dashboard/settings/profile"
          className="press max-[399px]:!hidden flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground max-md:size-9 [@media(pointer:coarse)]:size-11 max-md:[@media(pointer:coarse)]:size-10"
          aria-label="Settings"
        >
          <Settings className="size-[17px]" />
        </Link>

        {approverForEnroll ? (
          <NotificationsBell />
        ) : (
          <div className="relative">
            <Link
              to="/dashboard/other/notice-board"
              className="press relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground max-md:size-9 [@media(pointer:coarse)]:size-11 max-md:[@media(pointer:coarse)]:size-10"
              aria-label={noticeBoardUnread > 0 ? `Notice board — ${noticeBoardUnread} new` : 'Notice board'}
            >
              <Bell className="size-[17px]" />
            </Link>
            {noticeBoardUnread > 0 ? (
              <span
                className="pointer-events-none absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-ds-micro font-bold leading-4 text-white"
                aria-hidden
              >
                {noticeBoardUnread > 9 ? '9+' : noticeBoardUnread}
              </span>
            ) : null}
          </div>
        )}

        {shellRole != null ? (
          <span
            className="hidden h-7 items-center rounded-full bg-muted px-2.5 text-ds-caption font-medium text-foreground md:inline-flex"
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
          <span className="hidden h-7 w-12 animate-pulse rounded-full bg-muted md:inline-block" />
        ) : null}

        <Link
          to="/dashboard/settings/profile"
          className="press relative ml-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-ds-caption font-semibold text-accent-foreground max-md:ml-0.5 max-md:size-9"
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
              className="size-full rounded-full object-cover"
              width={44}
              height={44}
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
    </div>
  )
}
