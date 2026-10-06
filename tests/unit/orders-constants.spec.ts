import { describe, expect, it } from 'vitest'
import {
  MAX_EGGS_PER_ORDER_LINE,
  MAX_ORDER_LINES,
  MAX_ORDER_PRICE,
  OPEN_ORDER_STATUSES,
  ORDER_FIELDS,
  ORDER_MANUAL_STATUSES,
  ORDER_MESSAGES,
  ORDER_STATUSES,
  ORDERS_PAGE_SIZE,
  ORDERS_VIEWS,
} from '../../shared/constants/orders'
import { MAX_EGGS_PER_SALE_LINE, MAX_SALE_LINES, MAX_SALE_PRICE } from '../../shared/constants/sales'

describe('order field keys', () => {
  it('match the §3.4 contract', () => {
    expect(ORDER_FIELDS.clientId).toBe('clientId')
    expect(ORDER_FIELDS.orderDate).toBe('orderDate')
    expect(ORDER_FIELDS.wantedBy).toBe('wantedBy')
    expect(ORDER_FIELDS.lines).toBe('lines')
    expect(ORDER_FIELDS.deliveredDate).toBe('deliveredDate')
    expect(ORDER_FIELDS.submissionId).toBe('submissionId')
    expect(ORDER_FIELDS.version).toBe('version')
    expect(ORDER_FIELDS.status).toBe('status')
    expect(ORDER_FIELDS.id).toBe('id')
    expect(ORDER_FIELDS.line('abc')).toBe('lines.abc')
  })
})

describe('orders constants', () => {
  it('has the limits of feature 04 (AC12): 20 lines, 100,000 eggs, 9,999.99', () => {
    expect(MAX_ORDER_LINES).toBe(20)
    expect(MAX_EGGS_PER_ORDER_LINE).toBe(100_000)
    expect(MAX_ORDER_PRICE).toBe(9_999.99)
    expect(MAX_ORDER_LINES).toBe(MAX_SALE_LINES)
    expect(MAX_EGGS_PER_ORDER_LINE).toBe(MAX_EGGS_PER_SALE_LINE)
    expect(MAX_ORDER_PRICE).toBe(MAX_SALE_PRICE)
  })

  it('pages the non-Open views 25 at a time (AC49)', () => {
    expect(ORDERS_PAGE_SIZE).toBe(25)
  })

  it('lists the statuses, the hand-set ones, the views and the open set', () => {
    expect(ORDER_STATUSES).toEqual(['requested', 'confirmed', 'ready', 'partially_fulfilled', 'fulfilled', 'cancelled'])
    expect(ORDER_MANUAL_STATUSES).toEqual(['requested', 'confirmed', 'ready'])
    expect(ORDERS_VIEWS).toEqual(['open', 'all', 'fulfilled', 'cancelled'])
    expect(OPEN_ORDER_STATUSES).toEqual(['requested', 'confirmed', 'ready', 'partially_fulfilled'])
  })

  it('the messages are fixed strings: none takes an argument, so none can echo a typed value (AC54)', () => {
    for (const value of Object.values(ORDER_MESSAGES)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('carries the §2.5 server copy verbatim', () => {
    expect(ORDER_MESSAGES.linesMax).toBe('An order can have up to 20 sizes.')
    expect(ORDER_MESSAGES.linesDuplicateSize).toBe('Each size can be in an order once. Change its quantity instead.')
    expect(ORDER_MESSAGES.orderClosed).toBe('This order is already fulfilled or cancelled, so it can\'t be changed.')
    expect(ORDER_MESSAGES.cancelRefused).toBe('This order already has a delivery, so it can\'t be cancelled. Use Close short instead.')
    expect(ORDER_MESSAGES.closeRefused).toBe('Only a partly delivered order can be closed short.')
    expect(ORDER_MESSAGES.orderChanged).toBe('This order was changed somewhere else. The list is up to date now.')
    expect(ORDER_MESSAGES.deliverNone).toBe('Enter a quantity for at least one size.')
    expect(ORDER_MESSAGES.saleLocked).toBe('Void this delivery and deliver again to change eggs.')
    expect(ORDER_MESSAGES.saveFailed).toBe('Couldn\'t save. Check your connection and try again.')
  })
})
