import type { OrderDetail, OrderLine, OrderStatus } from '../../shared/types/api'
import { describe, expect, it } from 'vitest'
import {
  deliverableLines,
  isOpenStatus,
  ORDER_STATUS_LABEL,
  orderActions,
  orderAfterVoid,
  orderEditRules,
  orderStatusFor,
  orderStatusLabel,
} from '../../shared/utils/order-status'

const L = 'size-large'
const M = 'size-medium'

function line(sizeId: string, ordered: number, delivered: number, over: Partial<OrderLine> = {}): OrderLine {
  return { sizeId, orderedEggs: ordered, deliveredEggs: delivered, remainingEggs: Math.max(ordered - delivered, 0), droppedEggs: 0, pricePerTray: 6.75, lineTotal: 1, ...over }
}
function order(status: OrderStatus, lines: OrderLine[], over: Partial<OrderDetail> = {}): OrderDetail {
  const delivered = lines.some(l => l.deliveredEggs > 0)
  return {
    id: 'o1',
    orderNumber: 12,
    clientId: 'c1',
    orderDate: '2026-10-03',
    wantedBy: null,
    status,
    closedShortAt: null,
    cancelledAt: null,
    convertedFromSaleNumber: null,
    lines,
    orderTotal: 1,
    deliveryCount: delivered ? 1 : 0,
    voidedDeliveryCount: 0,
    version: 1,
    deliveries: [],
    ...over,
  }
}

describe('labels', () => {
  it('has the owner\'s words for every status (O-R5)', () => {
    expect(ORDER_STATUS_LABEL).toEqual({
      requested: 'Requested',
      confirmed: 'Confirmed',
      ready: 'Ready',
      partially_fulfilled: 'Partially fulfilled',
      fulfilled: 'Fulfilled',
      cancelled: 'Cancelled',
    })
  })

  it('adds "(closed short)" only to a fulfilled order that was closed short', () => {
    expect(orderStatusLabel({ status: 'fulfilled', closedShortAt: null })).toBe('Fulfilled')
    expect(orderStatusLabel({ status: 'fulfilled', closedShortAt: '2026-10-08' })).toBe('Fulfilled (closed short)')
    expect(orderStatusLabel({ status: 'ready', closedShortAt: null })).toBe('Ready')
    expect(orderStatusLabel({ status: 'cancelled', closedShortAt: null })).toBe('Cancelled')
  })

  it('isOpenStatus is true for the four open statuses only', () => {
    const open = (['requested', 'confirmed', 'ready', 'partially_fulfilled', 'fulfilled', 'cancelled'] as const).filter(isOpenStatus)
    expect(open).toEqual(['requested', 'confirmed', 'ready', 'partially_fulfilled'])
  })
})

describe('orderActions (AC8, AC21, AC22, AC34)', () => {
  it('Requested: deliver, edit, the other two statuses, cancel', () => {
    expect(orderActions({ status: 'requested', deliveryCount: 0 })).toEqual({ deliver: true, edit: true, status: ['confirmed', 'ready'], cancel: true, closeShort: false })
  })
  it('Confirmed: the two other statuses are Requested and Ready', () => {
    expect(orderActions({ status: 'confirmed', deliveryCount: 0 }).status).toEqual(['requested', 'ready'])
  })
  it('Ready: the two other statuses are Requested and Confirmed', () => {
    expect(orderActions({ status: 'ready', deliveryCount: 0 })).toEqual({ deliver: true, edit: true, status: ['requested', 'confirmed'], cancel: true, closeShort: false })
  })
  it('Partially fulfilled: deliver, edit, close short; no status moves, no cancel', () => {
    expect(orderActions({ status: 'partially_fulfilled', deliveryCount: 1 })).toEqual({ deliver: true, edit: true, status: [], cancel: false, closeShort: true })
  })
  it('Fulfilled and Cancelled offer nothing', () => {
    const none = { deliver: false, edit: false, status: [], cancel: false, closeShort: false }
    expect(orderActions({ status: 'fulfilled', deliveryCount: 2 })).toEqual(none)
    expect(orderActions({ status: 'cancelled', deliveryCount: 0 })).toEqual(none)
  })
  it('never offers a status it already has, and never Partially fulfilled or Fulfilled by hand', () => {
    for (const status of ['requested', 'confirmed', 'ready'] as const) {
      const moves = orderActions({ status, deliveryCount: 0 }).status
      expect(moves).not.toContain(status)
      expect(moves).toHaveLength(2)
    }
  })
  it('hides Cancel on an order with a non-voided delivery, whatever its open status (hand-built data)', () => {
    expect(orderActions({ status: 'ready', deliveryCount: 1 }).cancel).toBe(false)
  })
})

describe('orderEditRules (AC19)', () => {
  it('nothing delivered: nothing locked', () => {
    const rules = orderEditRules(order('confirmed', [line(L, 900, 0), line(M, 300, 0)]))
    expect(rules.clientLocked).toBe(false)
    expect(rules.minEggs).toEqual({})
    expect(rules.lockedSizes.size).toBe(0)
    expect(rules.willFulfil([{ sizeId: L, eggs: 900 }])).toBe(false)
  })

  it('something delivered: client locked, delivered lines have a floor and are locked', () => {
    const rules = orderEditRules(order('partially_fulfilled', [line(L, 900, 600), line(M, 300, 0)]))
    expect(rules.clientLocked).toBe(true)
    expect(rules.minEggs).toEqual({ [L]: 600 })
    expect([...rules.lockedSizes]).toEqual([L])
  })

  it('willFulfil: only when every line is lowered to what was delivered', () => {
    const rules = orderEditRules(order('partially_fulfilled', [line(L, 900, 600), line(M, 300, 0)]))
    expect(rules.willFulfil([{ sizeId: L, eggs: 600 }])).toBe(true) // Medium removed, Large lowered to delivered
    expect(rules.willFulfil([{ sizeId: L, eggs: 600 }, { sizeId: M, eggs: 300 }])).toBe(false)
    expect(rules.willFulfil([{ sizeId: L, eggs: 900 }])).toBe(false)
    expect(rules.willFulfil([{ sizeId: L, eggs: 600 }, { sizeId: 'new', eggs: 30 }])).toBe(false) // a new line is still owed
    expect(rules.willFulfil([])).toBe(false)
  })
})

describe('orderStatusFor (twin of SQL app.order_status_for)', () => {
  // Shared fixture table: current status, closed short, lines [ordered, delivered] -> status. Assert the same rows in pgTAP (D9).
  const table: [OrderStatus, boolean, [number, number][], OrderStatus][] = [
    ['requested', false, [[300, 0]], 'requested'],
    ['confirmed', false, [[300, 0], [100, 0]], 'confirmed'],
    ['ready', false, [[300, 0]], 'ready'],
    ['partially_fulfilled', false, [[300, 0]], 'ready'], // the last delivery was voided
    ['fulfilled', false, [[300, 0]], 'ready'],
    ['ready', false, [[300, 120]], 'partially_fulfilled'],
    ['requested', false, [[300, 120]], 'partially_fulfilled'],
    ['partially_fulfilled', false, [[300, 300], [100, 40]], 'partially_fulfilled'],
    ['ready', false, [[300, 300]], 'fulfilled'],
    ['partially_fulfilled', false, [[300, 300], [100, 100]], 'fulfilled'],
    ['fulfilled', false, [[300, 300], [100, 40]], 'partially_fulfilled'],
    ['fulfilled', true, [[300, 200]], 'fulfilled'], // closed short stays
    ['fulfilled', true, [[300, 0]], 'fulfilled'],
    ['cancelled', false, [[300, 0]], 'cancelled'],
  ]
  it.each(table)('%s (closed short: %s) %j -> %s', (current, closedShort, lines, expected) => {
    const mapped = lines.map(([orderedEggs, deliveredEggs]) => ({ orderedEggs, deliveredEggs }))
    expect(orderStatusFor(current, closedShort, mapped)).toBe(expected)
  })
})

describe('orderAfterVoid (AC35, D9)', () => {
  const delivery = (saleId: string, lines: { sizeId: string, eggs: number }[], voidedAt: string | null = null) => ({ saleId, saleNumber: 52, deliveredDate: '2026-10-05', voidedAt, lines })

  it('last delivery of a partially fulfilled order: back to Ready, everything owed again', () => {
    const o = order('partially_fulfilled', [line(L, 900, 600), line(M, 300, 0)], { deliveries: [delivery('s1', [{ sizeId: L, eggs: 600 }])] })
    expect(orderAfterVoid(o, 's1')).toEqual({ status: 'ready', owed: [{ sizeId: L, eggs: 900 }, { sizeId: M, eggs: 300 }], stays: null })
  })

  it('one of two deliveries of a fulfilled order: Partially fulfilled, only that delivery owed', () => {
    const o = order('fulfilled', [line(L, 900, 900)], {
      deliveries: [delivery('s2', [{ sizeId: L, eggs: 300 }]), delivery('s1', [{ sizeId: L, eggs: 600 }])],
    })
    expect(orderAfterVoid(o, 's2')).toEqual({ status: 'partially_fulfilled', owed: [{ sizeId: L, eggs: 300 }], stays: null })
  })

  it('the only delivery of a fulfilled order: Ready', () => {
    const o = order('fulfilled', [line(L, 900, 900)], { deliveries: [delivery('s1', [{ sizeId: L, eggs: 900 }])] })
    expect(orderAfterVoid(o, 's1')).toEqual({ status: 'ready', owed: [{ sizeId: L, eggs: 900 }], stays: null })
  })

  it('a partial delivery on a partially fulfilled order with another delivery remaining stays Partially fulfilled', () => {
    const o = order('partially_fulfilled', [line(L, 900, 500)], {
      deliveries: [delivery('s2', [{ sizeId: L, eggs: 200 }]), delivery('s1', [{ sizeId: L, eggs: 300 }])],
    })
    expect(orderAfterVoid(o, 's2')).toEqual({ status: 'partially_fulfilled', owed: [{ sizeId: L, eggs: 600 }], stays: null })
  })

  it('a closed-short order stays Fulfilled and closed; nothing is shown as owed', () => {
    const o = order('fulfilled', [line(L, 900, 600, { droppedEggs: 300 })], { closedShortAt: '2026-10-08', deliveries: [delivery('s1', [{ sizeId: L, eggs: 600 }])] })
    expect(orderAfterVoid(o, 's1')).toEqual({ status: 'fulfilled', owed: [], stays: 'closed_short' })
  })

  it('a voided or unknown sale changes nothing', () => {
    const o = order('partially_fulfilled', [line(L, 900, 600)], { deliveries: [delivery('s1', [{ sizeId: L, eggs: 600 }]), delivery('sv', [{ sizeId: L, eggs: 50 }], '2026-10-06')] })
    expect(orderAfterVoid(o, 'sv')).toEqual({ status: 'partially_fulfilled', owed: [{ sizeId: L, eggs: 300 }], stays: null })
    expect(orderAfterVoid(o, 'nope').status).toBe('partially_fulfilled')
  })

  it('does not mutate the order', () => {
    const o = order('fulfilled', [line(L, 900, 900)], { deliveries: [delivery('s1', [{ sizeId: L, eggs: 900 }])] })
    const before = JSON.stringify(o)
    orderAfterVoid(o, 's1')
    expect(JSON.stringify(o)).toBe(before)
  })
})

describe('deliverableLines (AC24)', () => {
  it('lists only lines with something remaining, in order', () => {
    const o = order('partially_fulfilled', [line(L, 900, 900), line(M, 300, 120)])
    expect(deliverableLines(o).map(l => [l.sizeId, l.remainingEggs])).toEqual([[M, 180]])
  })
  it('is empty when nothing remains (fulfilled, cancelled, closed short all report 0 remaining)', () => {
    expect(deliverableLines(order('cancelled', [line(L, 900, 0, { remainingEggs: 0 })]))).toEqual([])
  })
})
