import { describe, expect, it } from 'vitest'
import { hasDateRange, isInRange, rangeFor, validateRange } from '../../app/utils/production-range'

const TODAY = '2026-09-25'

describe('rangeFor (AC19, UX Flow E)', () => {
  it('Week is today and the 6 days before it', () => {
    expect(rangeFor({ chip: 'week', from: null, to: null }, TODAY)).toEqual({ from: '2026-09-19', to: TODAY })
  })

  it('Month is today and the 29 days before it', () => {
    expect(rangeFor({ chip: 'month', from: null, to: null }, TODAY)).toEqual({ from: '2026-08-27', to: TODAY })
  })

  it('crosses month and year boundaries', () => {
    expect(rangeFor({ chip: 'week', from: null, to: null }, '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' })
    expect(rangeFor({ chip: 'month', from: null, to: null }, '2024-03-01')).toEqual({ from: '2024-02-01', to: '2024-03-01' }) // leap year
  })

  it('a set date overrides the chip', () => {
    expect(rangeFor({ chip: 'week', from: '2026-01-01', to: '2026-02-01' }, TODAY)).toEqual({ from: '2026-01-01', to: '2026-02-01' })
  })

  it('From only runs to today; To only is open at the start', () => {
    expect(rangeFor({ chip: 'month', from: '2026-09-01', to: null }, TODAY)).toEqual({ from: '2026-09-01', to: TODAY })
    expect(rangeFor({ chip: 'month', from: null, to: '2026-09-01' }, TODAY)).toEqual({ from: null, to: '2026-09-01' })
  })

  it('From = To gives a single day', () => {
    expect(rangeFor({ chip: 'week', from: '2026-07-04', to: '2026-07-04' }, TODAY)).toEqual({ from: '2026-07-04', to: '2026-07-04' })
  })

  it('ignores an invalid date string (treated as not set)', () => {
    expect(rangeFor({ chip: 'week', from: 'nope', to: '' }, TODAY)).toEqual({ from: '2026-09-19', to: TODAY })
  })
})

describe('validateRange', () => {
  it('errors on To when From is after To', () => {
    expect(validateRange('2026-09-10', '2026-09-01')).toBe('End date must be on or after the start date')
  })

  it('accepts equal, ordered and half-open ranges', () => {
    expect(validateRange('2026-09-01', '2026-09-01')).toBeNull()
    expect(validateRange('2026-09-01', '2026-09-10')).toBeNull()
    expect(validateRange('2026-09-01', null)).toBeNull()
    expect(validateRange(null, '2026-09-01')).toBeNull()
    expect(validateRange(null, null)).toBeNull()
  })
})

describe('hasDateRange / isInRange', () => {
  it('knows when a date overrides the chip', () => {
    expect(hasDateRange({ from: null, to: null })).toBe(false)
    expect(hasDateRange({ from: '2026-09-01', to: null })).toBe(true)
    expect(hasDateRange({ from: null, to: '2026-09-01' })).toBe(true)
  })

  it('checks both ends inclusively and treats null as open', () => {
    const r = { from: '2026-09-19', to: TODAY }
    expect(isInRange('2026-09-19', r)).toBe(true)
    expect(isInRange(TODAY, r)).toBe(true)
    expect(isInRange('2026-09-18', r)).toBe(false)
    expect(isInRange('2026-09-26', r)).toBe(false)
    expect(isInRange('1999-01-01', { from: null, to: TODAY })).toBe(true)
  })
})
