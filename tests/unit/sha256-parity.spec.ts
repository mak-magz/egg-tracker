import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256Hex } from '../../core/utils/hash'

describe('sha256Hex parity', () => {
  const cases = [
    '',
    'hello',
    'hello world',
    'delivery\u001Fclient-123\u001F2026-10-31\u001Fsize-1:60:260.00',
    'The quick brown fox jumps over the lazy dog',
    'Ñoño Señorita 🥚🥚🥚 12345!@#$%^&*()_+',
    'payload with special \u001E and \u001F separators',
    'b'.repeat(2500),
  ]

  for (const str of cases) {
    it(`matches node:crypto for input "${str.slice(0, 20)}..."`, () => {
      const expected = createHash('sha256').update(str, 'utf8').digest('hex')
      expect(sha256Hex(str)).toBe(expected)
    })
  }
})
