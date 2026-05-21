import { useEffect, useRef } from 'react'
import { LogIn, LogOut, MapPin, AlertTriangle, Clock } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  useMyCheckinQuery,
  useCheckInMutation,
  useCheckOutMutation,
  useCheckinHeartbeat,
} from '@/hooks/use-checkin-query'
import { cn } from '@/lib/utils'

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

async function getGps(): Promise<{ latitude?: number; longitude?: number; accuracy_meters?: number }> {
  if (!('geolocation' in navigator)) return {}
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_meters: pos.coords.accuracy,
      }),
      () => resolve({}),
      { timeout: 8000, maximumAge: 60000 },
    )
  })
}

export function CheckInWidget() {
  const { data, isPending } = useMyCheckinQuery()
  const checkIn = useCheckInMutation()
  const checkOut = useCheckOutMutation()
  const heartbeat = useCheckinHeartbeat(!!data?.checked_in && !data.check_out_at)

  // Heartbeat every 15 min while checked in
  useEffect(() => {
    if (!data?.checked_in || data.check_out_at) return
    const id = setInterval(() => { void heartbeat.mutate() }, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [data?.checked_in, data?.check_out_at, heartbeat])

  const handleCheckIn = async () => {
    const coords = await getGps()
    checkIn.mutate(coords)
  }

  const handleCheckOut = async () => {
    const coords = await getGps()
    checkOut.mutate(coords)
  }

  if (isPending) return <Skeleton className="h-[72px] w-full rounded-xl" />

  const isActive = data?.checked_in && !data.check_out_at
  const isDone = data?.checked_in && !!data.check_out_at
  const isSuspicious = data?.is_suspicious

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
              <p className="text-sm font-semibold text-foreground">Check In</p>
              <p className="text-xs text-muted-foreground">Start your work session</p>
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
                  : <span>Location recorded</span>
                }
              </div>
            </>
          )}
          {isDone && data.check_out_at && (
            <>
              <p className="text-sm font-semibold text-foreground">
                Done · {data.work_duration_minutes != null ? formatDuration(data.work_duration_minutes) : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
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
        {!data?.checked_in && (
          <button
            type="button"
            onClick={() => void handleCheckIn()}
            disabled={checkIn.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 min-h-[40px]"
          >
            <LogIn className="h-3.5 w-3.5" />
            {checkIn.isPending ? 'Checking in…' : 'Check In'}
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
          <span className="text-xs text-muted-foreground/60">Session ended</span>
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
