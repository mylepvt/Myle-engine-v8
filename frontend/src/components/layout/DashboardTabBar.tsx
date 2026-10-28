import { NavLink, useLocation } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'

import { DASHBOARD_TABS, activeTabForPathname } from '@/config/dashboard-tabs'
import { cn } from '@/lib/utils'

type Props = {
  /** Training gate: only the Training tab until it is completed. */
  trainingLocked?: boolean
  keyboardOpen?: boolean
}

const tabClass =
  'jw-tabbar__tab press flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-center md:flex-row md:gap-2'

/** Flat bottom bar on every screen size: icon over label on phones, side by side on wide screens. */
export function DashboardTabBar({ trainingLocked = false, keyboardOpen = false }: Props) {
  const location = useLocation()
  const active = activeTabForPathname(location.pathname)

  if (trainingLocked) {
    return (
      <nav className={cn('jw-tabbar', keyboardOpen && 'jw-tabbar--hidden')} role="navigation" aria-label="Training">
        <div className="jw-tabbar__inner">
          <NavLink to="/dashboard/system/training" className={cn(tabClass, 'jw-tabbar__tab--active')}>
            <GraduationCap className="size-[22px] shrink-0" strokeWidth={1.6} aria-hidden />
            <span>Training</span>
          </NavLink>
        </div>
      </nav>
    )
  }

  return (
    <nav className={cn('jw-tabbar', keyboardOpen && 'jw-tabbar--hidden')} role="navigation" aria-label="Main tabs">
      <div className="jw-tabbar__inner">
        {DASHBOARD_TABS.map((tab) => {
          const isActive = tab.id === active
          const Icon = tab.icon
          return (
            <NavLink
              key={tab.id}
              to={tab.path ? `/dashboard/${tab.path}` : '/dashboard'}
              end={tab.path === ''}
              aria-current={isActive ? 'page' : undefined}
              className={cn(tabClass, isActive ? 'jw-tabbar__tab--active' : 'jw-tabbar__tab--idle')}
            >
              <Icon className="size-[22px] shrink-0" strokeWidth={1.6} aria-hidden />
              <span>{tab.label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
