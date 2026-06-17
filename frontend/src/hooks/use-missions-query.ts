import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface MissionItemData {
  key: string
  label: string
  target: number
  achieved: number
  done: boolean
  evidence: string | null
  evidence_file: string | null
}

export interface DailyMissionPublic {
  id: number
  user_id: number
  mission_date: string
  items: Record<string, MissionItemData>
  completion_pct: number
  status: string
  started_at: string | null
  completed_at: string | null
  submitted_at: string | null
  created_at: string
}

export interface AdminMissionSummary {
  total_members: number
  assigned_today: number
  completed: number
  pending: number
  incomplete: number
  completion_rate_pct: number
  leader_breakdown: Array<{
    user_id: number
    name: string
    team_size: number
    assigned: number
    completed: number
    completion_rate_pct: number
  }>
  blocker_summary: Array<{
    reason: string
    count: number
  }>
}

const MISSION_KEYS = {
  all: ['missions'] as const,
  today: ['missions', 'today'] as const,
  history: ['missions', 'history'] as const,
  adminSummary: ['missions', 'admin', 'summary'] as const,
  leaderTeam: ['missions', 'leader', 'team'] as const,
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function useTodayMission() {
  return useQuery({
    queryKey: MISSION_KEYS.today,
    queryFn: () => fetchJson<DailyMissionPublic>('/api/v1/missions/today'),
    refetchInterval: 60_000,
  })
}

export function useMissionHistory() {
  return useQuery({
    queryKey: MISSION_KEYS.history,
    queryFn: () => fetchJson<DailyMissionPublic[]>('/api/v1/missions/history'),
  })
}

export function useTickMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemKey, achieved, evidence }: { itemKey: string; achieved: number; evidence?: string }) =>
      apiFetch('/api/v1/missions/today/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_key: itemKey, achieved, evidence: evidence ?? null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MISSION_KEYS.all }),
  })
}

export function useCompleteMission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/missions/today/complete', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MISSION_KEYS.all }),
  })
}

export function useReportBlocker() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reason, notes }: { reason: string; notes?: string }) =>
      apiFetch('/api/v1/missions/today/blocker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes: notes ?? null }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MISSION_KEYS.all }),
  })
}

export function useAdminMissionSummary(enabled = true) {
  return useQuery({
    queryKey: MISSION_KEYS.adminSummary,
    queryFn: () => fetchJson<AdminMissionSummary>('/api/v1/admin/missions/summary'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useLeaderTeamMissions(enabled = true) {
  return useQuery({
    queryKey: MISSION_KEYS.leaderTeam,
    queryFn: () => fetchJson<{ team: Array<Record<string, unknown>> }>('/api/v1/leader/team-missions'),
    enabled,
    refetchInterval: 30_000,
  })
}
