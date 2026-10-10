import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, Sparkles, Ticket, TrendingUp, Trophy } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyRewardsQuery } from '@/hooks/use-rewards-query'
import { playAppSound } from '@/lib/app-sounds'
import { rupees, takeNewPoints, ticketLine, untilDraw } from '@/lib/rewards'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

import { JackpotWheel } from './JackpotWheel'
import { RewardsExtras, StreakPowerLines } from './RewardsExtras'

/** MYLE Points → tonight's jackpot tickets, plus what the member's pipeline is worth. */
export function RewardsCard() {
  const { data, isPending, isError } = useMyRewardsQuery()
  const [now, setNow] = useState(() => Date.now())
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!data) return
    const fresh = takeNewPoints(data.recent).slice(-3)
    if (fresh.length) playAppSound('reward')
    for (const p of fresh) {
      toast.success(`+${p.points} MP — ${p.label}`, { description: p.lead_name ?? undefined })
    }
  }, [data])

  if (isError || (data && !data.eligible)) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Trophy className="size-4 text-warning-ink" aria-hidden />
          <span>Daily Jackpot</span>
          {data ? (
            <span className="ml-auto rounded-full bg-warning/15 px-2.5 py-0.5 text-ds-caption font-bold text-warning-ink">
              {rupees(data.pot_rupees)}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Draw in <span className="font-semibold text-foreground">{untilDraw(data.draw_at, now)}</span> · 9 PM ·
              winner gets it in the wallet
            </p>

            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-ds-caption font-semibold text-foreground">
                  <span className="text-lg font-bold tabular-nums">{data.points_today}</span> MP today
                </p>
                <p className="flex items-center gap-1 text-ds-caption font-semibold text-warning-ink">
                  <Ticket className="size-3.5" aria-hidden />
                  {data.tickets} / {data.max_tickets} tickets
                </p>
              </div>
              <div className="mt-2 flex gap-1" aria-hidden>
                {Array.from({ length: data.max_tickets }).map((_, i) => (
                  <span
                    key={i}
                    className={cn('h-2 flex-1 rounded-full', i < data.tickets ? 'bg-warning' : 'bg-border')}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-ds-micro text-muted-foreground">
                {ticketLine(data)} · {data.mp_per_ticket} MP = 1 ticket
              </p>
            </div>

            <StreakPowerLines data={data} now={now} />

            <JackpotWheel myTickets={data.tickets} />

            {data.last_draw ? (
              <p className="text-ds-caption text-muted-foreground">
                {data.last_draw.winner_name
                  ? `Last draw: ${data.last_draw.winner_name} won ${rupees(data.last_draw.pot_rupees)}`
                  : `Last draw had no tickets — ${rupees(data.last_draw.pot_rupees)} rolled over`}
              </p>
            ) : null}

            {data.pipeline.active ? (
              <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-ds-caption font-semibold text-success-ink">
                  <TrendingUp className="size-3.5" aria-hidden />
                  Your pipeline: {rupees(data.pipeline.total_rupees)}
                </p>
                <p className="mt-0.5 text-ds-micro text-muted-foreground">
                  What you can earn if your {data.pipeline.active} active prospect
                  {data.pipeline.active === 1 ? '' : 's'} join
                </p>
                {data.pipeline.at_risk ? (
                  <Link
                    to="/dashboard/work/leads"
                    className="mt-2 flex items-center gap-1.5 text-ds-caption font-semibold text-destructive-ink"
                  >
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {rupees(data.pipeline.at_risk_rupees)} at risk — {data.pipeline.at_risk} untouched 24h+
                  </Link>
                ) : null}
              </div>
            ) : null}

            <RewardsExtras data={data} />

            {data.recent.length ? (
              <ul className="space-y-1">
                {data.recent.slice(0, 5).map((p) => (
                  <li key={p.id} className={cn('flex items-center gap-2 text-ds-caption', p.revoked && 'opacity-50 line-through')}>
                    <Sparkles className="size-3.5 shrink-0 text-warning-ink" aria-hidden />
                    <span className="font-bold tabular-nums text-foreground">
                      +{p.points}
                      {p.double ? <span className="ml-0.5 text-ds-micro text-primary">2×</span> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {p.label}
                      {p.lead_name ? ` · ${p.lead_name}` : ''}
                    </span>
                    <span className="shrink-0 text-ds-micro text-muted-foreground">
                      {formatRelativeTimeShort(p.at, now)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ds-caption text-muted-foreground">
                Points come when your prospect really moves — watches the video, joins batches, passes the test.
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="flex w-full items-center justify-between text-ds-caption font-semibold text-primary"
              aria-expanded={showTable}
            >
              How to earn MP
              <ChevronDown className={cn('size-4 transition-transform', showTable && 'rotate-180')} aria-hidden />
            </button>
            {showTable ? (
              <ul className="space-y-0.5">
                {data.table.map((row) => (
                  <li key={row.step} className="flex justify-between gap-2 text-ds-caption">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold tabular-nums text-foreground">{row.points}</span>
                  </li>
                ))}
                <li className="pt-1 text-ds-micro text-muted-foreground">
                  Each step pays once per prospect, only when it's verified.
                </li>
              </ul>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
