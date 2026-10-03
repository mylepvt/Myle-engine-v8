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
  useNudgeMemberMutation,
} from '@/hooks/use-control-room-query'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

const STATUS: Record<MemberStatus, { label: string; dot: string; chip: string }> = {
  not_started: { label: 'Not started', dot: 'bg-destructive', chip: 'border-destructive/30 bg-destructive/10 text-destructive-ink' },
  idle: { label: 'Gone quiet', dot: 'bg-warning', chip: 'border-warning/30 bg-warning/10 text-warning-ink' },
  working: { label: 'Working', dot: 'bg-success', chip: 'border-success/30 bg-success/10 text-success-ink' },
  done: { label: 'Target hit', dot: 'bg-primary', chip: 'border-primary/30 bg-primary/10 text-primary' },
}
const ORDER: MemberStatus[] = ['not_started', 'idle', 'working', 'done']
const COLLAPSED = 6

function detail(m: ControlRoomMember, target: number): string {
  if (m.status === 'not_started') {
    const seen = m.last_seen_at ? `seen ${formatRelativeTimeShort(m.last_seen_at)}` : 'not seen'
    return `0/${target} calls · ${seen}`
  }
  const last = m.last_work_at ? ` · active ${formatRelativeTimeShort(m.last_work_at)}` : ''
  return `${m.calls_today}/${target} calls${last}`
}

function MemberRow({ m, target }: { m: ControlRoomMember; target: number }) {
  const nudge = useNudgeMemberMutation()
  const cooling = m.nudge_available_at != null && new Date(m.nudge_available_at).getTime() > Date.now()
  const first = m.name.split(' ')[0]
  const praise = m.status === 'working' || m.status === 'done'

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
      <span className={cn('size-2.5 shrink-0 rounded-full', STATUS[m.status].dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {m.name}
          {m.role === 'leader' ? <span className="ml-1 text-ds-caption text-muted-foreground">(leader)</span> : null}
        </p>
        <p className="truncate text-ds-caption text-muted-foreground">{detail(m, target)}</p>
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

/** Live "who is working, who is stuck" for leaders and admins, with one-tap nudges. */
export function ControlRoomCard() {
  const { data, isPending, isError } = useControlRoomQuery()
  const [filter, setFilter] = useState<MemberStatus | null>(null)
  const [expanded, setExpanded] = useState(false)

  const list = data ? data.members.filter((m) => !filter || m.status === filter) : []
  const shown = expanded ? list : list.slice(0, COLLAPSED)

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-ds-h3">
          <Radar className="size-4 text-primary" aria-hidden />
          Team right now
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
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Filter by status">
              {ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filter === s}
                  onClick={() => setFilter((f) => (f === s ? null : s))}
                  className={cn(
                    'rounded-lg border px-1 py-1.5 text-center transition-colors',
                    STATUS[s].chip,
                    filter && filter !== s && 'opacity-40',
                  )}
                >
                  <span className="block text-ds-h3 font-bold tabular-nums leading-none">{data.counts[s]}</span>
                  <span className="mt-0.5 block text-ds-micro font-semibold">{STATUS[s].label}</span>
                </button>
              ))}
            </div>
            {list.length ? (
              <ul className="divide-y divide-border/60">
                {shown.map((m) => <MemberRow key={m.user_id} m={m} target={data.call_target} />)}
              </ul>
            ) : (
              <p className="text-ds-caption text-muted-foreground">Nobody here right now.</p>
            )}
            {list.length > COLLAPSED ? (
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
