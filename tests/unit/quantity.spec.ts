import { describe, expect, it } from 'vitest'
import { formatLabelledQty, formatQty, formatQtyWithEggs, splitEggs, toEggs } from '../../shared/utils/quantity'

// Tray sizes are test inputs here, never app constants: every case runs at two farm settings.
const TRAY_30 = 30
const TRAY_24 = 24

describe('toEggs', () => {
  it('converts trays + loose to eggs at the farm tray size (AC3, AC6)', () => {
    expect(toEggs(1, 12, TRAY_30)).toBe(42)
    expect(toEggs(4, 28, TRAY_30)).toBe(148)
    expect(toEggs(8, 24, TRAY_30)).toBe(264)
    expect(toEggs(0, 5, TRAY_30)).toBe(5)
    expect(toEggs(1, 5, TRAY_24)).toBe(29)
    expect(toEggs(0, 0, TRAY_24)).toBe(0)
  })

  it('rejects negative or fractional counts', () => {
    expect(() => toEggs(-1, 0, TRAY_30)).toThrow(RangeError)
    expect(() => toEggs(0, 1.5, TRAY_30)).toThrow(RangeError)
  })
})

describe('splitEggs', () => {
  it('splits into whole trays and a loose remainder', () => {
    expect(splitEggs(494, TRAY_30)).toEqual({ trays: 16, loose: 14 })
    expect(splitEggs(494, TRAY_24)).toEqual({ trays: 20, loose: 14 })
    expect(splitEggs(29, TRAY_24)).toEqual({ trays: 1, loose: 5 })
    expect(splitEggs(0, TRAY_30)).toEqual({ trays: 0, loose: 0 })
  })

  it('carries loose eggs into a full tray (AC8: 264 + 66 = 11 trays, never 10 + 30)', () => {
    expect(splitEggs(264 + 66, TRAY_30)).toEqual({ trays: 11, loose: 0 })
  })

  it('round-trips with toEggs at both tray sizes', () => {
    for (const tray of [TRAY_30, TRAY_24, 1, 7]) {
      for (const eggs of [0, 1, tray - 1, tray, tray + 1, 494, 36_000]) {
        const { trays, loose } = splitEggs(eggs, tray)
        expect(loose).toBeLessThan(tray)
        expect(toEggs(trays, loose, tray)).toBe(eggs)
      }
    }
  })
})

describe('formatQty (UX R1)', () => {
  it('formats every R1 row at 30 per tray', () => {
    expect(formatQty(0, TRAY_30, 'en-US')).toBe('0 eggs')
    expect(formatQty(1, TRAY_30, 'en-US')).toBe('1 egg')
    expect(formatQty(5, TRAY_30, 'en-US')).toBe('5 eggs')
    expect(formatQty(30, TRAY_30, 'en-US')).toBe('1 tray')
    expect(formatQty(60, TRAY_30, 'en-US')).toBe('2 trays')
    expect(formatQty(42, TRAY_30, 'en-US')).toBe('1 tray + 12')
    expect(formatQty(494, TRAY_30, 'en-US')).toBe('16 trays + 14')
    expect(formatQty(36_000, TRAY_30, 'en-US')).toBe('1,200 trays')
  })

  it('uses the farm tray size, not a fixed 30 (AC6, AC36)', () => {
    expect(formatQty(29, TRAY_24, 'en-US')).toBe('1 tray + 5')
    expect(formatQty(494, TRAY_24, 'en-US')).toBe('20 trays + 14')
    expect(formatQty(24, TRAY_24, 'en-US')).toBe('1 tray')
    expect(formatQty(23, TRAY_24, 'en-US')).toBe('23 eggs')
  })

  it('never produces "0 trays + n" or "n loose"', () => {
    for (let eggs = 0; eggs < TRAY_30; eggs++) {
      expect(formatQty(eggs, TRAY_30, 'en-US')).toMatch(/^\d+ eggs?$/)
    }
  })

  it('uses the given locale for thousands', () => {
    expect(formatQty(36_000, TRAY_30, 'de-DE')).toBe('1.200 trays')
  })
})

describe('formatLabelledQty', () => {
  it('puts the label first', () => {
    expect(formatLabelledQty('Good', 494, TRAY_30, 'en-US')).toBe('Good: 16 trays + 14')
    expect(formatLabelledQty('Rejects', 5, TRAY_30, 'en-US')).toBe('Rejects: 5 eggs')
    expect(formatLabelledQty('Rejects', 32, TRAY_30, 'en-US')).toBe('Rejects: 1 tray + 2')
  })
})

describe('invalid eggsPerTray', () => {
  it('throws for anything but a whole number >= 1', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toEggs(1, 0, bad)).toThrow(RangeError)
      expect(() => splitEggs(10, bad)).toThrow(RangeError)
      expect(() => formatQty(10, bad)).toThrow(RangeError)
      expect(() => formatLabelledQty('Good', 10, bad)).toThrow(RangeError)
    }
  })
})

describe('formatQtyWithEggs (invoice, feature 07 AC9)', () => {
  it.each([
    [102, 30, '3 trays + 12 eggs (102 eggs)'],
    [90, 30, '3 trays (90 eggs)'],
    [30, 30, '1 tray (30 eggs)'],
    [12, 30, '12 eggs'],
    [1, 30, '1 egg'],
    [0, 30, '0 eggs'],
    [31, 30, '1 tray + 1 egg (31 eggs)'],
    [90, 12, '7 trays + 6 eggs (90 eggs)'],
    [36000, 30, '1,200 trays (36,000 eggs)'],
  ])('%i eggs at %i per tray', (eggs, per, out) => {
    expect(formatQtyWithEggs(eggs, per, 'en-US')).toBe(out)
  })
  it('rejects a bad tray size', () => {
    expect(() => formatQtyWithEggs(5, 0)).toThrow(RangeError)
  })
})
