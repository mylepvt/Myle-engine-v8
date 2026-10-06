import { useEffect, useState } from 'react'
import { Check, Gift, Medal, Users, Zap } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  usePowerHourMutation,
  useRewardsAdminOverviewQuery,
  useSeasonPaidMutation,
} from '@/hooks/use-rewards-query'
import { monthName, rupees } from '@/lib/rewards'
import { cn } from '@/lib/utils'

function PowerHourForm({ initial }: { initial: { enabled: boolean; start: string; end: string } }) {
  const save = usePowerHourMutation()
  const [cfg, setCfg] = useState(initial)
  useEffect(() => setCfg(initial), [initial])
  const dirty = cfg.enabled !== initial.enabled || cfg.start !== initial.start || cfg.end !== initial.end

  return (
    <div className="rounded-lg border border-border/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Zap className="size-3.5 text-primary" aria-hidden />
        <span className="text-ds-caption font-semibold">Power Hour (2× points)</span>
        <Switch
          className="ml-auto"
          checked={cfg.enabled}
          onCheckedChange={(enabled) => setCfg({ ...cfg, enabled })}
          aria-label="Power Hour on"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="time"
          aria-label="Power Hour start"
          value={cfg.start}
          onChange={(e) => setCfg({ ...cfg, start: e.target.value })}
          className="h-8 w-28"
        />
        <span className="text-ds-caption text-muted-foreground">to</span>
        <Input
          type="time"
          aria-label="Power Hour end"
          value={cfg.end}
          onChange={(e) => setCfg({ ...cfg, end: e.target.value })}
          className="h-8 w-28"
        />
        <Button
          size="sm"
          className="ml-auto h-8"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(cfg, {
              onSuccess: () => toast.success('Power Hour saved'),
              onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save'),
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  )
}

/** Admin: Power Hour, scratch budget, Team League and Season (with "paid" for prizes). */
export function AdminRewardsSettings() {
  const { data, isPending } = useRewardsAdminOverviewQuery()
  const paid = useSeasonPaidMutation()

  if (isPending || !data) return <Skeleton className="h-32 w-full" />
  const lastSeason = data.seasons[0]

  return (
    <div className="space-y-3">
      <PowerHourForm initial={data.power_hour} />

      <p className="flex items-center gap-1.5 text-ds-caption text-muted-foreground">
        <Gift className="size-3.5 text-warning-ink" aria-hidden />
        Scratch cards paid: {rupees(data.scratch.today_rupees)} / {rupees(data.scratch.daily_cap_rupees)} today ·{' '}
        {rupees(data.scratch.month_rupees)} / {rupees(data.scratch.monthly_cap_rupees)} this month
      </p>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-ds-caption font-semibold">
          <Users className="size-3.5 text-primary" aria-hidden />
          Team League — this week
        </p>
        {data.league_live.length ? (
          <ol className="space-y-0.5">
            {data.league_live.slice(0, 5).map((t, i) => (
              <li key={t.name} className="flex justify-between text-ds-caption">
                <span>
                  {i + 1}. Team {t.name} <span className="text-muted-foreground">({t.members})</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {t.score} MP/member · {t.points} total
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-ds-caption text-muted-foreground">No points yet this week.</p>
        )}
        {data.league.length ? (
          <p className="mt-1 text-ds-micro text-muted-foreground">
            Past weeks:{' '}
            {data.league
              .slice(0, 4)
              .map((w) => `${w.week_start.slice(5)} ${w.winner ? `Team ${w.winner}` : 'rolled over'}`)
              .join(' · ')}
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-ds-caption font-semibold">
          <Medal className="size-3.5 text-warning-ink" aria-hidden />
          {monthName(data.season_live.month)} Season — live
        </p>
        <ol className="space-y-0.5">
          {data.season_live.top.slice(0, 3).map((t) => (
            <li key={t.user_id} className="flex justify-between text-ds-caption">
              <span>
                {t.rank}. {t.name}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {t.points} MP · {rupees(t.prize_rupees)}
              </span>
            </li>
          ))}
          {data.season_live.most_improved ? (
            <li className="flex justify-between text-ds-caption">
              <span>Most Improved: {data.season_live.most_improved.name}</span>
              <span className="tabular-nums text-muted-foreground">+{data.season_live.most_improved.gain}</span>
            </li>
          ) : null}
        </ol>
      </div>

      {lastSeason ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5">
          <p className="mb-1 text-ds-caption font-semibold">
            {monthName(lastSeason.month)} winners — hand over the prizes
          </p>
          <ul className="space-y-1">
            {lastSeason.winners.map((w) => (
              <li key={`${w.kind}-${w.user_id}`} className="flex items-center gap-2 text-ds-caption">
                <span className="min-w-0 flex-1">
                  {w.kind === 'improved' ? 'Most Improved' : `#${w.rank}`} · {w.name}{' '}
                  <span className="text-muted-foreground">· {rupees(w.prize_rupees)}</span>
                </span>
                <Button
                  size="sm"
                  variant={w.paid_at ? 'secondary' : 'outline'}
                  className={cn('h-7 px-2', w.paid_at && 'text-success-ink')}
                  disabled={paid.isPending}
                  onClick={() => paid.mutate({ month: lastSeason.month, user_id: w.user_id, paid: !w.paid_at })}
                >
                  {w.paid_at ? (
                    <>
                      <Check className="size-3.5" aria-hidden /> Paid
                    </>
                  ) : (
                    'Mark paid'
                  )}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
