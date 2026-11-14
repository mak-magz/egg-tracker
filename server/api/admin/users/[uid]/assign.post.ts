import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { assignUserToFarm } from '../../../../repositories/admin-users'
import { apiError, zodFields } from '../../../../utils/errors'
import { defineAdminHandler } from '../../../../utils/handlers'

const assignSchema = z.object({
  tenantId: z.string().min(1),
})

export default defineAdminHandler(async (event, ctx) => {
  const uid = getRouterParam(event, 'uid')
  if (!uid) throw apiError(400, 'validation_failed')

  const rawBody = await readBody(event)
  const parsed = assignSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  return await assignUserToFarm(uid, parsed.data.tenantId, ctx.email)
})
