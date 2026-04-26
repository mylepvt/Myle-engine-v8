import type { Page, Route } from '@playwright/test'

/**
 * Minimal `LeadPublic` for list + PATCH responses (E2E mocks).
 * Status values must match `LEAD_STATUS_OPTIONS` in the app.
 */
function mockLead(overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    id: 1,
    name: 'E2E Lead',
    status: 'new_lead',
    created_by_user_id: 1,
    created_at: '2026-01-15T10:00:00.000Z',
    archived_at: null,
    deleted_at: null,
    in_pool: false,
    pool_price_cents: null,
    phone: '9876543210',
    email: null,
    city: null,
    age: null,
    gender: null,
    ad_name: null,
    source: null,
    notes: null,
    assigned_to_user_id: null,
    call_status: null,
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
    last_action_at: null,
    next_followup_at: null,
    heat_score: 0,
  }
  return { ...base, ...overrides }
}

const json = (data: unknown) => ({
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})

async function fulfill(route: Route, data: unknown) {
  await route.fulfill(json(data))
}

/** Same-origin API mocks for `VITE_API_URL=` builds (fetch → `/api/v1/...` on preview host). */
export async function installE2eApiMocks(page: Page) {
  let leadState = mockLead()

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/\/$/, '')
    const method = req.method()

    if (path === '/api/v1/meta' && method === 'GET') {
      await fulfill(route, {
        name: 'myle-vl2',
        api_version: 1,
        environment: 'test',
        auth_dev_login_enabled: true,
        features: { intelligence: true },
      })
      return
    }

    if (path === '/api/v1/auth/dev-login' && method === 'POST') {
      await fulfill(route, {})
      return
    }

    if (path === '/api/v1/auth/me' && method === 'GET') {
      await fulfill(route, {
        authenticated: true,
        role: 'leader',
        user_id: 1,
        fbo_id: 'e2e-leader',
        username: 'e2e',
        email: 'e2e@myle.local',
        display_name: 'E2E',
        auth_version: 1,
        training_status: 'completed',
        training_required: false,
        registration_status: 'approved',
        avatar_url: null,
        compliance_level: null,
        compliance_summary: null,
      })
      return
    }

    if (path === '/api/v1/workboard' && method === 'GET') {
      await fulfill(route, {
        columns: [],
        max_rows_fetched: 0,
        action_counts: { pending_calls: 0, videos_to_send: 0 },
      })
      return
    }

    if (path.startsWith('/api/v1/follow-ups') && method === 'GET') {
      await fulfill(route, { items: [], total: 0, limit: 50, offset: 0 })
      return
    }

    if (path === '/api/v1/lead-pool' && method === 'GET') {
      await fulfill(route, { items: [], total: 0, limit: 50, offset: 0 })
      return
    }

    if (path === '/api/v1/lead-pool/defaults' && method === 'GET') {
      await fulfill(route, { default_pool_price_cents: 19600 })
      return
    }

    if (path === '/api/v1/gate-assistant' && method === 'GET') {
      await fulfill(route, {
        risk_level: 'green',
        progress_done: 1,
        progress_total: 1,
        next_action: 'All set',
        next_href: null,
        checklist: [],
        open_follow_ups: 0,
        overdue_follow_ups: 0,
        active_pipeline_leads: 0,
        note: null,
      })
      return
    }

    if (path === '/api/v1/team/enrollment-requests' && method === 'GET') {
      await fulfill(route, { items: [], total: 0 })
      return
    }

    if (path.startsWith('/api/v1/team/reports') && method === 'GET') {
      await fulfill(route, {
        items: [],
        total: 0,
        note: null,
        date: '2026-01-15',
        timezone: 'Asia/Kolkata',
        live_summary: {
          leads_claimed_today: 0,
          calls_made_today: 0,
          enrolled_today: 0,
          payment_proofs_approved_today: 0,
          day1_total: 0,
          day2_total: 0,
          converted_total: 0,
        },
      })
      return
    }

    if (path === '/api/v1/leads' && method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? '0') || 0
      await fulfill(route, {
        items: offset === 0 ? [leadState] : [],
        total: 1,
        limit: 50,
        offset,
      })
      return
    }

    const leadIdMatch = path.match(/^\/api\/v1\/leads\/(\d+)$/)
    if (leadIdMatch && method === 'PATCH') {
      let body: Record<string, unknown> = {}
      try {
        const raw = req.postData()
        if (raw) body = JSON.parse(raw) as Record<string, unknown>
      } catch {
        /* ignore */
      }
      leadState = mockLead({ ...leadState, ...body })
      await fulfill(route, leadState)
      return
    }

    if (leadIdMatch && method === 'GET') {
      await fulfill(route, leadState)
      return
    }

    await route.fulfill({ status: 404, body: 'e2e mock: unhandled path' })
  })
}
