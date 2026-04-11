import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  LayoutGrid,
  PlusCircle,
  RefreshCw,
  Search,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LEAD_STATUS_OPTIONS,
  type LeadPublic,
  type LeadStatus,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useWorkboardQuery } from '@/hooks/use-workboard-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { cn, formatRelativeTimeShort } from '@/lib/utils'

type Props = {
  title: string
}

function columnTitle(status: string): string {
  return LEAD_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

/** Left accent per pipeline stage — matches Lead flow / theme. */
const COLUMN_ACCENT: Record<string, string> = {
  new: 'border-l-primary',
  contacted: 'border-l-sky-400/90',
  qualified: 'border-l-emerald-400/90',
  won: 'border-l-[hsl(142_71%_45%)]',
  lost: 'border-l-destructive/75',
}

function workboardScopeLine(role: string | null): string {
  if (role === 'admin') {
    return 'Organization view — every active lead (excluding pool, archived, deleted). Change status here or on Leads.'
  }
  if (role === 'leader') {
    return 'Your pipeline — leads you created (same rules as My Leads). Team-wide routing arrives with org hierarchy.'
  }
  return 'Your pipeline — leads you created. Change status on cards or on the Leads page.'
}

function useQuickLinks(role: string | null) {
  return useMemo(() => {
    const links: { to: string; label: string }[] = [
      { to: '/dashboard/work/leads', label: 'Leads' },
    ]
    if (role === 'admin') {
      links.push(
        { to: '/dashboard/work/add-lead', label: 'Add lead' },
        { to: '/dashboard/work/lead-pool-admin', label: 'Lead pool' },
        { to: '/dashboard/work/recycle-bin', label: 'Recycle bin' },
      )
    }
    if (role === 'leader' || role === 'team') {
      links.push({ to: '/dashboard/work/lead-pool', label: 'Lead pool' })
    }
    if (role !== 'team') {
      links.push({ to: '/dashboard/work/follow-ups', label: 'Follow-ups' })
    }
    links.push({ to: '/dashboard/work/retarget', label: 'Retarget' })
    links.push({ to: '/dashboard/work/archived', label: 'Archived' })
    if (role !== 'admin') {
      links.push({ to: '/dashboard/work/lead-flow', label: 'Lead flow' })
    }
    return links
  }, [role])
}

type ColumnData = {
  status: string
  total: number
  items: LeadPublic[]
}

function filterColumns(cols: ColumnData[], q: string): ColumnData[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return cols
  return cols.map((col) => ({
    ...col,
    items: col.items.filter(
      (l) => l.name.toLowerCase().includes(needle) || String(l.id).includes(needle),
    ),
  }))
}

export function WorkboardPage({ title }: Props) {
  const { role } = useDashboardShellRole()
  const { data, isPending, isError, error, refetch, isFetching } = useWorkboardQuery(true)
  const patchMut = usePatchLeadMutation()
  const quickLinks = useQuickLinks(role)
  const [qInput, setQInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const id = window.setTimeout(() => setSearch(qInput), 350)
    return () => window.clearTimeout(id)
  }, [qInput])

  const filteredColumns = useMemo(
    () => (data ? filterColumns(data.columns, search) : []),
    [data, search],
  )

  const metrics = useMemo(() => {
    if (!data) return null
    const byStatus = Object.fromEntries(data.columns.map((c) => [c.status, c.total]))
    const sum = (keys: string[]) => keys.reduce((acc, k) => acc + (byStatus[k] ?? 0), 0)
    const pipelineOpen = sum(['new', 'contacted', 'qualified'])
    const won = byStatus.won ?? 0
    const lost = byStatus.lost ?? 0
    const grand = data.columns.reduce((acc, c) => acc + c.total, 0)
    return { pipelineOpen, won, lost, grand }
  }, [data])

  function onCardStatusChange(lead: LeadPublic, next: LeadStatus) {
    if (next === lead.status) return
    void patchMut.mutateAsync({ id: lead.id, body: { status: next } })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {workboardScopeLine(role)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={isPending || isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} aria-hidden />
            Refresh
          </Button>
          <Button type="button" size="sm" className="gap-1.5" asChild>
            <Link to="/dashboard/work/leads">
              <PlusCircle className="h-3.5 w-3.5" aria-hidden />
              Add lead
            </Link>
          </Button>
        </div>
      </div>

      {metrics ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="surface-elevated px-3 py-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
              Pipeline
            </p>
            <p className="mt-1 font-heading text-2xl tabular-nums text-foreground">
              {metrics.pipelineOpen}
            </p>
            <p className="text-xs text-muted-foreground">New + contacted + qualified</p>
          </div>
          <div className="surface-elevated px-3 py-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
              Won
            </p>
            <p className="mt-1 font-heading text-2xl tabular-nums text-[hsl(142_71%_48%)]">
              {metrics.won}
            </p>
            <p className="text-xs text-muted-foreground">Closed — win</p>
          </div>
          <div className="surface-elevated px-3 py-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
              Lost
            </p>
            <p className="mt-1 font-heading text-2xl tabular-nums text-destructive/90">
              {metrics.lost}
            </p>
            <p className="text-xs text-muted-foreground">Closed — lost</p>
          </div>
          <div className="surface-elevated px-3 py-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
              All active
            </p>
            <p className="mt-1 font-heading text-2xl tabular-nums text-foreground">{metrics.grand}</p>
            <p className="text-xs text-muted-foreground">
              Window load ≤ {data?.max_rows_fetched ?? '—'} rows
            </p>
          </div>
        </div>
      ) : null}

      <div className="surface-elevated flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:min-w-[14rem]">
          <label htmlFor="workboard-search" className="mb-1 block text-xs font-medium text-muted-foreground">
            Search loaded cards
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="workboard-search"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Name or ID…"
              className="w-full rounded-md border border-white/12 bg-white/[0.05] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground sm:max-w-xs">
          Filters cards already fetched into columns. Full-text search across all leads is on{' '}
          <Link to="/dashboard/work/leads" className="text-primary underline-offset-2 hover:underline">
            Leads
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-white/10 pb-3 text-xs">
        <span className="font-medium text-muted-foreground">Shortcuts:</span>
        {quickLinks.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
          >
            {l.label}
            <ArrowUpRight className="h-3 w-3 opacity-70" aria-hidden />
          </Link>
        ))}
      </div>

      {isPending ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[min(28rem,70vh)] w-[min(100%,18rem)] shrink-0 rounded-xl" />
          ))}
        </div>
      ) : null}

      {isError ? (
        <div className="surface-elevated px-4 py-3 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Could not load workboard'}{' '}
          <Button type="button" variant="ghost" size="sm" className="h-auto p-0 align-baseline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          <p className="text-xs text-muted-foreground">
            Columns show up to 40 recent cards per stage from the latest {data.max_rows_fetched} leads (API cap).
            {search.trim() ? ' Search narrows the loaded cards only.' : null}
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2 pt-1 [scrollbar-gutter:stable]">
            {filteredColumns.map((col) => {
              const orig = data.columns.find((c) => c.status === col.status)
              const total = orig?.total ?? col.total
              const accent = COLUMN_ACCENT[col.status] ?? 'border-l-muted-foreground/40'
              return (
                <section
                  key={col.status}
                  aria-label={`${columnTitle(col.status)} column`}
                  className={cn(
                    'surface-elevated flex w-[min(100%,18rem)] shrink-0 flex-col border-l-[3px] shadow-lg',
                    accent,
                  )}
                >
                  <header className="border-b border-white/10 px-3 py-2.5">
                    <h2 className="text-sm font-semibold text-foreground">{columnTitle(col.status)}</h2>
                    <p className="text-xs text-muted-foreground">
                      {search.trim()
                        ? `${col.items.length} match${col.items.length === 1 ? '' : 'es'} · ${total} in stage`
                        : `${orig?.items.length ?? 0} shown · ${total} total`}
                    </p>
                  </header>
                  <ul className="flex max-h-[min(28rem,70vh)] flex-col gap-2 overflow-y-auto p-2">
                    {col.items.length === 0 ? (
                      <li className="rounded-lg border border-dashed border-white/12 px-2 py-8 text-center text-xs text-muted-foreground">
                        {search.trim() ? 'No matches in this stage' : 'No leads'}
                      </li>
                    ) : (
                      col.items.map((l) => (
                        <li key={l.id}>
                          <article className="surface-inset flex flex-col gap-2 rounded-lg px-2.5 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium leading-tight text-foreground">{l.name}</p>
                                <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                                  #{l.id} · {formatRelativeTimeShort(l.created_at)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="sr-only" htmlFor={`wb-status-${l.id}`}>
                                Status for {l.name}
                              </label>
                              <select
                                id={`wb-status-${l.id}`}
                                value={l.status}
                                disabled={patchMut.isPending}
                                onChange={(e) => onCardStatusChange(l, e.target.value as LeadStatus)}
                                className="min-w-0 flex-1 rounded-md border border-white/12 bg-white/[0.06] px-2 py-1.5 text-xs text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35"
                              >
                                {LEAD_STATUS_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" asChild>
                                <Link to="/dashboard/work/leads" title="Manage on list view">
                                  List
                                </Link>
                              </Button>
                            </div>
                          </article>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              )
            })}
          </div>
        </>
      ) : null}

      {patchMut.isError ? (
        <p className="text-xs text-destructive" role="alert">
          {patchMut.error instanceof Error ? patchMut.error.message : 'Could not update status'}
        </p>
      ) : null}
    </div>
  )
}
