// Guards the twin rule (docs/features/02-farm-settings.md §3.1, QA): normalizeSizeName trims and collapses
// every Unicode whitespace character (`\s`) into a single ASCII space after NFC normalization.
import { describe, expect, it } from 'vitest'
import { normalizeSizeName } from '../../shared/utils/size-name'

describe('normalizeSizeName whitespace handling', () => {
  it('strips every single Unicode whitespace code point (\\s) at the ends and collapses runs inside', () => {
    const js = /\s/u
    const diffs: string[] = []
    for (let cp = 0; cp <= 0x10FFFF; cp++) {
      if (cp >= 0xD800 && cp <= 0xDFFF) continue
      const ch = String.fromCodePoint(cp)
      if (js.test(ch)) {
        if (normalizeSizeName(`${ch}Large${ch}`) !== 'Large') {
          diffs.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
        }
      }
    }
    expect(diffs).toEqual([])
  })

  it('normalizeSizeName collapses each of those characters like a plain space', () => {
    for (const ch of ['\t', '\n', '\v', '\f', '\r', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿']) {
      expect(normalizeSizeName(`Extra${ch}${ch}Large`)).toBe('Extra Large')
    }
  })
})
