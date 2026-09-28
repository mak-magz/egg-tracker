// Maps a failed /api/sales call to the few kinds the Sales screen has copy for (feature 04 §3.3 "Notable
// errors", "Data the UI needs" item 9). Pure; tests import it directly. 401 is already handled by $api
// (session-expired flow). Same shape and style as client-errors.ts / production-errors.ts. Nothing here
// ever builds a message from a typed value (AC59): it carries the server's own field messages and, where
// the reply included one, the sale as it is now or the short sizes, never a client's name beyond what the
// sale already carries.
import type { ApiErrorData, ApiErrorReason, Sale, ShortfallLine } from '#shared/types/api'
import { SALE_FIELDS } from '#shared/constants/sales'
import { isNetworkError } from './auth-errors'

export type SaleErrorKind
  = | 'network' // no response, a timeout or a gateway error: "Couldn't save. Check your connection..."
    | 'validation' // 400 on a field: show `fields` on the fields
    | 'stock_short' // 409 stock_short (AC26, AC35, AC42): `shortfall` is never empty
    | 'sale_changed' // 409 sale_changed, or a bad id/version: the sale changed elsewhere (AC43)
    | 'not_found' // 404: the id isn't one of this farm's sales
    | 'not_pending' // 409 not_pending: Delete attempted on a Complete/voided sale (AC44)
    | 'not_complete' // 409 not_complete: Void attempted on a Pending sale (AC67)
    | 'voided' // 409 voided: any change attempted on an already-voided sale (AC68)
    | 'unknown'

export interface SaleError {
  kind: SaleErrorKind
  /** Server field messages, for `validation`. */
  fields?: Record<string, string>
  /** For `sale_changed`, `not_pending`, `not_complete`: the sale as it is NOW, when the server sent it. */
  sale?: Sale
  /** For `stock_short`: only the short sizes, farm order. Never empty when the kind is `stock_short`. */
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

export function mapSaleError(e: unknown): SaleError {
  const status = statusOf(e)
  if (status === undefined && isNetworkError(e)) return { kind: 'network' }
  // A gateway error with no body looks like "couldn't connect" to the owner too.
  if (status === 502 || status === 503 || status === 504) return { kind: 'network' }

  const data = apiDataOf(e)

  if (status === 404) return { kind: 'not_found' }

  if (status === 409) {
    const reason = reasonOf(data)
    if (reason === 'stock_short') return { kind: 'stock_short', ...(data?.shortfall ? { shortfall: data.shortfall } : {}) }
    if (reason === 'sale_changed') return { kind: 'sale_changed', ...(data?.sale ? { sale: data.sale } : {}) }
    if (reason === 'not_pending') return { kind: 'not_pending', ...(data?.sale ? { sale: data.sale } : {}) }
    if (reason === 'not_complete') return { kind: 'not_complete', ...(data?.sale ? { sale: data.sale } : {}) }
    if (reason === 'voided') return { kind: 'voided', ...(data?.sale ? { sale: data.sale } : {}) }
    return { kind: 'unknown' }
  }

  if (status === 400) {
    const fields = data?.fields ?? {}
    // A bad id or version means the sale the form was opened on is out of date (the server says the same).
    if (fields[SALE_FIELDS.version] !== undefined || fields[SALE_FIELDS.id] !== undefined) return { kind: 'sale_changed' }
    return { kind: 'validation', fields }
  }

  return { kind: 'unknown' }
}
