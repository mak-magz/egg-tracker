# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Feature 00 (scaffold: auth, tenancy, RLS foundation, app shell) is merged. Features are tracked in `docs/features/`. Setup is in `README.md`.

**Commands** (Bun; the local Supabase stack needs Docker):
- `bun run dev`: Nuxt dev server
- `bun run typecheck` / `bun run lint` (`lint:fix`)
- `bun run test:unit`: Vitest (a single file: `bunx vitest run tests/unit/<file>.spec.ts`)
- `bun run test:db`: pgTAP tests in `supabase/tests/database/` (the local stack must be running)
- `bun run test`: both
- `bun run db:start` / `db:stop` / `db:reset` (re-applies migrations) / `db:types` (regenerates `shared/types/database.types.ts`)
- `bun run provision`: local CLI that creates a farm and owner account (uses the secret key from `.env`)

## Spec documents (read before building)

| File | Covers |
|---|---|
| `docs/egg-farm-app-product-doc.md` | Why/for whom: problem, users, goals, scope, open owner questions |
| `docs/egg-farm-app-architecture-spec.md` | **Most current backend spec**: stack, multi-tenancy, data model, build order |
| `docs/egg-farm-app-ui-spec.md` | Screens, components, flows, Nuxt UI v4 implementation notes |
| `docs/egg-farm-app-design.md` | Older, fuller decision log (predates the architecture spec) |
| `docs/design/` | **The owner's UI design, and the source of truth for screen visuals, layout, and copy.** UX and frontend follow it; don't invent layouts. `Tamago Egg Farm Tracker.html` is the Claude Design bundle export (open it in a browser to view it). Read `source/template.html` instead: it holds the markup, the design tokens in the `<style>`, and a `text/x-dc` script with the screen logic and sample data. Run `node docs/design/extract.mjs` to regenerate `source/`. The logo is `tamago-logo.png`. |

If the code and the specs disagree once code exists, the code wins. Update the spec to match.

## What it is

A multi-tenant SaaS for egg farms that tracks production, computed inventory, sales (deliveries are one kind of sale), and clients. v1 has a single owner-operator who logs data quickly on a phone. It is an online-only web app with no offline support.

**Package manager:** **Bun** (`bun install`, `bun run <script>`, `bunx`). Don't use npm, npx, or `package-lock.json`. The app still runs on Node at runtime (Nuxt/Nitro, Vercel), and tests use Vitest via `bun run test:unit`, not `bun test`.

**Stack:** Nuxt (SSR) + TypeScript, Nitro server routes for business logic and privileged operations, Supabase (Postgres + Auth), hosted on Vercel, UI in Nuxt UI v4 + Tailwind.

**Planned build order:** schema → RLS policies + cross-tenant isolation test → Supabase Auth/JWT + tenant-resolution middleware → tenant-scoped repository layer → server routes (CRUD, inventory, dashboard metrics) → frontend.

## Rules that span the whole system

**Tenancy and security**
- Every table has `tenant_id` (and `updated_at`) starting with the first migration. Tenancy uses shared tables with RLS, not a schema per tenant.
- Derive `tenant_id` on the server from the authenticated user through a `memberships`-style mapping. Never trust a `tenant_id` sent by the client.
- Tenant scoping lives in one repository/query layer, not in hand-written filters on each query. RLS stays on for server routes: server data access uses **supabase-js acting as the signed-in user** (their JWT), so Postgres sees the non-superuser `authenticated` role, and RLS is enforced through `app.current_tenant_id()`. The repository layer adds the `tenant_id` filter as well. Don't switch to a privileged or direct-pooler connection with `SET LOCAL` without an architecture decision (see `docs/egg-farm-app-architecture-spec.md` §3).
- Multi-row writes are `security invoker` Postgres functions called through `TenantDb.rpc`, which passes `p_tenant_id` from the server context; each function asserts it equals `app.current_tenant_id()`.
- The service-role (secret) key is **not used at app runtime**. Only the local provisioning CLI (`server/cli/`) uses it, through server-only config. The browser uses the publishable (anon) key and RLS.
- Every server route is wrapped in `defineAuthedHandler` or `defineTenantHandler`, and a guard test enforces this. `tenants` is the root table (its `id` is the tenant id) and is the only table without a `tenant_id` column.
- Vercel runs serverless, so don't keep a long-lived pool and don't put long-running work in request handlers.
- Clients are the first personal data (names, phones). Never put them in logs (repositories log SQLSTATE codes, not error objects, because Postgres error details carry row values), in error messages, in the URL or search string, or in `/api/me` or the SSR payload (fetch the list on the client after mount). Clear client state on sign-out.

**Units and data model**
- The stored unit is always individual eggs. Trays exist only at input and display, through one shared conversion helper. Eggs-per-tray is a per-tenant setting and must never be hardcoded.
- Categories are data, not columns. **Egg sizes are per-farm rows in `sizes`** (ordered, with a stable colour slot, retired with `archived_at`, never deleted), referenced by `size_id`. Sizes are managed (add, rename, reorder, archive, restore) through `security invoker` functions: the colour slot and position are assigned by the database, an owner can never delete a size, and a farm always keeps one active size (a database trigger). Quality and fulfillment type are column values. Never add columns like `large_count`, and never hardcode the size list.
- Production rows are `(produced_on, size_id, quality, eggs)`, one row per farm, date, quality and size; logging a date again adds to it. **Rejects are always unsized**: `size_id` is null exactly when `quality = reject` (check constraint), and they never enter inventory or sales. A production or sale row's size must belong to the same farm (composite FK on `(tenant_id, size_id)`).
- Inventory is computed, never stored: good production minus completed sales, grouped by size. Pending deliveries are not subtracted.
- Sales cover deliveries too; there is no separate deliveries table. `status` is either `pending` or `complete`, and a second status field is added only when payment tracking arrives.
- Marking a delivery complete is one update: it sets `status = complete` and stamps `date_delivered`, and inventory follows automatically. On-site sales are created already `complete`.
- Sales store a snapshot of `price`. A client's default price only pre-fills the form.
- Null values carry meaning: `size_id` (reject), `client_id` (on-site sale), `date_delivered` (pending).
- Clients are the farm's customers, not tenants, and are never deleted: no delete grant, policy, function or route. `archived_at` marks one inactive (the UI says "Inactive"), and past sales keep pointing at it. Names are unique per farm ignoring case and spacing, inactive ones included, and are not folded for accents. A sale stores its own price but **not** the client's name: a rename shows on past sales. Clients change only through `security invoker` functions (`add_client` with the `client_submissions` ledger, `update_client` with a `version` check, `archive_client`, `restore_client`); a farm holds at most 500.
- Prices are plain numbers (`numeric`, 2 decimals, above 0) shown in the farm's currency, which is a per-farm setting (`tenants.currency`, an ISO code, default `PHP`, shown as ₱). Every price goes through the one `formatPrice` helper in `shared/utils/price.ts`; never type a currency symbol into a screen, and never convert a stored price when the currency changes (it only relabels). Clients' default price is per tray.

## UI notes

- Nuxt UI v4 changed a lot from v3. Check the current v4 docs for component names, props, and theming instead of relying on memory.
- Build screens from Nuxt UI components. Set the theme once in Nuxt UI config and use raw Tailwind classes mainly for layout.
- Custom components: the quantity input and display (trays + loose ↔ eggs), a multi-size production entry form that writes several rows in one submit, and a production day-summary card.
- Navigation has 5 destinations (Dashboard, Production, Sales, Inventory, Clients): a sidebar on desktop, bottom tabs and a FAB on mobile.

## Claude Code setup (`.claude/`)

### Dev team workflow
Features are built by a team of subagents, coordinated by the main session. Subagents can't call each other, so the main session runs each step. Each feature has one shared doc at `docs/features/NN-<name>.md` (copy it from `_TEMPLATE.md`), and each role fills in its own section. `/feature <idea>` runs the whole pipeline with a user checkpoint after each handoff; `/feature NN-name` resumes one.

1. `product-manager`: writes the story, acceptance criteria, and scope (§1–2). Status becomes `draft`. Take any open owner questions to the user before design starts.
2. `ux-designer`: writes flows, mobile and desktop wireframes, states, and copy (§2.5). Skip it for features with no UI.
3. `architect`: writes the data, RLS, API contracts, frontend structure, and an ordered `[BE]`/`[FE]` task list (§3). Status becomes `designed`. Show the user any decisions that need their call.
4. `backend-dev` + `frontend-dev` (in parallel once the §3 API contract is fixed), plus `devops` for tooling, CI, env, or deploy: implement their tasks and record what they built (§4).
5. `qa-reviewer`: checks each acceptance criterion with evidence, reviews the rules above, runs the tests, and gives a PASS/FAIL verdict (§5). If it's FAIL, send the findings back to the dev who owns them, then run QA again (at most 2 rounds before going to the user).

`security-auditor` is not part of each feature. It's a read-only, whole-system audit. Run it after changes to auth, middleware, RLS helpers, or the repository layer, before the first deploy, and before a second farm starts using the app.

Small fixes don't need the full pipeline. Still run `qa-reviewer` on anything that touches the DB, server, auth, or sales/inventory logic.

### Hooks
- `guard-service-role.mjs` blocks writing service-role or secret-key references (including `NUXT_SUPABASE_SECRET_KEY`, `supabase.secretKey`, and `sb_secret_`) outside `server/`, `supabase/`, `tests/`, `nuxt.config`, and `.env*`.
- `typecheck-on-stop.mjs` typechecks at the end of a turn when `.ts`/`.vue` files changed. It does nothing until the app is scaffolded, and it runs the package `typecheck` script with Bun (`bun run typecheck`) when `bun.lock` exists.

## Open decisions

None right now.

Decided:
- Quantities are entered as **trays + loose, in two fields** (per the design). The default eggs-per-tray is **30**, stored as a per-farm setting, never hardcoded.
- Hen counts and the lay-rate metric are **not in v1**. They're a future feature (see `docs/features/01-production-logging.md`, follow-ups).
- Egg sizes are **editable per farm** (seeded Small, Medium, Large, Jumbo). Feature 01 stores them; the "Farm settings: sizes" feature adds the screen to manage them.
