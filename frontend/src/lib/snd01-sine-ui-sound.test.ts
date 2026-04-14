import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const load = vi.fn(() => Promise.resolve())
const playTap = vi.fn()

vi.mock('snd-lib', () => {
  return {
    default: class MockSnd {
      static readonly KITS = { SND01: '01' as const }
      static readonly SOUNDS = { TAP: 'tap' as const }
      load = load
      playTap = playTap
    },
  }
})

vi.mock('@/lib/device-performance', () => ({
  isLowEndDevice: vi.fn(() => false),
}))

import { isLowEndDevice } from '@/lib/device-performance'

import {
  playSnd01SineTap,
  preloadSnd01SineKit,
  resetSnd01SineUiSoundStateForTests,
  shouldEnableSnd01SineUiSound,
} from '@/lib/snd01-sine-ui-sound'

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('snd01-sine-ui-sound', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    resetSnd01SineUiSoundStateForTests()
    load.mockReset()
    playTap.mockReset()
    load.mockResolvedValue(undefined)
    vi.mocked(isLowEndDevice).mockReturnValue(false)
    mockMatchMedia(false)
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('shouldEnableSnd01SineUiSound is false when prefers reduced motion', () => {
    mockMatchMedia(true)
    expect(shouldEnableSnd01SineUiSound()).toBe(false)
  })

  it('shouldEnableSnd01SineUiSound is false on low-end profile', () => {
    mockMatchMedia(false)
    vi.mocked(isLowEndDevice).mockReturnValue(true)
    expect(shouldEnableSnd01SineUiSound()).toBe(false)
  })

  it('preloadSnd01SineKit resolves without calling load when disabled', async () => {
    mockMatchMedia(true)
    await expect(preloadSnd01SineKit()).resolves.toBeUndefined()
    expect(load).not.toHaveBeenCalled()
  })

  it('preloadSnd01SineKit loads SND01 once when enabled', async () => {
    mockMatchMedia(false)
    await preloadSnd01SineKit()
    await preloadSnd01SineKit()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('01')
  })

  it('playSnd01SineTap invokes playTap after load when enabled', async () => {
    mockMatchMedia(false)
    playSnd01SineTap()
    await vi.waitFor(() => {
      expect(playTap).toHaveBeenCalled()
    })
  })

  it('playSnd01SineTap is a no-op when disabled', async () => {
    mockMatchMedia(true)
    playSnd01SineTap()
    await new Promise((r) => setTimeout(r, 0))
    expect(playTap).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
  })
})
