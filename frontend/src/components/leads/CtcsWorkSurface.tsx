import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CtcsLeadCard } from '@/components/leads/CtcsLeadCard'
import { StaggerContainer } from '@/components/ui/motion'
import { CtcsOutcomeModal } from '@/components/leads/CtcsOutcomeModal'
import { LeaderReassignSheet } from '@/components/leads/LeaderReassignSheet'
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
  useLeadsQuery,
  usePatchLeadMutation,
  useReassignLeadMutation,
} from '@/hooks/use-leads-query'
import { useLeadControlRevertMutation } from '@/hooks/use-lead-control-query'
import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { apiUrl } from '@/lib/api'
import { resolveDashboardSurfaceRole } from '@/lib/dashboard-role'
import { sendEnrollmentLiveLink } from '@/lib/enrollment-send'
import { openExternalShareUrl } from '@/lib/external-share-window'
import { whatsappDigits } from '@/lib/phone-links'
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
  { id: 'pending', label: 'Pending Work' },
  { id: 'converted', label: 'Converted' },
  { id: 'reassigned', label: 'Reassigned' },
  { id: 'all', label: 'All' },
]

const TAB_STORAGE_KEY = 'ctcs-active-tab'

function initialTab(): CtcsTab {
  if (typeof sessionStorage === 'undefined') return 'all'
  const saved = sessionStorage.getItem(TAB_STORAGE_KEY) as CtcsTab | null
  return saved && TABS.some((t) => t.id === saved) ? saved : 'all'
}

type Props = {
  filters: LeadListFilters
  patchBusyLeadId: number | null
}

export function CtcsWorkSurface({ filters, patchBusyLeadId }: Props) {
  const { role, serverRole } = useDashboardShellRole()
  const surfaceRole = resolveDashboardSurfaceRole(role, serverRole)
  const { data: me } = useAuthMeQuery()
  const enrollAllowed = me?.role === 'admin' || me?.enrollment_link_access === true
  const [tab, setTab] = useState<CtcsTab>(initialTab)
  const [generated, setGenerated] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sendingLeadId, setSendingLeadId] = useState<number | null>(null)
  const [enrollBusyLeadId, setEnrollBusyLeadId] = useState<number | null>(null)
  const [enrollCopiedLeadId, setEnrollCopiedLeadId] = useState<number | null>(null)
  const [reassignTarget, setReassignTarget] = useState<{ id: number; name: string; isReassigned: boolean } | null>(null)
  const [revertNotice, setRevertNotice] = useState<string | null>(null)
  const searchMode =
    filters.q.trim().length > 0 && (surfaceRole === 'admin' || surfaceRole === 'leader')
  const ctcsOpts = useMemo(() => {
    if (searchMode) return { searchAllSections: true as const }
    if (generated) {
      return {
        generatedOnly: true as const,
        ctcsFilter: 'all' as const,
        ctcsPrioritySort: true as const,
        leaderAllScope: surfaceRole === 'leader',
      }
    }
    if (tab === 'all') {
      return {
        ctcsFilter: 'all' as const,
        ctcsPrioritySort: true as const,
        leaderAllScope: surfaceRole === 'leader',
      }
    }
    if (tab === 'reassigned') {
      return {
        ctcsFilter: 'reassigned' as const,
        ctcsPrioritySort: true as const,
      }
    }
    if (tab === 'today') {
      // Today = leads claimed today via paid recharge, shown at ANY pipeline stage.
      return { ctcsFilter: 'today' as const, ctcsPrioritySort: true as const }
    }
    if (tab === 'pending') {
      // Pending Work = zombie/untouched leads at ANY stage — no pre-enrollment limit.
      // Leaders see their whole team's pending leads; team members see their own.
      return {
        ctcsFilter: 'pending' as const,
        ctcsPrioritySort: true as const,
        leaderTeamScope: surfaceRole === 'leader',
      }
    }
    return { ctcsFilter: tab, ctcsPrioritySort: true as const, preEnrollmentOnly: true as const }
  }, [searchMode, generated, tab, surfaceRole])
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), LEAD_SLA_SMOOTH_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  // Remember the open tab so a dialer round-trip / reload reopens the same view.
  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_STORAGE_KEY, tab)
    } catch {
      /* private mode — ignore */
    }
  }, [tab])

  const leadsQ = useLeadsInfiniteQuery(true, filters, 'active', 50, ctcsOpts)
  const items = useMemo(() => leadsQ.data?.pages.flatMap((p) => p.items) ?? [], [leadsQ.data])
  const total = leadsQ.data?.pages[0]?.total ?? 0

  const reassignedCountQ = useLeadsQuery(
    tab !== 'reassigned',
    { q: '', status: '' },
    'active',
    { ctcsFilter: 'reassigned' as const, leaderAllScope: surfaceRole === 'leader' },
  )
  const reassignedCount = tab !== 'reassigned' ? (reassignedCountQ.data?.total ?? 0) : total

  const patchMut = usePatchLeadMutation()
  const reassignMut = useReassignLeadMutation()
  const revertMut = useLeadControlRevertMutation()
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

  // After a reload (dialer round-trip), scroll the restored active lead back into
  // view once it has rendered — so the user lands on the same card, not the top.
  const scrollRestoredRef = useRef(false)
  useEffect(() => {
    if (scrollRestoredRef.current) return
    if (activeLeadId == null || items.length === 0) return
    const el = document.querySelector(`[data-ctcs-lead="${activeLeadId}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center' })
      scrollRestoredRef.current = true
    }
  }, [activeLeadId, items])

  const outcomeLead = useMemo(
    () => items.find((x) => x.id === outcomeLeadId) ?? null,
    [items, outcomeLeadId],
  )

  const onSendEnrollment = useCallback(
    async (id: number, targetStatus: LeadStatus = 'video_sent') => {
      if (targetStatus === 'video_sent') {
        // Enrollment-Live: one tokenized /watch link (no time-slot picker).
        const lead = items.find((item) => item.id === id)
        if (!lead) return
        setSendingLeadId(id)
        try {
          await sendEnrollmentLiveLink(lead)
          await leadsQ.refetch()
        } catch (err) {
          window.alert('Could not send enrollment link: ' + (err instanceof Error ? err.message : 'Unknown error'))
        } finally {
          setSendingLeadId(null)
        }
        return
      }
      patchMut.mutateAsync({ id, body: { status: targetStatus } }).catch((err) => {
        window.alert('Status update failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      })
    },
    [items, leadsQ, patchMut],
  )

  const onCopyEnrollLink = useCallback(
    async (lead: LeadPublic) => {
      setEnrollBusyLeadId(lead.id)
      try {
        const res = await fetch(apiUrl('/api/v1/enroll/generate'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewer_name: lead.name ?? null, viewer_phone: lead.phone ?? null }),
        })
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { detail?: string }
          throw new Error(err.detail ?? `HTTP ${res.status}`)
        }
        const { token } = (await res.json()) as { token: string }
        const link = `${window.location.origin}/enroll/${token}`
        const digits = whatsappDigits(lead.phone ?? '')
        if (!digits) {
          throw new Error('Lead has no valid WhatsApp number.')
        }
        // Copy as backup, then open WhatsApp to the lead with the link prefilled.
        await navigator.clipboard.writeText(link).catch(() => {})
        const msg =
          `Hi ${lead.name || 'there'},\n\n` +
          `Aapki enrollment video ready hai. Ye private link sirf aapke liye hai — kholiye aur dekhiye:\n${link}`
        openExternalShareUrl(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`)
        setEnrollCopiedLeadId(lead.id)
        window.setTimeout(
          () => setEnrollCopiedLeadId((c) => (c === lead.id ? null : c)),
          2000,
        )
      } catch (err) {
        window.alert('Could not create enrollment link: ' + (err instanceof Error ? err.message : 'Unknown error'))
      } finally {
        setEnrollBusyLeadId(null)
      }
    },
    [],
  )

  const onPatchStatus = useCallback(
    (id: number, status: LeadStatus) => {
      if (status === 'video_sent' || status === 'day1') {
        onSendEnrollment(id, status)
        return
      }
      patchMut.mutateAsync({ id, body: { status } }).catch((err) => {
        window.alert('Status update failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      })
    },
    [onSendEnrollment, patchMut],
  )

  const onPatchCallStatus = useCallback(
    (id: number, call_status: string) =>
      void patchMut.mutateAsync({ id, body: { call_status } }).catch((err) => {
        window.alert('Call status update failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }),
    [patchMut],
  )

  const onCtcsAction = useCallback(
    async (id: number, action: CtcsAction, opts?: { followupAt?: string | null }) => {
      await ctcsMut.mutateAsync({
        id,
        action,
        followupAt: opts?.followupAt,
        paidStatus: 'day1',
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

  // Right-column "Call outcome" in the post-dial modal — records what happened on
  // the line (call_status). No-connect outcomes also re-arm a +2h retry so the lead
  // comes back on the board instead of going silent.
  const onCallOutcome = useCallback(
    async (id: number, slug: string) => {
      const RETRY_OUTCOMES = new Set(['no_answer', 'call_cut', 'person_block'])
      const body: { call_status: string; next_followup_at?: string } = { call_status: slug }
      if (RETRY_OUTCOMES.has(slug)) {
        body.next_followup_at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
      }
      try {
        await patchMut.mutateAsync({ id, body })
      } catch (err) {
        window.alert('Call outcome save failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
        return
      }
      const ref = await leadsQ.refetch()
      const fresh = ref.data?.pages.flatMap((p) => p.items) ?? []
      if (callMode) setActiveLeadId(nextLeadId(fresh, id))
      setOutcomeLeadId(null)
    },
    [patchMut, leadsQ, callMode, setActiveLeadId, setOutcomeLeadId],
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

  const onReassign = useCallback(
    (lead: LeadPublic) => {
      setRevertNotice(null)
      setReassignTarget({ id: lead.id, name: lead.name, isReassigned: !!lead.is_reassigned })
    },
    [],
  )

  const handleReassignConfirm = useCallback(
    async (userId: number) => {
      if (!reassignTarget) return
      await reassignMut.mutateAsync({ leadId: reassignTarget.id, userId })
      setReassignTarget(null)
    },
    [reassignMut, reassignTarget],
  )

  const handleRevert = useCallback(async () => {
    if (!reassignTarget) return
    if (!reassignTarget.isReassigned) {
      setRevertNotice('Already with original assignee — nothing to revert.')
      return
    }
    try {
      await revertMut.mutateAsync({ leadId: reassignTarget.id })
      setReassignTarget(null)
      setRevertNotice(null)
    } catch (err) {
      setRevertNotice(err instanceof Error ? err.message : 'Revert failed')
    }
  }, [reassignTarget, revertMut])

  const actionBusy = ctcsMut.isPending || callLogMut.isPending
  const sendBusyLeadId = sendingLeadId

  return (
    <div className="space-y-4">
      {searchMode ? (
        <div className="rounded border border-primary/20 bg-primary/[0.08] px-3 py-2 text-sm text-muted-foreground">
          Search is scanning all sections for this role, including workboard, retarget, and archived leads.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-1">
          {TABS.map((t) => {
            const active = tab === t.id && !generated
            const showReassignedBadge = t.id === 'reassigned' && !active && reassignedCount > 0
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setGenerated(false)
                  setTab(t.id)
                }}
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
                {showReassignedBadge ? (
                  <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-ds-caption font-semibold text-orange-500">{reassignedCount}</span>
                ) : null}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setGenerated(true)}
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              generated
                ? 'border-primary/45 bg-primary/10 text-foreground'
                : 'border-border/70 text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            <span>Generated</span>
            {generated && total > 0 ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-ds-caption text-muted-foreground">{total}</span>
            ) : null}
          </button>
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
          <Skeleton className="h-36 w-full rounded bg-muted" />
          <Skeleton className="h-36 w-full rounded bg-muted" />
        </div>
      ) : null}
      {leadsQ.isError ? (
        <p className="text-sm text-destructive">
          {leadsQ.error instanceof Error ? leadsQ.error.message : 'Failed to load'}
        </p>
      ) : null}

      <StaggerContainer className="space-y-3" staggerDelay={35}>
        {items.map((l) => (
          <div key={l.id} data-ctcs-lead={l.id}>
          <CtcsLeadCard
            lead={l}
            nowMs={nowMs}
            isActive={callMode && activeLeadId === l.id}
            patchBusy={patchBusyLeadId === l.id || sendBusyLeadId === l.id || patchMut.isPending}
            actionBusy={actionBusy}
            onPatchStatus={onPatchStatus}
            onPatchCallStatus={onPatchCallStatus}
            onCall={onCall}
            onFollowUp={onFollowUp}
            onReassign={surfaceRole === 'leader' || surfaceRole === 'admin' ? onReassign : undefined}
            showEnrollLink={tab === 'today' && enrollAllowed}
            enrollLinkBusy={enrollBusyLeadId === l.id}
            enrollLinkCopied={enrollCopiedLeadId === l.id}
            onCopyEnrollLink={onCopyEnrollLink}
          />
          </div>
        ))}
      </StaggerContainer>

      {items.length > 0 && leadsQ.hasNextPage ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={leadsQ.isFetchingNextPage}
            className="min-h-10 rounded border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
            onClick={() => void leadsQ.fetchNextPage()}
          >
            {leadsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}

      {reassignTarget ? (
        <LeaderReassignSheet
          leadName={reassignTarget.name}
          isReassigned={reassignTarget.isReassigned}
          onClose={() => { setReassignTarget(null); setRevertNotice(null) }}
          onConfirm={(userId) => { void handleReassignConfirm(userId) }}
          onRevert={() => { void handleRevert() }}
          busy={reassignMut.isPending}
          reverting={revertMut.isPending}
          revertNotice={revertNotice}
        />
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
        onCallOutcome={(slug) => {
          if (outcomeLeadId == null) return
          void onCallOutcome(outcomeLeadId, slug)
        }}
      />
    </div>
  )
}
