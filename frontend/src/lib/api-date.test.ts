import { describe, expect, it } from 'vitest'

import { parseApiDateMs } from './api-date'

describe('api-date', () => {
  it('treats naive backend timestamps as UTC', () => {
    expect(parseApiDateMs('2026-04-29T08:56:52.826856')).toBe(Date.parse('2026-04-29T08:56:52.826856Z'))
  })

  it('preserves explicit timezone offsets', () => {
    expect(parseApiDateMs('2026-04-29T14:26:52.826856+05:30')).toBe(Date.parse('2026-04-29T08:56:52.826856Z'))
  })
})
