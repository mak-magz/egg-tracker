// Sales API schemas (zod 4), docs/features/04-sales.md §3.3.
// Relative imports so it runs outside Nuxt too. Unknown keys (a smuggled tenant_id, saleNumber, id, version on a
// create, voidedAt, lineTotal) are stripped by zod's default object behaviour, so they never reach the repository.
// This is the FIRST line of defence (immediate, friendly messages); the database (§3.1) is the AUTHORITATIVE one,
// per CLAUDE.md. Messages come from SALE_MESSAGES so the form and the API say the same thing, and none of them
// echoes a client's name, phone or a typed value (AC59).
import { z } from 'zod'
import { MAX_EGGS_PER_SALE_LINE, MAX_SALE_LINES, SALE_FIELDS, SALE_MESSAGES } from '../constants/sales'
import { compareIsoDates, isIsoDate, maxLoggableDate } from '../utils/local-date'
import { checkPriceNumber } from '../utils/price'

/** 'YYYY-MM-DD' that is a real calendar date. */
const plainIsoDateSchema = z
  .string({ error: SALE_MESSAGES.saleDateRequired })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: SALE_MESSAGES.saleDateRequired })
  .refine(isIsoDate, { error: SALE_MESSAGES.saleDateRequired, abort: true })

/** The sale date: a real date, not after UTC today + 1 (AC23). The form checks the exact local today. */
const saleDateSchema = plainIsoDateSchema.refine(
  d => compareIsoDates(d, maxLoggableDate(new Date())) <= 0,
  { error: SALE_MESSAGES.saleDateFuture },
)

/** A line's price per tray (AC19): the same shape as a client's default price. */
const salePriceSchema = z
  .number({ error: SALE_MESSAGES.priceNotANumber })
  .superRefine((price, ctx) => {
    const problem = checkPriceNumber(price)
    if (problem === 'not_positive') ctx.addIssue({ code: 'custom', message: SALE_MESSAGES.priceNotPositive })
    else if (problem === 'too_large') ctx.addIssue({ code: 'custom', message: SALE_MESSAGES.priceTooLargeServer })
    else if (problem === 'too_many_decimals') ctx.addIssue({ code: 'custom', message: SALE_MESSAGES.priceTooManyDecimals })
  })

/** A line's eggs (AC20): a whole number from 1 to MAX_EGGS_PER_SALE_LINE (a sale line is never empty). */
const saleEggsSchema = z
  .number({ error: SALE_MESSAGES.quantityRequired })
  .int({ error: SALE_MESSAGES.quantityRequired })
  .min(1, { error: SALE_MESSAGES.quantityRequired })
  .max(MAX_EGGS_PER_SALE_LINE, { error: SALE_MESSAGES.quantityTooLarge })

/** One line of a request: a size, its eggs and its price per tray (no lineTotal: the server computes it). */
export const saleLineInputSchema = z.object({
  sizeId: z.uuid({ error: SALE_MESSAGES.linesSizesChanged }),
  eggs: saleEggsSchema,
  pricePerTray: salePriceSchema,
})

/** No size appears twice (AC16). Reported on `lines` itself, not a per-line field: it's a rule about the whole
 * set. No `path` here: this schema is always embedded at the `lines` key, so zod already prefixes issues with it
 * (an explicit `path: [SALE_FIELDS.lines]` would double up to `lines.lines`). */
function checkNoDuplicateSize(lines: { sizeId: string }[], ctx: z.RefinementCtx) {
  const ids = lines.map(l => l.sizeId.toLowerCase())
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: SALE_MESSAGES.linesDuplicateSize })
  }
}

/** 1 to 20 lines (AC15), no duplicate size (AC16). */
const saleLinesSchema = z
  .array(saleLineInputSchema, { error: SALE_MESSAGES.linesMinOne })
  .min(1, { error: SALE_MESSAGES.linesMinOne })
  .max(MAX_SALE_LINES, { error: SALE_MESSAGES.linesMax })
  .superRefine(checkNoDuplicateSize)

const saleTypeSchema = z.enum(['delivery', 'on_site'], { error: SALE_MESSAGES.linesSizesChanged })

/** A delivery needs a client (AC13). Checked here too, so the common case never round-trips to the database to be
 * told "Choose a client" (the database, TM032, is still the authoritative check). */
function checkClientForType(v: { type: 'delivery' | 'on_site', clientId?: string | null }, ctx: z.RefinementCtx) {
  if (v.type === 'delivery' && !v.clientId) {
    ctx.addIssue({ code: 'custom', message: SALE_MESSAGES.clientRequired, path: [SALE_FIELDS.clientId] })
  }
}

/** POST /api/sales */
export const createSaleBodySchema = z
  .object({
    submissionId: z.uuid(),
    type: saleTypeSchema,
    saleDate: saleDateSchema,
    clientId: z.uuid({ error: SALE_MESSAGES.clientInvalid }).nullish(),
    lines: saleLinesSchema,
    confirmShortfall: z.boolean().optional(),
  })
  .superRefine(checkClientForType)

/** PUT /api/sales/:id. Replaces the WHOLE sale: header + every line, always (AC40, AC64-66). */
export const updateSaleBodySchema = z
  .object({
    version: z
      .number({ error: SALE_MESSAGES.saleChanged })
      .int({ error: SALE_MESSAGES.saleChanged })
      .min(1, { error: SALE_MESSAGES.saleChanged })
      .max(Number.MAX_SAFE_INTEGER, { error: SALE_MESSAGES.saleChanged }),
    type: saleTypeSchema,
    saleDate: saleDateSchema,
    clientId: z.uuid({ error: SALE_MESSAGES.clientInvalid }).nullish(),
    lines: saleLinesSchema,
    confirmShortfall: z.boolean().optional(),
  })
  .superRefine(checkClientForType)

/** POST /api/sales/:id/void */
export const voidSaleBodySchema = z.object({
  version: z
    .number({ error: SALE_MESSAGES.saleChanged })
    .int({ error: SALE_MESSAGES.saleChanged })
    .min(1, { error: SALE_MESSAGES.saleChanged })
    .max(Number.MAX_SAFE_INTEGER, { error: SALE_MESSAGES.saleChanged }),
})

/** Route params for /api/sales/:id, /:id/void. */
export const saleIdParamsSchema = z.object({ id: z.uuid({ error: SALE_MESSAGES.saleChanged }) })

/** An empty query value (`?from=`) means "not set". No future-date refusal here (AC7: sale dates are never in the future anyway). */
const optionalQueryDate = z.preprocess(v => (v === '' ? undefined : v), plainIsoDateSchema.optional())

/** A query boolean ("true"/"false" strings from the URL), defaulting to false. */
function queryBoolean(defaultValue: boolean) {
  return z.preprocess(v => (v === undefined || v === '' ? undefined : v === true || v === 'true'), z.boolean().optional().default(defaultValue))
}

/** GET /api/sales?from&to&type&clientId&limit&offset&includeVoided (all optional). */
export const salesListQuerySchema = z
  .object({
    from: optionalQueryDate,
    to: optionalQueryDate,
    type: z.enum(['delivery', 'on_site']).optional(),
    clientId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    offset: z.coerce.number().int().min(0).optional().default(0),
    includeVoided: queryBoolean(false),
  })
  .refine(v => !isIsoDate(v.from) || !isIsoDate(v.to) || compareIsoDates(v.from, v.to) <= 0, {
    error: SALE_MESSAGES.endBeforeStart,
    path: ['to'],
  })

/** GET /api/sales/on-hand?sizeId=...&sizeId=... (repeated) -- omit to get every size of the farm. */
export const onHandQuerySchema = z.object({
  sizeId: z.preprocess(v => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(z.uuid())).optional().default([]),
})

export type SaleLineInputBody = z.infer<typeof saleLineInputSchema>
export type CreateSaleBody = z.infer<typeof createSaleBodySchema>
export type UpdateSaleBody = z.infer<typeof updateSaleBodySchema>
export type VoidSaleBody = z.infer<typeof voidSaleBodySchema>
export type SaleIdParams = z.infer<typeof saleIdParamsSchema>
export type SalesListQuery = z.infer<typeof salesListQuerySchema>
export type OnHandQuery = z.infer<typeof onHandQuerySchema>
