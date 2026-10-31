// Twin-rule guards for clients (docs/features/03-clients.md §3.1, §3.6), verifying that the Drizzle adapter
// and shared/utils/client-name.ts use the exact same character classes and normalization functions.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLIENT_TEXT_INVALID_RANGES, hasInvalidClientTextChar, hasVisibleClientTextChar, normalizeClientPhone } from '../../shared/utils/client-name'

const isSurrogate = (cp: number) => cp >= 0xD800 && cp <= 0xDFFF
const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
const chars = (...cps: number[]) => cps.map(cp => String.fromCodePoint(cp))

describe('normalizeClientPhone whitespace handling', () => {
  it('selects and trims every code point JavaScript trim() strips (U+0000 to U+10FFFF)', () => {
    const diffs: string[] = []
    for (let cp = 0; cp <= 0x10FFFF; cp++) {
      if (isSurrogate(cp)) continue
      const ch = String.fromCodePoint(cp)
      const isSpace = `a${ch}`.trim() === 'a'
      if (isSpace && normalizeClientPhone(`${ch}555${ch}`) !== '555') {
        diffs.push(hex(cp))
      }
    }
    expect(diffs).toEqual([])
  })

  it('normalizeClientPhone trims each of those characters at the ends and keeps the inside', () => {
    const spaces = chars(0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2000, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF)
    for (const ch of spaces) {
      const inner = ch.normalize('NFC')
      expect(normalizeClientPhone(`${ch}555${ch}${ch}201${ch}`), hex(ch.codePointAt(0)!)).toBe(`555${inner}${inner}201`)
    }
  })
})

describe('hasInvalidClientTextChar / CLIENT_TEXT_INVALID_RANGES', () => {
  it('server/db/adapter.ts imports and enforces hasInvalidClientTextChar, hasVisibleClientTextChar, and normalizeClientPhone', () => {
    const adapterSrc = readFileSync(join(__dirname, '..', '..', 'server', 'db', 'adapter.ts'), 'utf8')
    expect(adapterSrc).toContain('hasInvalidClientTextChar')
    expect(adapterSrc).toContain('hasVisibleClientTextChar')
    expect(adapterSrc).toContain('normalizeClientPhone')
  })

  it('CLIENT_TEXT_INVALID_RANGES covers all expected non-printable / ignorable ranges', () => {
    expect(CLIENT_TEXT_INVALID_RANGES.length).toBeGreaterThan(0)
  })

  it('refuses U+0000 and lone surrogates', () => {
    const nul = String.fromCharCode(0)
    const loneHigh = String.fromCharCode(0xD83D)
    const loneLow = String.fromCharCode(0xDE00)
    expect(hasInvalidClientTextChar(nul)).toBe(true)
    expect(hasInvalidClientTextChar(`a${loneHigh}b`)).toBe(true)
    expect(hasInvalidClientTextChar(loneLow)).toBe(true)
    expect(hasInvalidClientTextChar(String.fromCodePoint(0x1F600))).toBe(false)
  })

  it('refuses every blank-looking character of QA S2 and every Default_Ignorable_Code_Point but U+FEFF', () => {
    const ignorable = /\p{Default_Ignorable_Code_Point}/u
    const missed: string[] = []
    for (const cp of [0x3164, 0x2800, 0x115F, 0x1160, 0xFE0F, 0x034F, 0x17B4, 0x17B5, 0xFFA0, 0x180B, 0x180C, 0x180D, 0xFE00, 0xFE0E, 0x200C, 0x200D]) {
      if (!hasInvalidClientTextChar(String.fromCodePoint(cp))) missed.push(hex(cp))
    }
    for (let cp = 1; cp <= 0x10FFFF; cp++) {
      if (isSurrogate(cp) || cp === 0xFEFF) continue
      const ch = String.fromCodePoint(cp)
      if (ignorable.test(ch) && !hasInvalidClientTextChar(ch)) missed.push(hex(cp))
    }
    expect(missed).toEqual([])
  })

  it('never selects a space or a letter: whitespace is trimmed or collapsed elsewhere, not refused', () => {
    for (const ch of [...chars(0x20, 0xA0, 0x2003, 0xFEFF, 0xE9), 'a', 'Z', '9', '&', '\'']) {
      expect(hasInvalidClientTextChar(ch), hex(ch.codePointAt(0)!)).toBe(false)
    }
  })
})

describe('hasVisibleClientTextChar', () => {
  it('refuses invisible/formatting characters alone, and accepts visible letters/numbers/symbols/punctuation', () => {
    const none = [0xFFFC, 0x0301, 0x0600, 0x13430, 0xE000, 0x0378, 0xF0000, 0x10FFFF, 0x20, 0xA0, 0x2028]
    for (const cp of none) expect(hasVisibleClientTextChar(String.fromCodePoint(cp)), hex(cp)).toBe(false)
    for (const cp of [0x41, 0x37, 0x26, 0x2D, 0x4E2D, 0x1F95A, 0xE9]) expect(hasVisibleClientTextChar(String.fromCodePoint(cp)), hex(cp)).toBe(true)
  })
})
