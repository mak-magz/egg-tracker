/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FailedOutboxMutation, LocalDataSummary } from '#shared/types/api'

export const LOCAL_SCHEMA_USER_VERSION = 3

export interface LocalSqlDriver {
  exec: (sql: string, bind?: any[]) => Promise<void> | void
  query: <T = Record<string, any>>(sql: string, bind?: any[]) => Promise<T[]> | T[]
}

export interface OutboxMutationRow {
  id: string
  device_id: string
  mutation_type: string
  payload: string
  occurred_at: string
  status: string
  error: string | null
  created_at: string
}

export interface RemoteChangeItem {
  version: number
  entityType: string
  entityId: string
  action: 'insert' | 'update' | 'delete'
  deviceId: string
  occurredAt: string
  data: Record<string, any>
}

export async function runSafeAlter(driver: LocalSqlDriver, sql: string): Promise<void> {
  try {
    await driver.exec(sql)
  }
  catch (err: any) {
    const msg = String(err?.message || '').toLowerCase()
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      return
    }
    throw err
  }
}

export async function migrateLocalSchema(driver: LocalSqlDriver): Promise<number> {
  const versionRows = await driver.query<{ user_version: number }>('PRAGMA user_version;')
  let currentVersion = Number(versionRows[0]?.user_version ?? 0)

  if (currentVersion < 1) {
    await runSafeAlter(driver, 'ALTER TABLE farm_settings ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;')
    currentVersion = 1
  }

  if (currentVersion < 2) {
    await runSafeAlter(driver, `ALTER TABLE farm_settings ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';`)
    await runSafeAlter(driver, 'ALTER TABLE sizes ADD COLUMN default_price REAL;')
    currentVersion = 2
  }

  if (currentVersion < 3) {
    await runSafeAlter(driver, 'ALTER TABLE sync_state ADD COLUMN needs_reconcile INTEGER NOT NULL DEFAULT 0;')
    await runSafeAlter(driver, 'ALTER TABLE sync_state ADD COLUMN owner_uid TEXT;')
    await driver.exec(`CREATE TABLE IF NOT EXISTS sync_rejections (
      id TEXT PRIMARY KEY,
      mutation_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      mutation_type TEXT NOT NULL,
      entity_ref TEXT,
      error_code TEXT NOT NULL,
      reason TEXT NOT NULL,
      rejected_at TEXT NOT NULL,
      resolved_at TEXT
    );`)
    await driver.exec('CREATE INDEX IF NOT EXISTS sync_rejections_unresolved_idx ON sync_rejections (resolved_at, rejected_at);')
    await driver.exec('CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox_mutations (status, created_at);')
    currentVersion = 3
  }

  // Idempotently ensure owner_uid exists even on DBs that already migrated to user_version = 3
  await runSafeAlter(driver, 'ALTER TABLE sync_state ADD COLUMN owner_uid TEXT;')

  await driver.exec(`PRAGMA user_version = ${LOCAL_SCHEMA_USER_VERSION};`)
  return currentVersion
}

export async function summarizeLocalData(driver: LocalSqlDriver): Promise<LocalDataSummary> {
  const [prodRows, clientRows, orderRows, saleRows, sizeRows, pendingRows, failedRows, farmRows, syncRows] = await Promise.all([
    driver.query<{ count: number }>('SELECT COUNT(DISTINCT produced_on) as count FROM production'),
    driver.query<{ count: number }>('SELECT COUNT(*) as count FROM clients'),
    driver.query<{ count: number }>('SELECT COUNT(*) as count FROM orders'),
    driver.query<{ count: number }>('SELECT COUNT(*) as count FROM sales'),
    driver.query<{ id: string, name: string, archived_at: string | null, default_price: number | null }>(
      'SELECT id, name, archived_at, default_price FROM sizes',
    ),
    driver.query<{ count: number }>(`SELECT COUNT(*) as count FROM outbox_mutations WHERE status IN ('pending', 'in_flight')`),
    driver.query<{ count: number }>(`SELECT COUNT(*) as count FROM outbox_mutations WHERE status = 'failed'`),
    driver.query<{ farm_name: string }>(`SELECT farm_name FROM farm_settings WHERE id = 'default'`),
    Promise.resolve(driver.query<{ owner_uid: string | null }>(`SELECT owner_uid FROM sync_state WHERE id = 'default'`)).catch(() => []),
  ])

  const defaultSizeNames = new Set(['small', 'medium', 'large', 'jumbo'])
  const customSizesCount = sizeRows.filter(
    s => s.archived_at !== null || s.default_price !== null || !defaultSizeNames.has(s.name.trim().toLowerCase()),
  ).length
  const sizeCountChanged = sizeRows.length !== 4 ? Math.max(customSizesCount, Math.abs(sizeRows.length - 4)) : customSizesCount

  const productionDays = Number(prodRows[0]?.count ?? 0)
  const clients = Number(clientRows[0]?.count ?? 0)
  const orders = Number(orderRows[0]?.count ?? 0)
  const sales = Number(saleRows[0]?.count ?? 0)
  const pendingOutboxCount = Number(pendingRows[0]?.count ?? 0)
  const failedOutboxCount = Number(failedRows[0]?.count ?? 0)

  const hasData = (
    productionDays > 0
    || clients > 0
    || orders > 0
    || sales > 0
    || sizeCountChanged > 0
    || pendingOutboxCount > 0
    || failedOutboxCount > 0
  )

  return {
    hasData,
    productionDays,
    clients,
    orders,
    sales,
    customSizesCount: sizeCountChanged,
    pendingOutboxCount,
    failedOutboxCount,
    farmName: farmRows[0]?.farm_name || null,
    ownerUid: syncRows[0]?.owner_uid || null,
  }
}

function classifyOutboxError(rawError: string | null): { errorCode: string, errorMessage: string } {
  const err = (rawError || '').trim()
  const lower = err.toLowerCase()

  if (lower.includes('insufficient stock') || lower.includes('shortfall') || lower.includes('tm026')) {
    return {
      errorCode: 'stock_shortfall',
      errorMessage: 'Not enough eggs in stock in the cloud for this sale or delivery.',
    }
  }
  if (lower.includes('over delivery') || lower.includes('over_delivered') || lower.includes('tm050')) {
    return {
      errorCode: 'over_delivered',
      errorMessage: 'Delivery quantity exceeds the remaining balance on this order.',
    }
  }
  if (lower.includes('stale version') || lower.includes('version') || lower.includes('tm037')) {
    return {
      errorCode: 'stale_version',
      errorMessage: 'This record was already modified on another device.',
    }
  }
  if (lower.includes('closed') || lower.includes('cancelled') || lower.includes('fulfilled') || lower.includes('tm046')) {
    return {
      errorCode: 'order_closed',
      errorMessage: 'This order is already closed or cancelled in the cloud.',
    }
  }
  if (lower.includes('before orderdate') || lower.includes('date_conflict') || lower.includes('tm055')) {
    return {
      errorCode: 'date_conflict',
      errorMessage: 'Delivery date cannot be earlier than the order date.',
    }
  }
  if (lower.includes('unknown') || lower.includes('not found') || lower.includes('tm011') || lower.includes('tm023') || lower.includes('tm027') || lower.includes('tm044')) {
    return {
      errorCode: 'not_found',
      errorMessage: 'Referenced record could not be found in the cloud.',
    }
  }
  if (lower.includes('duplicate') || lower.includes('tm016') || lower.includes('tm024')) {
    return {
      errorCode: 'duplicate_record',
      errorMessage: 'A record with this name or number already exists in the cloud.',
    }
  }

  return {
    errorCode: 'sync_rejected',
    errorMessage: 'Cloud rejected this change during sync.',
  }
}

export function formatFailedMutation(row: OutboxMutationRow, seq: number): FailedOutboxMutation {
  let payload: Record<string, any> = {}
  try {
    payload = JSON.parse(row.payload) || {}
  }
  catch {
    // Malformed local payload string falls back to empty metadata
  }

  let entityLabel = row.mutation_type.replace(/_/g, ' ')
  let detailLabel = row.occurred_at.slice(0, 10)

  switch (row.mutation_type) {
    case 'create_sale':
    case 'update_sale':
    case 'void_sale': {
      const ref = payload.saleNumber ? `#${payload.saleNumber}` : ''
      entityLabel = row.mutation_type === 'void_sale'
        ? `Void Sale ${ref}`.trim()
        : row.mutation_type === 'update_sale'
          ? `Edit Sale ${ref}`.trim()
          : `New Sale ${ref}`.trim()
      const lineCount = Array.isArray(payload.lines) ? payload.lines.length : 0
      const parts = [payload.saleDate || row.occurred_at.slice(0, 10)]
      if (lineCount > 0) parts.push(`${lineCount} size line${lineCount === 1 ? '' : 's'}`)
      detailLabel = parts.join(' • ')
      break
    }
    case 'create_order':
    case 'update_order':
    case 'deliver_order':
    case 'cancel_order':
    case 'close_order':
    case 'set_order_status': {
      const ref = payload.orderNumber ? `#${payload.orderNumber}` : (payload.saleNumber ? `#${payload.saleNumber}` : '')
      const verbMap: Record<string, string> = {
        create_order: 'New Order',
        update_order: 'Edit Order',
        deliver_order: 'Order Delivery',
        cancel_order: 'Cancel Order',
        close_order: 'Close Order',
        set_order_status: 'Order Status',
      }
      entityLabel = `${verbMap[row.mutation_type] || 'Order'} ${ref}`.trim()
      const dateStr = payload.deliveredDate || payload.orderDate || row.occurred_at.slice(0, 10)
      detailLabel = payload.status ? `${dateStr} • ${payload.status}` : dateStr
      break
    }
    case 'log_production':
    case 'replace_production_day':
    case 'delete_production_day': {
      const day = payload.date || payload.day || row.occurred_at.slice(0, 10)
      entityLabel = row.mutation_type === 'delete_production_day'
        ? `Delete Production (${day})`
        : `Production (${day})`
      const goodCount = Array.isArray(payload.good)
        ? payload.good.reduce((sum: number, g: any) => sum + Number(g.eggs || 0), 0)
        : 0
      const rej = Number(payload.rejects || 0)
      detailLabel = goodCount > 0 || rej > 0 ? `${goodCount} good • ${rej} rejects` : day
      break
    }
    case 'add_client':
    case 'update_client':
    case 'archive_client':
    case 'restore_client': {
      entityLabel = row.mutation_type === 'add_client'
        ? 'Add Client'
        : row.mutation_type === 'update_client'
          ? 'Update Client'
          : row.mutation_type === 'archive_client'
            ? 'Archive Client'
            : 'Restore Client'
      detailLabel = row.occurred_at.slice(0, 10)
      break
    }
    case 'add_size':
    case 'rename_size':
    case 'archive_size':
    case 'restore_size':
    case 'reorder_sizes': {
      entityLabel = row.mutation_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      detailLabel = payload.name ? `${payload.name} • ${row.occurred_at.slice(0, 10)}` : row.occurred_at.slice(0, 10)
      break
    }
    case 'update_farm_settings': {
      entityLabel = 'Farm Settings'
      detailLabel = payload.farmName || row.occurred_at.slice(0, 10)
      break
    }
  }

  const classified = classifyOutboxError(row.error)
  return {
    id: row.id,
    seq,
    type: row.mutation_type,
    entityLabel,
    detailLabel,
    errorCode: classified.errorCode,
    errorMessage: classified.errorMessage,
    createdAt: row.created_at,
  }
}

export function extractSequenceNum(value: unknown): number {
  if (value === undefined || value === null) return 0
  const str = String(value).trim()
  if (!str) return 0
  const match = /(\d+)$/.exec(str)
  if (!match) return 0
  const parsed = Number.parseInt(match[1]!, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

async function advanceLocalCounter(
  driver: LocalSqlDriver,
  counterId: 'sales' | 'orders',
  seqStr: unknown,
  now: string,
): Promise<void> {
  const num = extractSequenceNum(seqStr)
  if (num <= 0) return

  const minNext = num + 1
  const existing = await driver.query<{ next_number: number }>(
    'SELECT next_number FROM local_counters WHERE id = ?',
    [counterId],
  )
  if (existing.length === 0) {
    await driver.exec(
      'INSERT INTO local_counters (id, next_number, updated_at) VALUES (?, ?, ?)',
      [counterId, minNext, now],
    )
  }
  else if (Number(existing[0]!.next_number ?? 1) < minNext) {
    await driver.exec(
      'UPDATE local_counters SET next_number = ?, updated_at = ? WHERE id = ? AND next_number < ?',
      [minNext, now, counterId, minNext],
    )
  }
}

async function upsertOrderRecord(
  driver: LocalSqlDriver,
  d: Record<string, any>,
  fallbackId: string,
  recordTime: string,
): Promise<void> {
  const orderId = String(d.id ?? d.orderId ?? fallbackId)
  const orderNumber = String(d.order_number ?? d.orderNumber ?? '0')
  await driver.exec(
    `INSERT INTO orders (id, order_number, client_id, order_date, wanted_by, status, cancelled_at, closed_short_at, converted_from_sale_number, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       order_number = excluded.order_number,
       client_id = excluded.client_id,
       order_date = excluded.order_date,
       wanted_by = excluded.wanted_by,
       status = excluded.status,
       cancelled_at = excluded.cancelled_at,
       closed_short_at = excluded.closed_short_at,
       converted_from_sale_number = excluded.converted_from_sale_number,
       version = excluded.version,
       updated_at = excluded.updated_at`,
    [
      orderId,
      orderNumber,
      d.client_id ?? d.clientId,
      d.order_date ?? d.orderDate,
      d.wanted_by ?? d.wantedBy ?? null,
      d.status ?? 'requested',
      d.cancelled_at ?? d.cancelledAt ?? null,
      d.closed_short_at ?? d.closedShortAt ?? null,
      d.converted_from_sale_number ?? d.convertedFromSaleNumber ?? null,
      Number(d.version ?? 1),
      d.created_at ?? d.createdAt ?? recordTime,
      d.updated_at ?? d.updatedAt ?? recordTime,
    ],
  )

  await advanceLocalCounter(driver, 'orders', orderNumber, recordTime)

  if (Array.isArray(d.lines)) {
    await driver.exec('DELETE FROM order_lines WHERE order_id = ?', [orderId])
    for (const l of d.lines) {
      await driver.exec(
        `INSERT INTO order_lines (order_id, size_id, eggs, price_per_tray, line_total, dropped_eggs, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          l.sizeId ?? l.size_id,
          Number(l.orderedEggs ?? l.eggs ?? 0),
          Number(l.pricePerTray ?? l.price_per_tray ?? 0),
          Number(l.lineTotal ?? l.line_total ?? 0),
          Number(l.droppedEggs ?? l.dropped_eggs ?? 0),
          recordTime,
          recordTime,
        ],
      )
    }
  }
}

async function upsertSaleRecord(
  driver: LocalSqlDriver,
  d: Record<string, any>,
  fallbackId: string,
  recordTime: string,
): Promise<void> {
  const saleId = String(d.id ?? d.saleId ?? fallbackId)
  const saleNumber = String(d.sale_number ?? d.saleNumber ?? '0')
  await driver.exec(
    `INSERT INTO sales (id, sale_number, client_id, type, sale_date, order_id, order_number, version, voided_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       sale_number = excluded.sale_number,
       client_id = excluded.client_id,
       type = excluded.type,
       sale_date = excluded.sale_date,
       order_id = excluded.order_id,
       order_number = excluded.order_number,
       version = excluded.version,
       voided_at = excluded.voided_at,
       updated_at = excluded.updated_at`,
    [
      saleId,
      saleNumber,
      d.client_id ?? d.clientId ?? null,
      d.type ?? 'on_site',
      d.sale_date ?? d.saleDate,
      d.order_id ?? d.orderId ?? null,
      d.order_number ?? d.orderNumber ?? null,
      Number(d.version ?? 1),
      d.voided_at ?? d.voidedAt ?? null,
      d.created_at ?? d.createdAt ?? recordTime,
      d.updated_at ?? d.updatedAt ?? recordTime,
    ],
  )

  await advanceLocalCounter(driver, 'sales', saleNumber, recordTime)

  if (Array.isArray(d.lines)) {
    await driver.exec('DELETE FROM sale_lines WHERE sale_id = ?', [saleId])
    for (const l of d.lines) {
      await driver.exec(
        `INSERT INTO sale_lines (sale_id, size_id, eggs, price_per_tray, line_total, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          l.sizeId ?? l.size_id,
          Number(l.eggs ?? 0),
          Number(l.pricePerTray ?? l.price_per_tray ?? 0),
          Number(l.lineTotal ?? l.line_total ?? 0),
          recordTime,
          recordTime,
        ],
      )
    }
  }
}

export async function applyRemoteChangesOps(
  driver: LocalSqlDriver,
  changes: RemoteChangeItem[],
  latestVersion: number,
  onFarmSettingsUpdated?: (patch: { name?: string, eggsPerTray?: number, currency?: string, onboardingCompleted?: boolean }) => void,
): Promise<{ appliedCount: number, latestVersion: number }> {
  const now = new Date().toISOString()

  for (const change of changes) {
    const { entityType, entityId, action, occurredAt, data: rawData } = change
    const d = rawData || {}
    const op = String(d.op || entityType)
    const recordTime = occurredAt || now

    // 1. Farm Settings
    if (op === 'update_farm_settings' || entityType === 'farm_settings') {
      const farmName = d.farm_name ?? d.farmName ?? d.name
      const eggsPerTray = d.eggs_per_tray ?? d.eggsPerTray
      const currency = d.currency
      const onboardingCompleted = d.onboarding_completed ?? d.onboardingCompleted
      if (farmName !== undefined || eggsPerTray !== undefined || currency !== undefined || onboardingCompleted !== undefined) {
        await driver.exec(
          `UPDATE farm_settings
           SET farm_name = COALESCE(?, farm_name),
               eggs_per_tray = COALESCE(?, eggs_per_tray),
               currency = COALESCE(?, currency),
               onboarding_completed = COALESCE(?, onboarding_completed),
               updated_at = ?
           WHERE id = 'default'`,
          [
            farmName ?? null,
            eggsPerTray !== undefined ? Number(eggsPerTray) : null,
            currency ?? null,
            onboardingCompleted !== undefined ? (onboardingCompleted ? 1 : 0) : null,
            now,
          ],
        )
        onFarmSettingsUpdated?.({
          ...(farmName ? { name: farmName } : {}),
          ...(eggsPerTray !== undefined ? { eggsPerTray: Number(eggsPerTray) } : {}),
          ...(currency ? { currency } : {}),
          ...(onboardingCompleted !== undefined ? { onboardingCompleted: Boolean(onboardingCompleted) } : {}),
        })
      }
      continue
    }

    // 2. Sizes (canonical op OR table entityType)
    if (op === 'reorder_sizes') {
      if (Array.isArray(d.orders)) {
        for (const item of d.orders) {
          if (!item?.id) continue
          await driver.exec(
            'UPDATE sizes SET sort_order = ?, updated_at = ? WHERE id = ?',
            [Number(item.sortOrder ?? item.sort_order ?? 0), recordTime, item.id],
          )
        }
      }
      else if (Array.isArray(d.sizeIds)) {
        for (let i = 0; i < d.sizeIds.length; i++) {
          const id = d.sizeIds[i]
          if (!id) continue
          await driver.exec(
            'UPDATE sizes SET sort_order = ?, updated_at = ? WHERE id = ?',
            [i, recordTime, id],
          )
        }
      }
      continue
    }

    if (
      op === 'add_size'
      || op === 'rename_size'
      || op === 'archive_size'
      || op === 'restore_size'
      || entityType === 'sizes'
    ) {
      const sizeId = d.id ?? d.sizeId ?? entityId
      if (action === 'delete') {
        await driver.exec('DELETE FROM sizes WHERE id = ?', [sizeId])
      }
      else if (op === 'archive_size' && d.name === undefined) {
        await driver.exec(
          'UPDATE sizes SET archived_at = ?, updated_at = ? WHERE id = ?',
          [d.archived_at ?? d.archivedAt ?? recordTime, recordTime, sizeId],
        )
      }
      else if (op === 'restore_size' && d.name === undefined) {
        await driver.exec(
          'UPDATE sizes SET archived_at = NULL, updated_at = ? WHERE id = ?',
          [recordTime, sizeId],
        )
      }
      else {
        const sortOrder = Number(d.sort_order ?? d.sortOrder ?? 0)
        const colorSlot = Number(d.color_slot ?? d.colorSlot ?? 0)
        // Guard against color_slot collision on concurrent size creation
        const colliding = await driver.query<{ id: string }>(
          'SELECT id FROM sizes WHERE color_slot = ? AND id != ?',
          [colorSlot, sizeId],
        )
        let effectiveColorSlot = colorSlot
        if (colliding.length > 0) {
          const used = await driver.query<{ color_slot: number }>('SELECT color_slot FROM sizes')
          const usedSet = new Set(used.map(r => Number(r.color_slot)))
          while (usedSet.has(effectiveColorSlot)) {
            effectiveColorSlot++
          }
        }
        await driver.exec(
          `INSERT INTO sizes (id, name, sort_order, color_slot, archived_at, default_price, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             sort_order = COALESCE(excluded.sort_order, sizes.sort_order),
             color_slot = COALESCE(excluded.color_slot, sizes.color_slot),
             archived_at = excluded.archived_at,
             default_price = excluded.default_price,
             updated_at = excluded.updated_at`,
          [
            sizeId,
            d.name ?? '',
            sortOrder,
            effectiveColorSlot,
            d.archived_at ?? d.archivedAt ?? null,
            (d.default_price !== undefined ? d.default_price : d.defaultPrice) ?? null,
            d.created_at ?? d.createdAt ?? recordTime,
            d.updated_at ?? d.updatedAt ?? recordTime,
          ],
        )
      }
      continue
    }

    // 3. Clients
    if (
      op === 'add_client'
      || op === 'update_client'
      || op === 'archive_client'
      || op === 'restore_client'
      || entityType === 'clients'
    ) {
      const clientId = d.id ?? d.clientId ?? entityId
      if (action === 'delete') {
        await driver.exec('DELETE FROM clients WHERE id = ?', [clientId])
      }
      else if (op === 'archive_client' && d.name === undefined) {
        await driver.exec(
          'UPDATE clients SET archived_at = ?, updated_at = ? WHERE id = ?',
          [d.archived_at ?? d.archivedAt ?? recordTime, recordTime, clientId],
        )
      }
      else if (op === 'restore_client' && d.name === undefined) {
        await driver.exec(
          'UPDATE clients SET archived_at = NULL, updated_at = ? WHERE id = ?',
          [recordTime, clientId],
        )
      }
      else {
        await driver.exec(
          `INSERT INTO clients (id, name, phone, default_price, archived_at, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             phone = excluded.phone,
             default_price = excluded.default_price,
             archived_at = excluded.archived_at,
             version = excluded.version,
             updated_at = excluded.updated_at`,
          [
            clientId,
            d.name ?? '',
            d.phone ?? null,
            (d.default_price !== undefined ? d.default_price : d.defaultPrice) ?? null,
            d.archived_at ?? d.archivedAt ?? null,
            Number(d.version ?? 1),
            d.created_at ?? d.createdAt ?? recordTime,
            d.updated_at ?? d.updatedAt ?? recordTime,
          ],
        )
      }
      continue
    }

    // 4. Production (log_production & replace_production_day both carry canonical full day state -> replace cleanly for idempotency)
    if (op === 'delete_production_day') {
      const day = d.date || d.day || d.produced_on || d.producedOn || entityId
      await driver.exec('DELETE FROM production WHERE produced_on = ?', [day])
      continue
    }

    if (
      op === 'log_production'
      || op === 'replace_production_day'
      || entityType === 'production'
    ) {
      if (action === 'delete') {
        await driver.exec('DELETE FROM production WHERE id = ?', [entityId])
        continue
      }

      const day = d.date || d.day || d.produced_on || d.producedOn
      if (day && (Array.isArray(d.good) || d.rejects !== undefined)) {
        await driver.exec('DELETE FROM production WHERE produced_on = ?', [day])

        for (const g of d.good || []) {
          const count = Number(g.eggs ?? 0)
          if (count > 0 && g.sizeId) {
            const prodId = g.id || `${day}:${g.sizeId}`
            await driver.exec(
              `INSERT INTO production (id, produced_on, size_id, quality, eggs, created_at, updated_at)
               VALUES (?, ?, ?, 'good', ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET eggs = excluded.eggs, updated_at = excluded.updated_at`,
              [prodId, day, g.sizeId, count, recordTime, recordTime],
            )
          }
        }

        const rej = Number(d.rejects ?? 0)
        if (rej > 0) {
          const rejId = d.rejectId || `${day}:reject`
          await driver.exec(
            `INSERT INTO production (id, produced_on, size_id, quality, eggs, created_at, updated_at)
             VALUES (?, ?, NULL, 'reject', ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET eggs = excluded.eggs, updated_at = excluded.updated_at`,
            [rejId, day, rej, recordTime, recordTime],
          )
        }
      }
      else {
        // Fallback single-row sync
        await driver.exec(
          `INSERT INTO production (id, produced_on, size_id, quality, eggs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             produced_on = excluded.produced_on,
             size_id = excluded.size_id,
             quality = excluded.quality,
             eggs = excluded.eggs,
             updated_at = excluded.updated_at`,
          [
            d.id ?? entityId,
            d.produced_on ?? d.producedOn,
            d.size_id ?? d.sizeId ?? null,
            d.quality ?? 'good',
            Number(d.eggs ?? 0),
            d.created_at ?? d.createdAt ?? recordTime,
            d.updated_at ?? d.updatedAt ?? recordTime,
          ],
        )
      }
      continue
    }

    // 5. Orders (create_order, update_order, set_order_status, cancel_order, close_order, deliver_order)
    if (
      op === 'create_order'
      || op === 'update_order'
      || op === 'set_order_status'
      || op === 'cancel_order'
      || op === 'close_order'
      || op === 'deliver_order'
      || entityType === 'orders'
    ) {
      const orderId = d.id ?? d.orderId ?? entityId
      if (action === 'delete') {
        await driver.exec('DELETE FROM order_lines WHERE order_id = ?', [orderId])
        await driver.exec('DELETE FROM orders WHERE id = ?', [orderId])
        continue
      }

      if (d.orderNumber !== undefined || d.order_number !== undefined) {
        await upsertOrderRecord(driver, d, orderId, recordTime)
      }
      else if (op === 'cancel_order') {
        await driver.exec(
          `UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?`,
          [d.cancelledAt ?? d.cancelled_at ?? recordTime, recordTime, orderId],
        )
      }
      else if (op === 'close_order') {
        await driver.exec(
          `UPDATE orders SET status = 'fulfilled', closed_short_at = ?, updated_at = ? WHERE id = ?`,
          [d.closedShortAt ?? d.closed_short_at ?? recordTime, recordTime, orderId],
        )
      }
      else if (op === 'set_order_status' && d.status) {
        await driver.exec(
          `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
          [d.status, recordTime, orderId],
        )
      }

      if (d.sale && typeof d.sale === 'object' && d.sale.id) {
        await upsertSaleRecord(driver, d.sale, String(d.sale.id), recordTime)
      }
      continue
    }

    if (entityType === 'order_lines') {
      const orderId = d.order_id ?? d.orderId ?? entityId.split(':')[0]
      const sizeId = d.size_id ?? d.sizeId ?? entityId.split(':')[1]
      if (action === 'delete') {
        if (sizeId) {
          await driver.exec('DELETE FROM order_lines WHERE order_id = ? AND size_id = ?', [orderId, sizeId])
        }
        else {
          await driver.exec('DELETE FROM order_lines WHERE order_id = ?', [orderId])
        }
      }
      else {
        await driver.exec(
          `INSERT INTO order_lines (order_id, size_id, eggs, price_per_tray, line_total, dropped_eggs, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(order_id, size_id) DO UPDATE SET
             eggs = excluded.eggs,
             price_per_tray = excluded.price_per_tray,
             line_total = excluded.line_total,
             dropped_eggs = excluded.dropped_eggs,
             updated_at = excluded.updated_at`,
          [
            orderId,
            sizeId,
            Number(d.orderedEggs ?? d.eggs ?? 0),
            Number(d.price_per_tray ?? d.pricePerTray ?? 0),
            Number(d.line_total ?? d.lineTotal ?? 0),
            Number(d.dropped_eggs ?? d.droppedEggs ?? 0),
            d.created_at ?? d.createdAt ?? recordTime,
            d.updated_at ?? d.updatedAt ?? recordTime,
          ],
        )
      }
      continue
    }

    // 6. Sales (create_sale, update_sale, void_sale)
    if (
      op === 'create_sale'
      || op === 'update_sale'
      || op === 'void_sale'
      || entityType === 'sales'
    ) {
      const saleId = d.id ?? d.saleId ?? entityId
      if (action === 'delete') {
        await driver.exec('DELETE FROM sale_lines WHERE sale_id = ?', [saleId])
        await driver.exec('DELETE FROM sales WHERE id = ?', [saleId])
        continue
      }

      if (d.saleNumber !== undefined || d.sale_number !== undefined) {
        await upsertSaleRecord(driver, d, saleId, recordTime)
      }
      else if (op === 'void_sale') {
        await driver.exec(
          `UPDATE sales SET voided_at = ?, updated_at = ? WHERE id = ?`,
          [d.voidedAt ?? d.voided_at ?? recordTime, recordTime, saleId],
        )
      }

      if (d.order && typeof d.order === 'object' && d.order.id) {
        await upsertOrderRecord(driver, d.order, String(d.order.id), recordTime)
      }
      continue
    }

    if (entityType === 'sale_lines') {
      const saleId = d.sale_id ?? d.saleId ?? entityId.split(':')[0]
      const sizeId = d.size_id ?? d.sizeId ?? entityId.split(':')[1]
      if (action === 'delete') {
        if (sizeId) {
          await driver.exec('DELETE FROM sale_lines WHERE sale_id = ? AND size_id = ?', [saleId, sizeId])
        }
        else {
          await driver.exec('DELETE FROM sale_lines WHERE sale_id = ?', [saleId])
        }
      }
      else {
        await driver.exec(
          `INSERT INTO sale_lines (sale_id, size_id, eggs, price_per_tray, line_total, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(sale_id, size_id) DO UPDATE SET
             eggs = excluded.eggs,
             price_per_tray = excluded.price_per_tray,
             line_total = excluded.line_total,
             updated_at = excluded.updated_at`,
          [
            saleId,
            sizeId,
            Number(d.eggs ?? 0),
            Number(d.price_per_tray ?? d.pricePerTray ?? 0),
            Number(d.line_total ?? d.lineTotal ?? 0),
            d.created_at ?? d.createdAt ?? recordTime,
            d.updated_at ?? d.updatedAt ?? recordTime,
          ],
        )
      }
    }
  }

  // Advance cursor monotonically if latestVersion > 0
  if (latestVersion > 0) {
    await driver.exec(
      `UPDATE sync_state
       SET last_pulled_version = MAX(last_pulled_version, ?),
           last_pulled_at = ?,
           updated_at = ?
       WHERE id = 'default'`,
      [latestVersion, now, now],
    )
  }

  return { appliedCount: changes.length, latestVersion }
}
