// Order field keys, limits and copy (docs/features/05-orders.md §3.4, §2.5 "Copy").
// The server's `ApiErrorData.fields` keys and the form's messages come from here, so both say the same thing.
// No message here ever repeats a client's name, phone, price, quantity or date: every value is a fixed string, so
// none can echo a typed value (AC54). Messages that need a number or a date ("Only {n} left to deliver.",
// "Wanted-by can't be before the order date, {Sep 20}.") are built by the frontend (`app/utils/order-copy.ts`)
// from the matching fixed message here plus the value it already holds.
import type { OrderManualStatus, OrdersView, OrderStatus } from '../types/api'
import { MAX_EGGS_PER_SALE_LINE, MAX_SALE_LINES, MAX_SALE_PRICE, SALE_PRICE_DECIMALS } from './sales'

/** Keys used in `ApiErrorData.fields` by the orders routes (§3.4). */
export const ORDER_FIELDS = {
  clientId: 'clientId',
  orderDate: 'orderDate',
  wantedBy: 'wantedBy',
  lines: 'lines',
  deliveredDate: 'deliveredDate',
  submissionId: 'submissionId',
  version: 'version',
  status: 'status',
  id: 'id',
  /** A per-line message, keyed by that line's size (same shape as SALE_FIELDS.line). */
  line: (sizeId: string) => `lines.${sizeId}`,
} as const

/** An order has 1 to 20 lines (AC12). Equals the sale bound and the TM028 bound in the M17 migration. */
export const MAX_ORDER_LINES = MAX_SALE_LINES

/** Most eggs one order line can hold (AC12): feature 04's bound, unchanged. Equals the order_lines eggs CHECK in M17. */
export const MAX_EGGS_PER_ORDER_LINE = MAX_EGGS_PER_SALE_LINE

/** Largest price per tray on an order line (AC12): feature 04's bound, unchanged. */
export const MAX_ORDER_PRICE = MAX_SALE_PRICE

/** Most decimals an order line's price may have (AC12). */
export const ORDER_PRICE_DECIMALS = SALE_PRICE_DECIMALS

/** "Show more" page size for every Orders view except Open (AC5, AC49). Open is never paged. */
export const ORDERS_PAGE_SIZE = 25

/** Every status, in the owner's order (AC "Statuses"). Kept in step with the OrderStatus type by `satisfies`. */
export const ORDER_STATUSES = ['requested', 'confirmed', 'ready', 'partially_fulfilled', 'fulfilled', 'cancelled'] as const satisfies readonly OrderStatus[]

/** The three statuses an owner can set by hand (AC21). */
export const ORDER_MANUAL_STATUSES = ['requested', 'confirmed', 'ready'] as const satisfies readonly OrderManualStatus[]

/** The status chips, Open first (AC4). */
export const ORDERS_VIEWS = ['open', 'all', 'fulfilled', 'cancelled'] as const satisfies readonly OrdersView[]

/** The statuses that count as an open order (AC "An open order"). */
export const OPEN_ORDER_STATUSES = ['requested', 'confirmed', 'ready', 'partially_fulfilled'] as const satisfies readonly OrderStatus[]

/** §2.5 copy used by validation and error mapping on both the server and the form. */
export const ORDER_MESSAGES = {
  // Header
  clientRequired: 'Choose a client.',
  clientInvalid: 'This client is inactive now. Choose another client.',
  orderDateFuture: 'The order date can\'t be in the future. Pick today or earlier.',
  orderDateRequired: 'Pick a date.',
  /** The base of "Wanted-by can't be before the order date, {Sep 20}." (the form appends the date). */
  wantedByBeforeOrder: 'Wanted-by can\'t be before the order date.',
  /** AC57. The form appends the first delivery's date. */
  orderDateAfterFirstDelivery: 'The order date can\'t be after its first delivery.',
  endBeforeStart: 'End date must be on or after the start date',
  // Lines
  linesMinOne: 'Add at least one size.',
  linesMax: 'An order can have up to 20 sizes.',
  linesDuplicateSize: 'Each size can be in an order once. Change its quantity instead.',
  linesSizesChanged: 'Your sizes have changed. Close this form and open it again.',
  /** A server-only backstop (a hand-built request): the schema already gives a field-specific message in the normal flow. */
  linesInvalid: 'Check your lines and try again.',
  quantityRequired: 'Enter a quantity.',
  quantityTooLarge: 'That number is too large. Check it and try again.',
  priceNotANumber: 'Use numbers only, like 6.50.',
  priceNotPositive: 'Enter a price above 0.',
  priceTooManyDecimals: 'Use 2 decimals at most, like 6.50.',
  priceTooLargeServer: 'The most you can enter is 9,999.99.',
  /** Edit after a delivery (TM051 below_delivered). The form says "Can't go below what was delivered: {qty}." */
  belowDelivered: 'Can\'t go below what was delivered.',
  /** Edit after a delivery (TM051 line_locked): a delivered line can't be removed or change size. */
  lineLocked: 'This size already has a delivery, so it can\'t be removed or changed.',
  /** Edit after a delivery (TM051 client_locked). Also the locked-field helper text. */
  clientLocked: 'Can\'t change after a delivery.',
  // Deliver
  deliveredDateFuture: 'The delivered date can\'t be in the future. Pick today or earlier.',
  /** The form appends the order date: "...before the order date, {Oct 3}." */
  deliveredDateBeforeOrder: 'The delivered date can\'t be before the order date.',
  deliverNone: 'Enter a quantity for at least one size.',
  /** 409 over_delivery (AC26). The step's per-line "Only {qty} left to deliver." is built by the form. */
  overDelivery: 'Part of this order was delivered somewhere else. Check the amounts left.',
  // Requests
  statusInvalid: 'Choose Requested, Confirmed or Ready.',
  filtersInvalid: 'Check your filters and try again.',
  submissionReused: 'This request was already used with different details. Try again.',
  // Conflicts (409)
  orderChanged: 'This order was changed somewhere else. The list is up to date now.',
  orderClosed: 'This order is already fulfilled or cancelled, so it can\'t be changed.',
  cancelRefused: 'This order already has a delivery, so it can\'t be cancelled. Use Close short instead.',
  /** 409 has_delivery on POST /status (TM049): a partly delivered order's status comes from its deliveries. */
  statusLocked: 'This order already has a delivery, so its status can\'t be set by hand.',
  closeRefused: 'Only a partly delivered order can be closed short.',
  /** 409 sale_locked on PUT /api/sales/:id (AC36). */
  saleLocked: 'Void this delivery and deliver again to change eggs.',
  // Failures with no server reason
  saveFailed: 'Couldn\'t save. Check your connection and try again.',
  editSaveFailed: 'Couldn\'t save your changes. Check your connection and try again.',
  deliverFailed: 'Couldn\'t deliver. Check your connection and try again.',
  cancelFailed: 'Couldn\'t cancel. Check your connection and try again.',
  closeFailed: 'Couldn\'t close the order. Check your connection and try again.',
  loadFailed: 'Check your connection and try again.',
} as const
