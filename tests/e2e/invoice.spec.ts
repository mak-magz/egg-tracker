import { test, expect, seed } from './fixtures'

test('invoice shows heading and total, and prints without the app shell', async ({ page }) => {
  const s = await seed(page)
  await page.goto(`/sales/${s.saleId}/invoice`)
  await expect(page.getByRole('heading').first()).toBeVisible()
  await expect(page.getByText('Total', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(s.clientName)).toBeVisible()

  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('nav, aside')).toHaveCount(0)
  // The Total row appears once (the table head "Total" column is the only other mention).
  await expect(page.locator('tfoot').getByText('Total', { exact: true })).toHaveCount(1)
  const visibleNav = await page.locator('nav:visible, aside:visible').count()
  expect(visibleNav).toBe(0)
})
