import { CheckCircle2, Circle, UserRound } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import type { LeadPublic } from '@/hooks/use-leads-query'
import { checklistForStage } from '@/lib/lead-process-map'

type Props = {
  leads: LeadPublic[]
  pending: boolean
}

const STAGE_LABEL: Record<string, string> = {
  day1: 'Day 1',
  day2: 'Day 2',
  day3: 'Day 3',
  converted: 'Converted',
}

function stageLabel(status: string): string {
  return (
    STAGE_LABEL[status] ??
    status.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function LeadProgressCard({ lead }: { lead: LeadPublic }) {
  const stage = checklistForStage(lead.status)
  const tracking = lead.process_tracking?.[lead.status] ?? {}
  const isConverted = lead.status === 'converted'

  return (
    <Card className="border-border/70 bg-card/95">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-ds-caption text-muted-foreground">
              <UserRound className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                With {lead.assigned_to_name ?? lead.leader_name ?? 'leader'}
              </span>
            </p>
          </div>
          <span
            className={
              isConverted
                ? 'shrink-0 rounded-full bg-emerald-500/12 px-2.5 py-1 text-ds-label font-semibold text-emerald-600 dark:text-emerald-400'
                : 'shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-ds-label font-semibold text-primary'
            }
          >
            {stageLabel(lead.status)}
          </span>
        </div>

        {stage && stage.tasks.length > 0 ? (
          <ul className="space-y-1.5">
            {stage.tasks.map((task) => {
              const done = Boolean(tracking[task.key])
              return (
                <li key={task.key} className="flex items-center gap-2 text-ds-caption">
                  {done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-hidden />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                  )}
                  <span className={done ? 'text-foreground' : 'text-muted-foreground'}>
                    {task.label}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-ds-caption text-muted-foreground">
            {isConverted ? 'Lead converted 🎉' : 'No tasks for this stage yet.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function HandedOffLeadsSection({ leads, pending }: Props) {
  if (!pending && leads.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-base font-semibold text-foreground">Your Leads — Progress</h2>
        <p className="mt-1 text-ds-caption text-muted-foreground">
          Leads you handed to your leader. See the stage they reached and which tasks are done.
        </p>
      </div>
      {pending && leads.length === 0 ? (
        <Card className="border-border/70 bg-card/95">
          <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {leads.map((lead) => (
            <LeadProgressCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </section>
  )
}
