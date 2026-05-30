/**
 * Bug 1 regression: status PATCH must update the row instantly (optimistic) and
 * roll back if the request fails — no more "click edit 2-3 times" / silent
 * stale rows.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type LeadPublic,
  usePatchLeadMutation,
} from '@/hooks/use-leads-query'

// Infinite-query key prefix the mutation patches: ['leads','list','paged', ...]
const PAGED_KEY = ['leads', 'list', 'paged', 'active', '', '', 50, null, false, false, false, false]

function seedLead(status: string): LeadPublic {
  // Only fields the optimistic patch touches matter; cast the rest.
  return { id: 1, name: 'L', status, call_status: null } as unknown as LeadPublic
}

function makeClientWithLead(status: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(PAGED_KEY, {
    pageParams: [0],
    pages: [{ items: [seedLead(status)], total: 1, limit: 50, offset: 0 }],
  })
  return qc
}

function leadStatus(qc: QueryClient): string {
  const data = qc.getQueryData(PAGED_KEY) as
    | { pages: { items: LeadPublic[] }[] }
    | undefined
  return data!.pages[0].items[0].status
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usePatchLeadMutation optimistic status update', () => {
  it('applies the new status to the cached row immediately, before the network resolves', async () => {
    const qc = makeClientWithLead('video_sent')
    // Never-resolving fetch: the optimistic patch must show before any response.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))

    const { result } = renderHook(() => usePatchLeadMutation(), { wrapper: wrapper(qc) })
    result.current.mutate({ id: 1, body: { status: 'mindset_lock' } })

    await waitFor(() => expect(leadStatus(qc)).toBe('mindset_lock'))
  })

  it('rolls the row back to its previous status when the PATCH fails', async () => {
    const qc = makeClientWithLead('video_sent')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 400 }),
      ),
    )

    const { result } = renderHook(() => usePatchLeadMutation(), { wrapper: wrapper(qc) })
    await expect(
      result.current.mutateAsync({ id: 1, body: { status: 'mindset_lock' } }),
    ).rejects.toThrow()

    // After failure the optimistic change is reverted (not left stuck or silently stale).
    expect(leadStatus(qc)).toBe('video_sent')
  })
})
