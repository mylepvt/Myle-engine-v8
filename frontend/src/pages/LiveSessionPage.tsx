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

function buildWhatsAppMessage(slots: ScheduleSlot[], link: string): string {
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
    const end = new Date(s.live_ends_at).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Kolkata', hour12: true,
    })
    const badge = s.state === 'live' ? '🔴 LIVE NOW' : s.state === 'waiting' ? '⏳ Starting soon' : '🎯'
    return `${badge} *${start}* – ${end}`
  })

  return [
    `🎬 *Myle Private Live Session — ${today}*`,
    ``,
    `📅 *Today's Schedule:*`,
    ...lines,
    ``,
    `🔗 *Join link (same for all sessions):*`,
    link,
    ``,
    `_Session runs for 49 minutes. Join on time — no replay._`,
  ].join('\n')
}

function SlotCard({ slot, link }: { slot: ScheduleSlot; link: string }) {
  const [copied, setCopied] = useState(false)

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
          {slot.viewer_count_today > 0 && (
            <span className="text-xs text-muted-foreground">· {slot.viewer_count_today} viewers</span>
          )}
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
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
          <p className="flex-1 truncate text-xs text-[#c9d9ff]">{link}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-white/20"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
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

  const link = `${window.location.origin}/premiere`
  const [msgCopied, setMsgCopied] = useState(false)

  function handleCopyMessage() {
    if (!data) return
    const msg = buildWhatsAppMessage(data.slots, link)
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
          <p className="mt-0.5 text-xs text-muted-foreground">Same link for all sessions — copy per slot to share with prospect</p>
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
              <SlotCard key={slot.hour} slot={slot} link={link} />
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
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-[#c9d9ff]">
            {buildWhatsAppMessage(data.slots, link)}
          </pre>
        </div>
      )}
    </div>
  )
}
