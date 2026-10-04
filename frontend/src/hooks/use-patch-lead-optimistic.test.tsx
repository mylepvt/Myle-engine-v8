import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { usePatchLeadMutation } from './use-leads-query'

let release: () => void = () => {}
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(new Response(JSON.stringify({ id: 1 }), { status: 200 }))
      }),
  ),
}))

describe('usePatchLeadMutation — Day checklist ticks', () => {
  it('shows the tick before the server answers (one tap is enough)', async () => {
    const qc = new QueryClient()
    const lead = { id: 1, name: 'Rohit', status: 'day3', process_tracking: { day3: { day3_interview: true } } }
    qc.setQueryData(['workboard'], { columns: [{ status: 'day3', total: 1, items: [lead] }], max_rows_fetched: 1 })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => usePatchLeadMutation(), { wrapper })

    let pending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      pending = result.current.mutateAsync({
        id: 1,
        body: { process_stage: 'day3', process_task: 'day3_live_session', process_task_done: true },
      })
      await new Promise((r) => setTimeout(r, 0))
    })

    const card = (qc.getQueryData(['workboard']) as { columns: { items: typeof lead[] }[] }).columns[0].items[0]
    // Ticked already, and the existing Interview tick is kept.
    expect(card.process_tracking).toEqual({ day3: { day3_interview: true, day3_live_session: true } })

    await act(async () => {
      release()
      await pending
    })
  })
})
