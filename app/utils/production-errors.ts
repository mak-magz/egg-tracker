// Maps a failed /api/production call to the few kinds the UI has copy for (feature 01 §3.4, UX data
// need 9). Pure; tests import it directly. 401 is already handled by $api (session-expired flow).
import type { ApiErrorData } from '../../shared/types/api'
import { PRODUCTION_FIELDS } from '../../shared/constants/production'
import { isNetworkError } from './auth-errors'

export type ProductionErrorKind = 'network' | 'validation' | 'stale_sizes' | 'not_found' | 'unknown'

export interface ProductionError {
  kind: ProductionErrorKind
  /** Server field messages (`date`, `amounts`, `rejects`, `good.<sizeId>`, …) for `validation`. */
  fields?: Record<string, string>
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

export function mapProductionError(e: unknown): ProductionError {
  const status = statusOf(e)
  if (status === undefined && isNetworkError(e)) return { kind: 'network' }
  if (status === 404) return { kind: 'not_found' }
  if (status === 400) {
    const fields = apiDataOf(e)?.fields ?? {}
    if (fields[PRODUCTION_FIELDS.sizes] !== undefined) return { kind: 'stale_sizes', fields }
    return { kind: 'validation', fields }
  }
  // A gateway error with no body looks like "couldn't connect" to the owner too.
  if (status === 502 || status === 503 || status === 504) return { kind: 'network' }
  return { kind: 'unknown' }
}
