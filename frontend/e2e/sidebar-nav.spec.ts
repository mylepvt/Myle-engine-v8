import { expect, test, type Page } from '@playwright/test'

import { installE2eApiMocks } from './api-mocks'

/** Admin may skip the install / notification gates, so the shell is reachable headless. */
async function signInAsAdmin(page: Page) {
  await installE2eApiMocks(page)
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        role: 'admin',
        user_id: 1,
        fbo_id: 'e2e-admin',
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
      }),
    }),
  )
  await page.goto('/login')
  await page.getByRole('button', { name: /^Continue$/i }).click()
  await expect(page).toHaveURL(/\/dashboard\/?$/)
  const skip = page.getByRole('button', { name: /Skip for now/i })
  const shell = page.getByRole('button', { name: 'Toggle sidebar' })
  await expect(async () => {
    if (await skip.count()) await skip.first().click()
    await expect(shell).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
}

test.describe('sidebar navigation', () => {
  test.use({ permissions: ['geolocation', 'notifications'] })

  test('phone: a drawer link navigates, and Back returns to the previous page', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      permissions: ['geolocation', 'notifications'],
    })
    const page = await context.newPage()
    await signInAsAdmin(page)

    await page.getByRole('button', { name: 'Toggle sidebar' }).click()
    // Regression: closing the drawer drops its Back placeholder with history.back(),
    // which used to undo a navigation started a frame later.
    await page.getByRole('navigation', { name: 'Sidebar navigation' }).getByRole('link', { name: 'All Leads' }).tap()
    await expect(page).toHaveURL(/\/dashboard\/work\/leads\/?$/)
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/dashboard\/work\/leads\/?$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard\/?$/)
    await context.close()
  })

  test('desktop: a sidebar link navigates', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await signInAsAdmin(page)
    await page.getByRole('navigation', { name: 'Sidebar navigation' }).getByRole('link', { name: 'All Leads' }).click()
    await expect(page).toHaveURL(/\/dashboard\/work\/leads\/?$/)
  })
})
