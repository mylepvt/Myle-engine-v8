import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { LogIn, LogOut, MapPin, AlertTriangle, Clock, RefreshCw } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  useMyCheckinQuery,
  useCheckInMutation,
  useCheckOutMutation,
  useCheckinHeartbeat,
} from '@/hooks/use-checkin-query'
import { cn } from '@/lib/utils'

const HEARTBEAT_COOLDOWN_MS = 2 * 60 * 1000

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function ElapsedTimer({ since }: { since: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const start = new Date(since).getTime()
    const tick = () => {
      const diff = Math.floor((Date.now() - start) / 1000)
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      if (ref.current) {
        ref.current.textContent = h > 0
          ? `${h}h ${String(m).padStart(2, '0')}m`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [since])
  return <span ref={ref} className="tabular-nums" />
}

type GpsPayload = {
  latitude?: number
  longitude?: number
  accuracy_meters?: number
  city?: string
  state?: string
}

async function reverseGeocode(lat: number, lon: number): Promise<{ city?: string; state?: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } },
    )
    if (!res.ok) return {}
    const data = await res.json() as { address?: Record<string, string> }
    const addr = data.address ?? {}
    const city = addr.city || addr.town || addr.village || addr.county || undefined
    const state = addr.state || undefined
    return { city, state }
  } catch {
    return {}
  }
}

async function getGps(): Promise<GpsPayload> {
  if (!('geolocation' in navigator)) return {}
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const base: GpsPayload = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
        }
        const geo = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        resolve({ ...base, ...geo })
      },
      () => resolve({}),
      { timeout: 8000, maximumAge: 60000 },
    )
  })
}

export function CheckInWidget() {
  const { data, isPending } = useMyCheckinQuery()
  const checkIn = useCheckInMutation()
  const checkOut = useCheckOutMutation()
  const heartbeat = useCheckinHeartbeat(true)
  const location = useLocation()
  const lastHeartbeatRef = useRef<number>(0)

  const isActive = !!(data?.checked_in && !data.check_out_at)

  // Activity-based heartbeat: route change, visibility, focus
  const maybeHeartbeat = useCallback(() => {
    if (!isActive) return
    const now = Date.now()
    if (now - lastHeartbeatRef.current < HEARTBEAT_COOLDOWN_MS) return
    lastHeartbeatRef.current = now
    void heartbeat.mutate()
  }, [isActive, heartbeat])

  useEffect(() => { maybeHeartbeat() }, [location.pathname, maybeHeartbeat])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') maybeHeartbeat() }
    const onFocus = () => maybeHeartbeat()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [maybeHeartbeat])

  const handleCheckIn = async () => {
    const coords = await getGps()
    checkIn.mutate(coords)
  }

  const handleCheckOut = async () => {
    const coords = await getGps()
    checkOut.mutate(coords)
  }

  if (isPending) return <Skeleton className="h-[72px] w-full rounded-xl" />

  const isDone = !!(data?.checked_in && data.check_out_at)
  const isSuspicious = data?.is_suspicious
  const sessionsToday = data?.sessions_today ?? 0
  const totalMinutes = data?.total_minutes_today

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors',
      isActive
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : isDone
          ? 'border-white/[0.08] bg-white/[0.03]'
          : 'border-primary/20 bg-primary/5',
    )}>
      {/* Left: status info */}
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          isActive ? 'bg-emerald-500/20' : isDone ? 'bg-white/[0.06]' : 'bg-primary/10',
        )}>
          {isActive
            ? <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
            : isDone
              ? <Clock className="h-4 w-4 text-muted-foreground" />
              : <LogIn className="h-4 w-4 text-primary" />
          }
        </div>

        <div className="min-w-0">
          {!data?.checked_in && (
            <>
              <p className="text-sm font-semibold text-foreground">
                {sessionsToday > 0 ? 'Start new session' : 'Check In'}
              </p>
              <p className="text-xs text-muted-foreground">
                {sessionsToday > 0
                  ? `${sessionsToday} session${sessionsToday > 1 ? 's' : ''} today${totalMinutes ? ` · ${formatDuration(totalMinutes)} total` : ''}`
                  : 'Start your work session'}
              </p>
            </>
          )}
          {isActive && data.check_in_at && (
            <>
              <p className="text-sm font-semibold text-emerald-400">
                Working · <ElapsedTimer since={data.check_in_at} />
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {isSuspicious
                  ? <span className="flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="h-3 w-3" /> GPS weak
                    </span>
                  : data.city
                    ? <span>{data.city}{data.state ? `, ${data.state}` : ''}</span>
                    : <span>Location recorded</span>
                }
                {sessionsToday > 1 && (
                  <span className="text-muted-foreground/50">· session {sessionsToday}</span>
                )}
              </div>
            </>
          )}
          {isDone && data.check_out_at && (
            <>
              <p className="text-sm font-semibold text-foreground">
                Done · {totalMinutes != null ? formatDuration(totalMinutes) : data.work_duration_minutes != null ? formatDuration(data.work_duration_minutes) : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {sessionsToday > 1 ? `${sessionsToday} sessions today · ` : ''}
                {new Date(data.check_in_at!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                {' → '}
                {new Date(data.check_out_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Right: action button */}
      <div className="shrink-0">
        {(!data?.checked_in) && (
          <button
            type="button"
            onClick={() => void handleCheckIn()}
            disabled={checkIn.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 min-h-[40px]"
          >
            <LogIn className="h-3.5 w-3.5" />
            {checkIn.isPending ? 'Checking in…' : sessionsToday > 0 ? 'Check In Again' : 'Check In'}
          </button>
        )}
        {isActive && (
          <button
            type="button"
            onClick={() => void handleCheckOut()}
            disabled={checkOut.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/20 disabled:opacity-50 min-h-[40px]"
          >
            <LogOut className="h-3.5 w-3.5" />
            {checkOut.isPending ? 'Checking out…' : 'Check Out'}
          </button>
        )}
        {isDone && (
          <button
            type="button"
            onClick={() => void handleCheckIn()}
            disabled={checkIn.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-white/[0.08] disabled:opacity-50 min-h-[36px]"
          >
            <RefreshCw className="h-3 w-3" />
            {checkIn.isPending ? '…' : 'New Session'}
          </button>
        )}
      </div>

      {/* Error */}
      {(checkIn.isError || checkOut.isError) && (
        <p className="absolute -bottom-5 left-0 text-xs text-destructive">
          {checkIn.error instanceof Error ? checkIn.error.message
            : checkOut.error instanceof Error ? checkOut.error.message
            : 'Failed'}
        </p>
      )}
    </div>
  )
}
