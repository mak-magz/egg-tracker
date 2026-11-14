import { readBody } from 'h3'
import { z } from 'zod'
import { runBatchMigrations } from '../../../repositories/admin-migrations'
import { apiError, zodFields } from '../../../utils/errors'
import { defineAdminHandler } from '../../../utils/handlers'

const runAllSchema = z.object({
  tenantIds: z.array(z.string()).optional(),
})

export default defineAdminHandler(async (event, ctx) => {
  const rawBody = await readBody(event)
  const parsed = runAllSchema.safeParse(rawBody || {})
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  return await runBatchMigrations(parsed.data.tenantIds, ctx.email)
})
