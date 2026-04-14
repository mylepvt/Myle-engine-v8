import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetScrollGateForTests,
  flushRealtimeTopicsOrDefer,
  notifyDashboardMainScrolled,
} from '@/lib/main-scroll-gate'

describe('main-scroll-gate', () => {
  beforeEach(() => {
    __resetScrollGateForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    __resetScrollGateForTests()
  })

  it('invokes flush immediately when main scroll is not hot', () => {
    const flush = vi.fn()
    flushRealtimeTopicsOrDefer(['leads'], flush)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(['leads'])
  })

  it('defers flush while scroll is hot then applies after cool-down', () => {
    const flush = vi.fn()
    notifyDashboardMainScrolled()
    flushRealtimeTopicsOrDefer(['team'], flush)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(flush).toHaveBeenCalledTimes(1)
    expect(flush).toHaveBeenCalledWith(['team'])
  })

  it('merges multiple deferred batches on flush', () => {
    const flush = vi.fn()
    notifyDashboardMainScrolled()
    flushRealtimeTopicsOrDefer(['leads'], flush)
    flushRealtimeTopicsOrDefer(['team', 'leads'], flush)
    vi.advanceTimersByTime(250)
    expect(flush).toHaveBeenCalledWith(['leads', 'team'])
  })
})
