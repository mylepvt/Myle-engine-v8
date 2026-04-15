import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

type DailyReportPublic = {
  id: number
  report_date: string
  total_calling: number
  remarks: string | null
  calls_picked: number
  wrong_numbers: number
  enrollments_done: number
  pending_enroll: number
  underage: number
  plan_2cc: number
  seat_holdings: number
  leads_educated: number
  pdf_covered: number
  videos_sent_actual: number
  calls_made_actual: number
  payments_actual: number
  points_awarded: number
}

function todayIsoLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const INT_FIELDS: { key: keyof DailyReportPublic; label: string }[] = [
  { key: 'total_calling', label: 'Total calling' },
  { key: 'calls_picked', label: 'Calls picked' },
  { key: 'wrong_numbers', label: 'Wrong numbers' },
  { key: 'enrollments_done', label: 'Enrollments done' },
  { key: 'pending_enroll', label: 'Pending enroll' },
  { key: 'underage', label: 'Underage' },
  { key: 'plan_2cc', label: 'Plan 2CC' },
  { key: 'seat_holdings', label: 'Seat holdings' },
  { key: 'leads_educated', label: 'Leads educated' },
  { key: 'pdf_covered', label: 'PDF covered' },
  { key: 'videos_sent_actual', label: 'Videos sent (actual)' },
  { key: 'calls_made_actual', label: 'Calls made (actual)' },
  { key: 'payments_actual', label: 'Payments (actual)' },
]

type Props = { title: string }

export function DailyReportFormPage({ title }: Props) {
  const qc = useQueryClient()
  const [dateIso, setDateIso] = useState(todayIsoLocal)
  const [remarks, setRemarks] = useState('')
  const [ints, setInts] = useState<Record<string, number>>(() =>
    Object.fromEntries(INT_FIELDS.map(({ key }) => [key, 0])),
  )

  const q = useQuery({
    queryKey: ['daily-report-mine', dateIso],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/reports/daily/mine?report_date=${encodeURIComponent(dateIso)}`)
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || res.statusText)
      }
      return res.json() as Promise<DailyReportPublic | null>
    },
  })

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const row = q.data
    if (!row) {
      setInts(Object.fromEntries(INT_FIELDS.map(({ key }) => [key, 0])))
      setRemarks('')
      return
    }
    const next: Record<string, number> = {}
    for (const { key } of INT_FIELDS) {
      next[key] = typeof row[key] === 'number' ? (row[key] as number) : 0
    }
    setInts(next)
    setRemarks(row.remarks ?? '')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [q.data])

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        report_date: dateIso,
        remarks: remarks.trim() || null,
        ...Object.fromEntries(INT_FIELDS.map(({ key }) => [key, ints[key] ?? 0])),
      }
      const res = await apiFetch('/api/v1/reports/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || res.statusText)
      }
      return res.json() as Promise<DailyReportPublic>
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['daily-report-mine'] })
    },
  })

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Submit numbers for a calendar day. First save awards +20 score points for that day (legacy rule); updates keep
        fields fresh without double-counting.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Report date</span>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            disabled={mut.isPending}
            className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground disabled:opacity-50"
          />
        </label>
      </div>

      {q.isPending ? <Skeleton className="h-40 w-full rounded-xl" /> : null}
      {q.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {q.error instanceof Error ? q.error.message : 'Failed to load'}
        </p>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void mut.mutateAsync()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {INT_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <input
                type="number"
                min={0}
                value={ints[key] ?? 0}
                disabled={mut.isPending}
                onChange={(e) =>
                  setInts((prev) => ({ ...prev, [key]: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                }
                className={cn(
                  'rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 tabular-nums text-foreground disabled:opacity-50',
                )}
              />
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Remarks</span>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            disabled={mut.isPending}
            className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2 text-foreground disabled:opacity-50"
          />
        </label>
        <button
          type="submit"
          disabled={mut.isPending}
         
          className="rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/25 disabled:opacity-50"
        >
          {mut.isPending ? 'Saving…' : 'Save report'}
        </button>
      </form>

      {mut.isSuccess && mut.data ? (
        <p className="text-sm text-emerald-400/90">
          Saved. Points awarded this request:{' '}
          <span className="font-mono tabular-nums">{mut.data.points_awarded}</span>
        </p>
      ) : null}
      {mut.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {mut.error instanceof Error ? mut.error.message : 'Save failed'}
        </p>
      ) : null}
    </div>
  )
}
