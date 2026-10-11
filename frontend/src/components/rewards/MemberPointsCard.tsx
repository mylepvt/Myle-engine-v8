import { useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { InlineEmpty } from '@/components/ui/states'
import { type MemberPoints, useAdminMemberPointsQuery } from '@/hooks/use-rewards-query'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

type Period = 'today' | 'week' | 'month'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
]
const COLLAPSED = 10

function MemberRow({ m, rank, period }: { m: MemberPoints; rank: number; period: Period }) {
  const [open, setOpen] = useState(false)
  const value = m[period]
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
      >
        <span className="w-6 shrink-0 text-right text-ds-caption tabular-nums text-muted-foreground">{rank}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-ds-body font-medium text-foreground">
            {m.name}
            {m.role === 'leader' ? (
              <span className="ml-1.5 text-ds-caption font-normal text-muted-foreground">Leader</span>
            ) : null}
          </p>
          <p className="truncate text-ds-caption font-normal text-muted-foreground">
            {m.today} today · {m.week} week · {m.month} month
            {m.last_at ? ` · last ${formatRelativeTimeShort(m.last_at)}` : ' · no points yet'}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 text-ds-body font-semibold tabular-nums',
            value ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {value.toLocaleString('en-IN')} MP
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="mb-2 ml-9 rounded-lg bg-muted/50 px-3 py-2">
          {m.leader_name ? (
            <p className="mb-1 text-ds-caption text-muted-foreground">Team of {m.leader_name}</p>
          ) : null}
          {m.breakdown.length ? (
            <ul className="space-y-1">
              {m.breakdown.map((b) => (
                <li key={b.label} className="flex items-baseline justify-between gap-3 text-ds-caption">
                  <span className="min-w-0 truncate text-foreground">
                    {b.label} <span className="text-muted-foreground">× {b.count}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">+{b.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ds-caption text-muted-foreground">No points this month yet.</p>
          )}
        </div>
      ) : null}
    </li>
  )
}

/** Admin: how many MYLE Points each team member / leader has — today, this week, this month. */
export function MemberPointsCard() {
  const { data, isPending, isError } = useAdminMemberPointsQuery()
  const [period, setPeriod] = useState<Period>('month')
  const [expanded, setExpanded] = useState(false)

  const members = [...(data?.members ?? [])].sort((a, b) => b[period] - a[period] || b.month - a.month)
  const shown = expanded ? members : members.slice(0, COLLAPSED)
  const total = members.reduce((sum, m) => sum + m[period], 0)
  const earning = members.filter((m) => m[period] > 0).length

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Users className="size-4 text-primary" aria-hidden />
          <span>Points by member</span>
          {data ? (
            <span className="ml-auto text-ds-caption font-normal tabular-nums text-muted-foreground">
              {total.toLocaleString('en-IN')} MP · {earning}/{members.length} earning
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1.5" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'h-8 rounded-full border px-3 text-ds-caption font-medium transition-colors',
                period === p.key
                  ? 'border-foreground/30 bg-foreground/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <p className="text-ds-caption text-muted-foreground">Points are unavailable right now.</p>
        ) : !members.length ? (
          <InlineEmpty>No team members yet.</InlineEmpty>
        ) : (
          <ul className="divide-y divide-border/60">
            {shown.map((m, i) => (
              <MemberRow key={m.user_id} m={m} rank={i + 1} period={period} />
            ))}
          </ul>
        )}
        {members.length > COLLAPSED ? (
          <button
            type="button"
            className="h-9 w-full rounded-lg text-ds-caption font-semibold text-primary hover:bg-primary/5"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Show less' : `Show all ${members.length}`}
          </button>
        ) : null}
      </CardContent>
    </Card>
  )
}
