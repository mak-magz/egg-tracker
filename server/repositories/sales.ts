// Sales repository (docs/features/04-sales.md §3.3 "Repository", reworked by docs/features/05-orders.md §3.3.4: no
// pending, no mark-delivered, no delete -- a sale is edited or voided). Every write is ONE security invoker Postgres
// function called through TenantDb.rpc, which sets p_tenant_id from the server context (never from input). Each
// function returns { sale: <jsonb> }, already the whole shape the API
// needs -- unlike clients/production, there is no separate re-read step, because app.sale_json is built into every
// function's return value.
//
// PERSONAL DATA: a sale carries `clientId`, never a client's name (CLAUDE.md, AC59). This file therefore has less
// exposure than clients.ts, but keeps the same discipline: never log a raw error object, `message`, `details` or
// `hint` -- `internalError` logs only `[sales] <scope> <SQLSTATE>`. TM037's `detail` (the shortfall) and TM036's
// re-read (`sale`) carry only ids, sizes and egg counts, never a client's name or phone.
import type { PostgrestError } from '@supabase/supabase-js'
import type { H3Error } from 'h3'
import { z } from 'zod'
import { SALE_FIELDS, SALE_MESSAGES } from '../../shared/constants/sales'
import type {
  ApiErrorData,
  CreateSaleResponse,
  OnHandResponse,
  Sale,
  SaleChangeResponse,
  SaleLineInput,
  SalesListResponse,
  VoidSaleResponse,
} from '../../shared/types/api'
import type { TenantDb, TenantRpcArgs } from '../utils/db'
import { apiError } from '../utils/errors'
import { orderDetailJsonSchema, toOrderDetail } from './order-json'

/** Which function raised, so an error shared by several (TM002, TM005) lands on the right field. */
export type SaleOperation = 'create' | 'update' | 'void' | 'get' | 'list' | 'onHand'

const saleLineJsonSchema = z.object({
  sizeId: z.string(),
  eggs: z.number(),
  pricePerTray: z.number(),
  lineTotal: z.number(),
})

export const saleJsonSchema = z.object({
  id: z.string(),
  saleNumber: z.number(),
  type: z.enum(['delivery', 'on_site']),
  clientId: z.string().nullable(),
  saleDate: z.string(),
  orderId: z.string().nullable(),
  orderNumber: z.number().nullable(),
  version: z.number(),
  voidedAt: z.string().nullable(),
  lines: z.array(saleLineJsonSchema),
  saleTotal: z.number(),
})

const createResultSchema = z.object({ sale: saleJsonSchema, replayed: z.boolean() })
const changeResultSchema = z.object({ sale: saleJsonSchema, changed: z.boolean() })
const voidResultSchema = z.object({ sale: saleJsonSchema, changed: z.boolean(), order: orderDetailJsonSchema.nullable() })
const getResultSchema = z.object({ sale: saleJsonSchema.nullable() })
const listResultSchema = z.object({ hasAny: z.boolean(), total: z.number(), sales: z.array(saleJsonSchema) })
const onHandLineSchema = z.object({ sizeId: z.string(), eggs: z.number() })
const onHandResultSchema = z.object({ onHand: z.array(onHandLineSchema) })
const shortfallLineSchema = z.object({ sizeId: z.string(), onHandEggs: z.number(), neededEggs: z.number() })
const shortfallDetailSchema = z.object({ shortfall: z.array(shortfallLineSchema) })

/** The error type mapSaleDbError reads: only `code` (and `hint` / `details` for the field choice and the shortfall). */
export type SaleDbError = Pick<PostgrestError, 'code'> & { message?: string, details?: string | null, hint?: string | null }

/** Logs the SQLSTATE and the place, never the error object, and returns a bare 500. */
function internalError(scope: string, code?: string | null): H3Error<ApiErrorData> {
  console.error(`[sales] ${scope} ${typeof code === 'string' ? code : 'unknown'}`)
  return apiError(500, 'internal')
}

function parseResult<T>(scope: string, schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw internalError(`unexpected ${scope} result`)
  return parsed.data
}

/** The ONE mapper: a database jsonb row (already camelCase, already the API shape) to `Sale`. */
export function toSale(row: z.infer<typeof saleJsonSchema>): Sale {
  return {
    id: row.id,
    saleNumber: row.saleNumber,
    type: row.type,
    clientId: row.clientId,
    saleDate: row.saleDate,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    lines: row.lines.map(l => ({ sizeId: l.sizeId, eggs: l.eggs, pricePerTray: l.pricePerTray, lineTotal: l.lineTotal })),
    saleTotal: row.saleTotal,
    version: row.version,
    voidedAt: row.voidedAt,
  }
}

/** The current sale, or undefined when the id is missing/foreign, or the read itself fails. */
async function currentSaleOrUndefined(db: TenantDb, id: string | undefined): Promise<Sale | undefined> {
  if (!id) return undefined
  try {
    const { data, error } = await db.rpc('get_sale', { p_sale_id: id })
    if (error) return undefined
    const result = getResultSchema.safeParse(data)
    return result.success && result.data.sale ? toSale(result.data.sale) : undefined
  }
  catch {
    return undefined
  }
}

/** The shortfall lines from TM037's DETAIL ({"shortfall":[...]}), or undefined if it can't be parsed. Never empty. */
function shortfallFromDetail(details: string | null | undefined): ShortfallLineList | undefined {
  if (!details) return undefined
  try {
    const parsed = shortfallDetailSchema.safeParse(JSON.parse(details))
    if (!parsed.success || parsed.data.shortfall.length === 0) return undefined
    return parsed.data.shortfall
  }
  catch {
    return undefined
  }
}
type ShortfallLineList = z.infer<typeof shortfallDetailSchema>['shortfall']

/** TM002 (hint sale_date) and TM055 (hint sale_date) are both about the one sale date. */
function clientFieldMessage(hint: string | null | undefined): string {
  return hint === 'required' ? SALE_MESSAGES.clientRequired : SALE_MESSAGES.clientInvalid
}

/** TM005's field depends on which operation raised it (mirrors clients' equivalent split). */
function malformedField(operation?: SaleOperation): string {
  switch (operation) {
    case 'create': return SALE_FIELDS.submissionId
    case 'update': return SALE_FIELDS.version
    case 'void': return SALE_FIELDS.version
    default: return SALE_FIELDS.id
  }
}

/**
 * Maps the M15/M16 functions' (and their trigger backstops') SQLSTATEs (§3.1/§3.3 tables) to API errors. Async
 * because TM036/TM041/TM042/TM043 all re-read the current sale by id (the same `currentClientOrUndefined`-style
 * pattern clients.ts uses for TM022), and TM037 parses `details` into `ShortfallLine[]`. Nothing from `message`
 * is ever used. Returns the error; callers `throw` it.
 */
export async function mapSaleDbError(
  db: TenantDb,
  error: SaleDbError,
  operation?: SaleOperation,
  saleId?: string,
): Promise<H3Error<ApiErrorData>> {
  switch (error.code) {
    case 'TM002': // sale_date after UTC today + 1
      return apiError(400, 'validation_failed', { [SALE_FIELDS.saleDate]: SALE_MESSAGES.saleDateFuture })
    case 'TM005': // malformed input (the route's schema normally catches this first)
      return apiError(400, 'validation_failed', { [malformedField(operation)]: SALE_MESSAGES.saleChanged })
    case 'TM027': // the sale isn't one of this farm's (foreign id or truly unknown -- the same answer, AC58)
      return apiError(404, 'not_found')
    case 'TM028': // fewer than 1 or more than 20 lines (the route's schema normally catches this first)
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesMax })
    case 'TM029': // the same size_id on two lines
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesDuplicateSize })
    case 'TM030': // a line's eggs outside 1-100,000 (no per-line identifier is attached: a server-only backstop)
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesInvalid })
    case 'TM031': // a line's price invalid
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: priceMessage(error.hint) })
    case 'TM032': // client rule broken (hint: required | invalid)
      return apiError(400, 'validation_failed', { [SALE_FIELDS.clientId]: clientFieldMessage(error.hint) })
    case 'TM033': // a NEW line's size isn't active/foreign
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesSizesChanged })
    case 'TM036': { // update_sale / void_sale: the version isn't the one the form opened with
      const sale = await currentSaleOrUndefined(db, saleId)
      return sale
        ? apiError(409, 'conflict', undefined, { reason: 'sale_changed', sale })
        : apiError(409, 'conflict', undefined, { reason: 'sale_changed' })
    }
    case 'TM037': { // completing/creating/increasing a line would take a size below 0 on hand
      const shortfall = shortfallFromDetail(error.details)
      return shortfall
        ? apiError(409, 'conflict', undefined, { reason: 'stock_short', shortfall })
        : apiError(409, 'conflict', undefined, { reason: 'stock_short' })
    }
    case 'TM038': // the same submissionId used with a different payload
      return apiError(400, 'validation_failed', { [SALE_FIELDS.submissionId]: SALE_MESSAGES.submissionReused })
    case 'TM053': { // update_sale: a delivery made from an order can only change its date (AC36)
      const sale = await currentSaleOrUndefined(db, saleId)
      return sale
        ? apiError(409, 'conflict', undefined, { reason: 'sale_locked', sale })
        : apiError(409, 'conflict', undefined, { reason: 'sale_locked' })
    }
    case 'TM055': // update_sale: a linked sale's date is before its order's date
      return apiError(400, 'validation_failed', { [SALE_FIELDS.saleDate]: SALE_MESSAGES.saleDateBeforeOrder })
    case 'TM043': { // update_sale: the sale is already voided
      const sale = await currentSaleOrUndefined(db, saleId)
      return sale
        ? apiError(409, 'conflict', undefined, { reason: 'voided', sale })
        : apiError(409, 'conflict', undefined, { reason: 'voided' })
    }
    case 'TM006': // p_tenant_id disagrees with the session: only a server bug can cause this
    case 'TM040': // an immutable column changed, or voided_at moved once set: unreachable from our routes
    case '23505': // backstops behind the checks above
    case '23514':
    default:
      return internalError('database error', error.code)
  }
}

function priceMessage(hint: string | null | undefined): string {
  return hint === 'too_many_decimals' ? SALE_MESSAGES.priceTooManyDecimals : SALE_MESSAGES.linesInvalid
}

function toLinesArgs(lines: SaleLineInput[]): { p_size_ids: string[], p_eggs: number[], p_prices: number[] } {
  return {
    p_size_ids: lines.map(l => l.sizeId),
    p_eggs: lines.map(l => l.eggs),
    p_prices: lines.map(l => l.pricePerTray),
  }
}

/** Only the keys that are set: supabase-js types an optional rpc argument as `?: string`, not `string | null`. */
function optionalArgs(clientId: string | null | undefined): { p_client_id?: string } {
  return clientId !== null && clientId !== undefined ? { p_client_id: clientId } : {}
}

export interface CreateSaleInput {
  submissionId: string
  type: 'delivery' | 'on_site'
  saleDate: string
  clientId?: string | null
  lines: SaleLineInput[]
  confirmShortfall?: boolean
}
export interface UpdateSaleInput {
  version: number
  type: 'delivery' | 'on_site'
  saleDate: string
  clientId?: string | null
  lines: SaleLineInput[]
  confirmShortfall?: boolean
}

/** Creates a sale. Idempotent per submissionId: a replay returns the first sale with `replayed: true` (AC30). */
export async function createSale(db: TenantDb, input: CreateSaleInput): Promise<CreateSaleResponse> {
  const args: TenantRpcArgs<'create_sale'> = {
    p_submission_id: input.submissionId,
    p_type: input.type,
    p_sale_date: input.saleDate,
    ...toLinesArgs(input.lines),
    ...optionalArgs(input.clientId),
    ...(input.confirmShortfall !== undefined ? { p_confirm_shortfall: input.confirmShortfall } : {}),
  }
  const { data, error } = await db.rpc('create_sale', args)
  if (error) throw await mapSaleDbError(db, error, 'create')
  const result = parseResult('create_sale', createResultSchema, data)
  return { sale: toSale(result.sale), replayed: result.replayed }
}

/** Replaces the whole sale (header + every line): AC40, AC42. A delivery made from an order accepts only a new date (AC36). */
export async function updateSale(db: TenantDb, id: string, input: UpdateSaleInput): Promise<SaleChangeResponse> {
  const args: TenantRpcArgs<'update_sale'> = {
    p_sale_id: id,
    p_version: input.version,
    p_type: input.type,
    p_sale_date: input.saleDate,
    ...toLinesArgs(input.lines),
    ...optionalArgs(input.clientId),
    ...(input.confirmShortfall !== undefined ? { p_confirm_shortfall: input.confirmShortfall } : {}),
  }
  const { data, error } = await db.rpc('update_sale', args)
  if (error) throw await mapSaleDbError(db, error, 'update', id)
  const result = parseResult('update_sale', changeResultSchema, data)
  return { sale: toSale(result.sale), changed: result.changed }
}

/** Voids a sale, one-way (AC67, AC68). A linked delivery also brings its order right in the same change; that order comes back (AC35). */
export async function voidSale(db: TenantDb, id: string, input: { version: number }): Promise<VoidSaleResponse> {
  const { data, error } = await db.rpc('void_sale', { p_sale_id: id, p_version: input.version })
  if (error) throw await mapSaleDbError(db, error, 'void', id)
  const result = parseResult('void_sale', voidResultSchema, data)
  return { sale: toSale(result.sale), changed: result.changed, order: result.order ? toOrderDetail(result.order) : null }
}

/** One sale of this farm, or null (not found, or another farm's: the same answer, AC58). */
export async function getSale(db: TenantDb, id: string): Promise<Sale | null> {
  const { data, error } = await db.rpc('get_sale', { p_sale_id: id })
  if (error) throw await mapSaleDbError(db, error, 'get', id)
  const result = parseResult('get_sale', getResultSchema, data)
  return result.sale ? toSale(result.sale) : null
}

export interface ListSalesFilters {
  from?: string
  to?: string
  type?: 'delivery' | 'on_site'
  clientId?: string
  limit?: number
  offset?: number
  includeVoided?: boolean
}

/** Sales matching the filters, newest first, server-paginated (D4). */
export async function listSales(db: TenantDb, filters: ListSalesFilters): Promise<SalesListResponse> {
  const args: TenantRpcArgs<'list_sales'> = {
    p_from: filters.from,
    p_to: filters.to,
    p_type: filters.type,
    p_client_id: filters.clientId,
    p_limit: filters.limit,
    p_offset: filters.offset,
    p_include_voided: filters.includeVoided,
  }
  const { data, error } = await db.rpc('list_sales', args)
  if (error) throw await mapSaleDbError(db, error, 'list')
  const result = parseResult('list_sales', listResultSchema, data)
  return { hasAny: result.hasAny, total: result.total, sales: result.sales.map(toSale) }
}

/** On hand (eggs) for the given sizes, or every size of the farm when omitted (AC25). */
export async function getOnHand(db: TenantDb, sizeIds?: string[]): Promise<OnHandResponse> {
  const args: TenantRpcArgs<'get_on_hand'> = sizeIds && sizeIds.length > 0 ? { p_size_ids: sizeIds } : {}
  const { data, error } = await db.rpc('get_on_hand', args)
  if (error) throw await mapSaleDbError(db, error, 'onHand')
  const result = parseResult('get_on_hand', onHandResultSchema, data)
  return { onHand: result.onHand }
}
