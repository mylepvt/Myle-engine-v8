import { useMemo } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { parseLeaderboardStubItem } from '@/lib/leaderboard-row'

type Props = { title: string }

export function LeaderboardPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/other/leaderboard')

  const rows = useMemo(
    () => (data?.items ?? []).map((row, i) => parseLeaderboardStubItem(row, i)),
    [data],
  )

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Rankings from summed daily report points (`daily_scores`). Same ordering rules for every role
        that can open this page.
      </p>

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="surface-elevated overflow-x-auto p-4 text-sm">
          {data.note ? <p className="mb-4 text-muted-foreground">{data.note}</p> : null}
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <caption className="sr-only">Leaderboard by daily report points</caption>
            <thead>
              <tr className="border-b border-white/10 text-ds-caption text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  #
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Member
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Role
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Email
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`lb-${i}-${r.rank}-${r.email}`}
                  className="border-b border-white/[0.06] text-foreground/90"
                >
                  <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{r.rank}</td>
                  <td className="py-2.5 pr-3 font-medium">{r.name}</td>
                  <td className="py-2.5 pr-3 capitalize text-muted-foreground">{r.role}</td>
                  <td className="max-w-[14rem] truncate py-2.5 pr-3 text-muted-foreground">{r.email}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-foreground">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="mt-3 text-muted-foreground">No leaderboard rows yet.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
