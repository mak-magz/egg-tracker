import { readBody } from 'h3'
import { z } from 'zod'
import { normalizeFarmSnapshot } from '../../../core/utils/sync-payload'
import { applyFarmSnapshot } from '../../repositories/sync'
import { apiError, zodFields } from '../../utils/errors'
import { defineTenantHandler } from '../../utils/handlers'

export const farmSnapshotSchema = z.object({
  deviceId: z.string().default('D1'),
  farmSettings: z.object({
    name: z.string().optional(),
    eggsPerTray: z.number().optional(),
    currency: z.string().optional(),
  }).optional(),
  sizes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    sortOrder: z.number(),
    colorSlot: z.number(),
    archivedAt: z.string().nullable().optional(),
  })).optional().default([]),
  clients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    phone: z.string().nullable().optional(),
    defaultPrice: z.number().nullable().optional(),
    archivedAt: z.string().nullable().optional(),
    version: z.number().optional().default(1),
  })).optional().default([]),
  production: z.array(z.object({
    id: z.string(),
    producedOn: z.string(),
    sizeId: z.string().nullable().optional(),
    quality: z.enum(['good', 'reject']),
    eggs: z.number(),
  })).optional().default([]),
  productionSubmissions: z.array(z.object({
    id: z.string(),
    producedOn: z.string(),
    hadBefore: z.union([z.boolean(), z.number()]).optional().default(false),
  })).optional().default([]),
  orders: z.array(z.object({
    id: z.string(),
    orderNumber: z.union([z.number(), z.string()]),
    clientId: z.string(),
    orderDate: z.string(),
    wantedBy: z.string().nullable().optional(),
    status: z.string().default('requested'),
    cancelledAt: z.string().nullable().optional(),
    closedShortAt: z.string().nullable().optional(),
    convertedFromSaleNumber: z.union([z.number(), z.string()]).nullable().optional(),
    version: z.number().optional().default(1),
  })).optional().default([]),
  orderLines: z.array(z.object({
    orderId: z.string(),
    sizeId: z.string(),
    eggs: z.number(),
    pricePerTray: z.number(),
    lineTotal: z.number(),
    droppedEggs: z.number().optional().default(0),
  })).optional().default([]),
  sales: z.array(z.object({
    id: z.string(),
    saleNumber: z.union([z.number(), z.string()]),
    clientId: z.string().nullable().optional(),
    type: z.enum(['delivery', 'on_site']),
    saleDate: z.string(),
    orderId: z.string().nullable().optional(),
    orderNumber: z.union([z.number(), z.string()]).nullable().optional(),
    version: z.number().optional().default(1),
    voidedAt: z.string().nullable().optional(),
  })).optional().default([]),
  saleLines: z.array(z.object({
    saleId: z.string(),
    sizeId: z.string(),
    eggs: z.number(),
    pricePerTray: z.number(),
    lineTotal: z.number(),
  })).optional().default([]),
  localCounters: z.array(z.object({
    id: z.string(),
    nextNumber: z.number(),
  })).optional().default([]),
})

export default defineTenantHandler(async (event, ctx) => {
  const rawBody = await readBody(event)
  const normalized = normalizeFarmSnapshot(rawBody)
  const parsed = farmSnapshotSchema.safeParse(normalized)
  if (!parsed.success) {
    throw apiError(400, 'validation_failed', zodFields(parsed.error, rawBody))
  }

  const result = await applyFarmSnapshot(ctx.db, parsed.data)
  return result
})
