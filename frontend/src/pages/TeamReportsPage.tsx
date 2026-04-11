import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { type TeamReportsLiveSummary, useTeamReportsQuery } from '@/hooks/use-team-reports-query'
import { cn } from '@/lib/utils'

type Props = { title: string }

function todayIsoLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const TILES: { key: keyof TeamReportsLiveSummary; label: string; color: string }[] = [
  { key: 'leads_claimed_today', label: 'Claimed (day)', color: 'text-primary' },
  { key: 'calls_made_today', label: 'Calls (day)', color: 'text-emerald-400' },
  { key: 'enrolled_today', label: 'Proof uploaded (day)', color: 'text-amber-400' },
  { key: 'day1_total', label: 'In Day 1', color: 'text-sky-400' },
  { key: 'day2_total', label: 'In Day 2', color: 'text-violet-400' },
  { key: 'converted_total', label: 'Converted', color: 'text-muted-foreground' },
]

export function TeamReportsPage({ title }: Props) {
  const [dateIso, setDateIso] = useState(todayIsoLocal)
  const { data, isPending, isError, error, refetch } = useTeamReportsQuery(dateIso)

  const effectiveDate = useMemo(() => data?.date ?? dateIso, [data?.date, dateIso])

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Live pipeline metrics (admin). Date uses the API default calendar day in{' '}
        <span className="text-foreground/90">{data?.timezone ?? 'Asia/Kolkata'}</span> when you pick a
        day below.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground"
          />
        </label>
        <span className="text-xs text-muted-foreground">Reporting day: {effectiveDate}</span>
      </div>

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : null}
      {isError ? (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load'}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : null}

      {data ? (
        <>
          <div>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Live data (from system)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              {TILES.map((t) => (
                <div
                  key={t.key}
                  className="surface-elevated rounded-xl border border-white/[0.08] py-3 text-center"
                >
                  <div className={cn('text-2xl font-bold tabular-nums', t.color)}>
                    {data.live_summary[t.key]}
                  </div>
                  <div className="mt-1 px-1 text-[0.62rem] text-muted-foreground">{t.label}</div>
                </div>
              ))}
            </div>
          </div>
          {data.note ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{data.note}</p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
