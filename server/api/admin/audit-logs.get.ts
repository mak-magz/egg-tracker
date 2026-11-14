import { getQuery } from 'h3'
import { z } from 'zod'
import { listAdminAuditLogs } from '../../repositories/admin-audit'
import { apiError, zodFields } from '../../utils/errors'
import { defineAdminHandler } from '../../utils/handlers'

const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  query: z.string().trim().optional(),
})

export default defineAdminHandler(async (event) => {
  const rawQuery = getQuery(event)
  const parsed = auditLogsQuerySchema.safeParse(rawQuery)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawQuery))
  }

  return await listAdminAuditLogs(parsed.data)
})
