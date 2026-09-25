# Egg Farm Tracker — Architecture & Backend Specification (v1)

> **Purpose:** context brief for building the app in Cowork. Consolidates the architecture,
> tech stack, multi-tenancy model, and data model decided during planning.
> Companion docs: `egg-farm-app-ui-spec.md` (screens, components, flows).
> Scope: **online web app** — offline support was considered and deliberately dropped for v1.

---

## 1. What This App Is

A **multi-tenant SaaS** for chicken egg farms to track:
- **Production** — daily egg collection, by size and quality.
- **Inventory** — current sellable eggs on hand (computed, by size).
- **Sales** — eggs sold, with delivery as one fulfillment option; includes delivery status.
- **Clients** — the farm's customers (referenced by sales).

Built SaaS-first (multiple farms as tenants) even though v1 is used by a single owner-operator.
Starts as one farm's tool; designed so other farms can use it later without re-architecting.

### v1 scope
Auth · Dashboard/metrics · Production tracking · Inventory · Sales (incl. deliveries) · Client list.

### Explicitly out of v1
Customer invoicing / accounts-receivable · delivery routing/scheduling · SaaS billing (charging farms) · realtime dashboards · offline support · payment-status tracking · feed/mortality/health/flock-management.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend + backend | **Nuxt.js (SSR) + TypeScript** — one codebase, one language |
| Server logic | **Nuxt server routes (Nitro)** — privileged ops + business logic |
| Database | **Supabase (hosted PostgreSQL)** |
| Auth | **Supabase Auth** |
| Hosting | **Vercel** (hosts Nuxt frontend + server routes) |
| UI library | **Nuxt UI v4 + Tailwind CSS** (see UI spec) |

### Why this stack
- **All-TypeScript** collapses frontend + backend into one language and gives **shared types end-to-end** — a Supabase schema change surfaces as compile errors in the UI. (A separate Go backend was considered and rejected: the Nuxt server layer covers the same needs — privileged operations, business logic — without a second language or deploy. Go would only have been justified by heavy concurrent processing or long-running connections, which this app doesn't need.)
- **Relational data** (production, sales, clients, inventory with clean foreign-key relationships and aggregations) fits **PostgreSQL** far better than a NoSQL store.
- **Supabase** bundles Postgres + Auth + generated types in one platform, minimizing glue.

### Stack constraints to respect at build time
- **Serverless execution model (Vercel):** Nuxt server routes run as serverless functions, not a long-running process.
  - **No persistent connection pool** — connect to Supabase through its **connection pooler** (transaction mode), or via `supabase-js`. Do not hold a classic long-lived pool.
  - **Execution time limits** — long-running work (large reports, batch jobs) must not live in a request handler; defer to a worker / scheduled job (e.g. Vercel Cron) when that need arises.
- **Service-role key is strictly server-side** — only in Nuxt's `server/` directory, in server-only runtime config, never bundled to the client. The browser uses the **anon key** only (RLS protects it).
- If a long-running process is ever needed (real pool, background workers, no timeout), the fork is a Node host running Nuxt as a persistent server — keeps all-TypeScript, drops serverless constraints.

### Pinned versions (settled in `docs/features/00-project-scaffold.md` §3.1, 2026-09-25)
Nuxt **4.5** (the `app/` directory layout, with `server/` and `shared/`) · Nuxt UI **4.x** (it bundles `@nuxt/fonts`, `@nuxt/icon` and `@nuxtjs/color-mode`) · Tailwind **4** · `@nuxtjs/supabase` **2.x** (on `@supabase/ssr`, with its redirect turned off in favour of our own middleware) · TypeScript **~6.0** (not 7; vue-tsc needs the TS 6 API) · Node **24** · Vitest **5** for unit tests · pgTAP via `supabase test db` for DB and isolation tests · ESLint via `@nuxt/eslint`.

---

## 3. Multi-Tenancy

**Model: shared tables with a `tenant_id` column, enforced by Row Level Security (RLS).**
(Not schema-per-tenant.)

### Why shared tables (not schema-per-tenant)
- One migration per change (vs N migrations across N schemas).
- Onboarding a tenant is a row insert (vs provisioning a whole schema).
- Cross-tenant analytics (internal/admin) are a single query.
- Postgres handles many tenants comfortably in shared tables.
- Schema-per-tenant only wins for noisy-neighbor isolation, per-tenant customization, or contractual physical separation — none needed in v1.
- **Escape hatch preserved:** a large tenant can later be peeled into its own schema/database while the rest stay pooled.

### Isolation rules (non-negotiable)
1. **Every table carries `tenant_id`** from the very first migration — even while testing with one farm.
2. **RLS enforces isolation at the database level** — a user only ever sees their tenant's rows.
3. **Derive `tenant_id` server-side** from the authenticated user (via a `users`/`memberships` mapping). **Never trust a `tenant_id` sent by the client.**
4. **Centralize tenant scoping** in a repository/query layer so `tenant_id` is injected automatically, not hand-written per query.
5. **Test isolation explicitly** — a CI test asserting tenant A cannot read tenant B's rows. Clients are the first real PII → a natural first isolation target.

### Auth integration
- Supabase Auth issues JWTs; the Nuxt server validates them (JWT secret, or JWKS endpoint for asymmetric keys).
- A `users` / `memberships` table maps a user to one or more `tenant_id`s; the server resolves tenant per request.
- **Defense-in-depth:** keep RLS armed even when server routes use a privileged role. Connect with a non-superuser role and set tenant context per transaction (e.g. `SET LOCAL app.current_tenant`) so RLS backstops a forgotten `WHERE tenant_id = ...` — turning a missed filter from a data leak into an empty result.

### As built (feature 00, 2026-09-25)
- **Server DB access in v1 = `supabase-js` acting as the signed-in user** (`serverSupabaseClient(event)`: the publishable key plus the user's session cookies). PostgREST runs every query as the non-superuser role `authenticated` and `SET LOCAL`s the user's JWT claims per transaction. That is how the defense-in-depth rule above is met, and there's no privileged DB credential in the request path. A direct pooler connection with `SET LOCAL app.current_tenant` is reserved for future non-request work (cron/workers), which must then also `set local role authenticated`.
- **Tenant resolution helper:** `app.current_tenant_id()`. It's security definer, lives in the `app` schema (which PostgREST doesn't expose), and reads `memberships` by `auth.uid()`. In v1 each user has exactly one membership (`unique (user_id)`). Every RLS policy calls it as `(select app.current_tenant_id())`.
- **Repository layer:** `server/utils/db.ts` → `TenantDb.scoped(table)` pre-applies `.eq('tenant_id', …)` to select/update/delete and injects `tenant_id` into inserts. Routes use `defineTenantHandler` / `defineAuthedHandler` (`server/utils/handlers.ts`), and only repositories touch the client.
- **Service role at runtime:** none in v1. The secret key is used only by the local provisioning CLI (`server/cli/provision.ts`) and isn't configured on Vercel.
- **Multi-statement atomic writes** are Postgres functions (`security invoker`) called through `rpc`, so each one runs as a single transaction. *(Feature 01)* Repositories call them through `TenantDb.rpc(fn, args)`, which injects `p_tenant_id` from the server context (never from the request). Every such function first calls `app.assert_tenant(p_tenant_id)`, which raises unless it equals `app.current_tenant_id()`, so RLS **and** the repository filter must agree, as for table queries. Domain errors use custom SQLSTATEs (`TM001`…, never the `PT` prefix), which repositories map to `ApiErrorData`. Reads that could exceed PostgREST's `max_rows` (1000) aggregate in SQL and return a single `jsonb` value.
- **RLS policy template for every tenant-owned table:**
  ```sql
  alter table public.<t> enable row level security;
  revoke all on public.<t> from anon;
  create policy <t>_select on public.<t> for select to authenticated using (tenant_id = (select app.current_tenant_id()));
  create policy <t>_insert on public.<t> for insert to authenticated with check (tenant_id = (select app.current_tenant_id()));
  create policy <t>_update on public.<t> for update to authenticated using (tenant_id = (select app.current_tenant_id())) with check (tenant_id = (select app.current_tenant_id()));
  create policy <t>_delete on public.<t> for delete to authenticated using (tenant_id = (select app.current_tenant_id()));
  ```
- **Isolation test:** pgTAP in `supabase/tests/database/`, run with `bun run test:db`. A new table adds one row to `tests.tenant_table_registry()`, and the shared A-vs-B checker covers it. A coverage meta-test fails if any `public` table is missing RLS, `tenant_id`, `updated_at` or its registry row.

### Where the client/server line is drawn
- **Ordinary reads/writes** may go through `supabase-js` with RLS protecting them.
- **Nuxt server routes** own: privileged operations (service-role), business logic & derived metrics (inventory, dashboard figures, any anomaly flags), tenant provisioning, and anything that must not live in the client or a SQL policy.
- **RLS stays on regardless**, as the database-level backstop.

---

## 4. Canonical Unit: Individual Eggs

**All quantities are stored as individual egg counts.** Trays are a display/input convenience only.

- Eggs are the indivisible atomic unit — they divide cleanly and need no conversion for production or inventory math. (Storing in trays would force fractional trays, e.g. 207 eggs = 6.9 trays, and lose remainders.)
- **Eggs-per-tray is a per-tenant setting** (defaulted in v1, e.g. 30). Stored as tenant config — **never hardcoded** — so per-farm tray sizes are possible later without migration.
- **Conversion happens only at the edges** (input and display), never in the stored data or inventory math. The frontend converts using a single shared helper; the database only ever holds egg counts.
- **History-proof:** because sales store egg counts, changing a farm's tray size later doesn't corrupt past records — only the display changes.

---

## 5. Data Model

Core domains: **Production**, **Inventory** (computed), **Sales** (absorbs deliveries), **Clients**, plus tenant/user tables. Every table carries `tenant_id`. Consider `updated_at` on every table (useful for "recently changed" queries and a cheap hedge that keeps a future sync/offline layer unblocked).

### Tenant tables (built in feature 00)
- **`tenants`** `(id uuid pk, name text 1–100 chars, eggs_per_tray integer not null default 30 check (>= 1), created_at, updated_at)`. It's the **root**: its `id` *is* the tenant id, so it has no separate `tenant_id` column. It's the one named exception to "every table has `tenant_id`", and it's still RLS-filtered by `id`.
- **`memberships`** `(id, tenant_id → tenants, user_id → auth.users, created_at, updated_at, unique (user_id))`: one farm per user in v1.
- Owners have **read-only** access to both tables (no write grants and no write policies). Farms and memberships are created only by provisioning (the Admin API plus service-role-only SQL functions).

### Design principle: categories are data, not columns
Size, quality, and fulfillment type are **data**, not fixed columns (no `large_count`, `jumbo_count`). Totals are `SUM`/`GROUP BY`, not hand-summed columns.
- **Sizes are per-farm rows** (owner decision, feature 01): each farm has its own ordered list in `sizes`, and rows reference it by `size_id`. Adding, renaming or reordering a size is a row change, never an `ALTER TABLE`, and never a code change. The app never hardcodes the list.
- **Quality and fulfillment type are column values** (`text` + check constraint). A new one is a new allowed value.

### Sizes (built in feature 01)
- **`sizes`** `(id, tenant_id → tenants, name text 1–40 chars, sort_order int >= 0, color_slot smallint >= 0, archived_at timestamptz null, created_at, updated_at)`, with `unique (tenant_id, id)` (the composite-FK target), a unique name per farm (case-insensitive), and a unique `color_slot` per farm (a colour is never reused, so archived sizes keep theirs in past charts).
- Seeded with **Small, Medium, Large, Jumbo** (slots 0–3) by a trigger on `tenants` insert (`app.seed_default_sizes`), and backfilled for existing farms by the migration. The default list lives only in that function.
- **Never deleted.** Retiring a size sets `archived_at` (the "Farm settings: sizes" feature). Past production keeps pointing at it, and a rename relabels past days without changing counts.
- Owners have read-only access in feature 01. The size list is sent with the farm in `GET /api/me` (`FarmSummary.sizes`).

### Production
Shape: **`(produced_on, size_id, quality, eggs)`** + `tenant_id` (as built in feature 01; the planning names were `date, size, quality, count`).
- **produced_on**: the owner's local calendar date (a `date`, sent by the device).
- **size_id**: a row of the farm's `sizes`. **Nullable**: null means "size doesn't apply", used only for rejects. A composite FK `(tenant_id, size_id) → sizes (tenant_id, id)` guarantees it's the same farm's size.
- **quality**: `good` / `reject` (extensible: dirty, etc.). Always present.
- **eggs**: individual eggs, `between 1 and 1000000` (`production_eggs_range`; the upper bound equals `MAX_EGGS_PER_LINE` in `shared/constants/production.ts`). Zero amounts aren't stored.
- **Table-level bounds hold for every write path**, including direct PostgREST writes with the owner's JWT. The `production_bounds` trigger (`before insert or update`) enforces:
  - `produced_on` not after UTC today + 1 (TM002);
  - the per-line cap (TM007);
  - a good row's size is **active** (TM001), unless that size already has a row on the same farm-day (an update to an existing line, which lets Edit day correct a day holding a since-archived size). On UPDATE, the size must be active only if the row's size, date, quality or tenant changes.
- **Good eggs are always sized and rejects are always unsized** (owner decision, 2026-09-25): check `(quality = 'reject') = (size_id is null)`. Sized or graded rejects ("cracked large") aren't in v1. If they're added later, this check is relaxed and a sized-reject row still never enters inventory.
- **One row per (farm, date, quality, size)** (`unique nulls not distinct`). Logging a date again **adds** to that day's rows (upsert). Edit day **replaces** the day's rows, and Delete day removes them by date. All three are single `security invoker` functions, so each save is all-or-nothing. An "add" carries a client-generated submission id recorded in `production_submissions`, so a retried save never counts twice.
- A morning's collection = several rows, e.g. `Large/good/264`, `Medium/good/148`, `(null)/reject/5`.

### Rejects
- **A dead end.** Tracked at production (so the farm knows its loss/quality rate) but **never enter sellable inventory and are never sold.**
- Reject rows: `size_id = null`, `quality = reject`. One unsized amount per day.

### Inventory
- **Computed, not stored** — on-hand = (sellable eggs produced) − (eggs sold). No stored running figure to drift out of sync.
- **Tracked by size** (by the farm's `sizes`: large on hand, jumbo on hand, …), because sales are sized. On-hand = `sum(production.eggs) where quality = 'good' group by size_id` minus completed sales by `size_id`.
- Only **good** production counts; rejects excluded.
- **On-hand = physically present right now.** Inventory subtracts **at delivery/completion**, not at order time (a pending delivery hasn't left yet). If "available to promise" is ever needed, that's a separate computed notion (on-hand minus pending) — not in v1.

### Sales (absorbs Deliveries)
The tracked entity is a **sale**; **delivery is one fulfillment method**, not a separate concept. Some sales are delivered to a client; some are on-site/home sales with no delivery.

Shape (roughly): **`(date_ordered, date_delivered, status, size, quantity, price, fulfillment_type, client_id, tenant_id)`**
- **date_ordered** — when agreed/created. Always set.
- **date_delivered** — **nullable**; null until fulfilled, then stamped. Doubles as the "outstanding" signal.
- **status** — `pending` / `complete`. **Lifecycle only.**
- **size_id** — the egg size sold (sales are always sized), from the same per-farm `sizes` list, with the same composite `(tenant_id, size_id)` FK as production.
- **quantity** — stored in **individual eggs** (frontend accepts trays/loose, converts).
- **price** — **snapshotted onto the sale** at sale time. A client's default price may *pre-fill* the form but is **not** authoritative for historical sales.
- **fulfillment_type** — `delivery` / `on_site` (extensible: `pickup`).
- **client_id** — **nullable**; delivered sales reference a client, on-site sales may have none (no fake "walk-in" record needed).

**Derived views (no separate tables/screens):**
- "Deliveries" = `WHERE fulfillment_type = 'delivery'`.
- "Outstanding/pending" = `WHERE status = 'pending'` (≡ `date_delivered IS NULL`).
- The label "sold" shown for a completed on-site sale is computed from status + fulfillment_type, not stored.

**The single completion event.** For a delivery, `status` flips `pending → complete` at fulfillment. That one event simultaneously (1) sets `status = complete`, (2) stamps `date_delivered`, (3) decrements inventory. Implement as **one update**, not three things to keep in sync. On-site sales are **born `complete`** (`date_ordered` = `date_delivered` = now).

**Why one status field (not two).** A second `fulfillment_status` was considered and rejected for v1: for a delivery, "delivered" and "complete" are the same event, so the second field would only echo the first. Two axes earn their place only when they can disagree — e.g. paid-but-not-yet-delivered — which requires payment tracking, out of v1 scope. When payment is added later, introduce a second axis named for what it tracks (e.g. `payment_status`).

### Clients
- A simple **per-tenant list of the farm's customers** (shops/restaurants/individuals). NOT the SaaS's tenants.
- Fields: name (required), optional contact/address, optional default price (a convenience that pre-fills sale forms — not authoritative for past sales).
- Carries `tenant_id`; RLS-isolated. First table with real-world PII → first isolation-test target.
- Referenced by sales via nullable `client_id`.
- On delete: past sales keep their snapshotted client name/price, so deletion shouldn't corrupt history — prefer **soft-delete/archive**.

---

## 6. Dashboard / Metrics

Keep tightly scoped — a small, fixed set (no configurability in v1):
- Today's / this week's production (eggs, by size).
- Current on-hand inventory (by size).
- Recent sales / deliveries.
- Outstanding (pending) deliveries.
- Optionally lay rate (eggs ÷ hen count) — only if hen counts are tracked.

---

## 7. Realtime (deferred)

Not required for v1 (daily collection is low-frequency; manual refresh/polling suffices). If added later:
- **Push from the write path** — all writes flow through the Nuxt server, the natural broadcast point (e.g. WebSockets on a persistent-server deployment). Fits the centralized-writes design.
- Postgres `LISTEN/NOTIFY` for change signals not originating in the app.
- Logical replication / CDC (what Supabase's own realtime uses) — heavyweight, almost certainly unnecessary here.
- Note: Supabase's built-in realtime rides the data-API path; a server-centric architecture trades that for control, hence the WebSocket fallback.

---

## 8. Build Order

The data model (the expensive-to-reverse part) is settled. Remaining work is mechanical translation:
1. **Schema** — tables, columns, foreign keys, `tenant_id` on every table (and `updated_at`).
2. **RLS policies** — enforce tenant isolation; write the cross-tenant isolation test.
3. **Supabase Auth wiring** — JWT validation in Nuxt server, user↔tenant mapping, tenant-resolution middleware.
4. **Repository/query layer** — centralized `tenant_id` scoping; connect via Supabase pooler.
5. **Server routes** — CRUD + business logic (inventory computation, dashboard metrics).
6. **Frontend** — production entry, sales/deliveries, clients, dashboard; tray↔egg conversion helper. (See UI spec.)

---

## 9. Carry-Forward Rules (all decided — easy to lose)

- **`tenant_id` on every table** from the first migration; **RLS on**, even when routing through the server.
- **Derive tenant server-side**; never trust the client.
- **Service-role key server-only**; browser uses anon key + RLS.
- **Connect via Supabase connection pooler** (serverless + Postgres).
- **Canonical unit = eggs**; trays are display/input only; **eggs-per-tray is a per-tenant setting** (defaulted, not hardcoded).
- **Inventory = physically on-hand**; subtract **at delivery/completion**.
- **Price snapshot on sales** — store on the sale, not a live client lookup.
- **Nullables are meaningful:** `size_id` null (rejects), `client_id` null (on-site sales), `date_delivered` null (pending).
- **Categories as data** (size, quality, fulfillment_type are values, not columns). **Sizes are per-farm rows** in `sizes`, referenced by `size_id` with a composite `(tenant_id, size_id)` FK; never hardcode the list. **Rejects are always unsized.**
- **One `status` field** (`pending`/`complete`) in v1; add a second axis only when payment arrives.
- **`updated_at` on every table** — cheap hedge; do not design *against* a future offline/sync layer.

---

## 10. Notes for Cowork

- This spec reflects the **planned** architecture from the design conversation. If the actual codebase has diverged, treat the code as source of truth and update this doc to match rather than the reverse.
- Two open implementation conventions left to build-time (both noted in the UI spec): the exact **quantity input convention** (two fields vs decimal-trays) and **client delete = soft-delete/archive** behavior.
- Real values still needed from the owner: actual **tray size** (eggs per tray) and whether **hen counts** are tracked (drives the optional lay-rate metric).
  - *Update 2026-09-25:* the owner chose **30 eggs per tray** as the farm default (the `tenants.eggs_per_tray` column default) and **trays + loose as two fields** for quantity entry. Hen counts are still open.
