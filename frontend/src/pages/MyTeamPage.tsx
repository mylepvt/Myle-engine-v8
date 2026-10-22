import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Gift, Phone } from 'lucide-react'

import { LeadsTakenReport } from '@/components/team/LeadsTakenReport'
import { Button } from '@/components/ui/button'
import { ListSearchInput } from '@/components/ui/list-search-input'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, InlineEmpty } from '@/components/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useMyTeamMemberQuery,
  useMyTeamQuery,
  type MyTeamMember,
  type StatusCount,
} from '@/hooks/use-my-team-query'
import { filterCollectionByQuery } from '@/lib/search-filter'
import { cn } from '@/lib/utils'

type Props = { title: string }

type SortKey = 'name' | 'wallet' | 'leads'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'wallet', label: 'Low wallet' },
  { value: 'leads', label: 'Most leads' },
]

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

function formatInr(cents: number): string {
  return inr.format(cents / 100)
}

function shortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-elevated p-3 md:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function StageChips({
  counts,
  active,
  onPick,
}: {
  counts: StatusCount[]
  active?: string | null
  onPick?: (status: string | null) => void
}) {
  if (counts.length === 0) return <InlineEmpty>No leads right now.</InlineEmpty>
  return (
    <div className="flex flex-wrap gap-2">
      {counts.map((c) => {
        const on = active === c.status
        const chip = (
          <>
            {c.label}
            <span className="ml-1.5 tabular-nums opacity-75">{c.count}</span>
          </>
        )
        return onPick ? (
          <button
            key={c.status}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? null : c.status)}
            className={cn(
              'press rounded-full px-3 py-1.5 text-sm font-medium',
              on ? 'control-pill' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {chip}
          </button>
        ) : (
          <span key={c.status} className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
            {chip}
          </span>
        )
      })}
    </div>
  )
}

function stageRows(counts: Record<string, number>, order: StatusCount[]): StatusCount[] {
  const labels = new Map(order.map((o, i) => [o.status, { label: o.label, i }]))
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([status, count]) => ({ status, count, label: labels.get(status)?.label ?? status.replace(/_/g, ' ') }))
    .sort((a, b) => (labels.get(a.status)?.i ?? 999) - (labels.get(b.status)?.i ?? 999))
}

function StateBadge({ state }: { state: MyTeamMember['state'] }) {
  if (state === 'active') return null
  return (
    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
      {state === 'removed' ? 'Removed' : 'Blocked'}
    </span>
  )
}

function PersonCard({
  m,
  onOpen,
  stage,
  isMe = false,
}: {
  m: MyTeamMember
  onOpen: () => void
  stage?: StatusCount | null
  isMe?: boolean
}) {
  const lowWallet = m.state === 'active' && m.wallet_cents <= 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className="press surface-elevated flex w-full items-center gap-3 p-3 text-left md:p-4"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-foreground">{isMe ? `${m.name} (you)` : m.name}</span>
          <StateBadge state={m.state} />
          {m.pending_recharges > 0 ? (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-ink">
              Recharge pending
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[m.fbo_id, m.role === 'leader' ? 'Leader' : 'Team', !isMe && !m.is_direct && m.upline_name ? `under ${m.upline_name}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Wallet</dt>
            <dd className={cn('font-medium tabular-nums', lowWallet ? 'text-destructive' : 'text-foreground')}>
              {formatInr(m.wallet_cents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{stage ? stage.label : 'Leads now'}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {stage ? (m.status_counts[stage.status] ?? 0) : m.leads_active}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Taken today</dt>
            <dd className="font-medium tabular-nums text-foreground">{m.leads_claimed_today}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          {m.last_recharge_at && m.last_recharge_cents != null
            ? `Last recharge ${formatInr(m.last_recharge_cents)} on ${shortDate(m.last_recharge_at)} · ${formatInr(m.recharged_cents)} in all`
            : 'No recharge yet'}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-warning/15 text-warning-ink',
  approved: 'bg-success/15 text-success-ink',
  rejected: 'bg-destructive/15 text-destructive',
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_PILL[status] ?? 'bg-muted text-muted-foreground')}>
      {status}
    </span>
  )
}

function MemberDetail({ m, order }: { m: MyTeamMember; order: StatusCount[] }) {
  const q = useMyTeamMemberQuery(m.user_id)
  const [stage, setStage] = useState<string | null>(null)
  const history = useMemo(() => {
    if (!q.data) return []
    return [
      ...q.data.recharges.map((r) => ({
        key: `r${r.id}`,
        free: false,
        amount: r.amount_cents,
        status: r.status,
        when: r.created_at,
        line: r.utr_number ? `UTR ${r.utr_number}` : '',
        note: r.admin_note,
      })),
      ...q.data.free_recharges.map((r) => ({
        key: `f${r.id}`,
        free: true,
        amount: r.amount_cents,
        status: r.status,
        when: r.created_at,
        line: r.reason,
        note: r.admin_note,
      })),
    ].sort((a, b) => b.when.localeCompare(a.when))
  }, [q.data])
  const leads = (q.data?.leads ?? []).filter((l) => !stage || l.status === stage)

  return (
    <div className="space-y-4">
      <div>
        <h2 id="my-team-member-title" className="text-ds-h3 text-foreground">
          {m.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          {[m.fbo_id, m.role === 'leader' ? 'Leader' : 'Team', m.upline_name ? `under ${m.upline_name}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {m.phone ? (
          <a href={`tel:${m.phone}`} className="mt-1 inline-flex items-center gap-1 text-sm text-primary">
            <Phone className="size-3.5" aria-hidden /> {m.phone}
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Wallet now" value={formatInr(m.wallet_cents)} />
        <Stat label="Leads now" value={String(m.leads_active)} hint={`${m.leads_claimed_today} taken today`} />
        <Stat label="Recharged (paid)" value={formatInr(m.recharged_cents)} />
        <Stat label="Spent on leads" value={formatInr(m.spent_on_leads_cents)} hint={m.free_credit_cents ? `${formatInr(m.free_credit_cents)} free credit` : undefined} />
      </div>

      <Button asChild variant="secondary" size="sm" className="w-full">
        <Link to={`/dashboard/finance/recharge-request?free=1&member=${m.user_id}`}>
          <Gift className="size-4" aria-hidden /> Ask admin for a free recharge
        </Link>
      </Button>

      {q.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {q.isError ? <ErrorState title="Could not load details" message={q.error.message} onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <Tabs defaultValue="leads">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
            <TabsTrigger value="leads" className="min-h-9">Leads</TabsTrigger>
            <TabsTrigger value="recharges" className="min-h-9">Recharges</TabsTrigger>
            <TabsTrigger value="wallet" className="min-h-9">Wallet</TabsTrigger>
          </TabsList>

          <TabsContent value="leads" className="mt-3 space-y-3">
            <StageChips counts={stageRows(m.status_counts, order)} active={stage} onPick={setStage} />
            {leads.length > 0 ? (
              <ul className="space-y-2">
                {leads.map((l) => (
                  <li key={l.id} className="surface-inset flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {l.name}
                        {l.free ? <span className="ml-2 text-xs font-normal text-muted-foreground">free</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[l.city, l.call_status ? l.call_status.replace(/_/g, ' ') : null, `since ${shortDate(l.created_at)}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                      {l.status_label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>

          <TabsContent value="recharges" className="mt-3">
            {history.length === 0 ? <InlineEmpty>No recharges yet.</InlineEmpty> : null}
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.key} className="surface-inset px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium tabular-nums text-foreground">
                      {formatInr(h.amount)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{h.free ? 'Free recharge' : 'Paid recharge'}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusPill status={h.status} />
                      <span className="text-xs text-muted-foreground">{shortDate(h.when)}</span>
                    </span>
                  </div>
                  {h.line ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{h.line}</p> : null}
                  {h.note ? <p className="mt-0.5 text-xs text-muted-foreground">Admin: {h.note}</p> : null}
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="wallet" className="mt-3">
            {q.data.wallet_lines.length === 0 ? <InlineEmpty>No wallet activity yet.</InlineEmpty> : null}
            <ul className="space-y-2">
              {q.data.wallet_lines.map((w) => (
                <li key={w.id} className="surface-inset flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{w.kind_label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[shortDate(w.created_at), w.note].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className={cn('shrink-0 font-medium tabular-nums', w.amount_cents < 0 ? 'text-destructive' : 'text-success-ink')}>
                    {w.amount_cents > 0 ? '+' : '−'}
                    {formatInr(Math.abs(w.amount_cents))}
                  </span>
                </li>
              ))}
            </ul>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  )
}

/** Leader: everyone under them — wallet, recharges and leads — in plain numbers. */
export function MyTeamPage({ title }: Props) {
  const team = useMyTeamQuery()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'leads' ? 'leads' : 'team'
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [sort, setSort] = useState<SortKey>('name')
  const [stage, setStage] = useState<string | null>(null)
  // The sheet keeps showing the last person while it animates closed.
  const [open, setOpen] = useState<MyTeamMember | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const openPerson = (m: MyTeamMember) => {
    setOpen(m)
    setSheetOpen(true)
  }

  const data = team.data
  const order = data?.team_status_counts ?? []
  const stageRow = order.find((s) => s.status === stage) ?? null

  const people = useMemo(() => {
    const all = data?.members ?? []
    const found = filterCollectionByQuery(all, deferred, (m) => [m.name, m.fbo_id, m.phone, m.upline_name])
    const inStage = stage ? found.filter((m) => (m.status_counts[stage] ?? 0) > 0) : found
    const sorted = [...inStage]
    if (sort === 'wallet') sorted.sort((a, b) => a.wallet_cents - b.wallet_cents)
    if (sort === 'leads') {
      const n = (m: MyTeamMember) => (stage ? (m.status_counts[stage] ?? 0) : m.leads_active)
      sorted.sort((a, b) => n(b) - n(a))
    }
    return sorted
  }, [data, deferred, sort, stage])

  return (
    <div className="max-w-3xl space-y-5 md:space-y-6">
      <div>
        <h1 className="text-ds-h2">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Everyone under you: wallet, recharges, and the leads they took — paid and free. Tap a person to see everything.
        </p>
      </div>

      <Tabs value={view} onValueChange={(next) => setSearchParams(next === 'leads' ? { view: 'leads' } : {}, { replace: true })}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1">
          <TabsTrigger value="team" className="min-h-9">
            Team
          </TabsTrigger>
          <TabsTrigger value="leads" className="min-h-9">
            Leads report
          </TabsTrigger>
        </TabsList>
        <TabsContent value="team" className="mt-4 space-y-5 md:space-y-6">
          {team.isPending ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : null}
          {team.isError ? <ErrorState title="Could not load your team" message={team.error.message} onRetry={() => void team.refetch()} /> : null}

          {data ? (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat
                  label="People"
                  value={String(data.totals.members)}
                  hint={data.totals.active_members !== data.totals.members ? `${data.totals.active_members} active` : 'all active'}
                />
                <Stat
                  label="Team wallet"
                  value={formatInr(data.totals.wallet_cents)}
                  hint={`${formatInr(data.totals.recharged_cents)} recharged in all`}
                />
                <Stat label="Leads with team" value={String(data.totals.leads_active)} />
                <Stat label="Taken today" value={String(data.totals.leads_claimed_today)} />
              </div>

              {data.me ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-medium text-foreground">You</h2>
                  <PersonCard m={data.me} isMe onOpen={() => data.me && openPerson(data.me)} />
                </section>
              ) : null}

              <section className="space-y-2">
                <h2 className="text-sm font-medium text-foreground">Team leads by stage</h2>
                <p className="text-xs text-muted-foreground">Tap a stage to see who has leads there.</p>
                <StageChips counts={order} active={stage} onPick={setStage} />
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <ListSearchInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search name, FBO ID or phone"
                    aria-label="Search your team"
                    wrapperClassName="w-full sm:flex-1"
                  />
                  <div className="flex gap-1" role="group" aria-label="Sort">
                    {SORTS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        aria-pressed={sort === s.value}
                        onClick={() => setSort(s.value)}
                        className={cn(
                          'press rounded-full px-3 py-1.5 text-sm font-medium',
                          sort === s.value ? 'control-pill' : 'bg-muted text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {people.length === data.members.length
                    ? `${people.length} people`
                    : `${people.length} of ${data.members.length} people`}
                  {stageRow ? ` with leads in ${stageRow.label}` : ''}
                </p>
                {data.members.length === 0 ? <InlineEmpty>No one is under you yet.</InlineEmpty> : null}
                {data.members.length > 0 && people.length === 0 ? <InlineEmpty>No one matches.</InlineEmpty> : null}
                <ul className="space-y-2">
                  {people.map((m) => (
                    <li key={m.user_id}>
                      <PersonCard m={m} stage={stageRow} onOpen={() => openPerson(m)} />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </TabsContent>
        <TabsContent value="leads" className="mt-4">
          <LeadsTakenReport />
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} labelledBy="my-team-member-title" size="lg" className="p-5">
        {open ? <MemberDetail m={open} order={order} /> : null}
      </Sheet>
    </div>
  )
}
