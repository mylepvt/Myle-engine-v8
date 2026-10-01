import { useCallback, useEffect, useState } from 'react'

import { checkServiceWorkerUpdate, isNewAppVersionAvailable } from '@/lib/app-update'

const CHECK_INTERVAL_MS = 10 * 60_000

/** Watches for a newer deployed build (on resume + every 10 min while visible). */
export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  const check = useCallback(async (): Promise<boolean> => {
    void checkServiceWorkerUpdate()
    const fresh = await isNewAppVersionAvailable()
    if (fresh) setUpdateAvailable(true)
    return fresh
  }, [])

  useEffect(() => {
    void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check()
    }, CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  return { updateAvailable, check }
}
