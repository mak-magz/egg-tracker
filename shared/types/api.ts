// Shared API contract (docs/features/00-project-scaffold.md §3.4). The frontend builds against these
// exact shapes; change them only together with the feature doc.

export type ApiErrorCode = 'unauthenticated' | 'no_farm' | 'validation_failed' | 'not_found' | 'internal'

/**
 * The `data` payload of every error our server routes throw:
 * `createError({ statusCode, statusMessage, data: ApiErrorData })`.
 * On the client, read it from `FetchError.data.data` (Nitro nests `data` inside the error body).
 */
export interface ApiErrorData {
  code: ApiErrorCode
  /** Per-field messages when `code === 'validation_failed'`. */
  fields?: Record<string, string>
}

export interface FarmSummary {
  id: string
  name: string
  /** Per-farm setting (>= 1). Never hardcode 30 in the app; read it from here. */
  eggsPerTray: number
}

/** `GET /api/me`. `farm` is null when the signed-in user has no farm membership (AC12). */
export interface MeResponse {
  email: string
  farm: FarmSummary | null
}
