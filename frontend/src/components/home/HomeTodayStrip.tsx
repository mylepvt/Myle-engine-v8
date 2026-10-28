import { Link } from 'react-router-dom'

import { getHomeQuickActions } from '@/config/dashboard-home-actions'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useLeadPoolQuery } from '@/hooks/use-lead-pool-query'
import { useTeamTodayStatsQuery } from '@/hooks/use-team-today-stats-query'

/**
 * First thing on Home: today's numbers (team), then three shortcut tiles. Same
 * data and shortcuts the role dashboard showed; nothing new is counted.
 */
export function HomeTodayStrip() {
  const { role } = useDashboardShellRole()
  const { data: me } = useAuthMeQuery()
  const sessionReady = Boolean(me?.authenticated)
  const today = useTeamTodayStatsQuery(sessionReady && role === 'team')
  const pool = useLeadPoolQuery(sessionReady && role === 'admin')

  if (role == null) return null
  // Calling Board has its own place in the Work tab, so Home skips it.
  const shortcuts = getHomeQuickActions(role, { poolTotal: pool.data?.total ?? 0 })
    .filter((a) => a.path !== 'work/leads')
    .slice(0, 3)
  const kpis =
    role === 'team'
      ? [
          { label: "Today's leads", value: today.data?.claimed_today ?? 0 },
          { label: 'Calls', value: today.data?.calls_today ?? 0 },
          { label: 'Min. FLP billed', value: today.data?.flp_min_billing_today ?? 0 },
        ]
      : []

  return (
    <section aria-labelledby="home-today" className="mb-8 space-y-[3px]">
      <h2 id="home-today" className="mb-2.5 text-ds-h2 font-bold text-foreground">
        Today
      </h2>

      {kpis.length > 0 ? (
        <div className="grid grid-cols-3 gap-[3px]">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="jw-row flex flex-col justify-between px-3 py-3">
              <p className="text-ds-caption leading-snug text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-ds-display tabular-nums text-foreground">{kpi.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {shortcuts.length > 0 ? (
        <div className="grid grid-cols-3 gap-[3px]">
          {shortcuts.map((action) => (
            <Link
              key={action.path}
              to={action.to}
              className="jw-row press relative flex flex-col items-center justify-center gap-1.5 px-2 py-3.5 text-center"
            >
              <action.Icon className="size-6 text-primary" strokeWidth={1.5} aria-hidden />
              <span className="line-clamp-2 text-ds-caption font-medium leading-tight text-foreground">{action.label}</span>
              {action.badgeCount != null ? (
                <span className="absolute right-1.5 top-1.5 bg-primary px-1.5 text-ds-micro font-bold tabular-nums text-primary-foreground">
                  {action.badgeCount}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}
