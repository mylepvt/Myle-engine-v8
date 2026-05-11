import { Link, NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SidebarSkeleton } from '@/components/ui/skeleton-premium'
import { MyleSidebarMark } from '@/components/brand/MyleSidebarMark'
import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import { resolveItemLabel } from '@/config/dashboard-nav'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useMetaQuery } from '@/hooks/use-meta-query'
import type { DashboardNavSection } from '@/config/dashboard-nav'
import { cn } from '@/lib/utils'

type Props = {
  sections: DashboardNavSection[]
  mobileMenuOpen: boolean
  isMobile: boolean
  setMobileMenuOpen: (v: boolean) => void
  pendingEnrollCount: number
  onLogout: () => void
}

export function DashboardSidebar({
  sections,
  mobileMenuOpen,
  isMobile,
  setMobileMenuOpen,
  pendingEnrollCount,
  onLogout,
}: Props) {
  const { role: shellRole, isPending: rolePending } = useDashboardShellRole()
  const { data: meta } = useMetaQuery()
  const envLabel = meta?.environment

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border/80 dashboard-sidebar overflow-y-auto',
        'transition-[transform,width,border-color] duration-300 ease-out',
        'md:w-[18rem]',
        'dashboard-mobile-drawer max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:w-[min(20rem,85vw)] max-md:pt-[env(safe-area-inset-top)]',
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
            className="ml-2 shrink-0 rounded-md border border-warning/45 bg-warning/12 px-1.5 py-0.5 text-ds-label uppercase text-warning"
            title="Server-reported environment (APP_ENV)"
          >
            {envLabel}
          </span>
        ) : null}
      </div>

      <nav className="scroll-ios flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-3 py-4 pb-2">
        {rolePending && shellRole == null ? (
          <SidebarSkeleton />
        ) : null}
        {shellRole != null
          ? sections.map((section) => (
              <div key={section.id}>
                {section.label ? (
                  <p className="mb-2 px-3 text-ds-label uppercase text-muted-foreground/70">
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
                          aria-label={
                            item.path === 'team/enrollment-approvals' && pendingEnrollCount > 0
                              ? `${label}, ${pendingEnrollCount} pending`
                              : undefined
                          }
                          onClick={() => {
                            if (isMobile) {
                              setMobileMenuOpen(false)
                            }
                          }}
                          className={({ isActive }) =>
                            cn(
                              'group flex min-h-[48px] items-center gap-3 px-4 py-3 text-sm font-medium',
                              'transition-[background-color,color,transform] duration-200 ease-out',
                              'active:scale-[0.97]',
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
                              {item.path === 'team/enrollment-approvals' && pendingEnrollCount > 0 ? (
                                <span
                                  className={cn(
                                    'relative z-10 shrink-0 rounded-full px-1.5 py-0.5 text-ds-label font-bold tabular-nums',
                                    isActive
                                      ? 'bg-white/25 text-primary-foreground'
                                      : 'bg-primary text-primary-foreground shadow-sm',
                                  )}
                                  aria-hidden
                                >
                                  {pendingEnrollCount > 99 ? '99+' : pendingEnrollCount}
                                </span>
                              ) : null}
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
          onClick={() => void onLogout()}
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </Button>
      </div>
    </aside>
  )
}
