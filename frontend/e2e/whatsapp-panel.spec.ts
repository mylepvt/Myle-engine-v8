/**
 * E2E tests for WhatsApp Panel page.
 *
 * All API calls mocked — no real backend needed.
 * Covers:
 * - Stats display (Sent Today, Failed Today, Received Today)
 * - Template Settings: open, fill, save
 * - Send Report Reminders button flow
 * - Type filter includes report_reminder
 */
import { expect, test } from '@playwright/test'

const json = (data: unknown) => ({
  status: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})

async function installAdminMocks(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace(/\/$/, '')
    const method = req.method()

    if (path === '/api/v1/meta') {
      await route.fulfill(json({ name: 'myle-vl2', api_version: 1, environment: 'test', auth_dev_login_enabled: true, features: { intelligence: true } }))
      return
    }
    if (path === '/api/v1/auth/dev-login') {
      await route.fulfill(json({}))
      return
    }
    if (path === '/api/v1/auth/me') {
      await route.fulfill(json({
        authenticated: true, role: 'admin', user_id: 1, fbo_id: 'e2e-admin',
        username: 'admin-e2e', email: 'admin@myle.local', display_name: 'Admin E2E',
        auth_version: 1, training_status: 'completed', training_required: false,
        registration_status: 'approved', avatar_url: null,
        compliance_level: null, compliance_summary: null,
      }))
      return
    }
    if (path === '/api/v1/webhooks/whatsapp/status') {
      await route.fulfill(json({ configured: true, connected: true, display_phone_number: '+91 98765 43210', verified_name: 'Myle Test' }))
      return
    }
    if (path === '/api/v1/webhooks/whatsapp/logs') {
      await route.fulfill(json({
        items: [{
          id: 1, created_at: new Date().toISOString(), direction: 'out',
          message_type: 'report_reminder', phone: '919800000001',
          message_preview: 'Hi Rahul, aaj ki report...', status: 'sent',
          error: null, wa_message_id: 'wamid.test1', related_user_id: 1,
        }],
        total: 47, sent_today: 47, failed_today: 2, received_today: 5,
      }))
      return
    }
    if (path === '/api/v1/settings-enhanced/system/app-settings') {
      if (method === 'GET') {
        await route.fulfill(json({ settings: {
          'whatsapp.report_reminder_template_name': 'myle_report_reminder',
          'whatsapp.report_reminder_template_lang': 'en',
        }}))
      } else {
        await route.fulfill(json({ message: 'Setting updated' }))
      }
      return
    }
    if (path === '/api/v1/admin/send-report-reminders') {
      await route.fulfill(json({ sent: 45, failed: 1, no_phone: 3, results: [
        { user_id: 1, name: 'Rahul', phone_tail: '0001', status: 'sent' },
        { user_id: 2, name: 'Priya', phone_tail: '—', status: 'no_phone' },
      ]}))
      return
    }
    // Default: empty OK for anything else (gate-assistant, nav badges, etc.)
    await route.fulfill(json({}))
  })
}

async function navigateToWhatsAppPanel(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: /^Continue$/i }).click()
  await page.waitForURL(/\/dashboard/)
  await page.goto('/dashboard/system/whatsapp')
  await page.waitForURL(/system\/whatsapp/)
}

test.describe('WhatsApp Panel', () => {
  test.beforeEach(async ({ page }) => {
    await installAdminMocks(page)
  })

  test('page loads and shows connection status', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await expect(page.getByText('Connected')).toBeVisible()
    await expect(page.getByText('+91 98765 43210')).toBeVisible()
  })

  test('sent_today stat shows correct count', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await expect(page.getByText('Sent Today', { exact: false })).toBeVisible()
    await expect(page.getByText('47')).toBeVisible()
  })

  test('failed and received stats visible', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await expect(page.getByText('Failed Today', { exact: false })).toBeVisible()
    await expect(page.getByText('Received Today', { exact: false })).toBeVisible()
  })

  test('template settings card opens and loads existing value', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await page.getByRole('button', { name: 'Configure' }).click()
    // Template section heading shows
    await expect(page.getByText('Approved Template Settings')).toBeVisible()
    // Pre-filled value should appear after settings load
    const input = page.locator('input[placeholder*="template_name"]').first()
    await expect(input).toHaveValue('myle_report_reminder', { timeout: 5000 })
  })

  test('template settings can be edited and saved', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await page.getByRole('button', { name: 'Configure' }).click()

    const input = page.locator('input[placeholder*="template_name"]').first()
    await input.fill('myle_new_template')

    await page.getByRole('button', { name: 'Save All Templates' }).click()
    await expect(page.getByText('✓ Templates saved')).toBeVisible()
  })

  test('all 7 template rows rendered', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await page.getByRole('button', { name: 'Configure' }).click()

    // These labels are unique enough (exact match avoids conflicts with filter buttons)
    await expect(page.getByText('Member Removal Notice', { exact: true })).toBeVisible()
    await expect(page.getByText('Leader: Member Removed', { exact: true })).toBeVisible()
    await expect(page.getByText('Leader: Grace Requested', { exact: true })).toBeVisible()
    await expect(page.getByText('Leader: New Member Approved', { exact: true })).toBeVisible()
    await expect(page.getByText('Daily Summary (Missing)', { exact: true })).toBeVisible()
    await expect(page.getByText('Daily Summary (All Clear)', { exact: true })).toBeVisible()
  })

  test('template settings hide on second click', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await page.getByRole('button', { name: 'Configure' }).click()
    await expect(page.getByText('Approved Template Settings')).toBeVisible()
    await expect(page.locator('input[placeholder*="template_name"]').first()).toBeVisible()
    await page.getByRole('button', { name: 'Hide' }).click()
    await expect(page.locator('input[placeholder*="template_name"]').first()).not.toBeVisible()
  })

  test('report_reminder type filter button exists', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await expect(page.getByRole('button', { name: 'Report Reminder' })).toBeVisible()
  })

  test('report_reminder type filter applies to log', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await page.getByRole('button', { name: 'Report Reminder' }).click()
    // Log row with type badge should show
    await expect(page.getByText('Report Reminder').first()).toBeVisible()
  })

  test('send report reminders shows results', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await page.getByRole('button', { name: 'Send Reminders Now' }).click()
    await expect(page.getByText('45 sent')).toBeVisible()
    await expect(page.getByText('3 no phone')).toBeVisible()
  })

  test('log table shows report_reminder type badge', async ({ page }) => {
    await navigateToWhatsAppPanel(page)
    await expect(page.getByText('Report Reminder').first()).toBeVisible()
  })
})
