import { expect, test } from '@playwright/test'

test.describe('smoke', () => {
  test('login route renders and document has app title', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Myle/i)
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()
  })
})
