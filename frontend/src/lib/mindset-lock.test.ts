import { describe, expect, it } from 'vitest'

import { getMindsetLockSendState } from '@/lib/mindset-lock'

describe('getMindsetLockSendState', () => {
  it('keeps handoff locked until the 5-minute timer completes', () => {
    expect(
      getMindsetLockSendState({
        mindsetReady: true,
        remainingSeconds: 12,
        preview: { leader_name: 'Leader One' },
      }),
    ).toEqual({
      unlocked: false,
      canSend: false,
      leaderName: 'Leader One',
    })
  })

  it('allows Day 1 handoff even when preview lookup is still missing', () => {
    expect(
      getMindsetLockSendState({
        mindsetReady: true,
        remainingSeconds: 0,
        preview: null,
      }),
    ).toEqual({
      unlocked: true,
      canSend: true,
      leaderName: 'Leader will be assigned on send',
    })
  })

  it('uses the resolved leader name when preview is available', () => {
    expect(
      getMindsetLockSendState({
        mindsetReady: true,
        remainingSeconds: 0,
        preview: { leader_name: '  Riya Leader  ' },
      }),
    ).toEqual({
      unlocked: true,
      canSend: true,
      leaderName: 'Riya Leader',
    })
  })
})
