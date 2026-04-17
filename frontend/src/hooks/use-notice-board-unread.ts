/**
 * Client-side unread count for the notice board.
 * Strategy: store the last-seen total in localStorage. Any new announcements
 * posted since then show as "unread" until the user visits the notice board.
 */
import { useCallback, useState } from 'react'
import { useNoticeBoardQuery } from './use-notice-board-query'

const LS_KEY = 'myle_nb_last_seen_total'

function getLastSeen(): number {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (!v) return 0
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function setLastSeen(n: number) {
  try {
    localStorage.setItem(LS_KEY, String(n))
  } catch {
    /* ignore */
  }
}

export function useNoticeBoardUnread() {
  const { data } = useNoticeBoardQuery()
  const total = data?.total ?? 0

  const [seen, setSeen] = useState<number>(getLastSeen)

  const unread = Math.max(0, total - seen)

  const markAllSeen = useCallback(() => {
    setLastSeen(total)
    setSeen(total)
  }, [total])

  return { unread, markAllSeen }
}
