// Orders API schemas (zod 4), docs/features/05-orders.md §3.4.
// Relative imports so it runs outside Nuxt too. Unknown keys (a smuggled tenant_id, orderNumber, id, status,
// version on a create, cancelledAt, lineTotal) are stripped by zod's default object behaviour, so they never reach
// the repository. This is the FIRST line of defence (immediate, friendly messages); the database (§3.1, AC50) is the
// AUTHORITATIVE one. Messages come from ORDER_MESSAGES so the form and the API say the same thing, and none of them
// echoes a client's name, a price, a quantity or a typed value (AC54).
import { z } from 'zod'
import { MAX_EGGS_PER_ORDER_LINE, MAX_ORDER_LINES, ORDER_FIELDS, ORDER_MANUAL_STATUSES, ORDER_MESSAGES, ORDERS_VIEWS } from '../constants/orders'
import { compareIsoDates, isIsoDate, maxLoggableDate } from '../utils/local-date'
import { checkPriceNumber } from '../utils/price'

/** 'YYYY-MM-DD' that is a real calendar date. */
const plainIsoDateSchema = z
  .string({ error: ORDER_MESSAGES.orderDateRequired })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: ORDER_MESSAGES.orderDateRequired })
  .refine(isIsoDate, { error: ORDER_MESSAGES.orderDateRequired, abort: true })

/** The order date: a real date, not after UTC today + 1 (AC15). The form checks the exact local today. */
const orderDateSchema = plainIsoDateSchema.refine(
  d => compareIsoDates(d, maxLoggableDate(new Date())) <= 0,
  { error: ORDER_MESSAGES.orderDateFuture },
)

/** The delivered date: same ceiling (AC24). "Before the order date" is checked by the database (TM055 delivered_date). */
const deliveredDateSchema = plainIsoDateSchema.refine(
  d => compareIsoDates(d, maxLoggableDate(new Date())) <= 0,
  { error: ORDER_MESSAGES.deliveredDateFuture },
)

/** Wanted-by may be in the future (AC15); it is only compared with the order date, below. */
const wantedByDateSchema = plainIsoDateSchema

/** A line's price per tray (AC12): feature 04's rules. */
const orderPriceSchema = z
  .number({ error: ORDER_MESSAGES.priceNotANumber })
  .superRefine((price, ctx) => {
    const problem = checkPriceNumber(price)
    if (problem === 'not_positive') ctx.addIssue({ code: 'custom', message: ORDER_MESSAGES.priceNotPositive })
    else if (problem === 'too_large') ctx.addIssue({ code: 'custom', message: ORDER_MESSAGES.priceTooLargeServer })
    else if (problem === 'too_many_decimals') ctx.addIssue({ code: 'custom', message: ORDER_MESSAGES.priceTooManyDecimals })
  })

/** Eggs on an order or delivery line (AC12, AC25): a whole number from 1 to MAX_EGGS_PER_ORDER_LINE. */
const orderEggsSchema = z
  .number({ error: ORDER_MESSAGES.quantityRequired })
  .int({ error: ORDER_MESSAGES.quantityRequired })
  .min(1, { error: ORDER_MESSAGES.quantityRequired })
  .max(MAX_EGGS_PER_ORDER_LINE, { error: ORDER_MESSAGES.quantityTooLarge })

/** One line of an order request: a size, its eggs and its price per tray (no lineTotal: the server computes it). */
export const orderLineInputSchema = z.object({
  sizeId: z.uuid({ error: ORDER_MESSAGES.linesSizesChanged }),
  eggs: orderEggsSchema,
  pricePerTray: orderPriceSchema,
})

/** One line of a delivery request: a size and the eggs going out now (a line with 0 is simply left out, AC25). */
export const deliverLineInputSchema = z.object({
  sizeId: z.uuid({ error: ORDER_MESSAGES.linesSizesChanged }),
  eggs: orderEggsSchema,
})

/** No size appears twice (AC12). Reported on `lines` itself. No `path`: the schema is always embedded at the
 * `lines` key, so zod already prefixes issues with it (an explicit path would double up to `lines.lines`). */
function checkNoDuplicateSize(lines: { sizeId: string }[], ctx: z.RefinementCtx) {
  const ids = lines.map(l => l.sizeId.toLowerCase())
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: ORDER_MESSAGES.linesDuplicateSize })
  }
}

/** 1 to 20 lines (AC12), no duplicate size. */
const orderLinesSchema = z
  .array(orderLineInputSchema, { error: ORDER_MESSAGES.linesMinOne })
  .min(1, { error: ORDER_MESSAGES.linesMinOne })
  .max(MAX_ORDER_LINES, { error: ORDER_MESSAGES.linesMax })
  .superRefine(checkNoDuplicateSize)

/** At least one line to deliver (AC25), at most as many as an order can have, no size twice. */
const deliverLinesSchema = z
  .array(deliverLineInputSchema, { error: ORDER_MESSAGES.deliverNone })
  .min(1, { error: ORDER_MESSAGES.deliverNone })
  .max(MAX_ORDER_LINES, { error: ORDER_MESSAGES.linesMax })
  .superRefine(checkNoDuplicateSize)

/** Wanted-by is never before the order date (AC15). Equal is fine. Needs both dates to be real, so it only runs
 * when both parsed (an earlier issue on either date wins and skips this check). */
function checkWantedBy(v: { orderDate: string, wantedBy?: string | null }, ctx: z.RefinementCtx) {
  if (v.wantedBy && isIsoDate(v.wantedBy) && isIsoDate(v.orderDate) && compareIsoDates(v.wantedBy, v.orderDate) < 0) {
    ctx.addIssue({ code: 'custom', message: ORDER_MESSAGES.wantedByBeforeOrder, path: [ORDER_FIELDS.wantedBy] })
  }
}

const versionSchema = z
  .number({ error: ORDER_MESSAGES.orderChanged })
  .int({ error: ORDER_MESSAGES.orderChanged })
  .min(1, { error: ORDER_MESSAGES.orderChanged })
  .max(Number.MAX_SAFE_INTEGER, { error: ORDER_MESSAGES.orderChanged })

/** POST /api/orders */
export const createOrderBodySchema = z
  .object({
    submissionId: z.uuid(),
    clientId: z.uuid({ error: ORDER_MESSAGES.clientRequired }),
    orderDate: orderDateSchema,
    wantedBy: wantedByDateSchema.nullish(),
    lines: orderLinesSchema,
  })
  .superRefine(checkWantedBy)

/** PUT /api/orders/:id. Replaces the WHOLE order: header + every line, always (AC19). */
export const updateOrderBodySchema = z
  .object({
    version: versionSchema,
    clientId: z.uuid({ error: ORDER_MESSAGES.clientRequired }),
    orderDate: orderDateSchema,
    wantedBy: wantedByDateSchema.nullish(),
    lines: orderLinesSchema,
  })
  .superRefine(checkWantedBy)

/** POST /api/orders/:id/status (AC21): only the three hand-set statuses. */
export const setOrderStatusBodySchema = z.object({
  status: z.enum(ORDER_MANUAL_STATUSES, { error: ORDER_MESSAGES.statusInvalid }),
})

/** POST /api/orders/:id/close (AC34): the version the confirm dialog was built from. */
export const closeOrderBodySchema = z.object({ version: versionSchema })

/** POST /api/orders/:id/deliver (AC24 to AC31). */
export const deliverOrderBodySchema = z.object({
  submissionId: z.uuid(),
  deliveredDate: deliveredDateSchema,
  lines: deliverLinesSchema,
  confirmShortfall: z.boolean().optional(),
})

/** Route params for /api/orders/:id and its sub-routes. A malformed id is the same answer as an unknown one. */
export const orderIdParamsSchema = z.object({ id: z.uuid({ error: ORDER_MESSAGES.orderChanged }) })

/** An empty query value (`?from=`) means "not set". */
const optionalQueryDate = z.preprocess(v => (v === '' ? undefined : v), plainIsoDateSchema.optional())

/** GET /api/orders?view&clientId&from&to&limit&offset (all optional; view defaults to open). */
export const ordersQuerySchema = z
  .object({
    view: z.preprocess(v => (v === '' ? undefined : v), z.enum(ORDERS_VIEWS, { error: ORDER_MESSAGES.filtersInvalid }).optional().default('open')),
    clientId: z.preprocess(v => (v === '' ? undefined : v), z.uuid({ error: ORDER_MESSAGES.filtersInvalid }).optional()),
    from: optionalQueryDate,
    to: optionalQueryDate,
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    offset: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  })
  .refine(v => !isIsoDate(v.from) || !isIsoDate(v.to) || compareIsoDates(v.from, v.to) <= 0, {
    error: ORDER_MESSAGES.endBeforeStart,
    path: ['to'],
  })

export type OrderLineInputBody = z.infer<typeof orderLineInputSchema>
export type DeliverLineInputBody = z.infer<typeof deliverLineInputSchema>
export type CreateOrderBody = z.infer<typeof createOrderBodySchema>
export type UpdateOrderBody = z.infer<typeof updateOrderBodySchema>
export type SetOrderStatusBody = z.infer<typeof setOrderStatusBodySchema>
export type CloseOrderBody = z.infer<typeof closeOrderBodySchema>
export type DeliverOrderBody = z.infer<typeof deliverOrderBodySchema>
export type OrderIdParams = z.infer<typeof orderIdParamsSchema>
export type OrdersQuery = z.infer<typeof ordersQuerySchema>
