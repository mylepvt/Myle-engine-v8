import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refreshes once and retries protected requests after a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { apiFetch } = await import('@/lib/api')
    const res = await apiFetch('/api/v1/team/members')

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/api/v1/auth/refresh',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8000/api/v1/team/members',
      expect.objectContaining({
        credentials: 'include',
      }),
    )
  })

  it('does not try silent refresh for login failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const { apiFetch } = await import('@/lib/api')
    const res = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ fbo_id: 'fbo-leader-001', password: 'wrong' }),
    })

    expect(res.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries once after a csrf_invalid response', async () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'csrf_token=fresh-token',
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'csrf_invalid', message: 'CSRF token missing or invalid.' } }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const { apiFetch } = await import('@/lib/api')
    const res = await apiFetch('/api/v1/leads/1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'day2' }),
    })

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/leads/1',
      expect.objectContaining({
        credentials: 'include',
        method: 'PATCH',
        headers: expect.any(Headers),
      }),
    )
    const firstHeaders = fetchMock.mock.calls[0]?.[1]?.headers
    expect(firstHeaders).toBeInstanceOf(Headers)
    expect((firstHeaders as Headers).get('X-CSRF-Token')).toBe('fresh-token')
  })
})
