import { Link } from 'react-router-dom'

import { LEAD_STATUS_OPTIONS } from '@/hooks/use-leads-query'

type Props = {
  title: string
}

const PIPELINE_STAGES = [
  'new_lead', 'contacted', 'invited', 'whatsapp_sent', 'video_sent', 'video_watched',
  'paid', 'mindset_lock', 'day1', 'day2', 'day3', 'converted',
] as const

const TERMINAL_STAGES = ['lost', 'retarget', 'inactive'] as const

const RE_ENGAGE_STAGES = ['retarget', 'plan_2cc', 'level_up'] as const

function label(v: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v
}

const STAGE_COLORS: Record<string, string> = {
  new_lead:       'border-primary/30 bg-primary/10 text-primary',
  contacted:      'border-sky-400/30 bg-sky-400/10 text-sky-400',
  invited:        'border-violet-400/30 bg-violet-400/10 text-violet-400',
  whatsapp_sent:  'border-pink-400/30 bg-pink-400/10 text-pink-400',
  video_sent:     'border-indigo-400/30 bg-indigo-400/10 text-indigo-400',
  video_watched:  'border-blue-400/30 bg-blue-400/10 text-blue-400',
  paid:           'border-amber-400/30 bg-amber-400/10 text-amber-400',
  mindset_lock:   'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-400',
  day1:           'border-orange-400/30 bg-orange-400/10 text-orange-400',
  day2:           'border-yellow-400/30 bg-yellow-400/10 text-yellow-400',
  day3:           'border-lime-400/30 bg-lime-400/10 text-lime-400',
  interview:      'border-lime-400/30 bg-lime-400/10 text-lime-400',
  track_selected: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400',
  seat_hold:      'border-teal-400/30 bg-teal-400/10 text-teal-400',
  converted:      'border-[hsl(142_71%_45%)]/30 bg-[hsl(142_71%_45%)]/10 text-[hsl(142_71%_45%)]',
  lost:           'border-destructive/30 bg-destructive/10 text-destructive',
  retarget:       'border-rose-400/30 bg-rose-400/10 text-rose-400',
  inactive:       'border-zinc-400/30 bg-zinc-400/10 text-zinc-400',
  plan_2cc:       'border-purple-400/30 bg-purple-400/10 text-purple-400',
  level_up:       'border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-400',
}

export function LeadFlowPage({ title }: Props) {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Full Myle lead pipeline — from first contact to conversion. Moves are done on{' '}
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
              <span className={`rounded-md border px-3 py-1.5 font-medium ${STAGE_COLORS[s] ?? 'border-border bg-muted/30 text-foreground'}`}>
                {label(s)}
              </span>
              {i < PIPELINE_STAGES.length - 1 ? (
                <span className="text-muted-foreground/60 text-xs" aria-hidden>→</span>
              ) : null}
            </span>
          ))}
        </div>
      </div>

      {/* Outcome stages */}
      <div className="surface-elevated p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Outcomes
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {TERMINAL_STAGES.map((s) => (
            <span key={s} className={`rounded-md border px-3 py-1.5 font-medium ${STAGE_COLORS[s] ?? 'border-border bg-muted/30 text-foreground'}`}>
              {label(s)}
            </span>
          ))}
        </div>
      </div>

      {/* Re-engage path */}
      <div className="surface-elevated p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Re-Engage Path
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {RE_ENGAGE_STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`rounded-md border px-3 py-1.5 font-medium ${STAGE_COLORS[s] ?? 'border-border bg-muted/30 text-foreground'}`}>
                {label(s)}
              </span>
              {i < RE_ENGAGE_STAGES.length - 1 ? (
                <span className="text-muted-foreground/60 text-xs" aria-hidden>→</span>
              ) : null}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Lost leads can be moved to Retarget → 2CC Plan → Level Up before final close.
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
              <span className={`h-2 w-2 shrink-0 rounded-full border ${STAGE_COLORS[o.value] ?? 'border-border bg-muted'}`} />
              <span className="truncate text-xs text-foreground">{o.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
