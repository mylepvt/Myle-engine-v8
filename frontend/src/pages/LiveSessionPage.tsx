import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'

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

function slotLink(baseOrigin: string, hour: number): string {
  return `${baseOrigin}/premiere?slot=${hour}`
}

function buildWhatsAppMessage(slots: ScheduleSlot[], baseOrigin: string): string {
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
    return `${badge} *${start}* — ${slotLink(baseOrigin, s.hour)}`
  })

  return [
    `🎬 *Myle Private Live Session — ${today}*`,
    ``,
    `📅 *Aaj ke sessions (apne time ka link share karo):*`,
    ...lines,
    ``,
    `_Session 49 minute ka hai. Time pe join karo — no replay._`,
  ].join('\n')
}

function SlotCard({ slot, baseOrigin }: { slot: ScheduleSlot; baseOrigin: string }) {
  const [copied, setCopied] = useState(false)
  const link = slotLink(baseOrigin, slot.hour)

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
      className={`rounded-xl border px-4 py-3 transition-colors ${
        slot.state === 'live'
          ? 'border-red-500/30 bg-red-500/[0.06]'
          : slot.state === 'waiting'
          ? 'border-indigo-500/30 bg-indigo-500/[0.06]'
          : slot.state === 'past'
          ? 'border-white/[0.06] opacity-50'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">{startTime}</span>
          <span className="text-xs text-muted-foreground">→ {endTime}</span>
          {slot.live_viewer_count > 0 ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-400">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
              </span>
              {slot.live_viewer_count} live
            </span>
          ) : slot.viewer_count_today > 0 ? (
            <span className="text-xs text-muted-foreground">· {slot.viewer_count_today} registered</span>
          ) : null}
        </div>
        {slot.state === 'live' ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-red-400">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
            </span>
            Live
          </span>
        ) : slot.state === 'waiting' ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Starting soon</span>
        ) : slot.state === 'past' ? (
          <span className="text-[10px] text-muted-foreground">Done</span>
        ) : null}
      </div>

      {slot.state !== 'past' && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/50 px-3 py-2">
          <p className="flex-1 truncate text-xs text-primary">{link}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted/80"
          >
            {copied ? 'Copied!' : 'Copy'}
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
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance History</p>
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
                  <td className="py-2 pr-4 text-muted-foreground">{v.masked_phone}</td>
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

export function LiveSessionPage({ title }: Props) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['premiere', 'schedule'],
    queryFn: fetchSchedule,
    refetchInterval: 30_000,
  })

  const baseOrigin = window.location.origin
  const [msgCopied, setMsgCopied] = useState(false)

  function handleCopyMessage() {
    if (!data) return
    const msg = buildWhatsAppMessage(data.slots, baseOrigin)
    void navigator.clipboard.writeText(msg).then(() => {
      setMsgCopied(true)
      setTimeout(() => setMsgCopied(false), 2000)
    })
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {data?.active_hour != null && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
            </span>
            Live now
          </span>
        )}
      </div>

      {/* Today's schedule — each slot with its own link */}
      <div className="surface-elevated space-y-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today's Schedule</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Har slot ka alag link — prospect ko usi session ka link bhejo jis time bulaya hai</p>
        </div>

        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load schedule'}
          </p>
        ) : data ? (
          <div className="space-y-2">
            {data.slots.map((slot) => (
              <SlotCard key={slot.hour} slot={slot} baseOrigin={baseOrigin} />
            ))}
          </div>
        ) : null}
      </div>

      {/* WhatsApp message */}
      {data && (
        <div className="surface-elevated space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">WhatsApp Message</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Copy and paste into your group — includes today's upcoming sessions and join link</p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={handleCopyMessage} disabled={!data}>
              {msgCopied ? '✓ Copied!' : 'Copy for WhatsApp'}
            </Button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-xs text-foreground">
            {buildWhatsAppMessage(data.slots, baseOrigin)}
          </pre>
        </div>
      )}

      {/* Attendance history */}
      <AttendanceHistory slots={data?.slots ?? []} />
    </div>
  )
}
