// Production list range logic (UX Flow E, AC19, D3). Pure; `today` is the device's local IsoDate.
//   Week  = today - 6 .. today     Month = today - 29 .. today
//   From only -> from .. today     To only -> (open) .. to     From + To -> from .. to
// A set date overrides the chip. Relative imports: tests/unit imports this file outside Nuxt.
import type { IsoDate } from '../../shared/types/api'
import { PRODUCTION_MESSAGES } from '../../shared/constants/production'
import { addDays, compareIsoDates, isIsoDate } from '../../shared/utils/local-date'

export type RangeChip = 'week' | 'month'

export const RANGE_CHIPS: readonly { value: RangeChip, label: string, days: number }[] = [
  { value: 'week', label: 'Week', days: 7 },
  { value: 'month', label: 'Month', days: 30 },
]

export interface RangeState {
  chip: RangeChip
  from: IsoDate | null
  to: IsoDate | null
}

/** `null` ends are open. */
export interface DateRange {
  from: IsoDate | null
  to: IsoDate | null
}

function validOrNull(value: IsoDate | null | undefined): IsoDate | null {
  return value && isIsoDate(value) ? value : null
}

/** True when a From and/or To date is set, so it overrides the chip. */
export function hasDateRange(state: Pick<RangeState, 'from' | 'to'>): boolean {
  return validOrNull(state.from) !== null || validOrNull(state.to) !== null
}

/** The `End date must be on or after the start date` message, or null when the range is fine. */
export function validateRange(from: IsoDate | null, to: IsoDate | null): string | null {
  const f = validOrNull(from)
  const t = validOrNull(to)
  if (f && t && compareIsoDates(f, t) > 0) return PRODUCTION_MESSAGES.endBeforeStart
  return null
}

/** The range to request. Call it only when validateRange() is null. */
export function rangeFor(state: RangeState, today: IsoDate): DateRange {
  const from = validOrNull(state.from)
  const to = validOrNull(state.to)
  if (from || to) {
    // From only runs to today (the date inputs' max); To only is open at the start.
    return { from, to: to ?? (from ? today : null) }
  }
  const chip = RANGE_CHIPS.find(c => c.value === state.chip) ?? RANGE_CHIPS[0]!
  return { from: addDays(today, -(chip.days - 1)), to: today }
}

/** Whether `date` falls inside `range` (both ends inclusive, null = open). */
export function isInRange(date: IsoDate, range: DateRange): boolean {
  if (range.from && compareIsoDates(date, range.from) < 0) return false
  if (range.to && compareIsoDates(date, range.to) > 0) return false
  return true
}
