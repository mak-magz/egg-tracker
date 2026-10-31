import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { MAX_EGGS_PER_LINE, PRODUCTION_FIELDS, PRODUCTION_MESSAGES } from '../../shared/constants/production'
import {
  eggCountSchema,
  isoDateSchema,
  logProductionBodySchema,
  productionAmountsSchema,
  productionDayParamsSchema,
  productionRangeQuerySchema,
  replaceProductionDayBodySchema,
} from '../../shared/schemas/production'
import type {
  LogProductionBody,
  ProductionRangeQuery,
  ReplaceProductionDayBody,
} from '../../shared/schemas/production'
import type { LogProductionRequest, ReplaceProductionDayRequest } from '../../shared/types/api'

const SMALL = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'
const MEDIUM = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e62'
const LARGE = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e63'
const JUMBO = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e64'
const SUBMISSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

function messages(result: { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map(i => [i.path.join('.'), i.message]))
}

// AC3's morning at 30 per tray, in eggs.
const ac3 = {
  good: [
    { sizeId: SMALL, eggs: 42 },
    { sizeId: MEDIUM, eggs: 148 },
    { sizeId: LARGE, eggs: 264 },
    { sizeId: JUMBO, eggs: 40 },
  ],
  rejects: 5,
}

describe('production constants', () => {
  it('field keys match the §3.3 contract', () => {
    expect(PRODUCTION_FIELDS.date).toBe('date')
    expect(PRODUCTION_FIELDS.amounts).toBe('amounts')
    expect(PRODUCTION_FIELDS.rejects).toBe('rejects')
    expect(PRODUCTION_FIELDS.sizes).toBe('sizes')
    expect(PRODUCTION_FIELDS.from).toBe('from')
    expect(PRODUCTION_FIELDS.to).toBe('to')
    expect(PRODUCTION_FIELDS.good(LARGE)).toBe(`good.${LARGE}`)
    expect(MAX_EGGS_PER_LINE).toBe(1_000_000)
  })

  it('the loose message uses the farm tray size (AC6, AC9)', () => {
    expect(PRODUCTION_MESSAGES.looseTooHigh(30)).toBe('Loose eggs must be under 30. Add a tray instead.')
    expect(PRODUCTION_MESSAGES.looseTooHigh(24)).toBe('Loose eggs must be under 24. Add a tray instead.')
  })
})

describe('isoDateSchema', () => {
  it('accepts real dates and rejects anything else', () => {
    expect(isoDateSchema.safeParse('2026-09-25').success).toBe(true)
    for (const bad of ['2026-02-30', '2026-9-25', '25/09/2026', '2026-09-25T00:00:00Z', '', 20260925, null]) {
      const r = isoDateSchema.safeParse(bad)
      expect(r.success, String(bad)).toBe(false)
      expect(r.error?.issues[0]?.message).toBe(PRODUCTION_MESSAGES.dateRequired)
    }
  })
})

describe('eggCountSchema', () => {
  it('accepts whole numbers from 0 to the cap', () => {
    for (const n of [0, 1, 494, MAX_EGGS_PER_LINE]) expect(eggCountSchema.safeParse(n).success).toBe(true)
  })

  it('rejects negatives, decimals, strings and non-finite numbers (AC9)', () => {
    for (const bad of [-1, 1.5, '12', 'abc', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = eggCountSchema.safeParse(bad)
      expect(r.success, String(bad)).toBe(false)
      expect(r.error?.issues[0]?.message).toBe(PRODUCTION_MESSAGES.notWholeNumber)
    }
  })

  it('rejects counts over the per-line cap (D9)', () => {
    expect(messages(eggCountSchema.safeParse(MAX_EGGS_PER_LINE + 1))).toEqual({ '': PRODUCTION_MESSAGES.tooLarge })
  })
})

describe('productionAmountsSchema / replaceProductionDayBodySchema', () => {
  it('accepts the AC3 example', () => {
    const r = replaceProductionDayBodySchema.safeParse(ac3)
    expect(r.success).toBe(true)
    expect(r.data).toEqual(ac3)
  })

  it('accepts zero lines alongside a non-zero one, and rejects-only', () => {
    expect(productionAmountsSchema.safeParse({ good: [{ sizeId: SMALL, eggs: 0 }, { sizeId: LARGE, eggs: 30 }], rejects: 0 }).success).toBe(true)
    expect(productionAmountsSchema.safeParse({ good: [], rejects: 5 }).success).toBe(true)
  })

  it('nothing entered reports on `amounts` (AC10)', () => {
    expect(messages(productionAmountsSchema.safeParse({ good: [], rejects: 0 })))
      .toEqual({ amounts: PRODUCTION_MESSAGES.nothingEntered })
    expect(messages(productionAmountsSchema.safeParse({ good: [{ sizeId: SMALL, eggs: 0 }], rejects: 0 })))
      .toEqual({ amounts: PRODUCTION_MESSAGES.nothingEntered })
  })

  it('a duplicate size reports on `amounts`, whatever the uuid case', () => {
    const r = productionAmountsSchema.safeParse({
      good: [{ sizeId: LARGE, eggs: 10 }, { sizeId: LARGE.toUpperCase(), eggs: 5 }],
      rejects: 0,
    })
    expect(messages(r)).toEqual({ amounts: PRODUCTION_MESSAGES.duplicateSize })
  })

  it('bad counts report on their own path', () => {
    const r = productionAmountsSchema.safeParse({ good: [{ sizeId: SMALL, eggs: -1 }, { sizeId: LARGE, eggs: 1.5 }], rejects: 'abc' })
    expect(messages(r)).toEqual({
      'good.0.eggs': PRODUCTION_MESSAGES.notWholeNumber,
      'good.1.eggs': PRODUCTION_MESSAGES.notWholeNumber,
      [PRODUCTION_FIELDS.rejects]: PRODUCTION_MESSAGES.notWholeNumber,
    })
  })

  it('a size id that is not a uuid fails', () => {
    const r = productionAmountsSchema.safeParse({ good: [{ sizeId: 'large', eggs: 10 }], rejects: 0 })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.path).toEqual(['good', 0, 'sizeId'])
  })

  it('caps the number of lines', () => {
    const good = Array.from({ length: 101 }, (_, i) => ({ sizeId: `0b8f0f0e-6a54-4c1e-9d7e-${String(i).padStart(12, '0')}`, eggs: 1 }))
    expect(productionAmountsSchema.safeParse({ good, rejects: 0 }).success).toBe(false)
    expect(productionAmountsSchema.safeParse({ good: good.slice(0, 100), rejects: 0 }).success).toBe(true)
  })

  it('requires both fields', () => {
    expect(productionAmountsSchema.safeParse({ good: [] }).success).toBe(false)
    expect(productionAmountsSchema.safeParse({ rejects: 5 }).success).toBe(false)
  })

  it('strips a smuggled tenant_id and other unknown keys', () => {
    const r = replaceProductionDayBodySchema.safeParse({ ...ac3, tenant_id: 'evil', tenantId: 'evil', good: [{ ...ac3.good[0], tenant_id: 'evil' }] })
    expect(r.success).toBe(true)
    expect(r.data).toEqual({ good: [ac3.good[0]], rejects: 5 })
  })
})

describe('logProductionBodySchema', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const body = { ...ac3, submissionId: SUBMISSION, date: '2026-09-25' }

  it('accepts the AC3 example for today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T13:00:00Z'))
    const r = logProductionBodySchema.safeParse(body)
    expect(r.success).toBe(true)
    expect(r.data).toEqual(body)
  })

  it('accepts UTC today + 1 (a local "today" east of UTC) and any past date (AC11)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T13:00:00Z'))
    expect(logProductionBodySchema.safeParse({ ...body, date: '2026-09-26' }).success).toBe(true)
    expect(logProductionBodySchema.safeParse({ ...body, date: '2024-09-25' }).success).toBe(true)
  })

  it('rejects dates after UTC today + 1 on `date` (AC11 backstop)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T13:00:00Z'))
    expect(messages(logProductionBodySchema.safeParse({ ...body, date: '2026-09-27' })))
      .toEqual({ [PRODUCTION_FIELDS.date]: PRODUCTION_MESSAGES.futureDate })
  })

  it('a missing or malformed date reports on `date`', () => {
    expect(messages(logProductionBodySchema.safeParse({ ...body, date: undefined })))
      .toEqual({ date: PRODUCTION_MESSAGES.dateRequired })
    expect(messages(logProductionBodySchema.safeParse({ ...body, date: '2026-02-30' })))
      .toEqual({ date: PRODUCTION_MESSAGES.dateRequired })
  })

  it('requires a uuid submissionId', () => {
    expect(logProductionBodySchema.safeParse({ ...body, submissionId: undefined }).success).toBe(false)
    expect(logProductionBodySchema.safeParse({ ...body, submissionId: 'abc' }).success).toBe(false)
  })

  it('applies the amounts rules (nothing entered, duplicates)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T13:00:00Z'))
    expect(messages(logProductionBodySchema.safeParse({ ...body, good: [], rejects: 0 })))
      .toEqual({ amounts: PRODUCTION_MESSAGES.nothingEntered })
    expect(messages(logProductionBodySchema.safeParse({ ...body, good: [ac3.good[0], ac3.good[0]] })))
      .toEqual({ amounts: PRODUCTION_MESSAGES.duplicateSize })
  })

  it('strips a smuggled tenant_id', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T13:00:00Z'))
    const r = logProductionBodySchema.safeParse({ ...body, tenant_id: '11111111-1111-4111-8111-111111111111' })
    expect(r.success).toBe(true)
    expect(r.data).not.toHaveProperty('tenant_id')
  })
})

describe('productionDayParamsSchema', () => {
  it('validates the :date param', () => {
    expect(productionDayParamsSchema.safeParse({ date: '2026-09-25' }).success).toBe(true)
    expect(messages(productionDayParamsSchema.safeParse({ date: 'today' }))).toEqual({ date: PRODUCTION_MESSAGES.dateRequired })
  })
})

describe('productionRangeQuerySchema', () => {
  it('both ends are optional (open-ended ranges)', () => {
    expect(productionRangeQuerySchema.parse({})).toEqual({})
    expect(productionRangeQuerySchema.parse({ from: '2026-09-19' })).toEqual({ from: '2026-09-19' })
    expect(productionRangeQuerySchema.parse({ to: '2026-09-25' })).toEqual({ to: '2026-09-25' })
  })

  it('treats an empty query value as not set', () => {
    expect(productionRangeQuerySchema.parse({ from: '', to: '2026-09-25' })).toEqual({ to: '2026-09-25' })
  })

  it('accepts from == to and from < to', () => {
    expect(productionRangeQuerySchema.safeParse({ from: '2026-09-25', to: '2026-09-25' }).success).toBe(true)
    expect(productionRangeQuerySchema.safeParse({ from: '2026-09-19', to: '2026-09-25' }).success).toBe(true)
  })

  it('from after to reports on `to`', () => {
    expect(messages(productionRangeQuerySchema.safeParse({ from: '2026-09-26', to: '2026-09-25' })))
      .toEqual({ [PRODUCTION_FIELDS.to]: PRODUCTION_MESSAGES.endBeforeStart })
  })

  it('a malformed end reports on its own key', () => {
    expect(messages(productionRangeQuerySchema.safeParse({ from: 'yesterday' }))).toEqual({ from: PRODUCTION_MESSAGES.dateRequired })
    expect(messages(productionRangeQuerySchema.safeParse({ to: '2026-02-30' }))).toEqual({ to: PRODUCTION_MESSAGES.dateRequired })
  })

  it('strips a smuggled tenant_id', () => {
    expect(productionRangeQuerySchema.parse({ tenant_id: 'evil', from: '2026-09-19' })).toEqual({ from: '2026-09-19' })
  })
})

describe('schema output types match the §3.3 contract', () => {
  it('compiles', () => {
    expectTypeOf<LogProductionBody>().toExtend<LogProductionRequest>()
    expectTypeOf<ReplaceProductionDayBody>().toExtend<ReplaceProductionDayRequest>()
    expectTypeOf<ProductionRangeQuery>().toEqualTypeOf<{ from?: string, to?: string }>()
  })
})

describe('invalid dates never reach date comparisons', () => {
  it('a bad from/to pair fails cleanly instead of throwing', () => {
    expect(() => productionRangeQuerySchema.safeParse({ from: '2026-02-30', to: '2026-01-01' })).not.toThrow()
    expect(messages(productionRangeQuerySchema.safeParse({ from: '2026-02-30', to: '2026-01-01' })))
      .toEqual({ from: PRODUCTION_MESSAGES.dateRequired })
  })
})

describe('MAX_EGGS_PER_LINE matches the database', () => {
  it('equals the per-line cap enforced in the Drizzle tenant adapter', () => {
    const adapterSrc = readFileSync(join(__dirname, '..', '..', 'server', 'db', 'adapter.ts'), 'utf8')
    expect(adapterSrc).toContain('nextCount > 1_000_000')
    expect(adapterSrc).toContain('rejects > 1_000_000 || eggs.some(e => e > 1_000_000)')
    expect(MAX_EGGS_PER_LINE).toBe(1_000_000)
  })
})
