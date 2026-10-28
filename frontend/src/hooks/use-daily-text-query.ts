import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type DailyTextEntry = {
  headline: string
  body: string | null
  updated_at: string
}

export type DailyTextResponse = {
  /** IST calendar day, YYYY-MM-DD. */
  date: string
  /** Null when no message is set for that day. */
  entry: DailyTextEntry | null
}

const BASE = '/api/v1/daily-text'

async function request(path: string, init?: RequestInit): Promise<DailyTextResponse> {
  const res = await apiFetch(path, init)
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new Error(messageFromApiErrorPayload(raw, res.statusText) || `HTTP ${res.status}`)
  return raw as DailyTextResponse
}

/** Today's date in IST as YYYY-MM-DD. */
export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** `date` (YYYY-MM-DD) moved by `days`. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function useDailyTextQuery(date: string) {
  return useQuery({
    queryKey: ['daily-text', date],
    queryFn: () => request(`${BASE}?date=${encodeURIComponent(date)}`),
    staleTime: 60_000,
  })
}

export function useDailyTextMutations() {
  const qc = useQueryClient()
  const onSuccess = (data: DailyTextResponse) => qc.setQueryData(['daily-text', data.date], data)
  const save = useMutation({
    mutationFn: ({ date, headline, body }: { date: string; headline: string; body: string }) =>
      request(`${BASE}/${date}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline, body }),
      }),
    onSuccess,
  })
  const remove = useMutation({
    mutationFn: (date: string) => request(`${BASE}/${date}`, { method: 'DELETE' }),
    onSuccess,
  })
  return { save, remove }
}
