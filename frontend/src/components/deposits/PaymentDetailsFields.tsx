import { NativeSelect } from '@/components/ui/native-select'
import { type PaymentDetailsDraft, nowLocalInput, paymentDraftError } from '@/lib/deposits'

export function PaymentDetailsFields({
  value,
  onChange,
  modes,
}: {
  value: PaymentDetailsDraft
  onChange: (next: PaymentDetailsDraft) => void
  modes: Record<string, string>
}) {
  const showError = value.ref.trim() !== '' ? paymentDraftError(value) : null
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-ds-caption text-muted-foreground">Payment mode</span>
        <NativeSelect value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value })} className="field-input w-full">
          {Object.entries(modes).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="block">
        <span className="mb-1 block text-ds-caption text-muted-foreground">
          {value.mode === 'upi' ? 'UPI Ref No. / UTR (12 digits)' : 'Transaction ID / Payment Ref No.'}
        </span>
        <input
          value={value.ref}
          onChange={(e) => onChange({ ...value, ref: e.target.value })}
          inputMode={value.mode === 'upi' ? 'numeric' : 'text'}
          autoCapitalize="characters"
          placeholder={value.mode === 'upi' ? '412345678901' : 'From the payment screen'}
          className="field-input font-mono"
        />
      </label>
      {showError ? <p className="text-ds-caption text-destructive">{showError}</p> : null}
      <label className="block">
        <span className="mb-1 block text-ds-caption text-muted-foreground">Date &amp; time of payment</span>
        <input
          type="datetime-local"
          value={value.paidAt}
          max={nowLocalInput()}
          onChange={(e) => onChange({ ...value, paidAt: e.target.value })}
          className="field-input"
        />
      </label>
    </div>
  )
}
