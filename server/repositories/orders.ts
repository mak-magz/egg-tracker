// Orders repository (docs/features/05-orders.md §3.3, §3.4). Every call is ONE security invoker Postgres function
// through TenantDb.rpc, which sets p_tenant_id from the server context (never from input); each function returns the
// whole shape the API needs (app.order_json is built into every return value), so there is no separate re-read on
// success.
//
// PERSONAL DATA: an order carries `clientId`, never a client's name or phone (AC53, AC54). The same discipline as
// sales.ts: never log a raw error object, `message`, `details` or `hint` -- `internalError` logs only
// `[orders] <scope> <SQLSTATE>`. TM037's detail (the shortfall) and TM051's detail ({"sizeIds":[..]}) carry only
// ids and egg counts; the order re-read on a conflict carries only ids, dates, eggs and prices-per-tray.
import type { H3Error } from 'h3'
import { z } from 'zod'
import { ORDER_FIELDS, ORDER_MESSAGES } from '../../shared/constants/orders'
import type {
  ApiErrorData,
  CreateOrderResponse,
  DeliverOrderResponse,
  Order,
  OrderChangeResponse,
  OrderDetail,
  OrderLineInput,
  OrderManualStatus,
  OrdersListResponse,
  OrdersView,
} from '../../shared/types/api'
import type { DbError, TenantDb, TenantRpcArgs } from '../utils/db'
import { apiError } from '../utils/errors'
import { orderDetailJsonSchema, orderJsonSchema, toOrder, toOrderDetail } from './order-json'
import { saleJsonSchema, toSale } from './sales'

/** Which function raised, so an error shared by several (TM002, TM005, TM055) lands on the right field. */
export type OrderOperation = 'create' | 'update' | 'setStatus' | 'cancel' | 'close' | 'deliver' | 'get' | 'list'

const createResultSchema = z.object({ order: orderDetailJsonSchema, replayed: z.boolean() })
const changeResultSchema = z.object({ order: orderDetailJsonSchema, changed: z.boolean() })
const deliverResultSchema = z.object({ order: orderDetailJsonSchema, sale: saleJsonSchema, replayed: z.boolean() })
const getResultSchema = z.object({ order: orderDetailJsonSchema.nullable() })
const listResultSchema = z.object({ hasAny: z.boolean(), total: z.number(), orders: z.array(orderJsonSchema) })
const shortfallLineSchema = z.object({ sizeId: z.string(), onHandEggs: z.number(), neededEggs: z.number() })
const shortfallDetailSchema = z.object({ shortfall: z.array(shortfallLineSchema) })
const sizeIdsDetailSchema = z.object({ sizeIds: z.array(z.string()) })

/** The error type mapOrderDbError reads: only `code` (and `hint` / `details` for the field choice and the details). */
export type OrderDbError = Pick<DbError, 'code'> & { message?: string, details?: string | null, hint?: string | null }

/** Logs the SQLSTATE and the place, never the error object, and returns a bare 500. */
function internalError(scope: string, code?: string | null): H3Error<ApiErrorData> {
  console.error(`[orders] ${scope} ${typeof code === 'string' ? code : 'unknown'}`)
  return apiError(500, 'internal')
}

function parseResult<T>(scope: string, schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw internalError(`unexpected ${scope} result`)
  return parsed.data
}

/** The current order (with deliveries), or undefined when the id is missing/foreign, or the read itself fails. */
async function currentOrderOrUndefined(db: TenantDb, id: string | undefined): Promise<OrderDetail | undefined> {
  if (!id) return undefined
  try {
    const { data, error } = await db.rpc('get_order', { p_order_id: id })
    if (error) return undefined
    const result = getResultSchema.safeParse(data)
    return result.success && result.data.order ? toOrderDetail(result.data.order) : undefined
  }
  catch {
    return undefined
  }
}

/** The shortfall lines from TM037's DETAIL ({"shortfall":[...]}), or undefined if it can't be parsed. Never empty. */
function shortfallFromDetail(details: string | null | undefined) {
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

/** The size ids from TM051's DETAIL ({"sizeIds":[..]}), or [] if there are none / it can't be parsed. */
function sizeIdsFromDetail(details: string | null | undefined): string[] {
  if (!details) return []
  try {
    const parsed = sizeIdsDetailSchema.safeParse(JSON.parse(details))
    return parsed.success ? parsed.data.sizeIds : []
  }
  catch {
    return []
  }
}

/** TM005's field depends on which operation raised it. */
function malformedField(operation?: OrderOperation): string {
  switch (operation) {
    case 'create':
    case 'deliver': return ORDER_FIELDS.submissionId
    case 'update':
    case 'close': return ORDER_FIELDS.version
    case 'setStatus': return ORDER_FIELDS.status
    default: return ORDER_FIELDS.id
  }
}

function priceMessage(hint: string | null | undefined): string {
  switch (hint) {
    case 'not_positive': return ORDER_MESSAGES.priceNotPositive
    case 'too_large': return ORDER_MESSAGES.priceTooLargeServer
    case 'too_many_decimals': return ORDER_MESSAGES.priceTooManyDecimals
    default: return ORDER_MESSAGES.linesInvalid
  }
}

/** A 409 that carries the order as it is NOW (absent if that read failed): the screen refreshes with no second request. */
async function orderConflict(db: TenantDb, orderId: string | undefined, reason: 'order_changed' | 'order_closed' | 'has_delivery' | 'not_partial' | 'over_delivery') {
  const order = await currentOrderOrUndefined(db, orderId)
  return order
    ? apiError(409, 'conflict', undefined, { reason, order })
    : apiError(409, 'conflict', undefined, { reason })
}

/**
 * Maps the M17/M20 functions' (and their trigger backstops') SQLSTATEs (§3.3.1) to API errors. Async because the
 * 409s re-read the current order by id so the screen refreshes with no second request, and TM037 parses `details`
 * into `ShortfallLine[]`. Nothing from `message` is ever used. Returns the error; callers `throw` it.
 */
export async function mapOrderDbError(
  db: TenantDb,
  error: OrderDbError,
  operation?: OrderOperation,
  orderId?: string,
): Promise<H3Error<ApiErrorData>> {
  switch (error.code) {
    case 'TM002': // order_date or delivered_date after UTC today + 1
      return error.hint === 'delivered_date'
        ? apiError(400, 'validation_failed', { [ORDER_FIELDS.deliveredDate]: ORDER_MESSAGES.deliveredDateFuture })
        : apiError(400, 'validation_failed', { [ORDER_FIELDS.orderDate]: ORDER_MESSAGES.orderDateFuture })
    case 'TM005': // malformed input (the route's schema normally catches this first)
      return apiError(400, 'validation_failed', { [malformedField(operation)]: operation === 'setStatus' ? ORDER_MESSAGES.statusInvalid : ORDER_MESSAGES.orderChanged })
    case 'TM028': // fewer than 1 or more than 20 lines
      return apiError(400, 'validation_failed', { [ORDER_FIELDS.lines]: ORDER_MESSAGES.linesMax })
    case 'TM029': // the same size on two lines
      return apiError(400, 'validation_failed', { [ORDER_FIELDS.lines]: ORDER_MESSAGES.linesDuplicateSize })
    case 'TM030': // a line's eggs outside 1-100,000 (no per-line identifier is attached: a server-only backstop)
      return apiError(400, 'validation_failed', { [ORDER_FIELDS.lines]: ORDER_MESSAGES.linesInvalid })
    case 'TM031': // a line's price invalid
      return apiError(400, 'validation_failed', { [ORDER_FIELDS.lines]: priceMessage(error.hint) })
    case 'TM032': // client rule broken (hint: required | invalid)
      return apiError(400, 'validation_failed', {
        [ORDER_FIELDS.clientId]: error.hint === 'required' ? ORDER_MESSAGES.clientRequired : ORDER_MESSAGES.clientInvalid,
      })
    case 'TM033': // a NEW line's size isn't active/foreign
      return apiError(400, 'validation_failed', { [ORDER_FIELDS.lines]: ORDER_MESSAGES.linesSizesChanged })
    case 'TM037': { // a delivery would take a size below 0 on hand
      const shortfall = shortfallFromDetail(error.details)
      return shortfall
        ? apiError(409, 'conflict', undefined, { reason: 'stock_short', shortfall })
        : apiError(409, 'conflict', undefined, { reason: 'stock_short' })
    }
    case 'TM038': // the same submissionId used with a different payload
      return apiError(400, 'validation_failed', { [ORDER_FIELDS.submissionId]: ORDER_MESSAGES.submissionReused })
    case 'TM044': // the order isn't one of this farm's (foreign or unknown: the same answer, AC52)
      return apiError(404, 'not_found')
    case 'TM045': // the version isn't the one the form opened with
      return orderConflict(db, orderId, 'order_changed')
    case 'TM046': // cancelled, fulfilled or closed short
      return orderConflict(db, orderId, 'order_closed')
    case 'TM047': // cancel with a non-voided delivery
    case 'TM049': // set status on an order that has a delivery
      return orderConflict(db, orderId, 'has_delivery')
    case 'TM048': // close short on an order that isn't partially fulfilled
      return orderConflict(db, orderId, 'not_partial')
    case 'TM050': // a delivery line exceeds what is remaining
      return orderConflict(db, orderId, 'over_delivery')
    case 'TM051': { // an edit that breaks a delivery
      if (error.hint === 'client_locked') return apiError(400, 'validation_failed', { [ORDER_FIELDS.clientId]: ORDER_MESSAGES.clientLocked })
      const message = error.hint === 'line_locked' ? ORDER_MESSAGES.lineLocked : ORDER_MESSAGES.belowDelivered
      const sizeIds = sizeIdsFromDetail(error.details)
      const fields: Record<string, string> = {}
      for (const id of sizeIds) fields[ORDER_FIELDS.line(id)] = message
      if (sizeIds.length === 0) fields[ORDER_FIELDS.lines] = message
      return apiError(400, 'validation_failed', fields)
    }
    case 'TM052': // a size isn't a line of this order (the order changed), or the delivery has no lines
      return error.hint === 'not_on_order'
        ? orderConflict(db, orderId, 'order_changed')
        : apiError(400, 'validation_failed', { [ORDER_FIELDS.lines]: ORDER_MESSAGES.deliverNone })
    case 'TM055': // a date earlier than the order date
      switch (error.hint) {
        case 'wanted_by': return apiError(400, 'validation_failed', { [ORDER_FIELDS.wantedBy]: ORDER_MESSAGES.wantedByBeforeOrder })
        case 'delivered_date': return apiError(400, 'validation_failed', { [ORDER_FIELDS.deliveredDate]: ORDER_MESSAGES.deliveredDateBeforeOrder })
        default: return apiError(400, 'validation_failed', { [ORDER_FIELDS.orderDate]: ORDER_MESSAGES.orderDateAfterFirstDelivery })
      }
    case 'TM006': // p_tenant_id disagrees with the session: only a server bug can cause this
    case 'TM053': // a linked sale's lines changed: unreachable from the order routes
    case 'TM054': // an impossible state or transition: only a hand-built write reaches it
    case '23505': // backstops behind the checks above
    case '23514':
    default:
      return internalError('database error', error.code)
  }
}

function toLinesArgs(lines: OrderLineInput[]): { p_size_ids: string[], p_eggs: number[], p_prices: number[] } {
  return {
    p_size_ids: lines.map(l => l.sizeId),
    p_eggs: lines.map(l => l.eggs),
    p_prices: lines.map(l => l.pricePerTray),
  }
}

export interface CreateOrderInput {
  submissionId: string
  clientId: string
  orderDate: string
  wantedBy?: string | null
  lines: OrderLineInput[]
}
export interface UpdateOrderInput {
  version: number
  clientId: string
  orderDate: string
  wantedBy?: string | null
  lines: OrderLineInput[]
}
export interface DeliverOrderInput {
  submissionId: string
  deliveredDate: string
  lines: { sizeId: string, eggs: number }[]
  confirmShortfall?: boolean
}
export interface ListOrdersFilters {
  view?: OrdersView
  clientId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

/** Creates an order (header + 1-20 lines). Idempotent per submissionId: a replay returns the first order (AC16). */
export async function createOrder(db: TenantDb, input: CreateOrderInput): Promise<CreateOrderResponse> {
  const args: TenantRpcArgs<'create_order'> = {
    p_submission_id: input.submissionId,
    p_client_id: input.clientId,
    p_order_date: input.orderDate,
    ...toLinesArgs(input.lines),
    ...(input.wantedBy ? { p_wanted_by: input.wantedBy } : {}),
  }
  const { data, error } = await db.rpc('create_order', args)
  if (error) throw await mapOrderDbError(db, error, 'create')
  const result = parseResult('create_order', createResultSchema, data)
  return { order: toOrderDetail(result.order), replayed: result.replayed }
}

/** Replaces the whole order (header + every line): AC19, AC20, AC57. */
export async function updateOrder(db: TenantDb, id: string, input: UpdateOrderInput): Promise<OrderChangeResponse> {
  const args: TenantRpcArgs<'update_order'> = {
    p_order_id: id,
    p_version: input.version,
    p_client_id: input.clientId,
    p_order_date: input.orderDate,
    ...toLinesArgs(input.lines),
    ...(input.wantedBy ? { p_wanted_by: input.wantedBy } : {}),
  }
  const { data, error } = await db.rpc('update_order', args)
  if (error) throw await mapOrderDbError(db, error, 'update', id)
  const result = parseResult('update_order', changeResultSchema, data)
  return { order: toOrderDetail(result.order), changed: result.changed }
}

/** Moves an order among Requested, Confirmed and Ready (AC21). No version: idempotent last-write-wins (D8). */
export async function setOrderStatus(db: TenantDb, id: string, status: OrderManualStatus): Promise<OrderChangeResponse> {
  const { data, error } = await db.rpc('set_order_status', { p_order_id: id, p_status: status })
  if (error) throw await mapOrderDbError(db, error, 'setStatus', id)
  const result = parseResult('set_order_status', changeResultSchema, data)
  return { order: toOrderDetail(result.order), changed: result.changed }
}

/** Cancels an order that has no non-voided delivery (AC22). */
export async function cancelOrder(db: TenantDb, id: string): Promise<OrderChangeResponse> {
  const { data, error } = await db.rpc('cancel_order', { p_order_id: id })
  if (error) throw await mapOrderDbError(db, error, 'cancel', id)
  const result = parseResult('cancel_order', changeResultSchema, data)
  return { order: toOrderDetail(result.order), changed: result.changed }
}

/** Closes a Partially fulfilled order short, one-way (AC34). `version` is the one the confirm dialog was built from. */
export async function closeOrder(db: TenantDb, id: string, input: { version: number }): Promise<OrderChangeResponse> {
  const { data, error } = await db.rpc('close_order', { p_order_id: id, p_version: input.version })
  if (error) throw await mapOrderDbError(db, error, 'close', id)
  const result = parseResult('close_order', changeResultSchema, data)
  return { order: toOrderDetail(result.order), changed: result.changed }
}

/** Delivers part or all of an order as ONE sale (AC24 to AC31). Idempotent per submissionId. */
export async function deliverOrder(db: TenantDb, id: string, input: DeliverOrderInput): Promise<DeliverOrderResponse> {
  const args: TenantRpcArgs<'deliver_order'> = {
    p_submission_id: input.submissionId,
    p_order_id: id,
    p_delivered_date: input.deliveredDate,
    p_size_ids: input.lines.map(l => l.sizeId),
    p_eggs: input.lines.map(l => l.eggs),
    ...(input.confirmShortfall !== undefined ? { p_confirm_shortfall: input.confirmShortfall } : {}),
  }
  const { data, error } = await db.rpc('deliver_order', args)
  if (error) throw await mapOrderDbError(db, error, 'deliver', id)
  const result = parseResult('deliver_order', deliverResultSchema, data)
  return { order: toOrderDetail(result.order), sale: toSale(result.sale), replayed: result.replayed }
}

/** One order of this farm with its deliveries, or null (not found, or another farm's: the same answer, AC52). */
export async function getOrder(db: TenantDb, id: string): Promise<OrderDetail | null> {
  const { data, error } = await db.rpc('get_order', { p_order_id: id })
  if (error) throw await mapOrderDbError(db, error, 'get', id)
  const result = parseResult('get_order', getResultSchema, data)
  return result.order ? toOrderDetail(result.order) : null
}

/** Orders matching the filters. The open view returns EVERY open order (AC5); the other views page (AC49). */
export async function listOrders(db: TenantDb, filters: ListOrdersFilters): Promise<OrdersListResponse> {
  const args: TenantRpcArgs<'list_orders'> = {
    p_view: filters.view,
    p_client_id: filters.clientId,
    p_from: filters.from,
    p_to: filters.to,
    p_limit: filters.limit,
    p_offset: filters.offset,
  }
  const { data, error } = await db.rpc('list_orders', args)
  if (error) throw await mapOrderDbError(db, error, 'list')
  const result = parseResult('list_orders', listResultSchema, data)
  const orders: Order[] = result.orders.map(toOrder)
  return { hasAny: result.hasAny, total: result.total, orders }
}
