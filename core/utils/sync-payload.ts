/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FarmSnapshotPayload {
  deviceId: string
  farmSettings?: { name?: string, eggsPerTray?: number, currency?: string }
  sizes?: Array<{ id: string, name: string, sortOrder: number, colorSlot: number, archivedAt?: string | null }>
  clients?: Array<{ id: string, name: string, phone?: string | null, defaultPrice?: number | null, archivedAt?: string | null, version?: number }>
  production?: Array<{ id: string, producedOn: string, sizeId?: string | null, quality: 'good' | 'reject', eggs: number }>
  orders?: Array<{ id: string, orderNumber: string | number, clientId: string, orderDate: string, wantedBy?: string | null, status: string, cancelledAt?: string | null, closedShortAt?: string | null, convertedFromSaleNumber?: string | number | null, version?: number }>
  orderLines?: Array<{ orderId: string, sizeId: string, eggs: number, pricePerTray: number, lineTotal: number, droppedEggs?: number }>
  sales?: Array<{ id: string, saleNumber: string | number, clientId?: string | null, type: 'delivery' | 'on_site', saleDate: string, orderId?: string | null, orderNumber?: string | number | null, version?: number, voidedAt?: string | null }>
  saleLines?: Array<{ saleId: string, sizeId: string, eggs: number, pricePerTray: number, lineTotal: number }>
  localCounters?: Array<{ id: string, nextNumber: number }>
}

/**
 * Normalizes raw SQLite WASM export data (snake_case columns and farmSettings: [ ... ] array)
 * into canonical camelCase FarmSnapshotPayload expected by server/api/sync/snapshot.post.ts
 * and server/db/adapter.ts.
 *
 * Preserves data that is already in camelCase cleanly (idempotent / non-destructive).
 */
export function normalizeFarmSnapshot(raw: any): FarmSnapshotPayload {
  const r = raw ?? {}

  // 1. Resolve raw farmSettings (can be array from SQLite query or object)
  const rawFarmSettings = r.farmSettings ?? r.farm_settings
  const firstFs = Array.isArray(rawFarmSettings) ? rawFarmSettings[0] : rawFarmSettings

  // 2. deviceId: from raw.deviceId or raw.farmSettings[0]?.device_id or 'D1'
  const deviceId = (
    r.deviceId
    || r.device_id
    || firstFs?.device_id
    || firstFs?.deviceId
    || 'D1'
  )

  const payload: FarmSnapshotPayload = { deviceId }

  // 3. farmSettings: if array, extracts index 0; maps farm_name / farmName / name -> name,
  // eggs_per_tray / eggsPerTray -> eggsPerTray (number), currency
  if (rawFarmSettings) {
    const fs = firstFs
    if (fs && typeof fs === 'object') {
      const name = fs.name ?? fs.farmName ?? fs.farm_name
      const rawEggs = fs.eggsPerTray ?? fs.eggs_per_tray
      const eggsPerTray = rawEggs !== undefined && rawEggs !== null ? Number(rawEggs) : undefined
      const currency = fs.currency

      const fsObj: { name?: string, eggsPerTray?: number, currency?: string } = {}
      if (name !== undefined && name !== null) fsObj.name = String(name)
      if (eggsPerTray !== undefined && !Number.isNaN(eggsPerTray)) fsObj.eggsPerTray = eggsPerTray
      if (currency !== undefined && currency !== null) fsObj.currency = String(currency)

      payload.farmSettings = fsObj
    }
  }

  // 4. sizes: maps sort_order -> sortOrder, color_slot -> colorSlot, archived_at -> archivedAt
  const rawSizes = r.sizes
  if (Array.isArray(rawSizes)) {
    payload.sizes = rawSizes.map((s: any) => ({
      id: String(s.id),
      name: String(s.name),
      sortOrder: Number(s.sortOrder ?? s.sort_order ?? 0),
      colorSlot: Number(s.colorSlot ?? s.color_slot ?? 0),
      archivedAt: s.archivedAt !== undefined
        ? s.archivedAt
        : (s.archived_at !== undefined ? s.archived_at : null),
    }))
  }

  // 5. clients: maps default_price -> defaultPrice, archived_at -> archivedAt, version
  const rawClients = r.clients
  if (Array.isArray(rawClients)) {
    payload.clients = rawClients.map((c: any) => {
      let defaultPrice: number | null = null
      const rawPrice = c.defaultPrice !== undefined ? c.defaultPrice : c.default_price
      if (rawPrice !== undefined && rawPrice !== null) {
        defaultPrice = Number(rawPrice)
      }

      return {
        id: String(c.id),
        name: String(c.name),
        phone: c.phone !== undefined ? c.phone : null,
        defaultPrice,
        archivedAt: c.archivedAt !== undefined
          ? c.archivedAt
          : (c.archived_at !== undefined ? c.archived_at : null),
        version: c.version !== undefined ? Number(c.version) : 1,
      }
    })
  }

  // 6. production: maps produced_on -> producedOn, size_id -> sizeId, quality, eggs
  const rawProduction = r.production
  if (Array.isArray(rawProduction)) {
    payload.production = rawProduction.map((p: any) => ({
      id: String(p.id),
      producedOn: String(p.producedOn ?? p.produced_on),
      sizeId: p.quality === 'reject'
        ? null
        : (p.sizeId !== undefined ? p.sizeId : (p.size_id !== undefined ? p.size_id : null)),
      quality: p.quality as 'good' | 'reject',
      eggs: Number(p.eggs ?? 0),
    }))
  }

  // 7. orders: maps order_number -> orderNumber, client_id -> clientId, order_date -> orderDate,
  // wanted_by -> wantedBy, cancelled_at -> cancelledAt, closed_short_at -> closedShortAt,
  // converted_from_sale_number -> convertedFromSaleNumber, version
  const rawOrders = r.orders
  if (Array.isArray(rawOrders)) {
    payload.orders = rawOrders.map((o: any) => ({
      id: String(o.id),
      orderNumber: o.orderNumber ?? o.order_number,
      clientId: String(o.clientId ?? o.client_id),
      orderDate: String(o.orderDate ?? o.order_date),
      wantedBy: o.wantedBy !== undefined
        ? o.wantedBy
        : (o.wanted_by !== undefined ? o.wanted_by : null),
      status: o.status ?? 'requested',
      cancelledAt: o.cancelledAt !== undefined
        ? o.cancelledAt
        : (o.cancelled_at !== undefined ? o.cancelled_at : null),
      closedShortAt: o.closedShortAt !== undefined
        ? o.closedShortAt
        : (o.closed_short_at !== undefined ? o.closed_short_at : null),
      convertedFromSaleNumber: o.convertedFromSaleNumber !== undefined
        ? o.convertedFromSaleNumber
        : (o.converted_from_sale_number !== undefined ? o.converted_from_sale_number : null),
      version: o.version !== undefined ? Number(o.version) : 1,
    }))
  }

  // 8. orderLines: maps order_id -> orderId, size_id -> sizeId, eggs, price_per_tray -> pricePerTray,
  // line_total -> lineTotal, dropped_eggs -> droppedEggs
  const rawOrderLines = r.orderLines ?? r.order_lines
  if (Array.isArray(rawOrderLines)) {
    payload.orderLines = rawOrderLines.map((ol: any) => ({
      orderId: String(ol.orderId ?? ol.order_id),
      sizeId: String(ol.sizeId ?? ol.size_id),
      eggs: Number(ol.eggs ?? 0),
      pricePerTray: Number(ol.pricePerTray ?? ol.price_per_tray ?? 0),
      lineTotal: Number(ol.lineTotal ?? ol.line_total ?? 0),
      droppedEggs: ol.droppedEggs !== undefined
        ? Number(ol.droppedEggs)
        : (ol.dropped_eggs !== undefined ? Number(ol.dropped_eggs) : 0),
    }))
  }

  // 9. sales: maps sale_number -> saleNumber, client_id -> clientId, type, sale_date -> saleDate,
  // order_id -> orderId, order_number -> orderNumber, voided_at -> voidedAt, version
  const rawSales = r.sales
  if (Array.isArray(rawSales)) {
    payload.sales = rawSales.map((s: any) => ({
      id: String(s.id),
      saleNumber: s.saleNumber ?? s.sale_number,
      clientId: s.clientId !== undefined
        ? s.clientId
        : (s.client_id !== undefined ? s.client_id : null),
      type: s.type as 'delivery' | 'on_site',
      saleDate: String(s.saleDate ?? s.sale_date),
      orderId: s.orderId !== undefined
        ? s.orderId
        : (s.order_id !== undefined ? s.order_id : null),
      orderNumber: s.orderNumber !== undefined
        ? s.orderNumber
        : (s.order_number !== undefined ? s.order_number : null),
      version: s.version !== undefined ? Number(s.version) : 1,
      voidedAt: s.voidedAt !== undefined
        ? s.voidedAt
        : (s.voided_at !== undefined ? s.voided_at : null),
    }))
  }

  // 10. saleLines: maps sale_id -> saleId, size_id -> sizeId, eggs, price_per_tray -> pricePerTray,
  // line_total -> lineTotal
  const rawSaleLines = r.saleLines ?? r.sale_lines
  if (Array.isArray(rawSaleLines)) {
    payload.saleLines = rawSaleLines.map((sl: any) => ({
      saleId: String(sl.saleId ?? sl.sale_id),
      sizeId: String(sl.sizeId ?? sl.size_id),
      eggs: Number(sl.eggs ?? 0),
      pricePerTray: Number(sl.pricePerTray ?? sl.price_per_tray ?? 0),
      lineTotal: Number(sl.lineTotal ?? sl.line_total ?? 0),
    }))
  }

  // 11. localCounters: maps id, next_number -> nextNumber
  const rawLocalCounters = r.localCounters ?? r.local_counters
  if (Array.isArray(rawLocalCounters)) {
    payload.localCounters = rawLocalCounters.map((lc: any) => ({
      id: String(lc.id),
      nextNumber: Number(lc.nextNumber ?? lc.next_number ?? 1),
    }))
  }

  return payload
}

/**
 * Normalizes client outbox mutation payloads into the exact p_* parameter shape
 * expected by dispatchRpc in server/db/adapter.ts.
 */
export function normalizeMutationForRpc(
  mutationType: string,
  payload: Record<string, any> = {},
): Record<string, any> {
  const p = payload ?? {}

  switch (mutationType) {
    case 'log_production':
    case 'replace_production_day':
      return {
        p_submission_id: p.submissionId || p.id,
        p_day: p.date || p.day,
        p_size_ids: p.good ? p.good.map((g: any) => g.sizeId) : p.sizeIds,
        p_eggs: p.good ? p.good.map((g: any) => g.eggs) : p.eggs,
        p_rejects: p.rejects ?? 0,
      }

    case 'create_sale':
    case 'update_sale':
      return {
        p_sale_id: p.id || p.saleId || p.sale_id,
        p_submission_id: p.submissionId || p.id || p.saleId,
        p_type: p.type,
        p_sale_date: p.saleDate,
        p_client_id: p.clientId ?? null,
        p_version: p.version ?? 1,
        p_size_ids: p.lines ? p.lines.map((l: any) => l.sizeId) : p.sizeIds,
        p_eggs: p.lines ? p.lines.map((l: any) => l.eggs) : p.eggs,
        p_prices: p.lines ? p.lines.map((l: any) => l.pricePerTray) : p.prices,
        p_sale_number: p.saleNumber,
        p_confirm_shortfall: true,
      }

    case 'create_order':
    case 'update_order':
      return {
        p_order_id: p.id || p.orderId,
        p_submission_id: p.submissionId || p.id || p.orderId,
        p_client_id: p.clientId,
        p_order_date: p.orderDate,
        p_wanted_by: p.wantedBy ?? null,
        p_version: p.version ?? 1,
        p_size_ids: p.lines ? p.lines.map((l: any) => l.sizeId) : p.sizeIds,
        p_eggs: p.lines ? p.lines.map((l: any) => l.eggs) : p.eggs,
        p_prices: p.lines ? p.lines.map((l: any) => l.pricePerTray) : p.prices,
        p_order_number: p.orderNumber,
      }

    case 'add_client':
    case 'update_client':
      return {
        p_client_id: p.id || p.clientId,
        p_submission_id: p.submissionId || p.id || p.clientId,
        p_name: p.name,
        p_phone: p.phone ?? null,
        p_default_price: p.defaultPrice ?? null,
        p_version: p.version ?? 1,
      }

    case 'archive_client':
      return {
        p_client_id: p.id || p.clientId,
      }

    case 'restore_client':
      return {
        p_client_id: p.id || p.clientId,
      }

    case 'add_size':
    case 'rename_size': {
      const res: Record<string, any> = {
        p_size_id: p.id || p.sizeId,
        p_name: p.name,
        p_default_price: p.defaultPrice ?? null,
      }
      if (p.submissionId) {
        res.p_submission_id = p.submissionId
      }
      return res
    }

    case 'archive_size':
      return {
        p_size_id: p.id || p.sizeId,
      }

    case 'restore_size':
      return {
        p_size_id: p.id || p.sizeId,
      }

    case 'update_farm_settings':
      return {
        p_farm_name: p.farmName,
        p_eggs_per_tray: p.eggsPerTray,
        p_currency: p.currency,
      }

    case 'delete_production_day':
      return {
        p_day: p.date || p.day,
      }

    case 'void_sale':
      return {
        p_sale_id: p.id || p.saleId,
        p_version: p.version ?? 1,
      }

    case 'cancel_order':
      return {
        p_order_id: p.id || p.orderId,
      }

    case 'close_order':
      return {
        p_order_id: p.id || p.orderId,
        p_version: p.version ?? 1,
      }

    case 'set_order_status':
      return {
        p_order_id: p.id || p.orderId,
        p_status: p.status,
      }

    case 'deliver_order':
      return {
        p_sale_id: p.saleId || p.sale_id,
        p_submission_id: p.submissionId,
        p_order_id: p.id || p.orderId,
        p_delivered_date: p.deliveredDate || p.date,
        p_size_ids: p.lines ? p.lines.map((l: any) => l.sizeId) : p.sizeIds,
        p_eggs: p.lines ? p.lines.map((l: any) => l.eggs) : p.eggs,
        p_confirm_shortfall: true,
        p_sale_number: p.saleNumber,
      }

    case 'reorder_sizes':
      return {
        p_size_ids: p.order || p.sizeIds,
      }

    default:
      return p
  }
}
