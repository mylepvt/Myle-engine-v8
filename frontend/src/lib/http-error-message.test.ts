import { describe, expect, it } from 'vitest'

import { messageFromApiErrorPayload } from '@/lib/http-error-message'

describe('messageFromApiErrorPayload', () => {
  it('uses nested error.message', () => {
    expect(
      messageFromApiErrorPayload({ error: { message: 'Nope' } }, 'fallback'),
    ).toBe('Nope')
  })

  it('uses string detail', () => {
    expect(messageFromApiErrorPayload({ detail: 'Bad request' }, 'x')).toBe('Bad request')
  })

  it('uses first validation error msg', () => {
    expect(
      messageFromApiErrorPayload({ detail: [{ msg: 'field required' }] }, 'x'),
    ).toBe('field required')
  })

  it('falls back', () => {
    expect(messageFromApiErrorPayload({}, 'gone')).toBe('gone')
    expect(messageFromApiErrorPayload(null, 'gone')).toBe('gone')
  })
})
