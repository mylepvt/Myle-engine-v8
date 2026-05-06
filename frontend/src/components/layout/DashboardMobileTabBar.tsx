import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'

import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
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
  'team/members': 'Members',
}

type Props = {
  role: Role
  /** Legacy-style gate: only Training until completed */
  trainingLocked?: boolean
  onOpenMenu: () => void
  keyboardOpen?: boolean
  scrolled?: boolean
}

function defForPath(path: string) {
  return DASHBOARD_ROUTE_DEFS.find((d) => d.path === path)
}

function fourthTabDef(role: Role): DashboardRouteDef | undefined {
  if (role === 'admin') {
    const members = defForPath('team/members')
    if (members && routeDefAccessible(members, role)) return members
  }
  const followUps = defForPath('work/follow-ups')
  if (followUps && routeDefAccessible(followUps, role)) return followUps
  return undefined
}

export function DashboardMobileTabBar({
  role,
  trainingLocked = false,
  onOpenMenu,
  keyboardOpen = false,
  scrolled = false,
}: Props) {
  const barClass = cn(
    'dashboard-mobile-tabbar shrink-0 pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] md:hidden',
    keyboardOpen && 'dashboard-mobile-tabbar--keyboard-open',
    scrolled && 'dashboard-mobile-tabbar--scrolled',
  )
  const innerClass =
    'dashboard-mobile-tabbar__inner mx-auto flex h-[60px] max-w-lg items-stretch justify-around gap-1 px-1.5 min-[390px]:px-2'
  const tabClass =
    'dashboard-mobile-tabbar__tab flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1 text-[0.6rem] font-medium leading-none transition-colors active:opacity-70 min-[390px]:text-[0.65rem]'
  const iconClass = 'size-5 shrink-0 min-[390px]:size-[22px]'

  if (trainingLocked) {
    const def = defForPath('system/training')
    if (!def || !routeDefAccessible(def, role)) return null
    const Icon = getDashboardNavIcon('system/training')
    const label =
      resolveTitleForPath('system/training', role) ?? def.label
    return (
      <nav
        className={barClass}
        role="navigation"
        aria-label="Training"
      >
        <div className={innerClass}>
          <NavLink
            to="/dashboard/system/training"
            className={({ isActive }) =>
              cn(
                tabClass,
                isActive
                  ? 'dashboard-mobile-tabbar__tab--active text-primary'
                  : 'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    iconClass,
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
            className={cn(
              tabClass,
              'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
            )}
            aria-label="Open menu"
          >
            <MoreHorizontal className={iconClass} strokeWidth={1.75} aria-hidden />
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
      className={barClass}
      role="navigation"
      aria-label="Main tabs"
    >
      <div className={innerClass}>
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
                  tabClass,
                  isActive
                    ? 'dashboard-mobile-tabbar__tab--active text-primary'
                    : 'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      iconClass,
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
          className={cn(
            tabClass,
            'dashboard-mobile-tabbar__tab--idle text-muted-foreground hover:text-foreground',
          )}
          aria-label="Open full menu"
        >
          <MoreHorizontal className={iconClass} strokeWidth={1.75} aria-hidden />
          <span className="truncate">More</span>
        </button>
      </div>
    </nav>
  )
}
