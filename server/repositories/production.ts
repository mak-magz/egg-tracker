// Production repository (docs/features/01-production-logging.md §3.3 "Repository and utils").
// Every call goes through TenantDb.rpc, which sets p_tenant_id from the server context (never from input).
// Each write is one security invoker Postgres function = one transaction (AC13, AC26).
import type { PostgrestError } from '@supabase/supabase-js'
import type { H3Error } from 'h3'
import { z } from 'zod'
import { PRODUCTION_FIELDS, PRODUCTION_MESSAGES } from '../../shared/constants/production'
import type {
  ApiErrorData,
  IsoDate,
  LogProductionRequest,
  LogProductionResponse,
  ProductionAmounts,
  ProductionDay,
  ProductionDaysResponse,
} from '../../shared/types/api'
import type { TenantDb } from '../utils/db'
import { apiError } from '../utils/errors'

// The jsonb the functions return (generated type is `Json`), parsed into the contract types.
const dayJsonSchema = z.object({
  date: z.string(),
  good: z.array(z.object({ sizeId: z.string(), eggs: z.number() })),
  goodTotal: z.number(),
  rejects: z.number(),
})
const daysJsonSchema = z.object({ hasAny: z.boolean(), days: z.array(dayJsonSchema) })
const logJsonSchema = z.object({ day: dayJsonSchema, hadBefore: z.boolean(), replayed: z.boolean() })
const replaceJsonSchema = z.object({ day: dayJsonSchema })
const deleteJsonSchema = z.object({ removed: dayJsonSchema })

/** Maps the functions' SQLSTATEs (§3.1 M6 table) to API errors. Unknown errors become a logged 500. */
export function mapProductionDbError(error: Pick<PostgrestError, 'code' | 'message'>): H3Error<ApiErrorData> {
  switch (error.code) {
    case 'TM001':
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.sizes]: PRODUCTION_MESSAGES.sizesChanged })
    case 'TM002':
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.date]: PRODUCTION_MESSAGES.futureDate })
    case 'TM003':
      return apiError(404, 'not_found')
    case 'TM004':
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.amounts]: PRODUCTION_MESSAGES.nothingEntered })
    case 'TM005':
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.amounts]: PRODUCTION_MESSAGES.invalidAmounts })
    case 'TM007': // a line (or a day's line after an add) over MAX_EGGS_PER_LINE (production_bounds trigger)
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.amounts]: PRODUCTION_MESSAGES.tooLarge })
    case '23503': // composite size FK: a size not of this farm (backstop behind TM001)
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.sizes]: PRODUCTION_MESSAGES.sizesChanged })
    case '23514': // check constraint backstop
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.amounts]: PRODUCTION_MESSAGES.invalidAmounts })
    case '22003': // integer overflow (unreachable since the 1,000,000 cap; kept as a backstop)
      return apiError(400, 'validation_failed', { [PRODUCTION_FIELDS.amounts]: PRODUCTION_MESSAGES.tooLarge })
    case 'TM006': // p_tenant_id disagrees with the session: only a server bug can cause this
    default:
      console.error('[production] database error', error.code, error.message)
      return apiError(500, 'internal')
  }
}

function parseResult<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    console.error('[production] unexpected function result', parsed.error.issues)
    throw apiError(500, 'internal')
  }
  return parsed.data
}

/** Splits `good` into the parallel arrays the functions take. Zero lines are sent and ignored by the DB. */
function toArrays(amounts: ProductionAmounts) {
  return {
    p_size_ids: amounts.good.map(g => g.sizeId),
    p_eggs: amounts.good.map(g => g.eggs),
    p_rejects: amounts.rejects,
  }
}

export async function listProductionDays(db: TenantDb, range: { from?: IsoDate, to?: IsoDate }): Promise<ProductionDaysResponse> {
  const { data, error } = await db.rpc('production_days', { p_from: range.from, p_to: range.to })
  if (error) throw mapProductionDbError(error)
  return parseResult(daysJsonSchema, data)
}

/** One day's totals, or null when the date has no production (not a 404: the AC8 note looks up any date). */
export async function getProductionDay(db: TenantDb, date: IsoDate): Promise<ProductionDay | null> {
  const { days } = await listProductionDays(db, { from: date, to: date })
  return days[0] ?? null
}

/** Adds to the day. Idempotent per submissionId (a replay adds nothing). */
export async function logProduction(db: TenantDb, input: LogProductionRequest): Promise<LogProductionResponse> {
  const { data, error } = await db.rpc('log_production', {
    p_submission_id: input.submissionId,
    p_day: input.date,
    ...toArrays(input),
  })
  if (error) throw mapProductionDbError(error)
  const result = parseResult(logJsonSchema, data)
  return { day: result.day, hadProductionBefore: result.hadBefore, replayed: result.replayed }
}

/** Edit day: replaces the day's amounts. 404 when the day has no production. */
export async function replaceProductionDay(db: TenantDb, date: IsoDate, amounts: ProductionAmounts): Promise<ProductionDay> {
  const { data, error } = await db.rpc('replace_production_day', { p_day: date, ...toArrays(amounts) })
  if (error) throw mapProductionDbError(error)
  return parseResult(replaceJsonSchema, data).day
}

/** Deletes the day and returns what was removed. 404 when the day has no production. */
export async function deleteProductionDay(db: TenantDb, date: IsoDate): Promise<ProductionDay> {
  const { data, error } = await db.rpc('delete_production_day', { p_day: date })
  if (error) throw mapProductionDbError(error)
  return parseResult(deleteJsonSchema, data).removed
}
