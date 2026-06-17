import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type ActionKey = 'alert_leader' | 'create_recovery' | 'escalate'

export interface ActionQueueItem {
  id: string
  item_type: 'zombie_lead' | 'missed_missions' | 'inactive_member' | 'stuck_verification'
  severity: number
  entity_type: 'lead' | 'member'
  entity_id: number
  member_id: number | null
  member_name: string | null
  leader_name: string | null
  title: string
  subtitle: string
  age_days: number
  actions: ActionKey[]
  last_actioned_at: string | null
}

export interface ActionQueueResponse {
  items: ActionQueueItem[]
  total: number
  computed_at: string
}

export interface ActionExecuteResult {
  status: string
  action: ActionKey
  detail: Record<string, unknown> | null
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function useActionQueue(enabled = true) {
  return useQuery({
    queryKey: ['action-queue'],
    queryFn: () => fetchJson<ActionQueueResponse>('/api/v1/action-queue'),
    enabled,
    refetchInterval: 60_000,
  })
}

export function useExecuteQueueAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      item_type: string
      entity_type: 'lead' | 'member'
      entity_id: number
      action: ActionKey
    }) =>
      fetchJson<ActionExecuteResult>('/api/v1/action-queue/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-queue'] })
      qc.invalidateQueries({ queryKey: ['automation-logs'] })
    },
  })
}
