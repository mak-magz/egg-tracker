import { describe, expect, expectTypeOf, it } from 'vitest'
import { SALE_MESSAGES } from '../../shared/constants/sales'
import {
  createSaleBodySchema,
  onHandQuerySchema,
  saleIdParamsSchema,
  saleLineInputSchema,
  salesListQuerySchema,
  updateSaleBodySchema,
  voidSaleBodySchema,
} from '../../shared/schemas/sales'
import type { CreateSaleBody, UpdateSaleBody } from '../../shared/schemas/sales'
import type { CreateSaleRequest, UpdateSaleRequest } from '../../shared/types/api'
import { zodFields } from '../../server/utils/errors'

const SIZE_A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'
const SIZE_B = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e62'
const CLIENT_A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e63'
const SUBMISSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const TODAY = new Date().toISOString().slice(0, 10)

function messages(result: { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map(i => [i.path.join('.'), i.message]))
}

function line(sizeId: string, eggs = 30, pricePerTray = 6.5) {
  return { sizeId, eggs, pricePerTray }
}

describe('saleLineInputSchema', () => {
  it('accepts a well-formed line', () => {
    expect(saleLineInputSchema.parse(line(SIZE_A))).toEqual({ sizeId: SIZE_A, eggs: 30, pricePerTray: 6.5 })
  })

  it('rejects 0 eggs and eggs over the cap', () => {
    expect(saleLineInputSchema.safeParse(line(SIZE_A, 0)).success).toBe(false)
    expect(saleLineInputSchema.safeParse(line(SIZE_A, 100_001)).success).toBe(false)
    expect(saleLineInputSchema.safeParse(line(SIZE_A, 100_000)).success).toBe(true)
  })

  it('rejects a non-integer quantity', () => {
    expect(saleLineInputSchema.safeParse(line(SIZE_A, 1.5)).success).toBe(false)
  })

  it('rejects a price of 0, negative, too large, or with too many decimals', () => {
    expect(messages(saleLineInputSchema.safeParse(line(SIZE_A, 30, 0))).pricePerTray).toBe(SALE_MESSAGES.priceNotPositive)
    expect(messages(saleLineInputSchema.safeParse(line(SIZE_A, 30, -1))).pricePerTray).toBe(SALE_MESSAGES.priceNotPositive)
    expect(messages(saleLineInputSchema.safeParse(line(SIZE_A, 30, 10_000))).pricePerTray).toBe(SALE_MESSAGES.priceTooLargeServer)
    expect(messages(saleLineInputSchema.safeParse(line(SIZE_A, 30, 6.505))).pricePerTray).toBe(SALE_MESSAGES.priceTooManyDecimals)
  })

  it('rejects a non-UUID sizeId', () => {
    expect(saleLineInputSchema.safeParse(line('not-a-uuid')).success).toBe(false)
  })
})

describe('createSaleBodySchema', () => {
  const base = { submissionId: SUBMISSION, type: 'on_site' as const, saleDate: TODAY, lines: [line(SIZE_A)] }

  it('accepts a minimal on-site sale with no client', () => {
    expect(createSaleBodySchema.safeParse(base).success).toBe(true)
  })

  it('requires a client for a delivery (AC13)', () => {
    const result = createSaleBodySchema.safeParse({ ...base, type: 'delivery' })
    expect(messages(result)).toMatchObject({ clientId: SALE_MESSAGES.clientRequired })
  })

  it('accepts a delivery with a client', () => {
    expect(createSaleBodySchema.safeParse({ ...base, type: 'delivery', clientId: CLIENT_A }).success).toBe(true)
  })

  it('rejects an empty client string (not the same as omitting it)', () => {
    expect(createSaleBodySchema.safeParse({ ...base, type: 'delivery', clientId: '' }).success).toBe(false)
  })

  it('rejects 0 lines and more than 20 lines (AC15)', () => {
    expect(messages(createSaleBodySchema.safeParse({ ...base, lines: [] })).lines).toBe(SALE_MESSAGES.linesMinOne)
    const many = Array.from({ length: 21 }, (_, i) => line(`0b8f0f0e-6a54-4c1e-9d7e-${String(i).padStart(12, '0')}`))
    expect(messages(createSaleBodySchema.safeParse({ ...base, lines: many })).lines).toBe(SALE_MESSAGES.linesMax)
    expect(createSaleBodySchema.safeParse({ ...base, lines: many.slice(0, 20) }).success).toBe(true)
  })

  it('rejects the same size twice (AC16)', () => {
    const result = createSaleBodySchema.safeParse({ ...base, lines: [line(SIZE_A), line(SIZE_A, 10)] })
    expect(messages(result).lines).toBe(SALE_MESSAGES.linesDuplicateSize)
  })

  it('rejects a future sale date (AC23)', () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    expect(messages(createSaleBodySchema.safeParse({ ...base, saleDate: future })).saleDate).toBe(SALE_MESSAGES.saleDateFuture)
  })

  it('rejects a malformed date', () => {
    expect(createSaleBodySchema.safeParse({ ...base, saleDate: '2026-13-40' }).success).toBe(false)
  })

  it('accepts an optional confirmShortfall, and strips a deliveredDate (feature 05: a sale has one date)', () => {
    const result = createSaleBodySchema.safeParse({ ...base, type: 'delivery', clientId: CLIENT_A, deliveredDate: TODAY, confirmShortfall: true })
    expect(result.success).toBe(true)
    expect(result.success && 'deliveredDate' in result.data).toBe(false)
  })

  it('strips unknown keys (tenantId, saleNumber, id, lineTotal, voidedAt)', () => {
    const parsed = createSaleBodySchema.parse({
      ...base,
      tenant_id: CLIENT_A,
      saleNumber: 1042,
      id: CLIENT_A,
      voidedAt: '2026-01-01',
      lines: [{ ...line(SIZE_A), lineTotal: 999 }],
    })
    expect(parsed).not.toHaveProperty('saleNumber')
    expect(parsed).not.toHaveProperty('id')
    expect(parsed).not.toHaveProperty('voidedAt')
    expect((parsed.lines[0] as unknown as { lineTotal?: number })).not.toHaveProperty('lineTotal')
  })

  it('infers a type the contract request satisfies', () => {
    expectTypeOf<CreateSaleBody>().toEqualTypeOf<CreateSaleRequest>()
  })
})

describe('updateSaleBodySchema', () => {
  const base = { version: 1, type: 'on_site' as const, saleDate: TODAY, lines: [line(SIZE_A)] }

  it('accepts a well-formed edit and requires the same client rule as create (AC13, AC40)', () => {
    expect(updateSaleBodySchema.safeParse(base).success).toBe(true)
    expect(messages(updateSaleBodySchema.safeParse({ ...base, type: 'delivery' })).clientId).toBe(SALE_MESSAGES.clientRequired)
  })

  it('rejects a missing or non-positive version', () => {
    expect(updateSaleBodySchema.safeParse({ ...base, version: 0 }).success).toBe(false)
    expect(updateSaleBodySchema.safeParse({ ...base, version: undefined }).success).toBe(false)
  })

  it('infers a type the contract request satisfies', () => {
    expectTypeOf<UpdateSaleBody>().toEqualTypeOf<UpdateSaleRequest>()
  })
})

describe('voidSaleBodySchema', () => {
  it('requires a positive integer version', () => {
    expect(voidSaleBodySchema.safeParse({ version: 1 }).success).toBe(true)
    expect(voidSaleBodySchema.safeParse({ version: 0 }).success).toBe(false)
    expect(voidSaleBodySchema.safeParse({}).success).toBe(false)
  })
})

describe('saleIdParamsSchema', () => {
  it('accepts a UUID and strips other keys', () => {
    expect(saleIdParamsSchema.parse({ id: SIZE_A, tenant_id: SIZE_B })).toEqual({ id: SIZE_A })
  })

  it('rejects a non-UUID', () => {
    expect(saleIdParamsSchema.safeParse({ id: 'nope' }).success).toBe(false)
  })
})

describe('salesListQuerySchema', () => {
  it('defaults limit, offset and includeVoided', () => {
    expect(salesListQuerySchema.parse({})).toEqual({ limit: 25, offset: 0, includeVoided: false })
  })

  it('treats an empty from/to as unset', () => {
    expect(salesListQuerySchema.parse({ from: '', to: '' })).toEqual({ limit: 25, offset: 0, includeVoided: false })
  })

  it('accepts type, clientId and a date range, and strips a status', () => {
    const parsed = salesListQuerySchema.parse({ from: '2026-09-01', to: '2026-09-27', status: 'pending', type: 'delivery', clientId: CLIENT_A, limit: '10', offset: '5' })
    expect(parsed).toEqual({ from: '2026-09-01', to: '2026-09-27', type: 'delivery', clientId: CLIENT_A, limit: 10, offset: 5, includeVoided: false })
  })

  it('rejects an end date before the start date', () => {
    const result = salesListQuerySchema.safeParse({ from: '2026-09-27', to: '2026-09-01' })
    expect(messages(result).to).toBe(SALE_MESSAGES.endBeforeStart)
  })

  it('reads includeVoided from a query string "true"/"false"', () => {
    expect(salesListQuerySchema.parse({ includeVoided: 'true' }).includeVoided).toBe(true)
    expect(salesListQuerySchema.parse({ includeVoided: 'false' }).includeVoided).toBe(false)
    // The Boolean() coercion trap: a non-"true" string must NOT become true.
    expect(salesListQuerySchema.parse({ includeVoided: 'no' }).includeVoided).toBe(false)
  })

  it('rejects an unknown type', () => {
    expect(salesListQuerySchema.safeParse({ type: 'pickup' }).success).toBe(false)
  })
})

describe('onHandQuerySchema', () => {
  it('defaults to an empty array', () => {
    expect(onHandQuerySchema.parse({})).toEqual({ sizeId: [] })
  })

  it('accepts one repeated sizeId as an array', () => {
    expect(onHandQuerySchema.parse({ sizeId: SIZE_A })).toEqual({ sizeId: [SIZE_A] })
    expect(onHandQuerySchema.parse({ sizeId: [SIZE_A, SIZE_B] })).toEqual({ sizeId: [SIZE_A, SIZE_B] })
  })

  it('rejects a non-UUID sizeId', () => {
    expect(onHandQuerySchema.safeParse({ sizeId: 'nope' }).success).toBe(false)
  })
})

describe('zodFields with the sales schemas (what the routes will return)', () => {
  it('keys errors by the SALE_FIELDS names', () => {
    const result = createSaleBodySchema.safeParse({ submissionId: SUBMISSION, type: 'delivery', saleDate: TODAY, lines: [line(SIZE_A)] })
    expect(result.success).toBe(false)
    expect(zodFields(result.error!)).toEqual({ clientId: SALE_MESSAGES.clientRequired })
  })
})
