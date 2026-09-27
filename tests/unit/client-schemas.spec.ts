import { describe, expect, expectTypeOf, it } from 'vitest'
import { CLIENT_FIELDS, CLIENT_MESSAGES } from '../../shared/constants/clients'
import {
  addClientBodySchema,
  clientIdParamsSchema,
  clientNameSchema,
  clientPhoneSchema,
  clientPriceSchema,
  updateClientBodySchema,
} from '../../shared/schemas/clients'
import type { AddClientBody, UpdateClientBody } from '../../shared/schemas/clients'
import type { AddClientRequest, UpdateClientRequest } from '../../shared/types/api'
import { zodFields } from '../../server/utils/errors'

const A = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e61'
const B = '0b8f0f0e-6a54-4c1e-9d7e-1a2b3c4d5e62'
const SUBMISSION = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const SENTINEL = 'SENTINEL-9f3a'

type Result = { success: boolean, error?: { issues: { path: PropertyKey[], message: string }[] } }
function messages(result: Result) {
  return Object.fromEntries((result.error?.issues ?? []).map(i => [i.path.join('.'), i.message]))
}
function allMessages(result: Result): string[] {
  return (result.error?.issues ?? []).map(i => i.message)
}

describe('client field keys', () => {
  it('match the §3.3 contract', () => {
    expect(CLIENT_FIELDS).toEqual({ name: 'name', phone: 'phone', defaultPrice: 'defaultPrice', submissionId: 'submissionId', version: 'version', id: 'id' })
  })
})

describe('clientNameSchema', () => {
  it('normalises the name', () => {
    expect(clientNameSchema.parse('  Maple   Street  Market ')).toBe('Maple Street Market')
  })

  it('keeps letters, digits, punctuation and accents as typed', () => {
    for (const name of ['Sam & Dana Coyle', 'The Green Table Café', 'O\'Brien\'s']) expect(clientNameSchema.parse(name)).toBe(name)
  })

  it('reports blank, and never truncates a long name', () => {
    expect(allMessages(clientNameSchema.safeParse('   '))).toEqual([CLIENT_MESSAGES.nameBlank])
    expect(allMessages(clientNameSchema.safeParse('a'.repeat(61)))).toEqual([CLIENT_MESSAGES.nameTooLong])
    expect(clientNameSchema.parse('a'.repeat(60))).toBe('a'.repeat(60))
  })

  it('counts code points after normalising', () => {
    expect(clientNameSchema.safeParse('\u{1F95A}'.repeat(60)).success).toBe(true)
    expect(clientNameSchema.safeParse('\u{1F95A}'.repeat(61)).success).toBe(false)
    expect(clientNameSchema.safeParse(`   ${'a'.repeat(60)}   `).success).toBe(true)
  })

  it('refuses a raw name over 200 characters with one message (audit M-2)', () => {
    expect(allMessages(clientNameSchema.safeParse(`${' '.repeat(200)}Ana`))).toEqual([CLIENT_MESSAGES.nameTooLong])
    expect(allMessages(clientNameSchema.safeParse('x'.repeat(30_000_000)))).toEqual([CLIENT_MESSAGES.nameTooLong])
    expect(clientNameSchema.parse(`${' '.repeat(190)}Ana`)).toBe('Ana')
  })

  it('refuses control and invisible characters and lone surrogates with one message', () => {
    for (const raw of ['A\u0000B', 'A\u0007B', 'A\u007FB', 'A\u0085B', 'A\u00ADB', 'A\u200BB', 'A\u200CB', 'A\u200DB', 'A\u202EB', 'A\u2060B', 'A\uD800B', 'A\uDC00B', 'A\uD83E', '\u200B', '\u3164', '\u2800', '\uFE0F', '\u115F', '  \u3164  ', 'A\u034FB']) {
      const result = clientNameSchema.safeParse(raw)
      expect(result.success, JSON.stringify(raw)).toBe(false)
      expect(allMessages(result)).toEqual([CLIENT_MESSAGES.nameInvalid])
    }
  })

  it('turns tabs and newlines into spaces, and keeps whole emoji', () => {
    expect(clientNameSchema.parse('Maple\tStreet\n')).toBe('Maple Street')
    expect(clientNameSchema.parse('A\u{1F95A}B')).toBe('A\u{1F95A}B')
  })

  it('treats a non-string as blank', () => {
    expect(allMessages(clientNameSchema.safeParse(undefined))).toEqual([CLIENT_MESSAGES.nameBlank])
    expect(allMessages(clientNameSchema.safeParse(5))).toEqual([CLIENT_MESSAGES.nameBlank])
  })
})

describe('clientPhoneSchema', () => {
  it('trims and keeps the inside as typed', () => {
    for (const phone of ['(555) 201-3348', '+63 917 123 4567', '555-2013 ext 4']) expect(clientPhoneSchema.parse(` ${phone} `)).toBe(phone)
  })

  it('turns blank into null', () => {
    expect(clientPhoneSchema.parse('   ')).toBeNull()
    expect(clientPhoneSchema.parse('')).toBeNull()
  })

  it('30 characters pass and 31 do not, counted after trimming', () => {
    expect(clientPhoneSchema.parse(`  ${'1'.repeat(30)} `)).toBe('1'.repeat(30))
    expect(allMessages(clientPhoneSchema.safeParse('1'.repeat(31)))).toEqual([CLIENT_MESSAGES.phoneTooLong])
    expect(allMessages(clientPhoneSchema.safeParse(' '.repeat(201)))).toEqual([CLIENT_MESSAGES.phoneTooLong])
  })

  it('refuses hidden and control characters, and lone surrogates', () => {
    for (const raw of ['555\u200B1234', '555\u00001234', '555\t1234', '555\uD800', '\u3164', '555\u2800', '555\uFE0F1']) {
      expect(allMessages(clientPhoneSchema.safeParse(raw)), JSON.stringify(raw)).toEqual([CLIENT_MESSAGES.phoneInvalid])
    }
  })

  it('refuses a non-string with the phone message', () => {
    expect(allMessages(clientPhoneSchema.safeParse(5))).toEqual([CLIENT_MESSAGES.phoneInvalid])
  })
})

describe('clientPriceSchema', () => {
  it('accepts 0.01 to 9999.99 with at most 2 decimals', () => {
    for (const n of [0.01, 6.5, 250, 1250.5, 9999.99]) expect(clientPriceSchema.parse(n)).toBe(n)
  })

  it('refuses zero and negative', () => {
    for (const n of [0, -1, -0.5]) expect(allMessages(clientPriceSchema.safeParse(n))).toEqual([CLIENT_MESSAGES.priceNotPositive])
  })

  it('refuses above the limit, with the server copy (a number, no symbol)', () => {
    for (const n of [10000, 9999.995, 1e21]) expect(allMessages(clientPriceSchema.safeParse(n))).toEqual([CLIENT_MESSAGES.priceTooLargeServer])
    expect(CLIENT_MESSAGES.priceTooLargeServer).not.toMatch(/[₱$]/)
  })

  it('refuses more than 2 decimals', () => {
    for (const n of [6.505, 0.001, 1e-7]) expect(allMessages(clientPriceSchema.safeParse(n))).toEqual([CLIENT_MESSAGES.priceTooManyDecimals])
  })

  it('refuses anything that is not a finite number', () => {
    for (const v of ['6.5', '', true, {}, [], undefined, Number.NaN, Infinity]) {
      expect(allMessages(clientPriceSchema.safeParse(v)), String(v)).toEqual([CLIENT_MESSAGES.priceNotANumber])
    }
  })
})

describe('addClientBodySchema', () => {
  it('accepts a submission id and a name; omitted phone and price stay omitted (the repository reads "none")', () => {
    expect(addClientBodySchema.parse({ submissionId: SUBMISSION, name: ' Maple  Street ' })).toEqual({ submissionId: SUBMISSION, name: 'Maple Street' })
  })

  it('accepts all three fields, normalising them', () => {
    expect(addClientBodySchema.parse({ submissionId: SUBMISSION, name: 'Ana', phone: ' 555 ', defaultPrice: 6.5 }))
      .toEqual({ submissionId: SUBMISSION, name: 'Ana', phone: '555', defaultPrice: 6.5 })
  })

  it('accepts null phone and price, and a blank phone becomes null', () => {
    expect(addClientBodySchema.parse({ submissionId: SUBMISSION, name: 'Ana', phone: null, defaultPrice: null }))
      .toEqual({ submissionId: SUBMISSION, name: 'Ana', phone: null, defaultPrice: null })
    expect(addClientBodySchema.parse({ submissionId: SUBMISSION, name: 'Ana', phone: '   ' }).phone).toBeNull()
  })

  it('requires a UUID submissionId', () => {
    expect(addClientBodySchema.safeParse({ name: 'Ana' }).success).toBe(false)
    expect(Object.keys(messages(addClientBodySchema.safeParse({ submissionId: 'nope', name: 'Ana' })))).toEqual(['submissionId'])
  })

  it('puts each problem on its own field', () => {
    expect(messages(addClientBodySchema.safeParse({ submissionId: SUBMISSION, name: '' }))).toEqual({ name: CLIENT_MESSAGES.nameBlank })
    expect(messages(addClientBodySchema.safeParse({ submissionId: SUBMISSION, name: 'Ana', phone: '1'.repeat(31) }))).toEqual({ phone: CLIENT_MESSAGES.phoneTooLong })
    expect(messages(addClientBodySchema.safeParse({ submissionId: SUBMISSION, name: 'Ana', defaultPrice: 0 }))).toEqual({ defaultPrice: CLIENT_MESSAGES.priceNotPositive })
    expect(messages(addClientBodySchema.safeParse({ submissionId: 'x', name: '', phone: '\u200B1', defaultPrice: 6.505 }))).toEqual({
      submissionId: expect.any(String),
      name: CLIENT_MESSAGES.nameBlank,
      phone: CLIENT_MESSAGES.phoneInvalid,
      defaultPrice: CLIENT_MESSAGES.priceTooManyDecimals,
    })
  })

  it('strips tenant_id, active, archivedAt, version and id', () => {
    const parsed = addClientBodySchema.parse({
      submissionId: SUBMISSION,
      name: 'Ana',
      tenant_id: A,
      tenantId: A,
      active: false,
      archived: true,
      archivedAt: '2026-01-01',
      archived_at: '2026-01-01',
      version: 9,
      id: B,
    })
    expect(parsed).toEqual({ submissionId: SUBMISSION, name: 'Ana' })
  })

  it('infers a type the contract request satisfies', () => {
    expectTypeOf<AddClientBody>().toEqualTypeOf<AddClientRequest>()
  })
})

describe('updateClientBodySchema', () => {
  const valid = { version: 3, name: 'Ana', phone: null, defaultPrice: null }

  it('accepts the three fields and a version, normalising them', () => {
    expect(updateClientBodySchema.parse({ version: 3, name: ' Ana  B ', phone: ' 555 ', defaultPrice: 250 }))
      .toEqual({ version: 3, name: 'Ana B', phone: '555', defaultPrice: 250 })
  })

  it('null clears a phone or a price; a blank phone becomes null', () => {
    expect(updateClientBodySchema.parse(valid)).toEqual(valid)
    expect(updateClientBodySchema.parse({ ...valid, phone: '  ' }).phone).toBeNull()
  })

  it('requires all three keys, so a body that forgets one is a 400 and never an accidental clear', () => {
    expect(Object.keys(messages(updateClientBodySchema.safeParse({ version: 3, name: 'Ana', defaultPrice: null })))).toEqual(['phone'])
    expect(Object.keys(messages(updateClientBodySchema.safeParse({ version: 3, name: 'Ana', phone: null })))).toEqual(['defaultPrice'])
    expect(Object.keys(messages(updateClientBodySchema.safeParse({ version: 3, phone: null, defaultPrice: null })))).toEqual(['name'])
    expect(Object.keys(messages(updateClientBodySchema.safeParse({ name: 'Ana', phone: null, defaultPrice: null })))).toEqual(['version'])
  })

  it('refuses a version that is not a positive whole number', () => {
    for (const version of [0, -1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      const r = updateClientBodySchema.safeParse({ ...valid, version })
      expect(r.success, String(version)).toBe(false)
      expect(Object.keys(messages(r)), String(version)).toEqual(['version'])
    }
    expect(updateClientBodySchema.safeParse({ ...valid, version: 1 }).success).toBe(true)
    expect(updateClientBodySchema.safeParse({ ...valid, version: Number.MAX_SAFE_INTEGER }).success).toBe(true)
  })

  it('puts each problem on its own field', () => {
    expect(messages(updateClientBodySchema.safeParse({ ...valid, name: 'a'.repeat(61) }))).toEqual({ name: CLIENT_MESSAGES.nameTooLong })
    expect(messages(updateClientBodySchema.safeParse({ ...valid, defaultPrice: 10000 }))).toEqual({ defaultPrice: CLIENT_MESSAGES.priceTooLargeServer })
  })

  it('strips unknown keys', () => {
    expect(updateClientBodySchema.parse({ ...valid, tenant_id: A, active: false, archivedAt: 'x', id: B })).toEqual(valid)
  })

  it('infers a type the contract request satisfies', () => {
    expectTypeOf<UpdateClientBody>().toEqualTypeOf<UpdateClientRequest>()
  })
})

describe('clientIdParamsSchema', () => {
  it('accepts a UUID and strips other keys', () => {
    expect(clientIdParamsSchema.parse({ id: A, tenant_id: B })).toEqual({ id: A })
  })

  it('rejects anything else, on `id`', () => {
    expect(Object.keys(messages(clientIdParamsSchema.safeParse({ id: 'nope' })))).toEqual(['id'])
    expect(clientIdParamsSchema.safeParse({}).success).toBe(false)
  })
})

describe('no message echoes the input (AC29)', () => {
  it('none of the issue messages contains a sentinel that was sent in', () => {
    const results: Result[] = [
      clientNameSchema.safeParse(`${SENTINEL}\u200B`),
      clientNameSchema.safeParse(SENTINEL.repeat(30)),
      clientNameSchema.safeParse(`${SENTINEL}${' '.repeat(300)}`),
      clientPhoneSchema.safeParse(`${SENTINEL}\u200B`),
      clientPhoneSchema.safeParse(SENTINEL.repeat(30)),
      clientPriceSchema.safeParse(SENTINEL),
      addClientBodySchema.safeParse({ submissionId: SENTINEL, name: SENTINEL.repeat(30), phone: SENTINEL.repeat(30), defaultPrice: SENTINEL }),
      updateClientBodySchema.safeParse({ version: SENTINEL, name: `${SENTINEL}\u200B`, phone: `${SENTINEL}\u0000`, defaultPrice: SENTINEL }),
      clientIdParamsSchema.safeParse({ id: SENTINEL }),
    ]
    for (const r of results) {
      expect(r.success).toBe(false)
      expect(allMessages(r).length).toBeGreaterThan(0)
      for (const m of allMessages(r)) expect(m).not.toContain(SENTINEL)
    }
  })
})

describe('zodFields with the clients schemas (what the routes will return)', () => {
  it('keys errors by the CLIENT_FIELDS names', () => {
    const add = addClientBodySchema.safeParse({ submissionId: 'x', name: '', phone: 5, defaultPrice: '1' })
    expect(add.success).toBe(false)
    expect(zodFields(add.error!, {})).toEqual({
      submissionId: expect.any(String),
      name: CLIENT_MESSAGES.nameBlank,
      phone: CLIENT_MESSAGES.phoneInvalid,
      defaultPrice: CLIENT_MESSAGES.priceNotANumber,
    })
    const params = clientIdParamsSchema.safeParse({ id: 'x' })
    expect(Object.keys(zodFields(params.error!))).toEqual([CLIENT_FIELDS.id])
  })
})

describe('at least one visible character (audit L3)', () => {
  const ch = (n: number) => String.fromCodePoint(n)
  // U+FFFC, a lone mark, U+0600, U+13430, private use, an unassigned code point, a stack of marks alone.
  const NO_VISIBLE = [ch(0xFFFC), ch(0x0301), ch(0x0600), ch(0x13430), ch(0xE000), ch(0x0378), ch(0x0301).repeat(60)]

  it('the name schema refuses them with the hidden-character message', () => {
    for (const raw of NO_VISIBLE) {
      expect(allMessages(clientNameSchema.safeParse(raw)), JSON.stringify(raw)).toEqual([CLIENT_MESSAGES.nameInvalid])
    }
  })

  it('the phone schema refuses them with the phone message', () => {
    for (const raw of NO_VISIBLE) {
      expect(allMessages(clientPhoneSchema.safeParse(raw)), JSON.stringify(raw)).toEqual([CLIENT_MESSAGES.phoneInvalid])
    }
  })

  it('a body with one of them is a 400 on the right field, add and update', () => {
    const add = addClientBodySchema.safeParse({ submissionId: SUBMISSION, name: ch(0xFFFC), phone: ch(0x0301) })
    expect(Object.keys(zodFields(add.error!)).sort()).toEqual([CLIENT_FIELDS.name, CLIENT_FIELDS.phone])
    const update = updateClientBodySchema.safeParse({ version: 1, name: ch(0xE000), phone: null, defaultPrice: null })
    expect(Object.keys(zodFields(update.error!))).toEqual([CLIENT_FIELDS.name])
  })

  it('names and phones with a visible character still pass', () => {
    expect(clientNameSchema.parse(`e${ch(0x0301)}`)).toBe(`e${ch(0x0301)}`.normalize('NFC'))
    expect(clientNameSchema.parse('#7')).toBe('#7')
    expect(clientPhoneSchema.parse('---')).toBe('---')
    expect(clientPhoneSchema.parse('+63 917 123 4567')).toBe('+63 917 123 4567')
  })
})
