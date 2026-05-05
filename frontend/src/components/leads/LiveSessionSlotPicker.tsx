import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAppSettingsQuery } from '@/hooks/use-settings-query'
import { upcomingLiveSessionSlots } from '@/lib/live-session-slots'

type Props = {
  open: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: (slotKey: string) => void
}

export function LiveSessionSlotPicker({ open, busy = false, onClose, onConfirm }: Props) {
  const settingsQuery = useAppSettingsQuery()
  const [selectedKey, setSelectedKey] = useState<string>('')

  const options = useMemo(
    () => upcomingLiveSessionSlots(settingsQuery.data?.settings ?? {}),
    [settingsQuery.data?.settings],
  )

  if (!open) return null

  const canConfirm = !!selectedKey && !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-[1.6rem] border border-white/10 bg-[#0a1020] p-5 shadow-[0_32px_120px_-70px_rgba(0,0,0,0.95)]"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">Sent Enroll Video</p>
        <h3 className="mt-2 text-xl font-semibold text-white">Choose which time slot to send</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Sirf current time ke baad wale configured live-session videos yahan dikh rahe hain.
        </p>

        <div className="mt-4 space-y-2">
          {settingsQuery.isPending ? (
            <p className="text-sm text-white/60">Loading available slots…</p>
          ) : settingsQuery.isError ? (
            <p className="text-sm text-red-300">Could not load live session slots.</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-amber-200">
              Abhi current/future live-session slots configured nahi hain. Settings me 11 AM to 9 PM slot links fill karo.
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSelectedKey(option.key)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedKey === option.key
                    ? 'border-primary/50 bg-primary/15 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]'
                }`}
              >
                <p className="font-medium">{option.label}</p>
                <p className="mt-1 break-all text-xs text-white/50">{option.url}</p>
              </button>
            ))
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(selectedKey)} disabled={!canConfirm}>
            {busy ? 'Sending…' : 'Send selected video'}
          </Button>
        </div>
      </div>
    </div>
  )
}
