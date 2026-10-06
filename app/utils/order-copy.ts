// UI-only copy for the Orders screen (feature 05 §2.5 "Copy"). Messages the server also raises come from
// `shared/constants/orders.ts` (`ORDER_MESSAGES`) rather than a second literal, so the form and the API cannot
// drift. Messages that carry a value (a quantity, a date) are built here from a fixed base plus the value the form
// already holds; no message repeats a typed price or a client's name beyond what is on the order (AC54).
import { ORDER_MESSAGES } from '#shared/constants/orders'

export const ORDER_COPY = {
  pageTitle: 'Orders',
  subtitle: 'What customers are waiting for',
  addLabel: 'Add order',

  // ---- Filters (AC4) ------------------------------------------------------------------------------------
  viewGroupLabel: 'Status',
  viewOpen: 'Open',
  viewAll: 'All',
  viewFulfilled: 'Fulfilled',
  viewCancelled: 'Cancelled',
  clientFilterLabel: 'Client',
  clientFilterAll: 'All clients',
  clientFilterSearchPlaceholder: 'Search clients…',
  clientInactiveOption: (name: string) => `${name} · Inactive`,
  orderDateFilterLabel: 'Order date',
  dateFromLabel: 'From',
  dateToLabel: 'To',
  clearDates: 'Clear dates',
  clear: 'Clear',
  dateRangeInvalid: ORDER_MESSAGES.endBeforeStart,
  filtersButton: 'Filters',
  filtersButtonCount: (n: number) => `Filters (${n})`,
  filtersShow: 'Show filters',
  filtersHide: 'Hide filters',
  showing: (shown: number, total: number) => `Showing ${shown} of ${total} orders`,
  clearFilters: 'Clear filters',
  showMore: 'Show more',

  // ---- List ---------------------------------------------------------------------------------------------
  tableCaption: 'Orders',
  headerOrder: 'Order',
  headerClient: 'Client',
  headerProgress: 'Progress',
  headerTotal: 'Total',
  headerStatus: 'Status',
  headerActions: 'Actions',
  orderNumber: (n: number) => `#${n}`,
  orderTitle: (n: number) => `Order #${n}`,
  wantedBy: (date: string) => `Wanted by ${date}`,
  moreSizes: (n: number) => `+ ${n} more sizes`,
  sizeCount: (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'}`,
  clientUnknown: 'Unknown client',
  deliver: 'Deliver',
  closedShort: 'Closed short',
  cancelledNote: 'Cancelled before anything was delivered',
  openOrderAria: (n: number, client: string, status: string) => `Open order #${n}, ${client}, ${status}`,
  actionsFor: (n: number) => `Actions for order #${n}`,
  deliverAria: (n: number) => `Deliver order #${n}`,

  // ---- Row menu -----------------------------------------------------------------------------------------
  menuDeliver: 'Deliver',
  menuEdit: 'Edit',
  menuMarkConfirmed: 'Mark confirmed',
  menuMarkReady: 'Mark ready',
  menuBackToConfirmed: 'Back to confirmed',
  menuBackToRequested: 'Back to requested',
  menuCancel: 'Cancel order',
  menuCloseShort: 'Close short',

  // ---- Form (AC9 to AC17) -------------------------------------------------------------------------------
  newTitle: 'New order',
  editTitle: (n: number) => `Edit order #${n}`,
  close: 'Close',
  clientLabel: 'Client',
  clientPlaceholder: 'Search or add a client…',
  clientLockedHelper: ORDER_MESSAGES.clientLocked,
  sizeLabel: 'Size',
  usedInOrder: 'In this order',
  usedSizeOption: (name: string) => `${name} (in this order)`,
  addSize: 'Add size',
  addSizeLimitReached: ORDER_MESSAGES.linesMax,
  addSizeAllUsed: 'All your sizes are in this order.',
  orderDateLabel: 'Order date',
  wantedByLabel: 'Wanted by (optional)',
  clearWantedBy: 'Clear wanted-by date',
  today: 'Today',
  orderTotal: (formatted: string) => `Order total ${formatted}`,
  orderTotalSoFar: (formatted: string) => `Order total so far ${formatted}`,
  orderTotalEmpty: 'Order total —',
  cancel: 'Cancel',
  save: 'Save',
  atLeastDelivered: (qty: string) => `At least ${qty} delivered`,
  lockedLineAria: (size: string, qty: string) => `${size}, locked, ${qty} already delivered`,
  lockedPriceNote: 'Price changes only affect future deliveries.',
  becomesFulfilled: 'Everything ordered has been delivered, so this order will be marked Fulfilled.',

  // ---- Validation (AC11 to AC15, AC19, AC57) ------------------------------------------------------------
  clientRequired: ORDER_MESSAGES.clientRequired,
  orderDateFuture: ORDER_MESSAGES.orderDateFuture,
  dateEmpty: ORDER_MESSAGES.orderDateRequired,
  wantedByBefore: (orderDate: string) => `Wanted-by can't be before the order date, ${orderDate}.`,
  orderDateAfterDelivery: (date: string) => `${ORDER_MESSAGES.orderDateAfterFirstDelivery.replace(/\.$/, '')}, ${date}.`,
  belowDelivered: (qty: string) => `Can't go below what was delivered: ${qty}.`,

  // ---- Server messages ----------------------------------------------------------------------------------
  saveFailed: ORDER_MESSAGES.saveFailed,
  editSaveFailed: ORDER_MESSAGES.editSaveFailed,
  tooManySizes: ORDER_MESSAGES.linesMax,
  duplicateSize: ORDER_MESSAGES.linesDuplicateSize,
  sizesChanged: ORDER_MESSAGES.linesSizesChanged,
  clientInactive: ORDER_MESSAGES.clientInvalid,
  orderClosed: ORDER_MESSAGES.orderClosed,
  cancelRefused: ORDER_MESSAGES.cancelRefused,
  statusLocked: ORDER_MESSAGES.statusLocked,
  closeRefused: ORDER_MESSAGES.closeRefused,
  changedElsewhere: ORDER_MESSAGES.orderChanged,

  // ---- Toasts -------------------------------------------------------------------------------------------
  toastSaved: (n: number) => `Order #${n} saved`,
  toastUpdated: (n: number) => `Updated order #${n}`,
  toastUpdatedFulfilled: (n: number) => `Updated order #${n}. It's fulfilled now.`,
  toastStatus: (n: number, status: string) => `Order #${n} is now ${status}.`,
  toastDelivered: (saleNumber: number, orderNumber: number, status: string | null) =>
    `Delivered: sale #${saleNumber}.${status ? ` Order #${orderNumber} is now ${status}.` : ''}`,
  toastCancelled: (n: number) => `Order #${n} cancelled.`,
  toastClosedShort: (n: number) => `Order #${n} closed short.`,
  hiddenByOpenFilter: ' Hidden by the Open filter.',
  hiddenByFilters: ' Hidden by the current filters.',
  actionFailed: (n: number) => `Couldn't update order #${n}. Check your connection and try again.`,
  refreshFailed: 'Couldn\'t refresh your orders.',
  loadMoreFailed: 'Couldn\'t load more orders.',
  tryAgain: 'Try again',
  stackedSaleFailed: 'Couldn\'t open that sale. Check your connection and try again.',

  // ---- Detail (AC7) -------------------------------------------------------------------------------------
  detailClient: 'Client',
  detailOrderDate: 'Order date',
  detailWantedBy: 'Wanted by',
  detailStatus: 'Status',
  statusOptionRequested: 'Requested',
  statusOptionConfirmed: 'Confirmed',
  statusOptionReady: 'Ready',
  detailOrdered: 'Ordered',
  detailDelivered: 'Delivered',
  detailLeft: 'Left',
  detailDropped: 'Dropped',
  atPrice: (price: string) => `At ${price} / tray`,
  detailOrderTotal: 'Order total',
  deliveriesHeading: 'Deliveries',
  noDeliveries: 'No deliveries yet.',
  deliveriesLoadFailed: 'Couldn\'t load the deliveries.',
  saleRow: (n: number, date: string) => `Sale #${n} · ${date}`,
  notCounted: 'Not counted',
  voided: 'Voided',
  openSaleAria: (n: number) => `Open sale #${n}`,
  formerlySale: (n: number) => `Formerly sale #${n}`,
  archived: 'Archived',
  inactive: 'Inactive',
  noteFulfilled: 'Everything ordered was delivered.',
  noteClosedShort: (date: string, dropped: string) => `Closed short on ${date}. Not delivered: ${dropped}.`,
  noteCancelled: (date: string) => `Cancelled on ${date}. It never left the farm.`,
  detailCancelOrder: 'Cancel order',
  detailCloseShort: 'Close short',
  detailEdit: 'Edit',
  detailDeliver: 'Deliver',
  openInOrders: 'Open in Orders',
  openInSales: 'Open in Sales',
  readOnlyNote: 'You are viewing this from another screen.',
  fromOrder: (n: number) => `From order #${n}`,
  openOrderLinkAria: (n: number) => `Open order #${n}`,

  // ---- Deliver step (AC24 to AC31) ----------------------------------------------------------------------
  deliverTitle: (n: number) => `Deliver order #${n}`,
  deliverOrderLine: (n: number, client: string) => `#${n} · ${client}`,
  deliveredDateLabel: 'Delivered date',
  deliveredHint: (todayWord: string, orderDate: string) => `${todayWord} · ordered ${orderDate}`,
  deliverNowLabel: 'Deliver now',
  leftToDeliver: (qty: string) => `${qty} left`,
  thisDelivery: (formatted: string) => `This delivery ${formatted}`,
  notInDelivery: 'Not in this delivery',
  deliverButton: 'Deliver',
  deliverAnyway: 'Deliver anyway',
  checkingStock: 'Checking stock…',
  stockCheckFailed: 'Couldn\'t check stock.',
  onlyLeft: (qty: string) => `Only ${qty} left to deliver.`,
  deliverNone: ORDER_MESSAGES.deliverNone,
  deliverDateBefore: (orderDate: string) => `The delivered date can't be before the order date, ${orderDate}.`,
  deliverDateFuture: ORDER_MESSAGES.deliveredDateFuture,
  shortLead: 'Not enough on hand:',
  shortRow: (size: string, onHand: string, needed: string) => `${size}: ${onHand} on hand, you're delivering ${needed}`,
  shortClosing: 'You can still deliver it.',
  raced: ORDER_MESSAGES.overDelivery,
  deliverFailed: ORDER_MESSAGES.deliverFailed,

  // ---- Cancel / Close short confirms (AC22, AC34) -------------------------------------------------------
  cancelTitle: (n: number) => `Cancel order #${n}?`,
  cancelSummary: (client: string, sizes: number, total: string) => `${client} · ${sizes} ${sizes === 1 ? 'size' : 'sizes'} · ${total}`,
  cancelStockLine: 'It hasn\'t left the farm, so your stock doesn\'t change.',
  cancelNoUndo: (n: number) => `You can't undo this. The number #${n} stays used.`,
  cancelConfirm: 'Cancel order',
  cancelKeep: 'Keep order',
  cancelFailed: ORDER_MESSAGES.cancelFailed,
  closeTitle: (n: number) => `Close order #${n} short?`,
  closeOne: (qty: string, size: string) => `Closing short drops ${qty} of ${size}. Deliveries already made stay.`,
  closeMany: 'Closing short drops:',
  closeManyClosing: 'Deliveries already made stay.',
  closeNoUndo: 'Your stock doesn\'t change. You can\'t undo this.',
  closeConfirm: 'Close short',
  closeKeep: 'Keep open',
  closeFailed: ORDER_MESSAGES.closeFailed,

  // ---- Discard ------------------------------------------------------------------------------------------
  discardTitle: 'Discard this entry?',
  discardNewBody: 'What you typed won\'t be saved.',
  discardEditBody: (n: number) => `Your changes to order #${n} won't be saved.`,

  // ---- Empty / loading / failure states (AC6) -----------------------------------------------------------
  firstUseTitle: 'No orders yet',
  firstUseBody: 'Take an order when a customer asks for eggs. Deliver it later, all at once or in a few drops.',
  openEmptyTitle: 'No open orders.',
  openEmptyBody: 'Everything has been delivered or cancelled.',
  noMatch: 'No orders match these filters.',
  loadFailedTitle: 'Couldn\'t load your orders',
  loadFailedBody: ORDER_MESSAGES.loadFailed,
} as const

const STATUS_RANK = { requested: 0, confirmed: 1, ready: 2 } as const
const STATUS_WORD = { requested: 'requested', confirmed: 'confirmed', ready: 'ready' } as const
type ManualStatus = keyof typeof STATUS_RANK

/** The menu wording for moving among the three hand-set statuses: forward is "Mark ready", back is "Back to requested". */
export function statusMoveLabel(from: ManualStatus, to: ManualStatus): string {
  return STATUS_RANK[to] > STATUS_RANK[from] ? `Mark ${STATUS_WORD[to]}` : `Back to ${STATUS_WORD[to]}`
}

/** The moves in the menu's order: forward first (nearest first), then back (nearest first). */
export function sortStatusMoves<T extends ManualStatus>(from: ManualStatus, moves: readonly T[]): T[] {
  const forward = moves.filter(s => STATUS_RANK[s] > STATUS_RANK[from]).sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])
  const back = moves.filter(s => STATUS_RANK[s] < STATUS_RANK[from]).sort((a, b) => STATUS_RANK[b] - STATUS_RANK[a])
  return [...forward, ...back]
}
