import { describe, expect, it } from 'vitest'
import { FetchError } from 'ofetch'
import { mapSaleError } from '../../app/utils/sale-errors'
import type { Sale } from '../../shared/types/api'

function fetchError(statusCode?: number, data?: unknown): FetchError {
  const e = new FetchError('failed')
  if (statusCode !== undefined) {
    e.statusCode = statusCode
    e.status = statusCode
  }
  e.data = data
  return e
}

const sale = (id: string, version = 1): Sale => ({
  id,
  saleNumber: 1,
  type: 'delivery',
  clientId: null,
  saleDate: '2026-09-27',
  orderId: null,
  orderNumber: null,
  lines: [],
  saleTotal: 0,
  version,
  voidedAt: null,
})

describe('mapSaleError', () => {
  it('maps a network failure and a gateway error', () => {
    expect(mapSaleError(new TypeError('fetch failed'))).toEqual({ kind: 'network' })
    expect(mapSaleError(fetchError(503))).toEqual({ kind: 'network' })
    expect(mapSaleError(fetchError(504))).toEqual({ kind: 'network' })
  })

  it('maps a 404 to not_found', () => {
    expect(mapSaleError(fetchError(404, { data: { code: 'not_found' } }))).toEqual({ kind: 'not_found' })
  })

  it('maps a 400 to validation with the field messages', () => {
    const fields = { 'lines.size-1': 'Enter a quantity.' }
    expect(mapSaleError(fetchError(400, { data: { code: 'validation_failed', fields } }))).toEqual({ kind: 'validation', fields })
  })

  it('a bad id/version on a 400 is treated as sale_changed', () => {
    expect(mapSaleError(fetchError(400, { data: { code: 'validation_failed', fields: { version: 'bad' } } }))).toEqual({ kind: 'sale_changed' })
  })

  it('maps 409 stock_short with the shortfall lines', () => {
    const shortfall = [{ sizeId: 's1', onHandEggs: 90, neededEggs: 240 }]
    expect(mapSaleError(fetchError(409, { data: { code: 'conflict', reason: 'stock_short', shortfall } }))).toEqual({ kind: 'stock_short', shortfall })
  })

  it('maps 409 sale_changed / sale_locked / voided, each with the current sale when sent', () => {
    const current = sale('s1', 5)
    expect(mapSaleError(fetchError(409, { data: { code: 'conflict', reason: 'sale_changed', sale: current } }))).toEqual({ kind: 'sale_changed', sale: current })
    expect(mapSaleError(fetchError(409, { data: { code: 'conflict', reason: 'sale_locked', sale: current } }))).toEqual({ kind: 'sale_locked', sale: current })
    expect(mapSaleError(fetchError(409, { data: { code: 'conflict', reason: 'voided', sale: current } }))).toEqual({ kind: 'voided', sale: current })
  })

  it('the retired pending reasons are now just unknown', () => {
    expect(mapSaleError(fetchError(409, { data: { code: 'conflict', reason: 'not_pending' } }))).toEqual({ kind: 'unknown' })
    expect(mapSaleError(fetchError(409, { data: { code: 'conflict', reason: 'not_complete' } }))).toEqual({ kind: 'unknown' })
  })

  it('an unrecognised conflict or a 500 is unknown', () => {
    expect(mapSaleError(fetchError(409, { data: { code: 'conflict', reason: 'something_else' } }))).toEqual({ kind: 'unknown' })
    expect(mapSaleError(fetchError(500, { data: { code: 'internal' } }))).toEqual({ kind: 'unknown' })
  })
})
