// Date-only helpers (docs/features/01-production-logging.md §3.3). Pure; used by the server and the app.
// An IsoDate is a calendar date ('YYYY-MM-DD'), never a timestamp. "Today" is the owner's device date
// (todayLocal); the server only knows UTC and uses maxLoggableDate as a future-date backstop (§3.8 D7).
// Arithmetic runs on UTC midnights, so DST never shifts a day.
import type { IsoDate } from '../types/api'

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function fromParts(year: number, month: number, day: number): IsoDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

/** UTC-midnight epoch ms for a valid IsoDate, or null when it isn't a real calendar date. */
function toUtcMs(value: string): number | null {
  const m = ISO_DATE_RE.exec(value)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  // Round-trip: rejects 2026-02-30, month 13, and years 0-99 (which Date.UTC maps to 19xx).
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return date.getTime()
}

function requireUtcMs(value: IsoDate): number {
  const ms = toUtcMs(value)
  if (ms === null) throw new RangeError(`Not a valid date (YYYY-MM-DD): ${value}`)
  return ms
}

/** True for a 'YYYY-MM-DD' string that is a real calendar date. */
export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && toUtcMs(value) !== null
}

/** The device's local calendar date. Built from local getters, NOT toISOString (which is UTC). */
export function todayLocal(now: Date = new Date()): IsoDate {
  return fromParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** The UTC calendar date. */
export function todayUtc(now: Date = new Date()): IsoDate {
  return fromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
}

/** Adds (or with n < 0, subtracts) whole days. Throws on an invalid date or a non-integer n. */
export function addDays(date: IsoDate, n: number): IsoDate {
  if (!Number.isInteger(n)) throw new RangeError(`addDays needs a whole number of days: ${n}`)
  const d = new Date(requireUtcMs(date) + n * DAY_MS)
  return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** The latest date anyone on Earth can have as "today" (UTC+14 is at most one day ahead of UTC). */
export function maxLoggableDate(now: Date = new Date()): IsoDate {
  return addDays(todayUtc(now), 1)
}

/** -1, 0 or 1, like a sort comparator. Throws on an invalid date. */
export function compareIsoDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  const x = requireUtcMs(a)
  const y = requireUtcMs(b)
  return x < y ? -1 : x > y ? 1 : 0
}
