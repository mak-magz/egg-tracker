import { describe, expect, it } from 'vitest'
import { createTodayTracker } from '../../app/utils/today-tracker'
import { rangeFor } from '../../app/utils/production-range'

// QA S1: the Production screen left open overnight must move "today" to the new device date.
describe('createTodayTracker', () => {
  it('rolls over at local midnight and reports the change once', () => {
    let now = new Date(2026, 8, 25, 21, 0) // Sep 25, 21:00 local
    const tracker = createTodayTracker(() => now)
    expect(tracker.current).toBe('2026-09-25')

    now = new Date(2026, 8, 25, 23, 59)
    expect(tracker.refresh()).toBe(false)
    expect(tracker.current).toBe('2026-09-25')

    now = new Date(2026, 8, 26, 6, 30) // next morning
    expect(tracker.refresh()).toBe(true)
    expect(tracker.current).toBe('2026-09-26')
    expect(tracker.refresh()).toBe(false)
  })

  it('moves the Week range with the new day', () => {
    let now = new Date(2026, 8, 25, 21, 0)
    const tracker = createTodayTracker(() => now)
    const state = { chip: 'week' as const, from: null, to: null }
    expect(rangeFor(state, tracker.current)).toEqual({ from: '2026-09-19', to: '2026-09-25' })
    now = new Date(2026, 8, 26, 6, 30)
    tracker.refresh()
    expect(rangeFor(state, tracker.current)).toEqual({ from: '2026-09-20', to: '2026-09-26' })
  })
})
