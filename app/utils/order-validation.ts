// Field-level checks for the New / Edit order form and the Deliver step (feature 05 §2.5 O-R3, AC9 to AC15, AC19,
// AC24 to AC26, AC57), in the sale-validation.ts style: manual per-field checks, pure so tests import them. The
// line rules (quantity, price) are feature 04's, unchanged (AC12), so they are re-used from sale-validation. Messages
// that carry a value (a quantity, a date) are built here from a fixed base; the server never echoes one (AC54).
import type { IsoDate } from '#shared/types/api'
import { compareIsoDates, isIsoDate } from '#shared/utils/local-date'
import { formatQty, toEggs } from '#shared/utils/quantity'
import { formatShortDate } from './day-label'
import { ORDER_COPY } from './order-copy'
import { SALE_COPY } from './sale-copy'
import type { FieldResult, QuantityValue } from './sale-validation'

/** AC11: a client is required. */
export function checkOrderClient(clientId: string | null): FieldResult<string> {
  if (!clientId) return { ok: false, message: ORDER_COPY.clientRequired }
  return { ok: true, value: clientId }
}

/** AC15: required, not in the future (relative to the device's local `today`). */
export function checkOrderDate(date: string, today: IsoDate): FieldResult<IsoDate> {
  if (!isIsoDate(date)) return { ok: false, message: ORDER_COPY.dateEmpty }
  if (compareIsoDates(date, today) > 0) return { ok: false, message: ORDER_COPY.orderDateFuture }
  return { ok: true, value: date }
}

/** AC15: optional; from the order date onward, no upper limit. An empty value means none. */
export function checkWantedBy(wantedBy: string, orderDate: string, today: IsoDate): FieldResult<IsoDate | null> {
  if (wantedBy === '') return { ok: true, value: null }
  if (!isIsoDate(wantedBy)) return { ok: false, message: ORDER_COPY.dateEmpty }
  if (isIsoDate(orderDate) && compareIsoDates(wantedBy, orderDate) < 0) {
    return { ok: false, message: ORDER_COPY.wantedByBefore(formatShortDate(orderDate, today)) }
  }
  return { ok: true, value: wantedBy }
}

/** AC57: the order date can't move later than the earliest non-voided delivery. `firstDelivery` null = none. */
export function checkOrderDateVsDelivery(orderDate: string, firstDelivery: IsoDate | null, today: IsoDate): FieldResult<null> {
  if (firstDelivery && isIsoDate(orderDate) && compareIsoDates(orderDate, firstDelivery) > 0) {
    return { ok: false, message: ORDER_COPY.orderDateAfterDelivery(formatShortDate(firstDelivery, today)) }
  }
  return { ok: true, value: null }
}

/** AC19: a delivered line can't go below what was delivered. Nothing to check when `minEggs` is 0 or unset. */
export function checkLineAboveDelivered(eggs: number, minEggs: number, eggsPerTray: number): FieldResult<null> {
  if (minEggs > 0 && eggs < minEggs) return { ok: false, message: ORDER_COPY.belowDelivered(formatQty(minEggs, eggsPerTray)) }
  return { ok: true, value: null }
}

/**
 * AC25, AC26: a Deliver-step quantity. Blank counts as 0 (the line is left out). Whole numbers, loose under the tray
 * size, and never more than what is left to deliver ("Only {qty} left to deliver.").
 */
export function checkDeliverQuantity(value: QuantityValue, eggsPerTray: number, remainingEggs: number): FieldResult<number> {
  const trays = value.trays ?? 0
  const loose = value.loose ?? 0
  if (!Number.isInteger(trays) || !Number.isInteger(loose) || trays < 0 || loose < 0) {
    return { ok: false, message: SALE_COPY.quantityNotWhole }
  }
  if (loose > eggsPerTray - 1) return { ok: false, message: SALE_COPY.quantityLooseTooHigh(eggsPerTray) }
  const eggs = toEggs(trays, loose, eggsPerTray)
  if (eggs > remainingEggs) return { ok: false, message: ORDER_COPY.onlyLeft(formatQty(remainingEggs, eggsPerTray)) }
  return { ok: true, value: eggs }
}

/** AC24: required, not before the order date, not in the future. */
export function checkDeliverDate(date: string, orderDate: IsoDate, today: IsoDate): FieldResult<IsoDate> {
  if (!isIsoDate(date)) return { ok: false, message: ORDER_COPY.dateEmpty }
  if (compareIsoDates(date, orderDate) < 0) return { ok: false, message: ORDER_COPY.deliverDateBefore(formatShortDate(orderDate, today)) }
  if (compareIsoDates(date, today) > 0) return { ok: false, message: ORDER_COPY.deliverDateFuture }
  return { ok: true, value: date }
}
