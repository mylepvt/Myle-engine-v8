import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight } from 'lucide-react'

import { useNoticeBoardQuery } from '@/hooks/use-notice-board-query'

/**
 * Top of Home: today's date and the day's message. The message is the pinned
 * notice-board post (newest pinned first, else the newest post); nothing is
 * shown in its place when the board is empty.
 */
export function HomeDailyCard() {
  const { data } = useNoticeBoardQuery()
  const items = data?.items ?? []
  const notice = items.find((i) => i.pin) ?? items[0]
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  })

  return (
    <Link
      to="/dashboard/other/notice-board"
      className="jw-daily press -mx-4 -mt-4 mb-6 flex flex-col items-center gap-1.5 px-6 py-7 text-center md:-mx-6 md:-mt-6 lg:-mx-8 lg:-mt-8"
    >
      <span className="flex items-center gap-2 text-ds-h3 font-semibold text-primary">
        <CalendarDays className="size-5" strokeWidth={1.6} aria-hidden />
        {today}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </span>
      {notice?.message ? (
        <span className="line-clamp-2 max-w-xl text-sm text-foreground">{notice.message}</span>
      ) : null}
    </Link>
  )
}
