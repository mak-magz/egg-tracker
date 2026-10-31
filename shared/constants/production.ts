// Production field keys and copy (docs/features/01-production-logging.md §3.3, §2.5 "Copy").
// The server's `ApiErrorData.fields` keys and the form's messages come from here, so both say the same thing.

/** Keys used in `ApiErrorData.fields` by the production routes. */
export const PRODUCTION_FIELDS = {
  date: 'date', // bad or future date
  amounts: 'amounts', // nothing entered / malformed (e.g. a duplicate size)
  rejects: 'rejects', // rejects not a whole number >= 0 or over the cap
  sizes: 'sizes', // unknown/foreign/archived size -> "Your sizes have changed…"
  from: 'from',
  to: 'to',
  good: (sizeId: string) => `good.${sizeId}`, // a per-size count invalid
} as const

/**
 * Integer-safety cap per line (§3.8 D9, ~33,000 trays at 30). Not a UX tray limit.
 * Also enforced by the DB on every stored row (`production_eggs_range check (eggs between 1 and 1000000)` and
 * the `production_bounds` trigger, TM007, in server/db/adapter.ts), so a day's line can't
 * grow past it through repeated adds either. Keep the two equal: tests/unit/production-schemas.spec.ts checks it.
 */
export const MAX_EGGS_PER_LINE = 1_000_000

/** Max number of size lines in one save (bounds the request; far above any real farm's size list). */
export const MAX_SIZE_LINES = 100

/** §2.5 copy used by validation on both the server and the form. */
export const PRODUCTION_MESSAGES = {
  looseTooHigh: (eggsPerTray: number) => `Loose eggs must be under ${eggsPerTray}. Add a tray instead.`,
  notWholeNumber: 'Enter a whole number, like 12.',
  tooLarge: 'That number is too large. Check it and try again.',
  nothingEntered: 'Enter at least one amount.',
  futureDate: 'You can\'t log a future date. Pick today or earlier.',
  dateRequired: 'Pick a date.',
  endBeforeStart: 'End date must be on or after the start date',
  sizesChanged: 'Your sizes have changed. Close this form and open it again.',
  duplicateSize: 'Each size can appear only once.',
  invalidAmounts: 'Check the amounts and try again.',
  saveFailed: 'Couldn\'t save. Check your connection and try again.',
  editSaveFailed: 'Couldn\'t save your changes. Check your connection and try again.',
  deleteFailed: 'Couldn\'t delete. Check your connection and try again.',
} as const
