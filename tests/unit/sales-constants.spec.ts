import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_EGGS_PER_SALE_LINE, MAX_SALE_LINES, MAX_SALE_PRICE, SALE_FIELDS, SALE_MESSAGES } from '../../shared/constants/sales'

describe('sales field keys', () => {
  it('match the §3.3 contract', () => {
    expect(SALE_FIELDS.type).toBe('type')
    expect(SALE_FIELDS.clientId).toBe('clientId')
    expect(SALE_FIELDS.saleDate).toBe('saleDate')
    expect(SALE_FIELDS.deliveredDate).toBe('deliveredDate')
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

describe('MAX_SALE_LINES matches the database (M15)', () => {
  it('equals the deferred sale_lines_bounds trigger\'s bound', () => {
    const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
    const file = readdirSync(dir).find(f => f.endsWith('_sales.sql'))
    expect(file).toBeDefined()
    const sql = readFileSync(join(dir, file!), 'utf8')
    expect(sql).toContain(`if v_count < 1 or v_count > ${MAX_SALE_LINES} then`)
    expect(sql).toContain(`if cardinality(p_size_ids) < 1 or cardinality(p_size_ids) > ${MAX_SALE_LINES} then`)
  })
})

describe('MAX_EGGS_PER_SALE_LINE and MAX_SALE_PRICE match the database (M15)', () => {
  it('equal the sale_lines CHECK constraints', () => {
    const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
    const file = readdirSync(dir).find(f => f.endsWith('_sales.sql'))
    const sql = readFileSync(join(dir, file!), 'utf8')
    expect(sql).toContain(`check (eggs between 1 and ${MAX_EGGS_PER_SALE_LINE})`)
    expect(sql).toContain(`check (price_per_tray > 0 and price_per_tray <= ${MAX_SALE_PRICE}`)
    expect(sql).toContain(`if exists (select 1 from unnest(p_eggs) e(eggs) where e.eggs < 1 or e.eggs > ${MAX_EGGS_PER_SALE_LINE}) then`)
    expect(sql).toContain(`if exists (select 1 from unnest(p_prices) pr(price) where pr.price > ${MAX_SALE_PRICE}) then`)
  })
})
