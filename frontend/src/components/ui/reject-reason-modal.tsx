import { useState } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(reason.trim() || defaultReason)
  }

  return (
    <Sheet open={open} onClose={onCancel} label={title} className="p-6">
      <form onSubmit={handleSubmit}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Close">
            <X className="size-5" />
          </Button>
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
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive">
            Reject
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
