import { useCallback, useEffect, useMemo, useState } from 'react'

import { CtcsLeadCard } from '@/components/leads/CtcsLeadCard'
import { CtcsOutcomeModal } from '@/components/leads/CtcsOutcomeModal'
import { LEAD_SLA_SMOOTH_REFRESH_MS } from '@/lib/lead-sla'
import { cn } from '@/lib/utils'
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
import { useSendEnrollmentVideoMutation } from '@/hooks/use-enroll-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'
import {
  openExternalShareUrl,
} from '@/lib/external-share-window'
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
  { id: 'today', label: 'Today' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'hot', label: 'Hot' },
  { id: 'converted', label: 'Converted' },
  { id: 'all', label: 'All' },
]

type Props = {
  filters: LeadListFilters
  patchBusyLeadId: number | null
}

export function CtcsWorkSurface({ filters, patchBusyLeadId }: Props) {
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)
  const [tab, setTab] = useState<CtcsTab>('all')
  const [nowMs, setNowMs] = useState(() => Date.now())
  const searchMode =
    filters.q.trim().length > 0 && (surfaceRole === 'admin' || surfaceRole === 'leader')
  const ctcsOpts = useMemo(
    () =>
      searchMode
        ? ({ searchAllSections: true as const })
        : ({ ctcsFilter: tab, ctcsPrioritySort: true as const, preEnrollmentOnly: true as const }),
    [searchMode, tab],
  )
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), LEAD_SLA_SMOOTH_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  const leadsQ = useLeadsInfiniteQuery(true, filters, 'active', 50, ctcsOpts)
  const items = useMemo(() => leadsQ.data?.pages.flatMap((p) => p.items) ?? [], [leadsQ.data])
  const total = leadsQ.data?.pages[0]?.total ?? 0

  const patchMut = usePatchLeadMutation()
  const sendEnrollmentMut = useSendEnrollmentVideoMutation()
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

  const onSendEnrollment = useCallback(
    (id: number) => {
      void sendEnrollmentMut
        .mutateAsync(id)
        .then((result) => {
          const manualUrl = result.delivery.manual_share_url?.trim()
          openExternalShareUrl(manualUrl)
        })
        .catch(() => {})
    },
    [sendEnrollmentMut],
  )

  const onPatchStatus = useCallback(
    (id: number, status: LeadStatus) => {
      if (status === 'video_sent') {
        onSendEnrollment(id)
        return
      }
      void patchMut.mutateAsync({ id, body: { status } })
    },
    [onSendEnrollment, patchMut],
  )

  const onPatchCallStatus = useCallback(
    (id: number, call_status: string) => void patchMut.mutateAsync({ id, body: { call_status } }),
    [patchMut],
  )

  const onCtcsAction = useCallback(
    async (id: number, action: CtcsAction, opts?: { followupAt?: string | null }) => {
      await ctcsMut.mutateAsync({
        id,
        action,
        followupAt: opts?.followupAt,
        paidStatus: 'paid',
      })
      const ref = await leadsQ.refetch()
      const fresh = ref.data?.pages.flatMap((p) => p.items) ?? []
      if (callMode) {
        setActiveLeadId(nextLeadId(fresh, id))
      }
      setOutcomeLeadId(null)
    },
    [ctcsMut, callMode, setActiveLeadId, setOutcomeLeadId, leadsQ],
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
  const sendBusyLeadId =
    sendEnrollmentMut.isPending && typeof sendEnrollmentMut.variables === 'number'
      ? sendEnrollmentMut.variables
      : null

  return (
    <div className="space-y-4">
      {searchMode ? (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.08] px-3 py-2 text-sm text-muted-foreground">
          Search is scanning all sections for this role, including workboard, retarget, and archived leads.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-1">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'border-primary/45 bg-primary/10 text-foreground'
                    : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                <span>{t.label}</span>
                {active && total > 0 ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-ds-caption text-muted-foreground">{total}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => toggleCallMode()}
          className={cn(
            'text-ds-caption font-semibold transition active:opacity-80',
            callMode ? 'text-[var(--palette-cyan-dull)]' : 'text-primary',
          )}
        >
          {callMode ? 'Calling mode ON' : 'Start calling mode'}
        </button>
        <p className="text-ds-caption text-muted-foreground">
          {items.length < total ? `Loaded ${items.length} · ` : null}
          {searchMode ? `search results ${total}` : `tab total ${total}`}
        </p>
      </div>

      {leadsQ.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-36 w-full rounded-xl bg-muted" />
          <Skeleton className="h-36 w-full rounded-xl bg-muted" />
        </div>
      ) : null}
      {leadsQ.isError ? (
        <p className="text-sm text-destructive">
          {leadsQ.error instanceof Error ? leadsQ.error.message : 'Failed to load'}
        </p>
      ) : null}

      <div className="space-y-3">
        {items.map((l) => (
          <CtcsLeadCard
            key={l.id}
            lead={l}
            nowMs={nowMs}
            isActive={callMode && activeLeadId === l.id}
            patchBusy={patchBusyLeadId === l.id || sendBusyLeadId === l.id || patchMut.isPending}
            actionBusy={actionBusy}
            onPatchStatus={onPatchStatus}
            onPatchCallStatus={onPatchCallStatus}
            onSendEnrollment={onSendEnrollment}
            onCall={onCall}
            onFollowUp={onFollowUp}
          />
        ))}
      </div>

      {items.length > 0 && leadsQ.hasNextPage ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={leadsQ.isFetchingNextPage}
            className="min-h-10 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            onClick={() => void leadsQ.fetchNextPage()}
          >
            {leadsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}

      <CtcsOutcomeModal
        key={outcomeLeadId ?? 'closed'}
        open={outcomeLeadId != null}
        leadName={outcomeLead?.name ?? ''}
        phone={outcomeLead?.phone}
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
