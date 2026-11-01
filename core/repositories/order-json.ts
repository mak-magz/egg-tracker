// The order JSON the M20 functions return (app.order_json) and its one mapper to the API types. Shared by
// repositories/orders.ts and repositories/sales.ts (a void response carries the recomputed order, AC35), so neither
// imports the other. Orders carry `clientId` only, never a client's name or phone (AC53, AC54).
import { z } from 'zod'
import type { Order, OrderDetail } from '../../shared/types/api'

const orderLineJsonSchema = z.object({
  sizeId: z.string(),
  orderedEggs: z.number(),
  deliveredEggs: z.number(),
  remainingEggs: z.number(),
  droppedEggs: z.number(),
  pricePerTray: z.number(),
  lineTotal: z.number(),
})

const deliveryJsonSchema = z.object({
  saleId: z.string(),
  saleNumber: z.union([z.number(), z.string()]),
  deliveredDate: z.string(),
  voidedAt: z.string().nullable(),
  lines: z.array(z.object({ sizeId: z.string(), eggs: z.number() })),
})

export const orderJsonSchema = z.object({
  id: z.string(),
  orderNumber: z.union([z.number(), z.string()]),
  clientId: z.string(),
  orderDate: z.string(),
  wantedBy: z.string().nullable(),
  status: z.enum(['requested', 'confirmed', 'ready', 'partially_fulfilled', 'fulfilled', 'cancelled']),
  closedShortAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  convertedFromSaleNumber: z.union([z.number(), z.string()]).nullable(),
  lines: z.array(orderLineJsonSchema),
  orderTotal: z.number(),
  deliveryCount: z.number(),
  voidedDeliveryCount: z.number(),
  version: z.number(),
})

export const orderDetailJsonSchema = orderJsonSchema.extend({ deliveries: z.array(deliveryJsonSchema) })

export type OrderJson = z.infer<typeof orderJsonSchema>
export type OrderDetailJson = z.infer<typeof orderDetailJsonSchema>

/** The ONE mapper: a database jsonb row (already camelCase, already the API shape) to `Order`. */
export function toOrder(row: OrderJson): Order {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    clientId: row.clientId,
    orderDate: row.orderDate,
    wantedBy: row.wantedBy,
    status: row.status,
    closedShortAt: row.closedShortAt,
    cancelledAt: row.cancelledAt,
    convertedFromSaleNumber: row.convertedFromSaleNumber,
    lines: row.lines.map(l => ({
      sizeId: l.sizeId,
      orderedEggs: l.orderedEggs,
      deliveredEggs: l.deliveredEggs,
      remainingEggs: l.remainingEggs,
      droppedEggs: l.droppedEggs,
      pricePerTray: l.pricePerTray,
      lineTotal: l.lineTotal,
    })),
    orderTotal: row.orderTotal,
    deliveryCount: row.deliveryCount,
    voidedDeliveryCount: row.voidedDeliveryCount,
    version: row.version,
  }
}

/** `Order` plus its deliveries (newest first, voided ones included and marked). */
export function toOrderDetail(row: OrderDetailJson): OrderDetail {
  return {
    ...toOrder(row),
    deliveries: row.deliveries.map(d => ({
      saleId: d.saleId,
      saleNumber: d.saleNumber,
      deliveredDate: d.deliveredDate,
      voidedAt: d.voidedAt,
      lines: d.lines.map(l => ({ sizeId: l.sizeId, eggs: l.eggs })),
    })),
  }
}
