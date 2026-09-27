// Client name and phone rules (docs/features/03-clients.md §3.3, AC10 to AC12, UX R3). Pure, so the server, the
// zod schemas and the form all use the same code. These are the twins of the SQL helpers `app.normalize_client_name`,
// `app.normalize_client_phone` and `app.client_text_invalid`; the database stays the authority and checks again.
import {
  CLIENT_MESSAGES,
  MAX_CLIENT_NAME_LENGTH,
  MAX_CLIENT_PHONE_LENGTH,
  MAX_CLIENT_TEXT_INPUT_LENGTH,
} from '../constants/clients'
import type { Client, NameMatch } from '../types/api'
import { normalizeSizeName, sizeNameLength } from './size-name'

/**
 * NFC, every run of whitespace becomes one space, ends trimmed: the SAME rule as size names, by calling the one
 * JavaScript definition (its SQL twin is `app.normalize_size_name`, already parity-tested). Idempotent.
 */
export function normalizeClientName(raw: string): string {
  return normalizeSizeName(raw)
}

/**
 * NFC, then trim only (JavaScript `trim()` strips exactly the whitespace class the SQL function strips: the same
 * class as `\s`, parity-tested for sizes). The inside of the phone is untouched, because "(555) 201-3348" and
 * "+63 917 123 4567" must save as typed (AC12). A blank result is `null` (no phone).
 */
export function normalizeClientPhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const phone = raw.normalize('NFC').trim()
  return phone === '' ? null : phone
}

/** Length in characters (code points), to match Postgres `char_length`. */
export function clientNameLength(name: string): number {
  return sizeNameLength(name)
}

/**
 * The control and invisible characters a name or phone may not hold, as inclusive code point ranges. This is the
 * JavaScript twin of the class in `app.client_text_invalid` (M12 migration), plus U+0000, which Postgres text can't
 * store at all (the SQL class starts at U+0001). tests/unit/client-name-parity.spec.ts compares the two.
 *   0000-001F, 007F-009F   control characters (C0, DEL, C1)
 *   00AD, 034F, 061C       soft hyphen, combining grapheme joiner, Arabic letter mark
 *   115F-1160              Hangul choseong and jungseong fillers
 *   17B4-17B5              Khmer inherent vowels
 *   180B-180F              Mongolian free variation selectors and vowel separator
 *   200B-200F              zero-width space, non-joiner, joiner, left-to-right and right-to-left marks
 *   202A-202E              bidi embedding and override
 *   2060-206F              word joiner, invisible operators, bidi isolates and deprecated format characters
 *   2800                   braille pattern blank
 *   3164, FFA0             Hangul filler, halfwidth Hangul filler
 *   FE00-FE0F              variation selectors 1 to 16 (FE0F is the emoji presentation selector)
 *   FFF0-FFFB              unassigned default-ignorables and interlinear annotation
 *   1BCA0-1BCA3            shorthand format controls
 *   1D173-1D17A            musical symbol format controls
 *   E0000-E0FFF            tag characters, variation selectors supplement, unassigned default-ignorables
 * That is every Unicode Default_Ignorable_Code_Point (tests/unit/client-name.spec.ts checks it against the runtime's
 * Unicode data) plus U+2800, the one blank-looking character that is neither default-ignorable nor whitespace (QA S2).
 * Joiners (U+200C, U+200D) stay refused (owner). This class refuses a hidden character ANYWHERE in the text; that
 * the text also holds a visible one is `hasVisibleClientTextChar` (audit L3).
 * Lone surrogates (\p{Cs}, half an emoji) are refused as well. Tab, newline, NBSP and the other spaces are NOT in
 * this list: for a name they are collapsed to spaces before the check, and a phone may hold a plain space.
 * U+FEFF is default-ignorable but is not in it: it is whitespace (`\s`), so a name loses it, and a phone loses it at
 * the ends.
 */
export const CLIENT_TEXT_INVALID_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001F],
  [0x007F, 0x009F],
  [0x00AD, 0x00AD],
  [0x034F, 0x034F],
  [0x061C, 0x061C],
  [0x115F, 0x1160],
  [0x17B4, 0x17B4],
  [0x17B5, 0x17B5],
  [0x180B, 0x180F],
  [0x200B, 0x200F],
  [0x202A, 0x202E],
  [0x2060, 0x206F],
  [0x2800, 0x2800],
  [0x3164, 0x3164],
  [0xFE00, 0xFE0F],
  [0xFFA0, 0xFFA0],
  [0xFFF0, 0xFFFB],
  [0x1BCA0, 0x1BCA3],
  [0x1D173, 0x1D17A],
  [0xE0000, 0xE0FFF],
]

const cp = (n: number): string => `\\u{${n.toString(16)}}`

const INVALID_TEXT_CHAR = new RegExp(
  `[${CLIENT_TEXT_INVALID_RANGES.map(([lo, hi]) => (lo === hi ? cp(lo) : `${cp(lo)}-${cp(hi)}`)).join('')}\\p{Cs}]`,
  'u',
)

/**
 * True when a (normalised) name or phone holds a control or invisible character or a lone surrogate (AC10, AC12).
 * Run it AFTER `normalizeClientName` / `normalizeClientPhone`.
 */
export function hasInvalidClientTextChar(text: string): boolean {
  return INVALID_TEXT_CHAR.test(text)
}

/**
 * Letters, numbers, symbols and punctuation (the Unicode general categories L, N, S, P; emoji are symbols), except
 * U+FFFC: the object replacement character is a symbol by category but draws a placeholder box or nothing.
 */
const VISIBLE_TEXT_CHAR = /(?!\u{FFFC})[\p{L}\p{N}\p{S}\p{P}]/u

/**
 * True when a (normalised) name or phone holds at least one letter, number, symbol or punctuation character
 * (audit L3), U+FFFC excepted. So a lone combining mark, a private-use or unassigned code point, an
 * object-replacement character (U+FFFC) or a format character that is not default-ignorable (U+0600, U+13430) is not a name, while "e" plus a
 * combining mark is. Whitespace never counts (it is collapsed and trimmed first). The SQL twin is
 * `app.client_text_visible`, which spells the same set out as explicit ranges (Unicode 17.0) because Postgres regexes
 * have no property classes; tests/unit/client-name-parity.spec.ts compares them over every code point. Run it AFTER
 * `normalizeClientName` / `normalizeClientPhone`. Not done: a cap on combining marks after one base character.
 */
export function hasVisibleClientTextChar(text: string): boolean {
  return VISIBLE_TEXT_CHAR.test(text)
}

export type ClientNameCheck
  = | { ok: true, name: string }
    | { ok: false, reason: 'blank' | 'invalid' | 'too_long' | 'taken', message: string, existing?: NameMatch }

/**
 * The form's live check (UX R3): normalise, then 1 to 60 characters with no hidden character and at least one visible one, then a match against
 * every client of the farm, inactive ones included, except `selfId` (an edit may change only the capitalisation or
 * spacing of its own name: AC11, AC18). The match ignores case and spacing but NOT accents ("Cafe" and "Café" are
 * different names: owner decision), like the database's unique index. `existing` carries the other client's own
 * spelling and whether it is inactive (`archived`). The message for an inactive match depends on the form: the Add
 * form (no `selfId`) points to marking it active, the Edit form (`selfId` given) is text only. The server does not
 * use this for the clash: the database decides, under a lock.
 */
export function checkClientName(
  raw: string,
  clients: readonly Pick<Client, 'id' | 'name' | 'active'>[],
  selfId?: string,
): ClientNameCheck {
  // The database refuses a raw name over 200 characters before it normalises (audit M-2); say the same here.
  if (raw.length > MAX_CLIENT_TEXT_INPUT_LENGTH) return { ok: false, reason: 'too_long', message: CLIENT_MESSAGES.nameTooLong }
  const name = normalizeClientName(raw)
  if (name === '') return { ok: false, reason: 'blank', message: CLIENT_MESSAGES.nameBlank }
  if (hasInvalidClientTextChar(name) || !hasVisibleClientTextChar(name)) return { ok: false, reason: 'invalid', message: CLIENT_MESSAGES.nameInvalid }
  if (clientNameLength(name) > MAX_CLIENT_NAME_LENGTH) return { ok: false, reason: 'too_long', message: CLIENT_MESSAGES.nameTooLong }

  const wanted = name.toLowerCase()
  const match = clients.find(c => c.id !== selfId && normalizeClientName(c.name).toLowerCase() === wanted)
  if (match) {
    const existing: NameMatch = { id: match.id, name: match.name, archived: !match.active }
    const message = !existing.archived
      ? CLIENT_MESSAGES.nameTaken(match.name)
      : selfId === undefined ? CLIENT_MESSAGES.nameInactive(match.name) : CLIENT_MESSAGES.nameInactiveEdit(match.name)
    return { ok: false, reason: 'taken', message, existing }
  }
  return { ok: true, name }
}

export type ClientPhoneCheck
  = | { ok: true, phone: string | null }
    | { ok: false, reason: 'invalid' | 'too_long', message: string }

/** The form's live check for the phone: trimmed, at most 30 characters, no hidden character and at least one visible one. Blank is fine (`phone: null`). */
export function checkClientPhone(raw: string): ClientPhoneCheck {
  if (raw.length > MAX_CLIENT_TEXT_INPUT_LENGTH) return { ok: false, reason: 'too_long', message: CLIENT_MESSAGES.phoneTooLong }
  const phone = normalizeClientPhone(raw)
  if (phone === null) return { ok: true, phone: null }
  if (hasInvalidClientTextChar(phone) || !hasVisibleClientTextChar(phone)) return { ok: false, reason: 'invalid', message: CLIENT_MESSAGES.phoneInvalid }
  if ([...phone].length > MAX_CLIENT_PHONE_LENGTH) return { ok: false, reason: 'too_long', message: CLIENT_MESSAGES.phoneTooLong }
  return { ok: true, phone }
}
