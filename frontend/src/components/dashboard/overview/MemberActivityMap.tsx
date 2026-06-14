import { useState } from 'react'
import { Activity, Flame, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useMemberActivityMap } from '@/hooks/use-member-activity-map'

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 0, label: 'Lifetime' },
] as const

const CATEGORY_LABEL: Record<string, string> = {
  claim: 'Claims',
  convert: 'Conversions',
  sale: 'Billing',
  create: 'Leads sourced',
  contact: 'Calls / contact',
  educate: 'Education',
  reassign: 'Reassignments',
  money: 'Wallet',
  other: 'Other',
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function hourLabel(h: number | null): string {
  if (h == null) return '—'
  const ampm = h < 12 ? 'AM' : 'PM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${ampm}`
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <p className="text-lg font-bold tabular-nums leading-none text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
      {sub ? <p className="text-[10px] text-muted-foreground/60">{sub}</p> : null}
    </div>
  )
}

type Props = {
  userId: number
  name: string
  onClose: () => void
}

export function MemberActivityMap({ userId, name, onClose }: Props) {
  const [days, setDays] = useState<number>(30)
  const { data, isPending, isError } = useMemberActivityMap(userId, days)

  const maxHour = data ? Math.max(...data.by_hour, 1) : 1
  const maxDow = data ? Math.max(...data.by_dow, 1) : 1
  const catEntries = data ? Object.entries(data.by_category).sort((a, b) => b[1] - a[1]) : []
  const maxCat = catEntries.length ? Math.max(...catEntries.map(([, v]) => v)) : 1

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={`Activity map for ${name}`}
    >
      <div className="keyboard-safe-modal max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card px-5 py-4">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-primary" aria-hidden />
            <div>
              <h2 className="text-base font-semibold text-foreground">{name}</h2>
              <p className="text-[11px] text-muted-foreground">Activity map</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setDays(r.days)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11px] font-semibold transition',
                    days === r.days ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : isError || !data ? (
            <p className="py-10 text-center text-ds-caption text-muted-foreground">Could not load activity map.</p>
          ) : data.total === 0 ? (
            <p className="py-10 text-center text-ds-caption text-muted-foreground">No activity recorded in this window.</p>
          ) : (
            <>
              {/* Tags */}
              {data.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((t) => (
                    <span key={t} className="rounded-full border border-primary/20 bg-primary/[0.07] px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Headline stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Total actions" value={data.total} />
                <Stat label="Active days" value={`${data.active_days}/${data.window_days}`} sub={`${data.consistency_pct}% consistent`} />
                <Stat label="Longest streak" value={`${data.longest_streak}d`} />
                <Stat label="Most active" value={hourLabel(data.peak_hour)} sub={data.peak_dow != null ? DOW[data.peak_dow] : undefined} />
              </div>

              {/* What they do — category mix */}
              <div>
                <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">What they do</p>
                <div className="space-y-1.5">
                  {catEntries.map(([cat, count]) => {
                    const pct = Math.max(Math.round((count / maxCat) * 100), 4)
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate text-right text-ds-caption text-muted-foreground">{CATEGORY_LABEL[cat] ?? cat}</span>
                        <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/50">
                          <div className="flex h-full items-center justify-end rounded bg-primary px-2" style={{ width: `${pct}%` }}>
                            <span className="text-[10px] font-bold text-primary-foreground">{count}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* When they work — hour of day */}
              <div>
                <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">Active hours (IST)</p>
                <div className="flex items-end gap-[2px]">
                  {data.by_hour.map((c, h) => {
                    const intensity = c / maxHour
                    return (
                      <div
                        key={h}
                        className="flex-1 rounded-sm"
                        style={{
                          height: 36,
                          backgroundColor: c === 0 ? 'hsl(var(--muted))' : `color-mix(in srgb, hsl(var(--primary)) ${Math.round(20 + intensity * 80)}%, transparent)`,
                        }}
                        title={`${hourLabel(h)}: ${c}`}
                      />
                    )
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/60">
                  <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
                </div>
              </div>

              {/* Day-of-week */}
              <div>
                <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-muted-foreground">By weekday</p>
                <div className="flex items-end gap-2">
                  {data.by_dow.map((c, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-16 w-full items-end">
                        <div className="w-full rounded-t bg-violet-500/70" style={{ height: `${Math.max((c / maxDow) * 100, 3)}%` }} title={`${DOW[i]}: ${c}`} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{DOW[i]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {data.last_at ? (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Flame className="size-3.5 text-amber-500" aria-hidden />
                  Last active {new Date(data.last_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
