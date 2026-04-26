import { describe, expect, it } from 'vitest'

import { pickPrimaryNextTransition, primaryActionLabel } from './lead-next-action'

describe('lead-next-action', () => {
  it('skips whatsapp_sent and sends enrollment video after invited', () => {
    expect(pickPrimaryNextTransition('invited', ['whatsapp_sent'])).toBe('video_sent')
    expect(primaryActionLabel('video_sent')).toContain('Send video')
  })
})
