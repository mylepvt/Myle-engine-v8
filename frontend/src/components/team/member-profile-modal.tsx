import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { InvoiceDownloadLink } from '@/components/wallet/InvoiceDownloadLink'
import {
  useTeamMembersQuery,
  useUpdateMemberComplianceMutation,
  useUpdateMemberRoleMutation,
  useUpdateMemberUplineMutation,
  useDeleteMemberMutation,
  useMemberLeadsQuery,
  useToggleTrainingLockMutation,
  useToggleEnrollmentAccessMutation,
  type TeamMemberPublic,
} from '@/hooks/use-team-query'
import { useInvoicesQuery } from '@/hooks/use-invoices-query'
import { ROLES, roleShortLabel, type Role } from '@/types/role'
import {
  complianceBadgeVariant,
  complianceTone,
  formatMemberDate,
  formatMemberTimestamp,
} from '@/components/team/member-utils'

export function MemberProfileModal({
  member,
  onClose,
}: {
  member: TeamMemberPublic
  onClose: () => void
}) {
  const [currentMember, setCurrentMember] = useState(member)
  const { data, isPending } = useMemberLeadsQuery(currentMember.id)
  const invQuery = useInvoicesQuery({ user_id: currentMember.id, limit: 50, offset: 0 })
  const updateRoleMut = useUpdateMemberRoleMutation()
  const updateUplineMut = useUpdateMemberUplineMutation()
  const updateComplianceMut = useUpdateMemberComplianceMutation()
  const deleteMut = useDeleteMemberMutation()
  const trainingToggle = useToggleTrainingLockMutation()
  const enrollAccessToggle = useToggleEnrollmentAccessMutation()
  const { data: allMembers } = useTeamMembersQuery()
  const [selectedRole, setSelectedRole] = useState<Role>(member.role as Role)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [selectedUpline, setSelectedUpline] = useState<string>('')
  const [uplineError, setUplineError] = useState<string | null>(null)
  const [complianceError, setComplianceError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [danger, setDanger] = useState<null | 'delete' | 'remove_now'>(null)
  const [trainingError, setTrainingError] = useState<string | null>(null)
  const [trainingRequired, setTrainingRequired] = useState<boolean>(member.training_required ?? false)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [enrollAccess, setEnrollAccess] = useState<boolean>(member.enrollment_link_access ?? false)
  const [graceEndDate, setGraceEndDate] = useState(
    member.grace_request_end_date?.slice(0, 10) ?? member.grace_end_date?.slice(0, 10) ?? '',
  )
  const [graceReason, setGraceReason] = useState(
    member.grace_request_reason ?? member.grace_reason ?? '',
  )

  useEffect(() => {
    setCurrentMember(member)
    setSelectedRole(member.role as Role)
    setSelectedUpline(member.upline_user_id != null ? String(member.upline_user_id) : '')
    setTrainingRequired(member.training_required ?? false)
    setEnrollAccess(member.enrollment_link_access ?? false)
    setGraceEndDate(member.grace_request_end_date?.slice(0, 10) ?? member.grace_end_date?.slice(0, 10) ?? '')
    setGraceReason(member.grace_request_reason ?? member.grace_reason ?? '')
  }, [member])

  function handleRoleChange() {
    setRoleError(null)
    updateRoleMut.mutate(
      { userId: currentMember.id, role: selectedRole },
      {
        onError: (e: Error) => setRoleError(e.message),
        onSuccess: (updated) => {
          setCurrentMember(updated)
          setSelectedRole(updated.role as Role)
        },
      },
    )
  }

  function handleUplineChange() {
    setUplineError(null)
    const uplineUserId = Number(selectedUpline)
    if (!Number.isFinite(uplineUserId) || uplineUserId <= 0) {
      setUplineError('Pick a leader.')
      return
    }
    updateUplineMut.mutate(
      { userId: currentMember.id, uplineUserId },
      {
        onError: (e: Error) => setUplineError(e.message),
        onSuccess: (updated) => {
          setCurrentMember(updated)
          setSelectedUpline(updated.upline_user_id != null ? String(updated.upline_user_id) : '')
        },
      },
    )
  }

  function handleComplianceAction(
    action:
      | 'grant_grace'
      | 'clear_grace'
      | 'approve_grace_request'
      | 'reject_grace_request'
      | 'restore_access'
      | 'remove_now',
  ) {
    if (action === 'grant_grace' && !graceEndDate.trim()) {
      setComplianceError('Grace till date required.')
      return
    }
    setComplianceError(null)
    updateComplianceMut.mutate(
      {
        userId: currentMember.id,
        action,
        graceEndDate: action === 'grant_grace' ? graceEndDate : null,
        reason: graceReason.trim() || null,
      },
      {
        onError: (e: Error) => setComplianceError(e.message),
        onSuccess: (updated) => {
          setCurrentMember(updated)
          setGraceEndDate(updated.grace_request_end_date?.slice(0, 10) ?? updated.grace_end_date?.slice(0, 10) ?? '')
          setGraceReason(updated.grace_request_reason ?? updated.grace_reason ?? '')
        },
      },
    )
  }

  function handleDelete() {
    setDeleteError(null)
    deleteMut.mutate(currentMember.id, {
      onError: (e: Error) => setDeleteError(e.message),
      onSuccess: onClose,
    })
  }

  return (
    <>
    <div
      className="keyboard-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="keyboard-safe-sheet surface-elevated max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 rounded-t-xl border-b border-border bg-card p-4 md:p-6">
          <div className="min-w-0 flex-1">
            <h2 className="break-all text-base font-semibold text-foreground">{currentMember.fbo_id}</h2>
            {currentMember.username ? (
              <p className="break-words text-ds-caption text-muted-foreground">({currentMember.username})</p>
            ) : null}
            <p className="mt-0.5 break-all text-ds-caption text-muted-foreground">{currentMember.email}</p>
            <p className="mt-0.5 text-ds-caption text-muted-foreground">
              Joined {formatMemberTimestamp(currentMember.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-4 pb-4 pt-4 md:px-6 md:pb-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="role">Role</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="access">Access</TabsTrigger>
              <TabsTrigger value="danger">Danger</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
          <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-ds-label uppercase text-muted-foreground">Compliance Control</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentMember.compliance_title ? (
                      <Badge variant={complianceBadgeVariant(currentMember.compliance_level)}>
                        {currentMember.compliance_title}
                      </Badge>
                    ) : null}
                    {currentMember.grace_end_date ? (
                      <Badge variant="outline">Grace till {formatMemberDate(currentMember.grace_end_date)}</Badge>
                    ) : null}
                    {currentMember.grace_request_end_date ? (
                      <Badge variant="primary">
                        Request till {formatMemberDate(currentMember.grace_request_end_date)}
                      </Badge>
                    ) : null}
                    {currentMember.access_blocked ? (
                      <Badge variant="danger">Access blocked</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="text-right text-[0.7rem] text-muted-foreground">
                  <p>Calls streak: {currentMember.calls_short_streak ?? 0}d</p>
                  <p>Report streak: {currentMember.missing_report_streak ?? 0}d</p>
                </div>
              </div>
              <p className={`text-xs ${complianceTone(currentMember.compliance_level)}`}>
                {currentMember.compliance_summary ?? 'No active discipline note.'}
              </p>
              {currentMember.grace_request_end_date ? (
                <p className="text-[0.72rem] text-primary">
                  Pending grace request till {formatMemberDate(currentMember.grace_request_end_date)}
                  {currentMember.grace_request_reason ? ` · ${currentMember.grace_request_reason}` : ''}
                </p>
              ) : null}

              {currentMember.role === 'admin' ? (
                <p className="text-[0.72rem] text-muted-foreground">
                  Admin accounts are excluded from call/report discipline rules.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="block">
                      <span className="mb-1 block text-ds-caption text-muted-foreground">Grace till</span>
                      <input
                        type="date"
                        value={graceEndDate}
                        onChange={(e) => setGraceEndDate(e.target.value)}
                        disabled={updateComplianceMut.isPending}
                        className="field-input"
                      />
                    </label>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="sm"
                        disabled={updateComplianceMut.isPending || !graceEndDate.trim()}
                        onClick={() => handleComplianceAction('grant_grace')}
                        className="w-full md:w-auto"
                      >
                        {updateComplianceMut.isPending ? '…' : 'Grant Grace'}
                      </Button>
                    </div>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-ds-caption text-muted-foreground">Reason / note</span>
                    <textarea
                      value={graceReason}
                      onChange={(e) => setGraceReason(e.target.value)}
                      disabled={updateComplianceMut.isPending}
                      rows={3}
                      className="field-input min-h-[5.5rem] resize-y"
                      placeholder="Optional reason for grace or removal note"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {currentMember.grace_request_end_date ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          disabled={updateComplianceMut.isPending}
                          onClick={() => handleComplianceAction('approve_grace_request')}
                        >
                          Approve Request
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={updateComplianceMut.isPending}
                          onClick={() => handleComplianceAction('reject_grace_request')}
                        >
                          Reject Request
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={updateComplianceMut.isPending || !currentMember.grace_end_date}
                      onClick={() => handleComplianceAction('clear_grace')}
                    >
                      Clear Grace
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={updateComplianceMut.isPending}
                      onClick={() => handleComplianceAction('restore_access')}
                    >
                      Restore & Reset
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={updateComplianceMut.isPending}
                      onClick={() => setDanger('remove_now')}
                      className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    >
                      Remove Now
                    </Button>
                  </div>
                </>
              )}

              {complianceError ? (
                <p className="text-ds-caption text-destructive" role="alert">{complianceError}</p>
              ) : null}
            </div>
          </div>
            </TabsContent>

            <TabsContent value="role">
          {/* Role change */}
          <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Change Role</p>
            <div className="flex items-center gap-2">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as Role)}
                disabled={updateRoleMut.isPending}
                className="field-input flex-1"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{roleShortLabel(r)}</option>
                ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={updateRoleMut.isPending || selectedRole === currentMember.role}
                onClick={handleRoleChange}
              >
                {updateRoleMut.isPending ? '…' : 'Save'}
              </Button>
            </div>
            {roleError ? (
              <p className="mt-1 text-ds-caption text-destructive" role="alert">{roleError}</p>
            ) : null}
          </div>

          {/* Upline (leader) */}
          <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Upline Leader</p>
            <p className="mb-2 text-ds-caption text-muted-foreground">
              Handoffs go to this member's nearest upline leader. Move them under the right leader here.
            </p>
            <div className="flex items-center gap-2">
              <select
                value={selectedUpline}
                onChange={(e) => setSelectedUpline(e.target.value)}
                disabled={updateUplineMut.isPending}
                className="field-input flex-1"
              >
                <option value="">Select a leader…</option>
                {(allMembers?.items ?? [])
                  .filter((m) => (m.role === 'leader' || m.role === 'admin') && m.id !== currentMember.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {(m.username ?? m.email)} · {roleShortLabel(m.role as Role)}
                    </option>
                  ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={
                  updateUplineMut.isPending ||
                  !selectedUpline ||
                  Number(selectedUpline) === currentMember.upline_user_id
                }
                onClick={handleUplineChange}
              >
                {updateUplineMut.isPending ? '…' : 'Save'}
              </Button>
            </div>
            {uplineError ? (
              <p className="mt-1 text-ds-caption text-destructive" role="alert">{uplineError}</p>
            ) : null}
          </div>
            </TabsContent>

            <TabsContent value="activity">
          {/* Leads */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Leads {data ? `(${data.total})` : ''}
            </p>
            {isPending ? (
              <div className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : !data?.items.length ? (
              <p className="text-ds-caption text-muted-foreground">No leads yet.</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {data.items.map((lead) => (
                  <li
                    key={lead.id}
                    className="surface-inset flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="block truncate font-medium capitalize text-foreground">
                        {lead.name.toLowerCase()}
                      </span>
                      {lead.phone ? (
                        <span className="text-ds-caption text-muted-foreground">{lead.phone}</span>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {lead.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Invoices */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Invoices</p>
            {invQuery.isPending ? (
              <div className="space-y-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : !invQuery.data?.items.length ? (
              <p className="text-ds-caption text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-ds-caption">
                {invQuery.data.items.map((inv) => (
                  <li
                    key={inv.invoice_number}
                    className="surface-inset flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-foreground">{inv.invoice_number}</span>
                      <span className="ml-2 text-muted-foreground">
                        {inv.doc_type === 'tax_invoice' ? 'Tax Invoice' : 'Receipt'}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {new Date(inv.issued_at).toLocaleDateString()} · ₹
                        {(inv.total_cents / 100).toFixed(2)}
                      </span>
                    </div>
                    <InvoiceDownloadLink
                      invoiceNumber={inv.invoice_number}
                      kind={inv.doc_type === 'tax_invoice' ? 'tax_invoice' : 'receipt'}
                      className="shrink-0"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
            </TabsContent>

            <TabsContent value="access">
          {/* Training lock/unlock */}
          <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-ds-label uppercase text-muted-foreground">Training Gate</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-foreground">
                  Status:{' '}
                  <span className={trainingRequired ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                    {trainingRequired ? 'Locked (training required)' : 'Unlocked'}
                  </span>
                </p>
                {currentMember.training_status ? (
                  <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                    Progress: {currentMember.training_status}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={trainingToggle.isPending}
                onClick={() => {
                  setTrainingError(null)
                  const newLocked = !trainingRequired
                  trainingToggle.mutate(
                    { userId: currentMember.id, locked: newLocked },
                    {
                      onSuccess: (updated) => {
                        setTrainingRequired(newLocked)
                        setCurrentMember((prev) => ({
                          ...prev,
                          training_required: updated.training_required,
                          training_status: updated.training_status,
                        }))
                      },
                      onError: (e: Error) => setTrainingError(e.message),
                    },
                  )
                }}
                className="shrink-0"
              >
                {trainingToggle.isPending ? '…' : trainingRequired ? 'Unlock' : 'Lock'}
              </Button>
            </div>
            {trainingError ? (
              <p className="mt-1 text-ds-caption text-destructive" role="alert">{trainingError}</p>
            ) : null}
          </div>

          {/* Enrollment link access */}
          <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-ds-label uppercase text-muted-foreground">Enrollment Link Access</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-foreground">
                  Status:{' '}
                  <span className={enrollAccess ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground font-medium'}>
                    {enrollAccess ? 'Allowed (sees Enrollment Link page)' : 'Not allowed'}
                  </span>
                </p>
                <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                  Lets this member open the secure enrollment-video link generator.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={enrollAccessToggle.isPending}
                onClick={() => {
                  setEnrollError(null)
                  const next = !enrollAccess
                  enrollAccessToggle.mutate(
                    { userId: currentMember.id, enabled: next },
                    {
                      onSuccess: (updated) => {
                        setEnrollAccess(updated.enrollment_link_access)
                        setCurrentMember((prev) => ({
                          ...prev,
                          enrollment_link_access: updated.enrollment_link_access,
                        }))
                      },
                      onError: (e: Error) => setEnrollError(e.message),
                    },
                  )
                }}
                className="shrink-0"
              >
                {enrollAccessToggle.isPending ? '…' : enrollAccess ? 'Disable' : 'Enable'}
              </Button>
            </div>
            {enrollError ? (
              <p className="mt-1 text-ds-caption text-destructive" role="alert">{enrollError}</p>
            ) : null}
          </div>
            </TabsContent>

            <TabsContent value="danger">
          {/* Delete */}
          <div className="border-t border-border pt-3">
            {deleteError ? (
              <p className="mb-2 text-ds-caption text-destructive" role="alert">{deleteError}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleteMut.isPending}
              onClick={() => setDanger('delete')}
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete Account'}
            </Button>
          </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>

      <ConfirmDialog
        open={danger !== null}
        title={danger === 'delete' ? 'Delete account' : 'Remove member now'}
        description={
          danger === 'delete'
            ? `This removes ${currentMember.fbo_id} from the system and revokes access immediately. Their history is kept and access can be restored later.`
            : `Remove ${currentMember.fbo_id} from the system right now? They lose access immediately.`
        }
        confirmLabel={danger === 'delete' ? 'Delete account' : 'Remove now'}
        destructive
        requireTyped={danger === 'delete' ? currentMember.fbo_id : undefined}
        onConfirm={() => {
          const action = danger
          setDanger(null)
          if (action === 'delete') handleDelete()
          else if (action === 'remove_now') handleComplianceAction('remove_now')
        }}
        onCancel={() => setDanger(null)}
      />
    </>
  )
}
