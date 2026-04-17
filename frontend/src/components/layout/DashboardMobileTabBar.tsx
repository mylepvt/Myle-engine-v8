import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'

import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import { useNoticeBoardUnread } from '@/hooks/use-notice-board-unread'
import {
  DASHBOARD_ROUTE_DEFS,
  type DashboardRouteDef,
  resolveTitleForPath,
  routeDefAccessible,
} from '@/config/dashboard-registry'
import { cn } from '@/lib/utils'
import type { Role } from '@/types/role'

const TAB_ORDER = ['', 'work/leads', 'work/workboard'] as const

/** Short labels for tab bar (iOS-style compact). */
const SHORT_LABEL: Record<string, string> = {
  '': 'Home',
  'work/leads': 'Calls',
  'work/workboard': 'Board',
  'work/follow-ups': 'Tasks',
}

type Props = {
  role: Role
  /** Legacy-style gate: only Training until completed */
  trainingLocked?: boolean
  onOpenMenu: () => void
}

function defForPath(path: string) {
  return DASHBOARD_ROUTE_DEFS.find((d) => d.path === path)
}

function fourthTabDef(role: Role): DashboardRouteDef | undefined {
  const followUps = defForPath('work/follow-ups')
  if (followUps && routeDefAccessible(followUps, role)) return followUps
  return undefined
}

export function DashboardMobileTabBar({
  role,
  trainingLocked = false,
  onOpenMenu,
}: Props) {
  const { unread: noticeBoardUnread } = useNoticeBoardUnread()

  if (trainingLocked) {
    const def = defForPath('system/training')
    if (!def || !routeDefAccessible(def, role)) return null
    const Icon = getDashboardNavIcon('system/training')
    const label =
      resolveTitleForPath('system/training', role) ?? def.label
    return (
      <nav
        className="shrink-0 border-t border-border/70 bg-background pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_20px_-14px_rgba(2,6,23,0.35)] md:hidden"
        role="navigation"
        aria-label="Training"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-2 pt-1.5">
          <NavLink
            to="/dashboard/system/training"
            className={({ isActive }) =>
              cn(
                'flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.65rem] font-medium leading-none transition-colors active:opacity-70',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'size-[22px] shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  aria-hidden
                />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.65rem] font-medium leading-none text-muted-foreground transition-colors active:opacity-70 hover:bg-muted/70 hover:text-foreground"
            aria-label="Open menu"
          >
            <MoreHorizontal className="size-[22px] shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">Menu</span>
          </button>
        </div>
      </nav>
    )
  }

  const fourth = fourthTabDef(role)
  const defs: DashboardRouteDef[] = [
    ...TAB_ORDER.map((p) => defForPath(p)).filter(
      (d): d is DashboardRouteDef => d != null,
    ),
    fourth,
  ].filter((d): d is DashboardRouteDef => d != null && routeDefAccessible(d, role))

  return (
    <nav
      className="shrink-0 border-t border-border/70 bg-background pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_20px_-14px_rgba(2,6,23,0.35)] md:hidden"
      role="navigation"
      aria-label="Main tabs"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-2 pt-1.5">
        {defs.map((def) => {
          const to = def.path === '' ? '/dashboard' : `/dashboard/${def.path}`
          const Icon = getDashboardNavIcon(def.path)
          const label =
            SHORT_LABEL[def.path] ??
            resolveTitleForPath(def.path, role) ??
            def.label
          return (
            <NavLink
              key={def.path || 'home'}
              to={to}
              end={def.end ?? false}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.65rem] font-medium leading-none transition-colors active:opacity-70',
                  isActive
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'size-[22px] shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground',
                    )}
                    strokeWidth={isActive ? 2.25 : 1.75}
                    aria-hidden
                  />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          )
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          className="flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[0.65rem] font-medium leading-none text-muted-foreground transition-colors active:opacity-70 hover:bg-muted/70 hover:text-foreground"
          aria-label={noticeBoardUnread > 0 ? `Open full menu — ${noticeBoardUnread} new notices` : 'Open full menu'}
        >
          <span className="relative">
            <MoreHorizontal className="size-[22px] shrink-0" strokeWidth={1.75} aria-hidden />
            {noticeBoardUnread > 0 ? (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.5rem] font-bold text-primary-foreground shadow-sm" aria-hidden>
                {noticeBoardUnread > 9 ? '9+' : noticeBoardUnread}
              </span>
            ) : null}
          </span>
          <span className="truncate">More</span>
        </button>
      </div>
    </nav>
  )
}
