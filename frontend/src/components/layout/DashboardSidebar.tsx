import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { m } from 'motion/react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MyleSidebarMark } from '@/components/brand/MyleSidebarMark'
import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import { resolveItemLabel } from '@/config/dashboard-nav'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useDrawerGesture } from '@/hooks/use-drawer-gesture'
import { useMetaQuery } from '@/hooks/use-meta-query'
import type { DashboardNavSection } from '@/config/dashboard-nav'
import { afterNextPaint } from '@/lib/after-next-paint'
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
  const location = useLocation()
  const navigate = useNavigate()
  // The row a click is heading to. The route only commits once the next page has
  // rendered, so the pill moves on the click instead of waiting for it.
  const [pending, setPending] = useState<{ to: string; fromPath: string } | null>(null)
  const pendingTo = pending && pending.fromPath === location.pathname ? pending.to : null
  const { panelRef: drawerRef, x: drawerX, scrimOpacity, handlers: drawerHandlers } = useDrawerGesture({
    enabled: isMobile,
    open: mobileMenuOpen,
    onClose: () => setMobileMenuOpen(false),
  })

  return (
    <>
    {isMobile ? (
      // Dims with the drawer's position, so it fades in step with a drag.
      <m.button
        type="button"
        aria-label="Close menu"
        tabIndex={mobileMenuOpen ? 0 : -1}
        className={cn('fixed inset-0 z-40 md:hidden', !mobileMenuOpen && 'pointer-events-none')}
        style={{ opacity: scrimOpacity, background: 'var(--scrim)' }}
        onClick={() => setMobileMenuOpen(false)}
      />
    ) : null}
    <m.aside
      ref={drawerRef}
      {...(isMobile ? drawerHandlers : {})}
      style={isMobile ? { x: drawerX } : undefined}
      aria-hidden={isMobile && !mobileMenuOpen ? true : undefined}
      className={cn(
        // Desktop: a floating glass panel inset 12px from the edges. Mobile: a glass-pop drawer.
        'glass flex shrink-0 flex-col overflow-hidden',
        'dashboard-sidebar-panel md:my-3 md:ml-3 md:h-[calc(100%-1.5rem)] md:w-[240px] md:rounded-card',
        !sidebarOpen && 'dashboard-sidebar-panel--closed',
        'dashboard-mobile-drawer max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:w-[min(240px,85vw)] max-md:rounded-r-card max-md:touch-pan-y max-md:pt-[env(safe-area-inset-top)]',
        !mobileMenuOpen && 'max-md:pointer-events-none',
      )}
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Link to="/dashboard" className="min-w-0 flex-1">
          <MyleSidebarMark />
        </Link>
        {envLabel && envLabel !== 'production' ? (
          <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-ds-label uppercase text-warning-ink">
            {envLabel}
          </span>
        ) : null}
      </div>

      {/* Nav */}
      {/* touch-pan-y here too: touch-action stops at the nearest scroller, so the
          drawer's own pan-y would not stop the browser claiming a sideways drag. */}
      <nav aria-label="Sidebar navigation" className="scroll-ios max-md:touch-pan-y no-scrollbar flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 pb-2">
        {rolePending && shellRole == null ? (
          <div className="space-y-2 px-2" aria-busy="true" aria-label="Loading navigation">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-full" />
            ))}
          </div>
        ) : null}

        {shellRole != null
          ? sections.map((section) => (
              <div key={section.id} className="mb-1">
                {section.label ? (
                  <p className="mb-1 mt-3 px-3 text-ds-label uppercase tracking-wider text-muted-foreground">
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
                          data-tour={item.path.split('/')[0]}
                          aria-label={
                            item.path === 'team/flp-min-billing' && pendingEnrollCount > 0
                              ? `${label}, ${pendingEnrollCount} pending`
                              : undefined
                          }
                          onClick={(e) => {
                            if (isMobile) setMobileMenuOpen(false)
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                            // Paint the row's answer first, then render the next page.
                            e.preventDefault()
                            setPending({ to, fromPath: location.pathname })
                            // Same page: replace, as <Link> does, so history gains no duplicate.
                            afterNextPaint(() => navigate(to, { replace: to === location.pathname }))
                          }}
                          className={({ isActive }) =>
                            cn(
                              'nav-link group flex min-h-10 items-center gap-2.5 px-3 py-2 text-sm',
                              (pendingTo ? pendingTo === to : isActive) && 'nav-link--active',
                            )
                          }
                        >
                          {({ isActive: routeActive }) => {
                            const isActive = pendingTo ? pendingTo === to : routeActive
                            return (
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
                                    'shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-ds-label font-bold tabular-nums text-primary-foreground',
                                  )}
                                  aria-hidden
                                >
                                  {pendingEnrollCount > 99 ? '99+' : pendingEnrollCount}
                                </span>
                              ) : null}
                            </>
                            )
                          }}
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
      <div className="shrink-0 p-2 max-md:pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2.5 px-3"
          onClick={() => void onLogout()}
        >
          <LogOut className="size-4" aria-hidden />
          Log out
        </Button>
      </div>
    </m.aside>
    </>
  )
}
