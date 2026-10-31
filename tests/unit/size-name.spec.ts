import { describe, expect, it } from 'vitest'
import { MAX_SIZE_NAME_INPUT_LENGTH, MAX_SIZE_NAME_LENGTH, SIZE_MESSAGES } from '../../shared/constants/sizes'
import { checkSizeName, normalizeSizeName, sizeNameLength } from '../../shared/utils/size-name'
import type { FarmSize } from '../../shared/types/api'

function size(id: string, name: string, active = true, sortOrder = 0): FarmSize {
  return { id, name, sortOrder, colorSlot: sortOrder, active }
}

const SIZES: FarmSize[] = [
  size('small', 'Small', true, 0),
  size('medium', 'Medium', true, 1),
  size('large', 'Large', true, 2),
  size('extra', 'Extra Large', true, 3),
  size('jumbo', 'Jumbo', false, 4),
]

// The database adapter normalizeSizeName helper uses the same rules.
const COMPOSED = 'Café' // é as one code point
const DECOMPOSED = 'Café' // e + combining acute

describe('normalizeSizeName', () => {
  it('trims both ends', () => {
    expect(normalizeSizeName('  Large  ')).toBe('Large')
  })

  it('collapses any run of spaces inside to one', () => {
    expect(normalizeSizeName('  Extra   Large ')).toBe('Extra Large')
  })

  it('treats tabs, newlines and no-break spaces as whitespace', () => {
    expect(normalizeSizeName('Extra\t\n Large')).toBe('Extra Large')
    expect(normalizeSizeName(' Extra  Large ')).toBe('Extra Large')
  })

  it('composes to NFC so the same-looking names are one name', () => {
    expect(normalizeSizeName(DECOMPOSED)).toBe(COMPOSED)
    expect(normalizeSizeName(DECOMPOSED)).toBe(normalizeSizeName(COMPOSED))
  })

  it('is idempotent', () => {
    for (const raw of ['  Extra   Large ', DECOMPOSED, '\t', '', 'Peewee']) {
      const once = normalizeSizeName(raw)
      expect(normalizeSizeName(once)).toBe(once)
    }
  })

  it('turns whitespace-only input into an empty string', () => {
    expect(normalizeSizeName('   \t\n ')).toBe('')
  })

  it('keeps the case as typed', () => {
    expect(normalizeSizeName('  pEEwee ')).toBe('pEEwee')
  })
})

describe('sizeNameLength', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(sizeNameLength('Large')).toBe(5)
    expect(sizeNameLength('\u{1F95A}')).toBe(1) // egg emoji: 2 UTF-16 units
    expect('\u{1F95A}'.length).toBe(2)
    expect(sizeNameLength('\u{1F95A}'.repeat(40))).toBe(40)
  })
})

describe('checkSizeName', () => {
  it('accepts a new name and returns it normalised', () => {
    expect(checkSizeName('  Pee   wee ', SIZES)).toEqual({ ok: true, name: 'Pee wee' })
  })

  it('rejects blank, including whitespace only', () => {
    for (const raw of ['', '   ', '\t\n']) {
      expect(checkSizeName(raw, SIZES)).toEqual({ ok: false, reason: 'blank', message: SIZE_MESSAGES.nameBlank })
    }
  })

  it('rejects control characters and lone surrogates with the "invalid" message', () => {
    for (const raw of ['A\u0000B', '\u0000', 'A\u0007B', 'A\u007FB', 'A\u0085B', 'A\uD800B', 'A\uDC00B', 'A\uD83E', '\uDD5A']) {
      expect(checkSizeName(raw, SIZES)).toEqual({ ok: false, reason: 'invalid', message: SIZE_MESSAGES.nameInvalid })
    }
  })

  it('still treats tabs and newlines as spaces, keeps whole emoji, and leaves invisible format characters alone', () => {
    expect(checkSizeName('Pee\twee\n', SIZES)).toEqual({ ok: true, name: 'Pee wee' })
    expect(checkSizeName('A \u{1F95A} B', SIZES)).toEqual({ ok: true, name: 'A \u{1F95A} B' })
    expect(checkSizeName('A​B', SIZES)).toMatchObject({ ok: true }) // N1: not changed here
  })

  it('reports blank before invalid, and invalid before too long', () => {
    expect(checkSizeName('  ', SIZES)).toMatchObject({ reason: 'blank' })
    expect(checkSizeName(`${'a'.repeat(41)}\u0000`, SIZES)).toMatchObject({ reason: 'invalid' })
  })

  it('accepts 40 characters and rejects 41', () => {
    expect(checkSizeName('a'.repeat(MAX_SIZE_NAME_LENGTH), SIZES)).toEqual({ ok: true, name: 'a'.repeat(40) })
    expect(checkSizeName('a'.repeat(41), SIZES)).toEqual({ ok: false, reason: 'too_long', message: SIZE_MESSAGES.nameTooLong })
  })

  it('refuses a raw name over 200 characters before normalising (audit M-2), like the database', () => {
    const padded = `${' '.repeat(200)}Peewee` // normalises to "Peewee", but the database would not look at it
    expect(checkSizeName(padded, SIZES)).toEqual({ ok: false, reason: 'too_long', message: SIZE_MESSAGES.nameTooLong })
    expect(checkSizeName(`${' '.repeat(190)}Peewee`, SIZES)).toEqual({ ok: true, name: 'Peewee' })
    expect(checkSizeName('x'.repeat(MAX_SIZE_NAME_INPUT_LENGTH + 1), SIZES)).toMatchObject({ reason: 'too_long' })
  })

  it('measures the length after normalising and by code points', () => {
    // 40 letters padded and spaced out is still 40 after normalising
    expect(checkSizeName(`  ${'a'.repeat(40)}  `, SIZES).ok).toBe(true)
    expect(checkSizeName('\u{1F95A}'.repeat(40), SIZES).ok).toBe(true)
    expect(checkSizeName('\u{1F95A}'.repeat(41), SIZES)).toMatchObject({ ok: false, reason: 'too_long' })
  })

  it('rejects a case-insensitive match on an active size, with the existing size\'s own spelling', () => {
    expect(checkSizeName('large', SIZES)).toEqual({
      ok: false,
      reason: 'taken',
      message: 'You already have a size called Large.',
      existing: { id: 'large', name: 'Large', archived: false },
    })
  })

  it('matches after normalising the typed name', () => {
    expect(checkSizeName('  EXTRA   large ', SIZES)).toMatchObject({ ok: false, reason: 'taken', existing: { id: 'extra', name: 'Extra Large' } })
  })

  it('rejects a match on an archived size and points to Restore', () => {
    expect(checkSizeName('jumbo', SIZES)).toEqual({
      ok: false,
      reason: 'taken',
      message: 'Jumbo is archived. Restore it instead.',
      existing: { id: 'jumbo', name: 'Jumbo', archived: true },
    })
  })

  it('treats composed and decomposed spellings as the same name', () => {
    const sizes = [size('cafe', COMPOSED)]
    expect(checkSizeName(DECOMPOSED, sizes)).toMatchObject({ ok: false, reason: 'taken', existing: { id: 'cafe' } })
  })

  it('excludes the size being renamed (AC7): the same name, or only case or spacing, is fine', () => {
    expect(checkSizeName('Large', SIZES, 'large')).toEqual({ ok: true, name: 'Large' })
    expect(checkSizeName('LARGE', SIZES, 'large')).toEqual({ ok: true, name: 'LARGE' })
    expect(checkSizeName('Extra    Large', SIZES, 'extra')).toEqual({ ok: true, name: 'Extra Large' })
  })

  it('still rejects another size\'s name when renaming', () => {
    expect(checkSizeName('medium', SIZES, 'large')).toMatchObject({ ok: false, reason: 'taken', existing: { id: 'medium' } })
  })

  it('reports a spacing-only change as a different value than the stored name (a real change, R3.6)', () => {
    // The stored name is already normalised, so a raw value that differs from it is a real change to save.
    const raw = 'Extra  Large'
    const result = checkSizeName(raw, SIZES, 'extra')
    expect(result.ok).toBe(true)
    expect(raw).not.toBe('Extra Large')
    expect(result.ok && result.name).toBe('Extra Large')
  })

  it('checks blank and length before the name clash', () => {
    expect(checkSizeName('', [size('blank', '')])).toMatchObject({ reason: 'blank' })
  })
})
