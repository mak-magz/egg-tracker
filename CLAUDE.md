# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Features are tracked in `docs/features/`. Setup is in `README.md`.

**Commands** (Bun; package manager is Bun, runtime is Node/Nuxt):
- `bun run dev`: Nuxt dev server
- `bun run typecheck` / `bun run lint` (`lint:fix`)
- `bun run test`: runs unit tests (`bun run test:unit`)
- `bun run test:unit`: Vitest (`bunx vitest run tests/unit/<file>.spec.ts`)
- `bun run test:e2e`: Playwright specs in `tests/e2e/` (needs `.env` seeded locally)
- `bun run db:generate:control` / `bun run db:generate:tenant`: Generate Drizzle migrations
- `bun run db:push:control` / `bun run db:push:tenant`: Push Drizzle schema to control / tenant database
- `bun run provision`: local CLI that creates a farm and owner account (`server/cli/provision.ts`)
- `bun run check:build`: Verifies production build does not leak secret key material

## Spec documents (read before building)

| File | Covers |
|---|---|
| `docs/egg-farm-app-product-doc.md` | Why/for whom: problem, users, goals, scope, open owner questions |
| `docs/egg-farm-app-architecture-spec.md` | **Architecture spec**: stack, multi-tenancy, data model, build order |
| `docs/egg-farm-app-ui-spec.md` | Screens, components, flows, Nuxt UI v4 implementation notes |
| `docs/egg-farm-app-design.md` | Decision log and design notes |
| `docs/design/` | **The owner's UI design, and the source of truth for screen visuals, layout, and copy.** UX and frontend follow it; don't invent layouts. `Tamago Egg Farm Tracker.html` is the Claude Design bundle export. Read `source/template.html` instead. Run `node docs/design/extract.mjs` to regenerate `source/`. The logo is `tamago-logo.png`. |

If the code and the specs disagree once code exists, the code wins. Update the spec to match.

## What it is

A multi-tenant SaaS for egg farms that tracks production, computed inventory, sales (deliveries are one kind of sale), and clients. v1 has a single owner-operator who logs data quickly on a phone. It is an online-only web app with no offline support.

**Package manager:** **Bun** (`bun install`, `bun run <script>`, `bunx`). Don't use npm, npx, or `package-lock.json`. The app runs on Node at runtime (Nuxt/Nitro, Vercel), and tests use Vitest via `bun run test:unit`.

**Stack:** Nuxt 4 (SSR) + TypeScript, Nitro server routes, **Firebase Auth** (`nuxt-vuefire` / Firebase Web SDK on client + `firebase-admin` on server), **Turso (libSQL)** + **Drizzle ORM** (database-per-tenant architecture with Control DB + Tenant DBs), hosted on Vercel, UI in Nuxt UI v4 + Tailwind CSS v4.

## Rules that span the whole system

### Tenancy and security
- **Database-per-tenant architecture**: Each farm/tenant has its own isolated Turso/libSQL database (`file:local-tenant-<id>.db` locally, or Turso cloud db).
- **Control database**: Stores tenants, users, and membership mappings (`server/db/schema/control.ts`).
- **Tenant scoping**: All tenant queries flow through `TenantDb` / `server/repositories/`, which injects `tenant_id` filters on top of physical database isolation to prevent cross-tenant leaks.
- **Tenant resolution**: Derive `tenant_id` on the server from the authenticated Firebase user session via `findMembershipWithFarm` (`server/repositories/memberships.ts`). Never trust a `tenant_id` sent by the client.
- **Server route handlers**: Every route handler is wrapped in `defineAuthedHandler` or `defineTenantHandler` (`server/utils/handlers.ts`).
- **Secrets**: Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`), Turso auth tokens, and Turso platform tokens are **server-only** and never exposed to the client or `runtimeConfig.public`. Run `bun run check:build` to verify.
- Vercel runs serverless, so don't keep long-lived connections and don't put long-running work in request handlers.
- Clients are personal data (names, phones). Never put them in logs (repositories log SQL error codes, not raw error objects), in error messages, in the URL or search string, or in `/api/me` or SSR payload. Clear client state on sign-out.

### Units and data model
- The stored unit is always individual eggs. Trays exist only at input and display, through one shared conversion helper (`shared/utils/quantity.ts`). Eggs-per-tray is a per-tenant setting and must never be hardcoded.
- Categories are data, not columns. **Egg sizes are per-farm rows in `sizes`** (ordered, with a stable colour slot, retired with `archived_at`, never deleted), referenced by `size_id`. An owner can never delete a size, and a farm always keeps at least one active size.
- Production rows are `(produced_on, size_id, quality, eggs)`, one row per farm, date, quality and size; logging a date again adds to it. **Rejects are always unsized**: `size_id` is null exactly when `quality = reject` (check constraint), and they never enter inventory or sales.
- Inventory is computed, never stored: good production minus non-voided sales, grouped by size (`server/repositories/inventory.ts`). Orders (open or not) never change it; only the deliveries they create do, because each delivery is a real sale.
- Sales cover deliveries too; there is no separate deliveries table. A sale is a **header + lines** (`sales` + `sale_lines`): one client, type (`delivery`/`on_site`) and date on the header, and 1–20 size lines, each with its own eggs and frozen `price_per_tray`/`line_total`. No two lines on one sale share a `size_id`. **Sales have no status: every sale is a real transaction that has already left the farm**. Every sale gets a per-farm sequential sale number.
- **Orders** are the intent to deliver: `orders` + `order_lines`, a required client, 1–20 size lines with frozen prices, an order number, optional wanted-by date, and status `requested → confirmed → ready → partially_fulfilled → fulfilled`, plus `cancelled`. Orders never touch stock. Deliveries create delivery sales with `sales.order_id` set.
- A sale can never be deleted. The correction is to edit it or **void** it (`voided_at`, a one-way flag): a voided sale keeps its row and sale number forever, drops out of stock math, and is hidden from lists by default.
- Sales store a snapshot of each line's `price_per_tray`. A client's default price only pre-fills the form.
- Null values carry meaning: `size_id` (reject on `production` only), `client_id` (on-site sale), `sales.order_id` (direct sale).
- Clients are the farm's customers and are never deleted. `archived_at` marks one inactive. Names are unique per farm ignoring case and spacing.
- Prices are plain numbers (`numeric`, 2 decimals, above 0) shown in the farm's currency (`tenants.currency`, default `PHP`, shown as ₱). Every price goes through `formatPrice` in `shared/utils/price.ts`.

## UI notes

- Nuxt UI v4 changed significantly from v3. Check current v4 docs (`ui.nuxt.com`) for component names, props, and theming.
- Build screens from Nuxt UI components. Use raw Tailwind classes mainly for layout.
- Custom components: quantity input/display (trays + loose ↔ eggs), multi-size production entry form, production day-summary card.
- Navigation has 6 destinations (Dashboard, Production, Orders, Sales, Inventory, Clients): desktop sidebar, mobile bottom bar with 4 tabs + **More** sheet.

## Claude Code setup (`.claude/`)

### Dev team workflow
Features are built by a team of subagents, coordinated by the main session. Subagents can't call each other, so the main session runs each step. Each feature has one shared doc at `docs/features/NN-<name>.md` (copy it from `_TEMPLATE.md`), and each role fills in its own section:

1. `product-manager`: writes the story, acceptance criteria, and scope (§1–2). Status becomes `draft`. Take any open owner questions to the user before design starts.
2. `ux-designer`: writes flows, mobile and desktop wireframes, states, and copy (§2.5). Skip it for features with no UI.
3. `architect`: writes data model (Drizzle schemas), API contracts, frontend structure, and an ordered `[BE]`/`[FE]` task list (§3). Status becomes `designed`. Show the user any decisions that need their call.
4. `backend-dev` + `frontend-dev` (in parallel once the §3 API contract is fixed), plus `devops` for tooling, CI, env, or deploy: implement their tasks and record what they built (§4).
5. `qa-reviewer`: checks each acceptance criterion with evidence, reviews domain invariants, runs the tests, and gives a PASS/FAIL verdict (§5).

`security-auditor`: whole-system audit across Firebase auth, session handling, database-per-tenant isolation, secrets, and repository layer.

### Hooks
- `guard-service-role.mjs` blocks writing server private credential references outside `server/`, `tests/`, `nuxt.config`, and `.env*`.
- `typecheck-on-stop.mjs` typechecks at the end of a turn when `.ts`/`.vue` files changed using Bun (`bun run typecheck`).

## Open decisions

Decided:
- Quantities are entered as **trays + loose, in two fields**. Default eggs-per-tray is **30**, stored as a per-farm setting, never hardcoded.
- Hen counts and lay-rate metric are **not in v1**.
- Egg sizes are **editable per farm** (seeded Small, Medium, Large, Jumbo).
