import { describe, expect, it } from 'vitest'

import {
  directorySearchValues,
  filterCollectionByQuery,
  matchesSearchQuery,
  normalizeSearchQuery,
} from '@/lib/search-filter'

describe('search-filter', () => {
  it('normalizes whitespace and case in the query', () => {
    expect(normalizeSearchQuery('  Alice Smith  ')).toBe('alice smith')
  })

  it('matches directory records across common member fields', () => {
    expect(
      matchesSearchQuery(
        directorySearchValues({
          fbo_id: 'FBO-9',
          username: 'Alice',
          email: 'alice@example.com',
          upline_name: 'Bob Leader',
        }),
        'bob leader',
      ),
    ).toBe(true)
  })

  it('filters collections without breaking numeric fields', () => {
    const rows = [
      { id: 1, fbo_id: 'FBO-1', email: 'one@example.com' },
      { id: 27, fbo_id: 'FBO-27', email: 'twentyseven@example.com' },
    ]

    const filtered = filterCollectionByQuery(rows, '27', (row) => [row.id, row.fbo_id, row.email])

    expect(filtered).toEqual([rows[1]])
  })

  it('returns the original items when the query is blank', () => {
    const rows = [{ id: 1 }, { id: 2 }]
    expect(filterCollectionByQuery(rows, '   ', (row) => [row.id])).toBe(rows)
  })
})
