import { describe, expect, it } from 'vitest'
import {
  checkDeliverDate,
  checkDeliverQuantity,
  checkLineAboveDelivered,
  checkOrderClient,
  checkOrderDate,
  checkOrderDateVsDelivery,
  checkWantedBy,
} from '../../app/utils/order-validation'
import { ORDER_MESSAGES } from '../../shared/constants/orders'

const TODAY = '2026-10-03'
const TRAY = 30

describe('checkOrderClient (AC11)', () => {
  it('requires a client', () => {
    expect(checkOrderClient(null)).toEqual({ ok: false, message: ORDER_MESSAGES.clientRequired })
    expect(checkOrderClient('c1')).toEqual({ ok: true, value: 'c1' })
  })
})

describe('checkOrderDate (AC15)', () => {
  it('needs a date and rejects the future; today and any past date are fine (back-filling)', () => {
    expect(checkOrderDate('', TODAY)).toEqual({ ok: false, message: ORDER_MESSAGES.orderDateRequired })
    expect(checkOrderDate('2026-10-04', TODAY)).toEqual({ ok: false, message: ORDER_MESSAGES.orderDateFuture })
    expect(checkOrderDate(TODAY, TODAY)).toEqual({ ok: true, value: TODAY })
    expect(checkOrderDate('2026-01-01', TODAY)).toEqual({ ok: true, value: '2026-01-01' })
  })
})

describe('checkWantedBy (AC15)', () => {
  it('is optional: empty means none', () => {
    expect(checkWantedBy('', TODAY, TODAY)).toEqual({ ok: true, value: null })
  })

  it('may be any date from the order date onward, including the future', () => {
    expect(checkWantedBy('2026-10-03', '2026-10-03', TODAY)).toEqual({ ok: true, value: '2026-10-03' })
    expect(checkWantedBy('2027-02-01', '2026-10-03', TODAY)).toEqual({ ok: true, value: '2027-02-01' })
  })

  it('rejects one before the order date and names that date', () => {
    const result = checkWantedBy('2026-09-19', '2026-09-20', TODAY)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('Wanted-by can\'t be before the order date, Sep 20.')
  })
})

describe('checkOrderDateVsDelivery (AC57)', () => {
  it('refuses an order date later than the earliest non-voided delivery and names that date', () => {
    const result = checkOrderDateVsDelivery('2026-10-03', '2026-10-01', TODAY)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('The order date can\'t be after its first delivery, Oct 1.')
  })

  it('allows the delivery date itself, anything earlier, and no deliveries at all', () => {
    expect(checkOrderDateVsDelivery('2026-10-01', '2026-10-01', TODAY).ok).toBe(true)
    expect(checkOrderDateVsDelivery('2026-09-01', '2026-10-01', TODAY).ok).toBe(true)
    expect(checkOrderDateVsDelivery('2026-10-03', null, TODAY).ok).toBe(true)
  })
})

describe('checkLineAboveDelivered (AC19)', () => {
  it('a delivered line can\'t go below what was delivered, and the message quotes it in trays', () => {
    const result = checkLineAboveDelivered(300, 600, TRAY)
    expect(result).toEqual({ ok: false, message: 'Can\'t go below what was delivered: 20 trays.' })
  })

  it('exactly the delivered amount is fine, and so is a line with no deliveries', () => {
    expect(checkLineAboveDelivered(600, 600, TRAY).ok).toBe(true)
    expect(checkLineAboveDelivered(1, 0, TRAY).ok).toBe(true)
  })

  it('uses the farm\'s tray size, never a fixed 30', () => {
    expect(checkLineAboveDelivered(10, 29, 24)).toEqual({ ok: false, message: 'Can\'t go below what was delivered: 1 tray + 5.' })
  })
})

describe('checkDeliverQuantity (AC25, AC26)', () => {
  it('blank counts as 0: the line is simply left out', () => {
    expect(checkDeliverQuantity({ trays: null, loose: null }, TRAY, 300)).toEqual({ ok: true, value: 0 })
  })

  it('converts trays + loose with the farm\'s tray size', () => {
    expect(checkDeliverQuantity({ trays: 2, loose: 5 }, TRAY, 300)).toEqual({ ok: true, value: 65 })
    expect(checkDeliverQuantity({ trays: 2, loose: 5 }, 24, 300)).toEqual({ ok: true, value: 53 })
  })

  it('exactly what is left is fine', () => {
    expect(checkDeliverQuantity({ trays: 10, loose: 0 }, TRAY, 300)).toEqual({ ok: true, value: 300 })
  })

  it('more than what is left says how much is left (AC26)', () => {
    expect(checkDeliverQuantity({ trays: 11, loose: 0 }, TRAY, 300)).toEqual({ ok: false, message: 'Only 10 trays left to deliver.' })
    expect(checkDeliverQuantity({ trays: 1, loose: 1 }, TRAY, 31 - 1)).toEqual({ ok: false, message: 'Only 1 tray left to deliver.' })
  })

  it('loose must be under the tray size and parts must be whole numbers', () => {
    expect(checkDeliverQuantity({ trays: 0, loose: 30 }, TRAY, 300).ok).toBe(false)
    expect(checkDeliverQuantity({ trays: 0, loose: 24 }, 24, 300).ok).toBe(false)
    expect(checkDeliverQuantity({ trays: 1.5, loose: 0 }, TRAY, 300).ok).toBe(false)
    expect(checkDeliverQuantity({ trays: -1, loose: 0 }, TRAY, 300).ok).toBe(false)
  })
})

describe('checkDeliverDate (AC24)', () => {
  it('is required, not before the order date and not in the future', () => {
    expect(checkDeliverDate('', '2026-10-01', TODAY).ok).toBe(false)
    expect(checkDeliverDate('2026-09-30', '2026-10-01', TODAY)).toEqual({ ok: false, message: 'The delivered date can\'t be before the order date, Oct 1.' })
    expect(checkDeliverDate('2026-10-04', '2026-10-01', TODAY)).toEqual({ ok: false, message: ORDER_MESSAGES.deliveredDateFuture })
  })

  it('accepts the order date, today and anything between', () => {
    expect(checkDeliverDate('2026-10-01', '2026-10-01', TODAY).ok).toBe(true)
    expect(checkDeliverDate(TODAY, '2026-10-01', TODAY).ok).toBe(true)
    expect(checkDeliverDate('2026-10-02', '2026-10-01', TODAY).ok).toBe(true)
  })
})
