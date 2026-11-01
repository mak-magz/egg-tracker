// Isomorphic SQLite schema for tenant databases (used both in browser SQLite-WASM and server libSQL).
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// --- Farm Settings (Local & Tenant metadata) ---
export const farmSettings = sqliteTable('farm_settings', {
  id: text('id').primaryKey().default('default'),
  farmName: text('farm_name').notNull().default('My Farm'),
  eggsPerTray: integer('eggs_per_tray').notNull().default(30),
  currency: text('currency').notNull().default('PHP'),
  deviceId: text('device_id').notNull().default('D1'),
  onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Local Sequential Counters ---
export const localCounters = sqliteTable('local_counters', {
  id: text('id').primaryKey(), // 'sales' | 'orders'
  nextNumber: integer('next_number').notNull().default(1),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// Compatibility counters (for server Turso migration compatibility)
export const saleCounters = sqliteTable('sale_counters', {
  id: integer('id').primaryKey().default(1),
  nextNumber: integer('next_number').notNull().default(1),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const orderCounters = sqliteTable('order_counters', {
  id: integer('id').primaryKey().default(1),
  nextNumber: integer('next_number').notNull().default(1),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Farm Sizes ---
export const sizes = sqliteTable(
  'sizes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull(),
    colorSlot: integer('color_slot').notNull(),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('sizes_color_slot_key').on(table.colorSlot),
  ],
)

export const sizeSubmissions = sqliteTable('size_submissions', {
  id: text('id').primaryKey(),
  sizeId: text('size_id')
    .notNull()
    .references(() => sizes.id),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Daily Production ---
export const production = sqliteTable(
  'production',
  {
    id: text('id').primaryKey(),
    producedOn: text('produced_on').notNull(),
    sizeId: text('size_id').references(() => sizes.id),
    quality: text('quality', { enum: ['good', 'reject'] }).notNull(),
    eggs: integer('eggs').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    index('production_date_idx').on(table.producedOn),
    index('production_size_idx').on(table.sizeId),
  ],
)

export const productionSubmissions = sqliteTable('production_submissions', {
  id: text('id').primaryKey(),
  producedOn: text('produced_on').notNull(),
  hadBefore: integer('had_before', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Clients ---
export const clients = sqliteTable(
  'clients',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: text('phone'),
    defaultPrice: real('default_price'),
    archivedAt: text('archived_at'),
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    index('clients_name_idx').on(table.name),
  ],
)

export const clientSubmissions = sqliteTable('client_submissions', {
  id: text('id').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id),
  payloadHash: text('payload_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Orders & Lines ---
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    orderNumber: text('order_number').notNull(), // Formatted collision-free text: e.g. 'D1-0001' or '1'
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id),
    orderDate: text('order_date').notNull(),
    wantedBy: text('wanted_by'),
    status: text('status', {
      enum: ['requested', 'confirmed', 'ready', 'partially_fulfilled', 'fulfilled', 'cancelled'],
    }).notNull().default('requested'),
    cancelledAt: text('cancelled_at'),
    closedShortAt: text('closed_short_at'),
    convertedFromSaleNumber: text('converted_from_sale_number'),
    version: integer('version').notNull().default(1),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('orders_number_key').on(table.orderNumber),
    index('orders_date_idx').on(table.orderDate, table.orderNumber),
    index('orders_client_idx').on(table.clientId),
  ],
)

export const orderLines = sqliteTable(
  'order_lines',
  {
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    sizeId: text('size_id')
      .notNull()
      .references(() => sizes.id),
    eggs: integer('eggs').notNull(),
    pricePerTray: real('price_per_tray').notNull(),
    lineTotal: real('line_total').notNull(),
    droppedEggs: integer('dropped_eggs').notNull().default(0),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    primaryKey({ columns: [table.orderId, table.sizeId] }),
    index('order_lines_size_idx').on(table.sizeId),
  ],
)

export const orderSubmissions = sqliteTable('order_submissions', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  payloadHash: text('payload_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Sales & Lines ---
export const sales = sqliteTable(
  'sales',
  {
    id: text('id').primaryKey(),
    saleNumber: text('sale_number').notNull(), // Formatted collision-free text: e.g. 'D1-0001' or '1'
    clientId: text('client_id').references(() => clients.id),
    type: text('type', { enum: ['delivery', 'on_site'] }).notNull(),
    saleDate: text('sale_date').notNull(),
    orderId: text('order_id').references(() => orders.id),
    orderNumber: text('order_number'),
    version: integer('version').notNull().default(1),
    voidedAt: text('voided_at'),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('sales_number_key').on(table.saleNumber),
    index('sales_date_idx').on(table.saleDate, table.saleNumber),
    index('sales_client_idx').on(table.clientId),
    index('sales_order_idx').on(table.orderId),
  ],
)

export const saleLines = sqliteTable(
  'sale_lines',
  {
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    sizeId: text('size_id')
      .notNull()
      .references(() => sizes.id),
    eggs: integer('eggs').notNull(),
    pricePerTray: real('price_per_tray').notNull(),
    lineTotal: real('line_total').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    primaryKey({ columns: [table.saleId, table.sizeId] }),
    index('sale_lines_size_idx').on(table.sizeId),
  ],
)

export const saleSubmissions = sqliteTable('sale_submissions', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  payloadHash: text('payload_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Offline Outbox Mutations (Client-side sync queue) ---
export const outboxMutations = sqliteTable(
  'outbox_mutations',
  {
    id: text('id').primaryKey(), // Client-generated UUID
    deviceId: text('device_id').notNull(),
    mutationType: text('mutation_type').notNull(),
    payload: text('payload').notNull(), // JSON serialized parameters
    occurredAt: text('occurred_at').notNull(), // ISO timestamp
    status: text('status', { enum: ['pending', 'in_flight', 'applied', 'failed'] }).notNull().default('pending'),
    error: text('error'),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    index('outbox_status_idx').on(table.status, table.createdAt),
  ],
)

// --- Sync State (Client tracking) ---
export const syncState = sqliteTable('sync_state', {
  id: text('id').primaryKey().default('default'),
  tenantId: text('tenant_id'),
  cloudUrl: text('cloud_url'),
  cloudToken: text('cloud_token'),
  lastPulledVersion: integer('last_pulled_version').notNull().default(0),
  lastPulledAt: text('last_pulled_at'),
  lastPushedAt: text('last_pushed_at'),
  status: text('status', { enum: ['local_only', 'synced', 'syncing', 'error'] }).notNull().default('local_only'),
  lastError: text('last_error'),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Cloud Change Log (Authoritative Turso CDC log per tenant) ---
export const changeLog = sqliteTable(
  'change_log',
  {
    version: integer('version', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(), // 'sizes' | 'production' | 'clients' | 'sales' | 'sale_lines' | 'orders' | 'order_lines' | 'farm_settings'
    entityId: text('entity_id').notNull(),
    action: text('action', { enum: ['insert', 'update', 'delete'] }).notNull(),
    deviceId: text('device_id').notNull(),
    occurredAt: text('occurred_at').notNull(),
    data: text('data').notNull(), // Serialized JSON payload
  },
  table => [
    index('change_log_version_idx').on(table.version),
  ],
)
