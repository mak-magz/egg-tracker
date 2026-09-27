// Clients repository (docs/features/03-clients.md §3.3 "Repository and server utils").
// Every write is ONE security invoker Postgres function called through TenantDb.rpc, which sets p_tenant_id from the
// server context (never from input). Each function returns only the id it changed; the repository then re-reads that
// ONE row through the one mapper (`toClient`), so there is one `Client` shape in the code.
//
// PERSONAL DATA (AC29): names, phones and prices never reach a log or an error body by accident. Raw PostgREST errors
// carry values (a 23505 detail holds the key, a 23514 detail the whole failing row, a 22P02 quotes the input), so this
// file NEVER logs an error object, `message`, `details` or `hint`: `internalError` logs `[clients] <scope> <SQLSTATE>`
// and throws a bare 500. The only places a name leaves this file are `existing.name` (409 name_taken) and `client`
// (409 client_changed), both read BY ID for the signed-in owner of the same farm (owner decision, §3.9 point 1).
import type { PostgrestError } from '@supabase/supabase-js'
import type { H3Error } from 'h3'
import { z } from 'zod'
import { CLIENT_FIELDS, CLIENT_MESSAGES } from '../../shared/constants/clients'
import type {
  AddClientRequest,
  AddClientResponse,
  ApiErrorData,
  Client,
  ClientChangeResponse,
  NameMatch,
  UpdateClientRequest,
} from '../../shared/types/api'
import type { Database } from '../../shared/types/database.types'
import type { TenantDb, TenantRpcArgs } from '../utils/db'
import { apiError } from '../utils/errors'

/** Which function raised, so an error shared by several (TM005, PGRST102) lands on the right field. */
export type ClientOperation = 'add' | 'update' | 'archive' | 'restore'

type ClientRow = Pick<Database['public']['Tables']['clients']['Row'], 'id' | 'name' | 'phone' | 'default_price' | 'archived_at' | 'version'>

const CLIENT_COLUMNS = 'id, name, phone, default_price, archived_at, version'

/** The server's copy for a submission id reused with another payload (no value in it: AC29). */
const SUBMISSION_REUSED = 'This request was already used with different details. Try again.'

const addResultSchema = z.object({ clientId: z.string(), replayed: z.boolean() })
const changeResultSchema = z.object({ clientId: z.string(), changed: z.boolean() })
// TM020's DETAIL is {"id","archived"} only; whatever else a database put there is stripped, never read.
const nameMatchDetailSchema = z.object({ id: z.string() })
const existingRowSchema = z.object({ id: z.string(), name: z.string(), archived_at: z.string().nullable() })

/** The error type mapClientDbError reads: only `code` (and `hint` / `details` for the field choice and TM020's id). */
export type ClientDbError = Pick<PostgrestError, 'code'> & { message?: string, details?: string | null, hint?: string | null }

/** Logs the SQLSTATE and the place, never the error object (AC29), and returns a bare 500. */
function internalError(scope: string, code?: string | null): H3Error<ApiErrorData> {
  console.error(`[clients] ${scope} ${typeof code === 'string' ? code : 'unknown'}`)
  return apiError(500, 'internal')
}

function parseResult<T>(scope: string, schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw internalError(`unexpected ${scope} result`)
  return parsed.data
}

/** The ONE mapper: a database row to the API's `Client`. `default_price` is a JSON number from PostgREST. */
export function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    defaultPrice: row.default_price === null ? null : Number(row.default_price),
    active: row.archived_at === null,
    version: Number(row.version),
  }
}

/**
 * ALL of the farm's clients, active and inactive, in a deterministic order (name, then id) that is NOT the display
 * order: sorting and searching are done in the browser by shared/utils/client-list.ts (D7).
 */
export async function listClients(db: TenantDb): Promise<Client[]> {
  const { data, error } = await db.scoped('clients').select(CLIENT_COLUMNS).order('name').order('id')
  if (error) throw internalError('list failed', error.code)
  return ((data ?? []) as unknown as ClientRow[]).map(toClient)
}

/** One client of this farm by id, or null (not found, or another farm's: the same answer). Throws on a database error. */
async function readClient(db: TenantDb, id: string): Promise<Client | null> {
  const { data, error } = await db.scoped('clients').select(CLIENT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw internalError('read failed', error.code)
  return data ? toClient(data as unknown as ClientRow) : null
}

/** The current client, or undefined when that read fails too (the screen then refreshes on its own). */
async function currentClientOrUndefined(db: TenantDb, id: string | undefined): Promise<Client | undefined> {
  if (!id) return undefined
  try {
    return (await readClient(db, id)) ?? undefined
  }
  catch {
    return undefined
  }
}

/** The clashing client, read BY ID (TM020's detail has an id and no name). Undefined when anything about it fails. */
async function existingByDetail(db: TenantDb, details: string | null | undefined): Promise<NameMatch | undefined> {
  if (!details) return undefined
  let id: string
  try {
    const parsed = nameMatchDetailSchema.safeParse(JSON.parse(details))
    if (!parsed.success) return undefined
    id = parsed.data.id
  }
  catch {
    return undefined
  }
  try {
    const { data, error } = await db.scoped('clients').select('id, name, archived_at').eq('id', id).maybeSingle()
    if (error || !data) return undefined
    const row = existingRowSchema.safeParse(data)
    return row.success ? { id: row.data.id, name: row.data.name, archived: row.data.archived_at !== null } : undefined
  }
  catch {
    return undefined
  }
}

function nameMessage(hint: string | null | undefined): string {
  if (hint === 'too_long') return CLIENT_MESSAGES.nameTooLong
  if (hint === 'invalid') return CLIENT_MESSAGES.nameInvalid
  return CLIENT_MESSAGES.nameBlank
}

function phoneMessage(hint: string | null | undefined): string {
  return hint === 'too_long' ? CLIENT_MESSAGES.phoneTooLong : CLIENT_MESSAGES.phoneInvalid
}

function priceMessage(hint: string | null | undefined): string {
  if (hint === 'not_positive') return CLIENT_MESSAGES.priceNotPositive
  if (hint === 'too_large') return CLIENT_MESSAGES.priceTooLargeServer
  if (hint === 'too_many_decimals') return CLIENT_MESSAGES.priceTooManyDecimals
  return CLIENT_MESSAGES.priceNotANumber
}

/**
 * Maps the functions' (and the M12 trigger's) SQLSTATEs (§3.1 table) to API errors. Async because TM020 reads the
 * clashing client's name and status BY ID, and TM022 reads the current client (`clientId`); if either read fails the
 * error is thrown WITHOUT `existing` / `client` (the form then shows the generic message and the screen refreshes on
 * its own). Nothing from `message` is ever used. Returns the error; callers `throw` it.
 */
export async function mapClientDbError(
  db: TenantDb,
  error: ClientDbError,
  operation?: ClientOperation,
  clientId?: string,
): Promise<H3Error<ApiErrorData>> {
  switch (error.code) {
    case 'TM017': // name blank, too long or with a hidden character (the route's schema normally catches this first)
      return apiError(400, 'validation_failed', { [CLIENT_FIELDS.name]: nameMessage(error.hint) })
    case 'TM018':
      return apiError(400, 'validation_failed', { [CLIENT_FIELDS.phone]: phoneMessage(error.hint) })
    case 'TM019':
      return apiError(400, 'validation_failed', { [CLIENT_FIELDS.defaultPrice]: priceMessage(error.hint) })
    case 'TM020': { // another client has the name: the server's own message carries no value (AC29)
      const existing = await existingByDetail(db, error.details)
      const fields = { [CLIENT_FIELDS.name]: CLIENT_MESSAGES.nameTakenServer }
      return existing
        ? apiError(409, 'conflict', fields, { reason: 'name_taken', existing })
        : apiError(409, 'conflict', fields, { reason: 'name_taken' })
    }
    case 'TM021': // 500 clients already (AC33)
      return apiError(409, 'conflict', undefined, { reason: 'client_limit' })
    case 'TM022': { // the version isn't the one the form was opened with (AC19)
      const client = await currentClientOrUndefined(db, clientId)
      return client
        ? apiError(409, 'conflict', undefined, { reason: 'client_changed', client })
        : apiError(409, 'conflict', undefined, { reason: 'client_changed' })
    }
    case 'TM023': // not one of this farm's clients (another farm's id looks exactly the same: AC28)
      return apiError(404, 'not_found')
    case 'TM024': // a submission id reused with another payload
      return apiError(400, 'validation_failed', { [CLIENT_FIELDS.submissionId]: SUBMISSION_REUSED })
    case 'TM005': // malformed input (null ids or version); the route's schema normally catches this first
      return apiError(400, 'validation_failed', {
        [operation === 'add' ? CLIENT_FIELDS.submissionId : operation === 'update' ? CLIENT_FIELDS.version : CLIENT_FIELDS.id]: CLIENT_MESSAGES.changedElsewhere,
      })
    // Defence in depth for text Postgres or PostgREST can't take (U+0000, a lone surrogate): the shared schema
    // refuses these first, so this only runs if a request got past it. Only the name-carrying calls can cause it.
    case '22P05': // untranslatable_character (\u0000 cannot be converted to text)
    case '22021': // character_not_in_repertoire (invalid byte sequence)
    case 'PGRST102': // PostgREST: invalid request body (lone surrogate in the JSON)
      if (operation === 'add' || operation === 'update') {
        return apiError(400, 'validation_failed', { [CLIENT_FIELDS.name]: CLIENT_MESSAGES.nameInvalid })
      }
      return internalError('database error', error.code)
    case 'TM006': // p_tenant_id disagrees with the session: only a server bug can cause this
    case 'TM025': // id or tenant_id changed: unreachable from our routes
    case 'TM026': // the ledger is full: unreachable from our routes
    default: // includes the 23505 / 23514 backstops (the functions check first, under the lock)
      return internalError('database error', error.code)
  }
}

/** Only the keys that are set: supabase-js types an optional rpc argument as `?: string`, not `string | null`. */
function optionalArgs(phone: string | null | undefined, defaultPrice: number | null | undefined): { p_phone?: string, p_default_price?: number } {
  const args: { p_phone?: string, p_default_price?: number } = {}
  if (phone !== null && phone !== undefined) args.p_phone = phone
  if (defaultPrice !== null && defaultPrice !== undefined) args.p_default_price = defaultPrice
  return args
}

/** Re-reads the changed client. It must exist (the function just wrote or found it); anything else is a server error. */
async function respondWithClient(db: TenantDb, clientId: string): Promise<Client> {
  const client = await readClient(db, clientId)
  if (!client) throw internalError('changed client not found')
  return client
}

/** Adds a client. Idempotent per submissionId: a replay returns the first client with `replayed: true` (AC15). */
export async function addClient(db: TenantDb, input: AddClientRequest): Promise<AddClientResponse> {
  const args: TenantRpcArgs<'add_client'> = {
    p_submission_id: input.submissionId,
    p_name: input.name,
    ...optionalArgs(input.phone, input.defaultPrice),
  }
  const { data, error } = await db.rpc('add_client', args)
  if (error) throw await mapClientDbError(db, error, 'add')
  const result = parseResult('add_client', addResultSchema, data)
  return { client: await respondWithClient(db, result.clientId), replayed: result.replayed }
}

/** Replaces a client's name, phone and default price (null clears one). `changed: false` when there was nothing to do. */
export async function updateClient(db: TenantDb, id: string, input: UpdateClientRequest): Promise<ClientChangeResponse> {
  const args: TenantRpcArgs<'update_client'> = {
    p_client_id: id,
    p_version: input.version,
    p_name: input.name,
    ...optionalArgs(input.phone, input.defaultPrice),
  }
  const { data, error } = await db.rpc('update_client', args)
  if (error) throw await mapClientDbError(db, error, 'update', id)
  const result = parseResult('update_client', changeResultSchema, data)
  return { client: await respondWithClient(db, result.clientId), changed: result.changed }
}

/** Marks a client inactive. Always allowed. Already inactive is `changed: false`. */
export async function archiveClient(db: TenantDb, id: string): Promise<ClientChangeResponse> {
  const { data, error } = await db.rpc('archive_client', { p_client_id: id })
  if (error) throw await mapClientDbError(db, error, 'archive', id)
  const result = parseResult('archive_client', changeResultSchema, data)
  return { client: await respondWithClient(db, result.clientId), changed: result.changed }
}

/** Marks a client active again. Already active is `changed: false`. */
export async function restoreClient(db: TenantDb, id: string): Promise<ClientChangeResponse> {
  const { data, error } = await db.rpc('restore_client', { p_client_id: id })
  if (error) throw await mapClientDbError(db, error, 'restore', id)
  const result = parseResult('restore_client', changeResultSchema, data)
  return { client: await respondWithClient(db, result.clientId), changed: result.changed }
}
