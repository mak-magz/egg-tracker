// UI-only copy for the Clients screen (feature 03 §2.5 "Copy"). Field and refusal messages shared with the
// server live in shared/constants/clients.ts (CLIENT_MESSAGES); this file holds the rest, so every part of the
// screen says the same thing. Prices come from formatPrice (the currency is never typed here), and no message
// repeats a phone number or a price the owner typed (AC29).

export const CLIENT_COPY = {
  pageTitle: 'Clients',
  subtitle: (n: number) => `${n} ${n === 1 ? 'customer' : 'customers'}`,
  addLabel: 'Add client',

  searchPlaceholder: 'Search clients…',
  searchLabel: 'Search clients',
  clearSearch: 'Clear search',
  statusLabel: 'Filter by status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  showing: (shown: number, total: number) => `Showing ${shown} of ${total}`,
  clear: 'Clear',
  clearFilters: 'Clear filters',
  liveCount: (n: number) => `${n} ${n === 1 ? 'client' : 'clients'}`,

  tableCaption: 'Clients',
  headerClient: 'Client',
  headerPhone: 'Phone',
  headerPrice: 'Default price',
  headerStatus: 'Status',
  headerActions: 'Actions',
  pricePerTray: (formatted: string) => `${formatted} / tray`,
  noPhone: 'No phone',
  noPrice: 'No default price',
  active: 'Active',
  inactive: 'Inactive',

  editAria: (name: string) => `Edit ${name}`,
  actionsFor: (name: string) => `Actions for ${name}`,
  edit: 'Edit',
  markInactive: 'Mark inactive',
  markActive: 'Mark active',

  addTitle: 'Add client',
  editTitle: 'Edit client',
  nameLabel: 'Name',
  phoneLabel: 'Phone',
  priceLabel: 'Default price',
  optional: 'Optional',
  namePlaceholder: 'e.g. Maple Street Market',
  phonePlaceholder: '0917 123 4567',
  pricePlaceholder: '0.00',
  priceUnit: 'per tray',
  priceHelp: 'For one tray. Leave blank if there\'s no usual price.',
  cancel: 'Cancel',
  save: 'Save',
  close: 'Close',
  markNamedActive: (name: string) => `Mark ${name} active`,

  saveFailed: 'Couldn\'t save. Check your connection and try again.',
  markActiveFailed: (name: string) => `Couldn't mark ${name} active. Check your connection and try again.`,

  toastAdded: (name: string) => `Added ${name}`,
  toastUpdated: (name: string) => `Updated ${name}`,
  toastMarkedInactive: (name: string) => `Marked ${name} inactive`,
  toastMarkedActive: (name: string) => `Marked ${name} active`,
  /** The row left the list because of the status filter (owner decision O3). `filter` is "Active" or "Inactive". */
  toastHiddenByFilter: (message: string, filter: string) => `${message}. Hidden by the ${filter} filter.`,
  markFailed: (name: string, toActive: boolean) => `Couldn't mark ${name} ${toActive ? 'active' : 'inactive'}. Check your connection and try again.`,
  refreshFailed: 'Couldn\'t refresh your clients.',
  tryAgain: 'Try again',

  discardTitle: 'Discard this entry?',
  discardAddBody: 'What you typed won\'t be saved.',
  discardEditBody: (name: string) => `Your changes to ${name} won't be saved.`,

  firstUseTitle: 'No clients yet',
  firstUseBody: 'Add your first customer. Keep their phone and usual price here.',
  noMatch: 'No clients match this filter.',
  noMatchInactive: 'You haven\'t marked any clients inactive.',
  noMatchActive: 'All your clients are marked inactive.',
  loadFailedTitle: 'Couldn\'t load your clients',
  loadFailedBody: 'Check your connection and try again.',
} as const
