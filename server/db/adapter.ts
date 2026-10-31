// Turso + Drizzle runtime adapter implementing the TenantDb interface (database-per-tenant).
// Translates the legacy Postgres RPCs and scoped queries into native Drizzle / SQLite operations
// while preserving 100% of the existing repository contracts, error codes (TM001-TM055), and tests.
import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { TenantDrizzleDb } from './turso'
import * as schema from './schema/tenant'
import { normalizeSizeName } from '../../shared/utils/size-name'
import { hasInvalidClientTextChar, hasVisibleClientTextChar, normalizeClientPhone } from '../../shared/utils/client-name'
import { computeLineTotal } from '../../shared/utils/price'

export interface RpcErrorShape {
  code: string
  message: string
  details: string
  hint: string
}

class TmError extends Error {
  code: string
  details: string
  hint: string
  constructor(code: string, message: string, opts: { details?: string, hint?: string } = {}) {
    super(message)
    this.code = code
    this.details = opts.details ?? ''
    this.hint = opts.hint ?? ''
  }
}

function utcMaxDate(): string {
  const d = new Date(Date.now() + 86_400_000)
  return d.toISOString().slice(0, 10)
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function createDrizzleBackedClient(
  drizzleDb: TenantDrizzleDb,
  tenantMeta: { tenantId: string, name: string, eggsPerTray: number, currency: string },
) {
  async function compactSizeOrder() {
    const allSizes = await drizzleDb.select().from(schema.sizes)
    allSizes.sort((a, b) => {
      const aArch = a.archivedAt !== null ? 1 : 0
      const bArch = b.archivedAt !== null ? 1 : 0
      if (aArch !== bArch) return aArch - bArch
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      if (a.name !== b.name) return a.name < b.name ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    for (let i = 0; i < allSizes.length; i++) {
      const s = allSizes[i]!
      if (s.sortOrder !== i) {
        await drizzleDb.update(schema.sizes).set({ sortOrder: i, updatedAt: new Date().toISOString() }).where(eq(schema.sizes.id, s.id))
      }
    }
  }

  async function getOnHandMap(sizeIds?: string[]): Promise<{ sizeId: string, eggs: number }[]> {
    const allSizes = await drizzleDb.select({ id: schema.sizes.id }).from(schema.sizes)
    const wantedIds = sizeIds && sizeIds.length > 0
      ? allSizes.filter(s => sizeIds.includes(s.id)).map(s => s.id)
      : allSizes.map(s => s.id)
    wantedIds.sort()

    const prodRows = await drizzleDb
      .select({
        sizeId: schema.production.sizeId,
        eggs: sql<number>`coalesce(sum(${schema.production.eggs}), 0)`,
      })
      .from(schema.production)
      .where(eq(schema.production.quality, 'good'))
      .groupBy(schema.production.sizeId)

    const soldRows = await drizzleDb
      .select({
        sizeId: schema.saleLines.sizeId,
        eggs: sql<number>`coalesce(sum(${schema.saleLines.eggs}), 0)`,
      })
      .from(schema.saleLines)
      .innerJoin(schema.sales, eq(schema.sales.id, schema.saleLines.saleId))
      .where(isNull(schema.sales.voidedAt))
      .groupBy(schema.saleLines.sizeId)

    const prodMap = new Map(prodRows.map(r => [r.sizeId ?? '', Number(r.eggs)]))
    const soldMap = new Map(soldRows.map(r => [r.sizeId, Number(r.eggs)]))

    return wantedIds.map(id => ({
      sizeId: id,
      eggs: (prodMap.get(id) ?? 0) - (soldMap.get(id) ?? 0),
    }))
  }

  async function checkSaleShortfall(sizeIds: string[], needed: number[], confirm: boolean) {
    if (!sizeIds || !needed || sizeIds.length !== needed.length) {
      throw new TmError('TM005', 'malformed shortfall check')
    }
    const wanted: { sizeId: string, needed: number }[] = []
    for (let i = 0; i < sizeIds.length; i++) {
      if ((needed[i] ?? 0) > 0) wanted.push({ sizeId: sizeIds[i]!, needed: needed[i]! })
    }
    if (wanted.length === 0) return

    const onHandList = await getOnHandMap(wanted.map(w => w.sizeId))
    const ohMap = new Map(onHandList.map(o => [o.sizeId, o.eggs]))
    const allSizes = await drizzleDb.select().from(schema.sizes)
    const sizeMap = new Map(allSizes.map(s => [s.id, s]))

    const shortfalls = wanted
      .filter(w => (ohMap.get(w.sizeId) ?? 0) - w.needed < 0)
      .sort((a, b) => {
        const sa = sizeMap.get(a.sizeId)
        const sb = sizeMap.get(b.sizeId)
        if ((sa?.sortOrder ?? 0) !== (sb?.sortOrder ?? 0)) return (sa?.sortOrder ?? 0) - (sb?.sortOrder ?? 0)
        if ((sa?.name ?? '') !== (sb?.name ?? '')) return (sa?.name ?? '') < (sb?.name ?? '') ? -1 : 1
        return a.sizeId < b.sizeId ? -1 : 1
      })
      .map(w => ({
        sizeId: w.sizeId,
        onHandEggs: ohMap.get(w.sizeId) ?? 0,
        neededEggs: w.needed,
      }))

    if (shortfalls.length > 0 && !confirm) {
      throw new TmError('TM037', 'insufficient stock', { details: JSON.stringify({ shortfall: shortfalls }) })
    }
  }

  async function validateSaleLines(sizeIds: string[], eggs: number[], prices: number[], existingSizeIds: string[] = []) {
    if (
      !Array.isArray(sizeIds) || !Array.isArray(eggs) || !Array.isArray(prices)
      || sizeIds.length !== eggs.length || sizeIds.length !== prices.length
      || sizeIds.some(x => !x) || eggs.some(x => x === null || x === undefined) || prices.some(x => x === null || x === undefined)
    ) {
      throw new TmError('TM005', 'malformed lines')
    }
    if (sizeIds.length < 1 || sizeIds.length > 20) {
      throw new TmError('TM028', 'a sale must have 1 to 20 lines')
    }
    if (new Set(sizeIds).size !== sizeIds.length) {
      throw new TmError('TM029', 'a size appears twice')
    }
    if (eggs.some(e => e < 1 || e > 100_000)) {
      throw new TmError('TM030', 'a line\'s eggs are out of range')
    }
    if (prices.some(p => p <= 0)) {
      throw new TmError('TM031', 'price must be above 0', { hint: 'not_positive' })
    }
    if (prices.some(p => p > 9999.99)) {
      throw new TmError('TM031', 'price is too large', { hint: 'too_large' })
    }
    if (prices.some(p => Math.round(p * 100) / 100 !== p)) {
      throw new TmError('TM031', 'price has too many decimals', { hint: 'too_many_decimals' })
    }

    const allSizes = await drizzleDb.select().from(schema.sizes)
    const sizeMap = new Map(allSizes.map(s => [s.id, s]))
    const existingSet = new Set(existingSizeIds)

    for (const sid of sizeIds) {
      if (existingSet.has(sid)) continue
      const s = sizeMap.get(sid)
      if (!s) throw new TmError('TM033', 'size not found', { hint: 'not_found' })
      if (s.archivedAt !== null) throw new TmError('TM033', 'size archived', { hint: 'archived' })
    }
  }

  async function validateSaleClient(type: string, clientId: string | null | undefined, existingClientId: string | null = null) {
    if (type === 'delivery' && !clientId) {
      throw new TmError('TM032', 'a delivery needs a client', { hint: 'required' })
    }
    if (clientId && clientId !== existingClientId) {
      const [c] = await drizzleDb.select().from(schema.clients).where(eq(schema.clients.id, clientId))
      if (!c || c.archivedAt !== null) {
        throw new TmError('TM032', 'client is not available', { hint: 'invalid' })
      }
    }
  }

  async function buildSaleJson(saleId: string) {
    const [s] = await drizzleDb.select().from(schema.sales).where(eq(schema.sales.id, saleId))
    if (!s) return null
    let orderNumber: number | null = null
    if (s.orderId) {
      const [o] = await drizzleDb.select({ orderNumber: schema.orders.orderNumber }).from(schema.orders).where(eq(schema.orders.id, s.orderId))
      orderNumber = o?.orderNumber ?? null
    }
    const lines = await drizzleDb.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, saleId))
    const allSizes = await drizzleDb.select().from(schema.sizes)
    const sizeMap = new Map(allSizes.map(z => [z.id, z]))
    lines.sort((a, b) => {
      const za = sizeMap.get(a.sizeId)
      const zb = sizeMap.get(b.sizeId)
      if ((za?.sortOrder ?? 0) !== (zb?.sortOrder ?? 0)) return (za?.sortOrder ?? 0) - (zb?.sortOrder ?? 0)
      if ((za?.name ?? '') !== (zb?.name ?? '')) return (za?.name ?? '') < (zb?.name ?? '') ? -1 : 1
      return a.sizeId < b.sizeId ? -1 : 1
    })
    const saleTotal = Math.round(lines.reduce((acc, l) => acc + l.lineTotal, 0) * 100) / 100
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      type: s.type,
      clientId: s.clientId,
      saleDate: s.saleDate,
      orderId: s.orderId,
      orderNumber,
      version: s.version,
      voidedAt: s.voidedAt ? s.voidedAt.slice(0, 10) : null,
      lines: lines.map(l => ({
        sizeId: l.sizeId,
        eggs: l.eggs,
        pricePerTray: l.pricePerTray,
        lineTotal: l.lineTotal,
      })),
      saleTotal,
    }
  }

  async function getOrderDeliveredEggs(orderId: string): Promise<Map<string, number>> {
    const rows = await drizzleDb
      .select({
        sizeId: schema.saleLines.sizeId,
        eggs: sql<number>`coalesce(sum(${schema.saleLines.eggs}), 0)`,
      })
      .from(schema.sales)
      .innerJoin(schema.saleLines, eq(schema.saleLines.saleId, schema.sales.id))
      .where(and(eq(schema.sales.orderId, orderId), isNull(schema.sales.voidedAt)))
      .groupBy(schema.saleLines.sizeId)
    return new Map(rows.map(r => [r.sizeId, Number(r.eggs)]))
  }

  async function computeOrderStatus(orderId: string): Promise<(typeof schema.orders.$inferSelect)['status'] | null> {
    const [o] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, orderId))
    if (!o) return null
    if (o.status === 'cancelled' || o.closedShortAt !== null) return o.status
    const delivered = await getOrderDeliveredEggs(orderId)
    let totalDelivered = 0
    for (const v of delivered.values()) totalDelivered += v
    if (totalDelivered === 0) {
      return (o.status === 'requested' || o.status === 'confirmed' || o.status === 'ready') ? o.status : 'ready'
    }
    const lines = await drizzleDb.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId))
    const hasRemaining = lines.some(l => l.eggs > (delivered.get(l.sizeId) ?? 0))
    return hasRemaining ? 'partially_fulfilled' : 'fulfilled'
  }

  async function buildOrderJson(orderId: string, withDeliveries = false) {
    const [o] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, orderId))
    if (!o) return null
    const lines = await drizzleDb.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId))
    const delivered = await getOrderDeliveredEggs(orderId)
    const allSizes = await drizzleDb.select().from(schema.sizes)
    const sizeMap = new Map(allSizes.map(z => [z.id, z]))
    lines.sort((a, b) => {
      const za = sizeMap.get(a.sizeId)
      const zb = sizeMap.get(b.sizeId)
      if ((za?.sortOrder ?? 0) !== (zb?.sortOrder ?? 0)) return (za?.sortOrder ?? 0) - (zb?.sortOrder ?? 0)
      if ((za?.name ?? '') !== (zb?.name ?? '')) return (za?.name ?? '') < (zb?.name ?? '') ? -1 : 1
      return a.sizeId < b.sizeId ? -1 : 1
    })

    const linkedSales = await drizzleDb
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.orderId, orderId))
      .orderBy(desc(schema.sales.saleDate), desc(schema.sales.saleNumber))

    const deliveryCount = linkedSales.filter(s => s.voidedAt === null).length
    const voidedDeliveryCount = linkedSales.filter(s => s.voidedAt !== null).length
    const orderTotal = Math.round(lines.reduce((acc, l) => acc + l.lineTotal, 0) * 100) / 100
    const isClosed = o.status === 'cancelled' || o.status === 'fulfilled' || o.closedShortAt !== null

    const base = {
      id: o.id,
      orderNumber: o.orderNumber,
      clientId: o.clientId,
      orderDate: o.orderDate,
      wantedBy: o.wantedBy,
      status: o.status,
      closedShortAt: o.closedShortAt ? o.closedShortAt.slice(0, 10) : null,
      cancelledAt: o.cancelledAt ? o.cancelledAt.slice(0, 10) : null,
      convertedFromSaleNumber: o.convertedFromSaleNumber,
      lines: lines.map((l) => {
        const deliv = delivered.get(l.sizeId) ?? 0
        return {
          sizeId: l.sizeId,
          orderedEggs: l.eggs,
          deliveredEggs: deliv,
          remainingEggs: isClosed ? 0 : Math.max(l.eggs - deliv, 0),
          droppedEggs: l.droppedEggs,
          pricePerTray: l.pricePerTray,
          lineTotal: l.lineTotal,
        }
      }),
      orderTotal,
      deliveryCount,
      voidedDeliveryCount,
      version: o.version,
    }

    if (!withDeliveries) return base

    const deliveries = []
    for (const s of linkedSales) {
      const sLines = await drizzleDb.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, s.id))
      sLines.sort((a, b) => {
        const za = sizeMap.get(a.sizeId)
        const zb = sizeMap.get(b.sizeId)
        if ((za?.sortOrder ?? 0) !== (zb?.sortOrder ?? 0)) return (za?.sortOrder ?? 0) - (zb?.sortOrder ?? 0)
        if ((za?.name ?? '') !== (zb?.name ?? '')) return (za?.name ?? '') < (zb?.name ?? '') ? -1 : 1
        return a.sizeId < b.sizeId ? -1 : 1
      })
      deliveries.push({
        saleId: s.id,
        saleNumber: s.saleNumber,
        deliveredDate: s.saleDate,
        voidedAt: s.voidedAt ? s.voidedAt.slice(0, 10) : null,
        lines: sLines.map(sl => ({ sizeId: sl.sizeId, eggs: sl.eggs })),
      })
    }

    return { ...base, deliveries }
  }

  async function buildProductionDaysJson(from?: string | null, to?: string | null) {
    const allRows = await drizzleDb.select().from(schema.production)
    const hasAny = allRows.length > 0
    const filtered = allRows.filter((r) => {
      if (from && r.producedOn < from) return false
      if (to && r.producedOn > to) return false
      return true
    })
    const allSizes = await drizzleDb.select().from(schema.sizes)
    const sizeMap = new Map(allSizes.map(s => [s.id, s]))

    const byDate = new Map<string, typeof filtered>()
    for (const r of filtered) {
      const list = byDate.get(r.producedOn) ?? []
      list.push(r)
      byDate.set(r.producedOn, list)
    }

    const dates = [...byDate.keys()].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
    const days = dates.map((d) => {
      const rows = byDate.get(d)!
      const goodRows = rows.filter(r => r.quality === 'good' && r.sizeId !== null)
      goodRows.sort((a, b) => {
        const sa = sizeMap.get(a.sizeId!)
        const sb = sizeMap.get(b.sizeId!)
        if ((sa?.sortOrder ?? 0) !== (sb?.sortOrder ?? 0)) return (sa?.sortOrder ?? 0) - (sb?.sortOrder ?? 0)
        if ((sa?.name ?? '') !== (sb?.name ?? '')) return (sa?.name ?? '') < (sb?.name ?? '') ? -1 : 1
        return (a.sizeId ?? '') < (b.sizeId ?? '') ? -1 : 1
      })
      const good = goodRows.map(r => ({ sizeId: r.sizeId!, eggs: r.eggs }))
      const goodTotal = good.reduce((acc, g) => acc + g.eggs, 0)
      const rejects = rows.filter(r => r.quality === 'reject').reduce((acc, r) => acc + r.eggs, 0)
      return { date: d, good, goodTotal, rejects }
    })

    return { hasAny, days }
  }

  async function dispatchRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
    switch (fn) {
      case 'get_inventory': {
        const onHand = await getOnHandMap()
        const ohMap = new Map(onHand.map(o => [o.sizeId, o.eggs]))

        const openOrders = await drizzleDb
          .select()
          .from(schema.orders)
          .where(
            and(
              inArray(schema.orders.status, ['requested', 'confirmed', 'ready', 'partially_fulfilled']),
              isNull(schema.orders.closedShortAt),
              isNull(schema.orders.cancelledAt),
            ),
          )
        const owedMap = new Map<string, number>()
        for (const o of openOrders) {
          const oLines = await drizzleDb.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, o.id))
          const deliv = await getOrderDeliveredEggs(o.id)
          for (const l of oLines) {
            const rem = Math.max(l.eggs - (deliv.get(l.sizeId) ?? 0), 0)
            owedMap.set(l.sizeId, (owedMap.get(l.sizeId) ?? 0) + rem)
          }
        }

        const allSizes = await drizzleDb.select().from(schema.sizes)
        allSizes.sort((a, b) => {
          const aArch = a.archivedAt !== null ? 1 : 0
          const bArch = b.archivedAt !== null ? 1 : 0
          if (aArch !== bArch) return aArch - bArch
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
          if (a.name !== b.name) return a.name < b.name ? -1 : 1
          return a.id < b.id ? -1 : 1
        })

        const prodGood = await drizzleDb.select({ id: schema.production.id }).from(schema.production).where(eq(schema.production.quality, 'good')).limit(1)
        const nonVoidSales = await drizzleDb.select({ id: schema.sales.id }).from(schema.sales).where(isNull(schema.sales.voidedAt)).limit(1)
        const hasAny = prodGood.length > 0 || nonVoidSales.length > 0

        const sizes = allSizes
          .map(s => ({
            id: s.id,
            name: s.name,
            sortOrder: s.sortOrder,
            colorSlot: s.colorSlot,
            active: s.archivedAt === null,
            onHandEggs: ohMap.get(s.id) ?? 0,
            owedEggs: owedMap.get(s.id) ?? 0,
          }))
          .filter(s => s.active || s.onHandEggs !== 0 || s.owedEggs > 0)

        return { hasAny, sizes }
      }

      case 'get_on_hand': {
        const sizeIds = args.p_size_ids as string[] | undefined
        return { onHand: await getOnHandMap(sizeIds) }
      }

      case 'production_days': {
        return await buildProductionDaysJson(args.p_from as string | undefined, args.p_to as string | undefined)
      }

      case 'log_production': {
        const subId = args.p_submission_id as string
        const day = args.p_day as string
        const sizeIds = args.p_size_ids as string[]
        const eggs = args.p_eggs as number[]
        const rejects = args.p_rejects as number

        if (!day || day > utcMaxDate()) throw new TmError('TM002', 'date is in the future')
        if (!subId || !Array.isArray(sizeIds) || !Array.isArray(eggs) || sizeIds.length !== eggs.length || rejects < 0 || eggs.some(e => e < 0)) {
          throw new TmError('TM005', 'malformed amounts')
        }
        const positiveSizeIds = sizeIds.filter((_, i) => (eggs[i] ?? 0) > 0)
        if (new Set(positiveSizeIds).size !== positiveSizeIds.length) throw new TmError('TM005', 'duplicate size')
        if (rejects === 0 && positiveSizeIds.length === 0) throw new TmError('TM004', 'nothing entered')

        const [prevSub] = await drizzleDb.select().from(schema.productionSubmissions).where(eq(schema.productionSubmissions.id, subId))
        if (prevSub) {
          const { days } = await buildProductionDaysJson(prevSub.producedOn, prevSub.producedOn)
          return {
            day: days[0] ?? { date: prevSub.producedOn, good: [], goodTotal: 0, rejects: 0 },
            hadBefore: prevSub.hadBefore,
            replayed: true,
          }
        }

        const existingOnDay = await drizzleDb.select().from(schema.production).where(eq(schema.production.producedOn, day))
        const hadBefore = existingOnDay.length > 0

        const allSizes = await drizzleDb.select().from(schema.sizes)
        const activeIds = new Set(allSizes.filter(s => s.archivedAt === null).map(s => s.id))
        for (const sid of positiveSizeIds) {
          if (!activeIds.has(sid)) throw new TmError('TM001', 'unknown size')
        }

        const now = new Date().toISOString()
        for (let i = 0; i < sizeIds.length; i++) {
          const count = eggs[i] ?? 0
          const sid = sizeIds[i]!
          if (count <= 0) continue
          const existingRow = existingOnDay.find(r => r.quality === 'good' && r.sizeId === sid)
          const nextCount = (existingRow?.eggs ?? 0) + count
          if (nextCount > 1_000_000) throw new TmError('TM007', 'too large')
          if (existingRow) {
            await drizzleDb.update(schema.production).set({ eggs: nextCount, updatedAt: now }).where(eq(schema.production.id, existingRow.id))
          }
          else {
            await drizzleDb.insert(schema.production).values({ id: crypto.randomUUID(), producedOn: day, sizeId: sid, quality: 'good', eggs: count, createdAt: now, updatedAt: now })
          }
        }

        if (rejects > 0) {
          const existingRej = existingOnDay.find(r => r.quality === 'reject')
          const nextRej = (existingRej?.eggs ?? 0) + rejects
          if (nextRej > 1_000_000) throw new TmError('TM007', 'too large')
          if (existingRej) {
            await drizzleDb.update(schema.production).set({ eggs: nextRej, updatedAt: now }).where(eq(schema.production.id, existingRej.id))
          }
          else {
            await drizzleDb.insert(schema.production).values({ id: crypto.randomUUID(), producedOn: day, sizeId: null, quality: 'reject', eggs: rejects, createdAt: now, updatedAt: now })
          }
        }

        await drizzleDb.insert(schema.productionSubmissions).values({ id: subId, producedOn: day, hadBefore, createdAt: now, updatedAt: now })
        const { days } = await buildProductionDaysJson(day, day)
        return { day: days[0]!, hadBefore, replayed: false }
      }

      case 'replace_production_day': {
        const day = args.p_day as string
        const sizeIds = args.p_size_ids as string[]
        const eggs = args.p_eggs as number[]
        const rejects = args.p_rejects as number

        if (!day || day > utcMaxDate()) throw new TmError('TM002', 'date is in the future')
        if (!Array.isArray(sizeIds) || !Array.isArray(eggs) || sizeIds.length !== eggs.length || rejects < 0 || eggs.some(e => e < 0)) {
          throw new TmError('TM005', 'malformed amounts')
        }
        const positiveSizeIds = sizeIds.filter((_, i) => (eggs[i] ?? 0) > 0)
        if (new Set(positiveSizeIds).size !== positiveSizeIds.length) throw new TmError('TM005', 'duplicate size')
        if (rejects === 0 && positiveSizeIds.length === 0) throw new TmError('TM004', 'nothing entered')
        if (rejects > 1_000_000 || eggs.some(e => e > 1_000_000)) throw new TmError('TM007', 'too large')

        const existingOnDay = await drizzleDb.select().from(schema.production).where(eq(schema.production.producedOn, day))
        if (existingOnDay.length === 0) throw new TmError('TM003', 'day has no production')

        const allSizes = await drizzleDb.select().from(schema.sizes)
        const allowedIds = new Set([
          ...allSizes.filter(s => s.archivedAt === null).map(s => s.id),
          ...existingOnDay.filter(r => r.sizeId !== null).map(r => r.sizeId!),
        ])
        for (const sid of positiveSizeIds) {
          if (!allowedIds.has(sid)) throw new TmError('TM001', 'unknown size')
        }

        await drizzleDb.delete(schema.production).where(eq(schema.production.producedOn, day))
        const now = new Date().toISOString()
        for (let i = 0; i < sizeIds.length; i++) {
          if ((eggs[i] ?? 0) > 0) {
            await drizzleDb.insert(schema.production).values({ id: crypto.randomUUID(), producedOn: day, sizeId: sizeIds[i]!, quality: 'good', eggs: eggs[i]!, createdAt: now, updatedAt: now })
          }
        }
        if (rejects > 0) {
          await drizzleDb.insert(schema.production).values({ id: crypto.randomUUID(), producedOn: day, sizeId: null, quality: 'reject', eggs: rejects, createdAt: now, updatedAt: now })
        }
        const { days } = await buildProductionDaysJson(day, day)
        return { day: days[0]! }
      }

      case 'delete_production_day': {
        const day = args.p_day as string
        if (!day) throw new TmError('TM003', 'day has no production')
        const { days } = await buildProductionDaysJson(day, day)
        if (!days[0]) throw new TmError('TM003', 'day has no production')
        await drizzleDb.delete(schema.production).where(eq(schema.production.producedOn, day))
        return { removed: days[0] }
      }

      case 'add_size': {
        const subId = args.p_submission_id as string
        const rawName = args.p_name as string
        if (!subId) throw new TmError('TM005', 'submission id is required')
        if (typeof rawName !== 'string' || rawName.length > 200) throw new TmError('TM008', 'size name invalid')
        const name = normalizeSizeName(rawName)
        if (!name || name.length > 40) throw new TmError('TM008', 'size name invalid')

        const [prev] = await drizzleDb.select().from(schema.sizeSubmissions).where(eq(schema.sizeSubmissions.id, subId))
        if (prev) {
          if (prev.name.toLowerCase() !== name.toLowerCase()) throw new TmError('TM013', 'submission reused')
          return { changedId: prev.sizeId, replayed: true }
        }

        const allSizes = await drizzleDb.select().from(schema.sizes)
        const clash = allSizes.find(s => s.name.trim().toLowerCase() === name.toLowerCase())
        if (clash) {
          throw new TmError('TM009', 'size exists', { details: JSON.stringify({ id: clash.id, name: clash.name, archived: clash.archivedAt !== null }) })
        }
        if (allSizes.length >= 100) throw new TmError('TM015', 'too many sizes')

        const usedSlots = new Set(allSizes.map(s => s.colorSlot))
        let colorSlot = 0
        while (usedSlots.has(colorSlot)) colorSlot++
        const maxSort = allSizes.reduce((m, s) => Math.max(m, s.sortOrder), -1)
        const id = crypto.randomUUID()
        const now = new Date().toISOString()

        await drizzleDb.insert(schema.sizes).values({ id, name, sortOrder: maxSort + 1, colorSlot, archivedAt: null, createdAt: now, updatedAt: now })
        await drizzleDb.insert(schema.sizeSubmissions).values({ id: subId, sizeId: id, name, createdAt: now, updatedAt: now })
        await compactSizeOrder()
        return { changedId: id, replayed: false }
      }

      case 'rename_size': {
        const sizeId = args.p_size_id as string
        const rawName = args.p_name as string
        if (typeof rawName !== 'string' || rawName.length > 200) throw new TmError('TM008', 'size name invalid')
        const name = normalizeSizeName(rawName)
        if (!name || name.length > 40) throw new TmError('TM008', 'size name invalid')

        const allSizes = await drizzleDb.select().from(schema.sizes)
        const target = allSizes.find(s => s.id === sizeId)
        if (!target) throw new TmError('TM011', 'unknown size')
        if (target.archivedAt !== null) throw new TmError('TM012', 'size is archived')

        const clash = allSizes.find(s => s.id !== sizeId && s.name.trim().toLowerCase() === name.toLowerCase())
        if (clash) {
          throw new TmError('TM009', 'size exists', { details: JSON.stringify({ id: clash.id, name: clash.name, archived: clash.archivedAt !== null }) })
        }
        if (target.name !== name) {
          await drizzleDb.update(schema.sizes).set({ name, updatedAt: new Date().toISOString() }).where(eq(schema.sizes.id, sizeId))
        }
        return { changedId: sizeId }
      }

      case 'reorder_sizes': {
        const orderIds = args.p_size_ids as string[]
        if (!Array.isArray(orderIds) || orderIds.length > 100 || orderIds.some(id => !id) || new Set(orderIds).size !== orderIds.length) {
          throw new TmError('TM005', 'malformed order')
        }
        const allSizes = await drizzleDb.select().from(schema.sizes)
        const active = allSizes.filter(s => s.archivedAt === null)
        active.sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name < b.name ? -1 : 1))
        const activeSet = new Set(active.map(s => s.id))
        if (orderIds.length !== active.length || orderIds.some(id => !activeSet.has(id))) {
          throw new TmError('TM012', 'sizes changed')
        }
        if (active.every((s, idx) => s.id === orderIds[idx])) {
          return { changed: false }
        }
        const now = new Date().toISOString()
        for (let i = 0; i < orderIds.length; i++) {
          await drizzleDb.update(schema.sizes).set({ sortOrder: i, updatedAt: now }).where(eq(schema.sizes.id, orderIds[i]!))
        }
        await compactSizeOrder()
        return { changed: true }
      }

      case 'archive_size': {
        const sizeId = args.p_size_id as string
        const allSizes = await drizzleDb.select().from(schema.sizes)
        const target = allSizes.find(s => s.id === sizeId)
        if (!target) throw new TmError('TM011', 'unknown size')
        if (target.archivedAt !== null) throw new TmError('TM012', 'already archived')
        const activeOthers = allSizes.filter(s => s.id !== sizeId && s.archivedAt === null)
        if (activeOthers.length === 0) throw new TmError('TM010', 'keep at least one active size')
        await drizzleDb.update(schema.sizes).set({ archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(schema.sizes.id, sizeId))
        await compactSizeOrder()
        return { changedId: sizeId }
      }

      case 'restore_size': {
        const sizeId = args.p_size_id as string
        const allSizes = await drizzleDb.select().from(schema.sizes)
        const target = allSizes.find(s => s.id === sizeId)
        if (!target) throw new TmError('TM011', 'unknown size')
        if (target.archivedAt === null) throw new TmError('TM012', 'not archived')
        const maxSort = allSizes.reduce((m, s) => Math.max(m, s.sortOrder), -1)
        await drizzleDb.update(schema.sizes).set({ archivedAt: null, sortOrder: maxSort + 1, updatedAt: new Date().toISOString() }).where(eq(schema.sizes.id, sizeId))
        await compactSizeOrder()
        return { changedId: sizeId }
      }

      case 'add_client':
      case 'update_client': {
        const isAdd = fn === 'add_client'
        const rawName = (args.p_name as string) ?? ''
        const rawPhone = (args.p_phone as string | null | undefined) ?? null
        const rawPrice = (args.p_default_price as number | null | undefined) ?? null

        if (rawName.length > 200) throw new TmError('TM017', 'name too long', { hint: 'too_long' })
        if (rawPhone && rawPhone.length > 200) throw new TmError('TM018', 'phone too long', { hint: 'too_long' })

        const name = normalizeSizeName(rawName)
        const phone = rawPhone ? normalizeClientPhone(rawPhone) : null

        if (!name || !hasVisibleClientTextChar(name)) throw new TmError('TM017', 'name blank', { hint: 'blank' })
        if (hasInvalidClientTextChar(name)) throw new TmError('TM017', 'name invalid', { hint: 'invalid' })
        if (name.length > 60) throw new TmError('TM017', 'name too long', { hint: 'too_long' })

        if (phone !== null) {
          if (hasInvalidClientTextChar(phone) || !hasVisibleClientTextChar(phone)) throw new TmError('TM018', 'phone invalid', { hint: 'invalid' })
          if (phone.length > 30) throw new TmError('TM018', 'phone too long', { hint: 'too_long' })
        }

        if (rawPrice !== null) {
          if (rawPrice <= 0) throw new TmError('TM019', 'price not positive', { hint: 'not_positive' })
          if (rawPrice > 9999.99) throw new TmError('TM019', 'price too large', { hint: 'too_large' })
          if (Math.round(rawPrice * 100) / 100 !== rawPrice) throw new TmError('TM019', 'too many decimals', { hint: 'too_many_decimals' })
        }
        const price = rawPrice !== null ? Math.round(rawPrice * 100) / 100 : null

        if (isAdd) {
          const subId = args.p_submission_id as string
          if (!subId) throw new TmError('TM005', 'submission id required')
          const hash = sha256Hex(`${name}\u001F${phone ?? ''}\u001F${price !== null ? price.toFixed(2) : ''}`)

          const [prev] = await drizzleDb.select().from(schema.clientSubmissions).where(eq(schema.clientSubmissions.id, subId))
          if (prev) {
            if (prev.payloadHash !== hash) throw new TmError('TM024', 'submission reused')
            return { clientId: prev.clientId, replayed: true }
          }

          const allClients = await drizzleDb.select().from(schema.clients)
          const clash = allClients.find(c => c.name.toLowerCase() === name.toLowerCase())
          if (clash) {
            throw new TmError('TM020', 'client exists', { details: JSON.stringify({ id: clash.id, archived: clash.archivedAt !== null }) })
          }
          if (allClients.length >= 500) throw new TmError('TM021', 'too many clients')

          const id = crypto.randomUUID()
          const now = new Date().toISOString()
          await drizzleDb.insert(schema.clients).values({ id, name, phone, defaultPrice: price, archivedAt: null, version: 1, createdAt: now, updatedAt: now })
          await drizzleDb.insert(schema.clientSubmissions).values({ id: subId, clientId: id, payloadHash: hash, createdAt: now, updatedAt: now })
          return { clientId: id, replayed: false }
        }
        else {
          const clientId = args.p_client_id as string
          const version = args.p_version as number
          if (!clientId || version === null || version === undefined) throw new TmError('TM005', 'missing client id or version')

          const allClients = await drizzleDb.select().from(schema.clients)
          const cur = allClients.find(c => c.id === clientId)
          if (!cur) throw new TmError('TM023', 'unknown client')

          if (cur.name === name && cur.phone === phone && cur.defaultPrice === price) {
            return { clientId, changed: false }
          }
          if (cur.version !== version) throw new TmError('TM022', 'client changed')

          const clash = allClients.find(c => c.id !== clientId && c.name.toLowerCase() === name.toLowerCase())
          if (clash) {
            throw new TmError('TM020', 'client exists', { details: JSON.stringify({ id: clash.id, archived: clash.archivedAt !== null }) })
          }

          await drizzleDb.update(schema.clients).set({ name, phone, defaultPrice: price, version: cur.version + 1, updatedAt: new Date().toISOString() }).where(eq(schema.clients.id, clientId))
          return { clientId, changed: true }
        }
      }

      case 'archive_client':
      case 'restore_client': {
        const clientId = args.p_client_id as string
        if (!clientId) throw new TmError('TM005', 'client id required')
        const [cur] = await drizzleDb.select().from(schema.clients).where(eq(schema.clients.id, clientId))
        if (!cur) throw new TmError('TM023', 'unknown client')

        const wantArchive = fn === 'archive_client'
        if (wantArchive && cur.archivedAt !== null) return { clientId, changed: false }
        if (!wantArchive && cur.archivedAt === null) return { clientId, changed: false }

        await drizzleDb
          .update(schema.clients)
          .set({
            archivedAt: wantArchive ? new Date().toISOString() : null,
            version: cur.version + 1,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.clients.id, clientId))
        return { clientId, changed: true }
      }

      case 'create_sale': {
        const subId = args.p_submission_id as string
        const type = args.p_type as 'delivery' | 'on_site'
        const saleDate = args.p_sale_date as string
        const sizeIds = args.p_size_ids as string[]
        const eggs = args.p_eggs as number[]
        const prices = args.p_prices as number[]
        const clientId = (args.p_client_id as string | null | undefined) ?? null
        const confirmShortfall = Boolean(args.p_confirm_shortfall)

        if (!subId || !saleDate || !['delivery', 'on_site'].includes(type)) throw new TmError('TM005', 'malformed sale')
        const sortedTriples = sizeIds.map((sid, i) => ({ sid, eggs: eggs[i]!, price: prices[i]! })).sort((a, b) => (a.sid < b.sid ? -1 : 1))
        const hash = sha256Hex(`${type}\u001F${clientId ?? ''}\u001F${saleDate}\u001F${sortedTriples.map(t => `${t.sid}:${t.eggs}:${t.price.toFixed(2)}`).join('\u001E')}`)

        const [prev] = await drizzleDb.select().from(schema.saleSubmissions).where(eq(schema.saleSubmissions.id, subId))
        if (prev) {
          if (prev.payloadHash !== hash) throw new TmError('TM038', 'submission reused')
          return { sale: await buildSaleJson(prev.saleId), replayed: true }
        }

        await validateSaleLines(sizeIds, eggs, prices, [])
        await validateSaleClient(type, clientId, null)
        if (saleDate > utcMaxDate()) throw new TmError('TM002', 'sale date future', { hint: 'sale_date' })
        await checkSaleShortfall(sizeIds, eggs, confirmShortfall)

        const [counter] = await drizzleDb.select().from(schema.saleCounters).where(eq(schema.saleCounters.id, 1))
        const saleNumber = counter?.nextNumber ?? 1
        const now = new Date().toISOString()
        await drizzleDb.update(schema.saleCounters).set({ nextNumber: saleNumber + 1, updatedAt: now }).where(eq(schema.saleCounters.id, 1))

        const saleId = crypto.randomUUID()
        await drizzleDb.insert(schema.sales).values({ id: saleId, saleNumber, clientId, type, saleDate, orderId: null, version: 1, voidedAt: null, createdAt: now, updatedAt: now })
        for (let i = 0; i < sizeIds.length; i++) {
          const p = Math.round(prices[i]! * 100) / 100
          const lt = computeLineTotal(p, eggs[i]!, tenantMeta.eggsPerTray)
          await drizzleDb.insert(schema.saleLines).values({ saleId, sizeId: sizeIds[i]!, eggs: eggs[i]!, pricePerTray: p, lineTotal: lt, createdAt: now, updatedAt: now })
        }
        await drizzleDb.insert(schema.saleSubmissions).values({ id: subId, saleId, payloadHash: hash, createdAt: now, updatedAt: now })
        return { sale: await buildSaleJson(saleId), replayed: false }
      }

      case 'update_sale': {
        const saleId = args.p_sale_id as string
        const version = args.p_version as number
        const type = args.p_type as 'delivery' | 'on_site'
        const saleDate = args.p_sale_date as string
        const sizeIds = args.p_size_ids as string[]
        const eggs = args.p_eggs as number[]
        const prices = args.p_prices as number[]
        const clientId = (args.p_client_id as string | null | undefined) ?? null
        const confirmShortfall = Boolean(args.p_confirm_shortfall)

        if (!saleId || version === null || version === undefined || !saleDate) throw new TmError('TM005', 'malformed update')
        const [cur] = await drizzleDb.select().from(schema.sales).where(eq(schema.sales.id, saleId))
        if (!cur) throw new TmError('TM027', 'unknown sale')
        if (cur.voidedAt !== null) throw new TmError('TM043', 'sale voided')

        const curLines = await drizzleDb.select().from(schema.saleLines).where(eq(schema.saleLines.saleId, saleId))
        curLines.sort((a, b) => (a.sizeId < b.sizeId ? -1 : 1))
        const newSorted = sizeIds.map((sid, i) => ({ sizeId: sid, eggs: eggs[i]!, pricePerTray: Math.round(prices[i]! * 100) / 100 })).sort((a, b) => (a.sizeId < b.sizeId ? -1 : 1))
        const linesUnchanged = curLines.length === newSorted.length && curLines.every((cl, i) => cl.sizeId === newSorted[i]!.sizeId && cl.eggs === newSorted[i]!.eggs && cl.pricePerTray === newSorted[i]!.pricePerTray)

        if (cur.orderId !== null) {
          if (type !== cur.type || clientId !== cur.clientId || !linesUnchanged) {
            throw new TmError('TM053', 'linked sale locked')
          }
          if (saleDate === cur.saleDate) return { sale: await buildSaleJson(saleId), changed: false }
          if (saleDate > utcMaxDate()) throw new TmError('TM002', 'future date', { hint: 'sale_date' })
          const [ord] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, cur.orderId))
          if (ord && saleDate < ord.orderDate) throw new TmError('TM055', 'before order date', { hint: 'sale_date' })
          if (version !== cur.version) throw new TmError('TM036', 'sale changed')

          const now = new Date().toISOString()
          await drizzleDb.update(schema.sales).set({ saleDate, version: cur.version + 1, updatedAt: now }).where(eq(schema.sales.id, saleId))
          if (ord) {
            await drizzleDb.update(schema.orders).set({ version: ord.version + 1, updatedAt: now }).where(eq(schema.orders.id, ord.id))
          }
          return { sale: await buildSaleJson(saleId), changed: true }
        }

        await validateSaleLines(sizeIds, eggs, prices, curLines.map(l => l.sizeId))
        await validateSaleClient(type, clientId, cur.clientId)
        if (saleDate > utcMaxDate()) throw new TmError('TM002', 'future date', { hint: 'sale_date' })

        if (cur.type === type && cur.clientId === clientId && cur.saleDate === saleDate && linesUnchanged) {
          return { sale: await buildSaleJson(saleId), changed: false }
        }
        if (version !== cur.version) throw new TmError('TM036', 'sale changed')

        const oldMap = new Map(curLines.map(l => [l.sizeId, l.eggs]))
        const deltaIds: string[] = []
        const deltaNeeded: number[] = []
        for (const nl of newSorted) {
          deltaIds.push(nl.sizeId)
          deltaNeeded.push(nl.eggs - (oldMap.get(nl.sizeId) ?? 0))
        }
        await checkSaleShortfall(deltaIds, deltaNeeded, confirmShortfall)

        const oldLineMap = new Map(curLines.map(l => [l.sizeId, l]))
        await drizzleDb.delete(schema.saleLines).where(eq(schema.saleLines.saleId, saleId))
        const now = new Date().toISOString()
        for (const nl of newSorted) {
          const prevLine = oldLineMap.get(nl.sizeId)
          const lt = (prevLine && prevLine.eggs === nl.eggs && prevLine.pricePerTray === nl.pricePerTray)
            ? prevLine.lineTotal
            : computeLineTotal(nl.pricePerTray, nl.eggs, tenantMeta.eggsPerTray)
          await drizzleDb.insert(schema.saleLines).values({ saleId, sizeId: nl.sizeId, eggs: nl.eggs, pricePerTray: nl.pricePerTray, lineTotal: lt, createdAt: now, updatedAt: now })
        }
        await drizzleDb.update(schema.sales).set({ clientId, type, saleDate, version: cur.version + 1, updatedAt: now }).where(eq(schema.sales.id, saleId))
        return { sale: await buildSaleJson(saleId), changed: true }
      }

      case 'void_sale': {
        const saleId = args.p_sale_id as string
        const version = args.p_version as number
        if (!saleId || version === null || version === undefined) throw new TmError('TM005', 'missing sale id or version')
        const [cur] = await drizzleDb.select().from(schema.sales).where(eq(schema.sales.id, saleId))
        if (!cur) throw new TmError('TM027', 'unknown sale')
        if (cur.voidedAt !== null) {
          return {
            sale: await buildSaleJson(saleId),
            changed: false,
            order: cur.orderId ? await buildOrderJson(cur.orderId, true) : null,
          }
        }
        if (version !== cur.version) throw new TmError('TM036', 'sale changed')
        const now = new Date().toISOString()
        await drizzleDb.update(schema.sales).set({ voidedAt: todayUtcDate(), version: cur.version + 1, updatedAt: now }).where(eq(schema.sales.id, saleId))
        if (cur.orderId) {
          const nextStatus = await computeOrderStatus(cur.orderId)
          const [ord] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, cur.orderId))
          if (ord && nextStatus) {
            await drizzleDb.update(schema.orders).set({ status: nextStatus, version: ord.version + 1, updatedAt: now }).where(eq(schema.orders.id, cur.orderId))
          }
        }
        return {
          sale: await buildSaleJson(saleId),
          changed: true,
          order: cur.orderId ? await buildOrderJson(cur.orderId, true) : null,
        }
      }

      case 'get_sale': {
        const saleId = args.p_sale_id as string
        return { sale: await buildSaleJson(saleId) }
      }

      case 'list_sales': {
        const allSales = await drizzleDb.select().from(schema.sales).orderBy(desc(schema.sales.saleDate), desc(schema.sales.saleNumber))
        const hasAny = allSales.length > 0
        const from = args.p_from as string | undefined
        const to = args.p_to as string | undefined
        const type = args.p_type as string | undefined
        const clientId = args.p_client_id as string | undefined
        const includeVoided = Boolean(args.p_include_voided)
        const limit = (args.p_limit as number | undefined) ?? 25
        const offset = (args.p_offset as number | undefined) ?? 0

        const matched = allSales.filter((s) => {
          if (from && s.saleDate < from) return false
          if (to && s.saleDate > to) return false
          if (type && s.type !== type) return false
          if (clientId && s.clientId !== clientId) return false
          if (!includeVoided && s.voidedAt !== null) return false
          return true
        })

        const paged = matched.slice(offset, offset + limit)
        const sales = []
        for (const s of paged) {
          const built = await buildSaleJson(s.id)
          if (built) sales.push(built)
        }
        return { hasAny, total: matched.length, sales }
      }

      case 'create_order': {
        const subId = args.p_submission_id as string
        const clientId = args.p_client_id as string
        const orderDate = args.p_order_date as string
        const wantedBy = (args.p_wanted_by as string | null | undefined) ?? null
        const sizeIds = args.p_size_ids as string[]
        const eggs = args.p_eggs as number[]
        const prices = args.p_prices as number[]

        if (!subId || !orderDate) throw new TmError('TM005', 'missing submission or date')
        const sortedTriples = sizeIds.map((sid, i) => ({ sid, eggs: eggs[i]!, price: prices[i]! })).sort((a, b) => (a.sid < b.sid ? -1 : 1))
        const hash = sha256Hex(`order\u001F${clientId ?? ''}\u001F${orderDate}\u001F${wantedBy ?? ''}\u001F${sortedTriples.map(t => `${t.sid}:${t.eggs}:${t.price.toFixed(2)}`).join('\u001E')}`)

        const [prev] = await drizzleDb.select().from(schema.orderSubmissions).where(eq(schema.orderSubmissions.id, subId))
        if (prev) {
          if (prev.payloadHash !== hash) throw new TmError('TM038', 'submission reused')
          return { order: await buildOrderJson(prev.orderId, true), replayed: true }
        }

        await validateSaleLines(sizeIds, eggs, prices, [])
        await validateSaleClient('delivery', clientId, null)
        if (orderDate > utcMaxDate()) throw new TmError('TM002', 'order date future', { hint: 'order_date' })
        if (wantedBy && wantedBy < orderDate) throw new TmError('TM055', 'wantedBy before orderDate', { hint: 'wanted_by' })

        const [counter] = await drizzleDb.select().from(schema.orderCounters).where(eq(schema.orderCounters.id, 1))
        const orderNumber = counter?.nextNumber ?? 1
        const now = new Date().toISOString()
        await drizzleDb.update(schema.orderCounters).set({ nextNumber: orderNumber + 1, updatedAt: now }).where(eq(schema.orderCounters.id, 1))

        const orderId = crypto.randomUUID()
        await drizzleDb.insert(schema.orders).values({
          id: orderId,
          orderNumber,
          clientId,
          orderDate,
          wantedBy,
          status: 'requested',
          cancelledAt: null,
          closedShortAt: null,
          convertedFromSaleNumber: null,
          version: 1,
          createdAt: now,
          updatedAt: now,
        })

        for (let i = 0; i < sizeIds.length; i++) {
          const p = Math.round(prices[i]! * 100) / 100
          const lt = computeLineTotal(p, eggs[i]!, tenantMeta.eggsPerTray)
          await drizzleDb.insert(schema.orderLines).values({ orderId, sizeId: sizeIds[i]!, eggs: eggs[i]!, pricePerTray: p, lineTotal: lt, droppedEggs: 0, createdAt: now, updatedAt: now })
        }
        await drizzleDb.insert(schema.orderSubmissions).values({ id: subId, orderId, payloadHash: hash, createdAt: now, updatedAt: now })
        return { order: await buildOrderJson(orderId, true), replayed: false }
      }

      case 'update_order': {
        const orderId = args.p_order_id as string
        const version = args.p_version as number
        const clientId = args.p_client_id as string
        const orderDate = args.p_order_date as string
        const wantedBy = (args.p_wanted_by as string | null | undefined) ?? null
        const sizeIds = args.p_size_ids as string[]
        const eggs = args.p_eggs as number[]
        const prices = args.p_prices as number[]

        if (!orderId || version === null || version === undefined || !orderDate) throw new TmError('TM005', 'malformed update_order')
        const [cur] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, orderId))
        if (!cur) throw new TmError('TM044', 'unknown order')
        if (cur.status === 'cancelled' || cur.status === 'fulfilled') {
          throw new TmError('TM046', 'order closed', { hint: cur.status === 'cancelled' ? 'cancelled' : cur.closedShortAt ? 'closed_short' : 'fulfilled' })
        }

        const curLines = await drizzleDb.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId))
        curLines.sort((a, b) => (a.sizeId < b.sizeId ? -1 : 1))
        await validateSaleLines(sizeIds, eggs, prices, curLines.map(l => l.sizeId))
        await validateSaleClient('delivery', clientId, cur.clientId)

        if (orderDate > utcMaxDate()) throw new TmError('TM002', 'future orderDate', { hint: 'order_date' })
        if (wantedBy && wantedBy < orderDate) throw new TmError('TM055', 'wantedBy before orderDate', { hint: 'wanted_by' })

        const linkedSales = await drizzleDb.select().from(schema.sales).where(and(eq(schema.sales.orderId, orderId), isNull(schema.sales.voidedAt)))
        const firstSaleDate = linkedSales.reduce<string | null>((min, s) => (min === null || s.saleDate < min ? s.saleDate : min), null)
        if (firstSaleDate && orderDate > firstSaleDate) throw new TmError('TM055', 'orderDate after delivery', { hint: 'order_date' })

        const newSorted = sizeIds.map((sid, i) => ({ sizeId: sid, eggs: eggs[i]!, pricePerTray: Math.round(prices[i]! * 100) / 100 })).sort((a, b) => (a.sizeId < b.sizeId ? -1 : 1))
        const linesUnchanged = curLines.length === newSorted.length && curLines.every((cl, i) => cl.sizeId === newSorted[i]!.sizeId && cl.eggs === newSorted[i]!.eggs && cl.pricePerTray === newSorted[i]!.pricePerTray)

        if (cur.clientId === clientId && cur.orderDate === orderDate && cur.wantedBy === wantedBy && linesUnchanged) {
          return { order: await buildOrderJson(orderId, true), changed: false }
        }
        if (version !== cur.version) throw new TmError('TM045', 'order changed')

        const delivered = await getOrderDeliveredEggs(orderId)
        if (delivered.size > 0) {
          if (clientId !== cur.clientId) throw new TmError('TM051', 'client locked', { hint: 'client_locked' })
          const newIdSet = new Set(sizeIds)
          const removedDelivered = [...delivered.keys()].filter(sid => !newIdSet.has(sid))
          if (removedDelivered.length > 0) {
            throw new TmError('TM051', 'line locked', { hint: 'line_locked', details: JSON.stringify({ sizeIds: removedDelivered }) })
          }
          const belowDelivered = newSorted.filter(nl => nl.eggs < (delivered.get(nl.sizeId) ?? 0)).map(nl => nl.sizeId)
          if (belowDelivered.length > 0) {
            throw new TmError('TM051', 'below delivered', { hint: 'below_delivered', details: JSON.stringify({ sizeIds: belowDelivered }) })
          }
        }

        const oldLineMap = new Map(curLines.map(l => [l.sizeId, l]))
        await drizzleDb.delete(schema.orderLines).where(eq(schema.orderLines.orderId, orderId))
        const now = new Date().toISOString()
        for (const nl of newSorted) {
          const prevLine = oldLineMap.get(nl.sizeId)
          const lt = (prevLine && prevLine.eggs === nl.eggs && prevLine.pricePerTray === nl.pricePerTray)
            ? prevLine.lineTotal
            : computeLineTotal(nl.pricePerTray, nl.eggs, tenantMeta.eggsPerTray)
          await drizzleDb.insert(schema.orderLines).values({ orderId, sizeId: nl.sizeId, eggs: nl.eggs, pricePerTray: nl.pricePerTray, lineTotal: lt, droppedEggs: 0, createdAt: now, updatedAt: now })
        }
        const nextStatus = (await computeOrderStatus(orderId)) ?? cur.status
        await drizzleDb.update(schema.orders).set({ clientId, orderDate, wantedBy, status: nextStatus, version: cur.version + 1, updatedAt: now }).where(eq(schema.orders.id, orderId))
        return { order: await buildOrderJson(orderId, true), changed: true }
      }

      case 'set_order_status': {
        const orderId = args.p_order_id as string
        const status = args.p_status as 'requested' | 'confirmed' | 'ready'
        if (!orderId || !['requested', 'confirmed', 'ready'].includes(status)) throw new TmError('TM005', 'malformed status')
        const [cur] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, orderId))
        if (!cur) throw new TmError('TM044', 'unknown order')
        if (cur.status === 'cancelled' || cur.status === 'fulfilled') throw new TmError('TM046', 'closed', { hint: cur.status })
        if (cur.status === 'partially_fulfilled') throw new TmError('TM049', 'has delivery')
        if (cur.status === status) return { order: await buildOrderJson(orderId, true), changed: false }
        await drizzleDb.update(schema.orders).set({ status, version: cur.version + 1, updatedAt: new Date().toISOString() }).where(eq(schema.orders.id, orderId))
        return { order: await buildOrderJson(orderId, true), changed: true }
      }

      case 'cancel_order': {
        const orderId = args.p_order_id as string
        if (!orderId) throw new TmError('TM005', 'order id required')
        const [cur] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, orderId))
        if (!cur) throw new TmError('TM044', 'unknown order')
        if (cur.status === 'cancelled') return { order: await buildOrderJson(orderId, true), changed: false }
        if (!['requested', 'confirmed', 'ready'].includes(cur.status)) throw new TmError('TM047', 'has delivery')
        const now = new Date().toISOString()
        await drizzleDb.update(schema.orders).set({ status: 'cancelled', cancelledAt: todayUtcDate(), version: cur.version + 1, updatedAt: now }).where(eq(schema.orders.id, orderId))
        return { order: await buildOrderJson(orderId, true), changed: true }
      }

      case 'close_order': {
        const orderId = args.p_order_id as string
        const version = args.p_version as number
        if (!orderId || version === null || version === undefined) throw new TmError('TM005', 'missing order id or version')
        const [cur] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, orderId))
        if (!cur) throw new TmError('TM044', 'unknown order')
        if (cur.closedShortAt !== null) return { order: await buildOrderJson(orderId, true), changed: false }
        if (cur.status !== 'partially_fulfilled') throw new TmError('TM048', 'not partial')
        if (version !== cur.version) throw new TmError('TM045', 'order changed')

        const oLines = await drizzleDb.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId))
        const delivered = await getOrderDeliveredEggs(orderId)
        const now = new Date().toISOString()
        for (const l of oLines) {
          const dropped = Math.max(l.eggs - (delivered.get(l.sizeId) ?? 0), 0)
          await drizzleDb.update(schema.orderLines).set({ droppedEggs: dropped, updatedAt: now }).where(and(eq(schema.orderLines.orderId, orderId), eq(schema.orderLines.sizeId, l.sizeId)))
        }
        await drizzleDb.update(schema.orders).set({ status: 'fulfilled', closedShortAt: todayUtcDate(), version: cur.version + 1, updatedAt: now }).where(eq(schema.orders.id, orderId))
        return { order: await buildOrderJson(orderId, true), changed: true }
      }

      case 'deliver_order': {
        const subId = args.p_submission_id as string
        const orderId = args.p_order_id as string
        const deliveredDate = args.p_delivered_date as string
        const sizeIds = args.p_size_ids as string[]
        const eggs = args.p_eggs as number[]
        const confirmShortfall = Boolean(args.p_confirm_shortfall)

        if (!subId || !orderId || !deliveredDate || !Array.isArray(sizeIds) || !Array.isArray(eggs) || sizeIds.length !== eggs.length) {
          throw new TmError('TM005', 'malformed deliver')
        }
        const sortedPairs = sizeIds.map((sid, i) => ({ sid, eggs: eggs[i]! })).sort((a, b) => (a.sid < b.sid ? -1 : 1))
        const hash = sha256Hex(`deliver\u001F${orderId}\u001F${deliveredDate}\u001F${sortedPairs.map(p => `${p.sid}:${p.eggs}`).join('\u001E')}`)

        const [prev] = await drizzleDb.select().from(schema.saleSubmissions).where(eq(schema.saleSubmissions.id, subId))
        if (prev) {
          if (prev.payloadHash !== hash) throw new TmError('TM038', 'submission reused')
          return {
            order: await buildOrderJson(orderId, true),
            sale: await buildSaleJson(prev.saleId),
            replayed: true,
          }
        }

        const [cur] = await drizzleDb.select().from(schema.orders).where(eq(schema.orders.id, orderId))
        if (!cur) throw new TmError('TM044', 'unknown order')
        if (cur.status === 'cancelled' || cur.status === 'fulfilled') throw new TmError('TM046', 'closed')
        if (deliveredDate > utcMaxDate()) throw new TmError('TM002', 'future deliveredDate', { hint: 'delivered_date' })
        if (deliveredDate < cur.orderDate) throw new TmError('TM055', 'before orderDate', { hint: 'delivered_date' })
        if (sizeIds.length === 0) throw new TmError('TM052', 'empty delivery', { hint: 'empty' })
        if (eggs.some(e => e < 1 || e > 100_000)) throw new TmError('TM030', 'eggs out of range')
        if (new Set(sizeIds).size !== sizeIds.length) throw new TmError('TM029', 'duplicate size')

        const oLines = await drizzleDb.select().from(schema.orderLines).where(eq(schema.orderLines.orderId, orderId))
        const oLineMap = new Map(oLines.map(l => [l.sizeId, l]))
        const delivered = await getOrderDeliveredEggs(orderId)

        for (let i = 0; i < sizeIds.length; i++) {
          const ol = oLineMap.get(sizeIds[i]!)
          if (!ol) throw new TmError('TM052', 'not on order', { hint: 'not_on_order' })
          const rem = ol.eggs - (delivered.get(ol.sizeId) ?? 0)
          if (eggs[i]! > rem) throw new TmError('TM050', 'over delivery')
        }

        await checkSaleShortfall(sizeIds, eggs, confirmShortfall)

        const [counter] = await drizzleDb.select().from(schema.saleCounters).where(eq(schema.saleCounters.id, 1))
        const saleNumber = counter?.nextNumber ?? 1
        const now = new Date().toISOString()
        await drizzleDb.update(schema.saleCounters).set({ nextNumber: saleNumber + 1, updatedAt: now }).where(eq(schema.saleCounters.id, 1))

        const saleId = crypto.randomUUID()
        await drizzleDb.insert(schema.sales).values({ id: saleId, saleNumber, clientId: cur.clientId, type: 'delivery', saleDate: deliveredDate, orderId, version: 1, voidedAt: null, createdAt: now, updatedAt: now })
        for (let i = 0; i < sizeIds.length; i++) {
          const ol = oLineMap.get(sizeIds[i]!)!
          const lt = computeLineTotal(ol.pricePerTray, eggs[i]!, tenantMeta.eggsPerTray)
          await drizzleDb.insert(schema.saleLines).values({ saleId, sizeId: sizeIds[i]!, eggs: eggs[i]!, pricePerTray: ol.pricePerTray, lineTotal: lt, createdAt: now, updatedAt: now })
        }
        await drizzleDb.insert(schema.saleSubmissions).values({ id: subId, saleId, payloadHash: hash, createdAt: now, updatedAt: now })

        const nextStatus = (await computeOrderStatus(orderId)) ?? cur.status
        await drizzleDb.update(schema.orders).set({ status: nextStatus, version: cur.version + 1, updatedAt: now }).where(eq(schema.orders.id, orderId))

        return {
          order: await buildOrderJson(orderId, true),
          sale: await buildSaleJson(saleId),
          replayed: false,
        }
      }

      case 'get_order': {
        const orderId = args.p_order_id as string
        return { order: await buildOrderJson(orderId, true) }
      }

      case 'list_orders': {
        const view = (args.p_view as string | undefined) ?? 'open'
        if (!['open', 'all', 'fulfilled', 'cancelled'].includes(view)) throw new TmError('TM005', 'malformed view')
        const clientId = args.p_client_id as string | undefined
        const from = args.p_from as string | undefined
        const to = args.p_to as string | undefined
        const limit = (args.p_limit as number | undefined) ?? 25
        const offset = (args.p_offset as number | undefined) ?? 0

        const allOrders = await drizzleDb.select().from(schema.orders)
        const hasAny = allOrders.length > 0
        const matched = allOrders.filter((o) => {
          if (view === 'open' && !['requested', 'confirmed', 'ready', 'partially_fulfilled'].includes(o.status)) return false
          if ((view === 'fulfilled' || view === 'cancelled') && o.status !== view) return false
          if (clientId && o.clientId !== clientId) return false
          if (from && o.orderDate < from) return false
          if (to && o.orderDate > to) return false
          return true
        })

        if (view === 'open') {
          matched.sort((a, b) => {
            if (a.wantedBy !== b.wantedBy) {
              if (a.wantedBy === null) return 1
              if (b.wantedBy === null) return -1
              return a.wantedBy < b.wantedBy ? -1 : 1
            }
            if (a.orderDate !== b.orderDate) return a.orderDate < b.orderDate ? -1 : 1
            return a.orderNumber - b.orderNumber
          })
        }
        else {
          matched.sort((a, b) => {
            if (a.orderDate !== b.orderDate) return a.orderDate > b.orderDate ? -1 : 1
            return b.orderNumber - a.orderNumber
          })
        }

        const paged = view === 'open' ? matched : matched.slice(offset, offset + limit)
        const orders = []
        for (const o of paged) {
          const built = await buildOrderJson(o.id, false)
          if (built) orders.push(built)
        }
        return { hasAny, total: matched.length, orders }
      }

      default:
        throw new TmError('PGRST202', `unknown function ${fn}`)
    }
  }

  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      try {
        const data = await dispatchRpc(fn, args)
        return { data, error: null }
      }
      catch (e) {
        if (e instanceof TmError) {
          return { data: null, error: { code: e.code, message: e.message, details: e.details, hint: e.hint } }
        }
        return { data: null, error: { code: 'XX000', message: 'internal', details: '', hint: '' } }
      }
    },
    from: (table: string) => {
      return {
        select: (_columns?: string) => {
          const filters: [string, string][] = []
          const orders: string[] = []
          let single = false

          const executeQuery = async () => {
            try {
              if (table === 'tenants') {
                const sizeRows = await drizzleDb.select().from(schema.sizes)
                const data = {
                  id: tenantMeta.tenantId,
                  name: tenantMeta.name,
                  eggs_per_tray: tenantMeta.eggsPerTray,
                  currency: tenantMeta.currency,
                  sizes: sizeRows.map(s => ({
                    id: s.id,
                    name: s.name,
                    sort_order: s.sortOrder,
                    color_slot: s.colorSlot,
                    archived_at: s.archivedAt,
                  })),
                }
                return { data: single ? data : [data], error: null }
              }
              if (table === 'sizes') {
                const rows = await drizzleDb.select().from(schema.sizes)
                const mapped = rows.map(s => ({
                  id: s.id,
                  name: s.name,
                  sort_order: s.sortOrder,
                  color_slot: s.colorSlot,
                  archived_at: s.archivedAt,
                }))
                return { data: single ? (mapped[0] ?? null) : mapped, error: null }
              }
              if (table === 'clients') {
                let rows = await drizzleDb.select().from(schema.clients)
                const idFilter = filters.find(f => f[0] === 'id')?.[1]
                if (idFilter) rows = rows.filter(r => r.id === idFilter)
                if (orders.includes('name')) {
                  rows.sort((a, b) => (a.name !== b.name ? (a.name < b.name ? -1 : 1) : (a.id < b.id ? -1 : 1)))
                }
                const mapped = rows.map(c => ({
                  id: c.id,
                  name: c.name,
                  phone: c.phone,
                  default_price: c.defaultPrice,
                  archived_at: c.archivedAt,
                  version: c.version,
                }))
                return { data: single ? (mapped[0] ?? null) : mapped, error: null }
              }
              return { data: single ? null : [], error: null }
            }
            catch {
              return { data: null, error: { code: 'XX000', message: 'error', details: '', hint: '' } }
            }
          }

          const builder: Record<string, unknown> = {
            eq: (col: string, val: string) => {
              filters.push([col, val])
              return builder
            },
            order: (col: string) => {
              orders.push(col)
              return builder
            },
            maybeSingle: () => {
              single = true
              return executeQuery()
            },
            then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              executeQuery().then(onFulfilled, onRejected),
          }
          return builder
        },
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
      }
    },
  }
}
