import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type MemberStatus = 'not_started' | 'idle' | 'working' | 'done'

export type ControlRoomMember = {
  user_id: number
  name: string
  role: string
  status: MemberStatus
  calls_today: number
  last_work_at: string | null
  last_seen_at: string | null
  streak: number
  new_leads: number
  followups_due: number
  /** Leads the member got today (claimed, added or reassigned to them). */
  leads_today: number
  /** Leader whose team this member is in (a leader's own id for leaders). */
  leader_id: number | null
  /** Set while a recent nudge is cooling down. */
  nudge_available_at: string | null
}

export type ControlRoom = {
  call_target: number
  counts: Record<MemberStatus, number>
  no_leads: number
  members: ControlRoomMember[]
}

const KEY = ['control-room'] as const

export function useControlRoomQuery(enabled = true) {
  return useQuery<ControlRoom>({
    queryKey: KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/v1/control-room')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export class NudgeFailed extends Error {
  status: number
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

export function useNudgeMemberMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: number) => {
      const res = await apiFetch(`/api/v1/control-room/${memberId}/nudge`, { method: 'POST' })
      if (!res.ok) throw new NudgeFailed(res.status)
      return (await res.json()) as { delivered: boolean; nudge_available_at: string }
    },
    onSuccess: (r, memberId) => {
      qc.setQueryData<ControlRoom>(KEY, (old) =>
        old
          ? { ...old, members: old.members.map((m) => (m.user_id === memberId ? { ...m, nudge_available_at: r.nudge_available_at } : m)) }
          : old,
      )
    },
  })
}

export function useNudgeAllMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/control-room/nudge-all', { method: 'POST' })
      if (!res.ok) throw new NudgeFailed(res.status)
      return (await res.json()) as { sent: number; notifications_off: number; skipped: number }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  })
}
