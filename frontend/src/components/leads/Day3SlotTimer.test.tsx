import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LeadPublic } from '@/hooks/use-leads-query'
import { Day3SlotTimer, deadlineLabel, quickPicks, remainingParts } from './Day3SlotTimer'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const pm = () => ({ mutate: vi.fn() }) as unknown as Parameters<typeof Day3SlotTimer>[0]['pm']

describe('Day3SlotTimer helpers', () => {
  it('quick picks skip times already gone today', () => {
    const at5pm = new Date(2026, 9, 4, 17, 0)
    expect(quickPicks(at5pm).map((p) => p.label)).toEqual(['In 2 hours', '6 PM today', '7 PM today', 'Tomorrow 11 AM'])
    const at8pm = new Date(2026, 9, 4, 20, 0)
    expect(quickPicks(at8pm).map((p) => p.label)).toEqual(['In 2 hours', 'Tomorrow 11 AM'])
  })

  it('labels today / tomorrow and counts down', () => {
    const now = new Date(2026, 9, 4, 16, 30)
    expect(deadlineLabel(new Date(2026, 9, 4, 19, 0), now)).toMatch(/7:00\s?pm, today/i)
    expect(deadlineLabel(new Date(2026, 9, 5, 11, 0), now)).toMatch(/11:00\s?am, tomorrow/i)
    expect(remainingParts(new Date(2026, 9, 4, 19, 0), now)).toEqual({ done: false, h: 2, m: 30, s: 0 })
    expect(remainingParts(new Date(2026, 9, 4, 16, 0), now).done).toBe(true)
  })
})

describe('Day3SlotTimer', () => {
  it('sets a quick time with one tap', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 4, 16, 0))
    const p = pm()
    render(<Day3SlotTimer lead={{ id: 9, name: 'Rohit' } as LeadPublic} pm={p} leadPatchBusy={false} />)
    fireEvent.click(screen.getByRole('button', { name: '7 PM today' }))
    const call = (p.mutate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.id).toBe(9)
    expect(new Date(call.body.slot_deadline_at).getHours()).toBe(19)
  })

  it('shows the live countdown and Share image once a time is set', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 4, 16, 30))
    const lead = { id: 9, name: 'Rohit', slot_deadline_at: new Date(2026, 9, 4, 19, 0).toISOString() } as LeadPublic
    render(<Day3SlotTimer lead={lead} pm={pm()} leadPatchBusy={false} />)
    expect(screen.getByLabelText('Time left').textContent).toBe('02:30:00')
    expect(screen.getByRole('button', { name: /Share image/ })).toBeTruthy()
  })

  it("says Time's up after the deadline", () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 4, 20, 0))
    const lead = { id: 9, name: 'Rohit', slot_deadline_at: new Date(2026, 9, 4, 19, 0).toISOString() } as LeadPublic
    render(<Day3SlotTimer lead={lead} pm={pm()} leadPatchBusy={false} />)
    expect(screen.getByText("Time's up")).toBeTruthy()
  })
})
