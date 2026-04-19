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

  it('tries refresh once when /me returns unauthenticated after access expiry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: false }), { status: 200 }),
      )
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

  it('returns unauthenticated when refresh fails after 401 on /me', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const me = await fetchAuthMe()
    expect(me.authenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns unauthenticated when /me is still 401 after successful refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const me = await fetchAuthMe()
    expect(me.authenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
