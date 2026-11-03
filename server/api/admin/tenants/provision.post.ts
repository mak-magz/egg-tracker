import { randomBytes } from 'node:crypto'
import { readBody } from 'h3'
import { z } from 'zod'
import { provisionTenantFarm } from '../../../services/provision'
import { recordAdminAuditLog } from '../../../repositories/admin-audit'
import { apiError, zodFields } from '../../../utils/errors'
import { defineAdminHandler } from '../../../utils/handlers'
import { getFirebaseAdminAuth } from '../../../utils/auth'

const provisionSchema = z.object({
  farmName: z.string().trim().min(1).max(100),
  ownerEmail: z.string().trim().email(),
  tier: z.enum(['free', 'premium']).default('premium'),
  eggsPerTray: z.number().int().min(1).max(100).default(30),
  currency: z.string().trim().length(3).default('PHP'),
  initialPassword: z.string().min(8).optional(),
})

export default defineAdminHandler(async (event, ctx) => {
  const rawBody = await readBody(event)
  const parsed = provisionSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  const { farmName, ownerEmail, tier, eggsPerTray, currency } = parsed.data
  const initialPassword = parsed.data.initialPassword || `${randomBytes(9).toString('base64').slice(0, 12)}!1`

  const adminAuth = getFirebaseAdminAuth()
  let uid: string
  try {
    const existing = await adminAuth.getUserByEmail(ownerEmail)
    uid = existing.uid
  }
  catch {
    const created = await adminAuth.createUser({
      email: ownerEmail,
      password: initialPassword,
      emailVerified: true,
    })
    uid = created.uid
  }

  const result = await provisionTenantFarm({
    farmName,
    ownerEmail,
    ownerUid: uid,
    eggsPerTray,
    currency,
  })

  await recordAdminAuditLog({
    operatorEmail: ctx.email,
    actionType: 'tenant_provision',
    targetId: result.tenantId,
    summary: `Provisioned farm ${farmName} (${tier}) for ${ownerEmail}`,
    details: { tenantId: result.tenantId, farmName, tier, ownerEmail },
  })

  return {
    tenant: {
      id: result.tenantId,
      name: farmName,
      tier,
      eggsPerTray,
      currency,
      dbUrl: result.dbUrl,
    },
    owner: {
      userId: uid,
      email: ownerEmail,
      generatedPassword: parsed.data.initialPassword ? undefined : initialPassword,
    },
  }
})
