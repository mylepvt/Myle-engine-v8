import { useMemo } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { useShellStubQuery } from '@/hooks/use-shell-stub-query'
import { parseLeaderboardStubItem } from '@/lib/leaderboard-row'
import { cn } from '@/lib/utils'

type Props = { title: string }

const LEVEL_META: Record<string, { label: string; cls: string }> = {
  rookie:    { label: 'Rookie',    cls: 'bg-muted/60 text-muted-foreground' },
  hustler:   { label: 'Hustler',   cls: 'bg-blue-500/15 text-blue-400' },
  closer:    { label: 'Closer',    cls: 'bg-violet-500/15 text-violet-400' },
  champion:  { label: 'Champion',  cls: 'bg-amber-500/15 text-amber-400' },
  legend:    { label: 'Legend',    cls: 'bg-gradient-to-r from-amber-400/20 to-orange-400/20 text-amber-300 font-bold' },
}

function LevelBadge({ level }: { level: string }) {
  const meta = LEVEL_META[level] ?? LEVEL_META.rookie
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide',
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  )
}

export function LeaderboardPage({ title }: Props) {
  const { data, isPending, isError, error, refetch } = useShellStubQuery('/api/v1/other/leaderboard')

  const rows = useMemo(
    () => (data?.items ?? []).map((row, i) => parseLeaderboardStubItem(row, i)),
    [data],
  )

  const topThree = rows.slice(0, 3)
  const rest = rows.slice(3)

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>

      {isPending ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
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

      {data && rows.length > 0 ? (
        <>
          {/* Podium top-3 */}
          {topThree.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {topThree.map((r) => {
                const medals = ['🥇', '🥈', '🥉']
                const golds = [
                  'border-amber-400/40 bg-amber-500/8',
                  'border-slate-400/30 bg-slate-500/8',
                  'border-orange-400/30 bg-orange-500/8',
                ]
                return (
                  <div
                    key={r.rank}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center',
                      golds[r.rank - 1] ?? 'border-border bg-card/30',
                    )}
                  >
                    <span className="text-2xl" aria-label={`Rank ${r.rank}`}>{medals[r.rank - 1] ?? r.rank}</span>
                    <p className="max-w-full truncate text-sm font-semibold text-foreground">{r.name}</p>
                    <LevelBadge level={r.level} />
                    <p className="tabular-nums text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{r.points}</span> pts
                    </p>
                    {r.xp !== '—' ? (
                      <p className="text-[0.6rem] text-muted-foreground/70">{r.xp} XP</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* Rest of table */}
          {rest.length > 0 ? (
            <div className="surface-elevated overflow-x-auto rounded-2xl p-0 text-sm">
              <table className="w-full min-w-[28rem] border-collapse text-left">
                <caption className="sr-only">Full leaderboard</caption>
                <thead>
                  <tr className="border-b border-border/60 text-[0.7rem] text-muted-foreground">
                    <th scope="col" className="px-4 py-2.5 font-medium">#</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Member</th>
                    <th scope="col" className="px-4 py-2.5 font-medium hidden sm:table-cell">Level</th>
                    <th scope="col" className="px-4 py-2.5 font-medium hidden md:table-cell">Role</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Points</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium hidden sm:table-cell">XP</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((r, i) => (
                    <tr
                      key={`lb-${i}-${r.rank}-${r.email}`}
                      className="border-b border-border/40 last:border-0 text-foreground/90 transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground font-medium">{r.rank}</td>
                      <td className="px-4 py-2.5 font-medium">
                        <div className="min-w-0">
                          <p className="truncate">{r.name}</p>
                          <p className="truncate text-[0.65rem] text-muted-foreground md:hidden">{r.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <LevelBadge level={r.level} />
                      </td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground hidden md:table-cell">{r.role}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.points}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground hidden sm:table-cell">{r.xp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : data && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No leaderboard rows yet.</p>
      ) : null}
    </div>
  )
}
