import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { useTeamMembersQuery } from '@/hooks/use-team-query'
import { apiFetch } from '@/lib/api'

const REASONS = ['New joiner', 'Off-record deal', 'Other'] as const

/** Admin: give a member pool leads free (waived). No wallet debit; Myle Ledger books them apart. */
export function GiveFreeLeadsCard() {
  const qc = useQueryClient()
  const members = useTeamMembersQuery(true)
  const [userId, setUserId] = useState('')
  const [count, setCount] = useState('5')
  const [reason, setReason] = useState<(typeof REASONS)[number]>('New joiner')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const eligible = (members.data?.items ?? []).filter((m) => m.role === 'leader' || m.role === 'team')

  async function submit() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await apiFetch('/api/v1/lead-pool/give-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: Number(userId),
          count: Number(count),
          reason,
          note: note.trim() || undefined,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { given?: number; detail?: unknown }
      if (!res.ok) {
        setMsg({ ok: false, text: typeof data.detail === 'string' ? data.detail : 'Could not give leads' })
        return
      }
      setMsg({ ok: true, text: `${data.given} free lead${data.given === 1 ? '' : 's'} given (${reason}).` })
      setNote('')
      void qc.invalidateQueries({ queryKey: ['lead-pool'] })
    } finally {
      setBusy(false)
    }
  }

  const n = Number(count)
  const valid = userId !== '' && Number.isInteger(n) && n >= 1 && n <= 50

  return (
    <div className="surface-inset space-y-3 p-4 text-sm">
      <div>
        <p className="font-medium text-foreground">Give free leads</p>
        <p className="text-ds-caption text-muted-foreground">
          Oldest pool leads go to the member at ₹0 — for new joiners or an off-record deal. The reason is
          kept on each lead and Myle Ledger books them apart from paid claims.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_10rem]">
        <NativeSelect
          aria-label="Member"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={busy || members.isPending}
          className="w-full input-base px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">{members.isPending ? 'Loading members…' : 'Select member…'}</option>
          {eligible.map((m) => (
            <option key={m.id} value={m.id}>
              {(m.name && m.name.trim()) || m.username || m.email} · {m.fbo_id}
            </option>
          ))}
        </NativeSelect>
        <input
          aria-label="Number of leads"
          type="number"
          min="1"
          max="50"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          disabled={busy}
          className="w-full input-base px-3 py-2 text-sm disabled:opacity-50"
        />
        <NativeSelect
          aria-label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
          disabled={busy}
          className="w-full input-base px-3 py-2 text-sm disabled:opacity-50"
        >
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </NativeSelect>
      </div>
      <input
        aria-label="Note"
        placeholder={reason === 'Other' ? 'What for? (kept with the reason)' : 'Note (optional)'}
        maxLength={60}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        className="w-full input-base px-3 py-2 text-sm disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!valid || busy} onClick={() => void submit()}>
          {busy ? 'Giving…' : `Give ${valid ? n : ''} free`}
        </Button>
        {msg ? (
          <span className={`text-xs ${msg.ok ? 'text-success-ink' : 'text-destructive'}`} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  )
}
