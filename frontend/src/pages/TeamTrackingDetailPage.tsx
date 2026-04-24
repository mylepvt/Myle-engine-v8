import { Link, useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamTrackingDetailQuery } from '@/hooks/use-team-tracking-query'

type Props = {
  title: string
  userId: number
}

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

function scoreVariant(band: 'low' | 'medium' | 'high') {
  if (band === 'high') return 'success' as const
  if (band === 'medium') return 'warning' as const
  return 'danger' as const
}

function presenceVariant(status: 'online' | 'idle' | 'offline') {
  if (status === 'online') return 'success' as const
  if (status === 'idle') return 'warning' as const
  return 'outline' as const
}

function complianceVariant(level: string | null) {
  if (level === 'removed') return 'danger' as const
  if (level === 'final_warning' || level === 'strong_warning') return 'warning' as const
  if (level === 'warning') return 'primary' as const
  if (level === 'grace' || level === 'grace_ending') return 'outline' as const
  if (level === 'clear') return 'success' as const
  return 'secondary' as const
}

export function TeamTrackingDetailPage({ title, userId }: Props) {
  const [params, setParams] = useSearchParams()
  const dateIso = params.get('date') || todayIsoLocal()
  const { data, isPending, isError, error, refetch } = useTeamTrackingDetailQuery(userId, dateIso)

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-2">
        <Link to={`/dashboard/team/tracking?date=${encodeURIComponent(dateIso)}`} className="text-sm text-primary underline-offset-2 hover:underline">
          Back to tracking overview
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
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
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
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
          <Card className="surface-elevated">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{data.member.member_name}</CardTitle>
                  <CardDescription className="mt-1">
                    {data.member.member_fbo_id}
                    {data.member.leader_name ? ` · leader ${data.member.leader_name}` : ''}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={presenceVariant(data.member.presence_status)}>
                    {data.member.presence_status}
                  </Badge>
                  <Badge variant={scoreVariant(data.member.consistency_band)}>
                    Score {data.member.consistency_score}
                  </Badge>
                  {data.member.compliance_title ? (
                    <Badge variant={complianceVariant(data.member.compliance_level)}>
                      {data.member.compliance_title}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Email: <span className="text-foreground">{data.member.member_email}</span></p>
                <p>Phone: <span className="text-foreground">{data.member.member_phone || '—'}</span></p>
                <p>Last seen: <span className="text-foreground">{formatDateTime(data.member.last_seen_at)}</span></p>
                <p>Last activity: <span className="text-foreground">{formatDateTime(data.member.last_activity_at)}</span></p>
                {data.member.compliance_summary ? (
                  <p>Discipline: <span className="text-foreground">{data.member.compliance_summary}</span></p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Logins</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{data.member.login_count}</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Calls</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{data.member.calls_count}</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Leads</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{data.member.leads_added_count}</p>
                </div>
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Follow-ups</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">{data.member.followups_done_count}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="surface-elevated">
            <CardHeader>
              <CardTitle>Insights</CardTitle>
            </CardHeader>
            <CardContent>
              {data.member.insights.length === 0 ? (
                <p className="text-sm text-muted-foreground">No special alerts for this date.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.member.insights.map((insight) => (
                    <Badge key={insight} variant="secondary">
                      {insight}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="surface-elevated">
            <CardHeader>
              <CardTitle>7-day trend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.trend.map((point) => (
                <div key={point.date} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{point.date}</p>
                    <Badge variant={scoreVariant(point.consistency_band)}>
                      Score {point.consistency_score}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    <p className="text-muted-foreground">Logins <span className="text-foreground">{point.login_count}</span></p>
                    <p className="text-muted-foreground">Calls <span className="text-foreground">{point.calls_count}</span></p>
                    <p className="text-muted-foreground">Leads <span className="text-foreground">{point.leads_added_count}</span></p>
                    <p className="text-muted-foreground">Follow-ups <span className="text-foreground">{point.followups_done_count}</span></p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="surface-elevated">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recent_activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity rows.</p>
              ) : (
                <div className="space-y-2">
                  {data.recent_activity.map((item, index) => (
                    <div key={`${item.action}-${item.occurred_at}-${index}`} className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">{item.action}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(item.occurred_at)}</p>
                      </div>
                      {item.entity_type || item.entity_id ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.entity_type || 'entity'}
                          {item.entity_id ? ` #${item.entity_id}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
