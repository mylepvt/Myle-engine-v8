import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type Day2ReviewSubmissionRow = {
  submission_id: number
  lead_id: number
  lead_name: string
  slot: string
  submitted_at: string
  assigned_to_user_id: number | null
  assigned_to_name: string
  owner_user_id: number | null
  owner_name: string
  notes_text_preview: string | null
  notes_url: string | null
  voice_note_url: string | null
  video_url: string | null
}

export type Day2ReviewResponse = {
  note: string | null
  submissions: Day2ReviewSubmissionRow[]
  total: number
  notes_count: number
  voice_count: number
  video_count: number
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(messageFromApiErrorPayload(body, `HTTP ${response.status}`))
  }
  return body as T
}

export function useDay2ReviewQuery() {
  return useQuery({
    queryKey: ['execution', 'day2-review'],
    queryFn: () => fetchJson<Day2ReviewResponse>('/api/v1/execution/day2-review'),
    staleTime: 30_000,
  })
}
