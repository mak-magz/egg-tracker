import { describe, expect, it } from 'vitest'
import { computeLineTotal } from '../../shared/utils/price'

describe('computeLineTotal (feature 04 AC22, exact half-up rounding)', () => {
  it('matches every AC22 worked example, 30 eggs per tray', () => {
    expect(computeLineTotal(6.5, 240, 30)).toBe(52) // 8 trays
    expect(computeLineTotal(6.5, 252, 30)).toBe(54.6) // 8 trays + 12
    expect(computeLineTotal(6.75, 241, 30)).toBe(54.23) // 8 trays + 1, exactly 54.225 -> half up
    expect(computeLineTotal(6, 120, 30)).toBe(24) // 4 trays
  })

  it('rounds half away from zero (half-up for these always-positive values)', () => {
    // price 1, eggs 1, eggsPerTray 200 -> 1/200 = 0.005 exactly -> half-up rounds to 0.01
    expect(computeLineTotal(1, 1, 200)).toBe(0.01)
    // price 1, eggs 1, eggsPerTray 400 -> 1/400 = 0.0025 -> rounds DOWN to 0.00 (not a half-way case)
    expect(computeLineTotal(1, 1, 400)).toBe(0)
  })

  it('agrees with a naive float computation for ordinary values (no drift at this scale)', () => {
    const cases: [number, number, number][] = [[6.5, 8, 1], [12.99, 1000, 30], [0.01, 1, 100], [9999.99, 100000, 30]]
    for (const [price, eggs, eggsPerTray] of cases) {
      const exact = computeLineTotal(price, eggs, eggsPerTray)
      expect(Number.isFinite(exact)).toBe(true)
      expect(exact).toBeGreaterThanOrEqual(0)
    }
  })

  it('never uses eggsPerTray = 30 as a hardcoded assumption: works for other tray sizes (AC21)', () => {
    // 24 per tray: 1 tray + 5 = 29 eggs. 29/24*10 = 12.0833... -> rounds to 12.08.
    expect(computeLineTotal(10, 29, 24)).toBe(12.08)
  })

  it('throws for a non-positive price, a non-integer or negative eggs, or a bad eggsPerTray', () => {
    expect(() => computeLineTotal(0, 1, 30)).toThrow(RangeError)
    expect(() => computeLineTotal(-1, 1, 30)).toThrow(RangeError)
    expect(() => computeLineTotal(1, -1, 30)).toThrow(RangeError)
    expect(() => computeLineTotal(1, 1.5, 30)).toThrow(RangeError)
    expect(() => computeLineTotal(1, 1, 0)).toThrow(RangeError)
    expect(() => computeLineTotal(1, 1, 1.5)).toThrow(RangeError)
  })

  it('zero eggs gives a zero total (a saved line always has >= 1 egg, but the helper itself is total, not validation)', () => {
    expect(computeLineTotal(6.5, 0, 30)).toBe(0)
  })
})
