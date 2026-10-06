import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  compareOpenOrders,
  compareOrdersFor,
  compareOrdersNewestFirst,
  defaultOrdersFilters,
  isFiltering,
  orderMatchesFilters,
  ordersQuery,
} from '../../app/utils/order-list'
import type { OrdersFilters } from '../../app/utils/order-list'
import { ORDERS_PAGE_SIZE } from '../../shared/constants/orders'
import type { Order, OrderStatus } from '../../shared/types/api'

const o = (over: Partial<Pick<Order, 'status' | 'clientId' | 'orderDate' | 'wantedBy' | 'orderNumber'>> = {}) => ({
  status: 'requested' as OrderStatus,
  clientId: 'c1',
  orderDate: '2026-10-03',
  wantedBy: null as string | null,
  orderNumber: 1,
  ...over,
})

describe('orderMatchesFilters (AC4, AC5)', () => {
  it('Open means requested, confirmed, ready and partially fulfilled', () => {
    const f = defaultOrdersFilters()
    for (const status of ['requested', 'confirmed', 'ready', 'partially_fulfilled'] as OrderStatus[]) {
      expect(orderMatchesFilters(o({ status }), f)).toBe(true)
    }
    expect(orderMatchesFilters(o({ status: 'fulfilled' }), f)).toBe(false)
    expect(orderMatchesFilters(o({ status: 'cancelled' }), f)).toBe(false)
  })

  it('All matches everything', () => {
    const f: OrdersFilters = { ...defaultOrdersFilters(), view: 'all' }
    for (const status of ['requested', 'partially_fulfilled', 'fulfilled', 'cancelled'] as OrderStatus[]) {
      expect(orderMatchesFilters(o({ status }), f)).toBe(true)
    }
  })

  it('Fulfilled and Cancelled each match only their own status', () => {
    expect(orderMatchesFilters(o({ status: 'fulfilled' }), { ...defaultOrdersFilters(), view: 'fulfilled' })).toBe(true)
    expect(orderMatchesFilters(o({ status: 'cancelled' }), { ...defaultOrdersFilters(), view: 'fulfilled' })).toBe(false)
    expect(orderMatchesFilters(o({ status: 'cancelled' }), { ...defaultOrdersFilters(), view: 'cancelled' })).toBe(true)
    expect(orderMatchesFilters(o({ status: 'ready' }), { ...defaultOrdersFilters(), view: 'cancelled' })).toBe(false)
  })

  it('the client filter and the date range combine, and the range includes both end dates', () => {
    const f: OrdersFilters = { view: 'all', clientId: 'c1', from: '2026-10-01', to: '2026-10-03' }
    expect(orderMatchesFilters(o({ orderDate: '2026-10-01' }), f)).toBe(true)
    expect(orderMatchesFilters(o({ orderDate: '2026-10-03' }), f)).toBe(true)
    expect(orderMatchesFilters(o({ orderDate: '2026-09-30' }), f)).toBe(false)
    expect(orderMatchesFilters(o({ orderDate: '2026-10-04' }), f)).toBe(false)
    expect(orderMatchesFilters(o({ clientId: 'c2' }), f)).toBe(false)
  })
})

describe('isFiltering / activeFilterCount', () => {
  it('plain Open is not filtering', () => {
    expect(isFiltering(defaultOrdersFilters())).toBe(false)
    expect(activeFilterCount(defaultOrdersFilters())).toBe(0)
  })

  it('any other status chip, a client or a date is filtering', () => {
    expect(isFiltering({ ...defaultOrdersFilters(), view: 'all' })).toBe(true)
    expect(isFiltering({ ...defaultOrdersFilters(), clientId: 'c1' })).toBe(true)
    expect(isFiltering({ ...defaultOrdersFilters(), from: '2026-10-01' })).toBe(true)
  })

  it('the phone Filters button counts the client and the date range (one for the range), not the status chips', () => {
    expect(activeFilterCount({ view: 'all', clientId: null, from: null, to: null })).toBe(0)
    expect(activeFilterCount({ view: 'open', clientId: 'c1', from: null, to: null })).toBe(1)
    expect(activeFilterCount({ view: 'open', clientId: 'c1', from: '2026-10-01', to: '2026-10-02' })).toBe(2)
  })
})

describe('sort order (AC3)', () => {
  it('Open: wanted-by soonest first, then no wanted-by, oldest order first', () => {
    const list = [
      o({ orderNumber: 4, orderDate: '2026-09-01', wantedBy: null }),
      o({ orderNumber: 3, orderDate: '2026-10-02', wantedBy: '2026-10-09' }),
      o({ orderNumber: 2, orderDate: '2026-10-01', wantedBy: '2026-10-05' }),
      o({ orderNumber: 5, orderDate: '2026-09-15', wantedBy: null }),
    ]
    expect([...list].sort(compareOpenOrders).map(x => x.orderNumber)).toEqual([2, 3, 4, 5])
  })

  it('Open: ties on wanted-by fall back to the oldest order, then the lowest number', () => {
    const list = [
      o({ orderNumber: 9, orderDate: '2026-10-02', wantedBy: '2026-10-09' }),
      o({ orderNumber: 8, orderDate: '2026-10-01', wantedBy: '2026-10-09' }),
      o({ orderNumber: 7, orderDate: '2026-10-01', wantedBy: '2026-10-09' }),
    ]
    expect([...list].sort(compareOpenOrders).map(x => x.orderNumber)).toEqual([7, 8, 9])
  })

  it('every other view: newest order date first, then the highest number', () => {
    const list = [
      o({ orderNumber: 1, orderDate: '2026-09-01' }),
      o({ orderNumber: 3, orderDate: '2026-10-02' }),
      o({ orderNumber: 4, orderDate: '2026-10-02' }),
    ]
    expect([...list].sort(compareOrdersNewestFirst).map(x => x.orderNumber)).toEqual([4, 3, 1])
  })

  it('compareOrdersFor picks the Open sort only for the Open view', () => {
    expect(compareOrdersFor('open')).toBe(compareOpenOrders)
    for (const view of ['all', 'fulfilled', 'cancelled'] as const) expect(compareOrdersFor(view)).toBe(compareOrdersNewestFirst)
  })
})

describe('ordersQuery (AC5, AC49)', () => {
  it('Open sends no limit or offset: it is never paged', () => {
    expect(ordersQuery(defaultOrdersFilters())).toEqual({ view: 'open' })
  })

  it('other views page by the shared page size from the offset', () => {
    expect(ordersQuery({ ...defaultOrdersFilters(), view: 'all' })).toEqual({ view: 'all', limit: ORDERS_PAGE_SIZE, offset: 0 })
    expect(ordersQuery({ ...defaultOrdersFilters(), view: 'fulfilled' }, 25)).toEqual({ view: 'fulfilled', limit: ORDERS_PAGE_SIZE, offset: 25 })
  })

  it('carries the client and the dates only when set', () => {
    expect(ordersQuery({ view: 'all', clientId: 'c1', from: '2026-10-01', to: '2026-10-03' })).toEqual({
      view: 'all',
      limit: ORDERS_PAGE_SIZE,
      offset: 0,
      clientId: 'c1',
      from: '2026-10-01',
      to: '2026-10-03',
    })
  })
})
