// Maps a failed /api/sizes call to the few kinds the Settings screen has copy for (feature 02 §3.4).
// Pure; tests import it directly. 401 is already handled by $api (session-expired flow). Same shape and
// style as production-errors.ts.
import type { ApiErrorData, FarmSize, SizeNameMatch } from '#shared/types/api'
import { SIZE_FIELDS } from '#shared/constants/sizes'
import { isNetworkError } from './auth-errors'

export type SizeErrorKind
  = | 'network' // no response, a timeout or a gateway error: "Couldn't save. Check your connection..."
    | 'name_invalid' // 400 on the name (blank, too long, too many sizes): show `message` on the field
    | 'name_taken' // 409: another size has the name (`existing`, archived or not)
    | 'last_active' // 409: it would leave the farm with no active size
    | 'stale' // 409 sizes_changed, any 404, or a bad id list: the list changed elsewhere
    | 'unknown'

export interface SizeError {
  kind: SizeErrorKind
  /** Server field messages, for `name_invalid` and `name_taken`. */
  fields?: Record<string, string>
  /** For `name_taken`: the size that already has the name. */
  existing?: SizeNameMatch
  /** The farm's CURRENT sizes when the server sent them (`stale`, `last_active`). Absent: refresh yourself. */
  sizes?: FarmSize[]
  /** For `name_invalid` and `name_taken`: the server's message for the name field, if any. */
  message?: string
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

export function mapSizeError(e: unknown): SizeError {
  const status = statusOf(e)
  if (status === undefined && isNetworkError(e)) return { kind: 'network' }
  // A gateway error with no body looks like "couldn't connect" to the owner too.
  if (status === 502 || status === 503 || status === 504) return { kind: 'network' }

  const data = apiDataOf(e)
  const sizes = Array.isArray(data?.sizes) ? data.sizes : undefined
  const withSizes = sizes ? { sizes } : {}

  // Every 404 is "the size isn't there any more": the list changed somewhere else (AC20).
  if (status === 404) return { kind: 'stale', ...withSizes }

  if (status === 409) {
    if (data?.reason === 'name_taken') {
      return {
        kind: 'name_taken',
        fields: data.fields,
        message: data.fields?.[SIZE_FIELDS.name],
        ...(data.existing ? { existing: data.existing } : {}),
      }
    }
    if (data?.reason === 'last_active_size') return { kind: 'last_active', ...withSizes }
    if (data?.reason === 'sizes_changed') return { kind: 'stale', ...withSizes }
    return { kind: 'unknown' }
  }

  if (status === 400) {
    const fields = data?.fields ?? {}
    if (fields[SIZE_FIELDS.name] !== undefined) return { kind: 'name_invalid', fields, message: fields[SIZE_FIELDS.name] }
    // A bad or mismatched id list means the list is out of date (the server says the same).
    if (fields[SIZE_FIELDS.order] !== undefined || fields[SIZE_FIELDS.id] !== undefined) return { kind: 'stale' }
    return { kind: 'unknown', fields }
  }

  return { kind: 'unknown' }
}
