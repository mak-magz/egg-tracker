// Size-name rules (docs/features/02-farm-settings.md §3.3, AC4, UX R3). Pure, so the server, the zod
// schemas and the form all use the same code. `normalizeSizeName` is the twin of the SQL function
// `app.normalize_size_name`; the database stays the authority and normalises again.
import { MAX_SIZE_NAME_INPUT_LENGTH, MAX_SIZE_NAME_LENGTH, SIZE_MESSAGES } from '../constants/sizes'
import type { FarmSize, SizeNameMatch } from '../types/api'

/**
 * Unicode NFC, every run of whitespace collapsed to one space, ends trimmed (owner decision 2026-09-25).
 * "  Extra   Large " and "Extra Large" are the same name. Idempotent.
 */
export function normalizeSizeName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

/** Length in characters (code points, not UTF-16 units), to match Postgres `char_length` and zod. */
export function sizeNameLength(name: string): number {
  return [...name].length
}

/**
 * True when a (normalised) name holds a control character (\p{Cc}: U+0000 to U+001F, U+007F to U+009F) or a lone
 * surrogate (\p{Cs}, an unpaired half of an emoji). Postgres can't store U+0000 or invalid UTF-8, and neither is
 * ever something an owner meant to type. Run it AFTER `normalizeSizeName`, which turns tabs and newlines into
 * spaces first. Invisible format characters (U+200B and friends) are deliberately NOT rejected here (QA N1, owner's call).
 */
export function hasInvalidSizeNameChar(name: string): boolean {
  return /[\p{Cc}\p{Cs}]/u.test(name)
}

export type SizeNameCheck
  = | { ok: true, name: string }
    | { ok: false, reason: 'blank' | 'invalid' | 'too_long' | 'taken', message: string, existing?: SizeNameMatch }

/**
 * The form's live check (UX R3): normalise, then 1 to 40 characters, then a case-insensitive match against
 * every size of the farm, archived ones included, except `selfId` (renaming a size to its own name, or only
 * changing its capitalisation or spacing, is fine: AC7). `existing` carries the other size's own spelling and
 * whether it is archived, so the message can point to Restore. The server does not use this for the clash:
 * the database decides, under a lock.
 */
export function checkSizeName(
  raw: string,
  sizes: readonly Pick<FarmSize, 'id' | 'name' | 'active'>[],
  selfId?: string,
): SizeNameCheck {
  // The database refuses a raw name over 200 characters before it normalises (audit M-2); say the same here.
  if (raw.length > MAX_SIZE_NAME_INPUT_LENGTH) return { ok: false, reason: 'too_long', message: SIZE_MESSAGES.nameTooLong }
  const name = normalizeSizeName(raw)
  if (name === '') return { ok: false, reason: 'blank', message: SIZE_MESSAGES.nameBlank }
  if (hasInvalidSizeNameChar(name)) return { ok: false, reason: 'invalid', message: SIZE_MESSAGES.nameInvalid }
  if (sizeNameLength(name) > MAX_SIZE_NAME_LENGTH) return { ok: false, reason: 'too_long', message: SIZE_MESSAGES.nameTooLong }

  const wanted = name.toLowerCase()
  const match = sizes.find(s => s.id !== selfId && normalizeSizeName(s.name).toLowerCase() === wanted)
  if (match) {
    const existing: SizeNameMatch = { id: match.id, name: match.name, archived: !match.active }
    const message = existing.archived ? SIZE_MESSAGES.nameArchived(match.name) : SIZE_MESSAGES.nameTaken(match.name)
    return { ok: false, reason: 'taken', message, existing }
  }
  return { ok: true, name }
}
