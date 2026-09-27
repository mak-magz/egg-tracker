// Twin-rule guards for clients (docs/features/03-clients.md §3.1, §3.6), in the pattern of size-name-parity.spec.ts.
// The SQL helpers in the M12 migration and their JavaScript twins in shared/utils/client-name.ts must select exactly
// the same code points, so the form's live check and the database can never disagree about what is "invisible" or
// "a space". The classes are PARSED from the migration text, so editing one side without the other fails here.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLIENT_TEXT_INVALID_RANGES, hasInvalidClientTextChar, hasVisibleClientTextChar, normalizeClientPhone } from '../../shared/utils/client-name'

const dir = join(__dirname, '..', '..', 'supabase', 'migrations')

function migration(suffix: string): string {
  const file = readdirSync(dir).find(f => f.endsWith(suffix))
  expect(file, `the ${suffix} migration`).toBeDefined()
  return readFileSync(join(dir, file!), 'utf8')
}

/** The body of one SQL function: from its `create function` line to the closing `$$;`. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create function ${name}(`)
  expect(start, `create function ${name}`).toBeGreaterThanOrEqual(0)
  const end = sql.indexOf('$$;', sql.indexOf('as $$', start))
  return sql.slice(start, end)
}

/**
 * The body of the CURRENT definition of a SQL function: the last `create function` or `create or replace function`
 * across all migrations in order (a later migration may replace an earlier one, as the QA S2 migration does).
 */
function currentFunctionBody(name: string): string {
  const header = new RegExp(`create (?:or replace )?function ${name.replace('.', '\\.')}\\(`, 'g')
  let last = ''
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8')
    for (const m of sql.matchAll(header)) {
      const end = sql.indexOf('$$;', sql.indexOf('as $$', m.index))
      last = sql.slice(m.index, end)
    }
  }
  expect(last, `a definition of ${name}`).not.toBe('')
  return last
}

const isSurrogate = (cp: number) => cp >= 0xD800 && cp <= 0xDFFF
const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
const chars = (...cps: number[]) => cps.map(cp => String.fromCodePoint(cp))

describe('app.normalize_client_phone whitespace class', () => {
  const sizesSql = migration('_sizes_write_rules.sql')
  const clientsSql = migration('_clients.sql')
  const sizesClass = /regexp_replace\(\s*normalize\(p_name, nfc\),\s*'(\[[^']+\])\+'/.exec(sizesSql)?.[1]
  const phoneBody = functionBody(clientsSql, 'app.normalize_client_phone')
  const phoneMatch = /'\^(\[[^']+\])\+\|(\[[^']+\])\+\$'/.exec(phoneBody)

  it('is the class of app.normalize_size_name, copied verbatim, at both ends', () => {
    expect(sizesClass, 'the whitespace class in app.normalize_size_name').toBeDefined()
    expect(phoneMatch, 'the anchored trim pattern in app.normalize_client_phone').not.toBeNull()
    expect(phoneMatch![1]).toBe(sizesClass)
    expect(phoneMatch![2]).toBe(sizesClass)
  })

  it('selects exactly the code points JavaScript trim() strips (U+0000 to U+10FFFF)', () => {
    const cls = new RegExp(phoneMatch![1]!, 'u')
    const diffs: string[] = []
    for (let cp = 0; cp <= 0x10FFFF; cp++) {
      if (isSurrogate(cp)) continue // lone surrogates can't be stored
      const ch = String.fromCodePoint(cp)
      if ((`a${ch}`.trim() === 'a') !== cls.test(ch)) diffs.push(hex(cp))
    }
    expect(diffs).toEqual([])
  })

  it('normalizeClientPhone trims each of those characters at the ends and keeps the inside', () => {
    // tab, LF, VT, FF, CR, space, NBSP, U+1680, U+2000, U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF
    const spaces = chars(0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2000, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF)
    for (const ch of spaces) {
      // NFC maps U+2000 and U+2001 to U+2002 and U+2003 (canonical equivalents), so compare against the NFC form.
      const inner = ch.normalize('NFC')
      expect(normalizeClientPhone(`${ch}555${ch}${ch}201${ch}`), hex(ch.codePointAt(0)!)).toBe(`555${inner}${inner}201`)
    }
  })
})

describe('app.client_text_invalid = hasInvalidClientTextChar / CLIENT_TEXT_INVALID_RANGES', () => {
  const body = currentFunctionBody('app.client_text_invalid')
  const sqlClass = /~\s*'(\[[^']+\])'/.exec(body)?.[1]

  // Postgres writes astral escapes as an upper-case U plus 8 hex digits and BMP ones as a lower-case u plus 4;
  // JavaScript's `u` mode wants the braces form for the astral ones.
  const BACKSLASH = String.fromCharCode(92)
  const toJs = (cls: string) => new RegExp(
    cls.replaceAll(new RegExp(`${BACKSLASH}${BACKSLASH}U([0-9A-Fa-f]{8})`, 'g'), `${BACKSLASH}u{$1}`),
    'u',
  )
  const ESCAPE = new RegExp(`${BACKSLASH}${BACKSLASH}[uU]([0-9A-Fa-f]+)(?:-${BACKSLASH}${BACKSLASH}[uU]([0-9A-Fa-f]+))?`, 'g')

  it('the migration has the class', () => {
    expect(sqlClass, 'the character class in app.client_text_invalid').toBeDefined()
  })

  it('lists exactly the ranges of CLIENT_TEXT_INVALID_RANGES (the SQL class starts at U+0001: NUL can\'t be stored)', () => {
    const ranges: [number, number][] = []
    for (const m of sqlClass!.slice(1, -1).matchAll(ESCAPE)) {
      const lo = Number.parseInt(m[1]!, 16)
      ranges.push([lo, m[2] ? Number.parseInt(m[2], 16) : lo])
    }
    const js = CLIENT_TEXT_INVALID_RANGES.map(([lo, hi]) => [lo === 0 ? 1 : lo, hi] as [number, number])
    expect(ranges).toEqual(js)
  })

  it('selects exactly the code points hasInvalidClientTextChar refuses, over every code point Postgres can hold', () => {
    const sql = toJs(sqlClass!)
    const diffs: string[] = []
    for (let cp = 1; cp <= 0x10FFFF; cp++) { // U+0000 and lone surrogates can't be stored in a Postgres UTF-8 text
      if (isSurrogate(cp)) continue
      const ch = String.fromCodePoint(cp)
      if (sql.test(ch) !== hasInvalidClientTextChar(ch)) diffs.push(hex(cp))
    }
    expect(diffs).toEqual([])
  })

  it('JavaScript also refuses what Postgres can\'t hold (U+0000 and a lone surrogate)', () => {
    const nul = String.fromCharCode(0)
    const loneHigh = String.fromCharCode(0xD83D)
    const loneLow = String.fromCharCode(0xDE00)
    expect(hasInvalidClientTextChar(nul)).toBe(true)
    expect(hasInvalidClientTextChar(`a${loneHigh}b`)).toBe(true)
    expect(hasInvalidClientTextChar(loneLow)).toBe(true)
    expect(hasInvalidClientTextChar(String.fromCodePoint(0x1F600))).toBe(false)
  })

  it('the SQL class refuses every blank-looking character of QA S2 and every Default_Ignorable_Code_Point but U+FEFF', () => {
    const sql = toJs(sqlClass!)
    const ignorable = /\p{Default_Ignorable_Code_Point}/u
    const missed: string[] = []
    // QA's list, the variation selectors, and the joiners (which the owner keeps refusing).
    for (const cp of [0x3164, 0x2800, 0x115F, 0x1160, 0xFE0F, 0x034F, 0x17B4, 0x17B5, 0xFFA0, 0x180B, 0x180C, 0x180D, 0xFE00, 0xFE0E, 0x200C, 0x200D]) {
      if (!sql.test(String.fromCodePoint(cp))) missed.push(hex(cp))
    }
    for (let cp = 1; cp <= 0x10FFFF; cp++) {
      if (isSurrogate(cp) || cp === 0xFEFF) continue
      const ch = String.fromCodePoint(cp)
      if (ignorable.test(ch) && !sql.test(ch)) missed.push(hex(cp))
    }
    expect(missed).toEqual([])
  })

  it('never selects a space or a letter: whitespace is trimmed or collapsed elsewhere, not refused', () => {
    const sql = toJs(sqlClass!)
    for (const ch of [...chars(0x20, 0xA0, 0x2003, 0xFEFF, 0xE9), 'a', 'Z', '9', '&', '\'']) {
      expect(sql.test(ch), hex(ch.codePointAt(0)!)).toBe(false)
    }
  })
})

// Security audit L3: "at least one letter, number, symbol or punctuation character". Postgres regexes have no property
// classes, so the SQL spells the set out as explicit ranges (from one Unicode version); the JavaScript twin uses
// \p{L}|\p{N}|\p{S}|\p{P} without U+FFFC. They must select exactly the same code points. If this fails after a Node upgrade, the
// runtime's Unicode data has moved: regenerate the ranges in a NEW migration (see the M15 comment).
describe('app.client_text_visible = hasVisibleClientTextChar', () => {
  const body = currentFunctionBody('app.client_text_visible')
  const fast = /when p_text ~ '(\[[^']+\])' then true/.exec(body)?.[1]
  const big = /else p_text ~ '(\[[^']+\])'/.exec(body)?.[1]

  const BACKSLASH = String.fromCharCode(92)
  const toJs = (cls: string) => new RegExp(
    cls.replaceAll(new RegExp(`${BACKSLASH}${BACKSLASH}U([0-9A-Fa-f]{8})`, 'g'), `${BACKSLASH}u{$1}`),
    'u',
  )

  it('the migration has a cheap ASCII class and the big class, in that order', () => {
    expect(fast, 'the cheap class').toBe('[0-9A-Za-z]')
    expect(big, 'the big class').toBeDefined()
    expect(body.indexOf(fast!)).toBeLessThan(body.indexOf(big!))
  })

  it('selects exactly the code points hasVisibleClientTextChar accepts, over every code point Postgres can hold', () => {
    const sql = toJs(big!)
    const diffs: string[] = []
    for (let cp = 1; cp <= 0x10FFFF; cp++) { // U+0000 and lone surrogates can't be stored in a Postgres UTF-8 text
      if (isSurrogate(cp)) continue
      const ch = String.fromCodePoint(cp)
      if (sql.test(ch) !== hasVisibleClientTextChar(ch)) diffs.push(hex(cp))
    }
    expect(diffs).toEqual([])
  })

  it('the cheap class only short-cuts to what the big class would say anyway', () => {
    const fastJs = toJs(fast!)
    const bigJs = toJs(big!)
    for (let cp = 0; cp <= 0x7F; cp++) {
      const ch = String.fromCodePoint(cp)
      if (fastJs.test(ch)) expect(bigJs.test(ch), hex(cp)).toBe(true)
    }
  })

  it('the class is stated for the Unicode version it was generated from, which is the runtime\'s', () => {
    const sql = readdirSync(dir).filter(f => f.endsWith('_client_visible_char.sql')).map(f => readFileSync(join(dir, f), 'utf8')).join('')
    expect(sql, 'run `node -p process.versions.unicode` and regenerate the class when it moves').toContain(`Unicode ${process.versions.unicode}`)
  })

  it('refuses what the audit listed, alone, and accepts them next to a letter (JavaScript reading of the SQL class)', () => {
    const sql = toJs(big!)
    const none = [0xFFFC, 0x0301, 0x0600, 0x13430, 0xE000, 0x0378, 0xF0000, 0x10FFFF, 0x20, 0xA0, 0x2028]
    for (const cp of none) expect(sql.test(String.fromCodePoint(cp)), hex(cp)).toBe(false)
    for (const cp of [0x41, 0x37, 0x26, 0x2D, 0x4E2D, 0x1F95A, 0xE9]) expect(sql.test(String.fromCodePoint(cp)), hex(cp)).toBe(true)
  })
})
