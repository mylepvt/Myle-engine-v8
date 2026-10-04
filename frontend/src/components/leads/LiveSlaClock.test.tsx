import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LiveSlaClock } from './LiveSlaClock'

describe('LiveSlaClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T10:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('counts down on its own without the parent re-rendering', () => {
    const deadline = Date.now() + 2 * 3600_000 + 5_000
    render(<LiveSlaClock deadlineMs={deadline} leftLabel="left" overdueLabel="SLA over" />)
    expect(screen.getByText('02:00:05')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(screen.getByText('02:00:02')).toBeInTheDocument()
    expect(screen.getByText('left')).toBeInTheDocument()
  })

  it('shows the overdue label once the deadline passes', () => {
    render(<LiveSlaClock deadlineMs={Date.now() + 1_000} leftLabel="left" overdueLabel="call now" />)
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(screen.getByText('call now')).toBeInTheDocument()
  })
})
