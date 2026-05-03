import { Link } from 'react-router-dom'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { TeamPersonalFunnel } from '@/hooks/use-team-personal-funnel-query'
import type { TeamTodayStats } from '@/hooks/use-team-today-stats-query'

type Props = {
  data: TeamPersonalFunnel | undefined
  todayStats: TeamTodayStats | undefined
  todayPending: boolean
  isPending: boolean
  isError: boolean
  error: Error | null
  onRetry: () => void
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${Math.round(n)}%`
}

export function TeamHomeExecutionStrip({
  data,
  todayStats,
  todayPending,
  isPending,
  isError,
  error,
  onRetry,
}: Props) {
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-ds-h3">Your enrollment funnel</CardTitle>
        <CardDescription>
          Same idea as legacy team dashboard funnel — counts are for your assigned active leads only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : null}
        {isError ? (
          <p className="text-sm text-destructive" role="alert">
            {error?.message ?? 'Could not load funnel.'}{' '}
            <button type="button" className="font-medium underline underline-offset-2" onClick={() => void onRetry()}>
              Retry
            </button>
          </p>
        ) : null}
        {data && !isPending ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {todayPending ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={`today-${i}`} className="h-16 rounded-xl" />)
              ) : (
                <>
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.08] px-3 py-3">
                    <p className="text-ds-caption text-muted-foreground">Fresh leads today</p>
                    <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{todayStats?.claimed_today ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.08] px-3 py-3">
                    <p className="text-ds-caption text-muted-foreground">Calls today</p>
                    <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{todayStats?.calls_today ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.08] px-3 py-3">
                    <p className="text-ds-caption text-muted-foreground">Enrolled today</p>
                    <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{todayStats?.enrolled_today ?? 0}</p>
                  </div>
                </>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-muted/40 px-3 py-3">
                <p className="text-ds-caption text-muted-foreground">Claimed (active)</p>
                <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">{data.claimed}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-muted/40 px-3 py-3">
                <p className="text-ds-caption text-muted-foreground">Video reached</p>
                <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">{data.video_reached}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{pct(data.pct_video_vs_claimed)} of claimed</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-muted/40 px-3 py-3">
                <p className="text-ds-caption text-muted-foreground">Proof pending</p>
                <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">{data.proof_pending}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{pct(data.pct_proof_vs_video)} of video</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-muted/40 px-3 py-3">
                <p className="text-ds-caption text-muted-foreground">Min. FLP Billing</p>
                <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">{data.paid_196}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{pct(data.pct_enrolled_vs_claimed)} of claimed</p>
              </div>
            </div>
            <p className="text-ds-caption text-muted-foreground">
              Open{' '}
              <Link to="/dashboard/work/leads" className="font-medium text-primary underline-offset-2 hover:underline">
                Leads
              </Link>{' '}
              for calling / status;{' '}
              <Link
                to="/dashboard/work/workboard"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Workboard
              </Link>{' '}
              for Day 1+ batch actions.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
