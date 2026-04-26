import { describe, expect, it } from 'vitest'

import type { LeadPublic } from '@/hooks/use-leads-query'

import { applyCtcsOptimisticToLead } from './ctcs-optimistic'

const baseLead = (): LeadPublic =>
  ({
    id: 1,
    name: 'A',
    status: 'new_lead',
    created_by_user_id: 1,
    created_at: new Date().toISOString(),
    archived_at: null,
    deleted_at: null,
    in_pool: false,
    pool_price_cents: null,
    phone: '1',
    email: null,
    city: null,
    age: null,
    gender: null,
    ad_name: null,
    source: null,
    notes: null,
    assigned_to_user_id: 1,
    call_status: 'not_called',
    call_count: 0,
    last_called_at: null,
    whatsapp_sent_at: null,
    payment_status: null,
    payment_amount_cents: null,
    payment_proof_url: null,
    payment_proof_uploaded_at: null,
    day1_completed_at: null,
    day2_completed_at: null,
    day3_completed_at: null,
    d1_morning: false,
    d1_afternoon: false,
    d1_evening: false,
    d2_morning: false,
    d2_afternoon: false,
    d2_evening: false,
    no_response_attempt_count: 0,
    heat_score: 0,
  }) as LeadPublic

describe('applyCtcsOptimisticToLead', () => {
  it('not_picked applies contacted heat net', () => {
    const out = applyCtcsOptimisticToLead(baseLead(), 'not_picked')
    expect(out.status).toBe('contacted')
    expect(out.heat_score).toBe(5)
    expect(out.call_status).toBe('not_called')
  })

  it('interested does not auto-change call status', () => {
    const out = applyCtcsOptimisticToLead(baseLead(), 'interested')
    expect(out.status).toBe('video_sent')
    expect(out.call_status).toBe('not_called')
  })

  it('call_later uses custom followupAt', () => {
    const when = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    const out = applyCtcsOptimisticToLead(baseLead(), 'call_later', { followupAt: when })
    expect(out.next_followup_at).toBe(when)
  })

  it('call_later preserves stage timer when status is unchanged', () => {
    const lead = { ...baseLead(), status: 'contacted', last_action_at: '2026-04-20T00:00:00.000Z' } as LeadPublic
    const out = applyCtcsOptimisticToLead(lead, 'call_later')
    expect(out.last_action_at).toBe('2026-04-20T00:00:00.000Z')
  })

  it('paid respects paidStatus for team', () => {
    const out = applyCtcsOptimisticToLead(baseLead(), 'paid', { paidStatus: 'paid' })
    expect(out.status).toBe('paid')
  })
})
