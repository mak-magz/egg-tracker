// Pure rules for the Orders list (feature 05 AC3 to AC5): which orders a set of filters includes, and the two sort
// orders. Kept free of Nuxt auto-imports so tests/unit can drive it. `useOrders` uses these to put an order a write
// just returned into the page the owner is looking at.
import type { IsoDate, Order, OrdersView } from '#shared/types/api'
import { ORDERS_PAGE_SIZE } from '#shared/constants/orders'
import { isOpenStatus } from '#shared/utils/order-status'

import { compareSequenceNumbers } from '../../core/utils/sequence'

export interface OrdersFilters {
  view: OrdersView
  clientId: string | null
  from: IsoDate | null
  to: IsoDate | null
}

export function defaultOrdersFilters(): OrdersFilters {
  return { view: 'open', clientId: null, from: null, to: null }
}

/** Anything besides plain "Open" is a filter the owner set (drives the "Showing x of n" line, AC4). */
export function isFiltering(filters: OrdersFilters): boolean {
  return filters.view !== 'open' || filters.clientId !== null || filters.from !== null || filters.to !== null
}

/** The filters `Filters (n)` counts on a phone: Client and the date range (the status chips are always on screen). */
export function activeFilterCount(filters: OrdersFilters): number {
  return (filters.clientId ? 1 : 0) + (filters.from || filters.to ? 1 : 0)
}

/** True when `order` is included under `filters` (the date range includes both end dates, AC4). */
export function orderMatchesFilters(order: Pick<Order, 'status' | 'clientId' | 'orderDate'>, filters: OrdersFilters): boolean {
  switch (filters.view) {
    case 'open':
      if (!isOpenStatus(order.status)) return false
      break
    case 'fulfilled':
      if (order.status !== 'fulfilled') return false
      break
    case 'cancelled':
      if (order.status !== 'cancelled') return false
      break
    case 'all':
      break
  }
  if (filters.clientId && order.clientId !== filters.clientId) return false
  if (filters.from && order.orderDate < filters.from) return false
  if (filters.to && order.orderDate > filters.to) return false
  return true
}

type SortKeys = Pick<Order, 'wantedBy' | 'orderDate' | 'orderNumber'>

/** AC3, Open view: wanted-by soonest first, then no wanted-by; ties by oldest order, then lowest number. */
export function compareOpenOrders(a: SortKeys, b: SortKeys): number {
  if (a.wantedBy !== b.wantedBy) {
    if (a.wantedBy === null) return 1
    if (b.wantedBy === null) return -1
    return a.wantedBy < b.wantedBy ? -1 : 1
  }
  if (a.orderDate !== b.orderDate) return a.orderDate < b.orderDate ? -1 : 1
  return compareSequenceNumbers(a.orderNumber, b.orderNumber)
}

/** AC3, every other view: newest order date first, then the highest number. */
export function compareOrdersNewestFirst(a: SortKeys, b: SortKeys): number {
  if (a.orderDate !== b.orderDate) return a.orderDate < b.orderDate ? 1 : -1
  return compareSequenceNumbers(b.orderNumber, a.orderNumber)
}

export function compareOrdersFor(view: OrdersView): (a: SortKeys, b: SortKeys) => number {
  return view === 'open' ? compareOpenOrders : compareOrdersNewestFirst
}

/** The GET /api/orders query. Open is never paged (AC5), so it sends no limit or offset. */
export function ordersQuery(filters: OrdersFilters, offset = 0): Record<string, string | number> {
  const q: Record<string, string | number> = { view: filters.view }
  if (filters.view !== 'open') {
    q.limit = ORDERS_PAGE_SIZE
    q.offset = offset
  }
  if (filters.clientId) q.clientId = filters.clientId
  if (filters.from) q.from = filters.from
  if (filters.to) q.to = filters.to
  return q
}
