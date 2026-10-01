import { Link } from 'react-router-dom'

import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'
import { stageBadgeClass, stageColor } from '@/lib/stage-colors'

type Props = {
  title: string
}

const PIPELINE_STAGES = [
  'new_lead', 'contacted', 'invited', 'video_sent', 'video_watched',
  'day1', 'day2', 'day3', 'converted',
] as const

const TERMINAL_STAGES = ['lost', 'retarget', 'inactive'] as const

const INTERNAL_COMPAT_STAGES = ['training', 'new'] as const

function label(v: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v
}


export function LeadFlowPage({ title }: Props) {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-ds-h2">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Canonical Myle lead journey — from new lead to conversion. Moves are done on{' '}
        <Link to="/dashboard/work/leads" className="text-primary underline-offset-2 hover:underline">
          Calling Board
        </Link>{' '}
        or the{' '}
        <Link to="/dashboard/work/workboard" className="text-primary underline-offset-2 hover:underline">
          Workboard
        </Link>
        . FastAPI is now the single source of truth for this lifecycle.
      </p>

      {/* Main pipeline */}
      <div className="surface-elevated p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Main Pipeline
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {PIPELINE_STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`rounded-md border px-3 py-1.5 font-medium ${stageBadgeClass(s)}`}>
                {label(s)}
              </span>
              {i < PIPELINE_STAGES.length - 1 ? (
                <span className="text-muted-foreground text-xs" aria-hidden>→</span>
              ) : null}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Team scope ends at <span className="font-medium text-foreground">Video Watched</span> (enrollment video watched).
          Leader/admin then run <span className="font-medium text-foreground">Day 1 → Day 2 → Day 3</span>. Day 2 → Day 3 needs all
          Day-2 batches done plus a passed business test (admin-only). The{' '}
          <span className="font-medium text-foreground">Day 3</span> close runs Interview → 2CC → Blueprint → Stage 1/2/3 → Seat-hold →
          <span className="font-medium text-foreground"> Converted</span>. The FLP invoice (OCR → CC/revenue/cheque) is uploaded after conversion.
        </p>
      </div>

      {/* Outcome stages */}
      <div className="surface-elevated p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Outcomes
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {TERMINAL_STAGES.map((s) => (
            <span key={s} className={`rounded-md border px-3 py-1.5 font-medium ${stageBadgeClass(s)}`}>
              {label(s)}
            </span>
          ))}
        </div>
      </div>

      {/* Internal / compatibility */}
      <div className="surface-elevated p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Internal / Compatibility
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {INTERNAL_COMPAT_STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`rounded-md border px-3 py-1.5 font-medium ${stageBadgeClass(s)}`}>
                {label(s)}
              </span>
              {i < INTERNAL_COMPAT_STAGES.length - 1 ? (
                <span className="text-muted-foreground text-xs" aria-hidden>→</span>
              ) : null}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These statuses are still supported for compatibility or internal ops, but they are not part of the primary conversion journey.
        </p>
      </div>

      {/* Quick reference table */}
      <div className="surface-elevated overflow-hidden p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          All Statuses
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {LEAD_STATUS_OPTIONS.filter(o => o.value !== 'new').map((o) => (
            <div key={o.value} className="surface-inset flex items-center gap-2 px-2.5 py-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stageColor(o.value) }} aria-hidden />
              <span className="truncate text-xs text-foreground">{o.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
