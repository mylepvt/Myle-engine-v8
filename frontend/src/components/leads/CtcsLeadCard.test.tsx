import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { CtcsLeadCard } from '@/components/leads/CtcsLeadCard'
import type { LeadPublic } from '@/hooks/use-leads-query'

vi.mock('@/hooks/use-dashboard-shell-role', () => ({
  useDashboardShellRole: () => ({ role: 'team', serverRole: 'team' }),
}))

function renderCard(
  lead: LeadPublic,
  extra?: { showEnrollLink?: boolean; onCopyEnrollLink?: () => void },
) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CtcsLeadCard
          lead={lead}
          nowMs={Date.now()}
          isActive={false}
          patchBusy={false}
          actionBusy={false}
          onPatchStatus={() => {}}
          onPatchCallStatus={() => {}}
          onCall={() => {}}
          onFollowUp={() => {}}
          {...extra}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function makeLead(status: LeadPublic['status']): LeadPublic {
  return {
    id: 9,
    name: 'Test Prospect',
    status,
    created_at: '2026-04-24T12:00:00Z',
    created_by_user_id: 1,
    archived_at: null,
    deleted_at: null,
    in_pool: false,
    pool_price_cents: null,
    phone: '9999900001',
    email: null,
    city: 'Delhi',
    age: null,
    gender: null,
    ad_name: null,
    source: null,
    notes: null,
    owner_user_id: 1,
    assigned_to_user_id: 1,
    call_status: 'not_called',
    call_count: 0,
    last_called_at: null,
    whatsapp_sent_at: null,
    payment_status: null,
    payment_amount_cents: null,
    payment_proof_url: null,
    payment_proof_uploaded_at: null,
    mindset_started_at: null,
    mindset_completed_at: null,
    mindset_lock_state: null,
    mindset_completed_by_user_id: null,
    mindset_leader_user_id: null,
    crm_shadow_version: 0,
    day1_completed_at: null,
    day2_completed_at: null,
    day3_completed_at: null,
    day4_completed_at: null,
    day5_completed_at: null,
    d1_morning: false,
    d1_afternoon: false,
    d1_evening: false,
    d2_morning: false,
    d2_afternoon: false,
    d2_evening: false,
    d3_morning: false,
    d3_afternoon: false,
    d3_evening: false,
    d4_morning: false,
    d4_afternoon: false,
    d4_evening: false,
    d5_morning: false,
    d5_afternoon: false,
    d5_evening: false,
    d6_6pm: false,
    d6_8pm: false,
    no_response_attempt_count: 0,
    last_action_at: '2026-04-24T12:00:00Z',
    next_followup_at: null,
    heat_score: 0,
    heat_last_decayed_at: null,
    assigned_to_name: 'Agent One',
    owner_name: 'Agent One',
    created_by_name: 'Agent One',
    assigned_to_role: 'team',
  } as LeadPublic
}

describe('CtcsLeadCard proof gating', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the secure enrollment WhatsApp button for video_sent', () => {
    renderCard(makeLead('video_sent'), {
      showEnrollLink: true,
      onCopyEnrollLink: () => {},
    })

    expect(screen.getByTitle('Send secure enrollment link on WhatsApp')).toBeInTheDocument()
  })

  it('hides the secure enrollment WhatsApp button when showEnrollLink is not set', () => {
    renderCard(makeLead('video_sent'))

    expect(screen.queryByTitle('Send secure enrollment link on WhatsApp')).not.toBeInTheDocument()
  })
})
