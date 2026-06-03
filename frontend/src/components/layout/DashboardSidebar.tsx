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
  sidebarOpen: boolean
  mobileMenuOpen: boolean
  isMobile: boolean
  setMobileMenuOpen: (v: boolean) => void
  pendingEnrollCount: number
  onLogout: () => void
}

export function DashboardSidebar({
  sections,
  sidebarOpen,
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
        'flex h-full shrink-0 flex-col border-r border-border dashboard-sidebar overflow-y-auto',
        'transition-[transform,width] duration-200 ease-out',
        sidebarOpen ? 'md:w-[240px]' : 'md:w-0 md:overflow-hidden md:border-0',
        'dashboard-mobile-drawer max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:w-[min(240px,85vw)] max-md:pt-[env(safe-area-inset-top)]',
        'max-md:shadow-[4px_0_24px_rgba(0,0,0,0.5)]',
        mobileMenuOpen
          ? 'max-md:translate-x-0'
          : 'max-md:pointer-events-none max-md:-translate-x-full',
      )}
    >
      {/* Header */}
      <div className="flex h-[48px] shrink-0 items-center border-b border-border px-4 gap-2">
        <Link to="/dashboard" className="min-w-0 flex-1">
          <MyleSidebarMark />
        </Link>
        {envLabel && envLabel !== 'production' ? (
          <span className="shrink-0 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-ds-label uppercase text-warning">
            {envLabel}
          </span>
        ) : null}
      </div>

      {/* Nav */}
      <nav aria-label="Sidebar navigation" className="scroll-ios flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
        {rolePending && shellRole == null ? (
          <SidebarSkeleton />
        ) : null}

        {shellRole != null
          ? sections.map((section) => (
              <div key={section.id} className="mb-1">
                {section.label ? (
                  <p className="mb-1 mt-3 px-2 text-ds-label uppercase tracking-wider text-muted-foreground/60">
                    {section.label}
                  </p>
                ) : null}
                <ul className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const to =
                      item.path === '' ? '/dashboard' : `/dashboard/${item.path}`
                    const label = resolveItemLabel(item, shellRole)
                    const Icon = getDashboardNavIcon(item.path)
                    return (
                      <li key={item.path || 'index'}>
                        <NavLink
                          to={to}
                          end={item.end ?? false}
                          aria-label={
                            item.path === 'team/flp-min-billing' && pendingEnrollCount > 0
                              ? `${label}, ${pendingEnrollCount} pending`
                              : undefined
                          }
                          onClick={() => {
                            if (isMobile) setMobileMenuOpen(false)
                          }}
                          className={({ isActive }) =>
                            cn(
                              'group flex min-h-[36px] items-center gap-2.5 rounded px-2 py-1.5 text-sm font-medium',
                              'transition-[background-color,color] duration-100',
                              isActive
                                ? 'bg-primary/20 text-primary font-semibold'
                                : 'text-muted-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_6%,transparent)] hover:text-foreground',
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <Icon
                                className={cn(
                                  'size-4 shrink-0 transition-colors duration-100',
                                  isActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground group-hover:text-foreground',
                                )}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate">{label}</span>
                              {item.path === 'team/flp-min-billing' && pendingEnrollCount > 0 ? (
                                <span
                                  className={cn(
                                    'shrink-0 rounded px-1.5 py-0.5 text-ds-label font-bold tabular-nums',
                                    isActive
                                      ? 'bg-primary/30 text-primary'
                                      : 'bg-primary text-primary-foreground',
                                  )}
                                  aria-hidden
                                >
                                  {pendingEnrollCount > 99 ? '99+' : pendingEnrollCount}
                                </span>
                              ) : null}
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

      {/* Footer */}
      <div className="shrink-0 border-t border-border p-2">
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
