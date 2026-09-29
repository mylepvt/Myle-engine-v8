import { Button } from '@/components/ui/button'
import { useFulfillLeadBookingsMutation, useLeadBookingsDayQuery } from '@/hooks/use-lead-booking-query'

function istDate(offsetDays: number): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function BookingTable({ day, label }: { day: string; label: string }) {
  const { data, isPending } = useLeadBookingsDayQuery(day)
  if (isPending) return <p className="text-xs text-muted-foreground">Loading {label.toLowerCase()}…</p>
  if (!data || data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">{label}: no bookings.</p>
  }
  return (
    <div>
      <p className="text-xs font-medium text-foreground">
        {label}: {data.total_requested} leads booked · {data.total_fulfilled} delivered
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {data.items.map((row) => (
          <li key={row.user_id} className="flex flex-wrap gap-x-2">
            <span className="text-foreground">{row.member_name}</span>
            <span className="tabular-nums">
              {row.fulfilled_count}/{row.requested_count}
            </span>
            {row.status === 'expired' ? <span>(expired)</span> : null}
            {row.last_skip_reason && row.status === 'open' ? (
              <span className="text-destructive">{row.last_skip_reason}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Admin: how many leads members booked — load at least this many into the pool. */
export function AdminLeadBookingsCard() {
  const fulfillMut = useFulfillLeadBookingsMutation()
  return (
    <div className="surface-inset space-y-3 p-4 text-sm">
      <div>
        <p className="font-medium text-foreground">Lead bookings</p>
        <p className="text-ds-caption text-muted-foreground">
          Members book tomorrow&apos;s leads in advance. When you import leads, today&apos;s bookings are filled
          automatically (oldest booking first).
        </p>
      </div>
      <BookingTable day={istDate(0)} label="Today" />
      <BookingTable day={istDate(1)} label="Tomorrow" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={fulfillMut.isPending}
          onClick={() => fulfillMut.mutate()}
        >
          {fulfillMut.isPending ? 'Filling…' : "Fill today's bookings now"}
        </Button>
        {fulfillMut.data ? (
          <span className="text-xs text-muted-foreground">
            {fulfillMut.data.leads_assigned} leads delivered to {fulfillMut.data.members_filled} members
            {fulfillMut.data.skipped ? ` · ${fulfillMut.data.skipped} on hold` : ''}
          </span>
        ) : null}
        {fulfillMut.error ? <span className="text-xs text-destructive">{fulfillMut.error.message}</span> : null}
      </div>
    </div>
  )
}
