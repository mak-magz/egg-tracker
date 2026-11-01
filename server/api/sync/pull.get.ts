import { getQuery } from 'h3'
import { z } from 'zod'
import { pullSyncChanges } from '../../repositories/sync'
import { apiError, zodFields } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

const syncPullQuerySchema = z.object({
  sinceVersion: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  excludeDeviceId: z.string().optional(),
})

export default defineTenantHandler(async (event, ctx) => {
  const rawQuery = getQuery(event)
  const parsed = syncPullQuerySchema.safeParse(rawQuery)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawQuery))
  }

  const result = await pullSyncChanges(ctx.db, parsed.data)
  return result
})
