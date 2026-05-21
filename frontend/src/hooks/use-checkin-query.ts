import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type CheckInStatus = {
  checked_in: boolean
  checked_out?: boolean
  already?: boolean
  id?: number
  user_id?: number
  actor?: string | null
  date: string
  check_in_at: string | null
  check_out_at: string | null
  last_active_at: string | null
  work_duration_minutes: number | null
  sessions_today?: number
  total_minutes_today?: number
  latitude?: number | null
  longitude?: number | null
  accuracy_meters?: number | null
  city?: string | null
  state?: string | null
  is_suspicious?: boolean
  status?: 'active' | 'away' | 'done' | 'absent'
}

export type TeamCheckInEntry = CheckInStatus & {
  actor: string
  status: 'active' | 'away' | 'done' | 'absent'
  city?: string | null
  state?: string | null
  sessions_today?: number
  total_minutes_today?: number
}

export type TeamCheckInsResponse = {
  date: string
  total: number
  checked_in: number
  active: number
  items: TeamCheckInEntry[]
}

// ── My today status ──────────────────────────────────────────────────────────

export function useMyCheckinQuery(enabled = true) {
  return useQuery<CheckInStatus>({
    queryKey: ['checkin', 'today'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/checkin/today')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<CheckInStatus>
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

// ── Check in ────────────────────────────────────────────────────────────────

export function useCheckInMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (coords: { latitude?: number; longitude?: number; accuracy_meters?: number; city?: string; state?: string }) => {
      const res = await apiFetch('/api/v1/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `HTTP ${res.status}`)
      }
      return res.json() as Promise<CheckInStatus>
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['checkin'] }),
  })
}

// ── Check out ───────────────────────────────────────────────────────────────

export function useCheckOutMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (coords: { latitude?: number; longitude?: number; accuracy_meters?: number; city?: string; state?: string }) => {
      const res = await apiFetch('/api/v1/checkin/out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(coords),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `HTTP ${res.status}`)
      }
      return res.json() as Promise<CheckInStatus>
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['checkin'] }),
  })
}

// ── Heartbeat ────────────────────────────────────────────────────────────────

export function useCheckinHeartbeat(enabled: boolean) {
  return useMutation({
    mutationFn: async () => {
      await apiFetch('/api/v1/checkin/heartbeat', { method: 'POST' })
    },
    // silent — no invalidation needed, just a ping
    onError: () => {},
  })
}

// ── Team view ────────────────────────────────────────────────────────────────

export function useTeamCheckInsQuery(date?: string, enabled = true) {
  const qs = date ? `?date=${date}` : ''
  return useQuery<TeamCheckInsResponse>({
    queryKey: ['checkin', 'team', date ?? 'today'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/checkin/team${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<TeamCheckInsResponse>
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
