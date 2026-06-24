import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { ComparePills, GrowthTrio, type ComparePeriod, type TrendPoint } from '@/components/current-cc/growth'

type TeamMember = { user_id: number; name: string }

type Props = { userId: number }

export function CurrentCcBoardDetailPage({ userId }: Props) {
  const trendsQ = useQuery({
    queryKey: ['current-cc-trends', userId, 30],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/current-cc/trends?subject_user_id=${userId}&days=30`)
      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as { points: TrendPoint[] }
    },
  })
  const compareQ = useQuery({
    queryKey: ['current-cc-compare', userId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/current-cc/compare?subject_user_id=${userId}`)
      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as { week: ComparePeriod; month: ComparePeriod }
    },
  })
  const membersQ = useQuery({
    queryKey: ['current-cc-members'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/current-cc/team-members')
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<TeamMember[]>
    },
  })

  const name = membersQ.data?.find((m) => m.user_id === userId)?.name ?? `User #${userId}`
  const points = trendsQ.data?.points ?? []
  const latest = points.length ? points[points.length - 1] : null

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard/team/cc-board" className="text-xs text-primary hover:underline">
            ‹ Back to board
          </Link>
          <h1 className="text-ds-h1">{name}</h1>
          <p className="text-sm text-muted-foreground">Last 30 days — real growth & pipeline movement.</p>
        </div>
        <Link
          to="/dashboard/team/current-cc"
          className="rounded-lg border border-primary/40 bg-primary/15 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/25"
        >
          Open sheet
        </Link>
      </div>

      {trendsQ.isPending ? <Skeleton className="h-64 w-full rounded" /> : null}
      {trendsQ.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {trendsQ.error instanceof Error ? trendsQ.error.message : 'Failed to load'}
        </p>
      ) : null}

      {latest ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Current CC" value={latest.closed_ccs.toFixed(2)} accent />
          <Stat label="Target CC" value={latest.target_ccs.toFixed(2)} />
          <Stat label="Closed people" value={String(latest.closed)} />
          <Stat label="Activity today" value={String(latest.calls + latest.leads_added + latest.followups)} />
        </div>
      ) : null}

      {compareQ.data ? <ComparePills week={compareQ.data.week} month={compareQ.data.month} /> : null}

      {trendsQ.data ? <GrowthTrio points={points} /> : null}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <p className={accent ? 'text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400' : 'text-lg font-bold tabular-nums text-foreground'}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
