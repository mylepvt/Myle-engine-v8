import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { useWinsQuery } from '@/hooks/use-wins-query'

const FRESH_MS = 10 * 60_000

/** Pops a toast when a teammate wins while the app is open (never for your own wins). */
export function useWinsToaster(enabled: boolean) {
  const { data } = useWinsQuery()
  const seen = useRef<Set<number> | null>(null)

  useEffect(() => {
    if (!enabled || !data) return
    if (seen.current === null) {
      // First load: everything already there is history, not news.
      seen.current = new Set(data.items.map((w) => w.id))
      return
    }
    const fresh = data.items.filter(
      (w) => !seen.current!.has(w.id) && !w.is_mine && Date.now() - new Date(w.created_at).getTime() < FRESH_MS,
    )
    data.items.forEach((w) => seen.current!.add(w.id))
    fresh.slice(0, 2).forEach((w) => toast.success(w.text, { description: 'Tap Cheer on your home screen.' }))
  }, [data, enabled])
}
