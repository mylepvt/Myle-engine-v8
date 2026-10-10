import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { chanceLabel, spinRotation, wheelSlices } from '@/lib/rewards'
import { JackpotWheel } from './JackpotWheel'

const wheel = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/hooks/use-rewards-query', () => ({ useJackpotWheelQuery: () => ({ data: wheel.data }) }))
const toast = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))
const sound = vi.hoisted(() => ({ ready: true, play: vi.fn() }))
vi.mock('@/lib/app-sounds', () => ({
  audioReady: () => sound.ready,
  playAppSound: (...args: unknown[]) => sound.play(...args),
}))
const FAKE: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
}

const entries = [
  { user_id: 1, name: 'Priya', tickets: 6 },
  { user_id: 2, name: 'Rahul', tickets: 3 },
  { user_id: 3, name: 'Neha', tickets: 1 },
]

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  window.localStorage.clear()
  sound.ready = true
  sound.play.mockClear()
})

describe('JackpotWheel', () => {
  it('before the draw: who is in and my chance', () => {
    wheel.data = { status: 'open', draw_date: '2026-10-06', draw_at: '', pot_rupees: 150, entries, winner_user_id: null }
    render(<JackpotWheel myTickets={3} />)
    expect(screen.getByText("Tonight's wheel · 3 in · ₹150")).toBeInTheDocument()
    expect(screen.getByText('your chance 30%')).toBeInTheDocument()
    expect(screen.getByText('Priya')).toBeInTheDocument()
  })

  it('after the draw: spins for 30 s with ticks, then lands on the server-picked winner', () => {
    vi.useFakeTimers(FAKE)
    wheel.data = { status: 'drawn', draw_date: '2026-10-06', draw_at: '', pot_rupees: 300, entries, winner_user_id: 2 }
    render(<JackpotWheel myTickets={0} />)
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByText(/Spinning… \d+s/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.queryByText('Rahul won ₹300')).not.toBeInTheDocument() // still spinning at 20 s
    act(() => vi.advanceTimersByTime(11_000))
    expect(screen.getByText('Rahul won ₹300')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Rahul won ₹300!')
    const kinds = sound.play.mock.calls.map((c) => c[0])
    expect(kinds.filter((k) => k === 'wheel_tick').length).toBeGreaterThan(50)
    expect(kinds.at(-1)).toBe('jackpot')
    expect(window.localStorage.getItem('myle.rewards.wheelSeen')).toBe('2026-10-06')
  })

  it('without unlocked audio it waits for a tap, and Skip jumps to the result', () => {
    vi.useFakeTimers(FAKE)
    sound.ready = false
    wheel.data = { status: 'drawn', draw_date: '2026-10-07', draw_at: '', pot_rupees: 150, entries, winner_user_id: 1 }
    render(<JackpotWheel myTickets={0} />)
    act(() => vi.advanceTimersByTime(500))
    fireEvent.click(screen.getByText("Watch tonight's draw"))
    act(() => vi.advanceTimersByTime(2_000))
    fireEvent.click(screen.getByText('Skip'))
    expect(screen.getByText('Priya won ₹150')).toBeInTheDocument()
    expect(sound.play).toHaveBeenLastCalledWith('jackpot')
  })

  it('already watched: shows the result without spinning again', () => {
    window.localStorage.setItem('myle.rewards.wheelSeen', '2026-10-06')
    wheel.data = { status: 'drawn', draw_date: '2026-10-06', draw_at: '', pot_rupees: 300, entries, winner_user_id: 2 }
    render(<JackpotWheel myTickets={0} />)
    expect(screen.getByText('Rahul won ₹300')).toBeInTheDocument()
    expect(screen.getByText('Watch again')).toBeInTheDocument()
  })
})

describe('wheel maths', () => {
  it('slices are sized by tickets and the pointer lands on the winner', () => {
    const s = wheelSlices(entries, 2)
    expect(s.map((x) => [x.label, Math.round(x.start), Math.round(x.end)])).toEqual([
      ['Priya', 0, 216], ['Rahul', 216, 324], ['Neha', 324, 360],
    ])
    const rot = spinRotation(s, 2)
    expect(((270 + rot) % 360 + 360) % 360).toBeCloseTo(0) // Rahul's centre (270°) ends at the top
  })

  it('small entries merge into "others" but the winner keeps a slice', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ user_id: i + 1, name: `M${i + 1}`, tickets: 20 - i }))
    const s = wheelSlices(many, 20)
    expect(s).toHaveLength(13)
    expect(s.some((x) => x.userId === 20)).toBe(true)
    expect(s.at(-1)?.label).toBe('+8 more')
  })

  it('chance label', () => {
    expect(chanceLabel(3, 10)).toBe('30%')
    expect(chanceLabel(1, 40)).toBe('2.5%')
    expect(chanceLabel(0, 10)).toBeNull()
  })
})
