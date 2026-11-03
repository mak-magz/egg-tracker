import { readBody } from 'h3'
import { z } from 'zod'
import { runSingleTenantMigration } from '../../../repositories/admin-migrations'
import { apiError, zodFields } from '../../../utils/errors'
import { defineAdminHandler } from '../../../utils/handlers'

const runSingleSchema = z.object({
  tenantId: z.string().min(1),
})

export default defineAdminHandler(async (event, ctx) => {
  const rawBody = await readBody(event)
  const parsed = runSingleSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  const res = await runSingleTenantMigration(parsed.data.tenantId, ctx.email)
  if (!res.success) {
    throw apiError(500, 'internal', undefined, undefined)
  }
  return res
})
