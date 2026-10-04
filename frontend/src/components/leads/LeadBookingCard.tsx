import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  useBookLeadsMutation,
  useCancelLeadBookingMutation,
  useMyLeadBookingsQuery,
  type LeadBooking,
} from '@/hooks/use-lead-booking-query'

const INPUT_CLASS =
  'w-24 rounded-md border border-border dark:border-white/12 bg-muted/50 px-2 py-1.5 text-sm text-foreground shadow-glass-inset focus:outline-none focus:ring-2 focus:ring-primary/35'

function TodayStatus({ booking }: { booking: LeadBooking }) {
  if (booking.status === 'fulfilled') {
    return <p>Today: all {booking.requested_count} booked leads received.</p>
  }
  return (
    <div>
      <p>
        Today: {booking.fulfilled_count} of {booking.requested_count} booked leads received. The rest arrive
        automatically as soon as leads are added to the pool.
      </p>
      {booking.last_skip_reason ? <p className="mt-1 text-destructive">{booking.last_skip_reason}</p> : null}
    </div>
  )
}

/** Member: "How many leads do you want tomorrow?" — auto-assigned when the admin loads the pool. */
export function LeadBookingCard() {
  const { data } = useMyLeadBookingsQuery()
  const bookMut = useBookLeadsMutation()
  const cancelMut = useCancelLeadBookingMutation()
  const [countStr, setCountStr] = useState('')

  const max = data?.max_count ?? 50
  const tomorrow = data?.tomorrow ?? null
  const count = Number.parseInt(countStr, 10)
  const valid = Number.isFinite(count) && count >= 1 && count <= max
  const error = bookMut.error ?? cancelMut.error

  return (
    <div className="surface-elevated mb-4 space-y-3 p-4 text-sm">
      <div>
        <p className="font-medium text-foreground">Book leads for tomorrow</p>
        <p className="text-xs text-muted-foreground">
          Tell us how many leads you want. When the admin adds leads to the pool, they are claimed for you
          automatically (paid from your wallet) and appear on your Calling Board → Today.
        </p>
      </div>

      {data?.today ? (
        <div className="text-xs text-muted-foreground">
          <TodayStatus booking={data.today} />
        </div>
      ) : null}

      {tomorrow ? (
        <p className="text-xs text-foreground">
          Booked for tomorrow: <strong className="tabular-nums">{tomorrow.requested_count}</strong> leads. Keep enough
          wallet balance.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="lead-booking-count">
          Leads for tomorrow
        </label>
        <input
          id="lead-booking-count"
          type="number"
          min={1}
          max={max}
          inputMode="numeric"
          placeholder={tomorrow ? String(tomorrow.requested_count) : 'e.g. 20'}
          value={countStr}
          onChange={(e) => setCountStr(e.target.value)}
          className={INPUT_CLASS}
        />
        <Button
          type="button"
          size="sm"
          disabled={!valid || bookMut.isPending}
          onClick={() => bookMut.mutate(count, { onSuccess: () => setCountStr('') })}
        >
          {bookMut.isPending ? 'Saving…' : tomorrow ? 'Change booking' : 'Book leads'}
        </Button>
        {tomorrow ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={cancelMut.isPending}
            onClick={() => cancelMut.mutate()}
          >
            Cancel booking
          </Button>
        ) : null}
      </div>
      {countStr !== '' && !valid ? <p className="text-xs text-destructive">Enter 1 to {max}.</p> : null}
      {error ? <p className="text-xs text-destructive">{error.message}</p> : null}
    </div>
  )
}
