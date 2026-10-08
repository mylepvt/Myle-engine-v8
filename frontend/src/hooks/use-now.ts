import { useEffect, useState } from 'react'

/** Current time (ms), refreshed every `everyMs` — keeps render pure (no Date.now() in render). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}
