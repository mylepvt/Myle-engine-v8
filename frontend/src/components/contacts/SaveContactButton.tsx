import { useState } from 'react'
import { ContactRound } from 'lucide-react'

import { useDashboardShellRole } from '@/hooks/use-dashboard-shell-role'
import { openContactCard } from '@/lib/contact-card'

/** Admin only: save this prospect to the phone's contacts as "<name> – MYLE Day 2". */
export function SaveContactButton({ leadId, hasPhone }: { leadId: number; hasPhone: boolean }) {
  const { serverRole } = useDashboardShellRole()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (serverRole !== 'admin' || !hasPhone) return null
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          openContactCard(`/api/v1/admin/contacts/lead/${leadId}.vcf`)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not open the contact'))
            .finally(() => setBusy(false))
        }}
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/30 text-ds-caption font-semibold text-foreground transition hover:bg-muted/60 disabled:opacity-50"
      >
        <ContactRound className="h-3.5 w-3.5" aria-hidden />
        {busy ? 'Opening…' : 'Save contact to phone'}
      </button>
      {error ? <p className="mt-1 text-ds-caption text-destructive">{error}</p> : null}
    </div>
  )
}
