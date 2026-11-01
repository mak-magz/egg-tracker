// UI-only copy for Settings > Sizes (feature 02 §2.5 "Copy"). Field and refusal messages shared with the
// server live in shared/constants/sizes.ts (SIZE_MESSAGES); this file holds the rest, so every part of the
// screen says the same thing.

export const SIZE_COPY = {
  pageTitle: 'Settings',
  pageSubtitle: 'Farm settings',
  back: 'Back',
  menuItem: 'Settings',

  sizesTitle: 'Sizes',
  sizesHelp: 'The sizes you sort your eggs into. They show on the Log production form in this order.',
  archivedTitle: 'Archived',
  archivedHelp: 'Not offered for new production. Past days keep them.',
  archivedBadge: 'Archived',

  moveUp: (name: string) => `Move ${name} up`,
  moveDown: (name: string) => `Move ${name} down`,
  actionsFor: (name: string) => `Actions for ${name}`,
  rename: 'Rename',
  archive: 'Archive',
  restore: 'Restore',
  restoreNamed: (name: string) => `Restore ${name}`,

  addSize: 'Add size',
  nameLabel: 'Size name',
  namePlaceholder: 'For example, Peewee',
  renameHelp: 'Past days will show this new name too.',
  defaultPriceLabel: 'Default price per tray',
  defaultPricePlaceholder: '0.00',
  defaultPriceHelp: 'Optional. Pre-fills this size\'s tray price on sales and orders.',
  priceUnit: '/ tray',
  optional: 'optional',
  cancel: 'Cancel',
  add: 'Add',
  save: 'Save',

  lastSizeItem: 'Keep at least one size.',
  lastSizeLine: (name: string) => `Keep at least one size. Add another before you archive ${name}.`,

  archiveTitle: (name: string) => `Archive ${name}?`,
  archiveBody: (name: string) => `It won't be offered for new production. Your past days keep their ${name} eggs.`,
  archiveRestoreNote: 'You can restore it any time.',

  editDayArchivedAria: (name: string) => `${name} (archived)`,

  toastAdded: (name: string) => `Added ${name}`,
  toastRenamed: (oldName: string, newName: string) => `Renamed ${oldName} to ${newName}`,
  toastMovedUp: (name: string) => `Moved ${name} up`,
  toastMovedDown: (name: string) => `Moved ${name} down`,
  toastArchived: (name: string) => `Archived ${name}`,
  toastRestored: (name: string) => `Restored ${name}. It's last in your list.`,

  saveFailed: 'Couldn\'t save. Check your connection and try again.',
  archiveFailed: 'Couldn\'t archive. Check your connection and try again.',
  moveFailed: (name: string) => `Couldn't move ${name}. Check your connection and try again.`,
  restoreFailed: (name: string) => `Couldn't restore ${name}. Check your connection and try again.`,

  loadFailedTitle: 'Couldn\'t load your sizes',
  loadFailedBody: 'Check your connection and try again.',
  tryAgain: 'Try again',
} as const
