import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { cn } from '@/lib/utils'

type ScheduleSlot = {
  hour: number
  label: string
  state: 'past' | 'upcoming' | 'waiting' | 'live'
  live_starts_at: string
  live_ends_at: string
  viewer_count_today: number
  live_viewer_count: number
}

type ViewerRecord = {
  viewer_id: string
  name: string
  masked_phone: string
  phone: string | null
  city: string
  session_date: string
  session_hour: number
  percentage_watched: number
  watch_completed: boolean
  lead_score: number
  first_seen_at: string | null
  last_seen_at: string | null
  referred_by_name: string | null
}

async function fetchViewers(date: string, hour: number | null): Promise<ViewerRecord[]> {
  const params = new URLSearchParams({ date })
  if (hour !== null) params.set('hour', String(hour))
  const res = await apiFetch(`/api/v1/other/premiere/viewers?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<ViewerRecord[]>
}

type ScheduleResponse = {
  slots: ScheduleSlot[]
  premiere_link: string
  active_hour: number | null
}

async function fetchSchedule(): Promise<ScheduleResponse> {
  const res = await apiFetch('/api/v1/other/premiere/schedule')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<ScheduleResponse>
}

function slotLink(baseOrigin: string, hour: number, day: number): string {
  return `${baseOrigin}/premiere?day=${day}&slot=${hour}`
}

function buildWhatsAppMessage(slots: ScheduleSlot[], baseOrigin: string, day: number): string {
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Asia/Kolkata',
  })

  const upcoming = slots.filter((s) => s.state !== 'past')

  const lines = upcoming.map((s) => {
    const start = new Date(s.live_starts_at).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    })
    const badge = s.state === 'live' ? '🔴 LIVE NOW' : s.state === 'waiting' ? '⏳ Starting soon' : '🎯'
    return `${badge} *${start}* — ${slotLink(baseOrigin, s.hour, day)}`
  })

  return [
    `🎬 *Myle Day ${day} Live Session — ${today}*`,
    ``,
    `📅 *Aaj ke sessions (apne time ka link share karo):*`,
    ...lines,
    ``,
    `_Session 49 minute ka hai. Time pe join karo — no replay._`,
  ].join('\n')
}

function SlotCard({ slot, baseOrigin, day }: { slot: ScheduleSlot; baseOrigin: string; day: number }) {
  const [copied, setCopied] = useState(false)
  const link = slotLink(baseOrigin, slot.hour, day)
  const isLive = slot.state === 'live'
  const isWaiting = slot.state === 'waiting'
  const isPast = slot.state === 'past'

  const startTime = new Date(slot.live_starts_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: true,
  })
  const endTime = new Date(slot.live_ends_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: true,
  })

  function handleCopy() {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        isLive ? 'border-red-500/30 bg-red-500/[0.05]' :
        isWaiting ? 'border-indigo-400/30 bg-indigo-400/[0.05]' :
        isPast ? 'border-border/40 opacity-50' :
        'border-border bg-card/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn(
            'text-[22px] font-black tabular-nums leading-none',
            isLive ? 'text-red-300' : isWaiting ? 'text-indigo-300' : 'text-foreground',
          )}>
            {startTime}
          </p>
          <p className="mt-1 text-ds-caption text-muted-foreground">→ {endTime}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          {isLive ? (
            <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
              </span>
              Live
            </span>
          ) : isWaiting ? (
            <span className="rounded-full border border-indigo-400/25 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
              Starting soon
            </span>
          ) : isPast ? (
            <span className="text-[10px] text-muted-foreground/50">Done</span>
          ) : (
            <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              Upcoming
            </span>
          )}
          {slot.live_viewer_count > 0 ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
              </span>
              {slot.live_viewer_count} live
            </span>
          ) : slot.viewer_count_today > 0 ? (
            <span className="text-[10px] text-muted-foreground">{slot.viewer_count_today} reg.</span>
          ) : null}
        </div>
      </div>

      {!isPast && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
          <p className="flex-1 truncate font-mono text-[11px] text-primary">{link}</p>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-bold transition-all',
              copied
                ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                : 'border-border bg-muted/50 text-foreground hover:border-primary/40 hover:text-primary',
            )}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}

function AttendanceHistory({ slots }: { slots: ScheduleSlot[] }) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [histDate, setHistDate] = useState(todayStr)
  const [histHour, setHistHour] = useState<number | null>(null)

  const viewersQ = useQuery({
    queryKey: ['premiere', 'viewers', histDate, histHour],
    queryFn: () => fetchViewers(histDate, histHour),
    staleTime: 20_000,
  })

  const viewers = viewersQ.data ?? []

  return (
    <div className="surface-elevated space-y-4 p-5">
      <div>
        <p className="text-ds-label uppercase text-muted-foreground">Attendance History</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Slot-wise prospects jo session mein aaye</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          value={histDate}
          max={todayStr}
          onChange={(e) => setHistDate(e.target.value)}
          className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
        />
        <select
          value={histHour ?? ''}
          onChange={(e) => setHistHour(e.target.value === '' ? null : Number(e.target.value))}
          className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
        >
          <option value="">All slots</option>
          {slots.map((s) => (
            <option key={s.hour} value={s.hour}>{s.label}</option>
          ))}
        </select>
      </div>

      {viewersQ.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : viewersQ.isError ? (
        <p className="text-sm text-destructive">Could not load viewers</p>
      ) : viewers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Koi viewer nahi mila is slot ke liye.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Phone</th>
                <th className="pb-2 pr-4 font-medium">Slot</th>
                <th className="pb-2 pr-4 font-medium">Watched</th>
                <th className="pb-2 pr-4 font-medium">Score</th>
                <th className="pb-2 font-medium">Leader</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {viewers.map((v) => (
                <tr key={`${v.viewer_id}-${v.session_hour}`} className="text-foreground">
                  <td className="py-2 pr-4 font-medium">{v.name || '—'}</td>
                  <td className="py-2 pr-4 font-mono text-muted-foreground">{v.phone ?? v.masked_phone}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{v.session_hour}:00</td>
                  <td className="py-2 pr-4">
                    {v.watch_completed ? (
                      <span className="text-green-400">✓ Full</span>
                    ) : (
                      <span className="text-muted-foreground">{v.percentage_watched.toFixed(0)}%</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`font-semibold ${v.lead_score >= 60 ? 'text-green-400' : v.lead_score >= 30 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {v.lead_score}
                    </span>
                  </td>
                  <td className="py-2 text-muted-foreground">{v.referred_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted-foreground">{viewers.length} viewers</p>
        </div>
      )}
    </div>
  )
}

type Props = { title: string }

const DAY_LABELS: Record<number, string> = {
  1: 'Day 1 — Power of Digital India',
  2: 'Day 2 — Secret Industry Reveal',
  3: 'Day 3 — Final Day',
}

function DayScheduleSection({
  day,
  slots,
  baseOrigin,
  isPending,
  isError,
  error,
}: {
  day: number
  slots: ScheduleSlot[]
  baseOrigin: string
  isPending: boolean
  isError: boolean
  error: Error | null
}) {
  const [msgCopied, setMsgCopied] = useState(false)

  function handleCopyMessage() {
    const msg = buildWhatsAppMessage(slots, baseOrigin, day)
    void navigator.clipboard.writeText(msg).then(() => {
      setMsgCopied(true)
      setTimeout(() => setMsgCopied(false), 2000)
    })
  }

  return (
    <div className="surface-elevated space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-ds-label uppercase text-muted-foreground">
            {DAY_LABELS[day] ?? `Day ${day}`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Prospect ko Day {day} ka link bhejo — har slot ka alag link
          </p>
        </div>
        {slots.length > 0 && (
          <Button type="button" size="sm" variant="secondary" onClick={handleCopyMessage}>
            {msgCopied ? '✓ Copied!' : `Copy D${day} WA msg`}
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Could not load schedule'}
        </p>
      ) : (
        <div className="space-y-2">
          {slots.map((slot) => (
            <SlotCard key={slot.hour} slot={slot} baseOrigin={baseOrigin} day={day} />
          ))}
        </div>
      )}
    </div>
  )
}

export function LiveSessionPage({ title }: Props) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['premiere', 'schedule'],
    queryFn: fetchSchedule,
    refetchInterval: 30_000,
  })
  const authMe = useAuthMeQuery()
  const isAdmin = authMe.data?.role === 'admin'

  const baseOrigin = window.location.origin

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-ds-h1">{title}</h1>
        {data?.active_hour != null && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-ds-label font-bold uppercase text-white">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
            </span>
            Live now
          </span>
        )}
      </div>

      {/* 3 day sections — same time slots, different day param in links */}
      {([1, 2, 3] as const).map((day) => (
        <DayScheduleSection
          key={day}
          day={day}
          slots={data?.slots ?? []}
          baseOrigin={baseOrigin}
          isPending={isPending}
          isError={isError}
          error={error instanceof Error ? error : null}
        />
      ))}

      {/* Attendance history — admin only */}
      {isAdmin && <AttendanceHistory slots={data?.slots ?? []} />}
    </div>
  )
}
