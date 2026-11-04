import type { ApiErrorCode, ApiErrorData } from '../shared/types/api'

export const API_ERROR_CODES: readonly ApiErrorCode[] = [
  'unauthenticated',
  'forbidden',
  'no_farm',
  'validation_failed',
  'not_found',
  'conflict',
  'internal',
  'bad_request',
]

export const STATUS_MESSAGES: Record<ApiErrorCode, string> = {
  unauthenticated: 'Unauthorized',
  forbidden: 'Forbidden',
  no_farm: 'Forbidden',
  validation_failed: 'Bad Request',
  not_found: 'Not Found',
  conflict: 'Conflict',
  internal: 'Internal Server Error',
  bad_request: 'Bad Request',
}

export type ApiErrorExtra = Pick<
  ApiErrorData,
  'reason' | 'existing' | 'sizes' | 'client' | 'sale' | 'shortfall' | 'order'
>

export class CoreApiError extends Error {
  readonly statusCode: number
  readonly statusMessage: string
  readonly data: ApiErrorData

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    fields?: Record<string, string>,
    extra?: ApiErrorExtra,
  ) {
    super(STATUS_MESSAGES[code] || 'API Error')
    this.name = 'CoreApiError'
    this.statusCode = statusCode
    this.statusMessage = STATUS_MESSAGES[code] || 'API Error'

    const data: ApiErrorData = { code }
    if (fields) data.fields = fields
    if (extra?.reason !== undefined) data.reason = extra.reason
    if (extra?.existing !== undefined) data.existing = extra.existing
    if (extra?.sizes !== undefined) data.sizes = extra.sizes
    if (extra?.client !== undefined) data.client = extra.client
    if (extra?.sale !== undefined) data.sale = extra.sale
    if (extra?.shortfall !== undefined) data.shortfall = extra.shortfall
    if (extra?.order !== undefined) data.order = extra.order
    this.data = data
  }
}

export function createCoreError(
  statusCode: number,
  code: ApiErrorCode,
  fields?: Record<string, string>,
  extra?: ApiErrorExtra,
): CoreApiError {
  return new CoreApiError(statusCode, code, fields, extra)
}

/** Standalone apiError for worker and core modules without H3 dependency */
export function apiError(
  statusCode: number,
  code: ApiErrorCode,
  fields?: Record<string, string>,
  extra?: ApiErrorExtra,
): CoreApiError {
  return createCoreError(statusCode, code, fields, extra)
}

/** A database failure that carries only the SQLSTATE. */
export class RepositoryError extends Error {
  readonly code: string | undefined
  constructor(scope: string, code?: string | null) {
    super(scope)
    this.name = 'RepositoryError'
    this.code = typeof code === 'string' ? code : undefined
  }
}

interface ZodIssueLike {
  path: PropertyKey[]
  message: string
}

/**
 * Turns zod issues into `ApiErrorData.fields` (first message per key wins).
 */
export function zodFields(
  error: { issues: readonly ZodIssueLike[] },
  input?: unknown,
): Record<string, string> {
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
    else if (typeof head === 'string') {
      key = head
    }
    else {
      key = String(head)
    }

    if (!fields[key]) {
      fields[key] = issue.message
    }
  }
  return fields
}
