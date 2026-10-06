// Maps a failed /api/orders call to the few kinds the Orders screen has copy for (feature 05 §2.5 "Data the UI
// needs" item 9). Pure; tests import it directly. 401 is already handled by $api (session-expired flow). Same
// shape and style as sale-errors.ts. Nothing here builds a message from a typed value (AC54): it carries the
// server's own field messages and, where the reply included one, the order as it is now or the short sizes.
import type { ApiErrorData, ApiErrorReason, OrderDetail, ShortfallLine } from '#shared/types/api'
import { ORDER_FIELDS } from '#shared/constants/orders'
import { isNetworkError } from './auth-errors'

export type OrderErrorKind
  = | 'network' // no response, a timeout or a gateway error: "Couldn't save. Check your connection..."
    | 'validation' // 400 on a field: show `fields` on the fields
    | 'order_changed' // 409 order_changed, or a bad id/version: changed elsewhere (AC20)
    | 'order_closed' // 409 order_closed: already fulfilled or cancelled
    | 'has_delivery' // 409 has_delivery: cancel or a hand-set status on an order with a delivery (AC22)
    | 'not_partial' // 409 not_partial: close short on any other status (AC34)
    | 'over_delivery' // 409 over_delivery: a line exceeds what is left (AC26); `order` has the current amounts
    | 'stock_short' // 409 stock_short: `shortfall` is never empty (AC30)
    | 'sale_locked' // 409 sale_locked: a delivery's client or lines can't change (AC36)
    | 'not_found' // 404: the id isn't one of this farm's orders
    | 'unknown'

export interface OrderError {
  kind: OrderErrorKind
  /** Server field messages, for `validation`. */
  fields?: Record<string, string>
  /** For the order_* / has_delivery / not_partial / over_delivery kinds: the order as it is NOW, when the server sent it. */
  order?: OrderDetail
  /** For `stock_short`: only the short sizes, farm order. */
  shortfall?: ShortfallLine[]
}

function statusOf(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const err = e as { statusCode?: unknown, status?: unknown }
  const code = err.statusCode ?? err.status
  return typeof code === 'number' ? code : undefined
}

/** Nitro nests our ApiErrorData in the body's `data` (FetchError.data.data). */
function apiDataOf(e: unknown): ApiErrorData | undefined {
  const body = (e as { data?: { data?: unknown } } | null)?.data
  const data = body?.data
  return typeof data === 'object' && data !== null && 'code' in data ? (data as ApiErrorData) : undefined
}

function reasonOf(data: ApiErrorData | undefined): ApiErrorReason | undefined {
  return data?.reason
}

/** Kinds whose reply carries the order, and so refresh the list without a second request. */
export function errorCarriesOrder(kind: OrderErrorKind): boolean {
  return kind === 'order_changed' || kind === 'order_closed' || kind === 'has_delivery' || kind === 'not_partial' || kind === 'over_delivery'
}

export function mapOrderError(e: unknown): OrderError {
  const status = statusOf(e)
  if (status === undefined && isNetworkError(e)) return { kind: 'network' }
  // A gateway error with no body looks like "couldn't connect" to the owner too.
  if (status === 502 || status === 503 || status === 504) return { kind: 'network' }

  const data = apiDataOf(e)

  if (status === 404) return { kind: 'not_found' }

  if (status === 409) {
    const reason = reasonOf(data)
    const withOrder = data?.order ? { order: data.order } : {}
    if (reason === 'stock_short') return { kind: 'stock_short', ...(data?.shortfall ? { shortfall: data.shortfall } : {}) }
    if (reason === 'order_changed') return { kind: 'order_changed', ...withOrder }
    if (reason === 'order_closed') return { kind: 'order_closed', ...withOrder }
    if (reason === 'has_delivery') return { kind: 'has_delivery', ...withOrder }
    if (reason === 'not_partial') return { kind: 'not_partial', ...withOrder }
    if (reason === 'over_delivery') return { kind: 'over_delivery', ...withOrder }
    if (reason === 'sale_locked') return { kind: 'sale_locked' }
    return { kind: 'unknown' }
  }

  if (status === 400) {
    const fields = data?.fields ?? {}
    // A bad id or version means the order the form was opened on is out of date (the server says the same).
    if (fields[ORDER_FIELDS.version] !== undefined || fields[ORDER_FIELDS.id] !== undefined) return { kind: 'order_changed' }
    return { kind: 'validation', fields }
  }

  return { kind: 'unknown' }
}
