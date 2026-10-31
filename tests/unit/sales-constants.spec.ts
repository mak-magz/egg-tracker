import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_EGGS_PER_SALE_LINE, MAX_SALE_LINES, MAX_SALE_PRICE, SALE_FIELDS, SALE_MESSAGES } from '../../shared/constants/sales'

describe('sales field keys', () => {
  it('match the §3.3 contract', () => {
    expect(SALE_FIELDS.type).toBe('type')
    expect(SALE_FIELDS.clientId).toBe('clientId')
    expect(SALE_FIELDS.saleDate).toBe('saleDate')
    expect('deliveredDate' in SALE_FIELDS).toBe(false)
    expect(SALE_FIELDS.lines).toBe('lines')
    expect(SALE_FIELDS.submissionId).toBe('submissionId')
    expect(SALE_FIELDS.version).toBe('version')
    expect(SALE_FIELDS.id).toBe('id')
    expect(SALE_FIELDS.line('abc')).toBe('lines.abc')
  })
})

describe('sales constants', () => {
  it('has the owner-approved limits (AC15, AC19, AC20)', () => {
    expect(MAX_SALE_LINES).toBe(20)
    expect(MAX_EGGS_PER_SALE_LINE).toBe(100_000)
    expect(MAX_SALE_PRICE).toBe(9_999.99)
  })

  it('MAX_EGGS_PER_SALE_LINE is smaller than production\'s per-line cap (D-note: a sale line is bounded by realistic stock, AC20)', () => {
    expect(MAX_EGGS_PER_SALE_LINE).toBeLessThan(1_000_000)
  })

  it('the messages are fixed strings: none of them takes an argument, so none can echo a typed value (AC59)', () => {
    for (const value of Object.values(SALE_MESSAGES)) {
      expect(typeof value).toBe('string')
    }
  })
})

describe('MAX_SALE_LINES, MAX_EGGS_PER_SALE_LINE and MAX_SALE_PRICE match the Drizzle adapter', () => {
  it('enforces the exact bounds in server/db/adapter.ts', () => {
    const adapterSrc = readFileSync(join(__dirname, '..', '..', 'server', 'db', 'adapter.ts'), 'utf8')
    expect(adapterSrc).toContain(`> ${MAX_SALE_LINES}`)
    expect(adapterSrc).toContain('> 100_000')
    expect(adapterSrc).toContain(`> ${MAX_SALE_PRICE}`)
  })
})
