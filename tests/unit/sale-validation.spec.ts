import { describe, expect, it } from 'vitest'
import {
  checkDeliveredDate,
  checkLinePrice,
  checkLineQuantity,
  checkSaleClient,
  checkSaleDate,
} from '../../app/utils/sale-validation'
import { SALE_COPY } from '../../app/utils/sale-copy'

describe('checkLineQuantity (AC20, AC21)', () => {
  it('requires a quantity', () => {
    expect(checkLineQuantity({ trays: null, loose: null }, 30)).toEqual({ ok: false, message: SALE_COPY.quantityRequired })
  })

  it('at least 1 egg', () => {
    expect(checkLineQuantity({ trays: 0, loose: 0 }, 30)).toEqual({ ok: false, message: SALE_COPY.quantityRequired })
  })

  it('converts trays + loose to eggs using the FARM tray size, never a fixed 30', () => {
    // 24 per tray: "1 tray + 5" is 29 eggs (AC21)
    expect(checkLineQuantity({ trays: 1, loose: 5 }, 24)).toEqual({ ok: true, value: 29 })
    expect(checkLineQuantity({ trays: 8, loose: 1 }, 30)).toEqual({ ok: true, value: 241 })
  })

  it('loose must be under the tray size', () => {
    const result = checkLineQuantity({ trays: 0, loose: 24 }, 24)
    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toBe(SALE_COPY.quantityLooseTooHigh(24))
  })

  it('rejects a non-integer or negative part', () => {
    expect(checkLineQuantity({ trays: 1.5, loose: 0 }, 30).ok).toBe(false)
    expect(checkLineQuantity({ trays: -1, loose: 0 }, 30).ok).toBe(false)
  })

  it('rejects more than MAX_EGGS_PER_SALE_LINE (100,000)', () => {
    const result = checkLineQuantity({ trays: 3334, loose: 0 }, 30) // 100,020 eggs
    expect(result.ok).toBe(false)
  })

  it('accepts exactly the max', () => {
    expect(checkLineQuantity({ trays: 100000, loose: 0 }, 1)).toEqual({ ok: true, value: 100000 })
  })
})

describe('checkLinePrice (AC19)', () => {
  it('is required (unlike a client\'s optional default price)', () => {
    expect(checkLinePrice('')).toEqual({ ok: false, message: SALE_COPY.priceRequired })
    expect(checkLinePrice('   ')).toEqual({ ok: false, message: SALE_COPY.priceRequired })
  })

  it('accepts a plain positive number with at most 2 decimals', () => {
    expect(checkLinePrice('6.5')).toEqual({ ok: true, value: 6.5 })
    expect(checkLinePrice('6.75')).toEqual({ ok: true, value: 6.75 })
    expect(checkLinePrice('250')).toEqual({ ok: true, value: 250 })
  })

  it('rejects zero, negative, non-numeric, too many decimals, or above the limit', () => {
    expect(checkLinePrice('0').ok).toBe(false)
    expect(checkLinePrice('-1').ok).toBe(false)
    expect(checkLinePrice('abc').ok).toBe(false)
    expect(checkLinePrice('6.505').ok).toBe(false)
    expect(checkLinePrice('10000').ok).toBe(false)
  })

  it('the too-large message quotes the limit in the farm\'s currency', () => {
    const result = checkLinePrice('10000', 'USD')
    expect(result.ok).toBe(false)
    expect((result as { message: string }).message).toContain('$9,999.99')
  })
})

describe('checkSaleClient (AC13)', () => {
  it('a Delivery needs a client', () => {
    expect(checkSaleClient('delivery', null)).toEqual({ ok: false, message: SALE_COPY.clientRequired })
    expect(checkSaleClient('delivery', 'c1')).toEqual({ ok: true, value: 'c1' })
  })

  it('an On-site sale never needs one (walk-in)', () => {
    expect(checkSaleClient('on_site', null)).toEqual({ ok: true, value: null })
    expect(checkSaleClient('on_site', 'c1')).toEqual({ ok: true, value: 'c1' })
  })
})

describe('checkSaleDate / checkDeliveredDate (AC23, AC24, AC33)', () => {
  it('rejects a future sale date', () => {
    expect(checkSaleDate('2026-09-28', '2026-09-27').ok).toBe(false)
    expect(checkSaleDate('2026-09-27', '2026-09-27')).toEqual({ ok: true, value: '2026-09-27' })
    expect(checkSaleDate('2026-09-20', '2026-09-27')).toEqual({ ok: true, value: '2026-09-20' })
  })

  it('a delivered date cannot be before the sale date', () => {
    const result = checkDeliveredDate('2026-09-19', '2026-09-20', '2026-09-27')
    expect(result.ok).toBe(false)
  })

  it('a delivered date cannot be in the future', () => {
    expect(checkDeliveredDate('2026-09-28', '2026-09-20', '2026-09-27').ok).toBe(false)
  })

  it('accepts a delivered date on or after the sale date and not in the future', () => {
    expect(checkDeliveredDate('2026-09-20', '2026-09-20', '2026-09-27')).toEqual({ ok: true, value: '2026-09-20' })
    expect(checkDeliveredDate('2026-09-27', '2026-09-20', '2026-09-27')).toEqual({ ok: true, value: '2026-09-27' })
  })
})
