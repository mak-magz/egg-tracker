import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, compareIsoDates, isIsoDate, maxLoggableDate, todayLocal, todayUtc } from '../../shared/utils/local-date'

// Run a function with the process time zone temporarily set (Node reads TZ on each Date call).
function inTimeZone<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  }
  finally {
    if (prev === undefined) delete process.env.TZ
    else process.env.TZ = prev
  }
}

describe('local-date', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('todayLocal: 21:00 local stays "today" even when UTC is already tomorrow', () => {
    // New York in September is UTC-4: 21:00 local on Sep 25 is 01:00 UTC on Sep 26.
    inTimeZone('America/New_York', () => {
      const now = new Date('2026-09-26T01:00:00Z')
      expect(todayLocal(now)).toBe('2026-09-25')
      expect(todayUtc(now)).toBe('2026-09-26')
    })
  })

  it('todayLocal: early morning east of UTC is already "today" locally', () => {
    inTimeZone('Asia/Manila', () => {
      const now = new Date('2026-09-24T17:30:00Z') // 01:30 on Sep 25 in Manila
      expect(todayLocal(now)).toBe('2026-09-25')
      expect(todayUtc(now)).toBe('2026-09-24')
    })
  })

  it('todayLocal defaults to the current time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0)) // local noon, Sep 25
    expect(todayLocal()).toBe('2026-09-25')
  })

  it('addDays crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-09-25', -6)).toBe('2026-09-19')
    expect(addDays('2026-09-25', -29)).toBe('2026-08-27')
    expect(addDays('2026-09-25', 0)).toBe('2026-09-25')
  })

  it('addDays is unaffected by DST transitions in the local zone', () => {
    inTimeZone('America/New_York', () => {
      // US DST starts 2026-03-08 and ends 2026-11-01.
      expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
      expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
      expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
      expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
      expect(addDays('2026-11-02', -2)).toBe('2026-10-31')
    })
  })

  it('todayLocal is correct around a DST change', () => {
    inTimeZone('America/New_York', () => {
      expect(todayLocal(new Date('2026-03-08T06:59:00Z'))).toBe('2026-03-08') // 01:59 EST
      expect(todayLocal(new Date('2026-03-08T07:00:00Z'))).toBe('2026-03-08') // 03:00 EDT
      expect(todayLocal(new Date('2026-11-02T03:59:00Z'))).toBe('2026-11-01') // 22:59 EST
    })
  })

  it('addDays rejects invalid input', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError)
    expect(() => addDays('26-09-25', 1)).toThrow(RangeError)
    expect(() => addDays('2026-09-25', 1.5)).toThrow(RangeError)
  })

  it('maxLoggableDate is UTC today + 1, whatever the local zone', () => {
    const now = new Date('2026-09-25T23:30:00Z')
    inTimeZone('Pacific/Kiritimati', () => { // UTC+14: local is already Sep 26
      expect(todayLocal(now)).toBe('2026-09-26')
      expect(maxLoggableDate(now)).toBe('2026-09-26')
    })
    inTimeZone('Pacific/Pago_Pago', () => { // UTC-11
      expect(maxLoggableDate(now)).toBe('2026-09-26')
    })
    expect(maxLoggableDate(new Date('2026-12-31T12:00:00Z'))).toBe('2027-01-01')
  })

  it('a local "today" is never after maxLoggableDate, in any zone', () => {
    for (const iso of ['2026-09-25T00:00:00Z', '2026-09-25T10:15:00Z', '2026-09-25T23:59:59Z']) {
      const now = new Date(iso)
      for (const tz of ['Pacific/Kiritimati', 'Asia/Manila', 'UTC', 'America/New_York', 'Pacific/Pago_Pago']) {
        inTimeZone(tz, () => {
          expect(compareIsoDates(todayLocal(now), maxLoggableDate(now))).toBeLessThanOrEqual(0)
        })
      }
    }
  })

  it('compareIsoDates orders dates', () => {
    expect(compareIsoDates('2026-09-24', '2026-09-25')).toBe(-1)
    expect(compareIsoDates('2026-09-25', '2026-09-25')).toBe(0)
    expect(compareIsoDates('2027-01-01', '2026-12-31')).toBe(1)
    expect(() => compareIsoDates('2026-13-01', '2026-01-01')).toThrow(RangeError)
  })

  it('isIsoDate accepts only real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2026-09-25')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2027-02-29')).toBe(false)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-9-25')).toBe(false)
    expect(isIsoDate('2026-09-25T00:00:00Z')).toBe(false)
    expect(isIsoDate('0050-01-01')).toBe(false)
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate(20260925)).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })
})
