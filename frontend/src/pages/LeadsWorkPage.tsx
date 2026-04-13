import { type FormEvent, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { LeadContactActions } from '@/components/leads/LeadContactActions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function statusLabel(value: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
}

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

  useEffect(() => {
    setQInput(qParam)
  }, [qParam])

  useEffect(() => {
    const id = window.setTimeout(() => {
      setFilters((f) => ({ ...f, q: qInput }))
    }, 400)
    return () => window.clearTimeout(id)
  }, [qInput])

  const leadsQ = useLeadsInfiniteQuery(true, filters, leadsListMode)
  const data = leadsQ.data
  const items = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0
  const limit = data?.pages[0]?.limit ?? 50
  const isPending = leadsQ.isPending
  const isError = leadsQ.isError
  const error = leadsQ.error
  const refetch = leadsQ.refetch
  const createMut = useCreateLeadMutation()
  const deleteMut = useDeleteLeadMutation()
  const patchMut = usePatchLeadMutation()

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
            className="w-full rounded-md border border-white/12 bg-white/[0.05] backdrop-blur-sm px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
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
            className="w-full max-w-full rounded-md border border-white/12 bg-white/[0.05] backdrop-blur-sm px-2 py-2 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35 sm:px-3 sm:text-sm"
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
                className="w-full rounded-md border border-white/12 bg-white/[0.05] backdrop-blur-sm px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
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
                className="w-full rounded-md border border-white/12 bg-white/[0.05] backdrop-blur-sm px-3 py-2 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
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
      {data ? (
        <div className="surface-elevated p-4 text-sm text-muted-foreground">
          <p className="mb-3 break-words font-medium text-foreground">
            Total: {total}
            {total > items.length ? (
              <span className="ml-2 font-normal text-muted-foreground">
                (showing {items.length} loaded · {limit} per page)
              </span>
            ) : null}
          </p>
          {items.length === 0 ? (
            <p>{emptyListHint(role ?? null, archivedOnly)}</p>
          ) : (
            <div className="-mx-1 max-w-full overflow-x-auto">
            <Table className="min-w-[880px] table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[4.5rem] text-right tabular-nums text-muted-foreground">
                    ID
                  </TableHead>
                  <TableHead className="min-w-[10rem] text-foreground">Name</TableHead>
                  <TableHead className="w-[min(13rem,28vw)] text-foreground">Phone</TableHead>
                  <TableHead className="w-[min(14rem,26vw)] text-foreground">Stage</TableHead>
                  <TableHead className="w-[10rem] text-right text-foreground">Created</TableHead>
                  {archivedOnly ? (
                    <TableHead className="w-[10rem] text-right text-foreground">Archived</TableHead>
                  ) : null}
                  <TableHead className="w-[min(18rem,40%)] text-right text-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => (
                  <TableRow key={l.id} className="align-middle">
                    <TableCell className="text-right tabular-nums text-muted-foreground">{l.id}</TableCell>
                    <TableCell className="min-w-0 font-medium text-foreground">
                      <Link
                        to={`/dashboard/work/leads/${l.id}`}
                        className="block truncate text-foreground hover:text-primary hover:underline underline-offset-2"
                      >
                        {l.name}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-0 align-middle">
                      {l.phone?.trim() ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 truncate text-xs tabular-nums text-foreground">{l.phone}</span>
                          <LeadContactActions phone={l.phone} className="shrink-0" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-0">
                      {!archivedOnly ? (
                        <select
                          aria-label={`Status for ${l.name}`}
                          data-ui-silent
                          value={l.status}
                          disabled={patchMut.isPending}
                          onChange={(e) => {
                            const v = e.target.value as LeadStatus
                            void patchMut.mutateAsync({ id: l.id, body: { status: v } })
                          }}
                          className="w-full max-w-full rounded-md border border-white/12 bg-white/[0.05] px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                        >
                          {LEAD_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm text-foreground">{statusLabel(l.status)}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    {archivedOnly ? (
                      <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                        {l.archived_at
                          ? new Date(l.archived_at).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!archivedOnly && role === 'admin' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={patchMut.isPending}
                            title="Move to shared pool for members to claim"
                            onClick={() => void patchMut.mutateAsync({ id: l.id, body: { in_pool: true } })}
                          >
                            To pool
                          </Button>
                        ) : null}
                        {archivedOnly ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={patchMut.isPending}
                            onClick={() => void patchMut.mutateAsync({ id: l.id, body: { archived: false } })}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={patchMut.isPending}
                            onClick={() => void patchMut.mutateAsync({ id: l.id, body: { archived: true } })}
                          >
                            Archive
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={deleteMut.isPending}
                          onClick={() => void deleteMut.mutateAsync(l.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <p className="mt-2 text-xs text-destructive">
              {deleteMut.error instanceof Error ? deleteMut.error.message : 'Delete failed'}
            </p>
          ) : null}
          {patchMut.isError ? (
            <p className="mt-2 text-xs text-destructive">
              {patchMut.error instanceof Error ? patchMut.error.message : 'Update failed'}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
