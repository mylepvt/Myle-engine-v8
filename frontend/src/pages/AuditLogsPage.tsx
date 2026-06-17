import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { useAuditLogsQuery, type AuditLogEntry } from '@/hooks/use-audit-logs-query'
import { cn } from '@/lib/utils'

// ── Action colours ────────────────────────────────────────────────────────────
type Chip = { bg: string; text: string; border: string }

function actionChip(action: string): Chip {
  if (action.startsWith('user.login'))        return { bg: 'bg-blue-500/15',    text: 'text-blue-600 dark:text-blue-300',    border: 'border-blue-500/30' }
  if (action.startsWith('daily_report'))      return { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-300', border: 'border-emerald-500/30' }
  if (action.startsWith('lead'))              return { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-600 dark:text-fuchsia-300', border: 'border-fuchsia-500/30' }
  if (action.startsWith('wallet'))            return { bg: 'bg-amber-500/15',   text: 'text-amber-600 dark:text-amber-300',   border: 'border-amber-500/30' }
  if (action.startsWith('wa.') || action.startsWith('whatsapp')) return { bg: 'bg-green-500/15', text: 'text-green-600 dark:text-green-300', border: 'border-green-500/30' }
  if (action.startsWith('enrollment'))        return { bg: 'bg-teal-500/15',    text: 'text-teal-600 dark:text-teal-300',    border: 'border-teal-500/30' }
  return { bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-500/30' }
}

function friendlyAction(action: string): string {
  const labels: Record<string, string> = {
    'user.login':            'Login',
    'daily_report.submit':   'Report Submitted',
    'daily_report.update':   'Report Updated',
    'lead.pool_import':      'Lead Pool Import',
    'lead.free_pool_import': 'Free Pool Import',
    'wa.broadcast':          'WA Broadcast',
  }
  if (labels[action]) return labels[action]
  return action
    .split(/[._:]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

function metaSummary(entry: AuditLogEntry): string {
  if (!entry.meta) return ''
  const m = entry.meta
  if (entry.action.startsWith('daily_report')) {
    const d = m['report_date'] ? String(m['report_date']) : ''
    const c = m['calls'] != null ? `${m['calls']} calls` : ''
    return [d, c].filter(Boolean).join(' · ')
  }
  if (entry.action.startsWith('lead.pool_import')) {
    return m['created'] != null ? `${m['created']} leads created` : ''
  }
  const vals = Object.entries(m)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
  return vals
}

function formatTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  }
}

// ── Single row (desktop table) ────────────────────────────────────────────────
function LogRow({ entry }: { entry: AuditLogEntry }) {
  const chip = actionChip(entry.action)
  const { date, time } = formatTime(entry.created_at)
  const summary = metaSummary(entry)

  return (
    <tr className="border-b border-border dark:border-white/[0.06] transition-colors hover:bg-muted/30 dark:hover:bg-white/[0.03]">
      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
        <span className="block">{date}</span>
        <span className="block tabular-nums opacity-60">{time}</span>
      </td>
      <td className="px-4 py-2.5 text-sm text-[color-mix(in_srgb,var(--foreground)_90%,transparent)]">{entry.actor}</td>
      <td className="px-4 py-2.5">
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', chip.bg, chip.text, chip.border)}>
          {friendlyAction(entry.action)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground/70">
        {entry.entity_type ? `${entry.entity_type}${entry.entity_id ? ` #${entry.entity_id}` : ''}` : '—'}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground/60">{summary || '—'}</td>
    </tr>
  )
}

// ── Single card (mobile) ──────────────────────────────────────────────────────
function LogCard({ entry }: { entry: AuditLogEntry }) {
  const chip = actionChip(entry.action)
  const { date, time } = formatTime(entry.created_at)
  const summary = metaSummary(entry)

  return (
    <div className="rounded-xl border border-border dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', chip.bg, chip.text, chip.border)}>
          {friendlyAction(entry.action)}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
          {date} {time}
        </span>
      </div>
      <p className="text-sm font-medium text-[color-mix(in_srgb,var(--foreground)_90%,transparent)]">{entry.actor}</p>
      {(entry.entity_type || summary) ? (
        <p className="text-xs text-muted-foreground/60">
          {entry.entity_type ? `${entry.entity_type}${entry.entity_id ? ` #${entry.entity_id}` : ''}` : ''}
          {entry.entity_type && summary ? ' · ' : ''}
          {summary}
        </p>
      ) : null}
    </div>
  )
}

// ── Day-range filter ──────────────────────────────────────────────────────────
const DAY_OPTIONS = [7, 30, 90] as const

// ── Main page ─────────────────────────────────────────────────────────────────
type Props = { title: string }

export function AuditLogsPage({ title }: Props) {
  const navigate = useNavigate()
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.role === 'admin'

  const [days, setDays] = useState<number>(30)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState<string | undefined>()
  const [qText, setQText] = useState('')

  const { data, isPending, isError, error, isFetching, refetch } = useAuditLogsQuery({
    page,
    days,
    action: filterAction,
  })

  function handleDays(d: number) {
    setDays(d)
    setPage(1)
  }

  function handleActionFilter(a: string) {
    setFilterAction((prev) => (prev === a ? undefined : a))
    setPage(1)
  }

  const totalPages = data?.pages ?? 1

  // Derive unique actions from current page for filter chips
  const actionCounts = data?.items.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1
    return acc
  }, {}) ?? {}
  const topActions = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const filteredItems = useMemo(() => {
    if (!data?.items) return [] as AuditLogEntry[]
    const q = qText.trim().toLowerCase()
    if (!q) return data.items
    return data.items.filter(
      (e) =>
        e.actor.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        (e.entity_type ?? '').toLowerCase().includes(q) ||
        String(e.entity_id ?? '').includes(q),
    )
  }, [data, qText])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-primary hover:underline underline-offset-2"
          >
            ← Back
          </button>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] text-muted-foreground transition hover:bg-muted/50 dark:hover:bg-white/[0.08] disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </button>
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground/60">Showing your own activity only.</p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Days buttons */}
        <div className="flex rounded-lg border border-border dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] p-0.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDays(d)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                days === d
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Action filter chips */}
        {topActions.map(([action, count]) => {
          const chip = actionChip(action)
          const active = filterAction === action
          return (
            <button
              key={action}
              type="button"
              onClick={() => handleActionFilter(action)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all',
                active ? cn(chip.bg, chip.text, chip.border) : 'border-border dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] text-muted-foreground hover:text-foreground',
              )}
            >
              {friendlyAction(action)}
              <span className="ml-1 opacity-50">{count}</span>
            </button>
          )
        })}

        {filterAction && (
          <button
            type="button"
            onClick={() => { setFilterAction(undefined); setPage(1) }}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
          >
            Clear filter ×
          </button>
        )}
      </div>

      {/* Text search */}
      <div className="surface-inset flex h-9 items-center gap-1.5 rounded-lg px-2.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="Search actor, action, entity..."
          aria-label="Search activity log"
          className="min-w-0 flex-1 bg-transparent text-ds-caption text-foreground outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
      </div>

      {/* Loading skeleton */}
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : null}

      {/* Error */}
      {isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Failed to load audit logs'}
          <button type="button" className="ml-2 underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Desktop table */}
      {data && filteredItems.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border dark:border-white/[0.08] md:block">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-border dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03]">
                  {['Time', 'Who', 'Action', 'Entity', 'Details'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((e) => <LogRow key={e.id} entry={e} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filteredItems.map((e) => <LogCard key={e.id} entry={e} />)}
          </div>
        </>
      ) : null}

      {/* Empty */}
      {data && filteredItems.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground/50">
          {qText.trim() ? 'No activity matches your search.' : `No activity in the last ${days} days.`}
        </p>
      ) : null}

      {/* Pagination */}
      {data && totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-xs text-muted-foreground/60">
            Page {data.page} of {data.pages} · {data.total} total
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => p - 1)}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] disabled:opacity-40 hover:bg-muted/50 dark:hover:bg-white/[0.08]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] disabled:opacity-40 hover:bg-muted/50 dark:hover:bg-white/[0.08]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
