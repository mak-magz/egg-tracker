// Production API schemas (zod 4), docs/features/01-production-logging.md §3.3.
// These validate egg counts at the route boundary. The trays + loose form schema is separate
// (shared/schemas/production-form.ts, FE task F4). Relative imports so it runs outside Nuxt too.
// Unknown keys (including a smuggled tenant_id) are stripped by zod's default object behaviour.
import { z } from 'zod'
import { MAX_EGGS_PER_LINE, MAX_SIZE_LINES, PRODUCTION_FIELDS, PRODUCTION_MESSAGES } from '../constants/production'
import { compareIsoDates, isIsoDate, maxLoggableDate } from '../utils/local-date'

/** 'YYYY-MM-DD' that is a real calendar date (2026-02-30 fails). */
export const isoDateSchema = z
  .string({ error: PRODUCTION_MESSAGES.dateRequired })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: PRODUCTION_MESSAGES.dateRequired })
  // abort: zod 4 keeps running later checks after a failed one; date comparisons need a real date.
  .refine(isIsoDate, { error: PRODUCTION_MESSAGES.dateRequired, abort: true })

/** An egg count: a whole number from 0 to MAX_EGGS_PER_LINE. */
export const eggCountSchema = z
  .number({ error: PRODUCTION_MESSAGES.notWholeNumber })
  .int({ error: PRODUCTION_MESSAGES.notWholeNumber })
  .min(0, { error: PRODUCTION_MESSAGES.notWholeNumber })
  .max(MAX_EGGS_PER_LINE, { error: PRODUCTION_MESSAGES.tooLarge })

export const productionSizeAmountSchema = z.object({
  sizeId: z.uuid({ error: PRODUCTION_MESSAGES.sizesChanged }),
  eggs: eggCountSchema,
})

const productionAmountsShape = {
  good: z.array(productionSizeAmountSchema).max(MAX_SIZE_LINES, { error: PRODUCTION_MESSAGES.sizesChanged }),
  rejects: eggCountSchema,
}

/** Shared object-level rules: no duplicate size, and at least one amount above zero. Both report on `amounts`. */
function checkAmounts(v: { good: { sizeId: string, eggs: number }[], rejects: number }, ctx: z.RefinementCtx) {
  const ids = v.good.map(g => g.sizeId.toLowerCase())
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: PRODUCTION_MESSAGES.duplicateSize, path: [PRODUCTION_FIELDS.amounts] })
  }
  if (v.rejects === 0 && v.good.every(g => g.eggs === 0)) {
    ctx.addIssue({ code: 'custom', message: PRODUCTION_MESSAGES.nothingEntered, path: [PRODUCTION_FIELDS.amounts] })
  }
}

/** Body amounts. Zero lines are allowed and ignored by the server. */
export const productionAmountsSchema = z.object(productionAmountsShape).superRefine(checkAmounts)

/** The server's future-date backstop: not after UTC today + 1 (§3.8 D7). The form checks the exact local today. */
const loggableDateSchema = isoDateSchema.refine(
  d => compareIsoDates(d, maxLoggableDate(new Date())) <= 0,
  { error: PRODUCTION_MESSAGES.futureDate },
)

/** POST /api/production/entries */
export const logProductionBodySchema = z
  .object({
    ...productionAmountsShape,
    submissionId: z.uuid(),
    date: loggableDateSchema,
  })
  .superRefine(checkAmounts)

/** PUT /api/production/days/:date */
export const replaceProductionDayBodySchema = productionAmountsSchema

/** Route params for /api/production/days/:date. */
export const productionDayParamsSchema = z.object({ date: isoDateSchema })

/** An empty query value (`?from=`) means "not set". */
const optionalQueryDate = z.preprocess(v => (v === '' ? undefined : v), isoDateSchema.optional())

/** GET /api/production/days?from=&to=  Both optional (open-ended); when both are set, from <= to. */
export const productionRangeQuerySchema = z
  .object({ from: optionalQueryDate, to: optionalQueryDate })
  .refine(v => !isIsoDate(v.from) || !isIsoDate(v.to) || compareIsoDates(v.from, v.to) <= 0, {
    error: PRODUCTION_MESSAGES.endBeforeStart,
    path: [PRODUCTION_FIELDS.to],
  })

export type ProductionAmountsInput = z.infer<typeof productionAmountsSchema>
export type LogProductionBody = z.infer<typeof logProductionBodySchema>
export type ReplaceProductionDayBody = z.infer<typeof replaceProductionDayBodySchema>
export type ProductionDayParams = z.infer<typeof productionDayParamsSchema>
export type ProductionRangeQuery = z.infer<typeof productionRangeQuerySchema>
