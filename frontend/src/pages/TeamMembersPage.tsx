import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import {
  createTeamMember,
  useTeamMembersQuery,
  useResetAllMembersPasswordMutation,
  useResetMemberPasswordMutation,
  type TeamMemberPublic,
} from '@/hooks/use-team-query'
import { ROLES, roleShortLabel, type Role } from '@/types/role'

type ResetTarget = Pick<TeamMemberPublic, 'id' | 'fbo_id' | 'email'>

type Props = { title: string }

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
        <p className="mb-4 text-ds-caption text-muted-foreground">
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
          <p className="mt-2 text-ds-caption text-destructive" role="alert">
            {resetError}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={resetMut.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={resetMut.isPending || newPassword.length < 8}
            onClick={handleSubmit}
          >
            {resetMut.isPending ? '…' : 'Reset'}
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
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        All accounts in this environment (from the users table). Passwords are never exposed via this API.
      </p>

      {isAdmin ? (
        <div className="surface-elevated p-5 text-sm">
          <h2 className="mb-3 font-medium text-foreground">Add user</h2>
          <p className="mb-3 text-ds-caption text-muted-foreground">
            Creates a password-login account (min. 8 characters). Admin only.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block min-w-[10rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">FBO ID (unique)</span>
              <input
                autoComplete="off"
                value={fboId}
                onChange={(e) => setFboId(e.target.value)}
                disabled={createMut.isPending}
                className="field-input"
              />
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Username (optional)</span>
              <input
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={createMut.isPending}
                className="field-input"
              />
            </label>
            <label className="block min-w-[12rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Email</span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={createMut.isPending}
                className="field-input"
              />
            </label>
            <label className="block min-w-[10rem] flex-1">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={createMut.isPending}
                className="field-input"
              />
            </label>
            <label className="block w-full min-w-[8rem] sm:w-auto">
              <span className="mb-1 block text-ds-caption text-muted-foreground">Role</span>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Role)}
                disabled={createMut.isPending}
                className="field-input sm:w-36"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleShortLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              disabled={
                createMut.isPending ||
                !fboId.trim() ||
                !email.trim() ||
                password.length < 8
              }
              onClick={() =>
                createMut.mutate({
                  fbo_id: fboId.trim(),
                  username: username.trim() || null,
                  email: email.trim(),
                  password,
                  role: newRole,
                })
              }
            >
              {createMut.isPending ? '…' : 'Create'}
            </Button>
          </div>
          {createError ? (
            <p className="mt-2 text-ds-caption text-destructive" role="alert">
              {createError}
            </p>
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
          <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="surface-elevated p-5 text-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-foreground">Total: {data.total}</p>
            {isAdmin ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkResetMut.isPending}
                onClick={() => {
                  const ok = window.confirm(
                    'Reset password for ALL users to Myle@2323 ?',
                  )
                  if (!ok) return
                  bulkResetMut.mutate(
                    { newPassword: 'Myle@2323' },
                    {
                      onSuccess: (d) => {
                        setToastMsg(`Password reset done for ${d.updated} users`)
                      },
                      onError: (e: Error) => {
                        setToastMsg(`Bulk reset failed: ${e.message}`)
                      },
                    },
                  )
                }}
              >
                {bulkResetMut.isPending ? 'Resetting…' : 'Set all passwords: Myle@2323'}
              </Button>
            ) : null}
          </div>
          <ul className="space-y-2">
            {data.items.map((m) => (
              <li
                key={m.id}
                className="surface-inset flex items-start justify-between gap-3 px-3 py-2.5 text-muted-foreground"
              >
                <div>
                  <span className="font-medium text-foreground">{m.fbo_id}</span>
                  {m.username ? (
                    <span className="ml-1.5 text-muted-foreground">({m.username})</span>
                  ) : null}
                  <span className="mt-0.5 block text-ds-caption text-muted-foreground">{m.email}</span>
                  <span className="mt-0.5 block text-ds-caption">
                    {m.role} · joined {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                {isAdminOrLeader ? (
                  <button
                    type="button"
                    onClick={() => setResetTarget({ id: m.id, fbo_id: m.fbo_id, email: m.email })}
                    className="shrink-0 rounded-md border border-border bg-muted/30 px-2 py-1 text-ds-caption text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    Reset Password
                  </button>
                ) : null}
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

      {toastMsg ? (
        <div className="fixed bottom-24 right-4 z-[85] rounded-md border border-emerald-400/35 bg-emerald-400/15 px-3 py-2 text-ds-caption font-semibold text-emerald-200 shadow-lg">
          {toastMsg}
        </div>
      ) : null}
    </div>
  )
}
