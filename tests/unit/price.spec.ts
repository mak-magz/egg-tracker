import { describe, expect, it } from 'vitest'
import { CLIENT_MESSAGES } from '../../shared/constants/clients'
import { DEFAULT_CURRENCY } from '../../shared/constants/currency'
import {
  checkPriceNumber,
  currencySymbol,
  formatPrice,
  formatPriceInput,
  isKnownCurrency,
  parsePriceInput,
  priceProblemMessage,
} from '../../shared/utils/price'

describe('formatPrice', () => {
  it('puts the symbol first, always 2 decimals, comma thousands', () => {
    expect(formatPrice(6.5, 'PHP')).toBe('₱6.50')
    expect(formatPrice(250, 'PHP')).toBe('₱250.00')
    expect(formatPrice(1250, 'PHP')).toBe('₱1,250.00')
    expect(formatPrice(9999.99, 'PHP')).toBe('₱9,999.99')
    expect(formatPrice(0.5, 'PHP')).toBe('₱0.50')
  })

  it('follows the farm currency, and only the symbol changes (AC36, AC37)', () => {
    expect(formatPrice(6.5, 'USD')).toBe('$6.50')
    expect(formatPrice(6.5, 'EUR')).toBe('€6.50')
    expect(formatPrice(250, 'USD')).toBe('$250.00')
    // the same number, relabelled: no conversion
    expect(formatPrice(250, 'PHP').slice(1)).toBe(formatPrice(250, 'USD').slice(1))
  })

  it('keeps 2 decimals even for a currency that normally has none', () => {
    expect(formatPrice(250, 'JPY')).toMatch(/250\.00$/)
  })

  it('falls back to the peso for a missing, malformed or unknown currency (AC36)', () => {
    for (const c of [undefined, null, '', 'php', 'usd', 'PH', 'PHPP', 'ZZZ', 'XXX', '123']) {
      expect(formatPrice(6.5, c), String(c)).toBe('₱6.50')
    }
    expect(DEFAULT_CURRENCY).toBe('PHP')
  })

  it('prints the same string whatever the runtime locale is', () => {
    const before = Intl.DateTimeFormat().resolvedOptions().locale
    expect(formatPrice(1250, 'USD')).toBe('$1,250.00')
    expect(before).toBeTruthy() // the formatter never reads it
  })

  it('shows 0 and -0 as 0.00, and a negative amount with a sign', () => {
    expect(formatPrice(0, 'PHP')).toBe('₱0.00')
    expect(formatPrice(-0, 'PHP')).toBe('₱0.00')
    expect(formatPrice(-6.5, 'USD')).toContain('6.50')
  })

  it('throws for a non-finite amount', () => {
    expect(() => formatPrice(Number.NaN)).toThrow(RangeError)
    expect(() => formatPrice(Infinity)).toThrow(RangeError)
  })
})

describe('currencySymbol', () => {
  it('gives the symbol only', () => {
    expect(currencySymbol('PHP')).toBe('₱')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('EUR')).toBe('€')
  })

  it('falls back to the peso symbol', () => {
    for (const c of [undefined, null, '', 'php', 'ZZZ', 'XXX']) expect(currencySymbol(c), String(c)).toBe('₱')
  })
})

describe('isKnownCurrency', () => {
  it('knows real upper-case codes only', () => {
    expect(isKnownCurrency('PHP')).toBe(true)
    expect(isKnownCurrency('USD')).toBe(true)
    for (const c of ['ZZZ', 'XXX', 'php', '', undefined, null]) expect(isKnownCurrency(c), String(c)).toBe(false)
  })
})

describe('checkPriceNumber', () => {
  it('accepts prices above 0 up to 9,999.99 with at most 2 decimals', () => {
    for (const n of [0.01, 0.1, 6.5, 6.99, 250, 1250.5, 9999.99]) expect(checkPriceNumber(n), String(n)).toBeNull()
  })

  it('refuses zero, negative and NaN as not_positive', () => {
    for (const n of [0, -0, -1, -0.01, Number.NaN]) expect(checkPriceNumber(n), String(n)).toBe('not_positive')
  })

  it('refuses above the limit as too_large, before decimals', () => {
    for (const n of [10000, 9999.995, 9999.999, 1e21, Infinity]) expect(checkPriceNumber(n), String(n)).toBe('too_large')
  })

  it('refuses more than 2 decimals, including exponent forms', () => {
    for (const n of [6.505, 0.001, 1e-7, 0.1 + 0.2]) expect(checkPriceNumber(n), String(n)).toBe('too_many_decimals')
  })
})

describe('parsePriceInput', () => {
  const ok = (raw: string) => parsePriceInput(raw)

  it('reads blank as no price', () => {
    expect(ok('')).toEqual({ ok: true, value: null })
    expect(ok('   ')).toEqual({ ok: true, value: null })
  })

  it('reads valid prices as numbers', () => {
    expect(ok('6.5')).toEqual({ ok: true, value: 6.5 })
    expect(ok('6.50')).toEqual({ ok: true, value: 6.5 })
    expect(ok('250')).toEqual({ ok: true, value: 250 })
    expect(ok(' 9999.99 ')).toEqual({ ok: true, value: 9999.99 })
    expect(ok('0.01')).toEqual({ ok: true, value: 0.01 })
    expect(ok('.5')).toEqual({ ok: true, value: 0.5 })
    expect(ok('5.')).toEqual({ ok: true, value: 5 })
  })

  it('accepts trailing zeros past 2 decimals (6.500 is 6.50)', () => {
    expect(ok('6.500')).toEqual({ ok: true, value: 6.5 })
    expect(ok('6.5000000')).toEqual({ ok: true, value: 6.5 })
  })

  it('refuses more than 2 real decimals', () => {
    expect(ok('6.505')).toEqual({ ok: false, reason: 'too_many_decimals' })
    expect(ok('0.001')).toEqual({ ok: false, reason: 'too_many_decimals' })
  })

  it('refuses zero and negative as not_positive', () => {
    for (const raw of ['0', '0.00', '-1', '-0', '-6.50', '-0.001']) expect(ok(raw), raw).toEqual({ ok: false, reason: 'not_positive' })
  })

  it('refuses above the limit', () => {
    expect(ok('10000')).toEqual({ ok: false, reason: 'too_large' })
    expect(ok('9999.995')).toEqual({ ok: false, reason: 'too_large' })
    expect(ok('99999999999999999999999')).toEqual({ ok: false, reason: 'too_large' })
  })

  it('refuses anything that is not digits with one dot, so "6,5" is never read as 65', () => {
    for (const raw of ['6,5', '1,250', 'abc', '6.5.1', '1e21', '$6.50', '₱6.50', '6 5', '+5', '--5', '-', '.', '-abc', '٦']) {
      expect(ok(raw), raw).toEqual({ ok: false, reason: 'not_a_number' })
    }
  })

  // Security audit L7: the old pattern was quadratic (60,000 digits and "x" took 2.5 s). A linear one answers in
  // well under a millisecond; the 250 ms bound leaves room for a slow CI machine and still catches a regression.
  it('answers fast on very long input (no quadratic regex)', () => {
    const cases: [string, string][] = [
      ['digits then a letter', `${'1'.repeat(60_000)}x`],
      ['dot, digits then a letter', `1.${'1'.repeat(60_000)}x`],
      ['many zero decimals then a 1', `5.${'0'.repeat(60_000)}1`],
      ['only dots', '.'.repeat(60_000)],
    ]
    for (const [label, raw] of cases) {
      const started = performance.now()
      parsePriceInput(raw)
      expect(performance.now() - started, label).toBeLessThan(250)
    }
  })

  it('keeps the same answers on long input', () => {
    expect(ok(`${'1'.repeat(60_000)}x`)).toEqual({ ok: false, reason: 'not_a_number' })
    expect(ok('1'.repeat(60_000))).toEqual({ ok: false, reason: 'too_large' })
    expect(ok(`5.${'0'.repeat(60_000)}1`)).toEqual({ ok: false, reason: 'too_many_decimals' })
    expect(ok(`5.${'0'.repeat(60_000)}`)).toEqual({ ok: true, value: 5 })
  })

  it('reads the edge shapes as before', () => {
    expect(ok('.5')).toEqual({ ok: true, value: 0.5 })
    expect(ok('5.')).toEqual({ ok: true, value: 5 })
    expect(ok('6.500')).toEqual({ ok: true, value: 6.5 })
    expect(ok('6.505')).toEqual({ ok: false, reason: 'too_many_decimals' })
    expect(ok('6,5')).toEqual({ ok: false, reason: 'not_a_number' })
    expect(ok('..5')).toEqual({ ok: false, reason: 'not_a_number' })
    expect(ok('5..')).toEqual({ ok: false, reason: 'not_a_number' })
    expect(ok('.')).toEqual({ ok: false, reason: 'not_a_number' })
  })
})

describe('formatPriceInput', () => {
  it('is plain digits with 2 decimals, no symbol or separator', () => {
    expect(formatPriceInput(250)).toBe('250.00')
    expect(formatPriceInput(6.5)).toBe('6.50')
    expect(formatPriceInput(1250.5)).toBe('1250.50')
    expect(formatPriceInput(9999.99)).toBe('9999.99')
  })

  it('round-trips through parsePriceInput', () => {
    for (const n of [0.01, 6.5, 250, 9999.99]) expect(parsePriceInput(formatPriceInput(n))).toEqual({ ok: true, value: n })
  })
})

describe('priceProblemMessage', () => {
  it('maps each problem to the UX copy', () => {
    expect(priceProblemMessage('not_a_number')).toBe('Use numbers only, like 250.00.')
    expect(priceProblemMessage('not_positive')).toBe('Enter a price above 0, or leave it blank.')
    expect(priceProblemMessage('too_many_decimals')).toBe('Use 2 decimals at most, like 6.50.')
  })

  it('quotes the limit in the farm currency', () => {
    expect(priceProblemMessage('too_large', 'PHP')).toBe('The most you can enter is ₱9,999.99.')
    expect(priceProblemMessage('too_large', 'USD')).toBe('The most you can enter is $9,999.99.')
    expect(priceProblemMessage('too_large')).toBe('The most you can enter is ₱9,999.99.')
  })

  it('the server\'s copy is the same number without a symbol', () => {
    expect(CLIENT_MESSAGES.priceTooLargeServer).toBe(priceProblemMessage('too_large').replace('₱', ''))
  })
})
