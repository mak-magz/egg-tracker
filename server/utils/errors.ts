import { createError, isError } from 'h3'
import type { H3Error } from 'h3'
import type { ApiErrorCode, ApiErrorData } from '../../shared/types/api'

const API_ERROR_CODES: readonly ApiErrorCode[] = ['unauthenticated', 'forbidden', 'no_farm', 'validation_failed', 'not_found', 'conflict', 'internal']

const STATUS_MESSAGES: Record<ApiErrorCode, string> = {
  unauthenticated: 'Unauthorized',
  forbidden: 'Forbidden',
  no_farm: 'Forbidden',
  validation_failed: 'Bad Request',
  not_found: 'Not Found',
  conflict: 'Conflict',
  internal: 'Internal Server Error',
}

/** Optional extras on an error body (feature 02 §3.3, feature 03 §3.3, feature 04 §3.3): why a 409 happened, the clashing row, the current sizes, the current client, the current sale, the stock shortfall, and (feature 05) the current order. */
export type ApiErrorExtra = Pick<ApiErrorData, 'reason' | 'existing' | 'sizes' | 'client' | 'sale' | 'shortfall' | 'order'>

/**
 * The one way server code raises an API error. The body is `{ statusCode, statusMessage, data: ApiErrorData }`,
 * so the client reads the code from `FetchError.data.data.code`. `extra` carries `reason`, `existing`, `sizes`,
 * `client`, `sale`, `shortfall` and `order`; only keys that are set end up in the body.
 */
export function apiError(
  statusCode: number,
  code: ApiErrorCode,
  fields?: Record<string, string>,
  extra?: ApiErrorExtra,
): H3Error<ApiErrorData> {
  const data: ApiErrorData = { code }
  if (fields) data.fields = fields
  if (extra?.reason !== undefined) data.reason = extra.reason
  if (extra?.existing !== undefined) data.existing = extra.existing
  if (extra?.sizes !== undefined) data.sizes = extra.sizes
  if (extra?.client !== undefined) data.client = extra.client
  if (extra?.sale !== undefined) data.sale = extra.sale
  if (extra?.shortfall !== undefined) data.shortfall = extra.shortfall
  if (extra?.order !== undefined) data.order = extra.order
  return createError<ApiErrorData>({ statusCode, statusMessage: STATUS_MESSAGES[code], data })
}

export function isApiError(e: unknown): e is H3Error<ApiErrorData> {
  if (!isError(e)) return false
  const code = (e.data as Partial<ApiErrorData> | undefined)?.code
  return typeof code === 'string' && (API_ERROR_CODES as readonly string[]).includes(code)
}

/** A database failure that carries only the SQLSTATE (Postgres error details can hold row values). */
export class RepositoryError extends Error {
  readonly code: string | undefined
  constructor(scope: string, code?: string | null) {
    super(scope)
    this.name = 'RepositoryError'
    this.code = typeof code === 'string' ? code : undefined
  }
}

/**
 * Maps anything thrown inside a handler to an ApiErrorData error. Our own errors pass through;
 * h3 client errors keep their meaning; everything else is logged and becomes a generic 500
 * (no internal messages leak to the browser).
 */
export function toApiError(e: unknown): H3Error<ApiErrorData> {
  if (isApiError(e)) return e
  if (isError(e)) {
    if (e.statusCode === 400 || e.statusCode === 422) return apiError(400, 'validation_failed')
    if (e.statusCode === 401) return apiError(401, 'unauthenticated')
    if (e.statusCode === 403) return apiError(403, 'forbidden')
    if (e.statusCode === 404) return apiError(404, 'not_found')
  }
  const o = (e ?? {}) as { name?: unknown, code?: unknown }
  console.error('[api] unexpected error', typeof o.name === 'string' ? o.name : 'unknown', typeof o.code === 'string' ? o.code : 'unknown')
  return apiError(500, 'internal')
}

interface ZodIssueLike { path: PropertyKey[], message: string }

/**
 * Turns zod issues into `ApiErrorData.fields` (first message per key wins).
 * `good.<index>.*` becomes `good.<sizeId>` when the input names that line's size (feature 01 §3.3
 * PRODUCTION_FIELDS.good), so the form can put the message on the right row; otherwise `amounts`.
 * An object-level issue with an empty path becomes `amounts`.
 */
export function zodFields(error: { issues: readonly ZodIssueLike[] }, input?: unknown): Record<string, string> {
  const fields: Record<string, string> = {}
  const good = (input && typeof input === 'object' && Array.isArray((input as { good?: unknown }).good))
    ? (input as { good: unknown[] }).good
    : []
  for (const issue of error.issues) {
    const [head, index] = issue.path
    let key: string
    if (head === undefined) {
      key = 'amounts'
    }
    else if (head === 'good' && typeof index === 'number') {
      const sizeId = (good[index] as { sizeId?: unknown } | undefined)?.sizeId
      key = typeof sizeId === 'string' && sizeId ? `good.${sizeId}` : 'amounts'
    }
    else if (head === 'good') {
      key = 'amounts'
    }
    else {
      key = String(head)
    }
    fields[key] ??= issue.message
  }
  return fields
}

interface SafeParser<T> {
  safeParse: (input: unknown) => { success: true, data: T } | { success: false, error: { issues: readonly ZodIssueLike[] } }
}

/** Validates route input with a shared schema: the parsed value, or 400 `validation_failed` with per-field messages. */
export function validateInput<T>(schema: SafeParser<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) throw apiError(400, 'validation_failed', zodFields(result.error, input))
  return result.data
}
