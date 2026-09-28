// UI-only copy for the Sales screen (feature 04 §2.5 "Copy"). This is the UX-designed wording the FORM
// shows. Field/server messages shared with the server live in `shared/constants/sales.ts` (`SALE_MESSAGES`);
// this file re-exports them under its own keys below rather than holding a second literal, so the two can
// never silently drift (QA S2, feature 04 §5; see `tests/unit/sale-message-parity.spec.ts`). No message here
// repeats a client's name beyond what the sale already carries, a price or a quantity the owner typed (AC59).
import { SALE_MESSAGES } from '#shared/constants/sales'

export const SALE_COPY = {
  pageTitle: 'Sales',
  subtitle: 'Deliveries and on-site sales',
  addLabel: 'Add sale',

  // ---- Filters (AC7 to AC11) ----------------------------------------------------------------------
  statusAll: 'All',
  statusPending: 'Pending',
  statusComplete: 'Complete',
  statusGroupLabel: 'Status',
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
  headerStatus: 'Status',
  headerActions: 'Actions',
  walkIn: 'Walk-in',
  saleNumber: (n: number) => `#${n}`,
  moreSizes: (n: number) => `+ ${n} more sizes`,
  sizeCount: (n: number) => `${n} ${n === 1 ? 'size' : 'sizes'}`,
  deliveredOn: (date: string) => `Delivered ${date}`,
  markDelivered: 'Mark delivered',
  openSaleAria: (n: number, client: string, status: string) => `Open sale #${n}, ${client}, ${status}`,
  actionsFor: (n: number) => `Actions for sale #${n}`,

  // ---- Row menu -------------------------------------------------------------------------------------
  menuMarkDelivered: 'Mark delivered',
  menuMarkPending: 'Mark as pending',
  menuEdit: 'Edit',
  menuDelete: 'Delete',
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

  saleDateLabel: 'Sale date',
  alreadyDelivered: 'Already delivered',
  alreadyDeliveredHelp: 'Turn on if it has already been delivered.',
  deliveredDateLabel: 'Delivered date',
  today: 'Today',

  saleTotal: (formatted: string) => `Sale total ${formatted}`,
  saleTotalSoFar: (formatted: string) => `Sale total so far ${formatted}`,
  saleTotalEmpty: 'Sale total —',

  cancel: 'Cancel',
  save: 'Save',

  // ---- Field / server messages (AC13, AC15, AC19, AC20, AC23, AC24) --------------------------------
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
  deliveredBeforeSale: (saleDate: string) => `The delivered date can't be before the sale date, ${saleDate}.`,
  deliveredDateFuture: SALE_MESSAGES.deliveredDateFuture,

  typeNoteOnSiteToDeliveryOff: 'This becomes a pending delivery. Its trays go back on hand until you mark it delivered.',
  typeNoteOnSiteToDeliveryOn: 'It stays delivered, and your stock doesn\'t change.',
  typeNoteDeliveryPendingToOnSite: 'This becomes an on-site sale. Its trays come out of your stock now.',
  typeNoteDeliveryCompleteToOnSite: (date: string) => `This becomes an on-site sale, dated ${date}. Your stock doesn't change, because it already left.`,

  saveFailed: SALE_MESSAGES.saveFailed,
  editSaveFailed: 'Couldn\'t save your changes. Check your connection and try again.',
  serverTooManySizes: SALE_MESSAGES.linesMax,
  serverDuplicateSize: SALE_MESSAGES.linesDuplicateSize,
  serverSizesChanged: SALE_MESSAGES.linesSizesChanged,
  serverClientInactive: SALE_MESSAGES.clientInvalid,
  serverNotPending: SALE_MESSAGES.notPending,
  serverNotComplete: SALE_MESSAGES.notComplete,
  serverVoided: SALE_MESSAGES.voided,

  // ---- Toasts (AC29, AC34, AC39, AC40, AC44, AC67) -------------------------------------------------
  toastLoggedPending: (n: number) => `Delivery #${n} logged as pending`,
  toastRecorded: (n: number) => `Sale #${n} recorded`,
  toastMarkedDelivered: 'Marked delivered — inventory updated',
  toastMarkedPending: 'Marked as pending — inventory updated',
  toastUpdated: (n: number) => `Updated sale #${n}`,
  toastDeleted: (n: number) => `Deleted sale #${n}`,
  toastVoided: (n: number) => `Sale #${n} voided`,
  hiddenByFilter: (message: string, filter: string) => `${message}. Hidden by the ${filter} filter.`,
  hiddenByVoidedToggle: (message: string) => `${message}. Hidden — turn on "Show voided sales" to see it.`,

  markFailed: (n: number) => `Couldn't mark #${n} delivered. Check your connection and try again.`,
  markPendingFailed: (n: number) => `Couldn't mark #${n} as pending. Check your connection and try again.`,
  changedElsewhere: SALE_MESSAGES.saleChanged,
  deletedElsewhere: 'This sale was deleted somewhere else.',
  refreshFailed: 'Couldn\'t refresh your sales.',
  loadMoreFailed: 'Couldn\'t load more sales.',
  tryAgain: 'Try again',

  // ---- Shortfall dialog (AC26, AC35, AC42) ---------------------------------------------------------
  shortfallTitle: 'Not enough on hand',
  shortfallLeadSelling: 'You\'re selling more than you have of:',
  shortfallLeadDelivering: 'You\'re delivering more than you have of:',
  shortfallLeadAdding: 'You\'re adding more than you have of:',
  shortfallRow: (size: string, onHand: string, verb: string, needed: string) => `${size}: ${onHand} on hand, you're ${verb} ${needed}`,
  shortfallClosing: 'Record it anyway?',
  recordAnyway: 'Record anyway',
  goBack: 'Go back',

  // ---- Mark delivered step (AC33 to AC37) ----------------------------------------------------------
  markDeliveredTitle: 'Mark delivered',
  markDeliveredAnyway: 'Mark delivered anyway',
  checkingStock: 'Checking stock…',
  saleLineFor: (n: number, client: string) => `#${n} · ${client}`,
  cantStillMarkDelivered: 'You can still mark it delivered.',

  // ---- Detail (AC6) ---------------------------------------------------------------------------------
  detailTitle: (n: number) => `Sale #${n}`,
  detailClient: 'Client',
  detailSaleDate: 'Sale date',
  detailDelivered: 'Delivered',
  detailSaleTotal: 'Sale total',
  detailPendingNote: 'Your stock hasn\'t changed yet.',
  detailVoidedNote: 'This sale is voided. It no longer counts toward your stock.',
  perTray: (formatted: string) => `${formatted} / tray`,
  quantityAtPrice: (qty: string, price: string) => `${qty} at ${price} / tray`,
  deleteSale: 'Delete sale',
  voidSale: 'Void sale',
  edit: 'Edit',

  // ---- Delete confirm — Pending only (AC44, AC45) --------------------------------------------------
  deleteDialogTitle: (n: number) => `Delete sale #${n}?`,
  deleteDialogLine: (client: string, n: number, total: string) => `${client} · ${n} ${n === 1 ? 'size' : 'sizes'} · ${total}`,
  deleteStockLine: 'It hasn\'t left yet, so your stock doesn\'t change.',
  deleteNoUndo: (n: number) => `You can't undo this. The number #${n} won't be used again.`,
  deleteFailed: SALE_MESSAGES.deleteFailed,

  // ---- Void confirm — Complete/on-site only (AC67, AC68) -------------------------------------------
  voidDialogTitle: (n: number) => `Void sale #${n}?`,
  voidPutsBackOnHand: 'This puts back on hand:',
  voidNoUndo: 'You can\'t undo this. It stays in your records, marked Voided.',
  voidFailed: SALE_MESSAGES.voidFailed,

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
  noMatchPendingNote: 'You don\'t have any pending deliveries.',
  loadFailedTitle: 'Couldn\'t load your sales',
  loadFailedBody: 'Check your connection and try again.',

  // ---- Voided badge ----------------------------------------------------------------------------------
  voided: 'Voided',
} as const
