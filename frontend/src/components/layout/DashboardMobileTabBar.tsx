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
  if (trainingLocked) {
    const def = defForPath('system/training')
    if (!def || !routeDefAccessible(def, role)) return null
    const Icon = getDashboardNavIcon('system/training')
    const label =
      resolveTitleForPath('system/training', role) ?? def.label
    return (
      <nav
        className={cn(
          'dashboard-mobile-tabbar shrink-0 pb-[env(safe-area-inset-bottom)] md:hidden',
          keyboardOpen && 'dashboard-mobile-tabbar--keyboard-open',
          scrolled && 'dashboard-mobile-tabbar--scrolled',
        )}
        role="navigation"
        aria-label="Training"
      >
        <div className="dashboard-mobile-tabbar__inner mx-auto flex h-[4.25rem] max-w-lg items-stretch justify-around gap-1 px-2">
          <NavLink
            to="/dashboard/system/training"
            className={({ isActive }) =>
              cn(
                'dashboard-mobile-tabbar__tab flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1 text-[0.65rem] font-medium leading-none transition-colors active:opacity-70',
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
            className="dashboard-mobile-tabbar__tab dashboard-mobile-tabbar__tab--idle flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1 text-[0.65rem] font-medium leading-none text-muted-foreground transition-colors active:opacity-70 hover:text-foreground"
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
      className={cn(
        'dashboard-mobile-tabbar shrink-0 pb-[env(safe-area-inset-bottom)] md:hidden',
        keyboardOpen && 'dashboard-mobile-tabbar--keyboard-open',
        scrolled && 'dashboard-mobile-tabbar--scrolled',
      )}
      role="navigation"
      aria-label="Main tabs"
    >
      <div className="dashboard-mobile-tabbar__inner mx-auto flex h-[4.25rem] max-w-lg items-stretch justify-around gap-1 px-2">
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
                'dashboard-mobile-tabbar__tab flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1 text-[0.65rem] font-medium leading-none transition-colors active:opacity-70',
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
          className="dashboard-mobile-tabbar__tab dashboard-mobile-tabbar__tab--idle flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-1 py-1 text-[0.65rem] font-medium leading-none text-muted-foreground transition-colors active:opacity-70 hover:text-foreground"
          aria-label="Open full menu"
        >
          <MoreHorizontal className="size-[22px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="truncate">More</span>
        </button>
      </div>
    </nav>
  )
}
