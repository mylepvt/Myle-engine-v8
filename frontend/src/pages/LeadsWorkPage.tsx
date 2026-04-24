import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Filter, Mail, MapPin, Phone, Plus, Search, Share2, Upload, UserPlus, X } from 'lucide-react'

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
  useImportLeadsFileMutation,
  useLeadsInfiniteQuery,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useSendEnrollmentVideoMutation } from '@/hooks/use-enroll-query'
import {
  openExternalShareUrl,
} from '@/lib/external-share-window'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'
import { teamLeadStatusSelectOptions } from '@/lib/team-lead-status'
import type { Role } from '@/types/role'

type Props = {
  title: string
  /** Active = main list (non-archived). Archived = `archived_only` API + restore UX. */
  listMode?: 'active' | 'archived'
}

const emptyFilters: LeadListFilters = { q: '', status: '' }

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Select source —' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'other', label: 'Other' },
]

const fieldInputClass = 'field-input'

function emptyListHint(role: Role | null, archivedOnly: boolean): string {
  if (archivedOnly) {
    return 'No archived leads — archive from the active list when you want to clear your pipeline without deleting.'
  }
  if (role === 'admin') {
    return 'No leads match this view — adjust filters or add one above. You see all active leads (admin scope).'
  }
  if (role === 'leader') {
    return 'No leads match this view — adjust filters or add one above. You see only your personal calling leads here.'
  }
  return 'No leads match this view — adjust filters or add one above. You see only leads you created.'
}

export function LeadsWorkPage({ title, listMode = 'active' }: Props) {
  const archivedOnly = listMode === 'archived'
  const leadsListMode = listMode === 'archived' ? 'archived' : 'active'
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)
  const [searchParams] = useSearchParams()
  const qParam = searchParams.get('q') ?? ''
  const [qInput, setQInput] = useState(qParam)
  const [filters, setFilters] = useState<LeadListFilters>({ ...emptyFilters, q: qParam })
  const crossSectionSearch =
    !archivedOnly &&
    filters.q.trim().length > 0 &&
    (surfaceRole === 'admin' || surfaceRole === 'leader')
  const [newStatus, setNewStatus] = useState<LeadStatus>('new_lead')
  const [name, setName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newSource, setNewSource] = useState('')
  const [createHint, setCreateHint] = useState<string | null>(null)
  const [advancedTableOpen, setAdvancedTableOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [importHint, setImportHint] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const importMut = useImportLeadsFileMutation()
  const canFileImport = surfaceRole === 'leader' || surfaceRole === 'team'

  useEffect(() => {
    setQInput(qParam)
  }, [qParam])

  useEffect(() => {
    if (!quickAddOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickAddOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [quickAddOpen])

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
    50,
    crossSectionSearch ? { searchAllSections: true } : undefined,
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
  const sendEnrollmentMut = useSendEnrollmentVideoMutation()
  const patchBusyLeadId =
    patchMut.isPending && patchMut.variables && typeof patchMut.variables.id === 'number'
      ? patchMut.variables.id
      : null
  const deleteBusyLeadId =
    deleteMut.isPending && typeof deleteMut.variables === 'number' ? deleteMut.variables : null

  const addStatusOptions = useMemo(
    () => teamLeadStatusSelectOptions(surfaceRole ?? null, LEAD_STATUS_OPTIONS),
    [surfaceRole],
  )

  const onPatchStatus = useCallback(
    (id: number, status: LeadStatus) => {
      if (status === 'video_sent') {
        void sendEnrollmentMut
          .mutateAsync(id)
          .then((result) => {
            const manualUrl = result.delivery.manual_share_url?.trim()
            openExternalShareUrl(manualUrl)
          })
          .catch(() => {})
        return
      }
      void patchMut.mutateAsync({ id, body: { status } })
    },
    [patchMut, sendEnrollmentMut],
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

  async function handleImportFilePick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setImportHint(null)
    try {
      const r = await importMut.mutateAsync({ file: f })
      const extra = r.warnings?.length ? ` ${r.warnings.join(' ')}` : ''
      setImportHint(`Imported ${r.imported}, skipped ${r.skipped}.${extra}`)
    } catch (err) {
      setImportHint(err instanceof Error ? err.message : 'Import failed')
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreateHint(null)
    const trimmed = name.trim()
    const phone = newPhone.trim()
    if (!trimmed) {
      setCreateHint('Full name is required.')
      return
    }
    if (!phone) {
      setCreateHint('Phone is required.')
      return
    }
    try {
      await createMut.mutateAsync({
        name: trimmed,
        phone,
        status: newStatus,
        email: newEmail.trim() || undefined,
        city: newCity.trim() || undefined,
        source: newSource.trim() || undefined,
      })
      setName('')
      setNewPhone('')
      setNewEmail('')
      setNewCity('')
      setNewSource('')
      setNewStatus('new_lead')
      setQuickAddOpen(false)
    } catch {
      /* surfaced below */
    }
  }

  if (archivedOnly) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 max-w-full truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {title}
          </h1>
          <Link
            to="/dashboard/work/leads"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            ← Active leads
          </Link>
        </div>

        <p className="text-sm text-muted-foreground">
          Restore a lead to send it back to your main list and workboard.
        </p>

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
              Archived list — Total: {total}
              {total > items.length ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  (showing {items.length} loaded · {limit} per page)
                </span>
              ) : null}
            </p>
            {items.length === 0 ? (
              <p>{emptyListHint(surfaceRole ?? null, archivedOnly)}</p>
            ) : (
              <div className="-mx-1 max-w-full overflow-x-auto rounded-md border border-border/50">
                <LeadsVirtualizedBody
                  items={items}
                  archivedOnly={archivedOnly}
                  role={surfaceRole ?? null}
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
            {sendEnrollmentMut.isError ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {sendEnrollmentMut.error instanceof Error ? sendEnrollmentMut.error.message : 'Enrollment send failed'}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mx-auto min-h-[50dvh] max-w-[430px] bg-background pb-8 text-foreground transition-colors md:max-w-[480px]">
        <div className="border-b border-border/60 bg-card/55 px-4 pb-2 pt-2 supports-[backdrop-filter]:bg-card/40">
          <div className="flex flex-wrap items-center gap-2">
            <div className="surface-inset flex h-9 min-w-0 basis-full items-center gap-1.5 rounded-lg px-2.5 min-[360px]:basis-0 min-[360px]:flex-1">
              <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="text"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search name, phone, email..."
                className="min-w-0 flex-1 bg-transparent text-ds-caption text-foreground outline-none placeholder:text-muted-foreground"
                autoComplete="off"
              />
            </div>
            <div className="ml-auto flex w-full items-center justify-end gap-2 min-[360px]:w-auto">
              <button
                type="button"
                aria-label="Filters"
                onClick={() => setFilterOpen((o) => !o)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
              >
                <Filter className="size-3.5" />
              </button>
              {canFileImport ? (
                <>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    aria-hidden
                    tabIndex={-1}
                    onChange={(ev) => void handleImportFilePick(ev)}
                  />
                  <button
                    type="button"
                    aria-label="Import leads from PDF"
                    disabled={importMut.isPending}
                    onClick={() => importFileRef.current?.click()}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Upload className="size-3.5" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                aria-label="Add lead"
                onClick={() => setQuickAddOpen(true)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md transition active:scale-95"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
          {importHint ? (
            <p className="mt-1 px-1 text-ds-caption text-muted-foreground" role="status">
              {importHint}
            </p>
          ) : null}
        </div>

        {filterOpen ? (
          <div className="border-b border-border px-4 pb-3">
            <label htmlFor="lead-filter-status-crm" className="mb-1 block text-ds-caption font-medium text-muted-foreground">
              Status
            </label>
            <select
              id="lead-filter-status-crm"
              value={filters.status}
              data-ui-silent
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: e.target.value === '' ? '' : (e.target.value as LeadStatus),
                }))
              }
              className="field-input"
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
        ) : null}

        {crossSectionSearch ? (
          <div className="border-b border-border px-4 py-2 text-ds-caption text-muted-foreground">
            Search results include workboard, retarget, and archived leads for this role.
          </div>
        ) : null}

        <CtcsWorkSurface filters={filters} patchBusyLeadId={patchBusyLeadId} />

        <details
          className="mt-6 border-t border-border px-4 pt-4 text-muted-foreground"
          onToggle={(e) => setAdvancedTableOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer select-none list-none text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            Advanced — classic table
          </summary>
          <div className="surface-elevated mt-3 p-2 pb-4">
            {advancedTableOpen ? (
              <>
                {classicLeadsQ.isPending ? (
                  <div className="space-y-2 px-2">
                    <Skeleton className="h-9 w-full bg-muted" />
                    <Skeleton className="h-9 w-full bg-muted" />
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
                      <p className="px-2 text-sm">{emptyListHint(surfaceRole ?? null, false)}</p>
                    ) : (
                      <div className="-mx-1 max-w-full overflow-x-auto rounded-md border border-border">
                        <LeadsVirtualizedBody
                          items={classicLeadsQ.data.pages.flatMap((p) => p.items)}
                          archivedOnly={false}
                          role={surfaceRole ?? null}
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
          <p className="mt-4 px-4 text-xs text-destructive" role="alert">
            {deleteMut.error instanceof Error ? deleteMut.error.message : 'Delete failed'}
          </p>
        ) : null}
        {patchMut.isError ? (
          <p className="mt-2 px-4 text-xs text-destructive" role="alert">
            {patchMut.error instanceof Error ? patchMut.error.message : 'Update failed'}
          </p>
        ) : null}
        {sendEnrollmentMut.isError ? (
          <p className="mt-2 px-4 text-xs text-destructive" role="alert">
            {sendEnrollmentMut.error instanceof Error ? sendEnrollmentMut.error.message : 'Enrollment send failed'}
          </p>
        ) : null}

        <div className="mt-6 px-4 text-center md:hidden">
          <Link
            to="/dashboard/work/archived"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground"
          >
            View archived leads
          </Link>
        </div>
      </div>

      {quickAddOpen ? (
        <div
          className="keyboard-safe-modal fixed inset-0 z-[60] flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4 dark:bg-black/60"
          role="presentation"
          onClick={() => setQuickAddOpen(false)}
        >
          <div
            className="keyboard-safe-sheet overscroll-contain max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-add-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-foreground">
                <UserPlus className="size-5 text-[var(--palette-cyan-dull)]" aria-hidden />
                <h2 id="quick-add-title" className="text-base font-bold">
                  Quick Add Lead
                </h2>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
                onClick={() => setQuickAddOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-4">
              <p className="mb-3 flex items-center gap-2 text-ds-caption font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="inline-flex size-6 items-center justify-center rounded-md bg-muted text-[var(--palette-cyan-dull)]">
                  <Phone className="size-3.5" aria-hidden />
                </span>
                Contact information
              </p>
              <form onSubmit={(e) => void handleCreate(e)} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="qa-lead-name" className="mb-1 block text-xs font-semibold text-foreground">
                      Full name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <UserPlus className="size-4" aria-hidden />
                      </span>
                      <input
                        id="qa-lead-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        required
                        disabled={createMut.isPending}
                        className={`${fieldInputClass} pl-10`}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="qa-lead-phone" className="mb-1 block text-xs font-semibold text-foreground">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Phone className="size-4" aria-hidden />
                      </span>
                      <input
                        id="qa-lead-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="10-digit number"
                        required
                        disabled={createMut.isPending}
                        className={`${fieldInputClass} pl-10`}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="qa-lead-city" className="mb-1 block text-xs font-semibold text-foreground">
                      City
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <MapPin className="size-4" aria-hidden />
                      </span>
                      <input
                        id="qa-lead-city"
                        value={newCity}
                        onChange={(e) => setNewCity(e.target.value)}
                        placeholder="Mumbai"
                        disabled={createMut.isPending}
                        className={`${fieldInputClass} pl-10`}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="qa-lead-email" className="mb-1 block text-xs font-semibold text-foreground">
                      Email
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        <Mail className="size-4" aria-hidden />
                      </span>
                      <input
                        id="qa-lead-email"
                        type="email"
                        autoComplete="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="rahul@example.com"
                        disabled={createMut.isPending}
                        className={`${fieldInputClass} pl-10`}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="qa-lead-source" className="mb-1 block text-xs font-semibold text-foreground">
                      Source
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground">
                        <Share2 className="size-4" aria-hidden />
                      </span>
                      <select
                        id="qa-lead-source"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                        disabled={createMut.isPending}
                        className={`${fieldInputClass} appearance-none pl-10`}
                      >
                        {SOURCE_OPTIONS.map((o) => (
                          <option key={o.value || 'none'} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="qa-lead-status" className="mb-1 block text-xs font-semibold text-foreground">
                      Lead status
                    </label>
                    <select
                      id="qa-lead-status"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as LeadStatus)}
                      disabled={createMut.isPending}
                      className={fieldInputClass}
                    >
                      {addStatusOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {createHint ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
                    {createHint}
                  </p>
                ) : null}
                {createMut.isError ? (
                  <p className="text-xs text-destructive" role="alert">
                    {createMut.error instanceof Error ? createMut.error.message : 'Could not create'}
                  </p>
                ) : null}
                <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-border"
                    disabled={createMut.isPending}
                    onClick={() => setQuickAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    data-ui-silent
                    disabled={createMut.isPending || !name.trim() || !newPhone.trim()}
                    className="border-0 bg-gradient-to-r from-emerald-600 to-[var(--palette-cyan-dull)] font-semibold text-primary-foreground shadow-md hover:opacity-90"
                  >
                    {createMut.isPending ? 'Adding…' : 'Add Lead'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
