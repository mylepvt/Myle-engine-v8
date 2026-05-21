import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle, Clock, UserCheck, UserX } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { CheckInWidget } from '@/components/dashboard/CheckInWidget'
import { useTeamCheckInsQuery, type TeamCheckInEntry } from '@/hooks/use-checkin-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDuration(min: number | null) {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

type StatusBadgeProps = { status: TeamCheckInEntry['status']; isSuspicious?: boolean }
function StatusBadge({ status, isSuspicious }: StatusBadgeProps) {
  const map = {
    active:  { label: 'Active',   cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    away:    { label: 'Away',     cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    done:    { label: 'Done',     cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
    absent:  { label: 'Absent',   cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  }
  const s = map[status] ?? map.absent
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', s.cls)}>
        {s.label}
      </span>
      {isSuspicious && status !== 'absent' && (
        <AlertTriangle className="h-3 w-3 text-amber-400" title="GPS may be inaccurate" />
      )}
    </div>
  )
}

function MemberRow({ entry }: { entry: TeamCheckInEntry }) {
  return (
    <tr className="border-b border-white/[0.06] transition-colors hover:bg-white/[0.03]">
      <td className="px-4 py-3 text-sm font-medium text-foreground/90">{entry.actor}</td>
      <td className="px-4 py-3"><StatusBadge status={entry.status} isSuspicious={entry.is_suspicious} /></td>
      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{formatTime(entry.check_in_at)}</td>
      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{formatTime(entry.check_out_at)}</td>
      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{formatDuration(entry.work_duration_minutes)}</td>
    </tr>
  )
}

function MemberCard({ entry }: { entry: TeamCheckInEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground/90 truncate">{entry.actor}</p>
        <p className="mt-0.5 text-xs text-muted-foreground/60">
          {entry.check_in_at ? `In ${formatTime(entry.check_in_at)}` : 'Not checked in'}
          {entry.check_out_at ? ` · Out ${formatTime(entry.check_out_at)}` : ''}
          {entry.work_duration_minutes != null ? ` · ${formatDuration(entry.work_duration_minutes)}` : ''}
        </p>
      </div>
      <StatusBadge status={entry.status} isSuspicious={entry.is_suspicious} />
    </div>
  )
}

export function TeamAttendancePage({ title }: Props) {
  const navigate = useNavigate()
  const [date, setDate] = useState(todayIso())
  const isToday = date === todayIso()

  const { data, isPending, isError, error, isFetching, refetch } = useTeamCheckInsQuery(
    isToday ? undefined : date,
  )

  const sorted = [...(data?.items ?? [])].sort((a, b) => {
    const order = { active: 0, away: 1, done: 2, absent: 3 }
    return (order[a.status] ?? 4) - (order[b.status] ?? 4)
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="text-sm text-primary hover:underline underline-offset-2">
            ← Back
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-muted-foreground transition hover:bg-white/[0.08] disabled:opacity-40"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
        </button>
      </div>

      {/* My check-in widget */}
      <CheckInWidget />

      {/* Date picker + stats */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-white/[0.12] bg-muted/60 px-3 py-1.5 text-foreground text-sm"
          />
        </label>
        {data && (
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5 text-emerald-400" /> {data.checked_in}/{data.total} checked in
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-sky-400" /> {data.active} active
            </span>
            <span className="flex items-center gap-1">
              <UserX className="h-3.5 w-3.5 text-rose-400" /> {data.total - data.checked_in} absent
            </span>
          </div>
        )}
      </div>

      {isPending && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}
          <button type="button" className="ml-2 underline underline-offset-2" onClick={() => void refetch()}>Retry</button>
        </div>
      )}

      {/* Desktop table */}
      {data && sorted.length > 0 && (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-white/[0.08] md:block">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                  {['Name', 'Status', 'Check In', 'Check Out', 'Duration'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => <MemberRow key={e.user_id} entry={e} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {sorted.map((e) => <MemberCard key={e.user_id} entry={e} />)}
          </div>
        </>
      )}

      {data && sorted.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground/50">No team members found.</p>
      )}
    </div>
  )
}
