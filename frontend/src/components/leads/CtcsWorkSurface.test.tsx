import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { CtcsWorkSurface } from '@/components/leads/CtcsWorkSurface'
import type { LeadPublic } from '@/hooks/use-leads-query'

const mockUseLeadsInfiniteQuery = vi.fn()
const mockUsePatchLeadMutation = vi.fn()
const mockUseLeadCtcsActionMutation = vi.fn()
const mockUseLeadCallLogMutation = vi.fn()

vi.mock('@/hooks/use-dashboard-shell-role', () => ({
  useDashboardShellRole: () => ({ role: 'team', serverRole: 'team' }),
}))

vi.mock('@/hooks/use-leads-query', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-leads-query')>('@/hooks/use-leads-query')
  return {
    ...actual,
    useLeadsInfiniteQuery: (...args: unknown[]) => mockUseLeadsInfiniteQuery(...args),
    usePatchLeadMutation: (...args: unknown[]) => mockUsePatchLeadMutation(...args),
    useLeadCtcsActionMutation: (...args: unknown[]) => mockUseLeadCtcsActionMutation(...args),
    useLeadCallLogMutation: (...args: unknown[]) => mockUseLeadCallLogMutation(...args),
  }
})

vi.mock('@/stores/call-to-close-store', () => ({
  useCallToCloseStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeLeadId: null,
      callMode: false,
      outcomeLeadId: null,
      setActiveLeadId: vi.fn(),
      toggleCallMode: vi.fn(),
      setOutcomeLeadId: vi.fn(),
    }),
}))

function makeLead(): LeadPublic {
  return {
    id: 91,
    name: 'Watching Prospect',
    status: 'contacted',
    created_at: '2026-05-05T10:00:00Z',
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
    d1_morning: false,
    d1_afternoon: false,
    d1_evening: false,
    d2_morning: false,
    d2_afternoon: false,
    d2_evening: false,
    no_response_attempt_count: 0,
    last_action_at: '2026-05-05T10:00:00Z',
    next_followup_at: null,
    heat_score: 0,
    heat_last_decayed_at: null,
    assigned_to_name: 'Agent One',
    owner_name: 'Agent One',
    created_by_name: 'Agent One',
    assigned_to_role: 'team',
  } as LeadPublic
}

function renderSurface() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CtcsWorkSurface filters={{ q: '', status: '' }} patchBusyLeadId={null} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CtcsWorkSurface', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('opens the live session slot picker when Sent Enroll Video is selected', async () => {
    mockUseLeadsInfiniteQuery.mockReturnValue({
      data: { pages: [{ items: [makeLead()], total: 1 }] },
      isPending: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    })
    mockUsePatchLeadMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    })
    mockUseLeadCtcsActionMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    })
    mockUseLeadCallLogMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            slots: [
              {
                hour: 11,
                label: '11:00 AM',
                state: 'live',
                live_starts_at: '2026-05-05T11:00:00+05:30',
                live_ends_at: '2026-05-05T11:49:00+05:30',
              },
              {
                hour: 12,
                label: '12:00 PM',
                state: 'upcoming',
                live_starts_at: '2026-05-05T12:00:00+05:30',
                live_ends_at: '2026-05-05T12:49:00+05:30',
              },
              {
                hour: 13,
                label: '1:00 PM',
                state: 'upcoming',
                live_starts_at: '2026-05-05T13:00:00+05:30',
                live_ends_at: '2026-05-05T13:49:00+05:30',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    renderSurface()

    fireEvent.change(screen.getByLabelText('Lead status'), { target: { value: 'video_sent' } })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Choose which time slot to send')).toBeInTheDocument()
    expect(await screen.findByText(/premiere\?slot=12/i)).toBeInTheDocument()
  })
})
