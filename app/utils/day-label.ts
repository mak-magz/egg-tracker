// Date labels for production (UX R3). Pure; `today` is the device's local IsoDate (todayLocal()).
//   formatDayLabel  -> "Today · Sep 25" / "Sep 24" / "Sep 24, 2025"   (day cards, tooltip)
//   formatDayPhrase -> "today" / "Sep 24" / "Sep 24, 2025"           (inside sentences)
//   formatDateHint  -> "Today" / "Wednesday, Sep 24"                   (form date hint)
//   formatShortDate -> "Sep 24" / "Sep 24, 2025"                       (ranges, chart labels)
// Relative imports: tests/unit imports this file outside Nuxt.
import type { IsoDate } from '#shared/types/api'

function parts(date: IsoDate): { y: number, m: number, d: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 }
}

/** A Date at UTC midnight for `date`, formatted with timeZone UTC so the device zone never shifts it. */
function utcDate(date: IsoDate): Date {
  const { y, m, d } = parts(date)
  return new Date(Date.UTC(y, m - 1, d))
}

function format(date: IsoDate, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(utcDate(date))
}

/** "Sep 24", or "Sep 24, 2025" when the year differs from today's. */
export function formatShortDate(date: IsoDate, today: IsoDate): string {
  const sameYear = parts(date).y === parts(today).y
  return format(date, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDayLabel(date: IsoDate, today: IsoDate): string {
  return date === today ? `Today · ${formatShortDate(date, today)}` : formatShortDate(date, today)
}

export function formatDayPhrase(date: IsoDate, today: IsoDate): string {
  return date === today ? 'today' : formatShortDate(date, today)
}

export function formatDateHint(date: IsoDate, today: IsoDate): string {
  if (date === today) return 'Today'
  const sameYear = parts(date).y === parts(today).y
  return format(date, sameYear
    ? { weekday: 'long', month: 'short', day: 'numeric' }
    : { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}

/** "Fri, Oct 9" (the order's wanted-by line); "Fri, Oct 9, 2026" when the year differs from today's. */
export function formatWeekdayDate(date: IsoDate, today: IsoDate): string {
  const sameYear = parts(date).y === parts(today).y
  return format(date, sameYear
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Month abbreviation + day number parts for chart labels ("Aug", 29). */
export function dayParts(date: IsoDate): { month: string, day: number } {
  return { month: format(date, { month: 'short' }), day: parts(date).d }
}
