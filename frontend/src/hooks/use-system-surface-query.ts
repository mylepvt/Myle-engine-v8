import { useQuery } from '@tanstack/react-query'

import { normalizeShellStubResponse, type ShellStubResponse } from '@/hooks/use-shell-stub-query'
import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'
import { normalizeTrainingSurfacePayload } from '@/lib/training-surface'

export type SystemSurface = 'training' | 'decision-engine' | 'coaching'

/** DB-backed training home (differs from stub shape). */
export type TrainingSurfacePayload = {
  videos: { day_number: number; title: string; youtube_url?: string | null; audio_url?: string | null; unlocked?: boolean }[]
  progress: { day_number: number; completed: boolean; completed_at?: string | null }[]
  notes?: { day_number: number }[]
  note?: string | null
}

const PATHS: Record<SystemSurface, string> = {
  training: '/api/v1/system/training',
  'decision-engine': '/api/v1/system/decision-engine',
  coaching: '/api/v1/system/coaching',
}

async function fetchSystemSurface(
  surface: SystemSurface,
): Promise<ShellStubResponse | TrainingSurfacePayload> {
  const res = await apiFetch(PATHS[surface])
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = messageFromApiErrorPayload(raw, res.statusText)
    throw new Error(msg || `HTTP ${res.status}`)
  }
  if (surface === 'training') {
    return normalizeTrainingSurfacePayload(raw)
  }
  return normalizeShellStubResponse(raw)
}

export function useSystemSurfaceQuery(surface: SystemSurface, enabled = true) {
  return useQuery({
    queryKey: ['system', surface],
    queryFn: () => fetchSystemSurface(surface),
    enabled,
    staleTime: surface === 'training' ? 30_000 : 45_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
  })
}
