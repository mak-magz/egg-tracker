// Keeps "today" (the device's local date) current while a screen stays open, e.g. overnight on a
// sleeping phone (feature 01 QA S1). Pure: `now` is injectable so tests can cross midnight.
// Relative imports: tests/unit imports this file outside Nuxt.
import type { IsoDate } from '../../shared/types/api'
import { todayLocal } from '../../shared/utils/local-date'

export interface TodayTracker {
  readonly current: IsoDate
  /** Re-reads the device date. Returns true when the date changed since the last read. */
  refresh: () => boolean
}

export function createTodayTracker(now: () => Date = () => new Date()): TodayTracker {
  let current = todayLocal(now())
  return {
    get current() {
      return current
    },
    refresh() {
      const next = todayLocal(now())
      if (next === current) return false
      current = next
      return true
    },
  }
}
