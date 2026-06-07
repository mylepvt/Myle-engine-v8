import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Styled confirmation dialog for destructive / irreversible actions.
 *
 * Replaces native `window.confirm`, which is unstyled and trivially
 * click-through. When `requireTyped` is set, the confirm button stays disabled
 * until the user types that exact string (e.g. the member's FBO id) — a
 * deliberate friction step for irreversible operations.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  requireTyped,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  requireTyped?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) setTyped('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const typedOk = !requireTyped || typed.trim() === requireTyped

  return (
    <div
      className="keyboard-safe-modal fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="keyboard-safe-sheet surface-elevated w-full max-w-sm rounded p-5 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1.5 text-ds-caption text-muted-foreground">{description}</p>
        ) : null}

        {requireTyped ? (
          <label className="mt-3 block">
            <span className="mb-1 block text-ds-caption text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">{requireTyped}</span> to
              confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="field-input"
              placeholder={requireTyped}
              aria-label={`Type ${requireTyped} to confirm`}
            />
          </label>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
            disabled={!typedOk}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
