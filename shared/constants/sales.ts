// Sale field keys, limits and copy (docs/features/04-sales.md §3.3, §2.5 "Copy").
// The server's `ApiErrorData.fields` keys and the form's messages come from here, so both say the same thing.
// No message here ever repeats a client's name, phone or a typed value (AC59).
// Every text below is copied verbatim from §2.5's Copy table; `app/utils/sale-copy.ts`'s overlapping keys re-export
// these constants instead of holding a second literal, so the two can never drift again (QA S2, feature 04 §5).

/** Keys used in `ApiErrorData.fields` by the sales routes. */
export const SALE_FIELDS = {
  type: 'type',
  clientId: 'clientId',
  saleDate: 'saleDate',
  deliveredDate: 'deliveredDate',
  lines: 'lines',
  submissionId: 'submissionId',
  version: 'version',
  id: 'id',
  /** A per-line message, keyed by that line's size (mirrors PRODUCTION_FIELDS.good). */
  line: (sizeId: string) => `lines.${sizeId}`,
} as const

/** A sale has 1 to 20 lines (AC15). Equals the TM028 bound in the M15 migration. */
export const MAX_SALE_LINES = 20

/** Most eggs one line can hold (AC20, a PM bound so a mistyped field can't make a nonsense sale). Equals the sale_lines eggs CHECK in M15. Deliberately smaller than production's 1,000,000 (MAX_EGGS_PER_LINE). */
export const MAX_EGGS_PER_SALE_LINE = 100_000

/** Largest price per tray on a line (AC19). Equals the sale_lines price CHECK in M15; the same limit as a client's default price (MAX_CLIENT_PRICE). */
export const MAX_SALE_PRICE = 9_999.99

/** Most decimals a line's price may have (AC19). */
export const SALE_PRICE_DECIMALS = 2

/** "Show more" page size for the sales list (AC7). Not applied when the Status filter is Pending (AC9). */
export const SALES_PAGE_SIZE = 25

/** §2.5 copy used by validation on both the server and the form. */
export const SALE_MESSAGES = {
  clientRequired: 'Choose a client.',
  clientInvalid: 'This client is inactive now. Choose another client.',
  linesMinOne: 'Add at least one size.',
  linesMax: 'A sale can have up to 20 sizes.',
  linesDuplicateSize: 'Each size can be in a sale once. Change its quantity instead.',
  linesSizesChanged: 'Your sizes have changed. Close this form and open it again.',
  /** A server-only backstop message (TM030/TM031 without a per-line identifier attached): the zod schema
   * already gives a field-specific message for these in the normal flow, so this only shows for a hand-built request. */
  linesInvalid: 'Check your lines and try again.',
  quantityRequired: 'Enter a quantity.',
  quantityTooLarge: 'That number is too large. Check it and try again.',
  priceNotANumber: 'Use numbers only, like 6.50.',
  priceNotPositive: 'Enter a price above 0.',
  priceTooManyDecimals: 'Use 2 decimals at most, like 6.50.',
  priceTooLargeServer: 'The most you can enter is 9,999.99.',
  saleDateFuture: 'The sale date can\'t be in the future. Pick today or earlier.',
  saleDateRequired: 'Pick a date.',
  deliveredDateFuture: 'The delivered date can\'t be in the future. Pick today or earlier.',
  deliveredDateBeforeSale: 'The delivered date can\'t be before the sale date.',
  endBeforeStart: 'End date must be on or after the start date',
  submissionReused: 'This request was already used with different details. Try again.',
  saleChanged: 'This sale was changed somewhere else. The list is up to date now.',
  notPending: 'This sale is no longer pending. Void it instead.',
  notComplete: 'This sale isn\'t complete anymore. The list is up to date now.',
  voided: 'This sale is voided and can\'t be changed.',
  saveFailed: 'Couldn\'t save. Check your connection and try again.',
  deleteFailed: 'Couldn\'t delete. Check your connection and try again.',
  voidFailed: 'Couldn\'t void. Check your connection and try again.',
  markDeliveredFailed: 'Couldn\'t mark this delivered. Check your connection and try again.',
} as const
