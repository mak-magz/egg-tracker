// The ONE price rule (docs/features/03-clients.md §3.3, UX R5, AC13, AC36, AC37), the counterpart of quantity.ts.
// A price is a plain number (the amount the owner typed, per tray) shown in the farm's currency
// (`useFarm().currency`): symbol first, always 2 decimals, comma thousands ("₱1,250.00"). No screen types a
// symbol, and nothing here multiplies or converts, so a currency change only relabels (AC37).
// Pure, so tests import it directly. The Sales feature reuses `formatPrice` for the prices it stores.
import { CLIENT_MESSAGES, CLIENT_PRICE_DECIMALS, MAX_CLIENT_PRICE } from '../constants/clients'
import { DEFAULT_CURRENCY } from '../constants/currency'

let supported: ReadonlySet<string> | null | undefined

function supportedCurrencies(): ReadonlySet<string> | null {
  if (supported === undefined) {
    try {
      supported = new Set(Intl.supportedValuesOf('currency'))
    }
    catch {
      supported = null // a runtime without Intl.supportedValuesOf: fall back to the format check below
    }
  }
  return supported
}

/**
 * True for an upper-case ISO 4217 code this runtime can format (`Intl.supportedValuesOf('currency')`), so `ZZZ`,
 * `XXX`, `php`, `''` and `undefined` are not known (the database only checks the three-capital-letter format).
 */
export function isKnownCurrency(code: string | null | undefined): code is string {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false
  const list = supportedCurrencies()
  return list ? list.has(code) : true
}

/** A missing, malformed or unknown code shows as the default (₱), so a bad value never breaks a screen (AC36). */
function resolveCurrency(currency: string | null | undefined): string {
  return isKnownCurrency(currency) ? currency : DEFAULT_CURRENCY
}

const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string): Intl.NumberFormat {
  let nf = formatters.get(currency)
  if (!nf) {
    // A FIXED locale (unlike formatQty, which follows the device): the server, the browser and the tests must
    // print the same string. `narrowSymbol` gives `$` (not `US$`) and `₱`.
    nf = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: CLIENT_PRICE_DECIMALS,
      maximumFractionDigits: CLIENT_PRICE_DECIMALS,
    })
    formatters.set(currency, nf)
  }
  return nf
}

/** `₱6.50`, `₱250.00`, `₱1,250.00`, `$6.50`. Always 2 decimals. Throws RangeError for a non-finite amount (a bug, like `formatQty`). */
export function formatPrice(amount: number, currency?: string | null): string {
  if (!Number.isFinite(amount)) throw new RangeError(`amount must be a finite number: ${amount}`)
  return formatterFor(resolveCurrency(currency)).format(amount === 0 ? 0 : amount) // 0 and -0 both print 0.00
}

/** Only the symbol (`₱`, `$`), for the form's prefix. Unknown codes give the default's symbol. */
export function currencySymbol(currency?: string | null): string {
  const part = formatterFor(resolveCurrency(currency)).formatToParts(0).find(p => p.type === 'currency')
  return part?.value ?? resolveCurrency(currency)
}

export type PriceProblem = 'not_positive' | 'too_large' | 'too_many_decimals'
export type PriceInputProblem = 'not_a_number' | PriceProblem

/**
 * More than 2 decimals, read from a plain decimal string. Trailing zeros don't count ("6.500" is fine). They are
 * trimmed with a loop, not `/0+$/`, which is quadratic on "0000...01" (security audit L7).
 */
function hasTooManyDecimals(decimal: string): boolean {
  const fraction = decimal.split('.')[1] ?? ''
  let end = fraction.length
  while (end > 0 && fraction[end - 1] === '0') end--
  return end > CLIENT_PRICE_DECIMALS
}

/**
 * The rule for a price NUMBER (an API body or a parsed field), same order as the database: above 0, at most
 * 9,999.99, at most 2 decimals. NaN counts as `not_positive`. Decimals are counted from `String(n)`; a value
 * printed with an exponent can only be tiny here (big ones are `too_large` first), so it has too many decimals.
 */
export function checkPriceNumber(n: number): PriceProblem | null {
  if (!(n > 0)) return 'not_positive'
  if (n > MAX_CLIENT_PRICE) return 'too_large'
  const text = String(n)
  if (text.includes('e') || hasTooManyDecimals(text)) return 'too_many_decimals'
  return null
}

export type ParsedPrice
  = | { ok: true, value: number | null }
    | { ok: false, reason: PriceInputProblem }

/**
 * The form's read of the price field. Trims; blank means "no default price" (`value: null`). Only digits with one
 * optional `.` are numbers: a comma, a letter or a symbol is `not_a_number`, so "6,5" is never read as 65. A leading
 * `-` on a number reads as `not_positive`. Decimals are counted after stripping trailing zeros ("6.500" is fine,
 * "6.505" is not). Returns the value as a number (6.5), never a string.
 */
export function parsePriceInput(raw: string): ParsedPrice {
  const text = raw.trim()
  if (text === '') return { ok: true, value: null }
  const negative = text.startsWith('-')
  const digits = negative ? text.slice(1) : text
  // Linear: `\d+(?:\.\d*)?` matches a string in only one way, unlike `\d+\.?\d*` (60,000 digits and "x" took 2.5 s,
  // security audit L7). Same language: digits with at most one `.`, and at least one digit.
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(digits)) return { ok: false, reason: 'not_a_number' }
  const value = Number(digits)
  if (negative || value === 0) return { ok: false, reason: 'not_positive' }
  if (value > MAX_CLIENT_PRICE) return { ok: false, reason: 'too_large' }
  if (hasTooManyDecimals(digits)) return { ok: false, reason: 'too_many_decimals' }
  return { ok: true, value }
}

/** The plain field text for the Edit form: digits and 2 decimals, no symbol or separator (`250.00`). */
export function formatPriceInput(n: number): string {
  return n.toFixed(CLIENT_PRICE_DECIMALS)
}

/**
 * A sale line's total (docs/features/04-sales.md AC22): price per tray x eggs / eggs per tray, rounded to the
 * nearest centavo, HALF UP, using exact integer (BigInt) arithmetic -- never a float division, so it agrees with
 * `app.sale_line_total` (the SQL twin, `round(price * eggs / eggs_per_tray, 2)`) for every input. `pricePerTray`
 * must already have at most 2 decimals (checkPriceNumber / the database CHECK enforce this before a line is ever
 * saved); Math.round on `pricePerTray * 100` only guards against the last bit of float noise on an exact value.
 * The *stored* total always comes from the server response (AC55) -- this is for the form's LIVE preview only.
 */
export function computeLineTotal(pricePerTray: number, eggs: number, eggsPerTray: number): number {
  if (!Number.isFinite(pricePerTray) || pricePerTray <= 0) {
    throw new RangeError(`pricePerTray must be a positive finite number: ${pricePerTray}`)
  }
  if (!Number.isInteger(eggs) || eggs < 0) throw new RangeError(`eggs must be a whole number of at least 0: ${eggs}`)
  if (!Number.isInteger(eggsPerTray) || eggsPerTray < 1) {
    throw new RangeError(`eggsPerTray must be a whole number of at least 1: ${eggsPerTray}`)
  }
  const priceCents = BigInt(Math.round(pricePerTray * 100))
  const numerator = priceCents * BigInt(eggs)
  const denominator = BigInt(eggsPerTray)
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  // Half up (both operands are always non-negative here): a remainder of exactly half rounds away from zero.
  const totalCents = remainder * 2n >= denominator ? quotient + 1n : quotient
  return Number(totalCents) / 100
}

/**
 * The field message for a price problem (UX "Copy"). `too_large` quotes the limit through `formatPrice`, so it
 * follows the farm's currency ("The most you can enter is ₱9,999.99."). Never repeats the typed value (AC29).
 */
export function priceProblemMessage(problem: PriceInputProblem, currency?: string | null): string {
  switch (problem) {
    case 'not_a_number': return CLIENT_MESSAGES.priceNotANumber
    case 'not_positive': return CLIENT_MESSAGES.priceNotPositive
    case 'too_many_decimals': return CLIENT_MESSAGES.priceTooManyDecimals
    case 'too_large': return CLIENT_MESSAGES.priceTooLarge(formatPrice(MAX_CLIENT_PRICE, currency))
  }
}
