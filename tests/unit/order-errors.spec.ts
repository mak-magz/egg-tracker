import { describe, expect, it } from 'vitest'
import { FetchError } from 'ofetch'
import { errorCarriesOrder, mapOrderError } from '../../app/utils/order-errors'
import type { OrderDetail } from '../../shared/types/api'

function fetchError(statusCode?: number, data?: unknown): FetchError {
  const e = new FetchError('failed')
  if (statusCode !== undefined) {
    e.statusCode = statusCode
    e.status = statusCode
  }
  e.data = data
  return e
}

const order = (id: string, version = 1): OrderDetail => ({
  id,
  orderNumber: 12,
  clientId: 'c1',
  orderDate: '2026-10-03',
  wantedBy: null,
  status: 'ready',
  closedShortAt: null,
  cancelledAt: null,
  convertedFromSaleNumber: null,
  lines: [],
  orderTotal: 0,
  deliveryCount: 0,
  voidedDeliveryCount: 0,
  version,
  deliveries: [],
})

const conflict = (reason: string, extra: Record<string, unknown> = {}) => fetchError(409, { data: { code: 'conflict', reason, ...extra } })

describe('mapOrderError', () => {
  it('maps a network failure and a gateway error', () => {
    expect(mapOrderError(new TypeError('fetch failed'))).toEqual({ kind: 'network' })
    expect(mapOrderError(fetchError(503))).toEqual({ kind: 'network' })
    expect(mapOrderError(fetchError(504))).toEqual({ kind: 'network' })
  })

  it('maps a 404 to not_found', () => {
    expect(mapOrderError(fetchError(404, { data: { code: 'not_found' } }))).toEqual({ kind: 'not_found' })
  })

  it('maps a 400 to validation with the field messages', () => {
    const fields = { clientId: 'Choose a client.' }
    expect(mapOrderError(fetchError(400, { data: { code: 'validation_failed', fields } }))).toEqual({ kind: 'validation', fields })
  })

  it('a bad id or version on a 400 means the order changed elsewhere', () => {
    expect(mapOrderError(fetchError(400, { data: { code: 'validation_failed', fields: { version: 'bad' } } }))).toEqual({ kind: 'order_changed' })
    expect(mapOrderError(fetchError(400, { data: { code: 'validation_failed', fields: { id: 'bad' } } }))).toEqual({ kind: 'order_changed' })
  })

  it('maps 409 stock_short with the shortfall lines (AC30)', () => {
    const shortfall = [{ sizeId: 's1', onHandEggs: 90, neededEggs: 240 }]
    expect(mapOrderError(conflict('stock_short', { shortfall }))).toEqual({ kind: 'stock_short', shortfall })
  })

  it.each([
    ['order_changed', 'order_changed'],
    ['order_closed', 'order_closed'],
    ['has_delivery', 'has_delivery'],
    ['not_partial', 'not_partial'],
    ['over_delivery', 'over_delivery'],
  ] as const)('maps 409 %s and carries the order as it is now', (reason, kind) => {
    const current = order('o1', 7)
    expect(mapOrderError(conflict(reason, { order: current }))).toEqual({ kind, order: current })
    expect(mapOrderError(conflict(reason))).toEqual({ kind })
  })

  it('maps 409 sale_locked', () => {
    expect(mapOrderError(conflict('sale_locked'))).toEqual({ kind: 'sale_locked' })
  })

  it('an unrecognised conflict or a 500 is unknown', () => {
    expect(mapOrderError(conflict('something_else'))).toEqual({ kind: 'unknown' })
    expect(mapOrderError(fetchError(500, { data: { code: 'internal' } }))).toEqual({ kind: 'unknown' })
  })

  it('never builds anything from a typed value: only fields, the order and the shortfall are carried', () => {
    const result = mapOrderError(fetchError(400, { data: { code: 'validation_failed', fields: { wantedBy: 'x' } }, message: 'Maple Street Market ₱6.75' }))
    expect(JSON.stringify(result)).not.toMatch(/Maple|6\.75/)
  })
})

describe('errorCarriesOrder', () => {
  it('is true only for the kinds whose reply refreshes the list', () => {
    for (const kind of ['order_changed', 'order_closed', 'has_delivery', 'not_partial', 'over_delivery'] as const) {
      expect(errorCarriesOrder(kind)).toBe(true)
    }
    for (const kind of ['network', 'validation', 'stock_short', 'sale_locked', 'not_found', 'unknown'] as const) {
      expect(errorCarriesOrder(kind)).toBe(false)
    }
  })
})
