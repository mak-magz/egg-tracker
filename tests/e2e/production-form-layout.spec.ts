import { test, expect, seed } from './fixtures'

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'sm-640', width: 640, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-900', width: 900, height: 800 },
  { name: 'desktop-short-1280', width: 1280, height: 650 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const

test('production form layout stays aligned with no wrapped inputs or clipped alert across viewports', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'exercises all target viewports explicitly in one pass')

  await seed(page)
  await page.goto('/farm/production')
  await expect(page.locator('[data-day]').first()).toBeVisible()

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })

    const trigger = page.locator('[data-primary-action]:visible').first()
    await expect(trigger, `${vp.name}: primary action button visible`).toBeVisible()
    await trigger.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Log production' }), `${vp.name}: heading`).toBeVisible()

    // Verify the "adds to" alert is not vertically clipped by flex shrinking.
    const alertTitle = dialog.getByText('Today already has production logged. This adds to it.')
    await expect(alertTitle, `${vp.name}: adds-to alert title visible`).toBeVisible()
    await expect(dialog.getByText(/Good:\s*\d/), `${vp.name}: adds-to alert description visible`).toBeVisible()
    const alertRoot = alertTitle.locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]')
    const alertMetrics = await alertRoot.evaluate(el => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }))
    expect(alertMetrics.clientHeight, `${vp.name}: alert height`).toBeGreaterThanOrEqual(52)
    expect(alertMetrics.scrollHeight, `${vp.name}: alert not clipped`).toBeLessThanOrEqual(alertMetrics.clientHeight + 1)

    // Verify every pair of trays + loose inputs sits on the same horizontal line (no wrap).
    const qtyInputs = dialog.locator('input[data-qty-input]')
    const inputCount = await qtyInputs.count()
    expect(inputCount, `${vp.name}: even number of qty inputs`).toBeGreaterThanOrEqual(4)
    expect(inputCount % 2, `${vp.name}: paired trays/loose inputs`).toBe(0)

    if (vp.width >= 640) {
      const smallLabelBox = await dialog.locator('span[title="Small"]').boundingBox()
      const smallTraysBox = await qtyInputs.nth(0).boundingBox()
      expect(smallLabelBox, `${vp.name}: Small label box`).not.toBeNull()
      expect(smallTraysBox, `${vp.name}: Small trays box`).not.toBeNull()
      expect(smallTraysBox!.x, `${vp.name}: Small label sits beside trays input at sm+`).toBeGreaterThan(smallLabelBox!.x + smallLabelBox!.width)
      expect(smallTraysBox!.y, `${vp.name}: Small label on same row as trays input at sm+`).toBeLessThan(smallLabelBox!.y + smallLabelBox!.height)
    }

    for (let i = 0; i < inputCount; i += 2) {
      const traysBox = await qtyInputs.nth(i).boundingBox()
      const looseBox = await qtyInputs.nth(i + 1).boundingBox()
      expect(traysBox, `${vp.name}: trays input ${i}`).not.toBeNull()
      expect(looseBox, `${vp.name}: loose input ${i + 1}`).not.toBeNull()

      expect(Math.abs(traysBox!.y - looseBox!.y), `${vp.name}: row ${i / 2} trays/loose aligned on Y`).toBeLessThanOrEqual(1)
      expect(looseBox!.x, `${vp.name}: row ${i / 2} loose to the right of trays`).toBeGreaterThan(traysBox!.x + traysBox!.width)

      if (vp.width < 1024) {
        expect(traysBox!.height, `${vp.name}: trays height >= 44px`).toBeGreaterThanOrEqual(43.5)
        expect(looseBox!.height, `${vp.name}: loose height >= 44px`).toBeGreaterThanOrEqual(43.5)
      }
    }

    if (vp.width < 1024) {
      const steppers = dialog.locator('button[aria-label^="Increase "], button[aria-label^="Decrease "]')
      const stepperCount = await steppers.count()
      expect(stepperCount).toBe(inputCount * 2)
      for (let i = 0; i < stepperCount; i++) {
        const box = await steppers.nth(i).boundingBox()
        expect(box, `${vp.name}: stepper ${i}`).not.toBeNull()
        expect(box!.width, `${vp.name}: stepper ${i} width >= 44px`).toBeGreaterThanOrEqual(43.5)
        expect(box!.height, `${vp.name}: stepper ${i} height >= 44px`).toBeGreaterThanOrEqual(43.5)
      }
    }

    // Verify no horizontal overflow inside the scrolling body or page.
    const bodyOverflow = await dialog.locator('.overflow-y-auto').evaluate(el => el.scrollWidth - el.clientWidth)
    expect(bodyOverflow, `${vp.name}: modal body horizontal overflow`).toBeLessThanOrEqual(0)

    const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(docOverflow, `${vp.name}: document horizontal overflow`).toBeLessThanOrEqual(0)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  }
})
