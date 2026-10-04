import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isNewAppVersionAvailable } from '@/lib/app-update'

function bootWithEntry(src: string) {
  document.head.innerHTML = `<script type="module" src="${src}"></script>`
}

function serveIndex(entry: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(`<html><head><script type="module" crossorigin src="${entry}"></script></head></html>`),
    ),
  )
}

describe('isNewAppVersionAvailable', () => {
  beforeEach(() => {
    vi.stubEnv('PROD', true)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    document.head.innerHTML = ''
  })

  it('is false when the server serves the same build', async () => {
    bootWithEntry('/assets/index-AAA111.js')
    serveIndex('/assets/index-AAA111.js')
    await expect(isNewAppVersionAvailable()).resolves.toBe(false)
  })

  it('is true after a deploy changed the entry chunk', async () => {
    bootWithEntry('/assets/index-AAA111.js')
    serveIndex('/assets/index-BBB222.js')
    await expect(isNewAppVersionAvailable()).resolves.toBe(true)
  })

  it('is false when offline', async () => {
    bootWithEntry('/assets/index-AAA111.js')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(isNewAppVersionAvailable()).resolves.toBe(false)
  })
})
