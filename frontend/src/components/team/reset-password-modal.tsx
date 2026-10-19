import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { useLatestValue } from '@/hooks/use-latest-value'
import { useResetMemberPasswordMutation } from '@/hooks/use-team-query'
import type { ResetTarget } from '@/components/team/member-utils'

export function ResetPasswordModal({
  target,
  onClose,
  onSuccess,
}: {
  target: ResetTarget | null
  onClose: () => void
  onSuccess: (name: string) => void
}) {
  const shown = useLatestValue(target)
  return (
    <Sheet open={target != null} onClose={onClose} label="Reset password" size="sm" className="p-4 text-sm md:p-6">
      {shown ? <ResetPasswordForm key={shown.id} target={shown} onClose={onClose} onSuccess={onSuccess} /> : null}
    </Sheet>
  )
}

function ResetPasswordForm({
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
    <>
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
            className="rounded-full bg-muted px-3 py-2 text-ds-caption text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
    </>
  )
}
