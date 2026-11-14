import { test, expect, seed } from './fixtures'

test('Deliver dialog opens, confirms and closes with no console errors', async ({ page }) => {
  const s = await seed(page)
  await page.goto('/farm/orders')
  await page.getByRole('button', { name: `Deliver order #${s.orderNumber}` }).click()
  const confirm = page.locator('[data-deliver-confirm]')
  await expect(confirm).toBeVisible()
  await confirm.click()
  await expect(confirm).toBeHidden()
})

test('Deliver dialog can be opened and cancelled', async ({ page }) => {
  const s = await seed(page)
  await page.goto('/farm/orders')
  await page.getByRole('button', { name: `Deliver order #${s.orderNumber}` }).click()
  await expect(page.locator('[data-deliver-confirm]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-deliver-confirm]')).toBeHidden()
})
