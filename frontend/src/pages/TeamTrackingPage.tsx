import { Link, useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamTrackingOverviewQuery, type TeamTrackingMemberSummary } from '@/hooks/use-team-tracking-query'

type Props = { title: string }

function todayIsoLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not seen yet'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}

function presenceVariant(status: TeamTrackingMemberSummary['presence_status']) {
  if (status === 'online') return 'success' as const
  if (status === 'idle') return 'warning' as const
  return 'outline' as const
}

function scoreVariant(band: TeamTrackingMemberSummary['consistency_band']) {
  if (band === 'high') return 'success' as const
  if (band === 'medium') return 'warning' as const
  return 'danger' as const
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <Card className="surface-elevated">
      <CardContent className="p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

function MemberCard({ item, dateIso }: { item: TeamTrackingMemberSummary; dateIso: string }) {
  return (
    <Card className="surface-elevated">
      <CardHeader className="mb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{item.member_name}</CardTitle>
            <CardDescription className="mt-1">
              {item.member_fbo_id}
              {item.leader_name ? ` · leader ${item.leader_name}` : ''}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={presenceVariant(item.presence_status)}>{item.presence_status}</Badge>
            <Badge variant={scoreVariant(item.consistency_band)}>
              Score {item.consistency_score}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Logins</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{item.login_count}</p>
          </div>
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Calls</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{item.calls_count}</p>
          </div>
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Leads</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{item.leads_added_count}</p>
          </div>
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Follow-ups</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{item.followups_done_count}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Last seen: <span className="text-foreground">{formatDateTime(item.last_seen_at)}</span></p>
            <p>Last activity: <span className="text-foreground">{formatDateTime(item.last_activity_at)}</span></p>
          </div>
          <Button asChild size="sm">
            <Link to={`/dashboard/team/tracking/${item.user_id}?date=${encodeURIComponent(dateIso)}`}>
              Open detail
            </Link>
          </Button>
        </div>

        {item.insights.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {item.insights.map((insight) => (
              <Badge key={insight} variant="secondary">
                {insight}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function TeamTrackingPage({ title }: Props) {
  const [params, setParams] = useSearchParams()
  const dateIso = params.get('date') || todayIsoLocal()
  const { data, isPending, isError, error, refetch } = useTeamTrackingOverviewQuery(dateIso)

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Admin preview for live member presence plus server-derived daily productivity stats.
          Scope follows the canonical org tree only.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              next.set('date', e.target.value)
              setParams(next)
            }}
            className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground"
          />
        </label>
        <span className="text-xs text-muted-foreground">
          Timezone: <span className="text-foreground">{data?.timezone ?? 'Asia/Kolkata'}</span>
        </span>
      </div>

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Members in scope" value={data.scope_total_members} />
            <MetricCard label="Online" value={data.online_count} />
            <MetricCard label="Idle" value={data.idle_count} />
            <MetricCard label="Offline" value={data.offline_count} />
            <MetricCard label="Average score" value={data.average_score} hint={data.note ?? undefined} />
          </div>

          <div className="space-y-3">
            {data.items.length === 0 ? (
              <Card className="surface-elevated">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  No members in scope for the selected date.
                </CardContent>
              </Card>
            ) : (
              data.items.map((item) => (
                <MemberCard key={item.user_id} item={item} dateIso={data.date} />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
