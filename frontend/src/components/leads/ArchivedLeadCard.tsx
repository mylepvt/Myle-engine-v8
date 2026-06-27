import { Link } from 'react-router-dom'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { Button } from '@/components/ui/button'
import { LEAD_STATUS_OPTIONS, type LeadPublic } from '@/hooks/use-leads-query'
import { currentSectionForLead } from '@/lib/lead-section'
import type { Role } from '@/types/role'

function statusLabel(value: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export type ArchivedLeadCardProps = {
  lead: LeadPublic
  role: Role | null
  patchBusy: boolean
  deleteBusy: boolean
  onRestoreArchive: (id: number, archived: boolean) => void
  onDelete: (id: number) => void
}

/**
 * Mobile-first card for the Archived Leads list. The virtualized table
 * (`LeadsVirtualizedBody`) is desktop-only because it needs a 1040px min-width;
 * on phones we stack the same fields into a tappable card instead of forcing a
 * horizontal-scroll table.
 */
export function ArchivedLeadCard({
  lead,
  role,
  patchBusy,
  deleteBusy,
  onRestoreArchive,
  onDelete,
}: ArchivedLeadCardProps) {
  const section = currentSectionForLead(lead, role)
  return (
    <li className="surface-elevated rounded-lg border border-border/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/dashboard/work/leads/${lead.id}`}
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-primary hover:underline underline-offset-2"
        >
          {lead.name}
        </Link>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">#{lead.id}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {lead.phone?.trim() ? (
          <span className="min-w-0 truncate text-xs tabular-nums text-foreground">{lead.phone}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No phone</span>
        )}
        <LeadContactActions phone={lead.phone} className="shrink-0" stopPropagation />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="min-w-0">
          <dt className="text-ds-label uppercase text-muted-foreground">Stage</dt>
          <dd className="truncate text-foreground">{statusLabel(lead.status)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ds-label uppercase text-muted-foreground">Section</dt>
          <dd className="min-w-0">
            <Link
              to={section.path}
              className="block truncate text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              title={section.label}
            >
              {section.label}
            </Link>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ds-label uppercase text-muted-foreground">Created</dt>
          <dd className="text-foreground">{formatShort(lead.created_at)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ds-label uppercase text-muted-foreground">Archived</dt>
          <dd className="text-foreground">
            {lead.archived_at ? formatShort(lead.archived_at) : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 px-3 text-ds-label"
          disabled={patchBusy}
          onClick={() => onRestoreArchive(lead.id, false)}
        >
          Restore
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-ds-label text-destructive hover:text-destructive"
          disabled={deleteBusy}
          onClick={() => onDelete(lead.id)}
        >
          Delete
        </Button>
      </div>
    </li>
  )
}
