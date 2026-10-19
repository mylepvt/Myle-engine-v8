import { useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MyleSidebarMark } from '@/components/brand/MyleSidebarMark'
import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import { resolveItemLabel } from '@/config/dashboard-nav'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useBackClose } from '@/hooks/use-back-close'
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
  const drawerOpen = isMobile && mobileMenuOpen
  // Device Back and Escape close the phone drawer.
  useBackClose({ open: drawerOpen, onClose: () => setMobileMenuOpen(false) })
  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, setMobileMenuOpen])

  return (
    <>
    {isMobile ? (
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={mobileMenuOpen ? 0 : -1}
        className={cn(
          'fixed inset-0 z-40 transition-opacity duration-200 ease-out md:hidden',
          mobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ background: 'var(--scrim)' }}
        onClick={() => setMobileMenuOpen(false)}
      />
    ) : null}
    <aside
      aria-hidden={isMobile && !mobileMenuOpen ? true : undefined}
      className={cn(
        // Desktop: a floating glass panel inset 12px from the edges. Mobile: a glass-pop drawer.
        'glass flex shrink-0 flex-col overflow-hidden',
        'dashboard-sidebar-panel md:my-3 md:ml-3 md:h-[calc(100%-1.5rem)] md:w-[240px] md:rounded-card',
        !sidebarOpen && 'dashboard-sidebar-panel--closed',
        // Phone drawer slides as it did before the redesign: a 200ms CSS transform
        // transition, which runs on the compositor and stays smooth under load.
        'dashboard-mobile-drawer max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:w-[min(240px,85vw)] max-md:rounded-r-card max-md:pt-[env(safe-area-inset-top)]',
        'max-md:transition-transform max-md:duration-200 max-md:ease-out',
        mobileMenuOpen ? 'max-md:translate-x-0' : 'max-md:pointer-events-none max-md:-translate-x-[calc(100%+24px)]',
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
                          // On a phone the open drawer sits on a Back placeholder entry;
                          // replacing it keeps Back from the new page returning here.
                          replace={isMobile}
                          onClick={() => {
                            if (isMobile) setMobileMenuOpen(false)
                          }}
                          className={({ isActive }) =>
                            cn(
                              'nav-link group flex min-h-10 items-center gap-2.5 px-3 py-2 text-sm',
                              isActive && 'nav-link--active',
                            )
                          }
                        >
                          {/* The active row's icon turns primary via .nav-link--active in CSS,
                              so the click-time class swap recolours it too. */}
                          <>
                              <Icon
                                className="size-4 shrink-0 text-muted-foreground transition-colors duration-100 group-hover:text-foreground"
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
    </aside>
    </>
  )
}
