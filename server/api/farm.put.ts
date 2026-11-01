import { readBody } from 'h3'
import { onboardingSchema } from '../../shared/schemas/onboarding'
import { updateFarmSettings } from '../repositories/tenants'
import { apiError, zodFields } from '../utils/errors'
import { defineTenantHandler } from '../utils/handlers'

export default defineTenantHandler(async (event, ctx) => {
  const rawBody = await readBody(event)
  const parsed = onboardingSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  const farm = await updateFarmSettings(ctx.db, parsed.data)
  return { success: true, farm }
})
