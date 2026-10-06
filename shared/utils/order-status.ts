// Order status rules, in one place (docs/features/05-orders.md §3.0 status machine, §3.5, AC8, AC19, AC21, AC22,
// AC24, AC34, AC35). No template decides these by itself: the row menu, the detail footer, the Edit form, the
// Deliver step and the Void dialog all ask the functions below. Pure, so tests import it directly.
// `orderStatusFor` is the TypeScript twin of SQL `app.order_status_for`; the shared fixture table in
// `tests/unit/order-status.spec.ts` is meant to be asserted in pgTAP too so the two cannot drift (D9).
import type { Order, OrderDetail, OrderLine, OrderLineInput, OrderManualStatus, OrderStatus } from '../types/api'
import { ORDER_MANUAL_STATUSES, OPEN_ORDER_STATUSES } from '../constants/orders'

/** The status as the owner reads it (O-R5). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  ready: 'Ready',
  partially_fulfilled: 'Partially fulfilled',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
}

/** The badge on a delivery that was voided (O-R5). */
export const ORDER_DELIVERY_VOIDED_LABEL = 'Voided'

/** The label of a closed-short order (AC34). */
export const ORDER_CLOSED_SHORT_LABEL = 'Fulfilled (closed short)'

/** Requested, Confirmed, Ready or Partially fulfilled (AC "An open order"). */
export function isOpenStatus(status: OrderStatus): boolean {
  return (OPEN_ORDER_STATUSES as readonly OrderStatus[]).includes(status)
}

/** The badge text: `Fulfilled (closed short)` for a fulfilled order that was closed short, else the plain label. */
export function orderStatusLabel(order: Pick<Order, 'status' | 'closedShortAt'>): string {
  if (order.status === 'fulfilled' && order.closedShortAt) return ORDER_CLOSED_SHORT_LABEL
  return ORDER_STATUS_LABEL[order.status]
}

export interface OrderActions {
  /** Deliver is offered for every open status (AC24, open question 6). */
  deliver: boolean
  /** Edit: everything but Fulfilled and Cancelled (AC19). What may change is `orderEditRules`. */
  edit: boolean
  /** The hand-set statuses offered as a move, never the current one (AC21). Empty once something is delivered. */
  status: OrderManualStatus[]
  /** Cancel order: only before any non-voided delivery (AC22). */
  cancel: boolean
  /** Close short: only while Partially fulfilled (AC34). */
  closeShort: boolean
}

/** What the owner can do with an order (AC8). An action that is not allowed is not offered. */
export function orderActions(order: Pick<Order, 'status' | 'deliveryCount'>): OrderActions {
  const none: OrderActions = { deliver: false, edit: false, status: [], cancel: false, closeShort: false }
  switch (order.status) {
    case 'requested':
    case 'confirmed':
    case 'ready':
      return {
        deliver: true,
        edit: true,
        status: ORDER_MANUAL_STATUSES.filter(s => s !== order.status),
        // Voided deliveries do not count (AC22, G1): deliveryCount is the non-voided ones. A Ready order always has none.
        cancel: order.deliveryCount === 0,
        closeShort: false,
      }
    case 'partially_fulfilled':
      return { deliver: true, edit: true, status: [], cancel: false, closeShort: true }
    case 'fulfilled':
    case 'cancelled':
      return none
  }
}

function deliveredAnything(order: Pick<Order, 'deliveryCount' | 'lines'>): boolean {
  return order.deliveryCount > 0 || order.lines.some(l => l.deliveredEggs > 0)
}

export interface OrderEditRules {
  /** The client can't change once something is delivered (AC19). */
  clientLocked: boolean
  /** Per size: the least its ordered eggs may be, which is what is already delivered (AC19). Only delivered sizes are listed. */
  minEggs: Record<string, number>
  /** Sizes whose line can't be removed or change size (they have deliveries). */
  lockedSizes: Set<string>
  /** True when saving these lines leaves nothing owed, so the order becomes Fulfilled by itself (AC19). */
  willFulfil: (lines: readonly Pick<OrderLineInput, 'sizeId' | 'eggs'>[]) => boolean
}

/** What an Edit may change, from what has been delivered (AC19). Fulfilled and Cancelled aren't editable at all (`orderActions().edit`). */
export function orderEditRules(order: Pick<Order, 'deliveryCount' | 'lines'>): OrderEditRules {
  const minEggs: Record<string, number> = {}
  for (const line of order.lines) {
    if (line.deliveredEggs > 0) minEggs[line.sizeId] = line.deliveredEggs
  }
  const lockedSizes = new Set(Object.keys(minEggs))
  const anyDelivered = deliveredAnything(order)
  return {
    clientLocked: anyDelivered,
    minEggs,
    lockedSizes,
    willFulfil: (lines) => {
      if (!anyDelivered || lines.length === 0) return false
      // Every line of the new set must already be fully delivered. A new or untouched-and-owed line (delivered 0, eggs >= 1) keeps the order open.
      return lines.every(l => l.eggs <= (minEggs[l.sizeId] ?? 0))
    },
  }
}

/**
 * The status the database would give an order from its figures: the TypeScript twin of SQL `app.order_status_for`
 * (3.0). Cancelled or closed short stay as they are; nothing delivered keeps a requested/confirmed/ready status
 * (anything else becomes ready); nothing remaining is fulfilled; otherwise partially fulfilled.
 */
export function orderStatusFor(
  current: OrderStatus,
  closedShort: boolean,
  lines: readonly Pick<OrderLine, 'orderedEggs' | 'deliveredEggs'>[],
): OrderStatus {
  if (current === 'cancelled' || closedShort) return current
  const delivered = lines.reduce((sum, l) => sum + l.deliveredEggs, 0)
  if (delivered === 0) return (ORDER_MANUAL_STATUSES as readonly OrderStatus[]).includes(current) ? current : 'ready'
  const remaining = lines.some(l => l.deliveredEggs < l.orderedEggs)
  return remaining ? 'partially_fulfilled' : 'fulfilled'
}

export interface OrderAfterVoid {
  /** The order's status once that delivery is voided. */
  status: OrderStatus
  /** What the order will show as still owed, per size (only sizes with something owed). Empty for a closed-short or cancelled order. */
  owed: { sizeId: string, eggs: number }[]
  /** `closed_short` when the order was closed short: it stays closed and its dropped amounts don't change (AC35). Otherwise null. */
  stays: 'closed_short' | null
}

/**
 * The Void dialog's preview (AC35, D9): what the order looks like after voiding the delivery `saleId`. A sale that
 * isn't one of the order's deliveries, or is already voided, changes nothing.
 */
export function orderAfterVoid(order: Pick<OrderDetail, 'status' | 'closedShortAt' | 'lines' | 'deliveries'>, saleId: string): OrderAfterVoid {
  const closedShort = order.closedShortAt !== null
  const delivery = order.deliveries.find(d => d.saleId === saleId && d.voidedAt === null)
  const removed = new Map<string, number>()
  for (const l of delivery?.lines ?? []) removed.set(l.sizeId, (removed.get(l.sizeId) ?? 0) + l.eggs)
  const after = order.lines.map(l => ({
    sizeId: l.sizeId,
    orderedEggs: l.orderedEggs,
    deliveredEggs: Math.max(l.deliveredEggs - (removed.get(l.sizeId) ?? 0), 0),
  }))
  const status = orderStatusFor(order.status, closedShort, after)
  const settled = closedShort || order.status === 'cancelled'
  const owed = settled
    ? []
    : after.filter(l => l.orderedEggs > l.deliveredEggs).map(l => ({ sizeId: l.sizeId, eggs: l.orderedEggs - l.deliveredEggs }))
  return { status, owed, stays: closedShort ? 'closed_short' : null }
}

/** The lines the Deliver step lists: only those with eggs still remaining, each pre-filled with `remainingEggs` (AC24). */
export function deliverableLines(order: Pick<Order, 'lines'>): OrderLine[] {
  return order.lines.filter(l => l.remainingEggs > 0)
}
