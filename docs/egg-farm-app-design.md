# Egg Farm Production & Sales Tracker — Design Reference (v1)

> Reference doc for building v1. Captures the decisions made during planning.
> Scope: a multi-tenant SaaS for egg farms to track production, inventory, sales, and customers.

---

## 1. Product Summary

A production-tracking app for chicken egg farms that also handles sales (including deliveries to clients and on-site/home sales). Built as a **multi-tenant SaaS from day one** — multiple farms ("tenants") use the same app, each seeing only their own data.

### v1 Feature Set
- **Auth** — user sign-in, mapped to a tenant.
- **Dashboard / Metrics** — a small, fixed set of figures (see §7).
- **Production tracking** — daily egg collection, by size and quality.
- **Inventory** — current sellable eggs on hand, by size (computed, not stored).
- **Sales** — records of eggs sold, with delivery as one fulfillment option. Includes status tracking for deliveries.
- **Client list** — a simple, referenceable list of the farm's customers.

### Deliberately OUT of v1 scope
- Invoicing / accounts-receivable for customers (sales record a price, but no AR system).
- Delivery routing or scheduling.
- SaaS billing (charging farms to use the app) — separate concern, later.
- Realtime dashboards (can be added later; see §8).
- Payment status tracking (the second status axis; see §6).

---

## 2. Tech Stack

- **Frontend + backend:** Nuxt.js (SSR) with TypeScript — one codebase, one language.
- **Server-side logic:** Nuxt server routes (Nitro) handle privileged operations and business logic.
- **Database + Auth:** Supabase (hosted PostgreSQL + Supabase Auth).
- **Hosting:** Vercel (hosts both the Nuxt frontend and its server routes).

### Stack rationale
- All-TypeScript collapses two languages into one and gives shared types end-to-end (Supabase generated types → compile errors in the UI on schema change). Originally considered a separate Go backend; the Nuxt server layer covers the same needs (privileged ops, business logic) without a second language/deploy.
- Data is relational (flocks/production/sales/clients with clean FK relationships), so PostgreSQL fits better than a NoSQL store.

### Stack gotchas to handle at build time
- **Serverless execution model (Vercel):** Nuxt server routes run as serverless functions, not a long-running process.
  - **No persistent connection pool** — connect to Supabase through its **connection pooler** (transaction mode), or via supabase-js. Do not hold a classic long-lived pool.
  - **Execution time limits** — long-running work (big reports, batch jobs) must not live in a request handler. Defer to a worker / scheduled job (e.g. Vercel Cron) when that need arises.
- **Service-role key must stay strictly server-side** — only in Nuxt's `server/` directory, never bundled to the client. The browser uses the anon key only (RLS protects it). Keep the service-role key in server-only runtime config.
- If a long-running process is ever needed (real pool, background workers, no timeout), a Node host running Nuxt as a persistent server is the fork to consider — keeps all-TS, drops serverless constraints.

---

## 3. Multi-Tenancy

**Model: shared tables with a `tenant_id` column, enforced by Row Level Security (RLS).** (Not schema-per-tenant.)

### Why shared tables
- One migration per change (vs N migrations across N schemas).
- Tenant onboarding is a row insert (vs provisioning a whole schema).
- Cross-tenant analytics (e.g. internal admin) are one query.
- Postgres handles many tenants fine in shared tables.
- Schema-per-tenant only wins for noisy-neighbor isolation, per-tenant customization, or contractual physical separation — none of which v1 needs. Hybrid escape hatch exists later: peel one large tenant into its own schema/db while the rest stay pooled.

### Isolation rules
- **Every table carries `tenant_id`** from the first migration, even while testing with a single farm.
- **RLS enforces tenant isolation at the database level** — a user only ever sees their tenant's rows.
- **Derive `tenant_id` server-side** from the authenticated user (via a `users`/`memberships` mapping). NEVER trust a `tenant_id` sent by the client.
- **Test isolation explicitly** — a CI test asserting tenant A cannot read tenant B's rows. Run this early; clients are the first real-world PII, so they're a natural first test target.

### Auth integration
- Supabase Auth issues JWTs; the Nuxt server validates them (JWT secret, or JWKS endpoint for asymmetric keys).
- Keep a `users` / `memberships` table linking a user to one or more `tenant_id`s; resolve tenant per request server-side.
- **Defense-in-depth:** even though server routes may use a privileged role, keep RLS armed. Connect with a non-superuser role and set tenant context per transaction (e.g. `SET LOCAL app.current_tenant`) so RLS backstops a forgotten `WHERE tenant_id = ...`. Turns a missed filter from a breach into an empty result.
- **Centralize tenant scoping** in a repository/query layer so `tenant_id` is injected automatically, not hand-written per query.

---

## 4. Core Data Model

Three core domains: **Production**, **Inventory** (computed), **Sales**. Plus **Clients** and tenant/user tables.

### Canonical unit: INDIVIDUAL EGGS
- **Everything is stored in individual egg counts.** Eggs are the indivisible atomic unit; they divide cleanly and need no conversion for production or inventory math.
- **Trays are a display/input convenience only.** The frontend converts (trays ↔ eggs) at input and display; the database only ever holds egg counts.
- **Eggs-per-tray is a per-tenant setting** (defaulted in v1, e.g. 30). Store it as a tenant config value — do NOT hardcode the number in code. This allows per-farm tray sizes later without migration.
- The frontend reads the conversion factor from settings and does the math in a single shared helper (`eggsToTrays()` / `traysToEggs()`) so rounding/remainder behavior is consistent everywhere.
- Storing eggs is also history-proof: if a farm changes tray size later, past sales (stored in eggs) stay accurate; only the display changes.

### Production
Shape: `(date, size, quality, count)` — plus `tenant_id`.

- **size** — small / medium / large / jumbo. **Nullable.** Null = "size doesn't apply" (used for rejects).
- **quality** — good / reject (extend later: dirty, etc.). Always present.
- **count** — number of individual eggs.
- A morning's collection = several rows: e.g. `large/good/200`, `large/reject/5`, `medium/good/80`, `(null)/reject/12`.
- **size and quality are independent axes** — a large egg can be good or reject; a small egg can be good or reject. Kept as separate columns so you can slice either way ("all rejects regardless of size", "all large regardless of quality").
- **Categories are data, not columns.** Size and quality are column *values*, not fixed columns like `large_count`. Adding "peewee" or "dirty" later = a new allowed value (an insert), not an `ALTER TABLE`. Totals are `SUM(count)` / `GROUP BY`, not hand-summed columns.

### Rejects
- **Rejects are a dead end.** Tracked at production (so the farm knows its loss/quality rate), but **never enter sellable inventory and are never sold.**
- Reject rows have `size = null` (size irrelevant) and `quality = reject`.

### Inventory
- **Computed, not stored.** On-hand = (sellable eggs produced) − (eggs sold). No stored running figure to drift out of sync.
- **Tracked by size** (large on hand, jumbo on hand, etc.) because sales are sized.
- Only sellable (good) production counts toward inventory; rejects excluded.
- **On-hand means "physically present right now."** Inventory subtracts **at delivery/completion**, not at order time. (A pending delivery has not left yet, so it doesn't reduce stock.) If "available to promise" is ever needed, that's a separate computed notion (on-hand minus pending) — not in v1.

### Sales (absorbs Deliveries)
The thing being tracked is a **sale** (eggs left, money came in). **Delivery is one fulfillment method**, not a separate concept. Some sales are delivered to a client; some are on-site/home sales with no delivery.

Shape (roughly):
`(date_ordered, date_delivered, status, size, quantity, price, fulfillment_type, client_id, tenant_id)`

- **date_ordered** — when the sale was agreed/created. Always set.
- **date_delivered** — **nullable.** Null until fulfilled, then stamped. Doubles as the "what's outstanding" signal.
- **status** — `pending` / `complete`. (Lifecycle only — see §6.)
- **size** — the egg size sold (sales are always sized).
- **quantity** — stored in **individual eggs** (frontend accepts trays and/or loose eggs, converts to eggs).
- **price** — **snapshot the price onto the sale** at sale time. Do NOT look up the client's current price for historical sales. A client record may hold a *default* price that pre-fills the form, but the sale's own price is the source of truth.
- **fulfillment_type** — `delivery` / `on_site` (extend later, e.g. `pickup`).
- **client_id** — **nullable.** Delivered sales reference a client; on-site/home sales may have none (no fake "walk-in" record required).

Derived views:
- **"Deliveries" list** = `WHERE fulfillment_type = 'delivery'`.
- **"Outstanding/pending"** = `WHERE status = 'pending'` (equivalently `date_delivered IS NULL`).
- The label "sold" shown for a completed on-site sale is **computed from status + fulfillment_type**, not a stored status value.

### Status lifecycle (the single completion event)
For a delivery: `status` flips `pending → complete` at the moment it's fulfilled. That single event simultaneously:
1. sets `status = complete`,
2. stamps `date_delivered`,
3. decrements inventory.
These three are one event seen three ways → implement as **one update**, not three things to keep in sync.

On-site/home sales are **born `complete`** (ordered and fulfilled in the same instant; `date_ordered` and `date_delivered` equal).

### Clients
- A simple, per-tenant **list of the farm's customers** (the shops/restaurants/individuals it sells/delivers to). NOT the SaaS's tenants.
- Fields: name, optional contact/address, optional default price (a convenience that pre-fills sale forms — not authoritative for historical sales).
- Carries `tenant_id`; RLS-isolated like everything else. First table with real-world PII → first isolation test target.
- Referenced by sales via nullable `client_id`.

---

## 5. Where the line between client / data-API / server is drawn

Decided to route through the Nuxt server layer for control, but the practical split:
- **Ordinary reads/writes** can go via supabase-js with RLS protecting them.
- **Nuxt server routes** own: privileged operations (service-role), business logic & derived metrics (lay rate, inventory, anomaly flags), tenant provisioning, and anything that shouldn't live in the client or a SQL policy.
- RLS is kept on regardless, as the database-level backstop.

---

## 6. Status field design note (why ONE status field in v1)

Considered two fields (`fulfillment_status` + overall `status`). **Decided against for v1** because they'd move in lockstep — for a delivery, "delivered" and "complete" are the same event, so the second field just echoes the first and adds no information. On-site sales have no delivery progress to track.

Two fields only earns its place when the axes can **disagree** — e.g. a sale that's paid/confirmed (lifecycle) but not yet physically delivered (fulfillment). That requires payment tracking, which is **out of v1 scope**.

**Decision:** one `status` field, values `pending` / `complete`. When payment is added later, introduce a *second axis named for what it tracks* (e.g. `payment_status`), rather than splitting now.

---

## 7. Dashboard / Metrics (keep tightly scoped)

Decide the literal handful up front; resist configurability and chart-sprawl in v1. Suggested figures:
- Today's / this week's production (eggs, by size).
- Current on-hand inventory (by size).
- Recent sales / deliveries.
- Outstanding (pending) deliveries.
- Optionally lay rate (eggs ÷ hen count) if hen counts are tracked.

---

## 8. Realtime (deferred)

Not required for v1. Daily collection data is low-frequency; manual refresh or short polling suffices. If added later:
- **Push from the write path** — since all writes flow through the Nuxt server, that's the natural place to broadcast changes (e.g. via WebSockets in a persistent-server deployment). This fits the centralized-writes design.
- Postgres `LISTEN/NOTIFY` is an option for change signals not originating in the app.
- Logical replication / CDC (what Supabase's own realtime uses) is the heavyweight option — almost certainly unnecessary for this app.
- Note: Supabase's built-in realtime rides the data-API path; a pure-server architecture gives that up in exchange for control, hence the WebSocket fallback.

---

## 9. Build order / next steps

The data model above is the expensive-to-reverse part and is now settled. Remaining work is mechanical translation:
1. **Schema** — tables, columns, foreign keys, `tenant_id` on every table.
2. **RLS policies** — enforce tenant isolation; write the cross-tenant isolation test.
3. **Supabase Auth wiring** — JWT validation in Nuxt server, user↔tenant mapping, tenant resolution middleware.
4. **Repository/query layer** — centralized `tenant_id` scoping; connection via Supabase pooler.
5. **Server routes** — CRUD + business logic (inventory computation, metrics).
6. **Frontend** — screens for production entry, sales/deliveries, clients, dashboard; tray↔egg conversion helper.

---

## 10. Carry-forward reminders (easy to lose, all decided)

- **Price snapshot** on sales — store on the sale, not a live client lookup.
- **Canonical unit = eggs**; trays are display/input only; eggs-per-tray is a per-tenant setting (defaulted, not hardcoded).
- **Inventory = physically on-hand**, subtract at delivery/completion.
- **`tenant_id` on every table** from the first migration.
- **Service-role key server-only**; browser uses anon key + RLS.
- **Connect via Supabase connection pooler** (serverless + Postgres).
- **Keep RLS on** as defense-in-depth even when routing through the server.
- **Size nullable** (rejects); **client_id nullable** (home sales); **date_delivered nullable** (pending).
- **Categories as data** (size, quality, fulfillment_type are values, not columns).
