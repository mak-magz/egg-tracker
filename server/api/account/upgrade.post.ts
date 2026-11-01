import { readBody } from 'h3'
import { z } from 'zod'
import { findMembershipWithFarm } from '../../repositories/memberships'
import { provisionTenantFarm } from '../../services/provision'
import { apiError, zodFields } from '../../utils/errors'
import { defineAuthedHandler } from '../../utils/handlers'

const upgradeAccountSchema = z.object({
  farmName: z.string().trim().min(1, 'Farm name is required').max(100, 'Farm name must be 100 characters or less'),
  currency: z.string().trim().length(3).optional(),
  eggsPerTray: z.number().int().min(1).max(100).optional(),
  inviteCode: z.string().optional(),
})

export default defineAuthedHandler(async (event, ctx) => {
  // If user already has an active farm membership, return it idempotently
  const existing = await findMembershipWithFarm(ctx.userId)
  if (existing) {
    return {
      farm: existing.farm,
    }
  }

  const rawBody = await readBody(event)
  const parsed = upgradeAccountSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  const { farmName, currency, eggsPerTray } = parsed.data

  await provisionTenantFarm({
    farmName,
    currency,
    eggsPerTray,
    ownerEmail: ctx.email,
    ownerUid: ctx.userId,
  })

  const freshMembership = await findMembershipWithFarm(ctx.userId)
  if (!freshMembership) {
    throw apiError(500, 'internal')
  }

  return {
    farm: freshMembership.farm,
  }
})
