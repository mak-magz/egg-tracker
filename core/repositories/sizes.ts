// Sizes repository (docs/features/02-farm-settings.md §3.3 "Repository and server utils").
// Every write is ONE security invoker function called through TenantDb.rpc, which sets p_tenant_id from
// the context (never from input). The functions return only what they changed; every write then re-reads
// the whole list through the same mapper /api/me uses, so there is one list shape and one order in the code.
import { z } from 'zod'
import { SIZE_FIELDS, SIZE_MESSAGES } from '../../shared/constants/sizes'
import type {
  AddSizeRequest,
  FarmSize,
  ReorderSizesRequest,
  SizeChangeResponse,
  SizeNameMatch,
} from '../../shared/types/api'
import type { DbError, TenantDb } from '../db/tenant-db'
import { apiError } from '../errors'
import { toFarmSizes } from './tenants'

/** Which function raised, so an error shared by several (TM005) lands on the right field. */
export type SizeOperation = 'add' | 'rename' | 'reorder' | 'archive' | 'restore'

const SIZE_COLUMNS = 'id, name, sort_order, color_slot, archived_at'

/** Fallbacks when the database detail can't be read (TM009) or has no better copy (TM013). */
const NAME_TAKEN_FALLBACK = 'Another size already has this name.'
const SUBMISSION_REUSED = 'This request was already used with a different name. Try again.'

const changedIdSchema = z.object({ changedId: z.string() })
const addResultSchema = z.object({ changedId: z.string(), replayed: z.boolean() })
const reorderResultSchema = z.object({ changed: z.boolean() })
const nameMatchSchema = z.object({ id: z.string(), name: z.string(), archived: z.boolean() })

function internalError(scope: string, code?: string | null) {
  console.error(`[sizes] ${scope} ${typeof code === 'string' ? code : 'unknown'}`)
  return apiError(500, 'internal')
}

function parseResult<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw internalError('unexpected function result')
  return parsed.data
}

/** The farm's sizes, all of them (active first, then archived), through the mapper `/api/me` uses. */
export async function listSizes(db: TenantDb): Promise<FarmSize[]> {
  const { data, error } = await db.scoped('sizes').select(SIZE_COLUMNS)
  if (error) throw internalError('list failed', error.code)
  return toFarmSizes(data as unknown as Parameters<typeof toFarmSizes>[0])
}

/** The current list, or undefined when that read fails too (the client then refreshes on its own). */
async function currentSizesOrUndefined(db: TenantDb): Promise<FarmSize[] | undefined> {
  try {
    return await listSizes(db)
  }
  catch {
    return undefined
  }
}

function parseNameMatch(details: string | null | undefined): SizeNameMatch | undefined {
  if (!details) return undefined
  try {
    const parsed = nameMatchSchema.safeParse(JSON.parse(details))
    return parsed.success ? parsed.data : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Maps the functions' (and the triggers') SQLSTATEs to API errors.
 */
export async function mapSizeDbError(
  db: TenantDb,
  error: Pick<DbError, 'code' | 'message'> & { details?: string | null },
  operation?: SizeOperation,
) {
  switch (error.code) {
    case 'TM008':
      return apiError(400, 'validation_failed', { [SIZE_FIELDS.name]: SIZE_MESSAGES.nameBlank })
    case 'TM009': {
      const existing = parseNameMatch(error.details)
      if (!existing) return apiError(409, 'conflict', { [SIZE_FIELDS.name]: NAME_TAKEN_FALLBACK }, { reason: 'name_taken' })
      const message = existing.archived ? SIZE_MESSAGES.nameArchived(existing.name) : SIZE_MESSAGES.nameTaken(existing.name)
      return apiError(409, 'conflict', { [SIZE_FIELDS.name]: message }, { reason: 'name_taken', existing })
    }
    case 'TM010':
      return apiError(409, 'conflict', undefined, { reason: 'last_active_size', sizes: await currentSizesOrUndefined(db) })
    case 'TM011':
      return apiError(404, 'not_found', undefined, { sizes: await currentSizesOrUndefined(db) })
    case 'TM012':
      return apiError(409, 'conflict', undefined, { reason: 'sizes_changed', sizes: await currentSizesOrUndefined(db) })
    case 'TM013':
      return apiError(400, 'validation_failed', { [SIZE_FIELDS.submissionId]: SUBMISSION_REUSED })
    case 'TM015':
      return apiError(400, 'validation_failed', { [SIZE_FIELDS.name]: SIZE_MESSAGES.tooMany })
    case 'TM005':
      return apiError(400, 'validation_failed', {
        [operation === 'add' ? SIZE_FIELDS.submissionId : SIZE_FIELDS.order]: SIZE_MESSAGES.changedElsewhere,
      })
    case '22P05':
    case '22021':
    case 'PGRST102':
      if (operation === undefined || operation === 'add' || operation === 'rename') {
        return apiError(400, 'validation_failed', { [SIZE_FIELDS.name]: SIZE_MESSAGES.nameInvalid })
      }
      return internalError('database error', error.code)
    case 'TM006':
    case 'TM014':
    default:
      return internalError('database error', error.code)
  }
}

async function respond(db: TenantDb, changedId: string): Promise<SizeChangeResponse> {
  return { sizes: await listSizes(db), changedId }
}

export async function addSize(db: TenantDb, input: AddSizeRequest): Promise<SizeChangeResponse> {
  const { data, error } = await db.rpc('add_size', { p_submission_id: input.submissionId, p_name: input.name })
  if (error) throw await mapSizeDbError(db, error, 'add')
  return respond(db, parseResult(addResultSchema, data).changedId)
}

export async function renameSize(db: TenantDb, id: string, name: string): Promise<SizeChangeResponse> {
  const { data, error } = await db.rpc('rename_size', { p_size_id: id, p_name: name })
  if (error) throw await mapSizeDbError(db, error, 'rename')
  return respond(db, parseResult(changedIdSchema, data).changedId)
}

export async function reorderSizes(db: TenantDb, input: ReorderSizesRequest): Promise<SizeChangeResponse> {
  const { data, error } = await db.rpc('reorder_sizes', { p_size_ids: input.order })
  if (error) throw await mapSizeDbError(db, error, 'reorder')
  parseResult(reorderResultSchema, data)
  return respond(db, input.sizeId)
}

export async function archiveSize(db: TenantDb, id: string): Promise<SizeChangeResponse> {
  const { data, error } = await db.rpc('archive_size', { p_size_id: id })
  if (error) throw await mapSizeDbError(db, error, 'archive')
  return respond(db, parseResult(changedIdSchema, data).changedId)
}

export async function restoreSize(db: TenantDb, id: string): Promise<SizeChangeResponse> {
  const { data, error } = await db.rpc('restore_size', { p_size_id: id })
  if (error) throw await mapSizeDbError(db, error, 'restore')
  return respond(db, parseResult(changedIdSchema, data).changedId)
}
