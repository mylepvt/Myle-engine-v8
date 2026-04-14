import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { playSnd01SineTap } = vi.hoisted(() => ({
  playSnd01SineTap: vi.fn(),
}))

vi.mock('@/lib/snd01-sine-ui-sound', () => ({
  playSnd01SineTap,
  shouldEnableSnd01SineUiSound: vi.fn(() => true),
}))

import { useSnd01SineUiSound } from '@/hooks/use-snd01-sine-ui-sound'

describe('useSnd01SineUiSound', () => {
  beforeEach(() => {
    playSnd01SineTap.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('playTap delegates to playSnd01SineTap', () => {
    const { result } = renderHook(() => useSnd01SineUiSound())
    result.current.playTap()
    expect(playSnd01SineTap).toHaveBeenCalledTimes(1)
  })
})
