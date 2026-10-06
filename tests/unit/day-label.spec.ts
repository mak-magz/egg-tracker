import { describe, expect, it } from 'vitest'
import { formatDateHint, formatDayLabel, formatDayPhrase, formatShortDate, formatWeekdayDate } from '../../app/utils/day-label'

const TODAY = '2026-09-25'

describe('day labels (UX R3, AC16)', () => {
  it('labels today, this year and other years', () => {
    expect(formatDayLabel(TODAY, TODAY)).toBe('Today · Sep 25')
    expect(formatDayLabel('2026-09-24', TODAY)).toBe('Sep 24')
    expect(formatDayLabel('2025-09-24', TODAY)).toBe('Sep 24, 2025')
  })

  it('phrases dates for copy', () => {
    expect(formatDayPhrase(TODAY, TODAY)).toBe('today')
    expect(formatDayPhrase('2026-08-03', TODAY)).toBe('Aug 3')
    expect(formatDayPhrase('2024-08-03', TODAY)).toBe('Aug 3, 2024')
  })

  it('gives the form date hint', () => {
    expect(formatDateHint(TODAY, TODAY)).toBe('Today')
    expect(formatDateHint('2026-09-23', TODAY)).toBe('Wednesday, Sep 23')
  })

  it('gives the short weekday date for a wanted-by line', () => {
    expect(formatWeekdayDate('2026-10-09', TODAY)).toBe('Fri, Oct 9')
    expect(formatWeekdayDate('2027-01-01', TODAY)).toBe('Fri, Jan 1, 2027')
  })

  it('never shifts the day with the device time zone', () => {
    const prev = process.env.TZ
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Manila']) {
        process.env.TZ = tz
        expect(formatShortDate('2026-01-01', TODAY)).toBe('Jan 1')
      }
    }
    finally {
      if (prev === undefined) delete process.env.TZ
      else process.env.TZ = prev
    }
  })
})
