import { expect, test } from '@playwright/test'

import { installE2eApiMocks } from './api-mocks'

test.describe('PR #331 features (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await installE2eApiMocks(page)
  })

  test('CheckInWidget renders on leader dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^Continue$/i }).click()
    await expect(page).toHaveURL(/\/dashboard\/?$/)

    await expect(page.getByText(/working/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /check out/i })).toBeVisible()
  })

  test('team attendance page loads', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^Continue$/i }).click()

    await page.goto('/dashboard/team/attendance')
    await expect(page).toHaveURL(/\/dashboard\/team\/attendance\/?$/)

    await expect(page.getByRole('heading', { name: /attendance/i })).toBeVisible()
  })

  test('settings help page has notification toggle', async ({ page }) => {
    // Override auth/me to return admin role (settings/help is admin-only)
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authenticated: true,
          role: 'admin',
          user_id: 1,
          fbo_id: 'e2e-admin',
          username: 'admin-e2e',
          email: 'admin@myle.local',
          display_name: 'Admin E2E',
          auth_version: 1,
          training_status: 'completed',
          training_required: false,
          registration_status: 'approved',
          avatar_url: null,
          compliance_level: null,
          compliance_summary: null,
        }),
      })
    })

    await page.goto('/login')
    await page.getByRole('button', { name: /^Continue$/i }).click()
    await page.waitForTimeout(1000)

    await page.goto('/dashboard/settings/help')
    await expect(page).toHaveURL(/\/dashboard\/settings\/help\/?$/)

    await expect(page.getByText(/device notifications/i)).toBeVisible()
  })
})
