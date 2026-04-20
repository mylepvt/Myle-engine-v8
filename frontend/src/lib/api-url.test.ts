import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('apiUrl (VITE_API_URL)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses same-origin relative paths when VITE_API_URL is empty string', async () => {
    vi.stubEnv('VITE_API_URL', '')
    const { apiUrl } = await import('@/lib/api')
    expect(apiUrl('/api/v1/meta')).toBe('/api/v1/meta')
  })

  it('prefixes explicit API base when set', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com')
    const { apiUrl } = await import('@/lib/api')
    expect(apiUrl('/api/v1/meta')).toBe('https://api.example.com/api/v1/meta')
    expect(apiUrl('api/v1/meta')).toBe('https://api.example.com/api/v1/meta')
  })

  it('normalizes legacy VITE_API_BASE_URL values that already include /api/v1', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1')
    const { apiUrl } = await import('@/lib/api')
    expect(apiUrl('/api/v1/meta')).toBe('https://api.example.com/api/v1/meta')
  })

  it('strips accidental /api/v1 suffix from VITE_API_URL too', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api/v1/')
    const { apiUrl } = await import('@/lib/api')
    expect(apiUrl('/api/v1/meta')).toBe('https://api.example.com/api/v1/meta')
  })
})
