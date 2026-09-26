// Size-management field keys, limits and copy (docs/features/02-farm-settings.md §3.3, §2.5 "Copy").
// The server's `ApiErrorData.fields` keys and the form's messages come from here, so both say the same thing.

/** Keys used in `ApiErrorData.fields` by the sizes routes. */
export const SIZE_FIELDS = {
  name: 'name',
  order: 'order',
  submissionId: 'submissionId',
  id: 'id',
} as const

/** Longest size name, in characters (code points), after normalising. Equals the `sizes_name_length` check; tests/unit/sizes-constants.spec.ts compares them. */
export const MAX_SIZE_NAME_LENGTH = 40

/**
 * Longest RAW size name (before normalising) the database will even look at: a cheap cap (security audit M-2) so
 * the regex never runs on megabytes. Equals the `char_length(...) > 200` checks in the sizes_hardening migration;
 * tests/unit/sizes-constants.spec.ts compares them. Far above 40, so no real name is affected.
 */
export const MAX_SIZE_NAME_INPUT_LENGTH = 200

/** Most sizes one farm can have, archived ones included (they are never deleted). Equals the TM015 cap in the M8 migration. */
export const MAX_SIZES_PER_FARM = 100

/** §2.5 copy used by validation on both the server and the form. */
export const SIZE_MESSAGES = {
  nameBlank: 'Enter a size name.',
  nameTooLong: 'Use 40 characters or fewer.',
  nameInvalid: 'This name has a character that isn\'t allowed.',
  nameTaken: (existing: string) => `You already have a size called ${existing}.`,
  nameArchived: (existing: string) => `${existing} is archived. Restore it instead.`,
  tooMany: 'You have reached the limit of 100 sizes.',
  lastActive: 'Keep at least one size.',
  changedElsewhere: 'Your sizes were changed somewhere else. The list is up to date now.',
} as const
