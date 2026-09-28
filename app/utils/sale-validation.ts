// Field-level checks for the Log/Edit sale form (feature 04 §2.5 R3, AC13, AC15, AC19, AC20, AC23, AC24),
// in the ClientForm.vue style (manual per-field checks, not a zod schema): a field is checked on blur and
// on Save; the message clears the moment the value is valid. Pure, so tests import it directly. These
// mirror the M15 migration's CHECK constraints (§3.1) and the limits in `shared/constants/sales.ts`; they
// must stay in agreement with `shared/schemas/sales.ts` (the server's own, authoritative checks).
import type { IsoDate } from '#shared/types/api'
import { compareIsoDates, isIsoDate } from '#shared/utils/local-date'
import { formatQty, toEggs } from '#shared/utils/quantity'
import { formatPrice, parsePriceInput } from '#shared/utils/price'
import { formatShortDate } from './day-label'
import { MAX_EGGS_PER_SALE_LINE, MAX_SALE_PRICE } from '#shared/constants/sales'
import { SALE_COPY } from './sale-copy'

export interface QuantityValue { trays: number | null, loose: number | null }

export type FieldResult<T> = { ok: true, value: T } | { ok: false, message: string }

/** AC20: whole numbers only, loose < eggsPerTray, at least 1 egg, at most MAX_EGGS_PER_SALE_LINE. */
export function checkLineQuantity(value: QuantityValue, eggsPerTray: number): FieldResult<number> {
  if (value.trays === null && value.loose === null) return { ok: false, message: SALE_COPY.quantityRequired }
  const trays = value.trays ?? 0
  const loose = value.loose ?? 0
  if (!Number.isInteger(trays) || !Number.isInteger(loose) || trays < 0 || loose < 0) {
    return { ok: false, message: SALE_COPY.quantityNotWhole }
  }
  if (loose > eggsPerTray - 1) return { ok: false, message: SALE_COPY.quantityLooseTooHigh(eggsPerTray) }
  const eggs = toEggs(trays, loose, eggsPerTray)
  if (eggs < 1) return { ok: false, message: SALE_COPY.quantityRequired }
  if (eggs > MAX_EGGS_PER_SALE_LINE) return { ok: false, message: SALE_COPY.quantityTooBig(formatQty(MAX_EGGS_PER_SALE_LINE, eggsPerTray)) }
  return { ok: true, value: eggs }
}

/** AC19: required, > 0, at most 2 decimals, at most MAX_SALE_PRICE. Unlike a client's default price, blank fails. */
export function checkLinePrice(raw: string, currency?: string | null): FieldResult<number> {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, message: SALE_COPY.priceRequired }
  const parsed = parsePriceInput(trimmed)
  if (!parsed.ok) {
    switch (parsed.reason) {
      case 'not_a_number': return { ok: false, message: SALE_COPY.priceNotANumber }
      case 'not_positive': return { ok: false, message: SALE_COPY.priceNotPositive }
      case 'too_many_decimals': return { ok: false, message: SALE_COPY.priceTooManyDecimals }
      case 'too_large': return { ok: false, message: SALE_COPY.priceTooLarge(formatPrice(MAX_SALE_PRICE, currency)) }
    }
  }
  if (parsed.value === null) return { ok: false, message: SALE_COPY.priceRequired }
  return { ok: true, value: parsed.value }
}

/** AC13: a Delivery needs a client. */
export function checkSaleClient(type: 'delivery' | 'on_site', clientId: string | null): FieldResult<string | null> {
  if (type === 'delivery' && !clientId) return { ok: false, message: SALE_COPY.clientRequired }
  return { ok: true, value: clientId }
}

/** AC23: required, not in the future (relative to the device's local `today`). */
export function checkSaleDate(date: string, today: IsoDate): FieldResult<IsoDate> {
  if (!isIsoDate(date)) return { ok: false, message: SALE_COPY.dateEmpty }
  if (compareIsoDates(date, today) > 0) return { ok: false, message: SALE_COPY.saleDateFuture }
  return { ok: true, value: date }
}

/** AC24, AC33: required, not before the sale date, not in the future. */
export function checkDeliveredDate(date: string, saleDate: IsoDate, today: IsoDate): FieldResult<IsoDate> {
  if (!isIsoDate(date)) return { ok: false, message: SALE_COPY.dateEmpty }
  if (compareIsoDates(date, saleDate) < 0) return { ok: false, message: SALE_COPY.deliveredBeforeSale(formatShortDate(saleDate, today)) }
  if (compareIsoDates(date, today) > 0) return { ok: false, message: SALE_COPY.deliveredDateFuture }
  return { ok: true, value: date }
}
