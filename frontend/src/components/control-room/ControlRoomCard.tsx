import { useState } from 'react'
import { BellRing, Check, Radar } from 'lucide-react'
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
import { cn } from '@/lib/utils'

const STATUS: Record<MemberStatus, { label: string; dot: string; chip: string }> = {
  not_started: { label: 'Not started', dot: 'bg-destructive', chip: 'border-destructive/30 bg-destructive/10 text-destructive-ink' },
  idle: { label: 'Stopped', dot: 'bg-warning', chip: 'border-warning/30 bg-warning/10 text-warning-ink' },
  working: { label: 'Working', dot: 'bg-success', chip: 'border-success/30 bg-success/10 text-success-ink' },
  done: { label: 'Target done', dot: 'bg-primary', chip: 'border-primary/30 bg-primary/10 text-primary' },
}
const ORDER: MemberStatus[] = ['not_started', 'idle', 'working', 'done']
const COLLAPSED = 6

type Filter = MemberStatus | 'no_leads' | null

const isWorking = (m: ControlRoomMember) => m.status === 'working' || m.status === 'done'

function MemberRow({ m, target }: { m: ControlRoomMember; target: number }) {
  const nudge = useNudgeMemberMutation()
  const cooling = m.nudge_available_at != null && new Date(m.nudge_available_at).getTime() > Date.now()
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
    <li className="flex items-center gap-3 py-2">
      <span className={cn('size-2.5 shrink-0 rounded-full', STATUS[m.status].dot)} title={STATUS[m.status].label} aria-label={STATUS[m.status].label} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {m.name}
          {m.role === 'leader' ? <span className="ml-1 text-ds-caption text-muted-foreground">(leader)</span> : null}
        </p>
        <p className="truncate text-ds-caption text-muted-foreground">
          {m.calls_today}/{target} calls ·{' '}
          {m.leads_today > 0 ? (
            `${m.leads_today} leads today`
          ) : (
            <span className="font-semibold text-destructive-ink">No leads today</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onNudge}
        disabled={cooling || nudge.isPending}
        aria-label={cooling ? `${first} nudged` : `${praise ? 'Cheer' : 'Nudge'} ${first}`}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-ds-caption font-semibold transition-all active:scale-95 disabled:opacity-60',
          cooling ? 'border-border text-muted-foreground' : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20',
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

/** One block per leader: the leader first, then their team. Weakest team first. */
function LeaderGroups({ members, target }: { members: ControlRoomMember[]; target: number }) {
  const byLeader = new Map<number | null, ControlRoomMember[]>()
  for (const m of members) byLeader.set(m.leader_id, [...(byLeader.get(m.leader_id) ?? []), m])
  const groups = [...byLeader.entries()].map(([leaderId, list]) => {
    const leader = list.find((m) => m.user_id === leaderId)
    const rest = list.filter((m) => m.user_id !== leaderId)
    return {
      key: leaderId ?? 'none',
      title: leader ? `${leader.name}'s team` : 'No leader',
      list: leader ? [leader, ...rest] : rest,
      working: list.filter(isWorking).length,
    }
  })
  groups.sort((a, b) => a.working / a.list.length - b.working / b.list.length)
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-1">
            <h3 className="truncate text-sm font-semibold text-foreground">{g.title}</h3>
            <span className="shrink-0 text-ds-caption text-muted-foreground">
              {g.working}/{g.list.length} working
            </span>
          </div>
          <MemberList members={g.list} target={target} />
        </section>
      ))}
    </div>
  )
}

/**
 * Who is working today, who has leads, and a nudge for anyone who is not.
 * Leaders see their team; admins (groupByLeader) see every team under its leader.
 */
export function ControlRoomCard({ groupByLeader = false }: { groupByLeader?: boolean }) {
  const { data, isPending, isError } = useControlRoomQuery()
  const nudgeAll = useNudgeAllMutation()
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
        (m) => !isWorking(m) && !(m.nudge_available_at && new Date(m.nudge_available_at).getTime() > Date.now()),
      ).length
    : 0
  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? null : f))

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
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Radar className="size-4 text-primary" aria-hidden />
          Today: who is working
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
        ) : isError ? (
          <p className="text-ds-caption text-muted-foreground">Team status is unavailable right now.</p>
        ) : !data.members.length ? (
          <p className="text-ds-caption text-muted-foreground">No active members in your team yet.</p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              <span className="font-semibold">{working}</span> of {data.members.length} working
              {notWorking ? (
                <>
                  {' · '}
                  <span className="font-semibold text-destructive-ink">{notWorking} not working</span>
                </>
              ) : null}
              {data.no_leads ? (
                <>
                  {' · '}
                  <span className="font-semibold text-destructive-ink">{data.no_leads} with no leads today</span>
                </>
              ) : null}
            </p>

            {notWorking > 0 ? (
              <button
                type="button"
                onClick={onNudgeAll}
                disabled={nudgeAll.isPending || nudgeable === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-60"
              >
                <BellRing className="size-4" aria-hidden />
                {nudgeable ? `Nudge all ${nudgeable} not working` : 'Everyone not working was nudged'}
              </button>
            ) : null}

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter">
              {ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filter === s}
                  onClick={() => toggle(s)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-ds-caption font-semibold transition-opacity',
                    STATUS[s].chip,
                    filter && filter !== s && 'opacity-40',
                  )}
                >
                  {STATUS[s].label} {data.counts[s]}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={filter === 'no_leads'}
                onClick={() => toggle('no_leads')}
                className={cn(
                  'rounded-full border border-border px-2.5 py-1 text-ds-caption font-semibold text-foreground transition-opacity',
                  filter && filter !== 'no_leads' && 'opacity-40',
                )}
              >
                No leads today {data.no_leads}
              </button>
            </div>

            {!list.length ? (
              <p className="text-ds-caption text-muted-foreground">Nobody here right now.</p>
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
