import { test, expect, seed } from './fixtures'

test('clicking a sales row opens the detail; the menu does not', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the table is the desktop layout')
  const s = await seed(page)
  await page.goto('/farm/sales')
  const row = page.locator(`[data-sale-row="${s.saleId}"]`)
  await expect(row).toBeVisible()

  // The ⋮ menu opens without opening the detail.
  await row.getByRole('button').last().click()
  await expect(page.getByRole('menuitem').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /print invoice/i })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // The client cell opens the detail.
  await row.getByText(s.clientName).click()
  await expect(page.getByRole('link', { name: /print invoice/i })).toBeVisible()
})
