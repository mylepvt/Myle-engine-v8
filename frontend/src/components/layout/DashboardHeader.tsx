import { Link } from 'react-router-dom'
import { Bell, ChevronLeft, Search, Settings } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
import { NotificationsBell } from '@/components/layout/NotificationsBell'
import { ShellHeaderFeedbackControls } from '@/components/layout/ShellHeaderFeedbackControls'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useGoBack } from '@/hooks/use-go-back'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'
import { useShellPreviewStore } from '@/stores/shell-preview-store'
import { cn } from '@/lib/utils'
import type { Role } from '@/types/role'

type Props = {
  title: string
  subtitle?: string
  /** Where the back chevron goes when there is no in-app history; omitted on a tab's own root screen. */
  backTo?: string
  trainingLocked: boolean
}

const iconButton =
  'press relative flex size-10 items-center justify-center text-primary transition-opacity hover:opacity-80'

/** Back to the previous screen, or to the tab's root when the page was opened directly. */
function BackButton({ fallback }: { fallback: string }) {
  const goBack = useGoBack(fallback)
  return (
    <button type="button" onClick={goBack} className={iconButton} aria-label="Back">
      <ChevronLeft className="size-6" strokeWidth={1.6} />
    </button>
  )
}

/** Flat title bar: back on the left, centred title + subtitle, outline icons on the right. */
export function DashboardHeader({ title, subtitle, backTo, trainingLocked }: Props) {
  const { serverRole } = useDashboardShellRole()
  const viewAsRole = useShellPreviewStore((s) => s.viewAsRole)
  const setViewAsRole = useShellPreviewStore((s) => s.setViewAsRole)
  const { data: me } = useAuthMeQuery()
  const { unread: noticeBoardUnread } = useNoticeBoardUnread()
  const isAdmin = Boolean(me?.authenticated) && me?.role === 'admin'

  return (
    <header className="jw-header relative z-20 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
      <div className="flex min-w-0 items-center gap-1">
        {backTo ? <BackButton fallback={backTo} /> : null}
        {serverRole === 'admin' ? (
          <>
            <label htmlFor="header-view-as" className="sr-only">
              Preview dashboard as role
            </label>
            <NativeSelect
              id="header-view-as"
              className="h-8 min-w-[4.5rem] max-w-[7rem] shrink-0 bg-muted py-0 pl-2 pr-6 text-ds-caption font-medium text-foreground"
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

      <div className="min-w-0 max-w-[52vw] text-center">
        <h1 className="truncate text-ds-body font-semibold leading-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="truncate text-ds-caption leading-tight text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center justify-end">
        <div className="hidden md:flex">
          <ShellHeaderFeedbackControls />
        </div>
        {!trainingLocked ? (
          <Link to="/dashboard/work/leads" className={cn(iconButton, 'max-[359px]:hidden')} aria-label="Search leads">
            <Search className="size-5" strokeWidth={1.6} />
          </Link>
        ) : null}
        {isAdmin ? (
          <NotificationsBell />
        ) : (
          <Link
            to="/dashboard/other/notice-board"
            className={iconButton}
            aria-label={noticeBoardUnread > 0 ? `Notice board — ${noticeBoardUnread} new` : 'Notice board'}
          >
            <Bell className="size-5" strokeWidth={1.6} />
            {noticeBoardUnread > 0 ? (
              <span
                className="pointer-events-none absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center bg-destructive px-1 text-ds-micro font-bold leading-4 text-white"
                aria-hidden
              >
                {noticeBoardUnread > 9 ? '9+' : noticeBoardUnread}
              </span>
            ) : null}
          </Link>
        )}
        <Link to="/dashboard/settings/profile" className={iconButton} aria-label="Settings">
          <Settings className="size-5" strokeWidth={1.6} />
        </Link>
      </div>
    </header>
  )
}
