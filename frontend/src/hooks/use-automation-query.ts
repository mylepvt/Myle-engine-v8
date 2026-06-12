import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface AutomationRulePublic {
  id: number
  name: string
  description: string | null
  trigger_type: string
  trigger_config: Record<string, unknown> | null
  action_type: string
  action_config: Record<string, unknown> | null
  cooldown_hours: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AutomationActionLogPublic {
  id: number
  rule_id: number
  trigger_type: string
  trigger_entity_type: string
  trigger_entity_id: number
  trigger_detail: Record<string, unknown> | null
  action_type: string
  action_result: Record<string, unknown> | null
  created_at: string
}

export interface AutomationEvaluateResponse {
  triggered: number
  actions: AutomationActionLogPublic[]
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
  return body as T
}

export function useAutomationRules(enabled = true) {
  return useQuery({
    queryKey: ['automation-rules'],
    queryFn: () => fetchJson<AutomationRulePublic[]>('/api/v1/admin/automation-rules'),
    enabled,
  })
}

export function useAutomationLogs(limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['automation-logs', limit],
    queryFn: () => fetchJson<AutomationActionLogPublic[]>(`/api/v1/admin/automation/logs?limit=${limit}`),
    enabled,
  })
}

export function useEvaluateAutomation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<AutomationEvaluateResponse>('/api/v1/admin/automation/evaluate', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-logs'] })
      qc.invalidateQueries({ queryKey: ['automation-rules'] })
    },
  })
}

export function useToggleAutomationRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) =>
      fetchJson<AutomationRulePublic>(`/api/v1/admin/automation-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules'] }),
  })
}
