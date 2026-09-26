import { describe, expect, expectTypeOf, it } from 'vitest'
import { SIZE_FIELDS, SIZE_MESSAGES } from '../../shared/constants/sizes'
import {
  addSizeBodySchema,
  renameSizeBodySchema,
  reorderSizesBodySchema,
  sizeIdParamsSchema,
  sizeNameSchema,
} from '../../shared/schemas/sizes'
import type { AddSizeBody, RenameSizeBody, ReorderSizesBody } from '../../shared/schemas/sizes'
import type { AddSizeRequest, RenameSizeRequest, ReorderSizesRequest } from '../../shared/types/api'
import { zodFields } from '../../server/utils/errors'

const A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'
const B = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e62'
const C = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e63'
const SUBMISSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

function messages(result: { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map(i => [i.path.join('.'), i.message]))
}

describe('sizes field keys', () => {
  it('match the §3.3 contract', () => {
    expect(SIZE_FIELDS).toEqual({ name: 'name', order: 'order', submissionId: 'submissionId', id: 'id' })
  })
})

describe('sizeNameSchema', () => {
  it('normalises the name', () => {
    expect(sizeNameSchema.parse('  Extra   Large ')).toBe('Extra Large')
  })

  it('reports blank, and never truncates a long name', () => {
    expect(sizeNameSchema.safeParse('   ').error?.issues[0]?.message).toBe(SIZE_MESSAGES.nameBlank)
    expect(sizeNameSchema.safeParse('a'.repeat(41)).error?.issues[0]?.message).toBe(SIZE_MESSAGES.nameTooLong)
    expect(sizeNameSchema.parse('a'.repeat(40))).toBe('a'.repeat(40))
  })

  it('refuses a raw name over 200 characters with one message, even when it would normalise to a short name (audit M-2)', () => {
    const result = sizeNameSchema.safeParse(`${' '.repeat(200)}Peewee`)
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(i => i.message)).toEqual([SIZE_MESSAGES.nameTooLong])
    expect(sizeNameSchema.safeParse('x'.repeat(30_000_000)).error?.issues.map(i => i.message)).toEqual([SIZE_MESSAGES.nameTooLong])
    expect(sizeNameSchema.parse(`${' '.repeat(190)}Peewee`)).toBe('Peewee')
  })

  it('counts code points, so 40 emoji pass and 41 fail', () => {
    expect(sizeNameSchema.safeParse('\u{1F95A}'.repeat(40)).success).toBe(true)
    expect(sizeNameSchema.safeParse('\u{1F95A}'.repeat(41)).success).toBe(false)
  })

  it('length is checked after normalising', () => {
    expect(sizeNameSchema.safeParse(`   ${'a'.repeat(40)}   `).success).toBe(true)
    expect(sizeNameSchema.safeParse(`${'a'.repeat(20)}      ${'a'.repeat(19)}`).success).toBe(true) // 20 + 1 + 19
  })

  it('rejects U+0000, other control characters and lone surrogates with one field message', () => {
    for (const raw of ['A\u0000B', '\u0000', 'A\u0007B', 'A\u007FB', 'A\uD800B', 'A\uDC00B', 'A\uD83E']) {
      const result = sizeNameSchema.safeParse(raw)
      expect(result.success).toBe(false)
      expect(result.error?.issues.map(i => i.message)).toEqual([SIZE_MESSAGES.nameInvalid])
    }
  })

  it('keeps tabs and newlines as spaces, whole emoji, and does not touch invisible format characters', () => {
    expect(sizeNameSchema.parse('Extra\tLarge\n')).toBe('Extra Large')
    expect(sizeNameSchema.parse('A\u{1F95A}B')).toBe('A\u{1F95A}B')
    expect(sizeNameSchema.safeParse('A​B').success).toBe(true) // QA N1: the owner decides
  })

  it('both body schemas answer a bad name on fields.name', () => {
    expect(messages(addSizeBodySchema.safeParse({ submissionId: SUBMISSION, name: 'A\u0000B' }))).toEqual({ name: SIZE_MESSAGES.nameInvalid })
    expect(messages(renameSizeBodySchema.safeParse({ name: 'A\uD800B' }))).toEqual({ name: SIZE_MESSAGES.nameInvalid })
  })

  it('a non-string is treated as blank', () => {
    expect(sizeNameSchema.safeParse(undefined).error?.issues[0]?.message).toBe(SIZE_MESSAGES.nameBlank)
    expect(sizeNameSchema.safeParse(5).error?.issues[0]?.message).toBe(SIZE_MESSAGES.nameBlank)
  })
})

describe('addSizeBodySchema', () => {
  it('accepts a submission id and a name, normalising the name', () => {
    expect(addSizeBodySchema.parse({ submissionId: SUBMISSION, name: ' Pee  wee ' })).toEqual({ submissionId: SUBMISSION, name: 'Pee wee' })
  })

  it('requires a UUID submissionId', () => {
    expect(addSizeBodySchema.safeParse({ name: 'Peewee' }).success).toBe(false)
    expect(Object.keys(messages(addSizeBodySchema.safeParse({ submissionId: 'nope', name: 'Peewee' })))).toEqual(['submissionId'])
  })

  it('puts a bad name on `name`', () => {
    expect(messages(addSizeBodySchema.safeParse({ submissionId: SUBMISSION, name: '' }))).toEqual({ name: SIZE_MESSAGES.nameBlank })
    expect(messages(addSizeBodySchema.safeParse({ submissionId: SUBMISSION, name: 'x'.repeat(41) }))).toEqual({ name: SIZE_MESSAGES.nameTooLong })
  })

  it('strips tenant_id, colorSlot, sortOrder and archived', () => {
    const parsed = addSizeBodySchema.parse({
      submissionId: SUBMISSION,
      name: 'Peewee',
      tenant_id: A,
      tenantId: A,
      colorSlot: 3,
      color_slot: 3,
      sortOrder: 0,
      archived: true,
      active: false,
    })
    expect(parsed).toEqual({ submissionId: SUBMISSION, name: 'Peewee' })
  })

  it('infers a type the contract request satisfies', () => {
    expectTypeOf<AddSizeBody>().toEqualTypeOf<AddSizeRequest>()
  })
})

describe('renameSizeBodySchema', () => {
  it('accepts and normalises a name', () => {
    expect(renameSizeBodySchema.parse({ name: '  Big ' })).toEqual({ name: 'Big' })
  })

  it('rejects blank and too long on `name`', () => {
    expect(messages(renameSizeBodySchema.safeParse({ name: ' ' }))).toEqual({ name: SIZE_MESSAGES.nameBlank })
    expect(messages(renameSizeBodySchema.safeParse({ name: 'x'.repeat(41) }))).toEqual({ name: SIZE_MESSAGES.nameTooLong })
  })

  it('strips unknown keys', () => {
    expect(renameSizeBodySchema.parse({ name: 'Big', tenant_id: A, colorSlot: 9, sortOrder: 2, archived: true })).toEqual({ name: 'Big' })
  })

  it('infers a type the contract request satisfies', () => {
    expectTypeOf<RenameSizeBody>().toEqualTypeOf<RenameSizeRequest>()
  })
})

describe('reorderSizesBodySchema', () => {
  it('accepts the full wanted order with the moved size in it', () => {
    expect(reorderSizesBodySchema.parse({ sizeId: B, order: [B, A, C] })).toEqual({ sizeId: B, order: [B, A, C] })
  })

  it('accepts a one-size list', () => {
    expect(reorderSizesBodySchema.safeParse({ sizeId: A, order: [A] }).success).toBe(true)
  })

  it('rejects an empty list', () => {
    expect(Object.keys(messages(reorderSizesBodySchema.safeParse({ sizeId: A, order: [] })))).toEqual(['order'])
  })

  it('accepts 100 ids and rejects 101', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `0b8f0f0e-6a54-4c1e-9d7e-${String(i).padStart(12, '0')}`)
    expect(reorderSizesBodySchema.safeParse({ sizeId: ids(100)[0], order: ids(100) }).success).toBe(true)
    expect(Object.keys(messages(reorderSizesBodySchema.safeParse({ sizeId: ids(101)[0], order: ids(101) })))).toEqual(['order'])
  })

  it('rejects duplicate ids, on `order`', () => {
    expect(messages(reorderSizesBodySchema.safeParse({ sizeId: A, order: [A, B, A] }))).toEqual({ order: SIZE_MESSAGES.changedElsewhere })
  })

  it('rejects duplicate ids that differ only in case', () => {
    expect(Object.keys(messages(reorderSizesBodySchema.safeParse({ sizeId: A, order: [A, A.toUpperCase()] })))).toEqual(['order'])
  })

  it('rejects a sizeId that is not in `order`, on `order`', () => {
    expect(messages(reorderSizesBodySchema.safeParse({ sizeId: C, order: [A, B] }))).toEqual({ order: SIZE_MESSAGES.changedElsewhere })
  })

  it('rejects non-UUID ids and a missing sizeId', () => {
    expect(reorderSizesBodySchema.safeParse({ sizeId: A, order: [A, 'nope'] }).success).toBe(false)
    expect(reorderSizesBodySchema.safeParse({ order: [A] }).success).toBe(false)
    expect(reorderSizesBodySchema.safeParse({ sizeId: A }).success).toBe(false)
  })

  it('strips unknown keys', () => {
    expect(reorderSizesBodySchema.parse({ sizeId: A, order: [A], tenant_id: B, sortOrder: 4 })).toEqual({ sizeId: A, order: [A] })
  })

  it('infers a type the contract request satisfies', () => {
    expectTypeOf<ReorderSizesBody>().toEqualTypeOf<ReorderSizesRequest>()
  })
})

describe('sizeIdParamsSchema', () => {
  it('accepts a UUID and strips other keys', () => {
    expect(sizeIdParamsSchema.parse({ id: A, tenant_id: B })).toEqual({ id: A })
  })

  it('rejects anything else, on `id`', () => {
    expect(Object.keys(messages(sizeIdParamsSchema.safeParse({ id: 'order' })))).toEqual(['id'])
    expect(sizeIdParamsSchema.safeParse({}).success).toBe(false)
  })
})

describe('zodFields with the sizes schemas (what the routes will return)', () => {
  it('keys errors by the SIZE_FIELDS names', () => {
    const add = addSizeBodySchema.safeParse({ submissionId: 'x', name: '' })
    expect(add.success).toBe(false)
    expect(zodFields(add.error!, {})).toEqual({ submissionId: expect.any(String), name: SIZE_MESSAGES.nameBlank })

    const reorder = reorderSizesBodySchema.safeParse({ sizeId: C, order: [A, 'nope'] })
    expect(reorder.success).toBe(false)
    expect(Object.keys(zodFields(reorder.error!))).toEqual(['order'])
  })
})
