import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'

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

  const typedOk = !requireTyped || typed.trim() === requireTyped

  return (
    <Sheet open={open} onClose={onCancel} label={title} size="sm" className="p-5 text-sm">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
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

      {/* Phones: full-width 44px thumb targets, primary on top; larger screens: compact row. */}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:mt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" className="sm:h-8 sm:min-h-[32px] sm:px-3 sm:text-ds-caption sm:font-semibold" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? 'destructive' : 'default'}
          size="lg"
          className="sm:h-8 sm:min-h-[32px] sm:px-3 sm:text-ds-caption sm:font-semibold"
          onClick={onConfirm}
          disabled={!typedOk}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}
