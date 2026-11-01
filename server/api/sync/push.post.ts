import { readBody } from 'h3'
import { z } from 'zod'
import { applySyncPush } from '../../repositories/sync'
import { apiError, zodFields } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

const syncPushRequestSchema = z.object({
  deviceId: z.string().min(1),
  mutations: z.array(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    payload: z.record(z.string(), z.any()),
    occurredAt: z.string(),
  })),
})

export default defineTenantHandler(async (event, ctx) => {
  const rawBody = await readBody(event)
  const parsed = syncPushRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  const result = await applySyncPush(ctx.db, parsed.data)
  return result
})
