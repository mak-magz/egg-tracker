// UI-only production copy (feature 01 §2.5 "Copy"). Validation and save-error messages shared with
// the server live in shared/constants/production.ts (PRODUCTION_MESSAGES); this file holds the rest,
// so every screen says the same thing. `phrase` is formatDayPhrase(): "today" or "Sep 24".

function possessive(phrase: string, noun: string): string {
  return phrase === 'today' ? `today's ${noun}` : `${noun} for ${phrase}`
}

export const PRODUCTION_COPY = {
  addLabel: 'Add production',
  fabLabel: 'Log production',
  logTitle: 'Log production',
  editTitle: 'Edit production',
  goodGroup: 'Good eggs, by size',
  rejectsGroup: 'Rejects (no size)',
  rejectsName: 'Rejects',
  editDateHint: 'To move this day to another date, delete it and log it again.',
  nothingEnteredYet: 'Nothing entered yet',
  addsToNote: (phraseCapitalised: string) => `${phraseCapitalised} already has production logged. This adds to it.`,

  toastLogged: (phrase: string) => `Logged ${possessive(phrase, 'production')}`,
  toastAdded: (phrase: string) => `Added to ${possessive(phrase, 'production')}`,
  toastUpdated: (phrase: string) => `Updated ${possessive(phrase, 'production')}`,
  toastDeleted: (phrase: string) => `Deleted ${possessive(phrase, 'production')}`,
  toastAlreadyDeleted: 'That day was already deleted.',
  toastRefreshFailed: 'Couldn\'t refresh production.',
  tryAgain: 'Try again',

  discardLogTitle: 'Discard this entry?',
  discardLogBody: 'The amounts you typed won\'t be saved.',
  discardEditTitle: 'Discard your changes?',
  discardEditBody: (phrase: string) => `Your changes to ${phrase} won't be saved.`,
  keepEditing: 'Keep editing',
  discard: 'Discard',

  deleteTitle: (phrase: string) => (phrase === 'today' ? 'Delete today\'s production?' : `Delete production for ${phrase}?`),
  deleteLeadFromEdit: 'You\'ve set every amount to 0.',
  deleteRemoves: 'This removes:',
  deleteNoUndo: 'You can\'t undo this.',
  deleteDay: 'Delete day',
  editDay: 'Edit day',
  cancel: 'Cancel',
  save: 'Save',

  chartTitle: 'Production trend by size',
  chartEmpty: 'Nothing to chart in this range.',
  chartAria: (from: string, to: string) => `Production trend by size, ${from} to ${to}`,

  firstUseTitle: 'No production logged yet',
  firstUseBody: 'Log your first collection and it will show here, day by day.',
  emptyRange: 'No production logged in this date range.',
  showLast30: 'Show last 30 days',
  clearDates: 'Clear dates',
  loadFailedTitle: 'Couldn\'t load production',
  loadFailedBody: 'Check your connection and try again.',
} as const
