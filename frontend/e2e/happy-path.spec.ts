import { expect, test } from '@playwright/test'

import { installE2eApiMocks } from './api-mocks'

test.describe('happy path (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await installE2eApiMocks(page)
  })

  test('dev login → dashboard home → leads → change stage', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /Myle Community/i })).toBeVisible()

    await page.getByRole('button', { name: /Continue with preview role/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/?$/)
    await expect(page.getByRole('heading', { name: /welcome, e2e/i })).toBeVisible()

    await page.goto('/dashboard/work/leads')
    await expect(page.getByRole('heading', { name: /^All Leads$/i })).toBeVisible()

    // CTCS cards use a heading for the name (no row link to lead detail).
    const leadHeading = page.getByRole('heading', { name: 'E2E Lead' })
    await expect(leadHeading).toBeVisible()
    const card = page.getByRole('article').filter({ has: leadHeading })
    const contacted = card.getByRole('button', { name: 'Contacted' })
    await contacted.click()
    await expect(contacted).toHaveClass(/border-primary/)
  })
})
