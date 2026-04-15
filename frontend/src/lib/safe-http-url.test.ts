import { describe, expect, it } from 'vitest'

import { isSafeHttpUrl } from '@/lib/safe-http-url'

describe('isSafeHttpUrl', () => {
  it('accepts http(s)', () => {
    expect(isSafeHttpUrl('https://example.com/zoom')).toBe(true)
    expect(isSafeHttpUrl('http://localhost:3000/')).toBe(true)
  })

  it('rejects javascript and empty', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
    expect(isSafeHttpUrl('   ')).toBe(false)
  })

  it('rejects non-http protocols', () => {
    expect(isSafeHttpUrl('ftp://x')).toBe(false)
  })
})
