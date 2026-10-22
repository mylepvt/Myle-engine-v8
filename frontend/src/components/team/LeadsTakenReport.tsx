import { useDeferredValue, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'

import { ListSearchInput } from '@/components/ui/list-search-input'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, InlineEmpty } from '@/components/ui/states'
import {
  useMemberClaimsQuery,
  useMyTeamClaimsQuery,
  type ClaimPeriod,
  type ClaimsReport,
  type MemberClaims,
} from '@/hooks/use-my-team-query'
import { filterCollectionByQuery } from '@/lib/search-filter'
import { cn } from '@/lib/utils'

type ReportMember = ClaimsReport['members'][number]

const PERIODS: { value: ClaimPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const money = (cents: number) => inr.format(cents / 100)

function dayLabel(isoDate: string): string {
  // isoDate is an IST calendar day (YYYY-MM-DD); noon keeps it on the same day everywhere.
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function when(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

function Pills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'press rounded-full px-3 py-1.5 text-sm font-medium',
            value === o.value ? 'control-pill' : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Tile({ label, value, hint, dot }: { label: string; value: string; hint?: string; dot?: string }) {
  return (
    <div className="surface-elevated p-3 md:p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dot ? <span className={cn('size-2 rounded-full', dot)} aria-hidden /> : null}
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Paid vs free as one bar: the split is the point, not the exact pixels. */
function SplitBar({ paid, free }: { paid: number; free: number }) {
  const total = paid + free
  if (total === 0) return null
  const p = Math.round((paid / total) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${paid} paid, ${free} free`}>
        <div className="bg-primary" style={{ width: `${p}%` }} />
        <div className="bg-success" style={{ width: `${100 - p}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {p}% paid · {100 - p}% free
      </p>
    </div>
  )
}

function Counts({ m }: { m: Pick<ReportMember, 'taken' | 'paid' | 'free'> }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <div>
        <dt className="text-xs text-muted-foreground">Total</dt>
        <dd className="font-medium tabular-nums text-foreground">{m.taken}</dd>
      </div>
      <div>
        <dt className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Paid
        </dt>
        <dd className="font-medium tabular-nums text-foreground">{m.paid}</dd>
      </div>
      <div>
        <dt className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" aria-hidden /> Free
        </dt>
        <dd className="font-medium tabular-nums text-foreground">{m.free}</dd>
      </div>
    </dl>
  )
}

function MemberRow({ m, onOpen }: { m: ReportMember; onOpen: () => void }) {
  const extra = [
    m.paid ? `${money(m.net_paid_cents)} spent` : null,
    m.refunded ? `${m.refunded} refunded` : null,
    m.free_admin ? `${m.free_admin} free from admin` : null,
    m.active_days ? `${m.active_days} day${m.active_days === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return (
    <button type="button" onClick={onOpen} className="press surface-elevated flex w-full items-center gap-3 p-3 text-left md:p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <p className="truncate font-medium text-foreground">
          {m.is_me ? `${m.name} (you)` : m.name}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{m.fbo_id}</span>
        </p>
        <Counts m={m} />
        {extra.length || m.last_at ? (
          <p className="text-xs text-muted-foreground">
            {[...extra, m.last_at ? `last ${when(m.last_at)}` : null].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

type KindFilter = 'all' | 'paid' | 'free'

function MemberClaimsView({ m, period }: { m: ReportMember; period: ClaimPeriod }) {
  const q = useMemberClaimsQuery(m.user_id, period)
  const [kind, setKind] = useState<KindFilter>('all')
  const groups = useMemo(() => {
    const out: { day: string; rows: MemberClaims['claims'] }[] = []
    for (const c of q.data?.claims ?? []) {
      if (kind !== 'all' && c.kind !== kind) continue
      const last = out[out.length - 1]
      if (last && last.day === c.day) last.rows.push(c)
      else out.push({ day: c.day, rows: [c] })
    }
    return out
  }, [q.data, kind])
  const s = q.data?.summary

  return (
    <div className="space-y-4">
      <div>
        <h2 id="leads-taken-member-title" className="text-ds-h3 text-foreground">
          {m.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Leads taken · {PERIODS.find((p) => p.value === period)?.label.toLowerCase()}
        </p>
      </div>
      {q.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {q.isError ? <ErrorState title="Could not load" message={q.error.message} onRetry={() => void q.refetch()} /> : null}
      {s ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Paid leads" dot="bg-primary" value={String(s.paid)} hint={s.paid ? `${money(s.net_paid_cents)} spent` : undefined} />
            <Tile
              label="Free leads"
              dot="bg-success"
              value={String(s.free)}
              hint={s.free ? `${s.free_admin} from admin · ${s.free_pool} free pool` : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {s.taken
              ? `${s.taken} leads on ${s.active_days} day${s.active_days === 1 ? '' : 's'} · first ${when(s.first_at)} · last ${when(s.last_at)}`
              : 'No leads taken in this period.'}
            {s.refunded ? ` · ${s.refunded} refunded (${money(s.refund_cents)})` : ''}
          </p>
          <Pills
            label="Show"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: `All ${s.taken}` },
              { value: 'paid', label: `Paid ${s.paid}` },
              { value: 'free', label: `Free ${s.free}` },
            ]}
          />
          {groups.map((g) => {
            const paid = g.rows.filter((r) => r.kind === 'paid').length
            return (
              <section key={g.day} className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {dayLabel(g.day)} · {g.rows.length} lead{g.rows.length === 1 ? '' : 's'}
                  {kind === 'all' ? ` (${paid} paid, ${g.rows.length - paid} free)` : ''}
                </h3>
                <ul className="space-y-2">
                  {g.rows.map((c) => (
                    <li key={c.id} className="surface-inset flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{c.lead_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            time(c.claimed_at),
                            c.source_label,
                            c.reason,
                            c.given_by ? `by ${c.given_by}` : null,
                            c.status_label ? `now ${c.status_label}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 text-right">
                        <span
                          className={cn(
                            'block rounded-full px-2 py-0.5 text-xs font-medium',
                            c.kind === 'paid' ? 'bg-primary/15 text-primary' : 'bg-success/15 text-success-ink',
                          )}
                        >
                          {c.kind === 'paid' ? money(c.price_cents) : 'Free'}
                        </span>
                        {c.refunded ? <span className="mt-1 block text-xs text-muted-foreground">Refunded</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      ) : null}
    </div>
  )
}

/** Leader: leads their team took — paid and free kept apart, overall, day by day and per member. */
export function LeadsTakenReport() {
  const [period, setPeriod] = useState<ClaimPeriod>('30d')
  const q = useMyTeamClaimsQuery(period)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [showAllDays, setShowAllDays] = useState(false)
  const [showIdle, setShowIdle] = useState(false)
  const [open, setOpen] = useState<ReportMember | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const data = q.data
  const found = filterCollectionByQuery(data?.members ?? [], deferred, (m) => [m.name, m.fbo_id])
  const active = found.filter((m) => m.taken > 0)
  const idle = found.filter((m) => m.taken === 0)
  const days = data ? (showAllDays ? data.days : data.days.slice(0, 7)) : []
  const openMember = (m: ReportMember) => {
    setOpen(m)
    setSheetOpen(true)
  }

  return (
    <div className="space-y-5">
      <Pills label="Period" options={PERIODS} value={period} onChange={setPeriod} />

      {q.isPending ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : null}
      {q.isError ? <ErrorState title="Could not load the report" message={q.error.message} onRetry={() => void q.refetch()} /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile
              label="Leads taken"
              value={String(data.totals.taken)}
              hint={`by ${data.totals.members_taking} of ${data.members.length} people`}
            />
            <Tile
              label="Paid leads"
              dot="bg-primary"
              value={String(data.totals.paid)}
              hint={`${money(data.totals.net_paid_cents)} spent${data.totals.refunded ? ` · ${data.totals.refunded} refunded` : ''}`}
            />
            <Tile
              label="Free leads"
              dot="bg-success"
              value={String(data.totals.free)}
              hint={`${data.totals.free_admin} from admin · ${data.totals.free_pool} free pool`}
            />
            <Tile label="Free credit received" value={money(data.totals.free_credit_cents)} hint="free recharges, approved" />
          </div>
          <SplitBar paid={data.totals.paid} free={data.totals.free} />

          {data.days.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-foreground">Day by day</h2>
              <ul className="surface-elevated divide-y divide-border/60">
                {days.map((d) => (
                  <li key={d.date} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="text-foreground">{dayLabel(d.date)}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <span className="text-muted-foreground">
                        <span className="text-foreground">{d.paid}</span> paid
                      </span>
                      <span className="text-muted-foreground">
                        <span className="text-foreground">{d.free}</span> free
                      </span>
                      <span className="w-8 text-right font-medium text-foreground">{d.paid + d.free}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {data.days.length > 7 ? (
                <button type="button" onClick={() => setShowAllDays((v) => !v)} className="text-sm font-medium text-primary">
                  {showAllDays ? 'Show less' : `Show all ${data.days.length} days`}
                </button>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">Member-wise</h2>
            <ListSearchInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search name or FBO ID"
              aria-label="Search members in the report"
              wrapperClassName="w-full"
            />
            {active.length === 0 ? <InlineEmpty>No one took leads in this period.</InlineEmpty> : null}
            <ul className="space-y-2">
              {active.map((m) => (
                <li key={m.user_id}>
                  <MemberRow m={m} onOpen={() => openMember(m)} />
                </li>
              ))}
            </ul>
            {idle.length > 0 ? (
              <div className="space-y-2">
                <button type="button" onClick={() => setShowIdle((v) => !v)} className="text-sm font-medium text-primary">
                  {showIdle ? 'Hide' : 'Show'} {idle.length} who took no leads
                </button>
                {showIdle ? (
                  <ul className="surface-elevated divide-y divide-border/60">
                    {idle.map((m) => (
                      <li key={m.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="truncate text-foreground">{m.is_me ? `${m.name} (you)` : m.name}</span>
                        <span className="text-xs text-muted-foreground">{m.fbo_id}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} labelledBy="leads-taken-member-title" size="lg" className="p-5">
        {open ? <MemberClaimsView m={open} period={period} /> : null}
      </Sheet>
    </div>
  )
}
