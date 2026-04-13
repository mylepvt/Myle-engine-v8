import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchAuthMe } from '@/hooks/use-auth-me-query'

describe('fetchAuthMe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tries refresh once after 401 and then returns authenticated user', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            role: 'leader',
            user_id: 2,
            fbo_id: 'fbo-leader-001',
          }),
          { status: 200 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const me = await fetchAuthMe()
    expect(me.authenticated).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
