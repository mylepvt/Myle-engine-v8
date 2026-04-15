import type { TrainingSurfacePayload } from '@/hooks/use-system-surface-query'

export function normalizeTrainingSurfacePayload(raw: unknown): TrainingSurfacePayload {
  if (!raw || typeof raw !== 'object') {
    return { videos: [], progress: [], note: null }
  }
  const o = raw as Record<string, unknown>
  const videos = Array.isArray(o.videos) ? o.videos : []
  const progress = Array.isArray(o.progress) ? o.progress : []
  const note = typeof o.note === 'string' ? o.note : null
  return { videos, progress, note } as TrainingSurfacePayload
}
