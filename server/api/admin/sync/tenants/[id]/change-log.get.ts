import { getQuery, getRouterParam } from 'h3'
import { z } from 'zod'
import { getTenantChangeLog } from '../../../../../repositories/admin-sync'
import { apiError, zodFields } from '../../../../../utils/errors'
import { defineAdminHandler } from '../../../../../utils/handlers'

const changeLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  entityType: z.string().trim().min(1).optional(),
  deviceId: z.string().trim().min(1).optional(),
})

export default defineAdminHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'validation_failed')

  const rawQuery = getQuery(event)
  const parsed = changeLogQuerySchema.safeParse(rawQuery)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawQuery))
  }

  return await getTenantChangeLog(id, parsed.data)
})
