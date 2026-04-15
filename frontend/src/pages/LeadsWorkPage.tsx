import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { CtcsWorkSurface } from '@/components/leads/CtcsWorkSurface'
import { LeadsVirtualizedBody } from '@/components/leads/LeadsVirtualizedBody'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LEAD_STATUS_GROUPS,
  LEAD_STATUS_OPTIONS,
  type LeadListFilters,
  type LeadStatus,
  useCreateLeadMutation,
  useDeleteLeadMutation,
  useLeadsInfiniteQuery,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import type { Role } from '@/types/role'

type Props = {
  title: string
  /** Active = main list (non-archived). Archived = `archived_only` API + restore UX. */
  listMode?: 'active' | 'archived'
}

const emptyFilters: LeadListFilters = { q: '', status: '' }

function emptyListHint(role: Role | null, archivedOnly: boolean): string {
  if (archivedOnly) {
    return 'No archived leads — archive from the active list when you want to clear your pipeline without deleting.'
  }
  if (role === 'admin') {
    return 'No leads match this view — adjust filters or add one above. You see all active leads (admin scope).'
  }
  if (role === 'leader') {
    return 'No leads match this view — adjust filters or add one above. You see your leads and your downline’s leads (same rules as workboard).'
  }
  return 'No leads match this view — adjust filters or add one above. You see only leads you created.'
}

export function LeadsWorkPage({ title, listMode = 'active' }: Props) {
  const archivedOnly = listMode === 'archived'
  const leadsListMode = listMode === 'archived' ? 'archived' : 'active'
  const { role } = useDashboardShellRole()
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') ?? ''
  const [qInput, setQInput] = useState(qParam)
  const [filters, setFilters] = useState<LeadListFilters>({ ...emptyFilters, q: qParam })
  const [newStatus, setNewStatus] = useState<LeadStatus>('new_lead')
  const [name, setName] = useState('')
  const [advancedTableOpen, setAdvancedTableOpen] = useState(false)

  useEffect(() => {
    setQInput(qParam)
  }, [qParam])

  useEffect(() => {
    const id = window.setTimeout(() => {
      setFilters((f) => ({ ...f, q: qInput }))
    }, 400)
    return () => window.clearTimeout(id)
  }, [qInput])

  const leadsQ = useLeadsInfiniteQuery(archivedOnly, filters, leadsListMode)
  const classicLeadsQ = useLeadsInfiniteQuery(
    !archivedOnly && advancedTableOpen,
    filters,
    'active',
  )
  const data = leadsQ.data
  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0
  const limit = data?.pages[0]?.limit ?? 50
  const isPending = archivedOnly && leadsQ.isPending
  const isError = archivedOnly && leadsQ.isError
  const error = leadsQ.error
  const refetch = leadsQ.refetch
  const createMut = useCreateLeadMutation()
  const deleteMut = useDeleteLeadMutation()
  const patchMut = usePatchLeadMutation()
  const patchBusyLeadId =
    patchMut.isPending && patchMut.variables && typeof patchMut.variables.id === 'number'
      ? patchMut.variables.id
      : null
  const deleteBusyLeadId =
    deleteMut.isPending && typeof deleteMut.variables === 'number' ? deleteMut.variables : null

  const onPatchStatus = useCallback(
    (id: number, status: LeadStatus) => void patchMut.mutateAsync({ id, body: { status } }),
    [patchMut],
  )
  const onPatchPool = useCallback(
    (id: number) => void patchMut.mutateAsync({ id, body: { in_pool: true } }),
    [patchMut],
  )
  const onPatchArchive = useCallback(
    (id: number, archived: boolean) => void patchMut.mutateAsync({ id, body: { archived } }),
    [patchMut],
  )
  const onDeleteLead = useCallback(
    (id: number) => void deleteMut.mutateAsync(id),
    [deleteMut],
  )

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await createMut.mutateAsync({ name: trimmed, status: newStatus })
      setName('')
    } catch {
      /* surfaced below */
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 max-w-full truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {title}
        </h1>
        {archivedOnly ? (
          <Link
            to="/dashboard/work/leads"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            ← Active leads
          </Link>
        ) : (
          <Link
            to="/dashboard/work/archived"
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Archived leads
          </Link>
        )}
      </div>

      {archivedOnly ? (
        <p className="text-sm text-muted-foreground">
          Restore a lead to send it back to your main list and workboard.
        </p>
      ) : null}

      <div className="surface-elevated flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:min-w-[12rem]">
          <label htmlFor="lead-filter-q" className="mb-1 block text-xs font-medium text-muted-foreground">
            Search name
          </label>
          <input
            id="lead-filter-q"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Substring match…"
            className="w-full rounded-md border border-white/12 bg-white/[0.08] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
          />
        </div>
        <div className="min-w-[10rem]">
          <label htmlFor="lead-filter-status" className="mb-1 block text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="lead-filter-status"
            value={filters.status}
            data-ui-silent
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value === '' ? '' : (e.target.value as LeadStatus),
              }))
            }
            className="w-full max-w-full rounded-md border border-white/12 bg-white/[0.08] px-2 py-2 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35 sm:px-3 sm:text-sm"
          >
            <option value="">All statuses</option>
            {LEAD_STATUS_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.statuses.map((value) => {
                  const o = LEAD_STATUS_OPTIONS.find((x) => x.value === value)
                  if (!o) return null
                  return (
                    <option key={value} value={value}>
                      {o.label}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {!archivedOnly ? (
        <>
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="lead-name" className="mb-1 block text-xs font-medium text-muted-foreground">
                New lead name
              </label>
              <input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                disabled={createMut.isPending}
                className="w-full rounded-md border border-white/12 bg-white/[0.08] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
              />
            </div>
            <div className="min-w-[10rem]">
              <label htmlFor="lead-new-status" className="mb-1 block text-xs font-medium text-muted-foreground">
                Initial status
              </label>
              <select
                id="lead-new-status"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as LeadStatus)}
                disabled={createMut.isPending}
                className="w-full rounded-md border border-white/12 bg-white/[0.08] px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
              >
                {LEAD_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" data-ui-silent disabled={createMut.isPending || !name.trim()}>
              {createMut.isPending ? 'Adding…' : 'Add lead'}
            </Button>
          </form>
          {createMut.isError ? (
            <p className="text-xs text-destructive" role="alert">
              {createMut.error instanceof Error ? createMut.error.message : 'Could not create'}
            </p>
          ) : null}
        </>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>
            {error instanceof Error ? error.message : 'Could not load leads'}{' '}
          </span>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {!archivedOnly ? (
        <div className="surface-elevated p-4 text-sm text-muted-foreground">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Call-to-close</p>
          <CtcsWorkSurface filters={filters} patchBusyLeadId={patchBusyLeadId} />
          <details
            className="mt-6 rounded-xl border border-white/10 bg-black/15"
            onToggle={(e) => setAdvancedTableOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer select-none list-none px-4 py-3 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
              Advanced — classic table (newest first, same filters)
            </summary>
            <div className="border-t border-white/10 px-2 pb-4 pt-2">
              {advancedTableOpen ? (
                <>
                  {classicLeadsQ.isPending ? (
                    <div className="space-y-2 px-2">
                      <Skeleton className="h-9 w-full" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ) : null}
                  {classicLeadsQ.isError ? (
                    <p className="px-2 text-sm text-destructive">
                      {classicLeadsQ.error instanceof Error
                        ? classicLeadsQ.error.message
                        : 'Could not load table'}
                    </p>
                  ) : null}
                  {classicLeadsQ.data ? (
                    <>
                      <p className="mb-2 px-2 text-xs text-muted-foreground">
                        Total: {classicLeadsQ.data.pages[0]?.total ?? 0}
                        {(classicLeadsQ.data.pages[0]?.total ?? 0) >
                        classicLeadsQ.data.pages.flatMap((p) => p.items).length ? (
                          <span className="ml-1">
                            (showing {classicLeadsQ.data.pages.flatMap((p) => p.items).length} loaded)
                          </span>
                        ) : null}
                      </p>
                      {classicLeadsQ.data.pages.flatMap((p) => p.items).length === 0 ? (
                        <p className="px-2">{emptyListHint(role ?? null, false)}</p>
                      ) : (
                        <div className="-mx-1 max-w-full overflow-x-auto rounded-md border border-border/50">
                          <LeadsVirtualizedBody
                            items={classicLeadsQ.data.pages.flatMap((p) => p.items)}
                            archivedOnly={false}
                            role={role ?? null}
                            patchBusyLeadId={patchBusyLeadId}
                            deleteBusyLeadId={deleteBusyLeadId}
                            onPatchStatus={onPatchStatus}
                            onPatchPool={onPatchPool}
                            onPatchArchive={onPatchArchive}
                            onDelete={onDeleteLead}
                          />
                        </div>
                      )}
                      {classicLeadsQ.data.pages.flatMap((p) => p.items).length > 0 &&
                      classicLeadsQ.hasNextPage ? (
                        <div className="mt-3 flex justify-center">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={classicLeadsQ.isFetchingNextPage}
                            onClick={() => void classicLeadsQ.fetchNextPage()}
                          >
                            {classicLeadsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
                          </Button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : (
                <p className="px-2 text-xs text-muted-foreground">Open to load the spreadsheet-style list.</p>
              )}
            </div>
          </details>
          {deleteMut.isError ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {deleteMut.error instanceof Error ? deleteMut.error.message : 'Delete failed'}
            </p>
          ) : null}
          {patchMut.isError ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {patchMut.error instanceof Error ? patchMut.error.message : 'Update failed'}
            </p>
          ) : null}
        </div>
      ) : null}

      {archivedOnly && data ? (
        <div className="surface-elevated p-4 text-sm text-muted-foreground">
          <p className="mb-3 break-words font-medium text-foreground">
            Archived list — Total: {total}
            {total > items.length ? (
              <span className="ml-2 font-normal text-muted-foreground">
                (showing {items.length} loaded · {limit} per page)
              </span>
            ) : null}
          </p>
          {items.length === 0 ? (
            <p>{emptyListHint(role ?? null, archivedOnly)}</p>
          ) : (
            <div className="-mx-1 max-w-full overflow-x-auto rounded-md border border-border/50">
              <LeadsVirtualizedBody
                items={items}
                archivedOnly={archivedOnly}
                role={role ?? null}
                patchBusyLeadId={patchBusyLeadId}
                deleteBusyLeadId={deleteBusyLeadId}
                onPatchStatus={onPatchStatus}
                onPatchPool={onPatchPool}
                onPatchArchive={onPatchArchive}
                onDelete={onDeleteLead}
              />
            </div>
          )}
          {items.length > 0 && leadsQ.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="secondary"
                disabled={leadsQ.isFetchingNextPage}
                onClick={() => void leadsQ.fetchNextPage()}
              >
                {leadsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
          {deleteMut.isError ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {deleteMut.error instanceof Error ? deleteMut.error.message : 'Delete failed'}
            </p>
          ) : null}
          {patchMut.isError ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {patchMut.error instanceof Error ? patchMut.error.message : 'Update failed'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
