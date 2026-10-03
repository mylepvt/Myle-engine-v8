import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export type WinKind = 'enrollment' | 'conversion' | 'level_up' | 'streak'

export type TeamWin = {
  id: number
  kind: WinKind
  user_id: number
  name: string
  text: string
  created_at: string
  cheers: number
  cheered_by_me: boolean
  is_mine: boolean
}

type WinsResponse = { items: TeamWin[] }

const WINS_KEY = ['wins'] as const

export function useWinsQuery() {
  return useQuery<WinsResponse>({
    queryKey: WINS_KEY,
    queryFn: async () => {
      const res = await apiFetch('/api/v1/wins')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  })
}

/** Cheer / un-cheer — flips instantly, server count wins on reply. */
export function useCheerWinMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (winId: number) => {
      const res = await apiFetch(`/api/v1/wins/${winId}/cheer`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as { cheered: boolean; cheers: number }
    },
    onMutate: async (winId) => {
      await qc.cancelQueries({ queryKey: WINS_KEY })
      const prev = qc.getQueryData<WinsResponse>(WINS_KEY)
      const patch = (fn: (w: TeamWin) => TeamWin) =>
        qc.setQueryData<WinsResponse>(WINS_KEY, (old) =>
          old ? { items: old.items.map((w) => (w.id === winId ? fn(w) : w)) } : old,
        )
      patch((w) => ({ ...w, cheered_by_me: !w.cheered_by_me, cheers: w.cheers + (w.cheered_by_me ? -1 : 1) }))
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(WINS_KEY, ctx.prev)
    },
    onSuccess: (r, winId) => {
      qc.setQueryData<WinsResponse>(WINS_KEY, (old) =>
        old ? { items: old.items.map((w) => (w.id === winId ? { ...w, cheered_by_me: r.cheered, cheers: r.cheers } : w)) } : old,
      )
    },
  })
}
