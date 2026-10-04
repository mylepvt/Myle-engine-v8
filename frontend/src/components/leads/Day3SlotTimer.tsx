import { useEffect, useState } from 'react'
import { Clock, ImageDown, X } from 'lucide-react'

import type { LeadPublic, usePatchLeadMutation } from '@/hooks/use-leads-query'
import { cn } from '@/lib/utils'

type PM = ReturnType<typeof usePatchLeadMutation>

const pad = (n: number) => String(n).padStart(2, '0')

export function remainingParts(deadline: Date, now: Date) {
  const ms = Math.max(0, deadline.getTime() - now.getTime())
  const total = Math.floor(ms / 1000)
  return { done: ms === 0, h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

/** "7:00 PM, today" / "11:00 AM, tomorrow" / "11:00 AM, Tue 6 Oct" */
export function deadlineLabel(deadline: Date, now = new Date()): string {
  const time = deadline.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (sameDay(deadline, now)) return `${time}, today`
  if (sameDay(deadline, tomorrow)) return `${time}, tomorrow`
  return `${time}, ${deadline.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`
}

/** Quick picks; past "today" times are skipped. */
export function quickPicks(now = new Date()): { label: string; at: Date }[] {
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now)
    d.setDate(now.getDate() + dayOffset)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const picks = [
    { label: 'In 2 hours', at: new Date(now.getTime() + 2 * 3600_000) },
    { label: '6 PM today', at: at(0, 18) },
    { label: '7 PM today', at: at(0, 19) },
    { label: 'Tomorrow 11 AM', at: at(1, 11) },
  ]
  return picks.filter((p) => p.at.getTime() > now.getTime() + 5 * 60_000)
}

/** Draws the share card the leader sends the prospect on WhatsApp. */
async function shareCardImage(opts: {
  name: string
  deadline: Date
  stage?: { label: string; price: string } | null
}): Promise<'shared' | 'downloaded'> {
  const W = 1080
  const H = 1350
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) throw new Error('Could not create the image')
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0b1533')
  bg.addColorStop(1, '#1b2f6b')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.textAlign = 'center'
  const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`

  g.fillStyle = '#7fa2ff'
  g.font = font(700, 40)
  g.fillText('MYLE COMMUNITY', W / 2, 140)
  g.fillStyle = '#ffffff'
  g.font = font(800, 84)
  g.fillText('Your slot is reserved', W / 2, 300)
  g.fillStyle = '#cfdaff'
  g.font = font(600, 56)
  g.fillText(opts.name.slice(0, 26), W / 2, 400)
  if (opts.stage) {
    g.fillStyle = '#ffd36a'
    g.font = font(700, 48)
    g.fillText(`${opts.stage.label} · ${opts.stage.price}`, W / 2, 490)
  }

  g.fillStyle = 'rgba(255,255,255,0.08)'
  g.beginPath()
  g.roundRect(120, 560, W - 240, 420, 48)
  g.fill()
  g.fillStyle = '#cfdaff'
  g.font = font(600, 44)
  g.fillText('Confirm your seat by', W / 2, 650)
  g.fillStyle = '#ffffff'
  g.font = font(800, 96)
  g.fillText(deadlineLabel(opts.deadline), W / 2, 780)
  const r = remainingParts(opts.deadline, new Date())
  g.fillStyle = '#ff8a8a'
  g.font = font(700, 56)
  g.fillText(`${pad(r.h)}h ${pad(r.m)}m left`, W / 2, 900)

  g.fillStyle = '#cfdaff'
  g.font = font(500, 40)
  g.fillText('After this time the slot goes to the next person.', W / 2, 1110)
  g.fillText('Seats are limited.', W / 2, 1170)

  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Could not create the image')
  const file = new File([blob], `slot-${opts.name.replace(/\s+/g, '-')}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return 'shared'
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return 'downloaded'
}

/**
 * Day 3 (leader/admin): give the prospect a fixed time to arrange payment —
 * a live countdown on the card and a share image that adds urgency.
 */
export function Day3SlotTimer({
  lead,
  pm,
  leadPatchBusy,
  stage,
}: {
  lead: LeadPublic
  pm: PM
  leadPatchBusy: boolean
  stage?: { label: string; price: string } | null
}) {
  const deadline = lead.slot_deadline_at ? new Date(lead.slot_deadline_at) : null
  const [now, setNow] = useState(() => new Date())
  const [picking, setPicking] = useState(false)
  const [custom, setCustom] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const hasDeadline = deadline != null
  useEffect(() => {
    if (!hasDeadline) return
    // Tick exactly on each wall-clock second so the digits change smoothly, never skip.
    let t = 0
    const tick = () => {
      setNow(new Date())
      t = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    }
    t = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5)
    return () => window.clearTimeout(t)
  }, [hasDeadline])

  const save = (at: Date) => {
    setMsg(null)
    pm.mutate(
      { id: lead.id, body: { slot_deadline_at: at.toISOString() } },
      {
        onSuccess: () => setPicking(false),
        onError: (e) => setMsg(e instanceof Error ? e.message : 'Could not save the time'),
      },
    )
  }
  const clear = () => pm.mutate({ id: lead.id, body: { clear_slot_deadline: true } })

  const share = async () => {
    if (!deadline) return
    setMsg(null)
    try {
      const how = await shareCardImage({ name: lead.name, deadline, stage })
      if (how === 'downloaded') setMsg('Image saved — send it on WhatsApp.')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setMsg(e instanceof Error ? e.message : 'Could not share the image')
    }
  }

  const showPicker = picking || !deadline
  const r = deadline ? remainingParts(deadline, now) : null

  return (
    <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-ds-caption font-bold uppercase tracking-wider text-warning-ink">
          <Clock className="size-3.5" aria-hidden />
          Slot reserved till
        </p>
        {deadline && !picking ? (
          <button
            type="button"
            onClick={clear}
            disabled={leadPatchBusy}
            aria-label="Remove slot time"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {deadline && r && !picking ? (
        <>
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground">{deadlineLabel(deadline, now)}</p>
            {r.done ? (
              <p className="mt-1 font-heading text-ds-h2 font-bold text-destructive-ink">Time&apos;s up</p>
            ) : (
              <p
                className={cn(
                  'mt-1 font-heading text-ds-display font-bold tabular-nums leading-none',
                  r.h === 0 ? 'text-destructive-ink' : 'text-foreground',
                )}
                aria-label="Time left"
              >
                {pad(r.h)}:{pad(r.m)}:{pad(r.s)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void share()}
              className="flex items-center justify-center gap-1.5 rounded-md border border-success/40 bg-success/10 px-2 py-1.5 text-ds-caption font-semibold text-success-ink hover:bg-success/20"
            >
              <ImageDown className="size-3.5" aria-hidden />
              Share image
            </button>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="rounded-md border border-border px-2 py-1.5 text-ds-caption font-semibold text-foreground hover:bg-muted"
            >
              Change time
            </button>
          </div>
        </>
      ) : null}

      {showPicker ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {quickPicks(now).map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={leadPatchBusy}
                onClick={() => save(p.at)}
                className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-ds-caption font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-label="Custom slot time"
              className="field-input min-w-0 flex-1 text-sm"
            />
            <button
              type="button"
              disabled={!custom || leadPatchBusy}
              onClick={() => save(new Date(custom))}
              className="shrink-0 rounded-md bg-primary px-3 text-ds-caption font-semibold text-primary-foreground disabled:opacity-50"
            >
              Set
            </button>
          </div>
          {deadline ? (
            <button type="button" onClick={() => setPicking(false)} className="text-ds-caption text-muted-foreground hover:underline">
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
      {msg ? <p className="text-ds-caption text-muted-foreground">{msg}</p> : null}
    </div>
  )
}
