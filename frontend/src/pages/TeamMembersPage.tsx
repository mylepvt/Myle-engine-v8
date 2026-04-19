import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { InvoiceDownloadLink } from '@/components/wallet/InvoiceDownloadLink'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  createTeamMember,
  useTeamMembersQuery,
  useResetAllMembersPasswordMutation,
  useResetMemberPasswordMutation,
  useUpdateMemberRoleMutation,
  useDeleteMemberMutation,
  useMemberLeadsQuery,
  useToggleTrainingLockMutation,
  type TeamMemberPublic,
} from '@/hooks/use-team-query'
import { useInvoicesQuery } from '@/hooks/use-invoices-query'
import { ROLES, roleShortLabel, type Role } from '@/types/role'

type ResetTarget = Pick<TeamMemberPublic, 'id' | 'fbo_id' | 'email'>

type Props = { title: string }

function memberRoleLabel(role: string): string {
  if (role === 'admin' || role === 'leader' || role === 'team') {
    return roleShortLabel(role)
  }
  return role
}

function memberRoleBadgeVariant(role: string): 'warning' | 'primary' | 'success' | 'outline' {
  if (role === 'admin') return 'warning'
  if (role === 'leader') return 'primary'
  if (role === 'team') return 'success'
  return 'outline'
}

function formatMemberTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

function ResetPasswordModal({
  target,
  onClose,
  onSuccess,
}: {
  target: ResetTarget
  onClose: () => void
  onSuccess: (name: string) => void
}) {
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const resetMut = useResetMemberPasswordMutation()

  function handleSubmit() {
    setResetError(null)
    resetMut.mutate(
      { userId: target.id, newPassword },
      {
        onSuccess: () => {
          onSuccess(target.fbo_id)
          onClose()
        },
        onError: (e: Error) => setResetError(e.message),
      },
    )
  }

  return (
    <div
      className="keyboard-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="keyboard-safe-sheet surface-elevated max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-xl p-6 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 font-semibold text-foreground">Reset Password</h2>
        <p className="mb-4 break-all text-ds-caption text-muted-foreground">
          <span className="font-medium text-foreground">{target.fbo_id}</span>
          {' · '}
          {target.email}
        </p>
        <label className="block">
          <span className="mb-1 block text-ds-caption text-muted-foreground">New password (min 8 chars)</span>
          <div className="flex gap-2">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={resetMut.isPending}
              className="field-input flex-1"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-ds-caption text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        {resetError ? (
          <p className="mt-2 text-ds-caption text-destructive" role="alert">{resetError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={resetMut.isPending}>Cancel</Button>
          <Button type="button" disabled={resetMut.isPending || newPassword.length < 8} onClick={handleSubmit}>
            {resetMut.isPending ? '…' : 'Reset'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MemberProfileModal({
  member,
  onClose,
}: {
  member: TeamMemberPublic
  onClose: () => void
}) {
  const { data, isPending } = useMemberLeadsQuery(member.id)
  const invQuery = useInvoicesQuery({ user_id: member.id, limit: 50, offset: 0 })
  const updateRoleMut = useUpdateMemberRoleMutation()
  const deleteMut = useDeleteMemberMutation()
  const trainingToggle = useToggleTrainingLockMutation()
  const [selectedRole, setSelectedRole] = useState<Role>(member.role as Role)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [trainingError, setTrainingError] = useState<string | null>(null)
  const [trainingRequired, setTrainingRequired] = useState<boolean>(member.training_required ?? false)

  function handleRoleChange() {
    setRoleError(null)
    updateRoleMut.mutate(
      { userId: member.id, role: selectedRole },
      {
        onError: (e: Error) => setRoleError(e.message),
        onSuccess: onClose,
      },
    )
  }

  function handleDelete() {
    if (!window.confirm(`Delete ${member.fbo_id}? This cannot be undone.`)) return
    setDeleteError(null)
    deleteMut.mutate(member.id, {
      onError: (e: Error) => setDeleteError(e.message),
      onSuccess: onClose,
    })
  }

  return (
    <div
      className="keyboard-safe-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="keyboard-safe-sheet surface-elevated max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl p-6 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-all text-base font-semibold text-foreground">{member.fbo_id}</h2>
            {member.username ? (
              <p className="break-words text-ds-caption text-muted-foreground">({member.username})</p>
            ) : null}
            <p className="mt-0.5 break-all text-ds-caption text-muted-foreground">{member.email}</p>
            <p className="mt-0.5 text-ds-caption text-muted-foreground">
              Joined {formatMemberTimestamp(member.created_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-ds-caption text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

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
              disabled={updateRoleMut.isPending || selectedRole === member.role}
              onClick={handleRoleChange}
            >
              {updateRoleMut.isPending ? '…' : 'Save'}
            </Button>
          </div>
          {roleError ? (
            <p className="mt-1 text-ds-caption text-destructive" role="alert">{roleError}</p>
          ) : null}
        </div>

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

        {/* Training lock/unlock */}
        <div className="mb-4 rounded-lg border border-border bg-muted/20 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Training Gate</p>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-foreground">
                Status:{' '}
                <span className={trainingRequired ? 'text-amber-400 font-medium' : 'text-emerald-400 font-medium'}>
                  {trainingRequired ? '🔒 Locked (training required)' : '✓ Unlocked'}
                </span>
              </p>
              {member.training_status ? (
                <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                  Progress: {member.training_status}
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
                  { userId: member.id, locked: newLocked },
                  {
                    onSuccess: () => setTrainingRequired(newLocked),
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
            onClick={handleDelete}
            className="border-destructive/50 text-destructive hover:bg-destructive/10"
          >
            {deleteMut.isPending ? 'Deleting…' : 'Delete Account'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TeamMembersPage({ title }: Props) {
  const queryClient = useQueryClient()
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.authenticated && me.role === 'admin'
  const isAdminOrLeader =
    me?.authenticated && (me.role === 'admin' || me.role === 'leader')
  const { data, isPending, isError, error, refetch } = useTeamMembersQuery()

  const [fboId, setFboId] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newRole, setNewRole] = useState<Role>('team')
  const [createError, setCreateError] = useState<string | null>(null)

  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null)
  const [profileTarget, setProfileTarget] = useState<TeamMemberPublic | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const bulkResetMut = useResetAllMembersPasswordMutation()

  useEffect(() => {
    if (!toastMsg) return
    const id = window.setTimeout(() => setToastMsg(null), 2500)
    return () => window.clearTimeout(id)
  }, [toastMsg])

  const createMut = useMutation({
    mutationFn: createTeamMember,
    onSuccess: async () => {
      setCreateError(null)
      setFboId('')
      setUsername('')
      setEmail('')
      setPassword('')
      await queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
    onError: (e: Error) => setCreateError(e.message),
  })

  return (
    <div className="max-w-3xl space-y-5">
      <div className="space-y-2">
        <Badge variant="primary" className="w-fit px-3 py-1">
          Member directory
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All accounts in this environment from the users table. Passwords are never exposed through this API.
        </p>
      </div>

      {isAdmin ? (
        <div className="surface-elevated p-5 text-sm md:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-medium text-foreground">Add user</h2>
              <p className="mt-1 text-ds-caption text-muted-foreground">
                Create a password-login account with a clean role assignment. Admin only.
              </p>
            </div>
            <Badge variant="warning" className="w-fit">
              Admin tools
            </Badge>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[10rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">FBO ID (unique)</span>
              <input autoComplete="off" value={fboId} onChange={(e) => setFboId(e.target.value)} disabled={createMut.isPending} className="field-input" />
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Username (optional)</span>
              <input autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} disabled={createMut.isPending} className="field-input" />
            </label>
            <label className="block min-w-[12rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Email</span>
              <input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={createMut.isPending} className="field-input" />
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Password</span>
              <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={createMut.isPending} className="field-input" />
            </label>
            <label className="block w-full min-w-[8rem] sm:w-auto">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Role</span>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} disabled={createMut.isPending} className="field-input sm:w-36">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{roleShortLabel(r)}</option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={createMut.isPending || !fboId.trim() || !email.trim() || password.length < 8}
              onClick={() => createMut.mutate({ fbo_id: fboId.trim(), username: username.trim() || null, email: email.trim(), password, role: newRole })}
            >
              {createMut.isPending ? '…' : 'Create'}
            </Button>
          </div>
          {createError ? (
            <p className="mt-2 text-ds-caption text-destructive" role="alert">{createError}</p>
          ) : null}
        </div>
      ) : null}

      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : null}
      {isError ? (
        <div className="text-sm text-destructive" role="alert">
          <span>{error instanceof Error ? error.message : 'Could not load members'} </span>
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>Retry</button>
        </div>
      ) : null}
      {data ? (
        <div className="surface-elevated p-5 text-sm md:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-foreground">Total: {data.total}</p>
              <p className="mt-1 text-ds-caption text-muted-foreground">
                Responsive member cards with wrapped details and quick actions.
              </p>
            </div>
            {isAdmin ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center sm:w-auto"
                disabled={bulkResetMut.isPending}
                onClick={() => {
                  const ok = window.confirm('Reset password for ALL users to Myle@2323 ?')
                  if (!ok) return
                  bulkResetMut.mutate(
                    { newPassword: 'Myle@2323' },
                    {
                      onSuccess: (d) => setToastMsg(`Password reset done for ${d.updated} users`),
                      onError: (e: Error) => setToastMsg(`Bulk reset failed: ${e.message}`),
                    },
                  )
                }}
              >
                {bulkResetMut.isPending ? 'Resetting…' : 'Set all passwords: Myle@2323'}
              </Button>
            ) : null}
          </div>
          <ul className="space-y-3">
            {data.items.map((m) => (
              <li
                key={m.id}
                className="surface-inset overflow-hidden rounded-2xl border border-white/5 px-4 py-3 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-all text-sm font-semibold text-foreground sm:text-[0.95rem]">
                            {m.fbo_id}
                          </span>
                          <Badge variant={memberRoleBadgeVariant(m.role)} className="shrink-0">
                            {memberRoleLabel(m.role)}
                          </Badge>
                        </div>
                        {m.username ? (
                          <p className="mt-1 break-words text-ds-caption text-muted-foreground">
                            {m.username}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2 grid gap-1.5 text-ds-caption text-muted-foreground">
                      <p className="break-all">{m.email}</p>
                      <p>Joined {formatMemberTimestamp(m.created_at)}</p>
                      {(m.upline_name || m.upline_fbo_id) ? (
                        <p className="break-words">
                          Upline: <span className="text-foreground">{m.upline_name ?? m.upline_fbo_id}</span>
                          {m.upline_name && m.upline_fbo_id ? (
                            <span className="ml-1 font-mono opacity-70">({m.upline_fbo_id})</span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[10.5rem]">
                    {isAdmin ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProfileTarget(m)}
                        className="w-full justify-center border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                      >
                        View Profile
                      </Button>
                    ) : null}
                    {isAdminOrLeader ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setResetTarget({ id: m.id, fbo_id: m.fbo_id, email: m.email })}
                        className="w-full justify-center bg-muted/30 text-muted-foreground hover:bg-muted"
                      >
                        Reset Password
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {resetTarget ? (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={(name) => setToastMsg(`Password reset for ${name}`)}
        />
      ) : null}

      {profileTarget ? (
        <MemberProfileModal
          member={profileTarget}
          onClose={() => setProfileTarget(null)}
        />
      ) : null}

      {toastMsg ? (
        <div className="fixed bottom-24 right-4 z-[85] rounded-md border border-emerald-400/35 bg-emerald-400/15 px-3 py-2 text-ds-caption font-semibold text-emerald-200 shadow-lg">
          {toastMsg}
        </div>
      ) : null}
    </div>
  )
}
