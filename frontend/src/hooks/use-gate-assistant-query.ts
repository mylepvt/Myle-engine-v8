import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export type GateChecklistItem = {
  id: string
  label: string
  done: boolean
  href: string | null
}

export type GateAssistantResponse = {
  role: 'team' | 'leader' | 'admin'
  risk_level: 'green' | 'yellow' | 'red'
  progress_done: number
  progress_total: number
  next_action: string
  next_href: string | null
  next_label: string | null
  checklist: GateChecklistItem[]
  fresh_leads_today: number
  calls_today: number
  call_target: number
  pending_proof_count: number
  members_below_call_gate: number
  open_follow_ups: number
  overdue_follow_ups: number
  active_pipeline_leads: number
  note: string | null
}

async function fetchGateAssistant(): Promise<GateAssistantResponse> {
  const res = await apiFetch('/api/v1/gate-assistant')
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json() as Promise<GateAssistantResponse>
}

export function useGateAssistantQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['gate-assistant'],
    queryFn: fetchGateAssistant,
    enabled,
    staleTime: 30_000,
  })
}
