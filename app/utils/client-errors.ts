// Maps a failed /api/clients call to the few kinds the Clients screen has copy for (feature 03 §3.4).
// Pure; tests import it directly. 401 is already handled by $api (session-expired flow). Same shape and style
// as size-errors.ts. Nothing here ever builds a message from a typed value (AC29): it carries the server's own
// field messages and the OTHER client's row, and the form and page pick the copy.
import type { ApiErrorData, Client, NameMatch } from '#shared/types/api'
import { CLIENT_FIELDS } from '#shared/constants/clients'
import { isNetworkError } from './auth-errors'

export type ClientErrorKind
  = | 'network' // no response, a timeout or a gateway error: "Couldn't save. Check your connection..."
    | 'invalid' // 400 on name / phone / price: show `fields` on the fields
    | 'name_taken' // 409: another client has the name (`existing`, inactive or not)
    | 'limit' // 409: the farm already has 500 clients
    | 'changed' // 409 client_changed, or a bad id/version: the client changed elsewhere
    | 'not_found' // 404: the id isn't one of this farm's clients
    | 'unknown'

export interface ClientError {
  kind: ClientErrorKind
  /** Server field messages, for `invalid` and `name_taken`. */
  fields?: Record<string, string>
  /** For `name_taken`: the client that already has the name. Absent when the server's lookup failed. */
  existing?: NameMatch
  /** For `changed`: the client as it is NOW, when the server sent it. Absent: reload the list yourself. */
  client?: Client
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

export function mapClientError(e: unknown): ClientError {
  const status = statusOf(e)
  if (status === undefined && isNetworkError(e)) return { kind: 'network' }
  // A gateway error with no body looks like "couldn't connect" to the owner too.
  if (status === 502 || status === 503 || status === 504) return { kind: 'network' }

  const data = apiDataOf(e)

  if (status === 404) return { kind: 'not_found' }

  if (status === 409) {
    if (data?.reason === 'name_taken') {
      return { kind: 'name_taken', ...(data.fields ? { fields: data.fields } : {}), ...(data.existing ? { existing: data.existing } : {}) }
    }
    if (data?.reason === 'client_limit') return { kind: 'limit' }
    if (data?.reason === 'client_changed') return { kind: 'changed', ...(data.client ? { client: data.client } : {}) }
    return { kind: 'unknown' }
  }

  if (status === 400) {
    const fields = data?.fields ?? {}
    // A bad id or version means the client the form was opened on is out of date (the server says the same).
    if (fields[CLIENT_FIELDS.version] !== undefined || fields[CLIENT_FIELDS.id] !== undefined) return { kind: 'changed' }
    return { kind: 'invalid', fields }
  }

  return { kind: 'unknown' }
}
