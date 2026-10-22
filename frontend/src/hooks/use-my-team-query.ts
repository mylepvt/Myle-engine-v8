import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type MyTeamMember = {
  user_id: number
  name: string
  fbo_id: string
  role: string
  phone: string | null
  state: 'active' | 'blocked' | 'removed'
  is_direct: boolean
  upline_name: string | null
  wallet_cents: number
  recharged_cents: number
  free_credit_cents: number
  spent_on_leads_cents: number
  pending_recharges: number
  last_recharge_at: string | null
  last_recharge_cents: number | null
  leads_active: number
  leads_claimed_today: number
  status_counts: Record<string, number>
}

export type StatusCount = { status: string; label: string; count: number }

export type MyTeamOverview = {
  me: MyTeamMember | null
  members: MyTeamMember[]
  totals: {
    members: number
    active_members: number
    wallet_cents: number
    recharged_cents: number
    leads_active: number
    leads_claimed_today: number
  }
  team_status_counts: StatusCount[]
}

export type MyTeamMemberDetail = {
  recharges: {
    id: number
    amount_cents: number
    status: string
    utr_number: string | null
    admin_note: string | null
    created_at: string
    reviewed_at: string | null
  }[]
  free_recharges: {
    id: number
    amount_cents: number
    status: string
    reason: string
    admin_note: string | null
    created_at: string
    reviewed_at: string | null
  }[]
  wallet_lines: {
    id: number
    amount_cents: number
    kind: string
    kind_label: string
    note: string | null
    created_at: string
  }[]
  leads: {
    id: number
    name: string
    phone: string | null
    city: string | null
    status: string
    status_label: string
    call_status: string | null
    free: boolean
    created_at: string
    last_action_at: string | null
  }[]
}

async function getJson<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(err.error?.message || res.statusText || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function useMyTeamQuery(enabled = true) {
  return useQuery({
    queryKey: ['my-team'],
    queryFn: () => getJson<MyTeamOverview>('/api/v1/team/my-team'),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useMyTeamMemberQuery(memberId: number | null) {
  return useQuery({
    queryKey: ['my-team', 'member', memberId],
    queryFn: () => getJson<MyTeamMemberDetail>(`/api/v1/team/my-team/${memberId}`),
    enabled: memberId != null,
    staleTime: 30_000,
  })
}
