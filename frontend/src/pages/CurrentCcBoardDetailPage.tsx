import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { SheetView, type SheetPublic } from '@/components/current-cc/sheet-view'

type TeamMember = { user_id: number; name: string }

type Props = { userId: number }

function todayIsoLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function CurrentCcBoardDetailPage({ userId }: Props) {
  const [dateIso, setDateIso] = useState(todayIsoLocal)

  // Same sheet the member fills — read it back read-only so the admin sees the
  // exact submitted form, not just summary numbers.
  const sheetQ = useQuery({
    queryKey: ['current-cc-sheet', userId, dateIso],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/v1/current-cc/sheet?subject_user_id=${userId}&date=${encodeURIComponent(dateIso)}`,
      )
      if (!res.ok) throw new Error(await res.text())
      return (await res.json()) as SheetPublic | null
    },
  })
  const membersQ = useQuery({
    queryKey: ['current-cc-members'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/current-cc/team-members')
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<TeamMember[]>
    },
  })

  const name = membersQ.data?.find((m) => m.user_id === userId)?.name ?? `User #${userId}`

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard/team/cc-board" className="text-xs text-primary hover:underline">
            ‹ Back to board
          </Link>
          <h1 className="text-ds-h1">{name}</h1>
          <p className="text-sm text-muted-foreground">Tracking Report — exactly as the member filled it.</p>
        </div>
        <Link
          to={`/dashboard/team/current-cc?member=${userId}`}
          className="rounded-lg border border-primary/40 bg-primary/15 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/25"
        >
          Open / edit sheet
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Date</span>
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className="rounded-lg border border-border dark:border-white/[0.12] bg-muted/60 px-3 py-2 text-foreground"
          />
        </label>
      </div>

      {sheetQ.isPending ? <Skeleton className="h-64 w-full rounded" /> : null}
      {sheetQ.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {sheetQ.error instanceof Error ? sheetQ.error.message : 'Failed to load'}
        </p>
      ) : null}

      {sheetQ.isSuccess && !sheetQ.data ? (
        <div className="surface-elevated rounded border border-dashed border-border dark:border-white/12 px-4 py-8 text-center text-sm text-muted-foreground">
          {name} ne {dateIso} ka Tracking Report form abhi nahi bhara.
        </div>
      ) : null}

      {sheetQ.data ? <SheetView sheet={sheetQ.data} /> : null}
    </div>
  )
}
