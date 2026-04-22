import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function buildMember(id: number) {
  return {
    id,
    fbo_id: `fbo-${id}`,
    username: `user-${id}`,
    email: `user-${id}@myle.local`,
    role: 'team',
    created_at: '2026-04-22T00:00:00Z',
  }
}

describe('fetchTeamMembers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads every page so the directory is not capped at the first response', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => buildMember(index + 1))
    const secondPage = Array.from({ length: 20 }, (_, index) => buildMember(index + 101))

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: firstPage,
            total: 120,
            limit: 100,
            offset: 0,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: secondPage,
            total: 120,
            limit: 100,
            offset: 100,
          }),
          { status: 200 },
        ),
      )

    vi.stubGlobal('fetch', fetchMock)

    const { fetchTeamMembers } = await import('@/hooks/use-team-query')
    const result = await fetchTeamMembers()

    expect(result.total).toBe(120)
    expect(result.items).toHaveLength(120)
    expect(result.items.at(-1)?.fbo_id).toBe('fbo-120')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8000/api/v1/team/members?limit=100&offset=0',
      expect.objectContaining({
        credentials: 'include',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/api/v1/team/members?limit=100&offset=100',
      expect.objectContaining({
        credentials: 'include',
      }),
    )
  })
})
