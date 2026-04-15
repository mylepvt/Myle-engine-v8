import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { messageFromApiErrorPayload } from '@/lib/http-error-message'

export type ShellStubResponse = {
  items: Record<string, unknown>[]
  total: number
  note: string | null
}

export function normalizeShellStubResponse(raw: unknown): ShellStubResponse {
  if (!raw || typeof raw !== 'object') {
    return { items: [], total: 0, note: null }
  }
  const o = raw as Record<string, unknown>
  const rawItems = o.items
  const items: Record<string, unknown>[] = Array.isArray(rawItems)
    ? rawItems.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    : []
  const total =
    typeof o.total === 'number' && Number.isFinite(o.total) ? Math.trunc(o.total) : items.length
  const note = typeof o.note === 'string' ? o.note : null
  return { items, total, note }
}

async function fetchShellStub(apiPath: string): Promise<ShellStubResponse> {
  const res = await apiFetch(apiPath)
  const raw: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = messageFromApiErrorPayload(raw, res.statusText)
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return normalizeShellStubResponse(raw)
}

export function useShellStubQuery(apiPath: string, enabled = true) {
  return useQuery({
    queryKey: ['shell-stub', apiPath],
    queryFn: () => fetchShellStub(apiPath),
    enabled,
    staleTime: 45_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
  })
}
