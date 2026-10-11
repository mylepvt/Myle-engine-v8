/**
 * Record the Myle "new member" tutorial video (Hinglish captions) with mocked API data.
 *
 * WHAT IT DOES
 *   Serves the existing production build (`dist/`) via `vite preview`,
 *   intercepts every `/api/v1/**` call with realistic mock data, logs in as a
 *   *team* member on a phone-sized viewport, walks through the screens a new
 *   member uses, overlays step captions + tap highlights, and records it all
 *   via the Chrome screencast; ffmpeg stitches the frames into an .mp4
 *   (H.264, WhatsApp-friendly).
 *
 * HOW TO RUN
 *   cd frontend
 *   npm install
 *   npx playwright install chromium      # one time (or set PW_CHROMIUM_PATH)
 *   VITE_API_URL= npm run build           # same-origin /api build
 *   npm run record:tutorial
 *
 * Output: frontend/tutorial-video/myle-new-member-tutorial.mp4 (needs ffmpeg)
 *
 * Caption text lives in the SCENES section below — edit it there.
 */
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { chromium, devices } = require('@playwright/test')

const HOST = '127.0.0.1'
const PORT = 4174
const BASE = `http://${HOST}:${PORT}`
const ROOT = path.join(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'tutorial-video')
const OUT_NAME = 'myle-new-member-tutorial'

const VIEW = { width: 390, height: 844 }
const VIDEO = { width: 780, height: 1688 }

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString()
const today = new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function makeLead(overrides) {
  return {
    id: 1, name: 'Lead', status: 'new_lead', created_by_user_id: 1,
    created_at: iso(-1 * HOUR), archived_at: null, deleted_at: null, in_pool: false,
    pool_price_cents: null, phone: '9876543210', email: null, city: 'Mumbai', age: null,
    gender: null, ad_name: null, source: null, notes: null, assigned_to_user_id: 1,
    assigned_to_name: 'Demo Member', is_reassigned: false, call_status: 'not_called',
    call_count: 0, last_called_at: null, whatsapp_sent_at: null, payment_status: null,
    payment_amount_cents: null, payment_proof_url: null, payment_proof_uploaded_at: null,
    day1_completed_at: null, day2_completed_at: null, day3_completed_at: null,
    d1_morning: false, d1_afternoon: false, d1_evening: false,
    d2_morning: false, d2_afternoon: false, d2_evening: false,
    no_response_attempt_count: 0, last_action_at: null, next_followup_at: null, heat_score: 0,
    ...overrides,
  }
}

const leadFresh = makeLead({
  id: 1, name: 'Priya Verma', city: 'Delhi', phone: '9811122233',
  status: 'new_lead', call_status: 'not_called', created_at: iso(-1 * HOUR),
})
const leadInterested = makeLead({
  id: 2, name: 'Rahul Sharma', city: 'Mumbai', phone: '9876543210',
  status: 'contacted', call_status: 'interested', call_count: 2,
  created_at: iso(-6 * HOUR), last_action_at: iso(-2 * HOUR),
})
const leadStale = makeLead({
  id: 3, name: 'Amit Singh', city: 'Pune', phone: '9900112233',
  status: 'contacted', call_status: 'follow_up', call_count: 1,
  created_at: iso(-30 * HOUR), last_action_at: null,
})
const leadArchived = makeLead({
  id: 4, name: 'Neha Gupta', city: 'Jaipur', phone: '9700011122',
  status: 'contacted', call_status: 'no_answer',
  archived_at: iso(-2 * HOUR), created_at: iso(-48 * HOUR),
})
const activeLeads = [leadStale, leadInterested, leadFresh]

const ME = {
  authenticated: true, role: 'team', user_id: 1, fbo_id: 'FBO-1024',
  username: 'demo', email: 'demo@myle.local', display_name: 'Demo Member',
  auth_version: 1, training_status: 'completed', training_required: false,
  registration_status: 'approved', avatar_url: null,
  compliance_level: null, compliance_summary: null,
}

const REWARDS = {
  eligible: true, points_today: 40, points_total: 320,
  level: { key: 'agent', label: 'Agent', mp: 320, next_label: 'Pro', next_at: 600, progress_pct: 53 },
  tickets: 2, max_tickets: 5, mp_per_ticket: 50, next_ticket_in: 10,
  pot_rupees: 2500, draw_at: iso(10 * HOUR), last_draw: null,
  recent: [
    { id: 1, step: 'call', label: 'Call logged', points: 5, lead_name: 'Rahul Sharma', at: iso(-2 * HOUR), revoked: false },
    { id: 2, step: 'report', label: 'Daily report', points: 20, lead_name: null, at: iso(-20 * HOUR), revoked: false },
  ],
  pipeline: { total_rupees: 12000, at_risk_rupees: 3000, active: 3, at_risk: 1, leads: [] },
  table: [
    { step: 'call', label: 'Call logged', points: 5 },
    { step: 'report', label: 'Daily report', points: 20 },
  ],
  streak: { days: 3, goal: 7, doubled: false },
  badges: [],
}

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

    if (p === '/api/v1/meta')
      return send({ name: 'myle-vl2', api_version: 1, environment: 'test', auth_dev_login_enabled: true, features: { intelligence: true } })
    if (p === '/api/v1/auth/dev-login') return send({ ok: true })
    if (p === '/api/v1/auth/me') return send(ME)
    if (p === '/api/v1/rewards/me') return send(REWARDS)
    if (p === '/api/v1/rewards/jackpot/wheel')
      return send({
        status: 'open', draw_date: today, draw_at: iso(10 * HOUR), pot_rupees: 2500, winner_user_id: null,
        entries: [
          { user_id: 5, name: 'Riya', tickets: 4 },
          { user_id: 6, name: 'Karan', tickets: 3 },
          { user_id: 1, name: 'Demo Member', tickets: 2 },
          { user_id: 7, name: 'Sahil', tickets: 1 },
        ],
      })
    if (p === '/api/v1/rewards/leaderboard')
      return send({
        period: 'today', total: 4, me: { rank: 3, user_id: 1, name: 'Demo Member', role: 'team', mp: 40 },
        items: [
          { rank: 1, user_id: 5, name: 'Riya', role: 'team', mp: 85 },
          { rank: 2, user_id: 6, name: 'Karan', role: 'team', mp: 60 },
          { rank: 3, user_id: 1, name: 'Demo Member', role: 'team', mp: 40 },
          { rank: 4, user_id: 7, name: 'Sahil', role: 'team', mp: 25 },
        ],
      })
    if (p === '/api/v1/xp/me')
      return send({ xp_total: 320, level: 'agent', level_label: 'Agent', daily_xp: 40, daily_cap: 100, streak: 3, next_level_xp: 600, progress_pct: 53, season_year: 2026, season_month: 10 })
    if (p === '/api/v1/wins')
      return send({
        items: [
          { id: 1, kind: 'enrollment', user_id: 5, name: 'Riya', text: 'Riya ne aaj 2 enrollment kiye', created_at: iso(-1 * HOUR), cheers: 6, cheered_by_me: false, is_mine: false },
          { id: 2, kind: 'streak', user_id: 6, name: 'Karan', text: 'Karan — 7 din ki streak', created_at: iso(-3 * HOUR), cheers: 3, cheered_by_me: true, is_mine: false },
        ],
      })
    if (p === '/api/v1/community/live')
      return send({
        online_now: 12, online_names: ['Riya', 'Karan', 'Sahil'],
        today: { calls: 148, followups: 36, members_worked: 22, leads_added: 41 },
        week: { calls: 910, followups: 210, members_worked: 40, leads_added: 260 },
        call_stars: [{ user_id: 5, name: 'Riya', calls: 31 }], star_calls: 31,
        feed: [{ kind: 'call', user_id: 5, text: 'Riya ne call kiya', at: iso(-5 * 60 * 1000) }],
        generated_at: iso(0),
      })
    if (p === '/api/v1/sales/dashboard')
      return send({ scope: 'self', sale_count: 0, total_case_credits: '0', total_amount_cents: 0, pending_count: 0, personal_commission_cents: 0, rows: [] })
    if (p === '/api/v1/execution/team-today-stats') return send({ claimed_today: 3, calls_today: 9, flp_min_billing_today: 0 })
    if (p === '/api/v1/execution/handed-off-leads') return send([])
    if (p === '/api/v1/gate-assistant')
      return send({ risk_level: 'green', progress_done: 3, progress_total: 5, next_action: 'Pending calls khatam karo', next_href: '/dashboard/work/leads', checklist: [], open_follow_ups: 2, overdue_follow_ups: 1, active_pipeline_leads: 3, note: null })
    if (p === '/api/v1/workboard')
      return send({
        columns: [
          { status: 'new_lead', total: 1, items: [leadFresh] },
          { status: 'contacted', total: 2, items: [leadInterested, leadStale] },
          { status: 'converted', total: 0, items: [] },
        ],
        max_rows_fetched: 10,
        action_counts: { pending_calls: 2, videos_to_send: 1 },
      })
    if (p === '/api/v1/leads' && m === 'GET') {
      const archivedOnly = url.searchParams.get('archived_only') === 'true'
      const deletedOnly = url.searchParams.get('deleted_only') === 'true'
      const offset = Number(url.searchParams.get('offset') ?? '0') || 0
      const rows = deletedOnly ? [] : archivedOnly ? [leadArchived] : activeLeads
      return send({ items: offset === 0 ? rows : [], total: rows.length, limit: 50, offset })
    }
    if (/^\/api\/v1\/leads\/\d+$/.test(p)) return send(leadInterested)
    if (p === '/api/v1/other/notice-board')
      return send({
        items: [
          { id: 1, message: 'Raat 11:59 se pehle daily report zaroor submit karo (+20 points).', created_by: 'Admin', pin: true, created_at: iso(-5 * HOUR), reactions: [{ emoji: '👍', count: 14, reacted_by_me: false }] },
          { id: 2, message: 'Kal subah 10 baje live training session hai — link Live session me milega.', created_by: 'Admin', pin: false, created_at: iso(-26 * HOUR), reactions: [] },
        ],
        total: 2, note: null,
      })
    if (p === '/api/v1/other/leaderboard')
      return send({
        items: [
          { title: '#1 Riya', detail: 'team · riya@myle.local · total points: 850' },
          { title: '#2 Karan', detail: 'team · karan@myle.local · total points: 610' },
          { title: '#3 Sahil', detail: 'team · sahil@myle.local · total points: 480' },
          { title: '#4 Demo Member', detail: 'team · demo@myle.local · total points: 320' },
          { title: '#5 Anjali', detail: 'team · anjali@myle.local · total points: 290' },
        ],
        total: 5, note: null,
      })
    if (p === '/api/v1/system/training')
      return send({
        videos: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
          day_number: d,
          title: ['Myle ko samjho', 'Product knowledge', 'Calling basics', 'Follow-up ka tareeka', 'Objection handling', 'Closing', 'Team building'][d - 1],
          has_video: true, youtube_url: null, audio_url: null, unlocked: d <= 3,
        })),
        progress: [
          { day_number: 1, completed: true, completed_at: iso(-2 * DAY) },
          { day_number: 2, completed: true, completed_at: iso(-1 * DAY) },
        ],
        notes: [],
      })
    if (p === '/api/v1/system/skills-training')
      return send({
        available: true, total_days: 3, completed_days: 1,
        days: [1, 2, 3].map((d) => ({ day_number: d, title: `Skill day ${d}`, has_video: true, youtube_url: null, unlocked: d <= 2, unlocks_on: null, completed: d === 1, completed_at: d === 1 ? iso(-DAY) : null })),
      })
    if (p === '/api/v1/wallet/me')
      return send({
        balance_cents: 150000, currency: 'INR',
        recent_entries: [
          { id: 2, user_id: 1, amount_cents: -50000, currency: 'INR', note: 'Lead pool claim (10 leads)', created_at: iso(-DAY) },
          { id: 1, user_id: 1, amount_cents: 200000, currency: 'INR', note: 'Recharge approved', created_at: iso(-3 * DAY) },
        ],
      })
    if (p === '/api/v1/wallet/ledger')
      return send({
        items: [
          { id: 2, user_id: 1, amount_cents: -50000, currency: 'INR', note: 'Lead pool claim (10 leads)', created_at: iso(-DAY) },
          { id: 1, user_id: 1, amount_cents: 200000, currency: 'INR', note: 'Recharge approved', created_at: iso(-3 * DAY) },
        ],
        total: 2, limit: 50, offset: 0,
      })
    if (p === '/api/v1/lead-pool/claim-gate') return send({ blocked: false, message: null, uncovered_leads: [] })
    if (p === '/api/v1/lead-pool/batch-preview')
      return send({ requested_count: 10, claim_count: 10, available_count: 120, total_price_cents: 50000 })
    if (p === '/api/v1/lead-bookings/me') return send({ today: null, tomorrow: null, max_count: 50 })

    // Safe defaults
    if (m === 'GET') return send({ items: [], total: 0, note: null })
    return send({ ok: true })
  })
}

// ---------------------------------------------------------------------------
// Overlay helpers (captions, title cards, tap highlights)
// ---------------------------------------------------------------------------

const OVERLAY_CSS = `
  #tut-root{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
  #tut-cap{position:absolute;left:12px;right:12px;bottom:104px;background:rgba(15,23,42,.92);color:#fff;border-radius:16px;padding:12px 14px 13px;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;transform:translateY(12px);transition:opacity .35s,transform .35s}
  #tut-cap.on{opacity:1;transform:none}
  #tut-cap .k{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#93c5fd;margin-bottom:4px}
  #tut-cap .t{font-size:17px;font-weight:700;line-height:1.25;margin-bottom:3px}
  #tut-cap .b{font-size:14.5px;line-height:1.4;color:#e2e8f0}
  #tut-cap.top{bottom:auto;top:76px}
  #tut-card{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:36px 30px;background:linear-gradient(160deg,#1e3a8a,#2563eb 55%,#0ea5e9);color:#fff;opacity:0;transition:opacity .45s}
  #tut-card.on{opacity:1}
  #tut-card .e{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#bfdbfe;margin-bottom:14px}
  #tut-card h1{font-size:32px;line-height:1.15;margin:0 0 14px;font-weight:800}
  #tut-card p{font-size:17px;line-height:1.45;margin:0;color:#e0f2fe}
  #tut-card ol{margin:18px 0 0;padding-left:22px;font-size:17px;line-height:1.5}
  #tut-card ol li{margin-bottom:10px}
  .tut-ring{position:absolute;border:3px solid #f59e0b;border-radius:14px;box-shadow:0 0 0 9999px rgba(15,23,42,.38),0 0 18px rgba(245,158,11,.8);transition:all .35s}
  .tut-tap{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(245,158,11,.55);animation:tutTap .7s ease-out forwards}
  @keyframes tutTap{from{transform:scale(.4);opacity:1}to{transform:scale(1.8);opacity:0}}
`

async function ensureOverlay(page) {
  await page.evaluate((css) => {
    if (document.getElementById('tut-root')) return
    const s = document.createElement('style')
    s.id = 'tut-style'
    s.textContent = css
    document.head.appendChild(s)
    const r = document.createElement('div')
    r.id = 'tut-root'
    r.innerHTML = '<div id="tut-cap"><span class="k"></span><div class="t"></div><div class="b"></div></div>'
    document.body.appendChild(r)
  }, OVERLAY_CSS)
}

const wait = (page, ms) => page.waitForTimeout(ms)

/** Reading time: ~1.1s base + 55ms per character, clamped. */
const readMs = (text) => Math.min(9000, Math.max(3200, 1100 + text.length * 55))

async function caption(page, step, title, body, { top = false, hold } = {}) {
  await ensureOverlay(page)
  await page.evaluate(({ step, title, body, top }) => {
    const c = document.getElementById('tut-cap')
    c.classList.remove('on')
    c.classList.toggle('top', top)
    c.querySelector('.k').textContent = step || ''
    c.querySelector('.t').textContent = title || ''
    c.querySelector('.b').textContent = body || ''
    requestAnimationFrame(() => c.classList.add('on'))
  }, { step, title, body, top })
  await wait(page, hold ?? readMs(`${title} ${body}`))
}

async function hideCaption(page) {
  await page.evaluate(() => document.getElementById('tut-cap')?.classList.remove('on')).catch(() => {})
  await wait(page, 350)
}

async function titleCard(page, { eyebrow, heading, text, list, hold }) {
  await ensureOverlay(page)
  await page.evaluate(({ eyebrow, heading, text, list }) => {
    const root = document.getElementById('tut-root')
    let card = document.getElementById('tut-card')
    if (!card) {
      card = document.createElement('div')
      card.id = 'tut-card'
      root.appendChild(card)
    }
    const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch])
    card.innerHTML =
      (eyebrow ? `<div class="e">${esc(eyebrow)}</div>` : '') +
      `<h1>${esc(heading)}</h1>` +
      (text ? `<p>${esc(text)}</p>` : '') +
      (list ? `<ol>${list.map((li) => `<li>${esc(li)}</li>`).join('')}</ol>` : '')
    requestAnimationFrame(() => card.classList.add('on'))
  }, { eyebrow, heading, text, list })
  await wait(page, hold ?? 4000)
}

async function hideTitleCard(page) {
  await page.evaluate(() => document.getElementById('tut-card')?.classList.remove('on')).catch(() => {})
  await wait(page, 500)
  await page.evaluate(() => document.getElementById('tut-card')?.remove()).catch(() => {})
}

/** Draw a spotlight ring around a locator (dims the rest of the screen). */
async function ring(page, locator, pad = 6) {
  await ensureOverlay(page)
  const el = locator.first()
  await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {})
  await wait(page, 250)
  const box = await el.boundingBox({ timeout: 1000 }).catch(() => null)
  if (!box) {
    console.log('  (highlight target not found:', String(locator), ')')
    return false
  }
  await page.evaluate(({ x, y, w, h }) => {
    const root = document.getElementById('tut-root')
    let r = root.querySelector('.tut-ring')
    if (!r) {
      r = document.createElement('div')
      r.className = 'tut-ring'
      root.prepend(r)
    }
    Object.assign(r.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` })
  }, { x: box.x - pad, y: box.y - pad, w: box.width + pad * 2, h: box.height + pad * 2 })
  return true
}

async function clearRing(page) {
  await page.evaluate(() => document.querySelector('#tut-root .tut-ring')?.remove()).catch(() => {})
}

/** Show a tap ripple on the element, then click it. */
async function tap(page, locator, { click = true } = {}) {
  const el = locator.first()
  await el.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {})
  const box = await el.boundingBox({ timeout: 4000 }).catch(() => null)
  if (box) {
    await ensureOverlay(page)
    await page.evaluate(({ x, y }) => {
      const t = document.createElement('div')
      t.className = 'tut-tap'
      Object.assign(t.style, { left: `${x}px`, top: `${y}px` })
      document.getElementById('tut-root').appendChild(t)
      setTimeout(() => t.remove(), 800)
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    await wait(page, 450)
  }
  if (click) await el.click()
}

async function smoothScroll(page, dy, ms = 1200) {
  await page.evaluate(({ dy, ms }) => new Promise((resolve) => {
    const start = window.scrollY
    const t0 = performance.now()
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      window.scrollTo(0, start + dy * e)
      if (k < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  }), { dy, ms })
}

async function go(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await wait(page, 700)
  await ensureOverlay(page)
}

/** First link to `route` that is actually on screen (the off-canvas drawer counts as "visible"). */
async function onScreenLink(page, route) {
  const links = page.locator(`a[href="${route}"]`)
  for (let i = 0; i < await links.count(); i += 1) {
    const box = await links.nth(i).boundingBox().catch(() => null)
    if (!box || box.width === 0) continue
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    if (cx > 0 && cx < VIEW.width && cy > 0 && cy < VIEW.height)
      return links.nth(i)
  }
  return null
}

/** Navigate through the bottom tab bar / menu when possible, else fall back to a URL. */
async function navTo(page, label, route) {
  const link = await onScreenLink(page, route)
  if (link) {
    await tap(page, link)
    await page.waitForLoadState('networkidle').catch(() => {})
    await wait(page, 800)
    await ensureOverlay(page)
    return
  }
  // open the ☰ sidebar and look again
  const more = page.locator('button[aria-label="Toggle sidebar"]').filter({ visible: true })
  if (await more.count()) {
    await tap(page, more)
    await wait(page, 700)
    const inMenu = await onScreenLink(page, route)
    if (inMenu) {
      await ring(page, inMenu)
      await wait(page, 900)
      await clearRing(page)
      await tap(page, inMenu)
      await page.waitForLoadState('networkidle').catch(() => {})
      await wait(page, 800)
      await ensureOverlay(page)
      return
    }
    await page.keyboard.press('Escape').catch(() => {})
  }
  console.log(`  (nav fallback via URL for ${label})`)
  await go(page, route)
}

/** The lead card (CtcsLeadCard root) whose title is `name`. */
const card = (page, name) =>
  page.locator('h3', { hasText: new RegExp(name, 'i') }).first().locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

async function record(page) {
  const TOTAL = 11
  const S = (n) => `Step ${n} / ${TOTAL}`

  // Intro --------------------------------------------------------------------
  await go(page, '/login')
  await titleCard(page, {
    eyebrow: 'Myle App · Naye member ke liye',
    heading: 'Myle App kaise use karein',
    text: '2-3 minute me poora app samjho — login se le kar leads, calls, follow-up, daily report aur wallet tak.',
    hold: 5500,
  })
  await hideTitleCard(page)

  // 1. Login -----------------------------------------------------------------
  await caption(page, S(1), 'Login karo', 'Leader se mila hua username / FBO ID aur password daalo, phir Continue / Login dabao.', { top: true })
  const cont = page.getByRole('button', { name: /^(continue|log ?in|sign ?in)$/i }).filter({ visible: true })
  if (await cont.count()) {
    await ring(page, cont)
    await wait(page, 1200)
    await clearRing(page)
    await tap(page, cont)
  }
  await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {})
  await wait(page, 600)

  // 2. Install + notifications gates ------------------------------------------
  await page.evaluate(() => localStorage.setItem('__tut_gates', 'install'))
  await go(page, '/dashboard')
  await caption(page, S(2), 'App ko Home Screen pe install karo', 'iPhone: Safari me Share → "Add to Home Screen". Android: Chrome menu (⋮) → "Install app". Phir app hamesha Home Screen se kholo.', { top: true, hold: 7500 })
  await page.evaluate(() => localStorage.setItem('__tut_gates', 'push'))
  await go(page, '/dashboard')
  await caption(page, S(2), 'Notifications ON karo', 'App notifications ke bina nahi chalega — "Allow" dabao. Galti se block ho gaya ho to phone Settings → Myle → Notifications → Allow.', { top: true, hold: 7500 })
  await page.evaluate(() => localStorage.removeItem('__tut_gates'))
  await go(page, '/dashboard')

  // 3. Home -------------------------------------------------------------------
  await caption(page, S(3), 'Home — aapka daily dashboard', 'Yahan aaj ke calls, claimed leads, points aur next kaam dikhta hai. Roz app khol ke pehle yahi dekho.')
  await smoothScroll(page, 520, 1800)
  await wait(page, 1200)
  await smoothScroll(page, 520, 1800)
  await caption(page, S(3), 'Points & rewards', 'Har call, follow-up aur daily report pe MYLE Points milte hain. Zyada points = leaderboard me upar + jackpot tickets.')
  await smoothScroll(page, -2000, 1200)
  const bottomBar = page.locator('nav').filter({ hasText: /calls/i }).filter({ visible: true }).last()
  if (await ring(page, bottomBar, 2)) {
    await caption(page, S(3), 'Neeche ka menu', 'Home · Calls (aapki leads) · More. Upar ☰ menu me baaki sab hai — Lead Pool, Training, Daily report, Wallet, Leaderboard.')
    await clearRing(page)
  }
  await hideCaption(page)

  // 4. Leads list -------------------------------------------------------------
  await navTo(page, 'Calls', '/dashboard/work/leads')
  await caption(page, S(4), 'Calls — aapki saari leads', 'Har lead ek card hai. Upar search aur filters (Today, Follow-ups, Hot…) se lead jaldi dhundo.', { top: true })
  const tabs = page.getByRole('button', { name: /^today$/i }).filter({ visible: true })
  if (await ring(page, tabs.locator('xpath=..'), 4)) await wait(page, 2200)
  await clearRing(page)

  const fresh = card(page, 'Priya Verma')
  await ring(page, fresh, 4)
  await caption(page, S(4), 'Lead card samjho', 'Upar naam + phone + city. Neeche 2 dropdown: ● Lead status (stage) aur 📞 Call status (call ka result).', { top: true })
  await ring(page, fresh.locator('a[aria-label="Dial and log call"]'), 6)
  await caption(page, S(4), '📞 Green Dial button', 'Isse call lagao — call apne aap LOG ho jaati hai. Har call isi button se karo!', { top: true })
  await ring(page, fresh.locator('a[aria-label="Open WhatsApp chat"]'), 6)
  await caption(page, S(4), '💬 WhatsApp button', 'Lead ki WhatsApp chat seedha khulti hai — video / message bhejne ke liye.', { top: true })
  await ring(page, fresh.locator('[aria-label="Call status"]'), 4)
  await caption(page, S(5), 'Call ke baad: Call status set karo', 'No Answer / Interested / Not Interested / Follow Up / Busy / Call Back — jo hua wahi chuno. Phone na uthe tab bhi set karo.', { top: true, hold: 7500 })
  await ring(page, fresh.locator('[aria-label="Lead status"]'), 4)
  await caption(page, S(5), 'Lead aage badhi? Lead status badlo', 'Jaise Interested → Day 1 → Day 2… Isse leader ko pata chalta hai lead kahan hai.', { top: true })
  await clearRing(page)

  // 6. Timer / stale ------------------------------------------------------------
  const stale = card(page, 'Amit Singh')
  await ring(page, stale, 4)
  await caption(page, S(6), '🕐 Timer — lead garam rakho', 'Har lead pe timer chalta hai. Red "overdue / SLA over" = lead thandi ho rahi hai. Turant call ya WhatsApp karo!', { top: true, hold: 7000 })
  await ring(page, stale.locator('button[aria-label="Schedule follow-up"]'), 6)
  await caption(page, S(6), '… Follow-up +24h', 'Abhi baat nahi ho paayi? 3-dots dabao — timer 24 ghante aage badh jaata hai.', { top: true })
  await clearRing(page)
  await caption(page, S(6), '⚠️ 24 ghante koi action nahi = Archive', 'Lead list se hat jaati hai. Ghabrao mat — archive delete nahi hai, wapas laa sakte ho.', { top: true })
  await hideCaption(page)

  // 7. Archived -----------------------------------------------------------------
  const viewArchived = page.getByRole('link', { name: /view archived leads/i }).filter({ visible: true })
  if (await viewArchived.count()) {
    await ring(page, viewArchived)
    await caption(page, S(7), 'View archived leads', 'Calls page ke sabse neeche yeh link hai.', { top: true, hold: 3200 })
    await clearRing(page)
    await tap(page, viewArchived)
    await page.waitForLoadState('networkidle').catch(() => {})
    await wait(page, 900)
  } else {
    await go(page, '/dashboard/work/archived')
  }
  const restore = page.getByRole('button', { name: /restore/i }).filter({ visible: true })
  if (await restore.count()) await ring(page, restore, 6)
  await caption(page, S(7), 'Restore karo', 'Archived lead dhundo → Restore dabao → lead wapas aapki main list me aa jaati hai.', { top: true })
  await clearRing(page)
  await hideCaption(page)

  // 8. Lead pool ----------------------------------------------------------------
  await navTo(page, 'Lead Pool', '/dashboard/work/lead-pool')
  await caption(page, S(8), 'Lead Pool — nayi leads lo', 'Yahan se wallet balance se leads claim / book karte ho. Pehle purani fresh leads pe kaam karo, tabhi nayi milti hain.', { top: true, hold: 7000 })
  await smoothScroll(page, 450, 1500)
  await wait(page, 1500)
  await hideCaption(page)

  // 9. Training -----------------------------------------------------------------
  await navTo(page, 'Training', '/dashboard/system/training')
  await caption(page, S(9), 'Training — roz ek din', 'Day 1 se shuru karo. Video poora dekho, phir day complete mark karo — agla day unlock hota hai.', { top: true, hold: 6500 })
  await smoothScroll(page, 400, 1500)
  await wait(page, 1200)
  await hideCaption(page)

  // 10. Daily report ------------------------------------------------------------
  await navTo(page, 'Daily report', '/dashboard/other/daily-report')
  await caption(page, S(10), 'Daily report — roz raat 11:59 se pehle', 'Aaj ke numbers bharo: total calling, calls picked, wrong numbers… Pehli baar save karne pe +20 points!', { top: true, hold: 6500 })
  const inputs = page.locator('input[type="number"]').filter({ visible: true })
  const demo = ['25', '14', '2', '3']
  for (let i = 0; i < Math.min(demo.length, await inputs.count()); i += 1) {
    const inp = inputs.nth(i)
    await ring(page, inp, 4)
    await inp.click()
    await inp.selectText()
    await inp.pressSequentially(demo[i], { delay: 140 })
    await wait(page, 350)
  }
  await clearRing(page)
  const submit = page.getByRole('button', { name: /submit|save/i }).filter({ visible: true })
  if (await submit.count()) {
    await ring(page, submit, 6)
    await caption(page, S(10), 'Submit dabao', 'Baad me numbers update bhi kar sakte ho — points double count nahi hote.', { top: true, hold: 4000 })
    await clearRing(page)
  }
  await hideCaption(page)

  // 11. Wallet + leaderboard ------------------------------------------------------
  await navTo(page, 'Wallet', '/dashboard/finance/wallet')
  await caption(page, S(11), 'Wallet', 'Aapka balance aur har transaction (recharge, lead claim). Lead lene ke liye balance hona chahiye — "Recharge request" se top-up karo.', { top: true, hold: 7000 })
  await navTo(page, 'Leaderboard', '/dashboard/other/leaderboard')
  await caption(page, S(11), 'Leaderboard', 'Team me aapki rank. Roz calls + follow-up + report = upar chadho!', { top: true })
  await hideCaption(page)

  // Outro -----------------------------------------------------------------------
  await titleCard(page, {
    eyebrow: 'Yaad rakho',
    heading: '3 sabse important baatein',
    list: [
      'Har call Dial button se karo + Call status set karo.',
      'Lead garam rakho — timer khatam hone se pehle call / WhatsApp / Follow-up +24h.',
      'Daily report raat 11:59 se pehle submit karo (+20 points).',
    ],
    hold: 8000,
  })
  await titleCard(page, {
    eyebrow: 'All the best!',
    heading: 'Koi doubt? Leader se pucho 🙂',
    text: 'Confusion me lead thandi mat hone do. Welcome to Myle!',
    hold: 4000,
  })
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      require('node:http').get(url, (res) => { res.resume(); resolve() }).on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('preview server did not start'))
        else setTimeout(tick, 500)
      })
    }
    tick()
  })
}

/**
 * Records the page via the CDP screencast (full device-pixel resolution —
 * Playwright's recordVideo only downscales, so a 390px viewport would come
 * out tiny). Frames arrive only when the screen changes; each frame's
 * on-screen duration comes from its timestamp.
 */
async function startScreencast(page, frameDir) {
  fs.mkdirSync(frameDir, { recursive: true })
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(frameDir, `f${String(frames.length).padStart(6, '0')}.jpg`)
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, t: metadata.timestamp })
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: VIDEO.width, maxHeight: VIDEO.height, everyNthFrame: 1 })
  return async () => {
    await cdp.send('Page.stopScreencast').catch(() => {})
    return { frames, endT: Date.now() / 1000 }
  }
}

function framesToMp4({ frames, endT }, frameDir, mp4) {
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    console.error('ffmpeg is required to assemble the video (apt install ffmpeg / brew install ffmpeg)')
    return false
  }
  const lines = ['ffconcat version 1.0']
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : endT
    lines.push(`file '${path.basename(f.file)}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`)
  })
  lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`) // concat demuxer needs the last file twice
  const list = path.join(frameDir, 'list.ffconcat')
  fs.writeFileSync(list, lines.join('\n'))
  const r = spawnSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', `fps=30,scale=${VIDEO.width}:${VIDEO.height}:force_original_aspect_ratio=decrease,pad=${VIDEO.width}:${VIDEO.height}:(ow-iw)/2:(oh-ih)/2:color=white`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', mp4,
  ], { stdio: 'inherit' })
  return r.status === 0
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.error('No dist/ build found. Run: VITE_API_URL= npm run build')
    process.exit(1)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const frameDir = path.join(OUT_DIR, '.frames')
  fs.rmSync(frameDir, { recursive: true, force: true })

  console.log('> starting vite preview ...')
  const server = spawn('npm', ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  })

  try {
    await waitForServer(BASE)
    console.log('> preview up at', BASE)

    const browser = await chromium.launch({
      headless: true,
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    })
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: VIEW,
      deviceScaleFactor: VIDEO.width / VIEW.width,
      serviceWorkers: 'block', // SW would bypass the API mocks
    })
    await context.addInitScript(() => {
      localStorage.setItem('myle-ui-feedback', JSON.stringify({ state: { theme: 'light', satisfactionPoints: 0 }, version: 0 }))
      // Pretend the PWA is installed and push is unavailable so the install /
      // notification gates step aside — except when a scene wants to show them.
      const gates = localStorage.getItem('__tut_gates')
      if (gates !== 'install') Object.defineProperty(navigator, 'standalone', { get: () => true })
      if (gates !== 'push' && gates !== 'install') {
        try { delete window.PushManager } catch { /* ignore */ }
      }
    })
    const page = await context.newPage()
    page.on('console', (m) => {
      if (m.type() === 'error' && !/WebSocket/.test(m.text())) console.log('  [page error]', m.text().split('\n')[0])
    })
    await installMocks(page)

    console.log('> recording ...')
    const stop = await startScreencast(page, frameDir)
    await record(page)
    const shot = await stop()
    await browser.close()

    console.log(`> encoding ${shot.frames.length} frames ...`)
    const mp4 = path.join(OUT_DIR, `${OUT_NAME}.mp4`)
    if (!framesToMp4(shot, frameDir, mp4)) process.exitCode = 1
    else console.log('  saved', path.relative(process.cwd(), mp4))
    if (!process.env.TUT_KEEP_FRAMES) fs.rmSync(frameDir, { recursive: true, force: true })
    console.log('\nDONE')
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
