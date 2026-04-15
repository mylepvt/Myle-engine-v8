import { describe, expect, it, vi } from 'vitest'

import { formatCountdown, timerRemainingMs } from '@/lib/ctcs-timer'

describe('ctcs-timer', () => {
  it('counts down 24h from last_action_at', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'))
    const last = '2026-04-15T00:00:00.000Z'
    const ms = timerRemainingMs(last, '2026-01-01T00:00:00.000Z')
    expect(ms).toBe(12 * 60 * 60 * 1000)
    expect(formatCountdown(ms)).toMatch(/12h/)
    vi.useRealTimers()
  })

  it('falls back to created_at when last_action missing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-15T13:00:00.000Z'))
    const created = '2026-04-14T13:00:00.000Z'
    const ms = timerRemainingMs(null, created)
    expect(ms).toBe(0)
    vi.useRealTimers()
  })
})
