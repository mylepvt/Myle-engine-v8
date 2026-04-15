import { describe, expect, it } from 'vitest'

import { buildCsv, escapeCsvCell } from '@/lib/csv-string'

describe('escapeCsvCell', () => {
  it('quotes when comma or newline present', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"')
    expect(escapeCsvCell('plain')).toBe('plain')
  })

  it('doubles internal quotes', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  })
})

describe('buildCsv', () => {
  it('joins header and rows', () => {
    expect(buildCsv(['A', 'B'], [['1', '2']])).toBe('A,B\n1,2')
  })

  it('header only when no rows', () => {
    expect(buildCsv(['X'], [])).toBe('X')
  })
})
