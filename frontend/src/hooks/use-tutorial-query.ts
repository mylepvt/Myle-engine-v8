import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'

export function useCompleteTutorialMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/system/tutorial-complete', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to complete tutorial')
      return res.json() as Promise<{ ok: boolean }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}

export function useResetTutorialMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/system/tutorial-reset', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to reset tutorial')
      return res.json() as Promise<{ ok: boolean }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}
