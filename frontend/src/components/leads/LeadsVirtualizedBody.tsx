import { type ReactElement, memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { List, type RowComponentProps } from 'react-window'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { LeadRowStatusDropdown } from '@/components/leads/LeadRowStatusDropdown'
import { Button } from '@/components/ui/button'
import { LEAD_STATUS_OPTIONS, type LeadPublic, type LeadStatus } from '@/hooks/use-leads-query'
import { leadStatusSelectOptionsForLead } from '@/lib/team-lead-status'
import type { Role } from '@/types/role'

const ROW_HEIGHT = 76
const LIST_MAX_HEIGHT = 520
const TABLE_MIN_WIDTH = 880

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

export type LeadsVirtualizedBodyProps = {
  items: LeadPublic[]
  archivedOnly: boolean
  role: Role | null
  patchBusyLeadId: number | null
  deleteBusyLeadId: number | null
  onPatchStatus: (id: number, status: LeadStatus) => void
  onPatchPool: (id: number) => void
  onPatchArchive: (id: number, archived: boolean) => void
  onDelete: (id: number) => void
}

type RowData = LeadsVirtualizedBodyProps

const gridArchived =
  'grid h-full w-full min-w-[880px] grid-cols-[4.5rem_minmax(8rem,1fr)_minmax(7rem,11rem)_minmax(8rem,11rem)_7.5rem_7.5rem_minmax(10rem,1fr)] items-center gap-2 px-2 py-1'
const gridActive =
  'grid h-full w-full min-w-[880px] grid-cols-[4.5rem_minmax(9rem,1fr)_minmax(7rem,11rem)_minmax(9rem,13rem)_7.5rem_minmax(10rem,1fr)] items-center gap-2 px-2 py-1'

function LeadRow(props: RowComponentProps<RowData>): ReactElement | null {
  const {
    index,
    style,
    ariaAttributes,
    items,
    archivedOnly,
    role,
    patchBusyLeadId,
    deleteBusyLeadId,
    onPatchStatus,
    onPatchPool,
    onPatchArchive,
    onDelete,
  } = props
  const l = items[index]
  if (!l) return null
  const patchBusy = patchBusyLeadId === l.id
  const delBusy = deleteBusyLeadId === l.id
  const statusOptions = leadStatusSelectOptionsForLead(role, l.status as LeadStatus, LEAD_STATUS_OPTIONS)

  return (
    <div
      {...ariaAttributes}
      style={style}
      className="box-border border-b border-border/40 text-sm text-muted-foreground"
    >
      <div className={archivedOnly ? gridArchived : gridActive}>
        <div className="text-right tabular-nums text-xs">{l.id}</div>
        <div className="min-w-0 font-medium text-foreground">
          <Link
            to={`/dashboard/work/leads/${l.id}`}
            className="block truncate text-foreground hover:text-primary hover:underline underline-offset-2"
          >
            {l.name}
          </Link>
        </div>
        <div className="min-w-0">
          {l.phone?.trim() ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-xs tabular-nums text-foreground">{l.phone}</span>
              <LeadContactActions phone={l.phone} className="shrink-0" />
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
        <div className="min-w-0">
          {!archivedOnly ? (
            <LeadRowStatusDropdown
              leadName={l.name}
              status={l.status}
              options={statusOptions}
              busy={patchBusy}
              onSelect={(v) => onPatchStatus(l.id, v)}
            />
          ) : (
            <span className="truncate text-xs text-foreground">{statusLabel(l.status)}</span>
          )}
        </div>
        <div className="whitespace-nowrap text-right text-xs">{formatShort(l.created_at)}</div>
        {archivedOnly ? (
          <div className="whitespace-nowrap text-right text-xs">
            {l.archived_at ? formatShort(l.archived_at) : '—'}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-1">
          {!archivedOnly && role === 'admin' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[0.65rem]"
              disabled={patchBusy}
              title="Move to shared pool for members to claim"
              onClick={() => onPatchPool(l.id)}
            >
              To pool
            </Button>
          ) : null}
          {archivedOnly ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[0.65rem]"
              disabled={patchBusy}
              onClick={() => onPatchArchive(l.id, false)}
            >
              Restore
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[0.65rem]"
              disabled={patchBusy}
              onClick={() => onPatchArchive(l.id, true)}
            >
              Archive
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[0.65rem] text-destructive hover:text-destructive"
            disabled={delBusy}
            onClick={() => onDelete(l.id)}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

export const LeadsVirtualizedBody = memo(function LeadsVirtualizedBody(props: LeadsVirtualizedBodyProps) {
  const { items } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(TABLE_MIN_WIDTH)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? TABLE_MIN_WIDTH
      setWidth(Math.max(320, Math.floor(w)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const listHeight = Math.min(LIST_MAX_HEIGHT, Math.max(ROW_HEIGHT, items.length * ROW_HEIGHT))

  const itemData = useMemo<RowData>(
    () => ({
      items: props.items,
      archivedOnly: props.archivedOnly,
      role: props.role,
      patchBusyLeadId: props.patchBusyLeadId,
      deleteBusyLeadId: props.deleteBusyLeadId,
      onPatchStatus: props.onPatchStatus,
      onPatchPool: props.onPatchPool,
      onPatchArchive: props.onPatchArchive,
      onDelete: props.onDelete,
    }),
    [
      props.items,
      props.archivedOnly,
      props.role,
      props.patchBusyLeadId,
      props.deleteBusyLeadId,
      props.onPatchStatus,
      props.onPatchPool,
      props.onPatchArchive,
      props.onDelete,
    ],
  )

  return (
    <div ref={wrapRef} className="w-full overflow-x-auto">
      <div style={{ minWidth: TABLE_MIN_WIDTH }} className="border-b border-border/60 bg-card/20">
        <div className={props.archivedOnly ? gridArchived : gridActive}>
          <div className="px-1 py-2 text-right text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
            ID
          </div>
          <div className="px-1 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground">Name</div>
          <div className="px-1 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground">Phone</div>
          <div className="px-1 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground">Stage</div>
          <div className="px-1 py-2 text-right text-[0.65rem] font-semibold uppercase tracking-wide text-foreground">
            Created
          </div>
          {props.archivedOnly ? (
            <div className="px-1 py-2 text-right text-[0.65rem] font-semibold uppercase tracking-wide text-foreground">
              Archived
            </div>
          ) : null}
          <div className="px-1 py-2 text-right text-[0.65rem] font-semibold uppercase tracking-wide text-foreground">
            Actions
          </div>
        </div>
      </div>
      <List<RowData>
        rowCount={items.length}
        rowHeight={ROW_HEIGHT}
        rowComponent={LeadRow}
        rowProps={itemData}
        overscanCount={6}
        style={{ height: listHeight, width }}
      />
    </div>
  )
})
