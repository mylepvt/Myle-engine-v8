import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAdminDrawsQuery,
  useAdminRewardPointsQuery,
  useRevokePointMutation,
} from '@/hooks/use-rewards-query'
import { rupees } from '@/lib/rewards'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

/** Admin audit: who earned MYLE Points for what (last 7 days), revoke, and jackpot history. */
export function AdminRewardsCard() {
  const points = useAdminRewardPointsQuery()
  const draws = useAdminDrawsQuery()
  const revoke = useRevokePointMutation()
  const [showAll, setShowAll] = useState(false)

  const rows = points.data?.points ?? []
  const shown = showAll ? rows : rows.slice(0, 12)
  const live = rows.filter((p) => !p.revoked_at)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Trophy className="size-4 text-warning-ink" aria-hidden />
          <span>Rewards audit</span>
          <span className="ml-auto text-ds-caption font-normal text-muted-foreground">
            {live.reduce((s, p) => s + p.points, 0).toLocaleString('en-IN')} MP · 7 days
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {draws.data?.draws.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {draws.data.draws.slice(0, 7).map((d) => (
              <li key={d.date} className="rounded-full bg-warning/10 px-2.5 py-0.5 text-ds-caption">
                {d.date.slice(5)}: {d.winner_name ?? 'rolled over'} · {rupees(d.pot_rupees)}
                <span className="text-muted-foreground"> · {d.players} in</span>
              </li>
            ))}
          </ul>
        ) : null}

        {points.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-ds-caption text-muted-foreground">No points earned yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {shown.map((p) => (
              <li key={p.id} className={cn('flex items-center gap-2 py-1.5 text-ds-caption', p.revoked_at && 'opacity-50')}>
                <span className="w-9 shrink-0 font-bold tabular-nums">+{p.points}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-foreground">{p.user_name}</span>
                  <span className="text-muted-foreground">
                    {' '}· {p.label} · {p.lead_name ?? `#${p.lead_id}`} · {formatRelativeTimeShort(p.at)}
                  </span>
                </span>
                {p.revoked_at ? (
                  <span className="shrink-0 text-ds-micro text-muted-foreground">revoked ({p.revoked_reason})</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-destructive-ink"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate(p.id, {
                        onSuccess: () => toast.success(`Revoked ${p.points} MP from ${p.user_name}`),
                        onError: () => toast.error('Could not revoke'),
                      })
                    }
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {rows.length > 12 ? (
          <button type="button" className="text-ds-caption font-semibold text-primary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show all ${rows.length}`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  )
}
