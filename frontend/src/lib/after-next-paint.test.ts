import { afterEach, describe, expect, it, vi } from 'vitest'

import { afterNextPaint } from './after-next-paint'

describe('afterNextPaint', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs only after the next animation frame, not synchronously or inside it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'setTimeout'] })
    const fn = vi.fn()
    afterNextPaint(fn)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersToNextFrame()
    expect(fn).not.toHaveBeenCalled()
    vi.runOnlyPendingTimers()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
