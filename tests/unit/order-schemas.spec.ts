import { describe, expect, it } from 'vitest'
import { ORDER_MESSAGES } from '../../shared/constants/orders'
import {
  closeOrderBodySchema,
  createOrderBodySchema,
  deliverOrderBodySchema,
  orderIdParamsSchema,
  ordersQuerySchema,
  setOrderStatusBodySchema,
  updateOrderBodySchema,
} from '../../shared/schemas/orders'
import { addDays, todayUtc } from '../../shared/utils/local-date'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const today = todayUtc()
const line = (n: number, over: Record<string, unknown> = {}) => ({ sizeId: uuid(n), eggs: 30, pricePerTray: 6.5, ...over })
const create = (over: Record<string, unknown> = {}) => ({
  submissionId: uuid(900),
  clientId: uuid(800),
  orderDate: today,
  lines: [line(1)],
  ...over,
})

function messages(result: { success: boolean, error?: { issues: { message: string, path: PropertyKey[] }[] } }): string[] {
  return result.error?.issues.map(i => i.message) ?? []
}
function paths(result: { error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return result.error?.issues.map(i => i.path.join('.')) ?? []
}

describe('createOrderBodySchema', () => {
  it('accepts a minimal order and a full one', () => {
    expect(createOrderBodySchema.safeParse(create()).success).toBe(true)
    expect(createOrderBodySchema.safeParse(create({ wantedBy: addDays(today, 5), lines: [line(1), line(2, { eggs: 100_000, pricePerTray: 9999.99 })] })).success).toBe(true)
    expect(createOrderBodySchema.safeParse(create({ wantedBy: null })).success).toBe(true)
  })

  it('requires a client (AC11)', () => {
    const r = createOrderBodySchema.safeParse(create({ clientId: undefined }))
    expect(r.success).toBe(false)
    expect(messages(r)).toContain(ORDER_MESSAGES.clientRequired)
    expect(createOrderBodySchema.safeParse(create({ clientId: null })).success).toBe(false)
  })

  it('needs 1 to 20 lines (AC12)', () => {
    const none = createOrderBodySchema.safeParse(create({ lines: [] }))
    expect(messages(none)).toContain(ORDER_MESSAGES.linesMinOne)
    const twenty = Array.from({ length: 20 }, (_, i) => line(i + 1))
    expect(createOrderBodySchema.safeParse(create({ lines: twenty })).success).toBe(true)
    const tooMany = createOrderBodySchema.safeParse(create({ lines: [...twenty, line(21)] }))
    expect(messages(tooMany)).toContain(ORDER_MESSAGES.linesMax)
  })

  it('refuses the same size twice, on lines (AC12)', () => {
    const r = createOrderBodySchema.safeParse(create({ lines: [line(1), line(1, { eggs: 5 })] }))
    expect(r.success).toBe(false)
    expect(messages(r)).toContain(ORDER_MESSAGES.linesDuplicateSize)
    expect(paths(r)).toContain('lines')
  })

  it('bounds the eggs of a line: whole, 1 to 100,000', () => {
    expect(createOrderBodySchema.safeParse(create({ lines: [line(1, { eggs: 1 })] })).success).toBe(true)
    for (const eggs of [0, -1, 1.5, '30', null]) {
      const r = createOrderBodySchema.safeParse(create({ lines: [line(1, { eggs })] }))
      expect(r.success).toBe(false)
      expect(messages(r)).toContain(ORDER_MESSAGES.quantityRequired)
    }
    const big = createOrderBodySchema.safeParse(create({ lines: [line(1, { eggs: 100_001 })] }))
    expect(messages(big)).toContain(ORDER_MESSAGES.quantityTooLarge)
    expect(paths(big)).toContain('lines.0.eggs')
  })

  it('bounds the price of a line: above 0, 2 decimals, up to 9,999.99', () => {
    const price = (pricePerTray: unknown) => createOrderBodySchema.safeParse(create({ lines: [line(1, { pricePerTray })] }))
    expect(price(0.01).success).toBe(true)
    expect(price(9999.99).success).toBe(true)
    expect(messages(price(0))).toContain(ORDER_MESSAGES.priceNotPositive)
    expect(messages(price(-1))).toContain(ORDER_MESSAGES.priceNotPositive)
    expect(messages(price(10_000))).toContain(ORDER_MESSAGES.priceTooLargeServer)
    expect(messages(price(6.505))).toContain(ORDER_MESSAGES.priceTooManyDecimals)
    expect(messages(price('6.50'))).toContain(ORDER_MESSAGES.priceNotANumber)
    expect(messages(price(undefined))).toContain(ORDER_MESSAGES.priceNotANumber)
  })

  it('takes a past order date, today, and refuses the future (AC15)', () => {
    expect(createOrderBodySchema.safeParse(create({ orderDate: addDays(today, -30) })).success).toBe(true)
    const future = createOrderBodySchema.safeParse(create({ orderDate: addDays(today, 3) }))
    expect(future.success).toBe(false)
    expect(messages(future)).toContain(ORDER_MESSAGES.orderDateFuture)
  })

  it('refuses a date that is not a real date', () => {
    for (const orderDate of ['2026-02-30', '10/03/2026', '', 'today', 20261003]) {
      const r = createOrderBodySchema.safeParse(create({ orderDate }))
      expect(r.success).toBe(false)
      expect(messages(r)).toContain(ORDER_MESSAGES.orderDateRequired)
    }
  })

  it('allows wanted-by on the order date or later, even in the future; refuses earlier (AC15)', () => {
    expect(createOrderBodySchema.safeParse(create({ wantedBy: today })).success).toBe(true)
    expect(createOrderBodySchema.safeParse(create({ wantedBy: addDays(today, 90) })).success).toBe(true)
    const early = createOrderBodySchema.safeParse(create({ orderDate: addDays(today, -2), wantedBy: addDays(today, -3) }))
    expect(early.success).toBe(false)
    expect(messages(early)).toContain(ORDER_MESSAGES.wantedByBeforeOrder)
    expect(paths(early)).toContain('wantedBy')
  })

  it('needs a real submission id and size ids', () => {
    expect(createOrderBodySchema.safeParse(create({ submissionId: 'nope' })).success).toBe(false)
    const r = createOrderBodySchema.safeParse(create({ lines: [line(1, { sizeId: 'large' })] }))
    expect(messages(r)).toContain(ORDER_MESSAGES.linesSizesChanged)
  })

  it('strips keys it does not know: tenantId, orderNumber, status, id, version, lineTotal, cancelledAt', () => {
    const r = createOrderBodySchema.safeParse(create({
      tenantId: uuid(1),
      tenant_id: uuid(2),
      orderNumber: 99,
      status: 'fulfilled',
      id: uuid(3),
      version: 7,
      cancelledAt: '2026-10-03',
      lines: [line(1, { lineTotal: 1, droppedEggs: 5 })],
    }))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual(['clientId', 'lines', 'orderDate', 'submissionId'])
      expect(Object.keys(r.data.lines[0]!).sort()).toEqual(['eggs', 'pricePerTray', 'sizeId'])
    }
  })

  it('never puts a typed value in a message (AC54)', () => {
    const r = createOrderBodySchema.safeParse(create({ lines: [line(1, { eggs: 123456, pricePerTray: 6.123 })] }))
    for (const m of messages(r)) {
      expect(m).not.toContain('123456')
      expect(m).not.toContain('6.123')
    }
  })
})

describe('updateOrderBodySchema', () => {
  const update = (over: Record<string, unknown> = {}) => ({
    version: 3,
    clientId: uuid(800),
    orderDate: today,
    lines: [line(1)],
    ...over,
  })

  it('accepts a whole order with its version', () => {
    expect(updateOrderBodySchema.safeParse(update()).success).toBe(true)
    expect(updateOrderBodySchema.safeParse(update({ wantedBy: addDays(today, 1) })).success).toBe(true)
  })

  it('needs a whole version of at least 1', () => {
    for (const version of [0, -1, 1.5, '3', undefined, null, Number.MAX_SAFE_INTEGER + 1]) {
      const r = updateOrderBodySchema.safeParse(update({ version }))
      expect(r.success).toBe(false)
      expect(messages(r)).toContain(ORDER_MESSAGES.orderChanged)
    }
  })

  it('applies the same line, date and wanted-by rules as create', () => {
    expect(updateOrderBodySchema.safeParse(update({ lines: [] })).success).toBe(false)
    expect(updateOrderBodySchema.safeParse(update({ lines: [line(1), line(1)] })).success).toBe(false)
    expect(updateOrderBodySchema.safeParse(update({ orderDate: addDays(today, 5) })).success).toBe(false)
    expect(updateOrderBodySchema.safeParse(update({ orderDate: today, wantedBy: addDays(today, -1) })).success).toBe(false)
    expect(updateOrderBodySchema.safeParse(update({ clientId: null })).success).toBe(false)
  })

  it('strips submissionId, status and orderNumber', () => {
    const r = updateOrderBodySchema.safeParse(update({ submissionId: uuid(9), status: 'ready', orderNumber: 4 }))
    expect(r.success).toBe(true)
    if (r.success) expect(Object.keys(r.data).sort()).toEqual(['clientId', 'lines', 'orderDate', 'version'])
  })
})

describe('setOrderStatusBodySchema (AC21)', () => {
  it('takes only the three hand-set statuses', () => {
    for (const status of ['requested', 'confirmed', 'ready']) {
      expect(setOrderStatusBodySchema.safeParse({ status }).success).toBe(true)
    }
    for (const status of ['partially_fulfilled', 'fulfilled', 'cancelled', 'Ready', '', undefined, 1]) {
      const r = setOrderStatusBodySchema.safeParse({ status })
      expect(r.success).toBe(false)
      expect(messages(r)).toContain(ORDER_MESSAGES.statusInvalid)
    }
  })
})

describe('closeOrderBodySchema (AC34)', () => {
  it('needs the version the dialog was built from', () => {
    expect(closeOrderBodySchema.safeParse({ version: 4 }).success).toBe(true)
    expect(closeOrderBodySchema.safeParse({}).success).toBe(false)
    expect(closeOrderBodySchema.safeParse({ version: 0 }).success).toBe(false)
  })
})

describe('deliverOrderBodySchema (AC24 to AC27)', () => {
  const deliver = (over: Record<string, unknown> = {}) => ({
    submissionId: uuid(900),
    deliveredDate: today,
    lines: [{ sizeId: uuid(1), eggs: 120 }],
    ...over,
  })

  it('accepts one or more lines and the shortfall confirmation', () => {
    expect(deliverOrderBodySchema.safeParse(deliver()).success).toBe(true)
    expect(deliverOrderBodySchema.safeParse(deliver({ confirmShortfall: true, lines: [{ sizeId: uuid(1), eggs: 1 }, { sizeId: uuid(2), eggs: 100_000 }] })).success).toBe(true)
  })

  it('needs at least one line with at least 1 egg (AC25)', () => {
    const none = deliverOrderBodySchema.safeParse(deliver({ lines: [] }))
    expect(messages(none)).toContain(ORDER_MESSAGES.deliverNone)
    const zero = deliverOrderBodySchema.safeParse(deliver({ lines: [{ sizeId: uuid(1), eggs: 0 }] }))
    expect(zero.success).toBe(false)
    expect(messages(zero)).toContain(ORDER_MESSAGES.quantityRequired)
    expect(deliverOrderBodySchema.safeParse(deliver({ lines: undefined })).success).toBe(false)
  })

  it('refuses a size twice and more than 20 lines', () => {
    const dup = deliverOrderBodySchema.safeParse(deliver({ lines: [{ sizeId: uuid(1), eggs: 5 }, { sizeId: uuid(1), eggs: 5 }] }))
    expect(messages(dup)).toContain(ORDER_MESSAGES.linesDuplicateSize)
    const many = Array.from({ length: 21 }, (_, i) => ({ sizeId: uuid(i + 1), eggs: 1 }))
    expect(messages(deliverOrderBodySchema.safeParse(deliver({ lines: many })))).toContain(ORDER_MESSAGES.linesMax)
  })

  it('takes today or a past delivered date, refuses the future (AC24)', () => {
    expect(deliverOrderBodySchema.safeParse(deliver({ deliveredDate: addDays(today, -4) })).success).toBe(true)
    const future = deliverOrderBodySchema.safeParse(deliver({ deliveredDate: addDays(today, 3) }))
    expect(messages(future)).toContain(ORDER_MESSAGES.deliveredDateFuture)
    expect(deliverOrderBodySchema.safeParse(deliver({ deliveredDate: 'soon' })).success).toBe(false)
  })

  it('strips a price, a client, a tenant or an order id from the body (the order\'s price and client are used)', () => {
    const r = deliverOrderBodySchema.safeParse(deliver({
      clientId: uuid(5),
      orderId: uuid(6),
      tenantId: uuid(7),
      lines: [{ sizeId: uuid(1), eggs: 10, pricePerTray: 1 }],
    }))
    expect(r.success).toBe(true)
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual(['deliveredDate', 'lines', 'submissionId'])
      expect(Object.keys(r.data.lines[0]!).sort()).toEqual(['eggs', 'sizeId'])
    }
  })
})

describe('orderIdParamsSchema', () => {
  it('needs a uuid', () => {
    expect(orderIdParamsSchema.safeParse({ id: uuid(1) }).success).toBe(true)
    expect(orderIdParamsSchema.safeParse({ id: '12' }).success).toBe(false)
  })
})

describe('ordersQuerySchema (AC3 to AC5)', () => {
  it('defaults to the Open view, 25, offset 0', () => {
    const r = ordersQuerySchema.parse({})
    expect(r.view).toBe('open')
    expect(r.limit).toBe(25)
    expect(r.offset).toBe(0)
    expect(r.clientId).toBeUndefined()
  })

  it('takes every view and refuses others', () => {
    for (const view of ['open', 'all', 'fulfilled', 'cancelled']) {
      expect(ordersQuerySchema.parse({ view }).view).toBe(view)
    }
    expect(ordersQuerySchema.parse({ view: '' }).view).toBe('open')
    expect(ordersQuerySchema.safeParse({ view: 'partially_fulfilled' }).success).toBe(false)
    expect(ordersQuerySchema.safeParse({ view: 'pending' }).success).toBe(false)
  })

  it('reads filters from query strings: empty means not set, numbers are coerced', () => {
    const r = ordersQuerySchema.parse({ view: 'all', clientId: uuid(1), from: '2026-10-01', to: '2026-10-03', limit: '50', offset: '25' })
    expect(r).toMatchObject({ view: 'all', clientId: uuid(1), from: '2026-10-01', to: '2026-10-03', limit: 50, offset: 25 })
    const blank = ordersQuerySchema.parse({ clientId: '', from: '', to: '' })
    expect(blank.clientId).toBeUndefined()
    expect(blank.from).toBeUndefined()
    expect(blank.to).toBeUndefined()
  })

  it('includes both end dates and refuses an end before the start (AC4)', () => {
    expect(ordersQuerySchema.safeParse({ from: '2026-10-03', to: '2026-10-03' }).success).toBe(true)
    const r = ordersQuerySchema.safeParse({ from: '2026-10-04', to: '2026-10-03' })
    expect(r.success).toBe(false)
    expect(messages(r)).toContain(ORDER_MESSAGES.endBeforeStart)
    expect(paths(r)).toContain('to')
  })

  it('bounds paging and ids', () => {
    expect(ordersQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(ordersQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    expect(ordersQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
    expect(ordersQuerySchema.safeParse({ clientId: 'maple' }).success).toBe(false)
    expect(ordersQuerySchema.safeParse({ from: '2026-02-30' }).success).toBe(false)
  })
})
