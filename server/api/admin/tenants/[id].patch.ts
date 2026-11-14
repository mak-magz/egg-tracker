import { getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { updateAdminTenantSettings } from '../../../repositories/admin-tenants'
import { apiError, zodFields } from '../../../utils/errors'
import { defineAdminHandler } from '../../../utils/handlers'

const patchTenantSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  tier: z.enum(['free', 'premium']).optional(),
  eggsPerTray: z.number().int().min(1).max(100).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
})

export default defineAdminHandler(async (event, ctx) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw apiError(400, 'validation_failed')

  const rawBody = await readBody(event)
  const parsed = patchTenantSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  return await updateAdminTenantSettings(id, parsed.data, ctx.email)
})
