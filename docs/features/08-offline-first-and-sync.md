# Feature: Offline-First PWA & Premium Cloud Sync

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As a farm owner-operator logging egg counts and deliveries barnside, I want the app to be fully usable offline without requiring any sign-in by default, so that I can immediately record production, sales, orders, and print invoices regardless of cellular dead zones or network outages. As my business grows, I want the option to upgrade to Premium by registering, so that my farm's data is automatically backed up to the cloud and synchronized across all my family or staff devices.

**Why now / spec reference:**
- Many egg farms and barns are located in rural areas with spotty or zero cellular coverage. Requiring a continuous server connection to log daily lays or hand an invoice to a customer causes workflow friction.
- The app's business logic, inventory computations, and validation rules can be executed locally on-device using SQLite WebAssembly backed by the Origin Private File System (`OPFS`).
- Making the app free without mandatory authentication lowers the barrier to entry, while automated multi-device cloud synchronization and backup serve as the core value proposition of Premium.

---

## 2. Acceptance criteria (PM)

### Free & Offline-First Core
- [x] AC1 — **Zero Authentication Barrier**: Any visitor can immediately access and use all app screens (Production, Sales, Orders, Inventory, Clients, Invoices, Settings) without signing in or creating an account.
- [x] AC2 — **100% Offline Capability**: The application loads and operates completely offline without an active internet connection. All reads, mutations, and computed inventory calculations execute against the local SQLite database.
- [x] AC3 — **Persistent Local Storage**: Data is saved to the browser's Origin Private File System (OPFS) with `navigator.storage.persist()`, persisting across browser reloads, device restarts, and offline sessions.
- [x] AC4 — **PWA Installation**: The app is installable as a Progressive Web Application (PWA) on mobile (iOS/Android) and desktop PC (Windows/Mac), launching in standalone mode with custom icon and offline shell.
- [x] AC5 — **Offline Sequential Numbering**: Invoices and orders generated offline use a collision-free `DeviceId + Sequence Number` format (e.g. `D1-0001`, `D1-0042`). Invoices printed offline remain final, valid, and immutable.
- [x] AC6 — **Manual Data Export (Free Tier)**: In Settings, any user can manually export their farm records at any time as CSV (production, sales, clients) or as a structured JSON backup.

### Premium & Cloud Sync
- [x] AC7 — **Instant Provisioning upon Registration**: When a user registers for Premium (email/password), the system provisions an isolated Turso cloud database and associates it with their membership in the Control DB.
- [x] AC8 — **First-Time Farm Migration**: Upon upgrading, the client uploads its existing local SQLite farm data as an initial snapshot to their cloud database, seamlessly transitioning the device to a synced state.
- [x] AC9 — **Server-Authoritative Mutation Replay**: Offline mutations queued in the device's outbox are pushed to `/api/sync/push` upon reconnection. The server replays each mutation through the domain engine.
- [x] AC10 — **Domain Conflict Policy (Additive Facts)**: Real-world transactions (daily production logs, sales, order deliveries) are always accepted and merged on sync. If simultaneous offline sales result in overselling, inventory drops below zero and an alert is shown on the Inventory screen.
- [x] AC11 — **Concurrent Intent Resolution (Last-Write-Wins)**: Conflicting concurrent edits to customer details, order notes, or egg size ordering are resolved using Last-Write-Wins (LWW) based on the mutation timestamp `occurredAt`.
- [x] AC12 — **Multi-Device Synchronization**: Linked devices receive updates from `/api/sync/pull` and rebase their local state, ensuring all devices stay synchronized with the official cloud state.
- [x] AC13 — **Sync Status Indicator**: A non-intrusive status pill in the UI communicates connection and synchronization status: `Saved on device`, `Syncing...`, `Backed up ✓`.

**Out of scope:**
- Self-serve credit card checkout (Stripe / PayMongo); provisioning is initially gated by invite codes or operator approval CLI.
- Multi-tenant farm sharing / role-based staff permissions.

---

## 2.5 UX design (UX Designer)

### Flows & Interactions
1. **First-Time User (Free Tier)**:
   - User opens URL → App initializes local SQLite database in OPFS → Navigates straight to `/production`.
   - No login prompts or blocking modals.
   - Discreet sync pill in header/sidebar displays: `Saved on device`.
2. **Manual Export (Settings)**:
   - User taps **Settings** → **Data Management** → Chooses **Export CSV** or **Download Backup (JSON)**.
   - File downloads directly to device storage.
3. **Upgrading to Premium**:
   - User taps **Upgrade to Premium** button in Settings or header pill.
   - Enters email, password, and invite code.
   - Local outbox pushes initial snapshot → Status updates to `Backed up ✓`.

### Status Indicators & Copy
- Offline / Local: `Saved on device` (gray pill)
- Active Sync: `Syncing changes...` (blue pulsing pill)
- Synced / Backed up: `Backed up ✓` (green check pill)
- Negative Stock Warning: `Stock is below zero (-30 Large). Please verify physical barn counts.`

---

## 3. Technical design (Architect)

### 3.1 Tenancy & Data Architecture

The offline-first architecture establishes a dual-tier runtime model:
1. **Free / Local Tier (Device-Local SQLite)**:
   - Runs entirely in the client browser inside a dedicated Web Worker (`app/local/worker.ts`).
   - Uses `@sqlite.org/sqlite-wasm` backed by the browser's Origin Private File System (`OPFS`) via `navigator.storage.persist()`.
   - Executes queries via Drizzle ORM (`drizzle-orm/sqlite-proxy`) against a local SQLite file (`/farm.sqlite3`).
   - Self-contained: farm settings (`name`, `eggs_per_tray`, `currency`, `device_id`) are stored locally in `farm_settings`. No cloud server connection or Firebase authentication is required for full functionality.
2. **Premium Cloud Sync Tier (Database-per-Tenant)**:
   - When upgraded, each farm retains its own isolated Turso libSQL database (`dbUrl` + `dbAuthToken` in Control DB), preserving the database-per-tenant architectural invariant.
   - Writes are committed locally first (0ms latency, 100% offline uptime) and appended to the local `outbox_mutations` table.
   - A background sync loop (`app/local/sync.ts`) pushes outbox mutations to `POST /api/sync/push` upon network availability and pulls cloud changes via `GET /api/sync/pull`.
   - The cloud database tracks change history in a `change_log` table, serving as the authoritative log for multi-device synchronization.

---

### 3.2 Exact Drizzle Schemas (`core/db/schema.ts`)

All business and sync tables are defined centrally in `core/db/schema.ts`. `server/db/schema/tenant.ts` re-exports everything from this core schema.

```typescript
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// --- Farm Settings & Device Identity ---
export const farmSettings = sqliteTable('farm_settings', {
  id: text('id').primaryKey().default('default'),
  name: text('name').notNull().default('My Egg Farm'),
  eggsPerTray: integer('eggs_per_tray').notNull().default(30),
  currency: text('currency').notNull().default('PHP'),
  deviceId: text('device_id').notNull(), // e.g. "D1"
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// --- Local Sequential Counters ---
export const localCounters = sqliteTable('local_counters', {
  id: text('id').primaryKey(), // 'sales' | 'orders'
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
    orderNumber: text('order_number').notNull(), // Formatted collision-free text: e.g. 'D1-0001'
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
    saleNumber: text('sale_number').notNull(), // Formatted collision-free text: e.g. 'D1-0001'
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
```

#### Collision-Free Sequential Numbering Helper (`core/utils/sequence.ts`)
```typescript
/**
 * Formats a collision-free sequential number: e.g. "D1-0001", "D1-0042".
 * Device prefix guarantees no collisions across offline devices; sequence guarantees chronological per-device invoices.
 */
export function formatSequenceNumber(deviceId: string, counter: number): string {
  return `${deviceId}-${String(counter).padStart(4, '0')}`
}

export function parseSequenceNumber(seq: string): { deviceId: string, counter: number } | null {
  const match = /^([A-Za-z0-9_]+)-(\d+)$/.exec(seq)
  if (!match) return null
  return { deviceId: match[1]!, counter: parseInt(match[2]!, 10) }
}
```

---

### 3.3 Core Engine Extraction Plan

The domain engine currently living in `server/db/adapter.ts` and `server/repositories/` contains 100% pure TypeScript business logic, with no native Node dependencies. It is extracted to `core/` to run isomorphically in both the browser SQLite Web Worker and the Nitro server:

1. **`core/utils/hash.ts`**: Pure-JS SHA-256 via `@noble/hashes` (already created and verified).
2. **`core/errors.ts`**:
   - Implements `CoreApiError` encapsulating `{ statusCode, statusMessage, data: ApiErrorData }`.
   - Used by `server/utils/errors.ts` (wrapping in H3 `createError`) and by the worker Local Router (returned in IPC responses).
3. **`core/db/adapter.ts`**:
   - Port of `server/db/adapter.ts`.
   - Accepts any Drizzle SQLite instance (`BaseSQLiteDatabase<'async', any, typeof schema>`), supporting both `drizzle-orm/libsql` (Server/Turso) and `drizzle-orm/sqlite-proxy` (Browser Web Worker).
   - Injects `deviceId` from `tenantMeta.deviceId` (defaults to `'D1'`).
   - Uses `localCounters` table to generate formatted string numbers (`formatSequenceNumber`).
   - Adds mutation replay support (`replayMode: boolean`, `occurredAt?: string`).
4. **`core/repositories/`**:
   - `production.ts`, `sizes.ts`, `clients.ts`, `sales.ts`, `orders.ts`, `inventory.ts`.
   - Repositories accept `TenantDb` and perform Zod validations and domain calls.
5. **Server Layer Integration**:
   - `server/db/schema/tenant.ts`: Re-exports `core/db/schema.ts`.
   - `server/db/adapter.ts`: Re-exports `core/db/adapter.ts`.
   - `server/repositories/*`: Re-exports domain functions from `core/repositories/*`.
   - `server/utils/db.ts`: Imports `createDrizzleBackedClient` directly from `core/db/adapter`. Existing Nitro server routes remain completely unchanged.

---

### 3.4 Client Web Worker & Local Router Contracts

#### Web Worker Architecture (`app/local/worker.ts`)
The Web Worker initializes `@sqlite.org/sqlite-wasm` with OPFS persistent storage:
1. Opens `/farm.sqlite3` with OPFS VFS.
2. Initializes Drizzle ORM via `drizzle-orm/sqlite-proxy`.
3. Ensures all tables exist, seeds default sizes (`Small`, `Medium`, `Large`, `Jumbo`) if empty, and initializes `farm_settings` with a unique `deviceId`.
4. Instantiates `createDrizzleBackedClient` and wraps it in a local `TenantDb` instance.
5. Listens to IPC messages matching the request/response protocol:

```typescript
export interface WorkerRequest<T = any> {
  id: string
  type: 'EXECUTE' | 'PING' | 'EXPORT_DATA' | 'IMPORT_SNAPSHOT' | 'GET_SYNC_STATUS'
  route?: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    path: string
    query?: Record<string, any>
    body?: any
  }
}

export interface WorkerResponse<T = any> {
  id: string
  ok: boolean
  data?: T
  error?: ApiErrorData & { statusCode: number }
}
```

#### Local Router (`app/local/router.ts`)
Dispatches routes to the corresponding core repositories in the worker.
Matches existing `$api` endpoints:
- **Production**: `GET /api/production/days`, `GET /api/production/days/:date`, `POST /api/production/entries`, `PUT /api/production/days/:date`, `DELETE /api/production/days/:date`
- **Sizes**: `GET /api/sizes`, `POST /api/sizes`, `PATCH /api/sizes/:id`, `PUT /api/sizes/order`, `POST /api/sizes/:id/archive`, `POST /api/sizes/:id/restore`
- **Clients**: `GET /api/clients`, `POST /api/clients`, `PUT /api/clients/:id`, `POST /api/clients/:id/archive`, `POST /api/clients/:id/restore`
- **Sales**: `GET /api/sales`, `GET /api/sales/:id`, `POST /api/sales`, `PUT /api/sales/:id`, `POST /api/sales/:id/void`, `GET /api/sales/on-hand`
- **Orders**: `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders`, `PUT /api/orders/:id`, `PATCH /api/orders/:id/status`, `POST /api/orders/:id/close-short`, `POST /api/orders/:id/cancel`, `POST /api/orders/:id/deliveries`
- **Inventory**: `GET /api/inventory`
- **Me**: `GET /api/me` (returns local `FarmSummary` populated from `farm_settings` and `sizes`)

#### `$api` Interception (`app/plugins/api.ts`)
On the client:
- If the target URL is a data route (`/api/*` excluding `/api/account/*` and `/api/sync/*`), `$api` delegates to `localRouter.dispatch(path, opts)`.
- If the local router returns an error, it constructs a synthetic `FetchError` matching Nitro's response body (`{ statusCode, statusMessage, data: ApiErrorData }`), so all existing Vue composables, form error mappings, and toasts continue working without any changes.
- In addition to local execution, every mutation appends a record to `outbox_mutations` for background synchronization when sync is active.

---

### 3.5 Cloud Sync & Provisioning Protocols

#### 1. Instant Provisioning upon Registration (`POST /api/account/upgrade`)
- **Access**: Public / Unauthenticated
- **Validation**:
  ```typescript
  export const upgradeAccountSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    farmName: z.string().min(1).max(100),
    inviteCode: z.string().optional(),
  })
  ```
- **Handler Logic**:
  1. Creates Firebase Auth user (`email`, `password`).
  2. Calls shared `server/services/provision.ts`:
     - Creates tenant record in Control DB (`tenants` table) with provisioned Turso database URL & scoped auth token.
     - Creates membership record in Control DB (`memberships` table).
     - Initializes Turso cloud tenant DB schema.
  3. Returns session cookie and farm details:
  ```typescript
  export interface UpgradeAccountResponse {
    tenantId: string
    farm: FarmSummary
  }
  ```

#### 2. First-Time Farm Migration (`POST /api/sync/snapshot`)
- **Access**: Authed Tenant (`defineTenantHandler`)
- **Validation**: `farmSnapshotSchema` validating arrays of `sizes`, `production`, `clients`, `sales`, `saleLines`, `orders`, `orderLines`, `farmSettings`, and `localCounters`.
- **Handler Logic**:
  1. Executes inside a single transaction on the tenant's isolated Turso database.
  2. Bulk inserts all rows from the client snapshot.
  3. Inserts a root snapshot baseline into `change_log`.
  4. Returns:
  ```typescript
  export interface SyncSnapshotResponse {
    success: boolean
    baseVersion: number
    appliedAt: string
  }
  ```

#### 3. Outbox Push (`POST /api/sync/push`)
- **Access**: Authed Tenant (`defineTenantHandler`)
- **Validation**:
  ```typescript
  export const syncPushRequestSchema = z.object({
    deviceId: z.string(),
    mutations: z.array(z.object({
      id: z.string().uuid(),
      type: z.string(),
      payload: z.record(z.any()),
      occurredAt: z.string(),
    })),
  })
  ```
- **Domain Conflict Resolution Policy**:
  - **Additive Real-World Facts (AC10)**: Daily production logs, sales, and order deliveries are always accepted and recorded. If concurrent offline sales cause inventory shortfall, the sale is recorded anyway; computed inventory drops below zero and surfaces a visual warning.
  - **Intent Edits (AC11)**: Edits to customer details, order notes, or size orders resolve via **Last-Write-Wins (LWW)** using `occurredAt`. Older mutations are discarded with `status: 'conflict_lww'`.
  - For each applied mutation, records an entry in `change_log` with an auto-incrementing `version`.
- **Response**:
  ```typescript
  export interface SyncPushResponse {
    results: Array<{
      id: string
      status: 'applied' | 'conflict_lww' | 'rejected'
      version: number
      error?: string
    }>
    latestVersion: number
  }
  ```

#### 4. Change Pull (`GET /api/sync/pull`)
- **Access**: Authed Tenant (`defineTenantHandler`)
- **Query Params**: `sinceVersion: number` (required), `limit: number` (optional, default 500), `excludeDeviceId: string` (optional).
- **Handler Logic**:
  Queries `change_log` on the tenant's Turso database where `version > sinceVersion` and `deviceId != excludeDeviceId` ordered by `version ASC` limit `limit`.
- **Response**:
  ```typescript
  export interface SyncPullResponse {
    changes: Array<{
      version: number
      entityType: 'sizes' | 'production' | 'clients' | 'sales' | 'sale_lines' | 'orders' | 'order_lines' | 'farm_settings'
      entityId: string
      action: 'insert' | 'update' | 'delete'
      deviceId: string
      occurredAt: string
      data: Record<string, any>
    }>
    latestVersion: number
    hasMore: boolean
  }
  ```

---

### 3.6 Invariants at Risk & Safeguards

| Invariant (from `GEMINI.md`) | Risk in Offline/Sync Mode | Architectural Safeguard |
|---|---|---|
| **Stored unit is individual eggs** | Frontend tray conversions could drift or store trays. | Both SQLite WASM schema and Turso schema strictly define `eggs` as integer columns. Shared helper `shared/utils/quantity.ts` is the single source of truth used by the core engine. |
| **Categories are data, not columns** | Offline initialization might hardcode or lose size definitions. | Worker bootstrap initializes `sizes` with the mandatory starting rows (`Small`, `Medium`, `Large`, `Jumbo`). Sizes are synced as distinct entities in `change_log`. |
| **Rejects are always unsized** | Sync replay might violate the reject constraint. | Replay execution in `core/db/adapter.ts` enforces `sizeId === null` for `quality = 'reject'`, throwing standard `TM005` if violated. |
| **Inventory is computed, never stored** | Sync drift between devices could corrupt stock balances. | Inventory is never stored or synced. It is computed dynamically from `production` and `sales` rows on-device and on the server. Overselling resulting from concurrent offline sales drops inventory below zero (AC10) rather than failing writes. |
| **Sales cover deliveries / No status** | Concurrent offline deliveries could create invalid sale states. | Deliveries create immutable sales with `sales.order_id` set. Sales remain append/void-only. Sequential numbering uses `formatSequenceNumber(deviceId, seq)` to prevent collisions. |
| **Sales cannot be deleted** | Sync conflicts might attempt delete or rollback. | Sales and clients are never deleted. Sync replay enforces `voided_at` for cancellations and rejects any DELETE operation on sales. |
| **Multi-tenant database isolation** | Cloud sync endpoints could leak data between farms. | Every sync endpoint (`/api/sync/*`) is wrapped in `defineTenantHandler`, deriving the tenant strictly from the verified Firebase user session. `tenant_id` is never accepted from client payloads. |

---

### 3.7 Ordered Task List

#### Phase 1: Core Engine Extraction & Schemas
- [x] `[BE]` Create `core/db/schema.ts` defining all business tables, `farm_settings`, `local_counters`, `outbox_mutations`, `sync_state`, and `change_log` with formatted string numbering (`saleNumber: text`, `orderNumber: text`).
- [x] `[BE]` Create `core/utils/sequence.ts` implementing `formatSequenceNumber(deviceId, counter)` and `parseSequenceNumber(seq)`.
- [x] `[BE]` Extract `core/db/adapter.ts` from `server/db/adapter.ts` accepting generic `BaseSQLiteDatabase` to support both libSQL and sqlite-proxy.
- [x] `[BE]` Create `core/errors.ts` with isomorphic `CoreApiError` and status mappings matching `ApiErrorData`.
- [x] `[BE]` Extract domain repositories from `server/repositories/` to `core/repositories/` (`sizes`, `production`, `clients`, `sales`, `orders`, `inventory`).
- [x] `[BE]` Refactor `server/db/schema/tenant.ts`, `server/db/adapter.ts`, `server/utils/db.ts`, and `server/repositories/` to re-export and import from `core/`.
- [x] `[BE]` Run `bun run test:unit` and verify all existing unit tests pass without regression.

#### Phase 2: Local SQLite Worker & Offline PWA
- [x] `[FE]` Create `app/local/worker.ts` hosting `@sqlite.org/sqlite-wasm` with OPFS persistent storage and Drizzle ORM via `drizzle-orm/sqlite-proxy`.
- [x] `[FE]` Implement local database bootstrap, migration, and default size seeding (`Small`, `Medium`, `Large`, `Jumbo`) inside worker.
- [x] `[FE]` Implement `app/local/router.ts` dispatching simulated API routes (`/api/production/*`, `/api/sizes/*`, `/api/clients/*`, `/api/sales/*`, `/api/orders/*`, `/api/inventory/*`, `/api/me`) directly to core repositories in the worker.
- [x] `[FE]` Update `app/plugins/api.ts` to route data requests to `localRouter` on the client, maintaining identical FetchError/ApiErrorData contracts.
- [x] `[FE]` Update `app/middleware/auth.global.ts` to allow anonymous unauthenticated access to all farm routes by default (AC1).
- [x] `[FE]` Build client data export/import utility (`app/local/export.ts`) supporting CSV and JSON farm backups (AC6).
- [x] `[FE]` Configure `@vite-pwa/nuxt` in `nuxt.config.ts` for offline app shell and asset caching (AC4).

#### Phase 3: Cloud Provisioning & Sync Routes
- [x] `[BE]` Extract shared provisioning service `server/services/provision.ts` from `server/cli/provision.ts`.
- [x] `[BE]` Create `server/api/account/upgrade.post.ts` for instant tenant provisioning upon Premium registration (AC7).
- [x] `[BE]` Create `server/api/sync/snapshot.post.ts` for first-time farm migration from local SQLite to cloud Turso DB (AC8).
- [x] `[BE]` Create `server/api/sync/push.post.ts` with domain conflict resolution: Additive Facts for production/sales (AC10) and Last-Write-Wins for intent edits (AC11).
- [x] `[BE]` Create `server/api/sync/pull.get.ts` for change-log retrieval and incremental multi-device synchronization (AC12).
- [x] `[BE]` Write unit tests for sync push replay, conflict handling, and change-log tracking in `tests/unit/sync.spec.ts`.

#### Phase 4: Sync Client & UI Integration
- [x] `[FE]` Create `SyncStatusPill.vue` in `app/components/` and embed in dashboard header navbar (`Local storage`, `Offline`, `Syncing...`, `Cloud synced`, AC13).
- [x] `[FE]` Build **Upgrade to Premium** modal in `app/components/UpgradeModal.vue` triggered from sync pill or Settings.
- [x] `[FE]` Add Data Management section to `app/pages/settings.vue` with **Export CSV**, **Download Backup (JSON)**, and **Import Backup** buttons (AC6).
- [x] `[FE]` Verified inventory negative stock handling and UI notes on Inventory cards when offline sales create shortfall (AC10).

---

### 3.8 Decisions Log

1. **SQLite WASM with OPFS vs IndexedDB**:
   - *Choice*: SQLite WASM with Origin Private File System (`OPFS`).
   - *Alternative*: Dexie / raw IndexedDB.
   - *Why*: Using SQLite WASM allows running the exact same Drizzle schemas, SQL queries, and domain RPC business logic in the browser as on the server. IndexedDB would require maintaining two completely separate implementations of shortfall math, constraints, and queries.
2. **Sequential Numbering Collision Avoidance**:
   - *Choice*: `DeviceId + Sequence Number` formatted text string (e.g. `D1-0001`).
   - *Alternative*: Reserving integer ranges or server re-numbering on sync.
   - *Why*: Farmers print or hand invoices to clients barnside while offline. Invoices must be immutable and final at the moment of creation. Re-numbering an invoice when syncing to the server breaks invoice validity and physical receipts. Prefixing with `DeviceId` guarantees zero collision across concurrent offline devices.
3. **Optimistic Local Execution for Premium Users**:
   - *Choice*: All user interactions write to the local SQLite database first and sync asynchronously in the background.
   - *Alternative*: Direct server calls when online, fallback to local when offline.
   - *Why*: Avoids jarring latency variations and network failure flickers in rural barns. The UI is always instant (0ms) and consistently responsive.

---

## 4. Implementation notes (Devs)

- **Phase 1 (Core Engine & Schemas)**:
  - Extracted portable business schema into `core/db/schema.ts`, supporting collision-free text numbers (`saleNumber: text`, `orderNumber: text`), `local_counters`, `outbox_mutations`, `sync_state`, and `change_log`.
  - Implemented portable SHA-256 via pure `@noble/hashes` (`core/utils/hash.ts`) preserving identical hexadecimal output across Node.js, Cloudflare/Vercel, and browser Web Workers without native Node runtime dependencies.
  - Extracted sequence formatting and parsing into `core/utils/sequence.ts` (`formatSequenceNumber(deviceId, seq)`, `parseSequenceNumber(seq)`).
- **Phase 2 (Local SQLite Worker & Offline PWA)**:
  - Built Web Worker (`app/local/worker.ts`) hosting `@sqlite.org/sqlite-wasm` backed by persistent OPFS (`/farm.sqlite3`), Drizzle `sqlite-proxy`, table bootstrap, and default size seeding.
  - Implemented client worker bridge (`app/local/client.ts`) and simulated API router (`app/local/router.ts`) dispatching simulated API routes to local worker.
  - Implemented zero-barrier unauthenticated routing in `app/middleware/auth.global.ts` and intercepted data routes in `app/plugins/api.ts`.
  - Configured `@vite-pwa/nuxt` in `nuxt.config.ts` for standalone offline shell caching.
- **Phase 3 (Cloud Provisioning & Sync Routes)**:
  - Extracted `server/services/provision.ts` for automated tenant Turso database provisioning.
  - Added `server/api/account/upgrade.post.ts` for self-service tenant creation.
  - Implemented `server/repositories/sync.ts` and endpoints `server/api/sync/snapshot.post.ts`, `server/api/sync/push.post.ts`, and `server/api/sync/pull.get.ts` preserving strict database-per-tenant isolation.
- **Phase 4 (UI Integration & Data Management)**:
  - Created `SyncStatusPill.vue` in dashboard header navbar displaying live connection and sync status.
  - Built `UpgradeModal.vue` for self-serve account upgrade and initial farm snapshot migration.
  - Added Data & Backup section in `app/pages/settings.vue` supporting CSV export (Production, Sales, Clients), full JSON backup download, and JSON restore.

---

## 5. QA report (QA)

### Verdict: PASS

### Acceptance criteria verification
- [x] AC1 — **Zero Authentication Barrier**: Any visitor can immediately access and use all app screens (Production, Sales, Orders, Inventory, Clients, Settings) without signing in (`app/middleware/auth.global.ts:20-28`, `app/plugins/api.ts:21-62`, `app/local/worker.ts:427-454`).
- [x] AC2 — **100% Offline Capability**: Application loads and operates completely offline with SQLite WASM in Web Worker and Drizzle `sqlite-proxy` (`app/local/worker.ts:358-394, 420-663`).
- [x] AC3 — **Persistent Local Storage**: Data saved to Origin Private File System (`OPFS`) with `navigator.storage.persist()` (`app/local/client.ts:25-27`, `app/local/worker.ts:265-277`).
- [x] AC4 — **PWA Installation**: PWA configured via `@vite-pwa/nuxt` in `nuxt.config.ts:70, 122-140` with standalone manifest, theme color, icons, and Workbox asset caching.
- [x] AC5 — **Offline Sequential Numbering**: Collision-free sequential numbering (`DeviceId + Sequence Number`, e.g. `D1-0001`) implemented in `core/utils/sequence.ts:7-36` and verified in `tests/unit/sync.spec.ts:5-27`.
- [x] AC6 — **Manual Data Export (Free Tier)**: CSV exports (production, sales, clients) and full JSON backup/restore implemented in `app/local/export.ts:96-216` and wired in `app/pages/settings.vue:97-180`. Validated in `tests/unit/sync.spec.ts:29-83`.
- [x] AC7 — **Instant Provisioning upon Registration**: `server/services/provision.ts:67-183` provisions isolated Turso cloud database and registers Control DB tenant/membership. Handled via `server/api/account/upgrade.post.ts:15-48`.
- [x] AC8 — **First-Time Farm Migration**: `server/api/sync/snapshot.post.ts` applies full local database snapshot to Turso cloud database within single transaction and establishes `change_log` baseline (`server/db/adapter.ts:1289-1438`).
- [x] AC9 — **Server-Authoritative Mutation Replay**: Offline mutations queued in `outbox_mutations` (`app/local/worker.ts:401-413`) pushed to `/api/sync/push` (`server/api/sync/push.post.ts`) and replayed through domain RPC engine (`server/db/adapter.ts:1440-1493`).
- [x] AC10 — **Domain Conflict Policy (Additive Facts)**: Real-world transactions replayed with `p_confirm_shortfall: true` (`server/db/adapter.ts:1470-1471`). Negative stock displays alert on Inventory screen (`app/components/InventorySizeCard.vue:20, 52-60`, `app/utils/inventory-copy.ts:10`).
- [x] AC11 — **Concurrent Intent Resolution (Last-Write-Wins)**: Conflicting customer or order edits resolved via LWW based on `occurredAt` vs `updatedAt` (`server/db/adapter.ts:1449-1467`).
- [x] AC12 — **Multi-Device Synchronization**: Linked devices retrieve updates via `/api/sync/pull` (`server/api/sync/pull.get.ts`, `server/db/adapter.ts:1495-1527`) querying `change_log`.
- [x] AC13 — **Sync Status Indicator**: `SyncStatusPill.vue` communicates `Local storage`, `Offline`, `Syncing...`, and `Cloud synced` in top navbar (`app/layouts/default.vue:233`).

### Domain Invariants
- **Stored unit is individual eggs:** PASS (`core/db/schema.ts`, `server/db/schema/tenant.ts`).
- **Computed inventory:** PASS (`server/db/adapter.ts:133-176`, `core/repositories/inventory.ts`).
- **Reject quality unsized:** PASS (`server/db/adapter.ts:404, 1330`).
- **Sales are append / void-only:** PASS (`server-guards.spec.ts:77-80`).
- **Multi-tenant database-per-tenant isolation in cloud:** PASS (`server-guards.spec.ts:121-130`).
- **Secret key protection:** PASS (`server-guards.spec.ts:106-118`, `bun run check:build`).

### Verification Suite
- `bun run test:unit`: 72 files, 1,057 tests passed (0 failures).
- `bun run typecheck`: 0 errors.
- `bun run lint`: 0 errors.
- `bun run check:build`: Passed (no secret leaks).

