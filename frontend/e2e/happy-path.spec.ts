import { expect, test } from '@playwright/test'

import { installE2eApiMocks } from './api-mocks'

test.describe('happy path (mocked API)', () => {
  test.beforeEach(async ({ page }) => {
    await installE2eApiMocks(page)
  })

  test('dev login → dashboard home → leads → change stage', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()

    await page.getByRole('button', { name: /^Continue$/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/?$/)
    await expect(page.getByRole('heading', { name: /welcome back, e2e/i })).toBeVisible()

    await page.goto('/dashboard/work/leads')
    await expect(page).toHaveURL(/\/dashboard\/work\/leads\/?$/)

    const leadHeading = page.getByRole('heading', { name: 'E2E Lead' })
    await expect(leadHeading).toBeVisible()
    const card = leadHeading.locator(
      'xpath=ancestor::div[contains(concat(" ", @class, " "), " rounded ")][1]',
    )
    const statusSelect = card.getByLabel('Lead status')
    await statusSelect.selectOption('contacted')
    await expect(statusSelect).toHaveValue('contacted')
  })

  test('CTCS: dial + WhatsApp links; dark mode screenshot', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^Continue$/i }).click()
    await page.goto('/dashboard/work/leads')
    await expect(page.getByRole('heading', { name: 'E2E Lead' })).toBeVisible()

    const dial = page.getByRole('link', { name: 'Dial and log call' })
    const wa = page.getByRole('link', { name: 'Open WhatsApp chat' })
    await expect(dial).toHaveAttribute('href', /^tel:\+919876543210$/)
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/919876543210$/)

    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.screenshot({ path: 'test-results/ctcs-lead-card-dark.png', fullPage: true })
  })
})
