# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Pre-code: the repo has only planning specs, no application code, package.json, or git history yet. There are no build/lint/test commands yet. When the project is scaffolded, add them here.

## Spec documents (read before building)

| File | Covers |
|---|---|
| `docs/egg-farm-app-product-doc.md` | Why/for whom: problem, users, goals, scope, open owner questions |
| `docs/egg-farm-app-architecture-spec.md` | **Most current backend spec**: stack, multi-tenancy, data model, build order |
| `docs/egg-farm-app-ui-spec.md` | Screens, components, flows, Nuxt UI v4 implementation notes |
| `docs/egg-farm-app-design.md` | Older, fuller decision log (predates the architecture spec) |

If the code and the specs disagree once code exists, the code wins. Update the spec to match.

## What it is

A multi-tenant SaaS for egg farms that tracks production, computed inventory, sales (deliveries are one kind of sale), and clients. v1 has a single owner-operator who logs data quickly on a phone. It is an online-only web app with no offline support.

**Stack:** Nuxt (SSR) + TypeScript, Nitro server routes for business logic and privileged operations, Supabase (Postgres + Auth), hosted on Vercel, UI in Nuxt UI v4 + Tailwind.

**Planned build order:** schema → RLS policies + cross-tenant isolation test → Supabase Auth/JWT + tenant-resolution middleware → tenant-scoped repository layer → server routes (CRUD, inventory, dashboard metrics) → frontend.

## Rules that span the whole system

**Tenancy and security**
- Every table has `tenant_id` (and `updated_at`) starting with the first migration. Tenancy uses shared tables with RLS, not a schema per tenant.
- Derive `tenant_id` on the server from the authenticated user through a `memberships`-style mapping. Never trust a `tenant_id` sent by the client.
- Tenant scoping lives in one repository/query layer, not in hand-written filters on each query. Keep RLS on even for server routes: connect as a non-superuser role and set tenant context per transaction (e.g. `SET LOCAL app.current_tenant`).
- The service-role key is used only under `server/`, through server-only runtime config. The browser uses the anon key and RLS.
- Vercel runs serverless, so connect through the Supabase connection pooler (transaction mode) or `supabase-js`. Don't keep a long-lived pool, and don't put long-running work in request handlers.

**Units and data model**
- The stored unit is always individual eggs. Trays exist only at input and display, through one shared conversion helper. Eggs-per-tray is a per-tenant setting and must never be hardcoded.
- Categories are data, not columns. Size, quality, and fulfillment type are column values; never add columns like `large_count`.
- Production rows are `(date, size, quality, count)`. Rejects have `size = null` and `quality = reject`, and they never enter inventory or sales.
- Inventory is computed, never stored: good production minus completed sales, grouped by size. Pending deliveries are not subtracted.
- Sales cover deliveries too; there is no separate deliveries table. `status` is either `pending` or `complete`, and a second status field is added only when payment tracking arrives.
- Marking a delivery complete is one update: it sets `status = complete` and stamps `date_delivered`, and inventory follows automatically. On-site sales are created already `complete`.
- Sales store a snapshot of `price`. A client's default price only pre-fills the form.
- Null values carry meaning: `size` (reject), `client_id` (on-site sale), `date_delivered` (pending).
- Clients are the farm's customers, not tenants. Delete them with a soft-delete or archive so past sales keep their data.

## UI notes

- Nuxt UI v4 changed a lot from v3. Check the current v4 docs for component names, props, and theming instead of relying on memory.
- Build screens from Nuxt UI components. Set the theme once in Nuxt UI config and use raw Tailwind classes mainly for layout.
- Custom components: the quantity input and display (trays + loose ↔ eggs), a multi-size production entry form that writes several rows in one submit, and a production day-summary card.
- Navigation has 5 destinations (Dashboard, Production, Sales, Inventory, Clients): a sidebar on desktop, bottom tabs and a FAB on mobile.

## Open decisions

- How quantities are entered (two fields for trays + loose, or decimal trays). Pick one and use it everywhere.
- Real eggs-per-tray value, and whether hen counts are tracked (the optional lay-rate metric depends on it).
