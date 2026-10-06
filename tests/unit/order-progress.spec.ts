import { describe, expect, it } from 'vitest'
import { formatProgress } from '../../shared/utils/order-progress'

describe('formatProgress (O-R4)', () => {
  it('whole trays on both sides: "{delivered} of {ordered} trays" (30 per tray)', () => {
    expect(formatProgress(600, 900, 30, 'en-US')).toBe('20 of 30 trays')
    expect(formatProgress(0, 300, 30, 'en-US')).toBe('0 of 10 trays')
    expect(formatProgress(30, 90, 30, 'en-US')).toBe('1 of 3 trays')
    expect(formatProgress(900, 900, 30, 'en-US')).toBe('30 of 30 trays')
  })

  it('a single ordered tray reads singular', () => {
    expect(formatProgress(0, 30, 30, 'en-US')).toBe('0 of 1 tray')
    expect(formatProgress(30, 30, 30, 'en-US')).toBe('1 of 1 tray')
  })

  it('loose eggs on either side: each side through formatQty', () => {
    expect(formatProgress(241, 360, 30, 'en-US')).toBe('8 trays + 1 of 12 trays')
    expect(formatProgress(60, 375, 30, 'en-US')).toBe('2 trays of 12 trays + 15')
    expect(formatProgress(0, 375, 30, 'en-US')).toBe('0 of 12 trays + 15')
    expect(formatProgress(5, 360, 30, 'en-US')).toBe('5 eggs of 12 trays')
  })

  it('an order under a tray: plain egg counts', () => {
    expect(formatProgress(0, 5, 30, 'en-US')).toBe('0 of 5 eggs')
    expect(formatProgress(3, 5, 30, 'en-US')).toBe('3 of 5 eggs')
    expect(formatProgress(0, 1, 30, 'en-US')).toBe('0 of 1 egg')
  })

  it('uses the farm\'s tray size, never 30 (a 24-egg tray)', () => {
    expect(formatProgress(480, 720, 24, 'en-US')).toBe('20 of 30 trays')
    expect(formatProgress(29, 48, 24, 'en-US')).toBe('1 tray + 5 of 2 trays')
    expect(formatProgress(0, 29, 24, 'en-US')).toBe('0 of 1 tray + 5')
    expect(formatProgress(0, 23, 24, 'en-US')).toBe('0 of 23 eggs')
  })

  it('formats thousands with the locale', () => {
    expect(formatProgress(0, 30_000, 30, 'en-US')).toBe('0 of 1,000 trays')
  })

  it('throws on a bad tray size, like formatQty', () => {
    expect(() => formatProgress(0, 30, 0)).toThrow(RangeError)
    expect(() => formatProgress(-1, 30, 30)).toThrow(RangeError)
  })
})
