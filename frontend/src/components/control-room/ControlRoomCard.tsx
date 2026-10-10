import { useState } from 'react'
import { BellRing, Check, ChevronDown, Radar } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type ControlRoomMember,
  type MemberStatus,
  NudgeFailed,
  useControlRoomQuery,
  useNudgeAllMutation,
  useNudgeMemberMutation,
} from '@/hooks/use-control-room-query'
import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'
import { InlineEmpty } from '@/components/ui/states'

const STATUS: Record<MemberStatus, { label: string; dot: string }> = {
  not_started: { label: 'Not started', dot: 'bg-destructive' },
  idle: { label: 'Stopped', dot: 'bg-warning' },
  working: { label: 'Working', dot: 'bg-success' },
  done: { label: 'Target done', dot: 'bg-primary' },
}
const ORDER: MemberStatus[] = ['not_started', 'idle', 'working', 'done']
const COLLAPSED = 6
// Before this IST hour "not started" is normal, so the card stays calm (no red).
const DAY_STARTS_HOUR = 11

function istHour(ms: number) {
  return Number(new Date(ms).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }))
}

type Filter = MemberStatus | 'no_leads' | null

const isWorking = (m: ControlRoomMember) => m.status === 'working' || m.status === 'done'

function MemberRow({ m, target }: { m: ControlRoomMember; target: number }) {
  const nudge = useNudgeMemberMutation()
  const now = useNow()
  const cooling = m.nudge_available_at != null && new Date(m.nudge_available_at).getTime() > now
  const first = m.name.split(' ')[0]
  const praise = isWorking(m)

  const onNudge = () =>
    nudge.mutate(m.user_id, {
      onSuccess: (r) =>
        r.delivered
          ? toast.success(`${praise ? 'Cheer' : 'Nudge'} sent to ${first}`)
          : toast.warning(`${first} has notifications off. Give them a call instead.`),
      onError: (e) =>
        toast.error(e instanceof NudgeFailed && e.status === 429 ? `${first} was nudged recently.` : 'Could not send. Try again.'),
    })

  return (
    <li className="flex min-h-14 items-center gap-3 py-2">
      <span className={cn('size-2 shrink-0 rounded-full', STATUS[m.status].dot)} title={STATUS[m.status].label} aria-label={STATUS[m.status].label} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ds-body font-medium text-foreground">
          {m.name}
          {m.role === 'leader' ? <span className="ml-1.5 text-ds-caption font-normal text-muted-foreground">Leader</span> : null}
        </p>
        <p className="truncate text-ds-caption font-normal text-muted-foreground">
          {m.calls_today}/{target} calls · {m.leads_today > 0 ? `${m.leads_today} leads today` : 'No leads today'}
        </p>
      </div>
      <button
        type="button"
        onClick={onNudge}
        disabled={cooling || nudge.isPending}
        aria-label={cooling ? `${first} nudged` : `${praise ? 'Cheer' : 'Nudge'} ${first}`}
        className={cn(
          'flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-ds-caption font-semibold transition-all active:scale-95 disabled:opacity-60',
          cooling ? 'text-muted-foreground' : 'bg-primary/10 text-primary hover:bg-primary/20',
        )}
      >
        {cooling ? <Check className="size-3.5" aria-hidden /> : <BellRing className="size-3.5" aria-hidden />}
        {cooling ? 'Sent' : praise ? 'Cheer' : 'Nudge'}
      </button>
    </li>
  )
}

function MemberList({ members, target }: { members: ControlRoomMember[]; target: number }) {
  return (
    <ul className="divide-y divide-border/60">
      {members.map((m) => <MemberRow key={m.user_id} m={m} target={target} />)}
    </ul>
  )
}

/** One row per team (weakest first); tap to see the members. */
function LeaderGroups({ members, target }: { members: ControlRoomMember[]; target: number }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const byLeader = new Map<number | null, ControlRoomMember[]>()
  for (const m of members) byLeader.set(m.leader_id, [...(byLeader.get(m.leader_id) ?? []), m])
  const groups = [...byLeader.entries()].map(([leaderId, list]) => {
    const leader = list.find((m) => m.user_id === leaderId)
    const rest = list.filter((m) => m.user_id !== leaderId)
    return {
      key: String(leaderId ?? 'none'),
      title: leader ? `${leader.name}'s team` : 'No leader',
      list: leader ? [leader, ...rest] : rest,
      working: list.filter(isWorking).length,
    }
  })
  groups.sort((a, b) => a.working / a.list.length - b.working / b.list.length)
  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return (
    <ul className="divide-y divide-border/60 rounded-xl border border-border/60">
      {groups.map((g) => {
        const isOpen = open.has(g.key)
        return (
          <li key={g.key}>
            <button
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              className="flex min-h-12 w-full items-center gap-3 px-3 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-ds-body font-medium text-foreground">{g.title}</span>
              <span className="shrink-0 text-ds-caption tabular-nums text-muted-foreground">
                {g.working}/{g.list.length} working
              </span>
              <ChevronDown
                className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                aria-hidden
              />
            </button>
            {isOpen ? (
              <div className="border-t border-border/60 px-3">
                <MemberList members={g.list} target={target} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Who is working today, who has leads, and a nudge for anyone who is not.
 * Leaders see their team; admins (groupByLeader) see every team under its leader.
 */
export function ControlRoomCard({ groupByLeader = false }: { groupByLeader?: boolean }) {
  const { data, isPending, isError } = useControlRoomQuery()
  const nudgeAll = useNudgeAllMutation()
  const now = useNow()
  const [filter, setFilter] = useState<Filter>(null)
  const [expanded, setExpanded] = useState(false)

  const list = data
    ? data.members.filter((m) => !filter || (filter === 'no_leads' ? m.leads_today === 0 : m.status === filter))
    : []
  const shown = expanded || groupByLeader ? list : list.slice(0, COLLAPSED)
  const notWorking = data ? data.counts.not_started + data.counts.idle : 0
  const working = data ? data.counts.working + data.counts.done : 0
  const nudgeable = data
    ? data.members.filter(
        (m) => !isWorking(m) && !(m.nudge_available_at && new Date(m.nudge_available_at).getTime() > now),
      ).length
    : 0
  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? null : f))
  const early = istHour(now) < DAY_STARTS_HOUR

  const onNudgeAll = () =>
    nudgeAll.mutate(undefined, {
      onSuccess: (r) => {
        const parts = [`Nudge sent to ${r.sent}`]
        if (r.notifications_off) parts.push(`${r.notifications_off} have notifications off`)
        if (r.skipped) parts.push(`${r.skipped} were nudged recently`)
        toast.success(parts.join(' · '))
      },
      onError: () => toast.error('Could not send. Try again.'),
    })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Radar className="size-4 text-primary" aria-hidden />
          Today: who is working
          {data?.members.length ? (
            <span className="ml-auto text-ds-caption font-medium tabular-nums text-muted-foreground">
              {working}/{data.members.length}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
        ) : isError ? (
          <p className="text-ds-caption text-muted-foreground">Team status is unavailable right now.</p>
        ) : !data.members.length ? (
          <InlineEmpty>No active members in your team yet.</InlineEmpty>
        ) : (
          <>
            <div className="space-y-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-success transition-[width]"
                  style={{ width: `${Math.round((working / data.members.length) * 100)}%` }}
                />
              </div>
              <p className="text-ds-caption text-muted-foreground">
                {early && working === 0 ? (
                  <>The day is starting — nobody has begun yet.</>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">{working}</span> working
                    {notWorking ? (
                      <>
                        {' · '}
                        <span className={cn('font-semibold', early ? 'text-foreground' : 'text-destructive-ink')}>
                          {notWorking}
                        </span>{' '}
                        not working
                      </>
                    ) : null}
                  </>
                )}
                {data.no_leads ? <> · {data.no_leads} without leads</> : null}
              </p>
            </div>

            {notWorking > 0 ? (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={onNudgeAll}
                  disabled={nudgeAll.isPending || nudgeable === 0}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-ds-body font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  <BellRing className="size-4" aria-hidden />
                  {nudgeable ? `Nudge ${nudgeable} not working` : 'Everyone not working was nudged'}
                </button>
                {nudgeable && notWorking > nudgeable ? (
                  <p className="text-center text-ds-caption text-muted-foreground">
                    {notWorking - nudgeable} already nudged in the last hour
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
              {ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filter === s}
                  onClick={() => toggle(s)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-full border px-3 text-ds-caption font-medium transition-colors',
                    filter === s
                      ? 'border-foreground/30 bg-foreground/10 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', STATUS[s].dot)} aria-hidden />
                  {STATUS[s].label}
                  <span className="tabular-nums text-foreground">{data.counts[s]}</span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={filter === 'no_leads'}
                onClick={() => toggle('no_leads')}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full border px-3 text-ds-caption font-medium transition-colors',
                  filter === 'no_leads'
                    ? 'border-foreground/30 bg-foreground/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                No leads <span className="tabular-nums text-foreground">{data.no_leads}</span>
              </button>
            </div>

            {!list.length ? (
              <InlineEmpty>Nobody here right now.</InlineEmpty>
            ) : groupByLeader ? (
              <LeaderGroups members={shown} target={data.call_target} />
            ) : (
              <MemberList members={shown} target={data.call_target} />
            )}

            {!groupByLeader && list.length > COLLAPSED ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full text-center text-ds-caption font-semibold text-primary hover:underline"
              >
                {expanded ? 'Show less' : `Show all ${list.length}`}
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
