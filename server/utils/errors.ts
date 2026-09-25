import { createError, isError } from 'h3'
import type { H3Error } from 'h3'
import type { ApiErrorCode, ApiErrorData } from '../../shared/types/api'

const API_ERROR_CODES: readonly ApiErrorCode[] = ['unauthenticated', 'no_farm', 'validation_failed', 'not_found', 'internal']

const STATUS_MESSAGES: Record<ApiErrorCode, string> = {
  unauthenticated: 'Unauthorized',
  no_farm: 'Forbidden',
  validation_failed: 'Bad Request',
  not_found: 'Not Found',
  internal: 'Internal Server Error',
}

/**
 * The one way server code raises an API error. The body is `{ statusCode, statusMessage, data: ApiErrorData }`,
 * so the client reads the code from `FetchError.data.data.code`.
 */
export function apiError(statusCode: number, code: ApiErrorCode, fields?: Record<string, string>): H3Error<ApiErrorData> {
  const data: ApiErrorData = fields ? { code, fields } : { code }
  return createError<ApiErrorData>({ statusCode, statusMessage: STATUS_MESSAGES[code], data })
}

export function isApiError(e: unknown): e is H3Error<ApiErrorData> {
  if (!isError(e)) return false
  const code = (e.data as Partial<ApiErrorData> | undefined)?.code
  return typeof code === 'string' && (API_ERROR_CODES as readonly string[]).includes(code)
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
    if (e.statusCode === 404) return apiError(404, 'not_found')
  }
  console.error('[api] unexpected error', e)
  return apiError(500, 'internal')
}
