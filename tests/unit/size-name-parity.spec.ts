// Guards the twin rule (docs/features/02-farm-settings.md §3.1, QA): the whitespace class hard-coded in the
// SQL function app.normalize_size_name must select exactly the code points JavaScript's `\s` selects, so the
// form's live check and the database can never disagree about what a "space" is (NBSP, U+2003, BOM...).
// QA also compared normalizeSizeName with a running Postgres 17 over every code point (U+0001..U+10FFFF) and
// over 5 combining marks after every BMP code point: 0 differences. This test keeps that from regressing.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeSizeName } from '../../shared/utils/size-name'

function sqlWhitespaceClass(): RegExp {
  const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
  const file = readdirSync(dir).find(f => f.endsWith('_sizes_write_rules.sql'))
  expect(file).toBeDefined()
  const sql = readFileSync(join(dir, file!), 'utf8')
  const m = /regexp_replace\(\s*normalize\(p_name, nfc\),\s*'(\[[^']+\])\+'/.exec(sql)
  expect(m, 'the whitespace class in app.normalize_size_name').not.toBeNull()
  // Postgres ARE and JS agree on \t \n \v \f \r and literal characters inside a bracket expression.
  return new RegExp(m![1]!, 'u')
}

describe('app.normalize_size_name whitespace class = JavaScript \\s', () => {
  const sqlClass = sqlWhitespaceClass()

  it('selects exactly the same code points as \\s (U+0000 to U+10FFFF)', () => {
    const js = /\s/u
    const diffs: string[] = []
    for (let cp = 0; cp <= 0x10FFFF; cp++) {
      if (cp >= 0xD800 && cp <= 0xDFFF) continue // lone surrogates can't be stored
      const ch = String.fromCodePoint(cp)
      if (js.test(ch) !== sqlClass.test(ch)) diffs.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
    }
    expect(diffs).toEqual([])
  })

  it('normalizeSizeName collapses each of those characters like a plain space', () => {
    for (const ch of ['\t', '\n', '\v', '\f', '\r', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿']) {
      expect(normalizeSizeName(`Extra${ch}${ch}Large`)).toBe('Extra Large')
    }
  })
})
