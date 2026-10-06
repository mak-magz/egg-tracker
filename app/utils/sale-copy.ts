// UI-only copy for the Sales screen (feature 04 §2.5 "Copy", reduced by feature 05 AC37 to AC42: no Pending, no
// Mark delivered, no Delete). This is the UX-designed wording the FORM shows. Field/server messages shared with the
// server live in `shared/constants/sales.ts` (`SALE_MESSAGES`); this file re-exports them under its own keys below
// rather than holding a second literal, so the two can never silently drift (QA S2, feature 04 §5; see
// `tests/unit/sale-message-parity.spec.ts`). No message here repeats a client's name beyond what the sale already
// carries, a price or a quantity the owner typed (AC59).
import { SALE_MESSAGES } from '#shared/constants/sales'

export const SALE_COPY = {
  pageTitle: 'Sales',
  subtitle: 'Deliveries and on-site sales',
  addLabel: 'Add sale',

  // ---- Filters (AC7 to AC11, feature 05 AC39) -------------------------------------------------------
  typeAll: 'All types',
  typeDelivery: 'Delivery',
  typeOnSite: 'On-site',
  typeGroupLabel: 'Type',
  clientFilterLabel: 'Client',
  clientFilterAll: 'All clients',
  clientFilterSearchPlaceholder: 'Search clients…',
  clientInactiveOption: (name: string) => `${name} · Inactive`,
  dateFromLabel: 'From',
  dateToLabel: 'To',
  clearDates: 'Clear dates',
  clear: 'Clear',
  dateRangeInvalid: 'End date must be on or after the start date',
  filtersButton: 'Filters',
  filtersButtonCount: (n: number) => `Filters (${n})`,
  showVoided: 'Show voided sales',
  showing: (shown: number, total: number) => `Showing ${shown} of ${total} sales`,
  clearFilters: 'Clear filters',
  showMore: 'Show more',

  // ---- List (AC3, AC4) -----------------------------------------------------------------------------
  tableCaption: 'Sales',
  headerSale: 'Sale',
  headerClient: 'Client',
  headerSizes: 'Sizes',
  headerTotal: 'Total',
  headerType: 'Type',
  headerActions: 'Actions',
  walkIn: 'Walk-in',
  saleNumber: (n: number) => `#${n}`,
  moreSizes: (n: number) => `+ ${n} more sizes`,
  sizeCount: (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'}`,
  openSaleAria: (n: number, client: string, kind: string) => `Open sale #${n}, ${client}, ${kind}`,
  actionsFor: (n: number) => `Actions for sale #${n}`,
  /** The link pill on a delivery made from an order (feature 05 AC39). */
  fromOrder: (n: number) => `From order #${n}`,
  openOrderAria: (n: number) => `Open order #${n}`,

  // ---- Row menu -------------------------------------------------------------------------------------
  menuEdit: 'Edit',
  menuVoid: 'Void',

  // ---- Log / Edit form (AC12 to AC32) --------------------------------------------------------------
  logTitle: 'Log a sale',
  editTitle: (n: number) => `Edit sale #${n}`,
  close: 'Close',
  saleTypeGroupLabel: 'Sale type',
  clientLabel: 'Client',
  clientOptional: 'Optional',
  clientPlaceholderDelivery: 'Search or add a client…',
  clientPlaceholderOnSite: 'Walk-in (no client)',
  removeClientAria: 'Remove client',
  clientInactiveSelected: (name: string) => `${name} · Inactive`,
  newClientRow: '+ New client',
  addClientNamed: (text: string) => `Add "${text}" as a new client`,
  noActiveClients: 'No clients yet. Add your first client.',

  sizeLabel: 'Size',
  lineGroupLabel: (n: number) => `Size ${n}`,
  usedInSale: 'In this sale',
  archived: 'Archived',
  usedSizeOption: (name: string) => `${name} (in this sale)`,
  removeLineAria: (name: string | null, n: number) => (name ? `Remove ${name} line` : `Remove line ${n}`),
  addSize: 'Add size',
  addSizeLimitReached: SALE_MESSAGES.linesMax,
  addSizeAllUsed: 'All your sizes are in this sale.',

  traysLabel: 'Trays',
  looseLabel: 'Loose',
  onHand: (qty: string) => `${qty} on hand for this size.`,
  onHandLoading: 'Checking stock…',
  onHandFailed: 'Couldn\'t check stock.',

  priceLabel: 'Price per tray',
  pricePlaceholder: '0.00',
  usualPrice: 'Usual price',
  lineTotalLabel: 'Line total',
  lineTotalNotReady: 'Not worked out yet',

  /** The one date: the day the eggs left (feature 05 AC38). */
  saleDateLabel: 'Sale date',
  today: 'Today',

  saleTotal: (formatted: string) => `Sale total ${formatted}`,
  saleTotalSoFar: (formatted: string) => `Sale total so far ${formatted}`,
  saleTotalEmpty: 'Sale total —',

  cancel: 'Cancel',
  save: 'Save',

  // ---- Edit a delivery that came from an order (feature 05 AC36, §2.5 "Sales") ---------------------
  partOfOrder: (n: number) => `Part of order #${n}`,
  linkedEggsNote: 'Void this delivery and deliver again to change eggs.',

  // ---- Field / server messages (AC13, AC15, AC19, AC20, AC23) --------------------------------------
  // The ones also raised by the server reuse SALE_MESSAGES verbatim; the rest (a size, a blank price, the
  // dynamic-limit variants) have no server equivalent and stay as UI-only literals.
  clientRequired: SALE_MESSAGES.clientRequired,
  sizeRequired: 'Choose a size.',
  quantityRequired: SALE_MESSAGES.quantityRequired,
  quantityLooseTooHigh: (trayScale: number) => `Loose eggs must be under ${trayScale}. Add a tray instead.`,
  quantityNotWhole: 'Enter a whole number, like 12.',
  quantityTooBig: (formatted: string) => `The most one size can take is ${formatted}.`,
  priceRequired: 'Enter a price.',
  priceNotANumber: SALE_MESSAGES.priceNotANumber,
  priceNotPositive: SALE_MESSAGES.priceNotPositive,
  priceTooManyDecimals: SALE_MESSAGES.priceTooManyDecimals,
  priceTooLarge: (max: string) => `The most you can enter is ${max}.`,
  saleDateFuture: SALE_MESSAGES.saleDateFuture,
  dateEmpty: SALE_MESSAGES.saleDateRequired,
  /** "The sale date can't be before the order date, Oct 3." (the date is built by the form; the base is the server's). */
  saleDateBeforeOrder: (orderDate: string) => `The sale date can't be before the order date, ${orderDate}.`,

  saveFailed: SALE_MESSAGES.saveFailed,
  editSaveFailed: 'Couldn\'t save your changes. Check your connection and try again.',
  serverTooManySizes: SALE_MESSAGES.linesMax,
  serverDuplicateSize: SALE_MESSAGES.linesDuplicateSize,
  serverSizesChanged: SALE_MESSAGES.linesSizesChanged,
  serverClientInactive: SALE_MESSAGES.clientInvalid,
  serverVoided: SALE_MESSAGES.voided,
  serverSaleLocked: SALE_MESSAGES.saleLocked,

  // ---- Toasts (AC29, AC34, AC39, AC67) -------------------------------------------------------------
  toastRecorded: (n: number) => `Sale #${n} recorded`,
  toastUpdated: (n: number) => `Updated sale #${n}`,
  toastVoided: (n: number) => `Sale #${n} voided`,
  toastVoidedLinked: (n: number, orderNumber: number, owed: string) => `Sale #${n} voided. Order #${orderNumber} shows ${owed} still owed.`,
  hiddenByFilter: (message: string, filter: string) => `${message}. Hidden by the ${filter} filter.`,
  hiddenByVoidedToggle: (message: string) => `${message}. Hidden — turn on "Show voided sales" to see it.`,

  changedElsewhere: SALE_MESSAGES.saleChanged,
  refreshFailed: 'Couldn\'t refresh your sales.',
  loadMoreFailed: 'Couldn\'t load more sales.',
  tryAgain: 'Try again',
  openOrderFailed: 'Couldn\'t open that order. Check your connection and try again.',

  // ---- Shortfall dialog (AC26, AC42; feature 05 AC38: every new direct sale) -----------------------
  shortfallTitle: 'Not enough on hand',
  shortfallLeadSelling: 'You\'re selling more than you have of:',
  shortfallLeadDelivering: 'You\'re delivering more than you have of:',
  shortfallLeadAdding: 'You\'re adding more than you have of:',
  shortfallRow: (size: string, onHand: string, verb: string, needed: string) => `${size}: ${onHand} on hand, you're ${verb} ${needed}`,
  shortfallClosing: 'Record it anyway?',
  recordAnyway: 'Record anyway',
  goBack: 'Go back',

  // ---- Detail (AC6, feature 05 AC39) ---------------------------------------------------------------
  detailTitle: (n: number) => `Sale #${n}`,
  detailClient: 'Client',
  detailSaleDate: 'Sale date',
  detailSaleTotal: 'Sale total',
  detailVoidedNote: 'This sale is voided. It no longer counts toward your stock.',
  perTray: (formatted: string) => `${formatted} / tray`,
  quantityAtPrice: (qty: string, price: string) => `${qty} at ${price} / tray`,
  voidSale: 'Void sale',
  edit: 'Edit',
  openInSales: 'Open in Sales',

  // ---- Void confirm (AC67, AC68; feature 05 AC35) --------------------------------------------------
  voidDialogTitle: (n: number) => `Void sale #${n}?`,
  voidDialogLine: (client: string, n: number, total: string) => `${client} · ${n} ${n === 1 ? 'size' : 'sizes'} · ${total}`,
  voidPutsBackOnHand: 'This puts back on hand:',
  voidNoUndo: 'You can\'t undo this. It stays in your records, marked Voided.',
  voidFailed: SALE_MESSAGES.voidFailed,
  /** The preview of what a void does to the order the delivery came from (AC35). */
  voidOrderOwed: (orderNumber: number, owed: string) => `Order #${orderNumber} will show ${owed} still owed.`,
  voidOrderOwedMany: (orderNumber: number) => `Order #${orderNumber} will show these still owed:`,
  voidOrderBack: (status: string) => `It will go back to ${status}.`,
  voidOrderClosedShort: (orderNumber: number) => `Order #${orderNumber} was closed short and stays closed.`,
  voidOrderLoading: 'Checking the order…',

  // ---- Discard (AC32) ---------------------------------------------------------------------------------
  discardTitle: 'Discard this entry?',
  discardLogBody: 'What you typed won\'t be saved.',
  discardEditBody: (n: number) => `Your changes to sale #${n} won't be saved.`,
  keepEditing: 'Keep editing',
  discard: 'Discard',

  // ---- Empty / loading / failure states (AC46, AC47, AC10) -----------------------------------------
  firstUseTitle: 'No sales yet',
  firstUseBody: 'Log your first sale or delivery and it will show here, newest first.',
  noMatch: 'No sales match these filters.',
  loadFailedTitle: 'Couldn\'t load your sales',
  loadFailedBody: 'Check your connection and try again.',

  // ---- Voided badge ----------------------------------------------------------------------------------
  voided: 'Voided',
} as const
