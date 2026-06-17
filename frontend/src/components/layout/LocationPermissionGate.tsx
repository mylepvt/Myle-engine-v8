import { useEffect, useState } from 'react'
import { MapPin, X } from 'lucide-react'

import { getGps } from '@/lib/geolocation'

type PermState = 'checking' | 'granted' | 'prompt' | 'denied'

export function LocationPermissionGate() {
  const [permState, setPermState] = useState<PermState>('checking')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!('permissions' in navigator)) {
      setPermState('prompt')
      return
    }
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        setPermState(result.state as PermState)
        result.onchange = () => setPermState(result.state as PermState)
      })
      .catch(() => setPermState('prompt'))
  }, [])

  // Trigger native dialog — DashboardLayout handles actual pinging after grant
  const requestPermission = () => {
    void getGps()
  }

  if (permState === 'checking' || permState === 'granted' || dismissed) return null

  if (permState === 'denied') {
    return (
      <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-300">Location blocked</p>
          <p className="mt-0.5 text-xs text-amber-600/70 dark:text-amber-300/70">
            Settings → Browser → Location → Allow for this site. Location is required to verify field attendance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-amber-600/60 hover:text-amber-600 dark:text-amber-400/60 dark:hover:text-amber-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  // permState === 'prompt'
  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Location access required</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your location is checked to verify field attendance. Leaders can see where you are.
        </p>
        <button
          type="button"
          onClick={requestPermission}
          className="mt-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
        >
          Allow Location
        </button>
      </div>
    </div>
  )
}
