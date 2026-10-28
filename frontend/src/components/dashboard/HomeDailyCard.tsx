import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight } from 'lucide-react'

import { useAuthMeQuery } from '@/hooks/use-auth-me-query'
import { todayIst, useDailyTextQuery } from '@/hooks/use-daily-text-query'

/**
 * Top of Home: today's date and the admin's daily text, cut to two lines.
 * Tapping opens the full message (with earlier days) on the Daily Text page.
 */
export function HomeDailyCard() {
  const today = todayIst()
  const { data } = useDailyTextQuery(today)
  const { data: me } = useAuthMeQuery()
  const isAdmin = me?.role === 'admin'
  const label = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const headline = data?.entry?.headline

  return (
    <Link
      to={`/dashboard/daily-text?date=${today}`}
      className="jw-daily press -mx-4 -mt-4 mb-6 flex flex-col items-center gap-1.5 px-6 py-7 text-center md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8"
    >
      <span className="flex items-center gap-2 text-ds-h3 font-semibold text-primary">
        <CalendarDays className="size-5" strokeWidth={1.6} aria-hidden />
        {label}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </span>
      {headline ? (
        <span className="line-clamp-2 max-w-xl text-sm text-foreground">{headline}</span>
      ) : isAdmin ? (
        <span className="text-sm text-muted-foreground">Tap to write today's message</span>
      ) : null}
    </Link>
  )
}
