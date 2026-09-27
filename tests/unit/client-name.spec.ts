import { describe, expect, it } from 'vitest'
import { CLIENT_MESSAGES } from '../../shared/constants/clients'
import {
  CLIENT_TEXT_INVALID_RANGES,
  checkClientName,
  checkClientPhone,
  clientNameLength,
  hasInvalidClientTextChar,
  hasVisibleClientTextChar,
  normalizeClientName,
  normalizeClientPhone,
} from '../../shared/utils/client-name'
import { normalizeSizeName } from '../../shared/utils/size-name'

const CLIENTS = [
  { id: 'a', name: 'Maple Street Market', active: true },
  { id: 'b', name: 'Oakhill Bakery', active: false },
  { id: 'c', name: 'The Green Table Café', active: true },
]

describe('normalizeClientName', () => {
  it('trims, collapses runs of spaces and whitespace characters', () => {
    expect(normalizeClientName('  Maple  Street   Market ')).toBe('Maple Street Market')
    expect(normalizeClientName('Maple\tStreet\nMarket')).toBe('Maple Street Market')
    expect(normalizeClientName('Maple\u00A0\u00A0Street\u2003Market\uFEFF')).toBe('Maple Street Market')
  })

  it('is the same rule as sizes', () => {
    for (const raw of ['  a  b ', 'Café', '\t x \n']) expect(normalizeClientName(raw)).toBe(normalizeSizeName(raw))
  })

  it('composes to NFC and is idempotent', () => {
    expect(normalizeClientName('Café')).toBe('Café')
    const once = normalizeClientName('  Sam   &  Dana ')
    expect(normalizeClientName(once)).toBe(once)
  })

  it('keeps letters, digits, punctuation and accents exactly as typed', () => {
    for (const name of ['Sam & Dana Coyle', 'The Green Table Café', 'O\'Brien\'s', 'Store #9 (Oak St.)', '李小龍']) {
      expect(normalizeClientName(name)).toBe(name)
    }
  })
})

describe('normalizeClientPhone', () => {
  it('trims only and keeps the inside as typed', () => {
    for (const phone of ['(555) 201-3348', '+63 917 123 4567', '555-2013 ext 4', '0917  123   4567']) {
      expect(normalizeClientPhone(`  ${phone}\t`)).toBe(phone)
    }
  })

  it('trims NBSP and other spaces at the ends', () => {
    expect(normalizeClientPhone('\u00A0555\u2003')).toBe('555')
  })

  it('turns blank, null and undefined into null', () => {
    for (const raw of ['', '   ', '\t\n', '\u00A0', null, undefined]) expect(normalizeClientPhone(raw), String(raw)).toBeNull()
  })

  it('composes to NFC', () => {
    expect(normalizeClientPhone('é')).toBe('é')
  })
})

describe('clientNameLength', () => {
  it('counts code points, so an emoji is one', () => {
    expect(clientNameLength('\u{1F95A}'.repeat(60))).toBe(60)
    expect(clientNameLength('Café')).toBe(4)
  })
})

describe('hasInvalidClientTextChar', () => {
  const hex = (n: number) => `U+${n.toString(16).toUpperCase().padStart(4, '0')}`
  const ch = (n: number) => String.fromCodePoint(n)

  it('refuses every code point in every range, at both edges and the middle', () => {
    for (const [lo, hi] of CLIENT_TEXT_INVALID_RANGES) {
      for (const n of new Set([lo, Math.floor((lo + hi) / 2), hi])) expect(hasInvalidClientTextChar(`a${ch(n)}b`), hex(n)).toBe(true)
    }
  })

  it('allows the code points just outside each range', () => {
    for (const [lo, hi] of CLIENT_TEXT_INVALID_RANGES) {
      for (const n of [lo - 1, hi + 1]) {
        if (n < 0 || CLIENT_TEXT_INVALID_RANGES.some(([a, b]) => n >= a && n <= b)) continue
        expect(hasInvalidClientTextChar(ch(n)), hex(n)).toBe(false)
      }
    }
  })

  it('refuses the characters the owner named: zero-width space, joiners, control codes, lone surrogates', () => {
    for (const raw of ['A\u200BB', 'A\u200CB', 'A\u200DB', 'A\u0000B', 'A\u0007B', 'A\u007FB', 'A\u0085B', 'A\u00ADB', 'A\u202EB', 'A\u2060B', 'A\uD800B', 'A\uDC00B', 'A\uD83E']) {
      expect(hasInvalidClientTextChar(raw)).toBe(true)
    }
  })

  it('allows ordinary text, emoji, accents, a plain space and NBSP (a name collapses it first)', () => {
    for (const raw of ['Sam & Dana Coyle', 'Café', '\u{1F95A}', 'A B', 'A\u00A0B', '(555) 201-3348', '李', 'O\'Brien']) {
      expect(hasInvalidClientTextChar(raw), raw).toBe(false)
    }
  })

  it('does not treat U+FEFF or tab/newline as hidden here (whitespace is collapsed before the check)', () => {
    expect(hasInvalidClientTextChar('\uFEFF')).toBe(false)
    expect(hasInvalidClientTextChar(normalizeClientName('A\tB\nC\uFEFF'))).toBe(false)
  })

  // QA S2: characters that draw nothing but were not refused, so a name made only of one saved as a blank card.
  const BLANK_LOOKING = [
    0x3164, 0x2800, 0x115F, 0x1160, 0xFE0F, 0x034F, 0x17B4, 0x17B5, 0xFFA0, // the QA list
    0x180B, 0x180C, 0x180D, 0x180F, 0xFE00, 0xFE0E, // variation selectors
    0x2065, 0x2061, 0x2064, 0xFFF0, 0xFFF8, 0x1BCA0, 0x1D173, 0xE0100, 0xE0FFF, // other default-ignorables
    0x200C, 0x200D, // joiners stay refused (owner decision)
  ]

  it('refuses the blank-looking characters, alone and inside a name', () => {
    for (const n of BLANK_LOOKING) {
      expect(hasInvalidClientTextChar(ch(n)), hex(n)).toBe(true)
      expect(hasInvalidClientTextChar(`Maple${ch(n)}Market`), hex(n)).toBe(true)
    }
  })

  it('refuses EVERY Default_Ignorable_Code_Point of the runtime\'s Unicode data, except U+FEFF (whitespace)', () => {
    const ignorable = /\p{Default_Ignorable_Code_Point}/u
    const missed: string[] = []
    for (let n = 0; n <= 0x10FFFF; n++) {
      if (n >= 0xD800 && n <= 0xDFFF) continue
      const c = ch(n)
      if (ignorable.test(c) && !hasInvalidClientTextChar(c) && normalizeClientName(c) !== '') missed.push(hex(n))
    }
    expect(missed).toEqual([])
  })

  it('every single code point either draws something, is whitespace that normalises away, or is refused', () => {
    // A name of one code point can only reach the database when it is not refused; it must then have a glyph.
    // Nothing that is neither whitespace nor refused may be blank-looking: the only such character known is U+2800.
    const drawsNothing = /[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}\p{Cs}\u2800]/u
    const blank: string[] = []
    for (let n = 0; n <= 0x10FFFF; n++) {
      if (n >= 0xD800 && n <= 0xDFFF) continue
      const name = normalizeClientName(ch(n))
      if (name !== '' && !hasInvalidClientTextChar(name) && drawsNothing.test(name)) blank.push(hex(n))
    }
    expect(blank).toEqual([])
  })

  it('still allows real text that sits next to those characters: Hangul, Khmer, braille, Mongolian, emoji', () => {
    for (const n of [0x3163, 0x3165, 0x1161, 0x115E, 0x17B3, 0x17B6, 0x2801, 0x28FF, 0x27FF, 0x180A, 0x1810, 0xFE10, 0xFFA1, 0xFF9F, 0xFFFC, 0xFFFD, 0x1D172, 0x1D17B, 0xE1000, 0x1F95A]) {
      expect(hasInvalidClientTextChar(ch(n)), hex(n)).toBe(false)
    }
    expect(hasInvalidClientTextChar('\u{1F95A} Egg')).toBe(false)
    expect(hasInvalidClientTextChar('\u2801\u2803')).toBe(false)
  })
})

describe('checkClientName', () => {
  it('accepts a good name and returns it normalised', () => {
    expect(checkClientName('  Maple   Street  Café ', [])).toEqual({ ok: true, name: 'Maple Street Café' })
  })

  it('blank (also spaces, tabs and NBSP only)', () => {
    for (const raw of ['', '   ', '\t\n', '\u00A0\u00A0']) {
      expect(checkClientName(raw, CLIENTS)).toMatchObject({ ok: false, reason: 'blank', message: CLIENT_MESSAGES.nameBlank })
    }
  })

  it('hidden characters', () => {
    for (const raw of ['A\u200BB', 'A\u0007B', 'A\uD800B', '\u200B', '\u3164', '\u2800', '\uFE0F', '  \u3164 \u2800  ', 'Maple\u115FMarket']) {
      expect(checkClientName(raw, CLIENTS)).toMatchObject({ ok: false, reason: 'invalid', message: CLIENT_MESSAGES.nameInvalid })
    }
  })

  it('60 characters pass and 61 do not, counted after normalising and in code points', () => {
    expect(checkClientName('a'.repeat(60), []).ok).toBe(true)
    expect(checkClientName('a'.repeat(61), [])).toMatchObject({ ok: false, reason: 'too_long', message: CLIENT_MESSAGES.nameTooLong })
    expect(checkClientName(`   ${'a'.repeat(60)}   `, []).ok).toBe(true)
    expect(checkClientName('\u{1F95A}'.repeat(60), []).ok).toBe(true)
    expect(checkClientName('\u{1F95A}'.repeat(61), []).ok).toBe(false)
  })

  it('a raw name over 200 characters is too long even if it would normalise short', () => {
    expect(checkClientName(`${' '.repeat(200)}Ana`, [])).toMatchObject({ ok: false, reason: 'too_long' })
  })

  it('matches an active client ignoring case and spacing, with that client\'s own spelling', () => {
    const r = checkClientName('  maple  STREET market ', CLIENTS)
    expect(r).toEqual({
      ok: false,
      reason: 'taken',
      message: 'You already have a client called Maple Street Market.',
      existing: { id: 'a', name: 'Maple Street Market', archived: false },
    })
  })

  it('matches an inactive client too, and the Add form points to marking it active', () => {
    const r = checkClientName('oakhill bakery', CLIENTS)
    expect(r).toEqual({
      ok: false,
      reason: 'taken',
      message: 'Oakhill Bakery is on your list, but marked inactive. Mark it active instead.',
      existing: { id: 'b', name: 'Oakhill Bakery', archived: true },
    })
  })

  it('in Edit (selfId given) the inactive message is text only', () => {
    const r = checkClientName('oakhill bakery', CLIENTS, 'a')
    expect(r).toMatchObject({ ok: false, reason: 'taken', existing: { id: 'b', archived: true } })
    expect(r.ok ? '' : r.message).toBe('Oakhill Bakery is on your list, but marked inactive. Pick another name, or mark it active from the list.')
  })

  it('"Cafe" and "Café" are different names', () => {
    expect(checkClientName('The Green Table Cafe', CLIENTS).ok).toBe(true)
    expect(checkClientName('the green table café', CLIENTS)).toMatchObject({ ok: false, reason: 'taken' })
    expect(checkClientName('Cafe', [{ id: 'x', name: 'Café', active: true }]).ok).toBe(true)
  })

  it('a composed and a decomposed é are one name', () => {
    expect(checkClientName('The Green Table Café', CLIENTS)).toMatchObject({ ok: false, reason: 'taken' })
  })

  it('skips selfId, so a client may change the case or spacing of its own name', () => {
    expect(checkClientName('maple street  market', CLIENTS, 'a')).toEqual({ ok: true, name: 'maple street market' })
    expect(checkClientName('Maple Street Market', CLIENTS, 'a')).toEqual({ ok: true, name: 'Maple Street Market' })
  })

  it('a spacing-only or case-only change still normalises to a different string (a real change)', () => {
    const r = checkClientName('MAPLE Street Market', CLIENTS, 'a')
    expect(r).toEqual({ ok: true, name: 'MAPLE Street Market' })
    expect(r.ok && r.name !== 'Maple Street Market').toBe(true)
  })

  it('does not put the typed value in any message', () => {
    const sentinel = 'SENTINEL-42'
    for (const raw of [`${sentinel}\u200B`, `${sentinel.repeat(20)}`, `${sentinel}${' '.repeat(300)}`]) {
      const r = checkClientName(raw, CLIENTS)
      expect(r.ok ? '' : r.message).not.toContain(sentinel)
    }
  })
})

describe('checkClientPhone', () => {
  it('accepts any format, trimmed', () => {
    expect(checkClientPhone('  (555) 201-3348 ')).toEqual({ ok: true, phone: '(555) 201-3348' })
    expect(checkClientPhone('+63 917 123 4567')).toEqual({ ok: true, phone: '+63 917 123 4567' })
    expect(checkClientPhone('555-2013 ext 4')).toEqual({ ok: true, phone: '555-2013 ext 4' })
  })

  it('blank is no phone', () => {
    expect(checkClientPhone('')).toEqual({ ok: true, phone: null })
    expect(checkClientPhone('   ')).toEqual({ ok: true, phone: null })
  })

  it('30 characters pass, 31 do not, counted after trimming', () => {
    expect(checkClientPhone('1'.repeat(30)).ok).toBe(true)
    expect(checkClientPhone(`  ${'1'.repeat(30)}  `).ok).toBe(true)
    expect(checkClientPhone('1'.repeat(31))).toMatchObject({ ok: false, reason: 'too_long', message: CLIENT_MESSAGES.phoneTooLong })
    expect(checkClientPhone(' '.repeat(250))).toMatchObject({ ok: false, reason: 'too_long' })
  })

  it('refuses hidden and control characters', () => {
    for (const raw of ['555\u200B1234', '555\u00001234', '555\t1234', '555\uD800']) {
      expect(checkClientPhone(raw)).toMatchObject({ ok: false, reason: 'invalid', message: CLIENT_MESSAGES.phoneInvalid })
    }
  })
})

// Security audit L3: a name (and a phone) needs at least one letter, number, symbol or punctuation character.
describe('hasVisibleClientTextChar', () => {
  const hex = (n: number) => `U+${n.toString(16).toUpperCase().padStart(4, '0')}`
  const ch = (n: number) => String.fromCodePoint(n)
  const zalgo = (base: string, marks: number) => base + ch(0x0301).repeat(marks)

  it('accepts ordinary text in any script, digits, punctuation, symbols and emoji', () => {
    for (const text of ['Maple', '7', '&', '-', '(555)', '+63', 'Café', 'O\'Brien', ch(0x4E2D), ch(0x0628), ch(0x0E01), ch(0x1F95A), ch(0x2603), ch(0x00A9), `e${ch(0x0301)}`, `${ch(0x0301)}a`]) {
      expect(hasVisibleClientTextChar(text), JSON.stringify(text)).toBe(true)
    }
  })

  it('refuses text with no letter, number, symbol or punctuation: the audit\'s cases', () => {
    const cases: [string, string][] = [
      ['object replacement', ch(0xFFFC)],
      ['a lone combining mark', ch(0x0301)],
      ['only combining marks', ch(0x0300).repeat(60)],
      ['Arabic number sign (format, not default-ignorable)', ch(0x0600)],
      ['Egyptian hieroglyph format control', ch(0x13430)],
      ['private use', ch(0xE000)],
      ['plane 15 private use', ch(0xF0000)],
      ['unassigned', ch(0x0378)],
      ['a noncharacter', ch(0xFFFE)],
      ['a noncharacter in plane 16', ch(0x10FFFF)],
      ['nothing', ''],
      ['a plain space', ' '],
      ['a line separator', ch(0x2028)],
      ['marks and private use mixed', `${ch(0x0301)}${ch(0xE000)}${ch(0x0378)}${ch(0xFFFC)}`],
    ]
    for (const [label, text] of cases) expect(hasVisibleClientTextChar(text), `${label} ${JSON.stringify(text)}`).toBe(false)
  })

  it('needs only ONE visible character among the rest', () => {
    expect(hasVisibleClientTextChar(`${ch(0xE000)}${ch(0x0301)}a`)).toBe(true)
    expect(hasVisibleClientTextChar(`${ch(0xFFFC)}7`)).toBe(true)
    expect(hasVisibleClientTextChar(zalgo('z', 59))).toBe(true) // the 60-code-point stack still has a letter; a cap on marks is not done
    expect(hasVisibleClientTextChar(zalgo('', 60))).toBe(false)
  })

  it('is exactly "not a mark, separator or other" over every code point, except U+FFFC (the categories partition Unicode)', () => {
    const notVisible = /^[\p{M}\p{Z}\p{C}]$/u
    const diffs: string[] = []
    for (let n = 0; n <= 0x10FFFF; n++) {
      if (n >= 0xD800 && n <= 0xDFFF) continue
      const c = ch(n)
      // U+FFFC is a symbol (So) by category, but it draws a placeholder box or nothing: the one deliberate exception.
      const expected = n !== 0xFFFC && !notVisible.test(c)
      if (hasVisibleClientTextChar(c) !== expected) diffs.push(hex(n))
    }
    expect(diffs).toEqual([])
  })

  it('U+FFFC is a symbol by category and still not visible: refused alone, allowed next to a visible character', () => {
    expect(/\p{So}/u.test(ch(0xFFFC))).toBe(true)
    expect(hasVisibleClientTextChar(ch(0xFFFC))).toBe(false)
    expect(hasVisibleClientTextChar(`${ch(0xFFFC)}${ch(0xFFFC)}`)).toBe(false)
    expect(hasVisibleClientTextChar(`a${ch(0xFFFC)}`)).toBe(true)
    expect(hasVisibleClientTextChar(ch(0xFFFD))).toBe(true) // the replacement character draws a diamond: visible
  })

  it('an unassigned or private-use character alone is not a name, whatever its script', () => {
    for (const n of [0x40000, 0x50000, 0xE1000, 0x0378, 0x0FFF]) {
      expect(hasVisibleClientTextChar(ch(n)), hex(n)).toBe(false)
    }
  })
})

describe('checkClientName: at least one visible character (audit L3)', () => {
  const ch = (n: number) => String.fromCodePoint(n)

  it('refuses a name with no visible character with the hidden-character message', () => {
    for (const raw of [ch(0xFFFC), ch(0x0301), ch(0x0600), ch(0x13430), ch(0xE000), ch(0x0378), ch(0x0301).repeat(60), `  ${ch(0xE000)}  ${ch(0x0301)} `]) {
      expect(checkClientName(raw, CLIENTS), JSON.stringify(raw)).toMatchObject({ ok: false, reason: 'invalid', message: CLIENT_MESSAGES.nameInvalid })
    }
  })

  it('keeps the check order: raw over 200, blank, invalid, too long', () => {
    // No visible character AND over 60: invalid comes before too_long.
    expect(checkClientName(ch(0x0301).repeat(61), CLIENTS)).toMatchObject({ ok: false, reason: 'invalid' })
    // A visible character AND over 60: too_long.
    expect(checkClientName(`a${ch(0x0301).repeat(61)}`, CLIENTS)).toMatchObject({ ok: false, reason: 'too_long' })
    // Blank stays blank, not invalid.
    expect(checkClientName('   ', CLIENTS)).toMatchObject({ ok: false, reason: 'blank' })
    // Over 200 raw is too_long even when it holds no visible character.
    expect(checkClientName(ch(0x0301).repeat(201), CLIENTS)).toMatchObject({ ok: false, reason: 'too_long' })
  })

  it('accepts a name that holds one visible character next to marks and symbols', () => {
    expect(checkClientName(`e${ch(0x0301)}`, [])).toMatchObject({ ok: true })
    expect(checkClientName('  #7  ', [])).toEqual({ ok: true, name: '#7' })
    expect(checkClientName(ch(0x1F95A), [])).toMatchObject({ ok: true })
  })
})

describe('checkClientPhone: at least one visible character (audit L3)', () => {
  const ch = (n: number) => String.fromCodePoint(n)

  it('refuses a phone with no visible character with the phone hidden-character message', () => {
    for (const raw of [ch(0x0301), ch(0xFFFC), ch(0xE000), ch(0x0600), `${ch(0x0301)} ${ch(0x0301)}`]) {
      expect(checkClientPhone(raw), JSON.stringify(raw)).toMatchObject({ ok: false, reason: 'invalid', message: CLIENT_MESSAGES.phoneInvalid })
    }
  })

  it('still accepts every free-text shape, with or without digits', () => {
    for (const raw of ['(555) 201-3348', '+63 917 123 4567', '555-2013 ext 4', '+', '---', 'ext', '(  )']) {
      expect(checkClientPhone(raw), raw).toMatchObject({ ok: true })
    }
    expect(checkClientPhone('   ')).toEqual({ ok: true, phone: null })
  })
})
