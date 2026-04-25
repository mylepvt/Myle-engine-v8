import { useCallback, useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/api'
import { buildCsv } from '@/lib/csv-string'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

type Props = { title: string }

type PeriodMode = 'day' | 'week' | 'month' | 'custom'

type BudgetUserFilterOption = {
  user_id: number
  label: string
  role: string
  fbo_id: string
  leader_user_id: number | null
  leader_name: string | null
}

type BudgetFilterOptions = {
  leaders: BudgetUserFilterOption[]
  members: BudgetUserFilterOption[]
}

type BudgetUserRow = {
  user_id: number
  role: string
  display_name: string
  email: string
  fbo_id: string
  phone: string | null
  leader_user_id: number | null
  leader_name: string | null
  current_balance_cents: number
  period_recharge_cents: number
  period_spend_cents: number
  period_adjustment_cents: number
  period_net_change_cents: number
  active_leads_count: number
}

type BudgetLeaderGroup = {
  leader: BudgetUserRow
  team_member_count: number
  team_balance_cents: number
  team_recharge_cents: number
  team_spend_cents: number
  team_adjustment_cents: number
  team_net_change_cents: number
  combined_balance_cents: number
  combined_period_net_change_cents: number
  members: BudgetUserRow[]
}

type BudgetGrandTotals = {
  total_visible_users: number
  total_visible_leaders: number
  total_visible_team_members: number
  current_balance_cents: number
  team_balance_cents: number
  leader_personal_balance_cents: number
  period_recharge_cents: number
  period_spend_cents: number
  period_adjustment_cents: number
  period_net_change_cents: number
}

type BudgetExportResponse = {
  items: Record<string, unknown>[]
  total: number
  note: string | null
  period: PeriodMode
  reference_date: string
  date_from: string
  date_to: string
  selected_leader_user_id: number | null
  selected_member_user_id: number | null
  filter_options: BudgetFilterOptions
  grand_totals: BudgetGrandTotals
  leaders: BudgetLeaderGroup[]
  unlinked_members: BudgetUserRow[]
}

type BudgetHistoryEntry = {
  entry_id: number
  created_at: string
  kind: 'recharge' | 'spend' | 'adjustment'
  direction: 'credit' | 'debit'
  amount_cents: number
  note: string | null
  idempotency_key: string | null
  created_by_user_id: number | null
  created_by_name: string | null
}

type BudgetHistoryResponse = {
  subject: BudgetUserRow
  period: PeriodMode
  reference_date: string
  date_from: string
  date_to: string
  total: number
  history: BudgetHistoryEntry[]
  note: string | null
}

const EMPTY_FILTER_OPTIONS: BudgetFilterOptions = { leaders: [], members: [] }

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatInr(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      messageFromApiErrorPayload(body, `HTTP ${response.status}`),
    )
  }
  return body as T
}

function buildBudgetPath(filters: {
  period: PeriodMode
  anchorDate: string
  customFrom: string
  customTo: string
  leaderUserId: string
  memberUserId: string
}): string {
  const params = new URLSearchParams()
  params.set('period', filters.period)
  if (filters.period === 'custom') {
    params.set('date_from', filters.customFrom)
    params.set('date_to', filters.customTo)
  } else {
    params.set('reference_date', filters.anchorDate)
  }
  if (filters.leaderUserId !== 'all') {
    params.set('leader_user_id', filters.leaderUserId)
  }
  if (filters.memberUserId !== 'all') {
    params.set('member_user_id', filters.memberUserId)
  }
  return `/api/v1/finance/budget-export?${params.toString()}`
}

function buildHistoryPath(
  userId: number,
  filters: {
    period: PeriodMode
    anchorDate: string
    customFrom: string
    customTo: string
  },
): string {
  const params = new URLSearchParams()
  params.set('user_id', String(userId))
  params.set('period', filters.period)
  if (filters.period === 'custom') {
    params.set('date_from', filters.customFrom)
    params.set('date_to', filters.customTo)
  } else {
    params.set('reference_date', filters.anchorDate)
  }
  return `/api/v1/finance/budget-export/history?${params.toString()}`
}

export function BudgetExportPage({ title }: Props) {
  const initialDate = todayIso()
  const [period, setPeriod] = useState<PeriodMode>('month')
  const [anchorDate, setAnchorDate] = useState(initialDate)
  const [customFrom, setCustomFrom] = useState(initialDate)
  const [customTo, setCustomTo] = useState(initialDate)
  const [leaderUserId, setLeaderUserId] = useState('all')
  const [memberUserId, setMemberUserId] = useState('all')
  const [selectedHistoryUserId, setSelectedHistoryUserId] = useState<number | null>(null)

  const filters = useMemo(
    () => ({ period, anchorDate, customFrom, customTo, leaderUserId, memberUserId }),
    [anchorDate, customFrom, customTo, leaderUserId, memberUserId, period],
  )

  const budgetQuery = useQuery({
    queryKey: ['finance', 'budget-export', filters],
    queryFn: () => fetchJson<BudgetExportResponse>(buildBudgetPath(filters)),
    staleTime: 30_000,
  })

  const filterOptions = budgetQuery.data?.filter_options ?? EMPTY_FILTER_OPTIONS
  const leaderGroups = budgetQuery.data?.leaders ?? []
  const unlinkedMembers = budgetQuery.data?.unlinked_members ?? []
  const grandTotals = budgetQuery.data?.grand_totals ?? null
  const hasHierarchyPayload = Boolean(
    budgetQuery.data &&
      budgetQuery.data.filter_options &&
      budgetQuery.data.grand_totals &&
      Array.isArray(budgetQuery.data.leaders) &&
      Array.isArray(budgetQuery.data.unlinked_members),
  )

  const memberOptions = useMemo(() => {
    const members = filterOptions.members
    if (leaderUserId === 'all') return members
    return members.filter((member) => String(member.leader_user_id) === leaderUserId)
  }, [filterOptions.members, leaderUserId])

  useEffect(() => {
    if (memberUserId === 'all') return
    if (!memberOptions.some((member) => String(member.user_id) === memberUserId)) {
      setMemberUserId('all')
    }
  }, [memberOptions, memberUserId])

  useEffect(() => {
    if (memberUserId !== 'all') {
      setSelectedHistoryUserId(Number(memberUserId))
      return
    }
    const visibleIds = new Set<number>()
    for (const group of leaderGroups) {
      visibleIds.add(group.leader.user_id)
      for (const member of group.members) visibleIds.add(member.user_id)
    }
    for (const member of unlinkedMembers) {
      visibleIds.add(member.user_id)
    }
    if (
      selectedHistoryUserId !== null &&
      visibleIds.size > 0 &&
      !visibleIds.has(selectedHistoryUserId)
    ) {
      setSelectedHistoryUserId(null)
    }
  }, [leaderGroups, memberUserId, selectedHistoryUserId, unlinkedMembers])

  const historyQuery = useQuery({
    queryKey: ['finance', 'budget-export-history', selectedHistoryUserId, filters.period, filters.anchorDate, filters.customFrom, filters.customTo],
    queryFn: () =>
      fetchJson<BudgetHistoryResponse>(
        buildHistoryPath(selectedHistoryUserId as number, {
          period: filters.period,
          anchorDate: filters.anchorDate,
          customFrom: filters.customFrom,
          customTo: filters.customTo,
        }),
      ),
    enabled: selectedHistoryUserId !== null,
    staleTime: 30_000,
  })

  const exportRows = useMemo(() => {
    const rows: string[][] = []
    for (const group of leaderGroups) {
      rows.push([
        'leader-summary',
        group.leader.display_name,
        group.leader.display_name,
        group.leader.role,
        group.leader.fbo_id,
        group.leader.phone ?? '—',
        formatInr(group.leader.current_balance_cents),
        formatInr(group.team_balance_cents),
        formatInr(group.combined_balance_cents),
        formatInr(group.leader.period_recharge_cents),
        formatInr(group.leader.period_spend_cents),
        formatInr(group.leader.period_adjustment_cents),
        formatInr(group.leader.period_net_change_cents),
        String(group.leader.active_leads_count),
        String(group.team_member_count),
      ])
      for (const member of group.members) {
        rows.push([
          'member',
          group.leader.display_name,
          member.display_name,
          member.role,
          member.fbo_id,
          member.phone ?? '—',
          formatInr(member.current_balance_cents),
          '',
          '',
          formatInr(member.period_recharge_cents),
          formatInr(member.period_spend_cents),
          formatInr(member.period_adjustment_cents),
          formatInr(member.period_net_change_cents),
          String(member.active_leads_count),
          '',
        ])
      }
    }
    for (const member of unlinkedMembers) {
      rows.push([
        'unlinked-member',
        'Unlinked',
        member.display_name,
        member.role,
        member.fbo_id,
        member.phone ?? '—',
        formatInr(member.current_balance_cents),
        '',
        '',
        formatInr(member.period_recharge_cents),
        formatInr(member.period_spend_cents),
        formatInr(member.period_adjustment_cents),
        formatInr(member.period_net_change_cents),
        String(member.active_leads_count),
        '',
      ])
    }
    return rows
  }, [leaderGroups, unlinkedMembers])

  const downloadCsv = useCallback(() => {
    const headers = [
      'Row Type',
      'Leader',
      'Person',
      'Role',
      'FBO ID',
      'Phone',
      'Current Budget',
      'Team Budget',
      'Combined Budget',
      'Period Recharge',
      'Period Spend',
      'Period Adjustment',
      'Period Net',
      'Active Leads',
      'Team Members',
    ]
    const csv = buildCsv(headers, exportRows)
    let url: string | undefined
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `budget-hierarchy-${budgetQuery.data?.date_from ?? initialDate}-to-${budgetQuery.data?.date_to ?? initialDate}.csv`
      link.rel = 'noopener'
      link.click()
    } finally {
      if (url) URL.revokeObjectURL(url)
    }
  }, [budgetQuery.data?.date_from, budgetQuery.data?.date_to, exportRows, initialDate])

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Leader-wise wallet hierarchy with personal budget, team totals, filters, and per-person history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={exportRows.length === 0}
            onClick={downloadCsv}
          >
            Download CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void budgetQuery.refetch()}
            disabled={budgetQuery.isPending}
          >
            {budgetQuery.isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export Filters</CardTitle>
          <CardDescription>
            Choose day, week, month, or a custom range, then narrow the report to one leader or one team member.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Window</span>
            <select
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodMode)}
              className="field-input"
            >
              <option value="day">Single day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="custom">Custom range</option>
            </select>
          </label>

          {period === 'custom' ? (
            <>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">From</span>
                <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">To</span>
                <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
              </label>
            </>
          ) : (
            <label className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                {period === 'day' ? 'Date' : period === 'week' ? 'Any day in week' : 'Any day in month'}
              </span>
              <Input type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
            </label>
          )}

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Leader</span>
            <select
              value={leaderUserId}
              onChange={(event) => setLeaderUserId(event.target.value)}
              className="field-input"
            >
              <option value="all">All leaders</option>
              {filterOptions.leaders.map((leader) => (
                <option key={leader.user_id} value={String(leader.user_id)}>
                  {leader.label} · {leader.fbo_id}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Team member</span>
            <select
              value={memberUserId}
              onChange={(event) => setMemberUserId(event.target.value)}
              className="field-input"
            >
              <option value="all">All members</option>
              {memberOptions.map((member) => (
                <option key={member.user_id} value={String(member.user_id)}>
                  {member.label} · {member.fbo_id}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      {budgetQuery.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}

      {budgetQuery.isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{budgetQuery.error instanceof Error ? budgetQuery.error.message : 'Could not load budget export.'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void budgetQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : null}

      {budgetQuery.data && !hasHierarchyPayload ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Budget export is waiting for the latest hierarchy API payload. Refresh after the backend deploy finishes.
          </CardContent>
        </Card>
      ) : null}

      {budgetQuery.data && grandTotals && hasHierarchyPayload ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader>
                <CardDescription>Visible budget</CardDescription>
                <CardTitle>{formatInr(grandTotals.current_balance_cents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {grandTotals.total_visible_users} visible people in this export window
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Leader personal total</CardDescription>
                <CardTitle>{formatInr(grandTotals.leader_personal_balance_cents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {grandTotals.total_visible_leaders} leader{grandTotals.total_visible_leaders !== 1 ? 's' : ''}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Team total</CardDescription>
                <CardTitle>{formatInr(grandTotals.team_balance_cents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {grandTotals.total_visible_team_members} team member{grandTotals.total_visible_team_members !== 1 ? 's' : ''}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Period spend</CardDescription>
                <CardTitle>{formatInr(grandTotals.period_spend_cents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Recharge {formatInr(grandTotals.period_recharge_cents)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Period net change</CardDescription>
                <CardTitle>{formatInr(grandTotals.period_net_change_cents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Adjustments {formatInr(grandTotals.period_adjustment_cents)}
              </CardContent>
            </Card>
          </div>

          {budgetQuery.data.note ? (
            <p className="text-xs text-muted-foreground">{budgetQuery.data.note}</p>
          ) : null}

          <div className="space-y-4">
            {leaderGroups.map((group) => (
              <Card key={group.leader.user_id}>
                <CardHeader className="gap-3 border-b border-border/70 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <button
                        type="button"
                        className="text-left text-lg font-semibold text-foreground underline-offset-4 hover:underline"
                        onClick={() => setSelectedHistoryUserId(group.leader.user_id)}
                      >
                        {group.leader.display_name}
                      </button>
                      <p className="text-sm text-muted-foreground">
                        {group.leader.email} · {group.leader.fbo_id}
                        {group.leader.phone ? ` · ${group.leader.phone}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Personal budget {formatInr(group.leader.current_balance_cents)} · Team budget {formatInr(group.team_balance_cents)} · Combined {formatInr(group.combined_balance_cents)}
                      </p>
                    </div>
                    <div className="grid min-w-[16rem] gap-1 text-right text-sm">
                      <span className="text-muted-foreground">Team members: {group.team_member_count}</span>
                      <span className="text-muted-foreground">Period recharge: {formatInr(group.team_recharge_cents)}</span>
                      <span className="text-muted-foreground">Period spend: {formatInr(group.team_spend_cents)}</span>
                      <span className="text-foreground">Period net: {formatInr(group.combined_period_net_change_cents)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {group.members.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-border/70 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            <th className="py-2 pr-4 font-medium">Person</th>
                            <th className="py-2 pr-4 font-medium">Role</th>
                            <th className="py-2 pr-4 font-medium text-right">Current budget</th>
                            <th className="py-2 pr-4 font-medium text-right">Recharge</th>
                            <th className="py-2 pr-4 font-medium text-right">Spend</th>
                            <th className="py-2 pr-4 font-medium text-right">Adj</th>
                            <th className="py-2 pr-4 font-medium text-right">Net</th>
                            <th className="py-2 font-medium text-right">Active leads</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.members.map((member) => (
                            <tr key={member.user_id} className="border-b border-border/50">
                              <td className="py-3 pr-4">
                                <button
                                  type="button"
                                  className="text-left font-medium text-foreground underline-offset-4 hover:underline"
                                  onClick={() => setSelectedHistoryUserId(member.user_id)}
                                >
                                  {member.display_name}
                                </button>
                                <p className="text-xs text-muted-foreground">
                                  {member.email} · {member.fbo_id}
                                  {member.phone ? ` · ${member.phone}` : ''}
                                </p>
                              </td>
                              <td className="py-3 pr-4 text-muted-foreground">{member.role}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-foreground">{formatInr(member.current_balance_cents)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatInr(member.period_recharge_cents)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatInr(member.period_spend_cents)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatInr(member.period_adjustment_cents)}</td>
                              <td className="py-3 pr-4 text-right tabular-nums text-foreground">{formatInr(member.period_net_change_cents)}</td>
                              <td className="py-3 text-right tabular-nums text-muted-foreground">{member.active_leads_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No visible team members under this leader for the selected filters.</p>
                  )}
                </CardContent>
              </Card>
            ))}

            {unlinkedMembers.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Unlinked Members</CardTitle>
                  <CardDescription>
                    Approved members without a leader link in the current org tree.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border/70 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Person</th>
                        <th className="py-2 pr-4 font-medium">Role</th>
                        <th className="py-2 pr-4 font-medium text-right">Budget</th>
                        <th className="py-2 pr-4 font-medium text-right">Recharge</th>
                        <th className="py-2 pr-4 font-medium text-right">Spend</th>
                        <th className="py-2 pr-4 font-medium text-right">Net</th>
                        <th className="py-2 font-medium text-right">Active leads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unlinkedMembers.map((member) => (
                        <tr key={member.user_id} className="border-b border-border/50">
                          <td className="py-3 pr-4">
                            <button
                              type="button"
                              className="text-left font-medium text-foreground underline-offset-4 hover:underline"
                              onClick={() => setSelectedHistoryUserId(member.user_id)}
                            >
                              {member.display_name}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {member.email} · {member.fbo_id}
                            </p>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{member.role}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-foreground">{formatInr(member.current_balance_cents)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatInr(member.period_recharge_cents)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">{formatInr(member.period_spend_cents)}</td>
                          <td className="py-3 pr-4 text-right tabular-nums text-foreground">{formatInr(member.period_net_change_cents)}</td>
                          <td className="py-3 text-right tabular-nums text-muted-foreground">{member.active_leads_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ) : null}

            {leaderGroups.length === 0 && unlinkedMembers.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  No budget rows matched the current filters.
                </CardContent>
              </Card>
            ) : null}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Budget History</CardTitle>
                <CardDescription>
                  Click any leader or member name to inspect wallet movement history for the selected window.
                </CardDescription>
              </div>
              {selectedHistoryUserId !== null ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedHistoryUserId(null)}>
                  Clear
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedHistoryUserId === null ? (
                <p className="text-sm text-muted-foreground">No person selected yet.</p>
              ) : null}

              {historyQuery.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : null}

              {historyQuery.isError ? (
                <div className="text-sm text-destructive" role="alert">
                  <span>{historyQuery.error instanceof Error ? historyQuery.error.message : 'Could not load history.'} </span>
                  <button type="button" className="underline underline-offset-2" onClick={() => void historyQuery.refetch()}>
                    Retry
                  </button>
                </div>
              ) : null}

              {historyQuery.data ? (
                <>
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <p className="text-lg font-semibold text-foreground">{historyQuery.data.subject.display_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {historyQuery.data.subject.email} · {historyQuery.data.subject.fbo_id}
                      {historyQuery.data.subject.leader_name ? ` · leader ${historyQuery.data.subject.leader_name}` : ''}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Current budget {formatInr(historyQuery.data.subject.current_balance_cents)} · Period net {formatInr(historyQuery.data.subject.period_net_change_cents)}
                    </p>
                    {historyQuery.data.note ? (
                      <p className="mt-2 text-xs text-muted-foreground">{historyQuery.data.note}</p>
                    ) : null}
                  </div>

                  {historyQuery.data.history.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[54rem] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-border/70 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            <th className="py-2 pr-4 font-medium">Date</th>
                            <th className="py-2 pr-4 font-medium">Type</th>
                            <th className="py-2 pr-4 font-medium">Direction</th>
                            <th className="py-2 pr-4 font-medium text-right">Amount</th>
                            <th className="py-2 pr-4 font-medium">Note</th>
                            <th className="py-2 font-medium">By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyQuery.data.history.map((entry) => (
                            <tr key={entry.entry_id} className="border-b border-border/50">
                              <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(entry.created_at)}</td>
                              <td className="py-3 pr-4 capitalize text-foreground">{entry.kind}</td>
                              <td className="py-3 pr-4 capitalize text-muted-foreground">{entry.direction}</td>
                              <td className={`py-3 pr-4 text-right tabular-nums ${entry.amount_cents >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                                {formatInr(entry.amount_cents)}
                              </td>
                              <td className="py-3 pr-4 text-muted-foreground">
                                {entry.note ?? entry.idempotency_key ?? '—'}
                              </td>
                              <td className="py-3 text-muted-foreground">{entry.created_by_name ?? 'System'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No wallet movement in the selected window.</p>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
