const { chromium, devices } = require('playwright')

const lead1 = {
  id: 1,
  name: 'Rahul Sharma',
  status: 'new_lead',
  created_by_user_id: 1,
  created_at: '2026-01-15T10:00:00.000Z',
  archived_at: null,
  deleted_at: null,
  in_pool: false,
  pool_price_cents: null,
  phone: '9876543210',
  email: null,
  city: 'Mumbai',
  age: null,
  gender: null,
  ad_name: null,
  source: null,
  notes: null,
  assigned_to_user_id: null,
  assigned_to_name: null,
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
  last_action_at: null,
  next_followup_at: null,
  heat_score: 0,
}

const lead2 = {
  ...lead1,
  id: 2,
  name: 'Simran Kaur',
  status: 'contacted',
  phone: '9898989898',
  city: 'Ludhiana',
}

async function installMocks(page) {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.endsWith('/') && url.pathname !== '/'
      ? url.pathname.slice(0, -1)
      : url.pathname
    const method = req.method()

    const json = (data) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

    if (path === '/api/v1/meta' && method === 'GET') {
      return json({
        name: 'myle-vl2',
        api_version: 1,
        environment: 'test',
        auth_dev_login_enabled: true,
        features: { intelligence: true },
      })
    }
    if (path === '/api/v1/auth/dev-login' && method === 'POST') return json({ ok: true })
    if (path === '/api/v1/auth/me' && method === 'GET') {
      return json({
        authenticated: true,
        role: 'admin',
        user_id: 1,
        fbo_id: 'fbo-001',
        username: 'Karan',
        email: 'karan@myle.local',
        display_name: 'Karan',
        auth_version: 1,
        training_status: 'completed',
        training_required: false,
        registration_status: 'approved',
        avatar_url: null,
      })
    }
    if (path === '/api/v1/workboard' && method === 'GET') {
      return json({
        columns: [
          { status: 'new_lead', total: 5, items: [lead1] },
          { status: 'contacted', total: 3, items: [lead2] },
          { status: 'converted', total: 2, items: [] },
          { status: 'lost', total: 1, items: [] },
        ],
        max_rows_fetched: 20,
        action_counts: { pending_calls: 2, videos_to_send: 1 },
      })
    }
    if (path.startsWith('/api/v1/follow-ups') && method === 'GET') {
      return json({ items: [], total: 4, limit: 50, offset: 0 })
    }
    if (path === '/api/v1/lead-pool' && method === 'GET') {
      return json({ items: [], total: 3, limit: 50, offset: 0 })
    }
    if (path === '/api/v1/lead-pool/defaults' && method === 'GET') {
      return json({ default_pool_price_cents: 19600 })
    }
    if (path === '/api/v1/gate-assistant' && method === 'GET') {
      return json({
        risk_level: 'green',
        progress_done: 4,
        progress_total: 5,
        next_action: 'Follow up warm leads',
        next_href: '/dashboard/work/follow-ups',
        checklist: [],
        open_follow_ups: 4,
        overdue_follow_ups: 1,
        active_pipeline_leads: 8,
        note: null,
      })
    }
    if (path.startsWith('/api/v1/team/reports') && method === 'GET') {
      return json({
        items: [],
        total: 0,
        note: null,
        date: '2026-01-15',
        timezone: 'Asia/Kolkata',
        live_summary: {
          leads_claimed_today: 12,
          calls_made_today: 28,
          enrolled_today: 5,
          payment_proofs_approved_today: 4,
          day1_total: 6,
          day2_total: 3,
          converted_total: 2,
        },
      })
    }
    if (path === '/api/v1/leads' && method === 'GET') {
      const offset = Number(url.searchParams.get('offset') ?? '0') || 0
      return json({
        items: offset === 0 ? [lead1, lead2] : [],
        total: 2,
        limit: 50,
        offset,
      })
    }
    if (/^\/api\/v1\/leads\/\d+$/.test(path) && (method === 'GET' || method === 'PATCH')) {
      return json(lead1)
    }
    if (path === '/api/v1/other/notice-board' && method === 'GET') {
      return json({ items: [], total: 0, note: null })
    }
    if (path === '/api/v1/xp/me' && method === 'GET') {
      return json({
        xp_total: 120,
        level: 'agent',
        level_label: 'Agent',
        daily_xp: 20,
        daily_cap: 100,
        streak: 3,
        next_level_xp: 300,
        progress_pct: 40,
        season_year: 2026,
        season_month: 4,
      })
    }
    if (path === '/api/v1/xp/leaderboard' && method === 'GET') {
      return json([
        { user_id: 1, name: 'Karan', level: 'agent', level_label: 'Agent', xp_total: 120 },
        { user_id: 2, name: 'Riya', level: 'pro', level_label: 'Pro', xp_total: 180 },
      ])
    }
    if (path === '/api/v1/xp/me/history' && method === 'GET') return json([])
    if (path === '/api/v1/xp/ping-login' && method === 'POST') return json({ ok: true })

    return json({})
  })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  await context.addInitScript(() => {
    localStorage.setItem(
      'myle-ui-feedback',
      JSON.stringify({ state: { theme: 'dark', satisfactionPoints: 0 }, version: 0 }),
    )
  })
  const page = await context.newPage()
  await installMocks(page)

  await page.goto('http://127.0.0.1:4174/login', { waitUntil: 'networkidle' })
  const continueBtn = page.getByRole('button', { name: /^continue$/i })
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click()
  }

  await page.waitForURL(/\/dashboard\/?$/, { timeout: 15_000 })
  await page.waitForTimeout(700)
  await page.screenshot({
    path: '/tmp/myle-ss-dashboard-home-black.png',
    fullPage: true,
  })

  await page.goto('http://127.0.0.1:4174/dashboard/work/leads', {
    waitUntil: 'networkidle',
  })
  await page.waitForTimeout(700)
  await page.screenshot({
    path: '/tmp/myle-ss-dashboard-leads-black.png',
    fullPage: true,
  })

  await browser.close()
  // eslint-disable-next-line no-console
  console.log('saved')
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
})
