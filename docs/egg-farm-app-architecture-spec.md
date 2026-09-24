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

### Design principle: categories are data, not columns
Size, quality, and fulfillment type are **column values**, not fixed columns (no `large_count`, `jumbo_count`). Adding a new size or quality later = a new allowed value (an insert), not an `ALTER TABLE`. Totals are `SUM`/`GROUP BY`, not hand-summed columns.

### Production
Shape: **`(date, size, quality, count)`** + `tenant_id`.
- **size** — small / medium / large / jumbo. **Nullable** (null = "size doesn't apply", used for rejects).
- **quality** — good / reject (extensible: dirty, etc.). Always present.
- **count** — number of individual eggs.
- **size and quality are independent axes** — a large egg can be good or reject; a small egg can be good or reject. Separate columns so you can slice either way.
- A morning's collection = several rows, e.g. `large/good/200`, `large/reject/5`, `medium/good/80`, `(null)/reject/12`.

### Rejects
- **A dead end.** Tracked at production (so the farm knows its loss/quality rate) but **never enter sellable inventory and are never sold.**
- Reject rows: `size = null`, `quality = reject`.

### Inventory
- **Computed, not stored** — on-hand = (sellable eggs produced) − (eggs sold). No stored running figure to drift out of sync.
- **Tracked by size** (large on hand, jumbo on hand, …), because sales are sized.
- Only **good** production counts; rejects excluded.
- **On-hand = physically present right now.** Inventory subtracts **at delivery/completion**, not at order time (a pending delivery hasn't left yet). If "available to promise" is ever needed, that's a separate computed notion (on-hand minus pending) — not in v1.

### Sales (absorbs Deliveries)
The tracked entity is a **sale**; **delivery is one fulfillment method**, not a separate concept. Some sales are delivered to a client; some are on-site/home sales with no delivery.

Shape (roughly): **`(date_ordered, date_delivered, status, size, quantity, price, fulfillment_type, client_id, tenant_id)`**
- **date_ordered** — when agreed/created. Always set.
- **date_delivered** — **nullable**; null until fulfilled, then stamped. Doubles as the "outstanding" signal.
- **status** — `pending` / `complete`. **Lifecycle only.**
- **size** — the egg size sold (sales are always sized).
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
- **Nullables are meaningful:** `size` null (rejects), `client_id` null (on-site sales), `date_delivered` null (pending).
- **Categories as data** (size, quality, fulfillment_type are values, not columns).
- **One `status` field** (`pending`/`complete`) in v1; add a second axis only when payment arrives.
- **`updated_at` on every table** — cheap hedge; do not design *against* a future offline/sync layer.

---

## 10. Notes for Cowork

- This spec reflects the **planned** architecture from the design conversation. If the actual codebase has diverged, treat the code as source of truth and update this doc to match rather than the reverse.
- Two open implementation conventions left to build-time (both noted in the UI spec): the exact **quantity input convention** (two fields vs decimal-trays) and **client delete = soft-delete/archive** behavior.
- Real values still needed from the owner: actual **tray size** (eggs per tray) and whether **hen counts** are tracked (drives the optional lay-rate metric).
