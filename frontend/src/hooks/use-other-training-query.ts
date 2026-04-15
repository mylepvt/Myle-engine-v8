import { useQuery } from '@tanstack/react-query'

import type { TrainingSurfacePayload } from '@/hooks/use-system-surface-query'
import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'
import { normalizeTrainingSurfacePayload } from '@/lib/training-surface'

async function fetchOtherTraining(): Promise<TrainingSurfacePayload> {
  const res = await apiFetch('/api/v1/other/training')
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = messageFromApiErrorPayload(raw, res.statusText)
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return normalizeTrainingSurfacePayload(raw)
}

export function useOtherTrainingQuery(enabled = true) {
  return useQuery({
    queryKey: ['other', 'training'],
    queryFn: fetchOtherTraining,
    enabled,
    staleTime: 30_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
  })
}
