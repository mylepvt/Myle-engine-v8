import { useCallback, useEffect, useMemo, useState } from 'react'

import { CtcsLeadCard } from '@/components/leads/CtcsLeadCard'
import { CtcsOutcomeModal } from '@/components/leads/CtcsOutcomeModal'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type CtcsAction,
  type CtcsTab,
  type LeadListFilters,
  type LeadPublic,
  type LeadStatus,
  useLeadCallLogMutation,
  useLeadCtcsActionMutation,
  useLeadsInfiniteQuery,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useCallToCloseStore } from '@/stores/call-to-close-store'

function nextLeadId(items: LeadPublic[], current: number | null): number | null {
  if (!items.length) return null
  if (current == null) return items[0]?.id ?? null
  const i = items.findIndex((x) => x.id === current)
  if (i < 0) return items[0]?.id ?? null
  const n = items[i + 1]
  return n ? n.id : items[0]?.id ?? null
}

const TABS: { id: CtcsTab; label: string }[] = [
  { id: 'today', label: '⚡ Today' },
  { id: 'followups', label: '📞 Follow-ups' },
  { id: 'hot', label: '🔥 Hot' },
  { id: 'converted', label: '💰 Converted' },
  { id: 'all', label: 'All' },
]

type Props = {
  filters: LeadListFilters
  patchBusyLeadId: number | null
}

export function CtcsWorkSurface({ filters, patchBusyLeadId }: Props) {
  const { role } = useDashboardShellRole()
  const [tab, setTab] = useState<CtcsTab>('today')
  const ctcsOpts = useMemo(
    () => ({ ctcsFilter: tab, ctcsPrioritySort: true as const }),
    [tab],
  )

  const leadsQ = useLeadsInfiniteQuery(true, filters, 'active', 50, ctcsOpts)
  const items = useMemo(() => leadsQ.data?.pages.flatMap((p) => p.items) ?? [], [leadsQ.data])
  const total = leadsQ.data?.pages[0]?.total ?? 0

  const patchMut = usePatchLeadMutation()
  const ctcsMut = useLeadCtcsActionMutation()
  const callLogMut = useLeadCallLogMutation()

  const activeLeadId = useCallToCloseStore((s) => s.activeLeadId)
  const callMode = useCallToCloseStore((s) => s.callMode)
  const outcomeLeadId = useCallToCloseStore((s) => s.outcomeLeadId)
  const setActiveLeadId = useCallToCloseStore((s) => s.setActiveLeadId)
  const toggleCallMode = useCallToCloseStore((s) => s.toggleCallMode)
  const setOutcomeLeadId = useCallToCloseStore((s) => s.setOutcomeLeadId)

  useEffect(() => {
    if (!callMode || !items.length) return
    if (activeLeadId != null && items.some((x) => x.id === activeLeadId)) return
    setActiveLeadId(items[0]?.id ?? null)
  }, [callMode, items, activeLeadId, setActiveLeadId])

  const outcomeLead = useMemo(
    () => items.find((x) => x.id === outcomeLeadId) ?? null,
    [items, outcomeLeadId],
  )

  const onPatchStatus = useCallback(
    (id: number, status: LeadStatus) => void patchMut.mutateAsync({ id, body: { status } }),
    [patchMut],
  )

  const onCtcsAction = useCallback(
    async (id: number, action: CtcsAction, opts?: { followupAt?: string | null }) => {
      const paidStatus = role === 'team' ? ('paid' as const) : ('day1' as const)
      await ctcsMut.mutateAsync({
        id,
        action,
        followupAt: opts?.followupAt,
        paidStatus,
      })
      const ref = await leadsQ.refetch()
      const fresh = ref.data?.pages.flatMap((p) => p.items) ?? []
      if (callMode) {
        setActiveLeadId(nextLeadId(fresh, id))
      }
      setOutcomeLeadId(null)
    },
    [ctcsMut, callMode, setActiveLeadId, setOutcomeLeadId, leadsQ, role],
  )

  const onCall = useCallback(
    async (lead: LeadPublic) => {
      try {
        await callLogMut.mutateAsync(lead.id)
      } catch {
        /* still show modal */
      }
      setOutcomeLeadId(lead.id)
      if (callMode) setActiveLeadId(lead.id)
    },
    [callLogMut, setOutcomeLeadId, callMode, setActiveLeadId],
  )

  const onFollowUp = useCallback(
    async (id: number) => {
      const at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await patchMut.mutateAsync({ id, body: { next_followup_at: at } })
    },
    [patchMut],
  )

  const actionBusy = ctcsMut.isPending || callLogMut.isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
              tab === t.id
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-white/12 bg-white/[0.05] text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={callMode ? 'default' : 'secondary'}
          className="min-h-12 px-5 text-base"
          onClick={() => toggleCallMode()}
        >
          {callMode ? 'Calling mode ON' : 'Start Calling Mode'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Total in tab: {total}
          {items.length < total ? ` · loaded ${items.length}` : null}
        </p>
      </div>

      {leadsQ.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : null}
      {leadsQ.isError ? (
        <p className="text-sm text-destructive">
          {leadsQ.error instanceof Error ? leadsQ.error.message : 'Failed to load'}
        </p>
      ) : null}

      <div className="grid gap-3">
        {items.map((l) => (
          <CtcsLeadCard
            key={l.id}
            lead={l}
            isActive={callMode && activeLeadId === l.id}
            patchBusy={patchBusyLeadId === l.id || patchMut.isPending}
            actionBusy={actionBusy}
            onPatchStatus={onPatchStatus}
            onCtcsAction={onCtcsAction}
            onCall={onCall}
            onFollowUp={onFollowUp}
          />
        ))}
      </div>

      {items.length > 0 && leadsQ.hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="secondary" disabled={leadsQ.isFetchingNextPage} onClick={() => void leadsQ.fetchNextPage()}>
            {leadsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}

      <CtcsOutcomeModal
        key={outcomeLeadId ?? 'closed'}
        open={outcomeLeadId != null}
        leadName={outcomeLead?.name ?? ''}
        busy={ctcsMut.isPending}
        onClose={() => setOutcomeLeadId(null)}
        onPick={(action, followupAt) => {
          if (outcomeLeadId == null) return
          void onCtcsAction(outcomeLeadId, action, { followupAt })
        }}
      />
    </div>
  )
}
