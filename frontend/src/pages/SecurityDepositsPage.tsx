import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { DepositReceiptCard, ReceiptStatusPill } from '@/components/deposits/DepositReceiptCard'
import { formatIst, nowLocalInput } from '@/lib/deposits'
import { saveBlob } from '@/lib/deposit-share'
import {
  type DepositReceipt,
  type DepositSettings,
  fetchDepositConsentEvidence,
  useDepositReceiptsQuery,
  useDepositSettingsQuery,
  useRefundDepositMutation,
  useSaveDepositSettingsMutation,
} from '@/hooks/use-deposits-query'

type Props = { title: string }

/**
 * Admin: every refundable security deposit receipt (search by name / mobile / receipt no.),
 * refunds, consent evidence and the receipt's business details. Separate from invoices,
 * wallet and FLP billing.
 */
export function SecurityDepositsPage({ title }: Props) {
  const [q, setQ] = useState('')
  const [appliedQ, setAppliedQ] = useState('')
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState<DepositReceipt | null>(null)
  const [refundFor, setRefundFor] = useState<DepositReceipt | null>(null)
  const list = useDepositReceiptsQuery(appliedQ, status)

  const held = list.data?.items.filter((r) => r.status === 'held') ?? []
  const heldRupees = held.reduce((sum, r) => sum + r.amount_rupees, 0)

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          100% refundable enrollment deposits. Receipts only — not sales, no tax invoice.
        </p>
      </div>

      <div className="surface-elevated flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="block min-w-[12rem] flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedQ(q)
            }}
            placeholder="Name, mobile, receipt no. or transaction ID"
            className="field-input w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Status</span>
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="field-input w-40">
            <option value="">All</option>
            <option value="held">Held</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
        </label>
        <Button type="button" size="sm" onClick={() => setAppliedQ(q)}>
          Search
        </Button>
      </div>

      {list.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {list.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {list.error.message}
        </p>
      ) : null}

      {list.data ? (
        <div className="space-y-2">
          {held.length ? (
            <p className="text-xs text-muted-foreground">
              Held on this page: {held.length} · ₹{heldRupees.toLocaleString('en-IN')}
            </p>
          ) : null}
          {list.data.items.length === 0 ? (
            <p className="surface-inset px-3 py-6 text-center text-sm text-muted-foreground">No receipts match.</p>
          ) : (
            list.data.items.map((r) => (
              <div key={r.receipt_number} className="surface-inset flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
                <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                  <p className="truncate font-medium text-foreground">
                    {r.lead_name}
                    <span className="ml-2 text-xs text-muted-foreground">{r.lead_phone}</span>
                    {r.lead_city ? <span className="ml-2 text-xs text-muted-foreground">{r.lead_city}</span> : null}
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {r.receipt_number} · {r.payment_ref}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Paid {formatIst(r.paid_at)}
                    {r.status === 'refunded' ? ` · Refunded ${formatIst(r.refunded_at)} (${r.refund_ref})` : ''}
                  </p>
                  {r.consent_state === 'withdrawn' && r.status === 'held' ? (
                    <p className="text-xs font-semibold text-destructive-ink">Consent withdrawn — refund due</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-foreground">₹{r.amount_rupees}</p>
                <ReceiptStatusPill status={r.status} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setOpen(r)}>
                    Open
                  </Button>
                  {r.status === 'held' ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRefundFor(r)}>
                      Mark refunded
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
          <p className="px-1 text-xs text-muted-foreground">
            Showing {list.data.items.length} of {list.data.total}
          </p>
        </div>
      ) : null}

      <SettingsCard />

      <Sheet open={open != null} onClose={() => setOpen(null)} label="Deposit receipt" size="sm" className="space-y-3 p-5 text-sm">
        {open ? (
          <>
            <h2 className="text-base font-semibold text-foreground">{open.lead_name}</h2>
            <DepositReceiptCard receipt={open} />
            {open.cancel_reason ? <p className="text-ds-caption text-muted-foreground">{open.cancel_reason}</p> : null}
            {open.refund_note ? <p className="text-ds-caption text-muted-foreground">Refund note: {open.refund_note}</p> : null}
            <EvidenceButton consentId={open.consent_id} />
          </>
        ) : null}
      </Sheet>
      <RefundSheet receipt={refundFor} onClose={() => setRefundFor(null)} />
    </div>
  )
}

function EvidenceButton({ consentId }: { consentId: number }) {
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setErr(null)
          fetchDepositConsentEvidence(consentId)
            .then((ev) =>
              saveBlob(new Blob([JSON.stringify(ev, null, 2)], { type: 'application/json' }), `deposit-consent-C-${consentId}.json`),
            )
            .catch((e: Error) => setErr(e.message))
        }}
      >
        Download consent evidence
      </Button>
      <p className="text-ds-caption text-muted-foreground">
        The exact terms the lead saw, their typed name, verified mobile, time, IP and browser, with the seal check.
      </p>
      {err ? <p className="text-ds-caption text-destructive">{err}</p> : null}
    </div>
  )
}

function RefundSheet({ receipt, onClose }: { receipt: DepositReceipt | null; onClose: () => void }) {
  const mut = useRefundDepositMutation()
  const [when, setWhen] = useState(nowLocalInput)
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (receipt) {
      setWhen(nowLocalInput())
      setRef('')
      setNote('')
      mut.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.receipt_number])

  const refOk = /^[A-Z0-9][A-Z0-9/-]{5,39}$/.test(ref.replace(/\s+/g, '').toUpperCase())

  return (
    <Sheet open={receipt != null} onClose={onClose} label="Mark refunded" size="sm" dismissible={!mut.isPending} className="space-y-3 p-5 text-sm">
      {receipt ? (
        <>
          <h2 className="text-base font-semibold text-foreground">Refund ₹{receipt.amount_rupees} to {receipt.lead_name}</h2>
          <p className="text-ds-caption text-muted-foreground">
            {receipt.receipt_number} · paid by {receipt.payment_mode_label} ({receipt.payment_ref})
          </p>
          <label className="block">
            <span className="mb-1 block text-ds-caption text-muted-foreground">Refund date &amp; time</span>
            <input type="datetime-local" value={when} max={nowLocalInput()} onChange={(e) => setWhen(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-ds-caption text-muted-foreground">Refund Transaction ID / Payment Ref No.</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} autoCapitalize="characters" className="field-input font-mono" />
          </label>
          <label className="block">
            <span className="mb-1 block text-ds-caption text-muted-foreground">Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="field-input" />
          </label>
          {mut.error ? <p className="text-ds-caption text-destructive">{mut.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={mut.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!refOk || !when || mut.isPending}
              onClick={() =>
                mut.mutate(
                  { receiptNumber: receipt.receipt_number, refunded_at: new Date(when).toISOString(), refund_ref: ref, note },
                  { onSuccess: onClose },
                )
              }
            >
              {mut.isPending ? 'Saving…' : 'Mark refunded'}
            </Button>
          </div>
        </>
      ) : null}
    </Sheet>
  )
}

function SettingsCard() {
  const q = useDepositSettingsQuery()
  const save = useSaveDepositSettingsMutation()
  const [draft, setDraft] = useState<DepositSettings | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (q.data) setDraft(q.data)
  }, [q.data])

  if (!draft) return q.isError ? <p className="text-sm text-destructive">{q.error.message}</p> : null
  const field = (key: 'business_name' | 'support_email' | 'operated_by', label: string, hint?: string) => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className="field-input w-full" />
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )

  return (
    <div className="surface-elevated space-y-4 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">Consent + receipt required before Day 1</p>
          <p className="text-xs text-muted-foreground">
            On: a lead can&apos;t move past the calling stages until they have agreed on their phone and the deposit
            receipt (with Transaction ID) is issued. Turn off only in an emergency.
          </p>
        </div>
        <Switch
          checked={draft.gate_enabled}
          disabled={save.isPending}
          onCheckedChange={(v) => {
            setDraft({ ...draft, gate_enabled: v })
            save.mutate({ gate_enabled: v })
          }}
        />
      </div>
      {showDetails ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('business_name', 'Name on receipt')}
            {field('operated_by', 'Operated by (optional)', 'The registered business name, if you want it on the receipt.')}
            {field('support_email', 'Support email', 'The only contact shown on receipts and the lead’s pages.')}
          </div>
          {save.error ? <p className="text-xs text-destructive">{save.error.message}</p> : null}
          <Button
            type="button"
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                business_name: draft.business_name,
                support_email: draft.support_email,
                operated_by: draft.operated_by,
              })
            }
          >
            {save.isPending ? 'Saving…' : 'Save receipt details'}
          </Button>
        </>
      ) : (
        <button type="button" onClick={() => setShowDetails(true)} className="text-xs text-primary hover:underline">
          Receipt details: {draft.business_name} · {draft.support_email} — edit
        </button>
      )}
    </div>
  )
}
