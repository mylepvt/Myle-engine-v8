import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export interface TimelineEvent {
  type: string
  label: string
  timestamp: string
  actor: string
  detail: string
}

export interface LeadTimelineResponse {
  lead_id: number
  lead_name: string
  owner: string
  assigned_to: string
  outcome: string
  events: TimelineEvent[]
}

export function useLeadTimeline(leadId: number | undefined) {
  return useQuery({
    queryKey: ['lead', leadId, 'timeline'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/leads/${leadId}/timeline`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.detail || `HTTP ${res.status}`)
      return body as LeadTimelineResponse
    },
    enabled: !!leadId,
  })
}
