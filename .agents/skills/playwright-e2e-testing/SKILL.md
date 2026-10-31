---
name: playwright-e2e-testing
description: >-
  End-to-End browser testing with Playwright for Tamago Egg Farm Tracker.
  Covers mobile barnside entry workflows, session fixtures, tests/e2e/ test structure,
  and local execution commands. Use when writing, modifying, or debugging E2E tests.
---

# Playwright E2E Testing Skill

This skill documents how to write, maintain, and run End-to-End browser tests for the Tamago Egg Farm Tracker application using Playwright.

---

## 1. Test Architecture

- **Test Directory**: `tests/e2e/`
- **Global Setup**: `tests/e2e/global-setup.ts` (authenticates and populates `tests/e2e/.auth/state.json`)
- **Custom Fixtures**: `tests/e2e/fixtures.ts` (provides pre-authenticated pages, mobile viewport presets, and test utilities)
- **Environment**: Configured via `.env` and `tests/e2e/env.ts`

---

## 2. Running E2E Tests

Always use `bun` to run Playwright tests:

```bash
# Run all E2E tests
bun run test:e2e

# Run a specific spec
bunx playwright test tests/e2e/deliver-dialog.spec.ts

# Run tests in UI mode for interactive debugging
bunx playwright test --ui

# Run tests with a specific browser or viewport
bunx playwright test --project="Mobile Chrome"
```

---

## 3. Writing E2E Tests

### Mobile-First Invariant
Tamago is designed primarily for quick, barnside smartphone logging by owner-operators. Always verify interactions against mobile viewports (e.g. 375x667 or 390x844):
- Quick tray + loose quantity inputs
- Multi-size production entry
- Deliver order dialogs and bottom sheets
- Mobile navigation bar (4 tabs + More sheet)

### Example Test Pattern

```typescript
import { test, expect } from './fixtures'

test.describe('Barnside Production Entry', () => {
  test('logs production for active sizes and updates summary', async ({ page }) => {
    await page.goto('/production')

    // Expect date picker / day tracker
    await expect(page.getByRole('heading', { name: /production/i })).toBeVisible()

    // Fill tray and loose inputs
    const largeRow = page.getByTestId('production-size-large')
    await largeRow.getByLabel('Trays').fill('5')
    await largeRow.getByLabel('Loose').fill('12')

    // Save
    await page.getByRole('button', { name: /save/i }).click()

    // Verify toast or confirmation
    await expect(page.getByText(/saved/i)).toBeVisible()
  })
})
```

---

## 4. Best Practices

1. **Use Accessible Locators**:
   - Prefer `getByRole`, `getByLabel`, `getByPlaceholder`, or semantic text matchers before resorting to CSS classes or `data-testid`.
2. **Handle Transient Network / State**:
   - Use `await expect(locator).toBeVisible()` or `page.waitForResponse()` rather than arbitrary timeouts (`page.waitForTimeout`).
3. **Keep Fixtures Clean**:
   - Use `tests/e2e/.auth/state.json` to preserve authenticated sessions across specs without repeating login forms.
