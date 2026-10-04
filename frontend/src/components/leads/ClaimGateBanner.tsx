import { Link } from 'react-router-dom'

import type { ClaimGateResponse } from '@/hooks/use-lead-pool-query'

type Props = { gate: ClaimGateResponse }

/** Tells the member why claiming is blocked and which fresh leads still need covering. */
export function ClaimGateBanner({ gate }: Props) {
  if (!gate.blocked) return null
  return (
    <div
      className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
      role="alert"
    >
      <p className="font-medium text-destructive">{gate.message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Leads still at New Lead (open each one and update its status):
      </p>
      <ul className="mt-2 space-y-1">
        {gate.uncovered_leads.map((lead) => (
          <li key={lead.id} className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              to={`/dashboard/work/leads/${lead.id}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {lead.name}
            </Link>
            {lead.phone ? <span className="tabular-nums text-muted-foreground">{lead.phone}</span> : null}
          </li>
        ))}
      </ul>
      <Link
        to="/dashboard/work/leads?tab=today"
        className="mt-3 inline-block text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        Open Calling Board → Today
      </Link>
    </div>
  )
}
