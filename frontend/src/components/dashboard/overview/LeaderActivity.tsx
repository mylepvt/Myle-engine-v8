import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Users } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeaderHealthQuery, type LeaderHealthItem } from '@/hooks/use-admin-leader-health-query'

type View = 'team' | 'personal'

const PRESENCE: Record<string, string> = {
  online: 'bg-success',
  idle: 'bg-warning',
  offline: 'bg-muted-foreground/40',
}

function scoreColor(v: number): string {
  if (v >= 60) return 'text-emerald-600 dark:text-emerald-400'
  if (v >= 30) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function bandColor(band: string): string {
  if (band === 'high') return 'text-emerald-600 dark:text-emerald-400'
  if (band === 'medium') return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function LeaderRow({ l, view }: { l: LeaderHealthItem; view: View }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-3 py-2.5">
      <span className={cn('size-2 shrink-0 rounded-full', PRESENCE[l.presence_status] ?? PRESENCE.offline)} aria-label={l.presence_status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{l.leader_name}</p>
        <p className="text-[11px] text-muted-foreground">
          {view === 'team'
            ? `${l.team_size} members · ${l.team_online_count} online`
            : `${l.personal_leads_added} added · ${l.personal_followups_done} follow-ups`}
        </p>
      </div>
      {view === 'team' ? (
        <div className="flex shrink-0 items-center gap-3 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">{l.team_calls_today}</p>
            <p className="text-[10px] text-muted-foreground">calls</p>
          </div>
          <div>
            <p className={cn('text-sm font-semibold tabular-nums', scoreColor(l.team_avg_score))}>{l.team_avg_score}</p>
            <p className="text-[10px] text-muted-foreground">score</p>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-3 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">{l.personal_calls_today}</p>
            <p className="text-[10px] text-muted-foreground">calls</p>
          </div>
          <div>
            <p className={cn('text-sm font-semibold tabular-nums', bandColor(l.personal_consistency_band))}>
              {l.personal_consistency_score}
            </p>
            <p className="text-[10px] text-muted-foreground">consistency</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
 * Leader Activity — Team Handling ↔ Personal work toggle, per leader
 * ────────────────────────────────────────────────────────────────────────── */
export function LeaderActivity() {
  const [view, setView] = useState<View>('team')
  const health = useLeaderHealthQuery(true)
  const leaders = health.data?.leaders ?? []

  return (
    <Card className="border-border/60">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" aria-hidden />
            <h2 className="font-heading text-ds-h3 font-semibold text-foreground">Leader Activity</h2>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
            {([['team', 'Team Handling'], ['personal', 'Personal']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition',
                  view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {health.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : leaders.length === 0 ? (
          <p className="py-8 text-center text-ds-caption text-muted-foreground">No leaders to show.</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {leaders.map((l) => (
              <LeaderRow key={l.leader_id} l={l} view={view} />
            ))}
          </div>
        )}

        <Link
          to="/dashboard/team/members"
          className="mt-3 inline-flex items-center gap-1 text-ds-caption font-medium text-primary hover:underline"
        >
          All members <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  )
}
