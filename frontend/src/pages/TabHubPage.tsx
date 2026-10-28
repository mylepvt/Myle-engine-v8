import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { getDashboardNavIcon } from '@/config/dashboard-nav-icons'
import { resolveItemLabel } from '@/config/dashboard-registry'
import { hubSections, type DashboardHubId } from '@/config/dashboard-tabs'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useFlpMinBillingApprovalsPendingQuery } from '@/hooks/use-team-query'
import { authLogout } from '@/lib/auth-api'
import { useAuthStore } from '@/stores/auth-store'
import { useShellPreviewStore } from '@/stores/shell-preview-store'

const rowClass =
  'jw-row press flex min-h-16 items-center gap-4 px-4 py-3 text-left text-ds-body text-foreground'

/** A tab's root screen: bold section headings over grids of flat rows, one per screen. */
export function TabHubPage({ hub }: { hub: Exclude<DashboardHubId, 'library'> }) {
  const { role } = useDashboardShellRole()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const pendingEnroll = useFlpMinBillingApprovalsPendingQuery()
  const pendingEnrollCount = pendingEnroll.data?.total ?? 0

  if (role == null) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  async function handleLogout() {
    try { await authLogout() } catch { /* still clear local session */ }
    useShellPreviewStore.getState().setViewAsRole(null)
    logout()
    navigate('/login', { replace: true })
  }

  const sections = hubSections(hub, role)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {sections.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Nothing here for your role yet.</p>
      ) : null}
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`hub-${section.id}`}>
          <h2 id={`hub-${section.id}`} className="mb-3 text-ds-h2 font-bold text-foreground">
            {section.label}
          </h2>
          <ul className="grid grid-cols-1 gap-[3px] sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const Icon = getDashboardNavIcon(item.path)
              const badge = item.path === 'team/flp-min-billing' ? pendingEnrollCount : 0
              return (
                <li key={item.path}>
                  <Link to={`/dashboard/${item.path}`} className={rowClass}>
                    <Icon className="size-7 shrink-0 text-foreground/85" strokeWidth={1.25} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{resolveItemLabel(item, role)}</span>
                    {badge > 0 ? (
                      <span className="shrink-0 bg-primary px-1.5 py-0.5 text-ds-label font-bold tabular-nums text-primary-foreground">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      {hub === 'learning' ? (
        <section>
          <ul className="grid grid-cols-1 gap-[3px] sm:grid-cols-2 lg:grid-cols-3">
            <li>
              <button type="button" className={`${rowClass} w-full`} onClick={() => void handleLogout()}>
                <LogOut className="size-7 shrink-0 text-destructive-ink" strokeWidth={1.25} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-destructive-ink">Log out</span>
              </button>
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  )
}
