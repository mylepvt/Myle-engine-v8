/**
 * Capture Myle "Step by Step Guide" screenshots with mocked API data.
 *
 * WHAT IT DOES
 *   Builds nothing on its own — it serves the existing production build
 *   (`dist/`) via `vite preview`, intercepts every `/api/v1/**` call with
 *   realistic mock leads, drives the app with Playwright (mobile viewport),
 *   and saves PNGs into `frontend/guide-screenshots/`.
 *
 * HOW TO RUN (locally / CI where a browser can be downloaded)
 *   cd frontend
 *   npm install
 *   npx playwright install chromium      # one time
 *   VITE_API_URL= npm run build           # same-origin /api build
 *   node scripts/capture-guide-screenshots.cjs
 *
 * Screenshots map to the markers in docs/Team-Guide-WhatsApp-Format.txt.
 * NOTE: native <select> dropdowns (Call status / Lead status) are rendered by
 * the OS and cannot be screenshotted "open" by a browser — those steps show
 * the card with the dropdown pill visible instead.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { chromium, devices } = require('@playwright/test')

const HOST = '127.0.0.1'
const PORT = 4173
const BASE = `http://${HOST}:${PORT}`
const OUT_DIR = path.join(__dirname, '..', 'guide-screenshots')

const HOUR = 60 * 60 * 1000
const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString()

/** Full LeadPublic-ish shape; only fields the card reads really matter. */
function makeLead(overrides) {
  return {
    id: 1,
    name: 'Lead',
    status: 'new_lead',
    created_by_user_id: 1,
    created_at: iso(-1 * HOUR),
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
    is_reassigned: false,
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
    ...overrides,
  }
}

// Fresh, plenty of time left (green timer).
const leadFresh = makeLead({
  id: 1,
  name: 'Priya Verma',
  city: 'Delhi',
  phone: '9811122233',
  status: 'new_lead',
  call_status: 'not_called',
  created_at: iso(-1 * HOUR), // ~23h remaining
  assigned_to_user_id: 2,
  assigned_to_name: 'Karan',
})

// Interested, mid pipeline.
const leadInterested = makeLead({
  id: 2,
  name: 'Rahul Sharma',
  city: 'Mumbai',
  phone: '9876543210',
  status: 'day1',
  call_status: 'interested',
  created_at: iso(-6 * HOUR),
  last_action_at: iso(-2 * HOUR), // ~22h remaining
  assigned_to_user_id: 3,
  assigned_to_name: 'Riya',
})

// STALE / overdue — anchor >24h ago, no recent action (red "SLA" timer).
const leadStale = makeLead({
  id: 3,
  name: 'Amit Singh',
  city: 'Pune',
  phone: '9900112233',
  status: 'day2',
  call_status: 'follow_up',
  created_at: iso(-30 * HOUR),
  last_action_at: null, // overdue by ~6h
})

const leadArchived = makeLead({
  id: 4,
  name: 'Neha Gupta',
  city: 'Jaipur',
  phone: '9700011122',
  status: 'contacted',
  call_status: 'no_answer',
  archived_at: iso(-2 * HOUR),
  created_at: iso(-48 * HOUR),
})

const activeLeads = [leadStale, leadInterested, leadFresh] // stale first (priority sort)

const json = (data) => ({
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})

async function installMocks(page) {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const p = url.pathname.replace(/\/$/, '')
    const m = req.method()
    const send = (d) => route.fulfill(json(d))

    if (p === '/api/v1/meta' && m === 'GET')
      return send({ name: 'myle-vl2', api_version: 1, environment: 'test', auth_dev_login_enabled: true, features: { intelligence: true } })
    if (p === '/api/v1/auth/dev-login' && m === 'POST') return send({ ok: true })
    if (p === '/api/v1/auth/me' && m === 'GET')
      return send({
        authenticated: true, role: 'leader', user_id: 1, fbo_id: 'demo-leader',
        username: 'demo', email: 'demo@myle.local', display_name: 'Demo Leader',
        auth_version: 1, training_status: 'completed', training_required: false,
        registration_status: 'approved', avatar_url: null,
        compliance_level: null, compliance_summary: null,
      })
    if (p === '/api/v1/workboard' && m === 'GET')
      return send({
        columns: [
          { status: 'new_lead', total: 5, items: [leadFresh] },
          { status: 'contacted', total: 3, items: [leadInterested] },
          { status: 'converted', total: 2, items: [] },
        ],
        max_rows_fetched: 10,
        action_counts: { pending_calls: 3, videos_to_send: 1 },
      })
    if (p === '/api/v1/leads' && m === 'GET') {
      const archivedOnly = url.searchParams.get('archived_only') === 'true'
      const offset = Number(url.searchParams.get('offset') ?? '0') || 0
      if (archivedOnly)
        return send({ items: offset === 0 ? [leadArchived] : [], total: 1, limit: 50, offset })
      return send({ items: offset === 0 ? activeLeads : [], total: activeLeads.length, limit: 50, offset })
    }
    if (/^\/api\/v1\/leads\/\d+$/.test(p)) return send(leadInterested)
    if (p.startsWith('/api/v1/team/reports') && m === 'GET')
      return send({
        items: [], total: 0, note: null, date: '2026-01-15', timezone: 'Asia/Kolkata',
        live_summary: { leads_claimed_today: 12, calls_made_today: 28, enrolled_today: 5, payment_proofs_approved_today: 4, day1_total: 6, day2_total: 3, converted_total: 2 },
      })
    if (p === '/api/v1/gate-assistant' && m === 'GET')
      return send({ risk_level: 'green', progress_done: 4, progress_total: 5, next_action: 'Follow up warm leads', next_href: '/dashboard/work/follow-ups', checklist: [], open_follow_ups: 4, overdue_follow_ups: 1, active_pipeline_leads: 8, note: null })
    if (p === '/api/v1/xp/me' && m === 'GET')
      return send({ xp_total: 120, level: 'agent', level_label: 'Agent', daily_xp: 20, daily_cap: 100, streak: 3, next_level_xp: 300, progress_pct: 40, season_year: 2026, season_month: 4 })

    // Safe defaults
    if (m === 'GET') return send({ items: [], total: 0 })
    return send({ ok: true })
  })
}

async function shoot(page, name) {
  const file = path.join(OUT_DIR, name)
  await page.screenshot({ path: file, fullPage: true })
  console.log('  saved', path.relative(process.cwd(), file))
}

async function shootCard(page, leadName, name) {
  const card = page.locator('div', { hasText: leadName }).filter({ has: page.locator('h3') }).last()
  try {
    await card.scrollIntoViewIfNeeded({ timeout: 3000 })
    await page.waitForTimeout(300)
    await card.screenshot({ path: path.join(OUT_DIR, name) })
    console.log('  saved', name, `(card: ${leadName})`)
  } catch (e) {
    console.warn('  ! could not crop card for', leadName, '-', e.message)
  }
}

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const http = require('node:http')
      http.get(url, (res) => { res.resume(); resolve() }).on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('preview server did not start'))
        else setTimeout(tick, 500)
      })
    }
    tick()
  })
}

async function main() {
  if (!fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'))) {
    console.error('No dist/ build found. Run: VITE_API_URL= npm run build')
    process.exit(1)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  console.log('> starting vite preview ...')
  const server = spawn('npm', ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
  })

  try {
    await waitForServer(BASE)
    console.log('> preview up at', BASE)

    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ ...devices['iPhone 13'] })
    await context.addInitScript(() => {
      localStorage.setItem('myle-ui-feedback', JSON.stringify({ state: { theme: 'light', satisfactionPoints: 0 }, version: 0 }))
    })
    const page = await context.newPage()
    await installMocks(page)

    console.log('> capturing ...')
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    const cont = page.getByRole('button', { name: /^continue$/i })
    if (await cont.isVisible().catch(() => false)) await cont.click()
    await page.waitForURL(/\/dashboard\/?$/, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(800)
    await shoot(page, 'ss-00-dashboard-home.png')

    await page.goto(`${BASE}/dashboard/work/leads`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await shoot(page, 'ss-01-leads-list.png')                 // PART A step 1
    await shootCard(page, 'Priya Verma', 'ss-02-card-fresh.png')   // step 2-3 (Dial + green timer)
    await shootCard(page, 'Amit Singh', 'ss-06-card-overdue.png')  // PART B: red/overdue stale card
    await shootCard(page, 'Rahul Sharma', 'ss-07-card-actions.png')// Follow-up / WhatsApp / Reassign buttons

    await page.goto(`${BASE}/dashboard/work/archived`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await shoot(page, 'ss-08-archived.png')                   // PART B: archived + restore

    await browser.close()
    console.log('\nDONE — screenshots in', path.relative(process.cwd(), OUT_DIR))
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
