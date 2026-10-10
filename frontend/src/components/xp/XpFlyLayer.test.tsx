import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { XpFlyLayer } from '@/components/xp/XpFlyLayer'
import { emitXpFly } from '@/lib/xp-fly'

describe('XpFlyLayer', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('floats "+N MP" up from the last tap, then clears itself', () => {
    vi.useFakeTimers()
    const { container } = render(<XpFlyLayer />)
    window.dispatchEvent(new MouseEvent('pointerdown', { clientX: 120, clientY: 500 }))

    act(() => emitXpFly({ amount: 8 }))
    const label = screen.getByText('+8 MP')
    expect(label.style.left).toBe('120px')
    expect(container.querySelectorAll('.xp-fly-icon')).toHaveLength(6)

    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(screen.queryByText('+8 MP')).toBeNull()
  })

  it('shows a flame burst with the streak when the call target is hit', () => {
    const { container } = render(<XpFlyLayer />)
    act(() => emitXpFly({ amount: 0, streak: 6 }))
    expect(screen.getByText('6-day streak!')).toBeTruthy()
    expect(container.querySelectorAll('.xp-fly-icon')).toHaveLength(10)
  })

  it('ignores zero/negative amounts', () => {
    render(<XpFlyLayer />)
    act(() => emitXpFly({ amount: 0 }))
    expect(screen.queryByText(/MP/)).toBeNull()
  })
})
