// Sales repository (docs/features/04-sales.md §3.3 "Repository", reworked by docs/features/05-orders.md §3.3.4: no
// pending, no mark-delivered, no delete -- a sale is edited or voided). Every write is ONE
// function called through TenantDb.rpc, which sets p_tenant_id from the context (never from input). Each
// function returns { sale: <jsonb> }, already the whole shape the API needs.
import { z } from 'zod'
import { SALE_FIELDS, SALE_MESSAGES } from '../../shared/constants/sales'
import type {
  CreateSaleResponse,
  OnHandResponse,
  Sale,
  SaleChangeResponse,
  SaleLineInput,
  SalesListResponse,
  VoidSaleResponse,
} from '../../shared/types/api'
import type { DbError, TenantDb, TenantRpcArgs } from '../db/tenant-db'
import { apiError } from '../errors'
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
  saleNumber: z.union([z.number(), z.string()]),
  type: z.enum(['delivery', 'on_site']),
  clientId: z.string().nullable(),
  saleDate: z.string(),
  orderId: z.string().nullable(),
  orderNumber: z.union([z.number(), z.string()]).nullable(),
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

export type SaleDbError = Pick<DbError, 'code'> & { message?: string, details?: string | null, hint?: string | null }

function internalError(scope: string, code?: string | null) {
  console.error(`[sales] ${scope} ${typeof code === 'string' ? code : 'unknown'}`)
  return apiError(500, 'internal')
}

function parseResult<T>(scope: string, schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw internalError(`unexpected ${scope} result`)
  return parsed.data
}

/** The ONE mapper: a database jsonb row to `Sale`. */
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

function clientFieldMessage(hint: string | null | undefined): string {
  return hint === 'required' ? SALE_MESSAGES.clientRequired : SALE_MESSAGES.clientInvalid
}

function malformedField(operation?: SaleOperation): string {
  switch (operation) {
    case 'create': return SALE_FIELDS.submissionId
    case 'update': return SALE_FIELDS.version
    case 'void': return SALE_FIELDS.version
    default: return SALE_FIELDS.id
  }
}

export async function mapSaleDbError(
  db: TenantDb,
  error: SaleDbError,
  operation?: SaleOperation,
  saleId?: string,
) {
  switch (error.code) {
    case 'TM002':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.saleDate]: SALE_MESSAGES.saleDateFuture })
    case 'TM005':
      return apiError(400, 'validation_failed', { [malformedField(operation)]: SALE_MESSAGES.saleChanged })
    case 'TM027':
      return apiError(404, 'not_found')
    case 'TM028':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesMax })
    case 'TM029':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesDuplicateSize })
    case 'TM030':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesInvalid })
    case 'TM031':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: priceMessage(error.hint) })
    case 'TM032':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.clientId]: clientFieldMessage(error.hint) })
    case 'TM033':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.lines]: SALE_MESSAGES.linesSizesChanged })
    case 'TM036': {
      const sale = await currentSaleOrUndefined(db, saleId)
      return sale
        ? apiError(409, 'conflict', undefined, { reason: 'sale_changed', sale })
        : apiError(409, 'conflict', undefined, { reason: 'sale_changed' })
    }
    case 'TM037': {
      const shortfall = shortfallFromDetail(error.details)
      return shortfall
        ? apiError(409, 'conflict', undefined, { reason: 'stock_short', shortfall })
        : apiError(409, 'conflict', undefined, { reason: 'stock_short' })
    }
    case 'TM038':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.submissionId]: SALE_MESSAGES.submissionReused })
    case 'TM053': {
      const sale = await currentSaleOrUndefined(db, saleId)
      return sale
        ? apiError(409, 'conflict', undefined, { reason: 'sale_locked', sale })
        : apiError(409, 'conflict', undefined, { reason: 'sale_locked' })
    }
    case 'TM055':
      return apiError(400, 'validation_failed', { [SALE_FIELDS.saleDate]: SALE_MESSAGES.saleDateBeforeOrder })
    case 'TM043': {
      const sale = await currentSaleOrUndefined(db, saleId)
      return sale
        ? apiError(409, 'conflict', undefined, { reason: 'voided', sale })
        : apiError(409, 'conflict', undefined, { reason: 'voided' })
    }
    case 'TM006':
    case 'TM040':
    case '23505':
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
  saleNumber?: string | number
}

export interface UpdateSaleInput {
  version: number
  type: 'delivery' | 'on_site'
  saleDate: string
  clientId?: string | null
  lines: SaleLineInput[]
  confirmShortfall?: boolean
}

export async function createSale(db: TenantDb, input: CreateSaleInput): Promise<CreateSaleResponse> {
  const args: TenantRpcArgs<'create_sale'> = {
    p_submission_id: input.submissionId,
    p_type: input.type,
    p_sale_date: input.saleDate,
    ...toLinesArgs(input.lines),
    ...optionalArgs(input.clientId),
    ...(input.confirmShortfall !== undefined ? { p_confirm_shortfall: input.confirmShortfall } : {}),
    ...(input.saleNumber !== undefined ? { p_sale_number: input.saleNumber } : {}),
  } as unknown as TenantRpcArgs<'create_sale'>
  const { data, error } = await db.rpc('create_sale', args)
  if (error) throw await mapSaleDbError(db, error, 'create')
  const result = parseResult('create_sale', createResultSchema, data)
  return { sale: toSale(result.sale), replayed: result.replayed }
}

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

export async function voidSale(db: TenantDb, id: string, input: { version: number }): Promise<VoidSaleResponse> {
  const { data, error } = await db.rpc('void_sale', { p_sale_id: id, p_version: input.version })
  if (error) throw await mapSaleDbError(db, error, 'void', id)
  const result = parseResult('void_sale', voidResultSchema, data)
  return { sale: toSale(result.sale), changed: result.changed, order: result.order ? toOrderDetail(result.order) : null }
}

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

export async function getOnHand(db: TenantDb, sizeIds?: string[]): Promise<OnHandResponse> {
  const args: TenantRpcArgs<'get_on_hand'> = sizeIds && sizeIds.length > 0 ? { p_size_ids: sizeIds } : {}
  const { data, error } = await db.rpc('get_on_hand', args)
  if (error) throw await mapSaleDbError(db, error, 'onHand')
  const result = parseResult('get_on_hand', onHandResultSchema, data)
  return { onHand: result.onHand }
}
