import { useState } from 'react'
import { X } from 'lucide-react'

type Props = {
  open: boolean
  title: string
  description: string
  placeholder?: string
  defaultReason?: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}

export function RejectReasonModal({
  open,
  title,
  description,
  placeholder = 'Reason for rejection…',
  defaultReason = '',
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState(defaultReason)

  if (!open) return null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(reason.trim() || defaultReason)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <form
        onSubmit={handleSubmit}
        className="keyboard-safe-modal mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={placeholder}
          rows={4}
          autoFocus
          className="field-input mb-4 resize-none"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition hover:bg-destructive/90"
          >
            Reject
          </button>
        </div>
      </form>
    </div>
  )
}
