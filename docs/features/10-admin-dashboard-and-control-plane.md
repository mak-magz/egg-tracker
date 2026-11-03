# Feature: Operator Admin Dashboard & Turso Cloud Control Plane

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)

As the SaaS platform operator, I want an internal Admin Dashboard (`/admin`) where I can see all registered egg farm tenants, their subscription tier, database connection endpoints, settings (eggs per tray, currency), and linked member accounts in one unified view, so that I don't have to SSH into servers, manually inspect Turso databases, or run CLI queries to know who is on the platform.

As the SaaS platform operator, I want to view real-time Turso Cloud organization metrics (total databases, storage consumed vs plan limits, database statuses, edge regions) directly in the dashboard, so that I can proactively monitor infrastructure health, avoid quota exhaustions, and identify degraded tenant databases before farm owners notice barnside issues.

As the SaaS platform operator, I want to provision a new tenant farm and its isolated Turso cloud database with a single click and simple form, so that onboarding a new farm is immediate, error-free, and handles database creation, schema bootstrapping, default egg sizes, and owner authentication in one atomic workflow without opening a terminal.

As the SaaS platform operator, I want to inspect all Firebase Auth users, link unassigned users to farms, reassign existing users between farms, and trigger password resets or session revocations, so that I can resolve customer login issues and manage farm ownership changes cleanly.

As the SaaS platform operator, I want to view migration status across all tenant databases and trigger batch schema updates with clear progress and error reporting, so that as the application evolves with new features, all tenant databases remain consistent with the latest schema without manual intervention per farm.

As the SaaS platform operator, I want to inspect sync telemetry for every farm (latest cloud `change_log` version, active client devices, last sync timestamp, and desync/conflict flags) and drill down into change logs, so that when a farmer reports that their barn phone isn't syncing, I can diagnose whether mutations are queuing, rejecting, or conflicting in seconds.

**Why now / spec reference:**
- Context: The app has completed its free offline-first tier (local SQLite WASM in browser OPFS with service workers). Cloud sync and multi-tenant cloud storage are now live for premium farms (`/api/sync/*`, Turso libSQL edge databases).
- Architecture spec: `docs/egg-farm-app-architecture-spec.md` §2.1 (SPA & Offline Sync), §3 (Database-per-Tenant with Control DB + Tenant DBs), and `server/db/schema/control.ts`.
- Previously, provisioning was only possible via local CLI (`bun run provision` in `server/cli/provision.ts`), which requires developer machine access, local environment configurations, and cannot be operated remotely or during live customer support.
- Production operations require an internal control plane to govern the tenant fleet, monitor cloud resources, and diagnose offline/online sync anomalies.

---

## 2. Acceptance criteria (PM)

### Security, Authentication & Role Access
- [x] **AC1 — Admin access enforcement (`ADMIN_EMAILS`)**: Access to `/admin` and all `/api/admin/**` endpoints is strictly guarded. Only authenticated Firebase users whose verified email address is included in the server-configured `ADMIN_EMAILS` environment variable (case-insensitive, comma-separated list) are granted access.
- [x] **AC2 — Unauthenticated access redirection**: Navigating to `/admin` without an active session redirects the user to `/sign-in` with a `redirect=/admin` query parameter so they land back on the Admin Dashboard upon successful authentication.
- [x] **AC3 — Non-admin access denial (403)**: If an authenticated non-admin farm owner navigates to `/admin` or requests any `/api/admin/**` endpoint:
  - The API returns HTTP 403 with `code: 'forbidden'` and a safe generic error message ("Access denied: Administrator privileges required").
  - The UI redirects the user away to their farm dashboard `/` (or displays an unauthorized access view with a button "Return to Farm Dashboard").
  - Under no circumstances does the response or client state leak tenant lists, database URLs, auth tokens, or administrative statistics to non-admins.
- [x] **AC4 — Strict Cross-Site Request Forgery (CSRF) & Origin Protection**: All administrative mutation endpoints (`POST`, `PUT`, `DELETE` under `/api/admin/**`) enforce `assertRequestAllowed`: rejecting cross-site browser requests (`Sec-Fetch-Site` or untrusted `Origin`) with HTTP 403, and requiring `content-type: application/json`. No administrative endpoints are callable anonymously or from untrusted origins.

### Tenant Fleet Overview & Management
- [x] **AC5 — Tenant fleet listing**: The dashboard displays a "Tenants" table/card list of all farms registered in the Control DB (`tenants` table). For each tenant, the list displays:
  - Farm Name (`name`)
  - Tenant ID (`id`, formatted with click-to-copy affordance)
  - Subscription Tier badge (`Free` vs `Premium`)
  - Eggs Per Tray setting (e.g. `30 eggs/tray`)
  - Currency (e.g. `PHP`)
  - Linked Member Count (number of Firebase Auth users mapped in `memberships`)
  - Database Type & Target (e.g., `Turso Cloud` with hostname or `Local File DB` for dev)
  - Created Date (formatted in local time with relative time tooltip, e.g. "3 days ago")
- [x] **AC6 — Search and tier filtering**:
  - A search input filters the tenant list in real time by Farm Name, Tenant ID, or Member Email.
  - A tier filter dropdown allows filtering by `All`, `Free Tier`, or `Premium Tier`.
  - Matching count is shown (e.g. "Showing 8 of 14 farms").
- [x] **AC7 — Tenant details & configuration drawer/modal**: Clicking on a tenant opens a detailed inspector showing:
  - Full tenant metadata (ID, created timestamp, updated timestamp).
  - Database connection information: Database URL (with copy button) and auth token status (`Configured` / `Missing`), but raw secret auth tokens are never displayed in plaintext.
  - List of all linked members (Firebase UID, email, role, joined date).
  - Quick action buttons: "Edit Settings", "View Sync Diagnostics", "Test Connection".
- [x] **AC8 — Farm settings editing**: The operator can update farm settings directly from the dashboard:
  - Farm Name (1–100 characters, trimmed, required).
  - Eggs Per Tray (positive integer between 1 and 100, defaults to 30; rejecting 0, negative numbers, or decimals).
  - Currency (3-letter uppercase ISO currency code, e.g. `PHP`, `USD`).
  - Tier toggle (`free` ↔ `premium`).
  - Saving updates the Control DB `tenants` record and the tenant's `farm_settings` record. An audit log is recorded, and the UI displays a success toast.
- [x] **AC9 — Database connectivity check**: In the tenant details drawer, a "Test Connection" button performs a lightweight ping (`SELECT 1`) to the tenant's database via the server. It displays response latency (e.g. "Connected (42ms)") or a specific error message if unreachable (e.g. "Connection failed: DNS resolution failure or invalid token").

### Turso Cloud Infrastructure Health & Quotas
- [x] **AC10 — Organization resource utilization metrics**: The top of the dashboard displays key infrastructure summary cards fetched from the Turso Platform API:
  - Active Databases: Count of provisioned databases vs. organization quota (e.g. `12 / 500`).
  - Total Storage Consumed: Aggregate storage used across all tenant databases with human-readable formatting (e.g. `48.2 MB / 9.0 GB`) and percentage progress bar.
  - Platform Status: Live indicator showing Turso Cloud API operational health (`Operational` in green, `Degraded` in amber, `Down` in red).
- [x] **AC11 — Per-database cloud status & location**: For each cloud-backed tenant, the dashboard surfaces real-time Turso database details:
  - Status: `ready`, `creating`, `degraded`, or `suspended`.
  - Primary Region: Turso edge region code (e.g., `sin` Singapore, `nrt` Tokyo, `iad` Virginia) with human-readable country/city label.
  - Database Size: Storage utilized by this specific tenant database (in KB/MB).
- [x] **AC12 — Local/Dev environment distinction**: In local development or testing environments where `TURSO_API_TOKEN` is not configured, the dashboard gracefully identifies tenants using `file:local-tenant-*.db` as "Local Dev Database", displays "Local Mock Metrics", and does not fail with API errors.
- [x] **AC13 — Turso API resilience & degradation handling**: If the Turso Platform API returns an error (rate limited 429, invalid credentials 401, or network outage 502/503), the dashboard displays a non-blocking warning banner ("Turso Cloud metrics currently unavailable; Control DB operational") with a manual "Refresh Metrics" button, while all Control DB functions (tenant list, auth linking) remain fully functional.

### 1-Click Tenant & Database Provisioning
- [x] **AC14 — Provisioning modal & validation**: The operator can click a primary "Provision New Farm" button on the dashboard, opening a creation form with:
  - Farm Name (required, 1–100 chars).
  - Owner Email (required, valid email address).
  - Initial Tier (radio toggle: `Free` vs `Premium`, default `Premium`).
  - Eggs Per Tray (optional, integer 1–100, default 30).
  - Currency (optional, default `PHP`).
  - Initial Password (optional: 8+ chars; if left blank, generates a cryptographically secure random password and surfaces it in the completion modal).
  - Immediate inline validation for invalid formats.
- [x] **AC15 — Unified provisioning orchestration**: Submitting the form triggers a server-side orchestrated provisioning pipeline:
  1. Creates or verifies the Firebase Auth user account.
  2. Provisions a dedicated Turso database (named `tamago-<tenantId>`) via Turso Platform API in the default organization group.
  3. Mints a scoped database auth token.
  4. Bootstraps the isolated tenant database with the Drizzle schema (`farm_settings`, `sizes`, `production`, `clients`, `orders`, `sales`, `change_log`, etc.).
  5. Seeds default egg sizes (`Small`, `Medium`, `Large`, `Jumbo` in colour slots 0–3).
  6. Inserts the tenant and membership records in the Control DB.
- [x] **AC16 — Idempotency and failure safety**:
  - If the email already belongs to a user who already owns a farm, provisioning stops and returns a clear warning: "User already owns an active farm."
  - If Turso database creation or schema bootstrap fails midway, the server rolls back or cleans up partially created artifacts (does not leave an orphan broken tenant in Control DB) and returns a specific, actionable error message.
- [x] **AC17 — Provisioning completion summary & credentials handoff**: Upon successful provisioning:
  - The modal transitions to a "Farm Provisioned Successfully" state showing Farm Name, Tenant ID, Owner Email, and the generated password / sign-in link with a "Copy Credentials" button.
  - The operator is explicitly reminded that the temporary password will not be shown again.
  - Closing the modal automatically adds the newly provisioned farm to the top of the tenant list.
- [x] **AC18 — Duplicate submission prevention**: While provisioning is executing (network calls to Firebase and Turso), the submit button shows a spinner, disables all inputs, and prevents double-clicking or duplicate submissions.

### Firebase Auth User Management & Farm Mapping
- [x] **AC19 — Firebase Auth users roster**: An "Auth Users" tab displays all registered Firebase Auth users:
  - Email & UID (with click-to-copy).
  - Verification status (`Verified` / `Unverified`).
  - Assigned Farm (Farm Name with clickable link to tenant drawer, or an amber `Unassigned` badge).
  - Registration Date and Last Login Date.
- [x] **AC20 — Link unassigned user to farm**: For any unassigned user, the operator can click "Assign to Farm", select an existing tenant farm from a searchable selector, and submit. This creates the `memberships` record in Control DB, granting the user immediate access to that farm upon their next login or refresh.
- [x] **AC21 — Farm reassignment with confirmation guard**:
  - The operator can reassign a user currently linked to Farm A over to Farm B.
  - Because reassigning revokes access to the previous farm's data, the UI displays a mandatory confirmation modal: "Are you sure you want to transfer [email] from [Farm A] to [Farm B]? The user will immediately lose access to [Farm A] and will see [Farm B]'s records."
  - Confirming updates the `memberships` table in Control DB, revokes the user's existing sessions to force token refresh, and logs the transfer in the audit trail.
- [x] **AC22 — Unlink user / Revoke farm access**:
  - The operator can unlink a user from their farm (removing the `memberships` record).
  - Safety check: If the user is the sole member/owner of the farm, the UI warns: "This is the only member associated with [Farm Name]. Unlinking will leave the farm orphaned with no active owner."
  - Operator can trigger "Send Password Reset Email" directly from the user's row, calling Firebase Admin Auth to dispatch the standard password reset link.

### Multi-Tenant Schema Migrations
- [x] **AC23 — Fleet migration status overview**: A "Database Migrations" section displays:
  - System Schema Version: Latest available Drizzle migration version/hash in the codebase.
  - Fleet Migration Summary: Total tenant databases up to date vs. pending migrations (e.g. "11 of 12 databases up to date", or "1 database needs migration").
  - Table showing each tenant database's current applied migration version and status (`Up to date` in green, `Migration Pending` in amber, `Error` in red).
- [x] **AC24 — Batch migration execution**:
  - A primary "Run Migrations on All Tenants" button opens a confirmation dialog showing the migration steps to be executed and the list of tenant databases that will be updated.
  - Clicking "Confirm & Run" executes migrations sequentially across all pending tenant databases.
  - Real-time progress bar and status indicator: "Applying migration to Farm 2/5 (Hendricks Farm)...".
- [x] **AC25 — Migration failure isolation**: If a migration fails on one tenant database (e.g., connection timeout, lock contention):
  - The failure is isolated to that specific tenant; the batch process records the error and continues applying migrations to the remaining tenants.
  - The failed tenant is flagged with an "Error" badge and the exact error reason (e.g., "Connection reset during Drizzle statement 3").
  - An individual "Retry Migration" button is provided on that tenant's row to re-run the migration without affecting other farms.
- [x] **AC26 — Single-tenant migration test run**: The operator can select a single test/staging farm and run migrations on it first before triggering the fleet-wide batch update.

### Cloud Sync Diagnostics & Telemetry
- [x] **AC27 — Sync telemetry dashboard**: A "Sync Telemetry" view lists all cloud-enabled tenant farms with sync metrics:
  - Cloud Change Log Version: Highest `version` number in the tenant's `change_log` table.
  - Known Devices: Count of distinct `deviceId`s that have synced in the last 30 days (e.g. `D1`, `D2`).
  - Last Mutation Push: Timestamp and device ID of the last pushed mutation batch (`/api/sync/push`).
  - Last Pull Request: Timestamp and device ID of the last pulled CDC batch (`/api/sync/pull`).
  - Sync Health Indicator:
    - `Active / Synced` (green): Sync activity within the past 24 hours, no unresolved errors.
    - `Idle` (gray): No sync activity for > 24 hours, but last sync was clean.
    - `Desync / Conflicts` (amber): Client reporting out-of-order versions or repeated conflict resolutions.
    - `Sync Error` (red): Push mutations failing with validation errors or unhandled server exceptions.
- [x] **AC28 — Change log viewer & audit drawer**: Clicking on a tenant's sync status opens a live Change Log viewer:
  - Paginated list of recent `change_log` records: `version`, `entityType` (`sizes`, `production`, `clients`, `orders`, `sales`), `action` (`insert`, `update`, `delete`), `deviceId`, and `occurredAt`.
  - Expandable row showing the serialized JSON `data` payload of each mutation.
  - Filter by entity type (e.g., view only `production` changes) or device ID.
- [x] **AC29 — Failed mutation inspector**:
  - If a farm has encountered rejected mutations in `/api/sync/push`, they are surfaced in a "Sync Issues" sub-tab with the client mutation ID, error message (e.g. "Validation failed on pricePerTray: must be positive"), timestamp, and payload.
  - Operator can click "Dismiss Issue" or "Export Diagnostic JSON" to facilitate troubleshooting with the farm owner.
- [x] **AC30 — Farm desync reset / Force re-sync**:
  - In the event of catastrophic client OPFS corruption or persistent desync, the operator has an administrative action "Prepare Fresh Sync Snapshot".
  - This generates a verified clean snapshot of the tenant's cloud database for the client device to pull on next connection, resolving stuck local states.

### UI States, Responsiveness & Auditability
- [x] **AC31 — Empty states**:
  - Zero tenants: Displays an illustration/card "No tenant farms registered yet. Click 'Provision New Farm' to create your first cloud farm."
  - Search no results: "No farms found matching '[query]'" with a "Clear search" CTA.
  - No sync issues: "All farms are syncing normally — no errors recorded."
- [x] **AC32 — Loading & error states**:
  - Skeletons are displayed while fetching Control DB tenants, Turso metrics, and Auth users. No layout jump or flashing zeros.
  - Network error on any tab surfaces a friendly error banner with a "Retry" button.
- [x] **AC33 — Mobile responsiveness (~375px)**:
  - The `/admin` dashboard is fully functional on mobile viewports.
  - High-level metric cards stack vertically.
  - Tenant and user tables convert to structured mobile cards with expandable details, ensuring no horizontal scroll or truncated critical data.
  - Provisioning modal and action drawers open as slide-over bottom sheets on mobile.
- [x] **AC34 — Operator action audit log**:
  - Every administrative action performed through `/admin` (provisioning a farm, editing farm settings, reassigning a user, running migrations, revoking sessions) is written to a server-side `admin_audit_log` with: timestamp, operator email, action type, target ID, and summary.
  - The audit log is visible under an "Audit Log" tab in the admin dashboard.
- [x] **AC35 — Credential security & data protection**:
  - Turso administrative API tokens and master database credentials are NEVER exposed to the frontend browser bundle or client-accessible storage.
  - Customer personal details (client names, phone numbers) from individual tenant databases are NOT aggregated or exposed on the global admin overview screen; the operator sees farm metadata, operational telemetry, and user accounts only.

**Out of scope:**
- Self-service public signup or Stripe checkout/billing integration (farms are onboarded via operator invitation or 1-click admin provisioning; automated billing will be handled in a dedicated future feature).
- End-user farm management features (logging production, sales, orders — these belong to the tenant app).
- Multi-region database migration or replica provisioning (Turso default group and region suffice for v1).
- Custom domain mapping per tenant (all tenants access the central web app or mobile PWA).
- Realtime WebSocket streaming of sync events (polling/on-demand fetch is sufficient for v1 admin operations).

**Open questions for owner:** None (billing and public tiers deferred).

**Open questions for the architect:**
1. **Admin role verification:** Should admin status be purely determined by `ADMIN_EMAILS` environment variable check in `defineAdminHandler`, or should Firebase Auth Custom Claims (e.g. `{ admin: true }`) be attached to admin accounts? *(Recommended: Start with `ADMIN_EMAILS` check in `defineAdminHandler` on the server for zero-overhead configuration, with optional custom claims cached on session).*
2. **Audit log storage:** Should `admin_audit_log` reside in the Control DB (e.g. `admin_audit_logs` table in `server/db/schema/control.ts`)? *(Recommended: Yes, Control DB is the authoritative store for SaaS-level events and metadata).*
3. **Turso Platform API integration:** Should Turso API calls use native `fetch` against `https://api.turso.tech/v1/organizations/{org}/...` or an official SDK? *(Recommended: Native `fetch` with standard bearer authentication, mirroring `server/services/provision.ts`).*
4. **Tenant DB migration strategy:** Should migrations be applied using Drizzle's `migrate()` runner iterating through each tenant's db URL, or by executing the SQL migration batch files directly via `@libsql/client` batch API? *(Recommended: Drizzle `migrate()` or `@libsql/client` migration batch execution using the shared migration ledger).*

---

## 2.5 UX design (UX Designer)

### Design Overview & Guiding Principles
The **Operator Admin Dashboard** (`/admin`) is an internal mission-control interface built for the SaaS platform operator. Unlike the daily barnside screens used by egg farm owners, the operator dashboard prioritizes **fleet-wide observability, atomic provisioning, infrastructure health, and rapid diagnostic drill-down**, while retaining Tamago's core simplicity and touch-friendly responsiveness.

1. **Dual-Viewport Architecture:**
   - **Desktop Workstation (≥ 1024px):** High-density administration with responsive tables, quick inline search/filters, slideover inspector drawers (`USlideover`), and live infrastructure gauges.
   - **Mobile Phone (~375px):** On-the-go administrative response. Dense tables transform into touch-friendly cards, inspector drawers become bottom sheets (`sheetUi`), and all tap targets meet the ≥ 44px standard for one-handed operation.
2. **Zero-CLI Day-to-Day Operations:** Tasks previously requiring terminal commands (`bun run provision`, raw Drizzle migration scripts, Turso CLI commands) are fully executable via intuitive visual workflows.
3. **Fail-Safe Blast Radius:** Actions that alter access (reassigning a user, unlinking a sole farm owner) or mutate production databases (batch migrations, snapshot reset) require deliberate, unambiguous confirmation steps specifying the exact blast radius.
4. **Resilient Degradation:** If Turso Cloud API experiences partial outage or rate limiting (AC13), Control DB operations (tenants list, member mapping) remain fully interactive while an ambient non-blocking warning banner surfaces.

---

### Flows & Main-Path Tap Counts

#### Flow A: 1-Click Provision New Farm & Credentials Handoff (Primary Action, AC14–AC17)
```
[Tenants Tab] → [Provision New Farm] → [Fill Form] → [Provision Farm] → [Copy Credentials] → [Done]
```
1. Operator clicks primary button **"Provision New Farm"** [1 tap] (top toolbar on Desktop, floating header button on Mobile).
2. The provisioning modal opens with smart defaults:
   - **Farm Name:** (cursor auto-focused) types e.g. "Sunrise Pastures" [typing].
   - **Owner Email:** types e.g. "clara@sunrisepastures.com" [typing].
   - **Initial Tier:** defaults to `Premium` (radio pill toggle).
   - **Eggs per tray:** defaults to `30` (stepper / numeric input).
   - **Currency:** defaults to `PHP` (select dropdown).
   - **Initial Password:** left blank to auto-generate a cryptographically secure 12-character random passphrase.
3. Operator taps **"Provision Farm"** [2 taps].
4. Modal transitions to active loading state: submit button displays spinner, inputs are disabled, and helper text reads *"Provisioning Turso database & bootstrapping schema..."* (AC18).
5. Upon successful atomic provisioning (AC15), the modal transitions to the **"Farm Provisioned Successfully"** summary screen (AC17).
6. Operator taps **"Copy Credentials"** [3 taps] → credentials formatted as a clean onboarding snippet are copied to clipboard; toast confirms *"Credentials copied to clipboard"*.
7. Operator taps **"Done"** [4 taps] → modal closes. The newly provisioned farm appears immediately at the top of the tenant list with a brief 1.5s highlight (`bg-primary/8`).
- **Main-path tap count:** **4 taps + typing 2 fields** (< 30 seconds total).

#### Flow B: Link Unassigned Firebase User to Farm (AC20)
```
[Auth Users Tab] → [Assign to Farm] → [Search & Pick Farm] → [Confirm] → Toast
```
1. Operator navigates to **Auth Users** tab [1 tap].
2. User with amber `Unassigned` badge is identified; operator taps **"Assign to Farm"** [2 taps] on that row/card.
3. Searchable tenant picker opens; operator types farm name and selects the farm [3 taps].
4. Operator taps **"Confirm Assignment"** [4 taps].
5. Control DB `memberships` record is created; row badge updates to linked farm name with clickable drawer trigger; toast confirms *"User assigned to [Farm Name]"*.
- **Main-path tap count:** **3 taps from the tab**.

#### Flow C: Transfer / Reassign User Between Farms (Safety Guard, AC21)
```
[Auth Users Tab] → [Row Menu ⋮] → [Transfer Farm] → [Select New Farm] → [Confirm Transfer]
```
1. On Auth Users tab, operator taps row action menu (⋮) → **"Transfer Farm"** [2 taps].
2. Confirmation modal opens with safety warning:
   > *"Are you sure you want to transfer clara@sunrisepastures.com from Sunrise Pastures to Hendricks Farm? The user will immediately lose access to Sunrise Pastures and will see Hendricks Farm's records."*
3. Operator selects destination farm from dropdown [3 taps].
4. Operator taps warning button **"Confirm Transfer"** [4 taps].
5. User sessions are revoked on server to force token refresh, audit log is written, and toast confirms: *"User transferred to Hendricks Farm"*.
- **Main-path tap count:** **4 taps**.

#### Flow D: Fleet Schema Migration Batch Run (AC23–AC26)
```
[Migrations Tab] → [Run Migrations on All Tenants] → [Confirm & Run] → [Live Sequential Progress] → Done
```
1. Operator clicks **Migrations** tab [1 tap].
2. Summary banner alerts: *"1 pending migration across 3 tenant databases"*.
3. Operator taps primary button **"Run Migrations on All Tenants"** [2 taps].
4. Batch modal lists the pending migration version/hash and the 3 target farms.
5. Operator taps **"Confirm & Run"** [3 taps].
6. Real-time progress bar steps through databases: *"Migrating 1 of 3: Sunrise Pastures..."*, *"Migrating 2 of 3: Valley Eggs..."*.
7. Modal finishes: *"All 12 tenant databases up to date"*. Any isolated failure stays pinned with a row-level **"Retry"** button (AC25).
- **Main-path tap count:** **3 taps**.

#### Flow E: Test Tenant Database Connectivity (AC9)
```
[Tenants Tab] → [Click Tenant Row] → [Test Connection] → Latency Badge "Connected (42ms)"
```
1. On Tenants tab, operator clicks any tenant row or card [1 tap] → `USlideover` inspector opens.
2. Under "Database Connection", operator clicks **"Test Connection"** [2 taps].
3. Button displays mini spinner for ~40ms, then updates to a green badge: **"● Connected (42ms)"**. If unreachable, displays red badge **"✕ Connection failed: [Reason]"**.
- **Main-path tap count:** **2 taps**.

#### Flow F: Sync Diagnostics & Change Log Drill-Down (AC27–AC30)
```
[Sync Telemetry Tab] → [Click Farm Row] → [Expand Mutation JSON] → [Prepare Fresh Snapshot (if stuck)]
```
1. Operator clicks **Sync Telemetry** tab [1 tap].
2. Locates tenant showing amber `Desync / Conflicts` or red `Sync Error`; taps row [2 taps] → opens **Sync Inspector Drawer**.
3. Drawer displays last pull/push timestamps, active client device IDs (`D1`, `D2`), and CDC change log stream.
4. Operator taps any change log item [3 taps] → expands inline formatted JSON payload (`entityType`, `action`, `data`).
5. If local OPFS is irrecoverably stuck, operator taps **"Prepare Fresh Sync Snapshot"** [4 taps] → confirmation dialog [5 taps] generates clean baseline for next client pull.
- **Main-path tap count to inspect payload:** **3 taps**.

#### Flow G: Non-Admin Access Denial & 403 Recovery (AC2, AC3)
- If unauthenticated: user redirected to `/sign-in?redirect=/admin`.
- If authenticated non-admin owner accesses `/admin`:
  - Route middleware halts rendering, preventing any Control DB data from loading.
  - Displays dedicated **403 Access Denied** card: *"Administrator privileges required"*.
  - Primary button **"Return to Farm Dashboard"** [1 tap] returns owner safely to `/`.

---

### Layouts & ASCII Wireframes

#### Global Admin Shell (Desktop ≥ 1024px)
```
+----------------------------------------------------------------------------------------------------+
| [Logo] Tamago Control Plane  [dev/prod]                Operator: mak@tamago.farm  [Back to Farm App]|
+----------------------------------------------------------------------------------------------------+
| [ Overview ]  [ > Tenants < ]  [ Auth Users ]  [ Migrations (1) ]  [ Sync Telemetry ]  [ Audit Log]|
+----------------------------------------------------------------------------------------------------+
| (Active Tab Content Area)                                                                          |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

#### Global Admin Shell (Mobile ~375px)
```
+-------------------------------------+
| [Logo] Tamago Admin       [mak (v)] |
+-------------------------------------+
| [<] Overview  >Tenants<  Users  [>] |  <- Horizontally scrollable UTabs
+-------------------------------------+
| (Active Tab Content Area)           |
|                                     |
|                                     |
+-------------------------------------+
```

---

#### Tab 1: Overview & Infrastructure Health (AC10–AC13)

##### Desktop Layout (≥ 1024px)
```
+----------------------------------------------------------------------------------------------------+
| Overview & Platform Infrastructure                                            [ Refresh Metrics ↻ ]|
+----------------------------------------------------------------------------------------------------+
| +-------------------------+ +-------------------------+ +-------------------------+ +------------+ |
| | ACTIVE DATABASES        | | TOTAL STORAGE CONSUMED  | | TURSO CLOUD STATUS      | | FLEET SYNC | |
| | 12 / 500                | | 48.2 MB / 9.0 GB        | | (●) Operational         | | 11 Synced  | |
| | 2.4% of organization cap| | [========-------------] | | Group: default (sin)    | | 1 Conflict | |
| +-------------------------+ +-------------------------+ +-------------------------+ +------------+ |
|                                                                                                    |
| RECENT FLEET ACTIVITY & SYSTEM STATUS                                                              |
| +------------------------------------------------------------------------------------------------+ |
| | System Schema Version: v12 (hash: a9f83c1)  ·  1 tenant database requires schema migration     | |
| | Latest Farm Provisioned: Sunrise Pastures (2 hours ago by mak@tamago.farm)                     | |
| | Platform Telemetry: 14 active devices syncing across 12 farms  ·  0 critical sync push failures | |
| +------------------------------------------------------------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

##### Mobile Layout (~375px)
```
+-------------------------------------+
| Infrastructure Health   [Refresh ↻] |
+-------------------------------------+
| +---------------------------------+ |
| | TURSO CLOUD STATUS              | |
| | (●) Operational                 | |
| | Group: default · Region: sin    | |
| +---------------------------------+ |
| +---------------------------------+ |
| | ACTIVE DATABASES                | |
| | 12 / 500 databases (2.4%)       | |
| +---------------------------------+ |
| +---------------------------------+ |
| | STORAGE UTILIZATION             | |
| | 48.2 MB / 9.0 GB (0.5%)         | |
| | [===--------------------------] | |
| +---------------------------------+ |
| +---------------------------------+ |
| | FLEET HEALTH SUMMARY            | |
| | 11 Synced · 1 Conflict          | |
| | 1 Migration Pending             | |
| +---------------------------------+ |
+-------------------------------------+
```

---

#### Tab 2: Tenants Fleet Management (AC5–AC9, AC14–AC18)

##### Desktop Layout (≥ 1024px)
```
+----------------------------------------------------------------------------------------------------+
| Tenants Fleet                                                [ + Provision New Farm ]              |
| [ Search farm, tenant ID, or member... ]  [ All Tiers (v) ]            Showing 12 of 12 farms      |
+----------------------------------------------------------------------------------------------------+
| Farm Name          Tenant ID     Tier       Tray / Cur   Members   Database Target    Created   Act.   |
|----------------------------------------------------------------------------------------------------|
| Sunrise Pastures   t-8f2a1b [c]  [Premium]  30 / PHP     1 user    tamago-t-8f2a1b    2h ago    [⋮]  |
| Hendricks Farm     t-1039bc [c]  [Premium]  30 / PHP     2 users   tamago-t-1039bc    3d ago    [⋮]  |
| Batangas Free Barn t-49a012 [c]  [Free]     30 / PHP     1 user    tamago-t-49a012    2w ago    [⋮]  |
| Dev Local Mock     t-local1 [c]  [Free]     24 / PHP     1 user    file:local-t-loc.. 1m ago    [⋮]  |
+----------------------------------------------------------------------------------------------------+
```

##### Mobile Layout (~375px)
```
+-------------------------------------+
| Tenants (12)      [+ Provision Farm]|
+-------------------------------------+
| [ Search farm name or ID...       ] |
| [ Tier: All Tiers (v)             ] |
+-------------------------------------+
| +---------------------------------+ |
| | Sunrise Pastures      [Premium] | |
| | ID: t-8f2a1b [c]  ·  1 member   | |
| | 30 eggs/tray  ·  PHP            | |
| | DB: tamago-t-8f2a1b (ready)     | |
| | Created 2 hours ago             | |
| | [Test Conn]      [View Details >]| |
| +---------------------------------+ |
| +---------------------------------+ |
| | Hendricks Farm        [Premium] | |
| | ID: t-1039bc [c]  ·  2 members  | |
| | 30 eggs/tray  ·  PHP            | |
| | DB: tamago-t-1039bc (ready)     | |
| | Created 3 days ago              | |
| | [Test Conn]      [View Details >]| |
| +---------------------------------+ |
+-------------------------------------+
```

##### Provision New Farm Modal (AC14, AC18)
```
+---------------------------------------------------+
| Provision New Tenant Farm                     [X] |
+---------------------------------------------------+
| Farm Name *                                       |
| [ Sunrise Pastures                              ] |
|                                                   |
| Owner Email Address *                             |
| [ owner@sunrisepastures.com                     ] |
|                                                   |
| Subscription Tier *                               |
| (•) Premium Tier (Cloud Sync)  ( ) Free Tier      |
|                                                   |
| Eggs Per Tray                                     |
| [ 30                                            ] |
| Positive integer (1-100), default 30              |
|                                                   |
| Currency Code                                     |
| [ PHP (Philippine Peso)                         ] |
|                                                   |
| Initial Password (Optional)                       |
| [                                               ] |
| Leave blank to generate secure random password    |
|                                                   |
| ℹ Provisions Turso DB, mints token, bootstraps    |
|   schema, seeds default egg sizes, and maps user. |
+---------------------------------------------------+
| [ Cancel ]                     [ Provision Farm ] |
+---------------------------------------------------+
```

##### Provisioning Completion & Credentials Handoff (AC17)
```
+---------------------------------------------------+
| (✓) Farm Provisioned Successfully             [X] |
+---------------------------------------------------+
| The tenant database and owner account are ready.  |
| Store these credentials now; the password cannot  |
| be viewed again.                                  |
|                                                   |
| +-----------------------------------------------+ |
| | Farm Name:   Sunrise Pastures                 | |
| | Tenant ID:   t-8f2a1b-90c2-4112               | |
| | Owner Email: owner@sunrisepastures.com        | |
| | Temp Pass:   k9#Xm2$PqL9v                     | |
| | Sign-in URL: https://tamago.farm/sign-in      | |
| +-----------------------------------------------+ |
|                                                   |
| [ 📋 Copy Credentials ]                           |
+---------------------------------------------------+
|                                          [ Done ] |
+---------------------------------------------------+
```

##### Tenant Details Drawer / Slideover (AC7–AC9)
```
+---------------------------------------------------+
| Tenant Inspector: Sunrise Pastures            [X] |
+---------------------------------------------------+
| METADATA                                          |
| Tenant ID:    t-8f2a1b-90c2-4112 [Copy]           |
| Created At:   Nov 3, 2026, 09:15 AM               |
| Tier:         [ Premium Tier ]                    |
| Settings:     30 eggs/tray · Currency: PHP        |
|                                                   |
| DATABASE CONNECTION                               |
| Target:       Turso Cloud Edge Database           |
| Endpoint:     libsql://tamago-t-8f2a1b.turso.io   |
| Token Status: (●) Configured (scoped JWT)         |
| Edge Region:  sin (Singapore)                     |
| Size on Disk: 142 KB                              |
| Status:       (●) Ready                           |
|                                                   |
| [ ⚡ Test Connection ] -> [ (●) Connected (42ms) ]|
|                                                   |
| LINKED MEMBERS (1)                                |
| • clara@sunrisepastures.com (Owner)               |
|   UID: u-f9823b49 [c]  ·  Joined Nov 3, 2026      |
|                                                   |
| QUICK ACTIONS                                     |
| [ Edit Settings ]  [ View Telemetry ]  [ Unlink ] |
+---------------------------------------------------+
```

---

#### Tab 3: Auth Users Roster & Mapping (AC19–AC22)

##### Desktop Layout (≥ 1024px)
```
+----------------------------------------------------------------------------------------------------+
| Firebase Auth Users Roster                                                Showing 14 total users   |
| [ Search by email or UID...                              ]                                         |
+----------------------------------------------------------------------------------------------------+
| Email                     UID           Verified   Assigned Farm        Registered   Last Login  Act.  |
|----------------------------------------------------------------------------------------------------|
| clara@sunrisepastures.com u-f9823b [c]  [✓ Yes]    Sunrise Pastures     Nov 3, 2026  10m ago     [⋮]  |
| owner@hendricks.com       u-1092aa [c]  [✓ Yes]    Hendricks Farm       Oct 28, 2026 2h ago      [⋮]  |
| stray@worker.com          u-98112c [c]  [Unverif]  [⚠ Unassigned]       Today        Never       [⋮]  |
+----------------------------------------------------------------------------------------------------+
```

##### Mobile Layout (~375px)
```
+-------------------------------------+
| Auth Users (14)                     |
+-------------------------------------+
| [ Search email or UID...          ] |
+-------------------------------------+
| +---------------------------------+ |
| | clara@sunrisepastures.com       | |
| | UID: u-f9823b [c]  ·  [Verified]| |
| | Farm: Sunrise Pastures          | |
| | Registered Nov 3, 2026          | |
| | [ Transfer Farm ]          [ ⋮ ]| |
| +---------------------------------+ |
| +---------------------------------+ |
| | stray@worker.com                | |
| | UID: u-98112c [c]  ·  [Unverif] | |
| | Farm: [⚠ Unassigned]            | |
| | Registered Today                | |
| | [ Assign to Farm ]         [ ⋮ ]| |
| +---------------------------------+ |
+-------------------------------------+
```

##### User Farm Transfer Confirmation Modal (AC21)
```
+---------------------------------------------------+
| Transfer User to Another Farm                 [X] |
+---------------------------------------------------+
| ⚠ CAUTION: DATA ACCESS TRANSFER                   |
| You are transferring:                             |
| User: clara@sunrisepastures.com                   |
| From: Sunrise Pastures                            |
|                                                   |
| Select Destination Farm:                          |
| [ Hendricks Farm (t-1039bc)                     v]|
|                                                   |
| The user will immediately lose access to Sunrise  |
| Pastures and will see Hendricks Farm records.     |
| Existing user auth sessions will be revoked.      |
+---------------------------------------------------+
| [ Cancel ]                   [ Confirm Transfer ] |
+---------------------------------------------------+
```

---

#### Tab 4: Database Migrations (AC23–AC26)

##### Desktop Layout (≥ 1024px)
```
+----------------------------------------------------------------------------------------------------+
| Database Migrations                                           [ Run Migrations on All Tenants ]    |
| System Schema Version: v12 (20261103_add_cdc_indices.sql)     Status: 11 of 12 up to date          |
+----------------------------------------------------------------------------------------------------+
| Farm Name          Tenant ID     Current Schema   Migration Status   Last Error Details     Action |
|----------------------------------------------------------------------------------------------------|
| Sunrise Pastures   t-8f2a1b [c]  v12 (Latest)     [✓ Up to date]     -                      [Test] |
| Hendricks Farm     t-1039bc [c]  v11              [⚠ Pending v12]    -                      [Run]  |
| Batangas Free Barn t-49a012 [c]  v12 (Latest)     [✓ Up to date]     -                      [Test] |
| Southern Coop      t-8812bb [c]  v11 (Failed)     [✕ Error]          Timeout statement 4    [Retry]|
+----------------------------------------------------------------------------------------------------+
```

##### Batch Migration Progress Dialog (AC24, AC25)
```
+---------------------------------------------------+
| Running Fleet Schema Migrations                   |
+---------------------------------------------------+
| Applying migration v12 across 2 pending databases |
|                                                   |
| Progress: 1 of 2 completed                        |
| [========================-----------------------] |
|                                                   |
| Currently applying:                               |
| • Sunrise Pastures: (✓ Done)                      |
| • Southern Coop:    (⟳ Executing Drizzle DDL...)   |
|                                                   |
| Please keep this window open until complete.      |
+---------------------------------------------------+
|                                       [ Close ]   |
+---------------------------------------------------+
```

---

#### Tab 5: Sync Telemetry & CDC Change Log (AC27–AC30)

##### Desktop Layout (≥ 1024px)
```
+----------------------------------------------------------------------------------------------------+
| Cloud Sync Telemetry & Diagnostics                                     Showing 12 active tenants   |
| [ Filter by farm or sync health... ]                                                               |
+----------------------------------------------------------------------------------------------------+
| Farm Name          CDC Ver.  Devices (30d)  Last Push (/push)       Last Pull (/pull)     Health   |
|----------------------------------------------------------------------------------------------------|
| Sunrise Pastures   v482      2 devices (D1,D2) 2 mins ago (dev-D1)  1 min ago (dev-D1)    [● Synced]|
| Hendricks Farm     v1290     3 devices (D1..D3) 14 hrs ago (dev-D2) 12 hrs ago (dev-D3)   [○ Idle]  |
| Batangas Barn      v89       1 device (D1)    2 days ago (dev-D1)   2 days ago (dev-D1)   [○ Idle]  |
| Mountain Ridge     v312      2 devices (D1,D2) 5 mins ago (dev-D2)  5 mins ago (dev-D2)   [⚠ Desync]|
+----------------------------------------------------------------------------------------------------+
```

##### Change Log Viewer & Sync Inspector Drawer (AC28, AC29)
```
+---------------------------------------------------+
| Sync Inspector: Mountain Ridge (t-7718aa)     [X] |
+---------------------------------------------------+
| [ > Change Log < ]    [ Sync Issues (1) ]         |
+---------------------------------------------------+
| Filter Entity: [ All Entities v ]  Device: [ All v|
|---------------------------------------------------|
| Ver  Entity      Action   Device   Time           |
| v312 production  insert   dev-D2   5m ago   [ ▼ ] |
| {                                                 |
|   "id": "prod-189a",                              |
|   "date": "2026-11-03",                           |
|   "sizeId": "sz-large",                           |
|   "eggs": 360                                     |
| }                                                 |
| v311 sales       insert   dev-D1   12m ago  [ ▶ ] |
| v310 clients     update   dev-D1   1h ago   [ ▶ ] |
|---------------------------------------------------|
| CATACLYSMIC DESYNC RECOVERY                       |
| Generate fresh verified cloud snapshot for client:|
| [ 🔄 Prepare Fresh Sync Snapshot ]                |
+---------------------------------------------------+
```

---

#### Tab 6: Operator Action Audit Log (AC34)

##### Desktop Layout (≥ 1024px)
```
+----------------------------------------------------------------------------------------------------+
| Operator Audit Log                                                      Showing last 50 actions    |
| [ Search operator, action, or target ID... ]                                                      |
+----------------------------------------------------------------------------------------------------+
| Timestamp           Operator         Action Type         Target ID   Summary Description           |
|----------------------------------------------------------------------------------------------------|
| Nov 3, 2026, 09:30  mak@tamago.farm  tenant_provision    t-8f2a1b    Provisioned Sunrise Pastures  |
| Nov 3, 2026, 09:12  mak@tamago.farm  user_transfer       u-f9823b    Transferred user to t-8f2a1b  |
| Nov 2, 2026, 17:44  mak@tamago.farm  batch_migration     fleet       Ran migration v12 on 3 farms  |
| Nov 1, 2026, 11:05  mak@tamago.farm  settings_update     t-1039bc    Updated eggs_per_tray: 30->36 |
+----------------------------------------------------------------------------------------------------+
```

---

#### Unauthorized Non-Admin View (403 State, AC3)
```
+---------------------------------------------------+
|                                                   |
|                 ( 🚫 )                            |
|             Access Denied                         |
|                                                   |
|   Administrator privileges are required to        |
|   view the Operator Control Plane. Your account   |
|   (clara@sunrisepastures.com) is not registered   |
|   in the administrator registry.                  |
|                                                   |
|         [ Return to Farm Dashboard ]              |
|                                                   |
+---------------------------------------------------+
```

---

### Nuxt UI Component Mapping

| Admin Interface Element | Recommended Nuxt UI v4 Component | Nuxt UI Props & Configuration |
|---|---|---|
| Admin Navigation Shell | `UDashboardNavbar`, `UTabs` | `items: tabs`, `orientation: 'horizontal'` |
| Metric Summary Cards | `UCard` | Header with subtle uppercase label, primary metric text |
| Storage Progress Bar | `UProgress` | `v-model="percentage"`, `color="primary"`, size `'sm'` |
| Data Tables (Tenants, Users, Logs) | `UTable` | Responsive, column sorting, custom cell slots for badges |
| Mobile Cards | `UCard` | Stacked format below 768px, grouped key-value labels |
| Status & Health Badges | `UBadge` | `variant="subtle"`, pairs icon + text label |
| Drawers (Inspector, Change Log) | `USlideover` (Desktop) / `sheetUi` (Mobile) | Right-aligned on desktop; bottom-sheet on mobile |
| Modals (Provision, Transfer, Run) | `UModal` | Centered dialog, `preventClose` during mutations |
| Form Fields | `UFormField`, `UInput`, `USelect`, `URadioGroup` | With visible labels, validation messages, `inputmode` |
| Action Menus | `UDropdownMenu` | `items: menuItems`, icon trigger `lucide:more-vertical` |
| Loading Skeletons | `USkeleton` | Skeletons mirroring card and table row geometry |
| Degradation Warning Banner | `UAlert` | `color="warning"`, `variant="subtle"`, `role="alert"` |
| Notification Feedback | `useToast()` (`UToast`) | 3000ms duration, inverted styling, checkmark icon |

---

### UI States & Edge Cases

1. **Default State:**
   - Active tab highlighted, high-density data tables populated with live records.
   - Click-to-copy affordance on IDs and URLs copies silently and displays a green mini-check icon for 1.2s.
2. **Loading States (AC32):**
   - Initial load displays `USkeleton` cards and table rows matching the layout geometry.
   - No layout shifts or flashing "0" counters while Turso API or Control DB queries resolve.
   - Long-running buttons (Provisioning, Migration execution) display animated loading spinner and disable duplicate clicks (`aria-busy="true"`).
3. **Empty States (AC31):**
   - **Tenants:** *"No tenant farms registered yet. Click 'Provision New Farm' to create your first cloud farm."* + Primary CTA.
   - **Search / Filter Zero Matches:** *"No farms found matching '{query}'"* + Secondary CTA *"Clear filters"*.
   - **Sync Telemetry (Clean Fleet):** *"All farms are syncing normally — no errors recorded."*
   - **Auth Users:** *"No users found in Firebase Auth."*
   - **Migrations:** *"All tenant databases are up to date with schema v12."*
   - **Audit Log:** *"No administrative actions recorded yet."*
4. **Validation Error States:**
   - Inputs show inline red border (`ring-error`) and descriptive error message below the field (`UFormField`).
   - Provision form prevents submit if Farm Name is empty or Email is malformed.
   - Eggs per tray validates integer 1–100 (rejects decimals, 0, or negative numbers).
5. **Turso API Resilience & Degradation State (AC13):**
   - When Turso Cloud returns 429, 502, or is unreachable, the Overview tab displays a persistent non-blocking amber `UAlert`:
     > *"Turso Cloud metrics currently unavailable; Control DB operational. [Refresh Metrics ↻]"*
   - Control DB actions (tenant roster, user assignment, farm settings) remain completely functional.
6. **Local Development Mode (AC12):**
   - When running against local SQLite files without Turso tokens:
     - Badges display `Local Dev Database`.
     - Quota cards display `Local Mock Metrics`.
     - No failing network requests are sent to Turso API.
7. **Success Toasts:**
   - Provisioning: *"Sunrise Pastures provisioned successfully."*
   - Settings Update: *"Farm settings updated."*
   - User Transfer: *"Transferred {user} to {farm}."*
   - Batch Migration: *"Successfully migrated {n} databases."*

---

### Exact Copy Library

#### Navigation & Headers
- App Title: **Tamago Control Plane**
- Page Subtitle: **Operator Fleet Administration & Infrastructure**
- Tabs: **Overview**, **Tenants**, **Auth Users**, **Migrations**, **Sync Telemetry**, **Audit Log**
- Environment Badges: **Production Cloud** (green), **Local Dev** (neutral)
- Top Action: **Back to Farm App**

#### Metric Cards
- Active Databases: **Active Databases** / **{used} / {max}** / **{pct}% of quota**
- Storage: **Total Storage Consumed** / **{usedMb} MB / {maxGb} GB**
- Status: **Turso Cloud Status** / **Operational** / **Degraded** / **Down**
- Fleet Sync: **Fleet Sync Health** / **{synced} Synced · {conflicts} Desync**

#### Buttons & Form Controls
- Primary Actions: **Provision New Farm**, **Provision Farm**, **Assign to Farm**, **Run Migrations on All Tenants**, **Confirm Transfer**, **Prepare Fresh Sync Snapshot**
- Secondary Actions: **Test Connection**, **Edit Settings**, **View Telemetry**, **Copy Credentials**, **Clear Filters**, **Retry Migration**, **Dismiss Issue**
- Row Menu Items: **View Details**, **Edit Farm Settings**, **Transfer User**, **Send Password Reset**, **Unlink from Farm**

#### Dialogs & Confirmation Warnings
- User Transfer: *"Are you sure you want to transfer {email} from {farmA} to {farmB}? The user will immediately lose access to {farmA} and will see {farmB}'s records."*
- Sole Member Unlink: *"This is the only member associated with {farmName}. Unlinking will leave the farm orphaned with no active owner. Proceed anyway?"*
- Batch Migration: *"Run migration {version} across {n} pending tenant databases? Operations will be applied sequentially."*
- Fresh Snapshot: *"Generate fresh cloud sync snapshot for {farmName}? This will reset local mutation queues on the client upon next connection."*

#### Toasts & System Feedback
- Copy Success: *"Copied to clipboard"*
- Provision Success: *"Farm provisioned successfully"*
- Settings Saved: *"Farm settings updated"*
- User Assigned: *"Assigned {email} to {farmName}"*
- User Transferred: *"Transferred {email} to {farmName}"*
- Migration Complete: *"All tenant databases migrated to {version}"*
- Test Connection Success: *"Connected ({ms}ms)"*
- Test Connection Error: *"Connection failed: {reason}"*

---

### Quantity & Formatting Rules
1. **Eggs per Tray:** Formatted as positive integer with label, e.g. `30 eggs/tray`. Stored in Control DB and tenant settings.
2. **Currency:** Formatted using ISO 3-letter uppercase (e.g. `PHP`, `USD`). Displayed with standard currency formatters.
3. **Storage Figures:** Automatically scaled to human-readable units: `KB`, `MB`, `GB` (e.g. `142 KB`, `48.2 MB`, `9.0 GB`).
4. **Latency:** Displayed in whole milliseconds (e.g. `42ms`).
5. **Dates & Timestamps:** Formatted in operator's local device timezone with relative tooltip (e.g. `Nov 3, 2026, 09:30 AM (2 hours ago)`).

---

### Accessibility Standards
1. **Touch Target Size:** All touch targets, table row action buttons, and modal dismiss buttons are strictly ≥ 44px × 44px.
2. **Numeric Input Modes:** Eggs per tray input uses `type="number"` and `inputmode="numeric"`.
3. **Form Semantics:** Every form input has an explicitly linked `<label>` and ARIA error bindings (`aria-invalid="true"`, `aria-describedby`).
4. **Color Independence:** No status is communicated by color alone. Every badge pairs a unique icon symbol with text (e.g., `(●) Ready`, `(⚠) Pending`, `(✕) Error`).
5. **High Sunlight Contrast:** Dark/light contrast complies with WCAG AA (minimum 4.5:1 contrast ratio) using `text-highlighted` and `text-muted` semantic classes.
6. **Keyboard Navigation:** Full modal and drawer focus-trapping; `Escape` key dismisses overlays; `Tab` moves in intuitive sequence.

---

### Data the UI Needs (For the Architect)

1. **Platform Metrics Endpoint (`GET /api/admin/metrics`):**
   - `turso`: `{ status: 'operational' | 'degraded' | 'down', activeDatabases: number, maxDatabases: number, totalBytesUsed: number, maxBytesAllowed: number, region: string, isLocalDev: boolean }`
   - `fleet`: `{ totalTenants: number, totalUsers: number, pendingMigrationsCount: number, desyncTenantsCount: number }`
2. **Tenants Management Endpoints:**
   - `GET /api/admin/tenants`: List of `{ id, name, tier, eggsPerTray, currency, dbUrl, dbType, hasToken, memberCount, tursoStatus, region, bytesUsed, createdAt, updatedAt }`.
   - `GET /api/admin/tenants/:id`: Detailed record including linked members list `[{ userId, email, role, joinedAt }]`.
   - `POST /api/admin/tenants/provision`: Payload `{ farmName, ownerEmail, tier, eggsPerTray, currency, initialPassword? }`. Returns provisioned tenant metadata and generated password.
   - `PATCH /api/admin/tenants/:id`: Update farm name, tier, eggs per tray, currency.
   - `POST /api/admin/tenants/:id/test-connection`: Lightweight ping `SELECT 1`. Returns `{ connected: boolean, latencyMs: number, error?: string }`.
3. **Auth Users Endpoints:**
   - `GET /api/admin/users`: List of `{ uid, email, emailVerified, tenantId?, farmName?, createdAt, lastSignInAt }`.
   - `POST /api/admin/users/:uid/assign`: Payload `{ tenantId }`.
   - `POST /api/admin/users/:uid/reassign`: Payload `{ newTenantId }`. Revokes active sessions.
   - `POST /api/admin/users/:uid/unlink`: Removes membership.
   - `POST /api/admin/users/:uid/reset-password`: Triggers Firebase Admin password reset email.
4. **Migrations Endpoints:**
   - `GET /api/admin/migrations`: Status payload `{ systemVersion: string, tenants: [{ tenantId, farmName, currentVersion, status: 'up_to_date' | 'pending' | 'error', lastError?: string }] }`.
   - `POST /api/admin/migrations/run-all`: Batch runner. Server-Sent Events (SSE) or polling stream returning `{ current: number, total: number, currentFarm: string, completed: boolean, errors: [] }`.
   - `POST /api/admin/migrations/run-single`: Payload `{ tenantId }`.
5. **Sync Telemetry Endpoints:**
   - `GET /api/admin/sync/telemetry`: List of `{ tenantId, farmName, changeLogVersion, activeDevices30d: number, lastPush: { timestamp, deviceId } | null, lastPull: { timestamp, deviceId } | null, health: 'synced' | 'idle' | 'conflict' | 'error' }`.
   - `GET /api/admin/sync/tenants/:id/change-log`: Paginated `{ version, entityType, action, deviceId, occurredAt, data }`.
   - `GET /api/admin/sync/tenants/:id/issues`: List of rejected mutations `{ mutationId, error, timestamp, payload }`.
   - `POST /api/admin/sync/tenants/:id/snapshot`: Generates clean snapshot marker in cloud DB.
6. **Audit Log Endpoint (`GET /api/admin/audit-logs`):**
   - Paginated list of `{ id, timestamp, operatorEmail, actionType, targetId, summary }`.

---

### Decisions for the Owner / Architect

1. **Tenant Deletion Policy:** Hard-deletion of tenant databases from the admin UI is deliberately **omitted from v1 scope** to prevent catastrophic data loss. Decommissioning a farm should be done via archiving (`tier = 'suspended'` or manual CLI drop).
2. **Credentials Generation Policy:** When provisioning without a manual password, the system generates a high-entropy 12-character random passphrase and surfaces it once on the completion screen. (Magic link sign-in can be added when custom SMTP is configured).
3. **Batch Migration Execution Model:** Sequential execution is recommended over parallel execution to prevent connection spikes and edge throttling on Turso Cloud groups.

---

## 3. Technical design (Architect)

### 3.1 Data Model & Migrations

#### Control DB Schema (`server/db/schema/control.ts`)
The Control DB stores SaaS-level metadata across all tenants, user memberships, and administrative audit trails.

1. **`tenants` table update:**
   Add `tier` column to track subscription tier (`free` vs `premium`).
   ```typescript
   export const tenants = sqliteTable('tenants', {
     id: text('id').primaryKey(),
     name: text('name').notNull(),
     tier: text('tier', { enum: ['free', 'premium'] }).notNull().default('free'),
     eggsPerTray: integer('eggs_per_tray').notNull().default(30),
     currency: text('currency').notNull().default('PHP'),
     /** Turso database URL or local SQLite file URL (e.g. libsql://tamago-xyz.turso.io or file:local-tenant.db) */
     dbUrl: text('db_url').notNull(),
     /** Scoped Turso database auth token (empty string for local file: URLs) */
     dbAuthToken: text('db_auth_token').notNull().default(''),
     createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
     updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
   })
   ```

2. **`admin_audit_logs` table addition (AC34):**
   New table in Control DB capturing all operator actions executed through `/admin`.
   ```typescript
   export const adminAuditLogs = sqliteTable(
     'admin_audit_logs',
     {
       id: text('id').primaryKey(),
       operatorEmail: text('operator_email').notNull(),
       actionType: text('action_type', {
         enum: [
           'tenant_provision',
           'tenant_settings_update',
           'user_assign',
           'user_transfer',
           'user_unlink',
           'user_password_reset',
           'schema_migration',
           'sync_snapshot_reset',
         ],
       }).notNull(),
       targetId: text('target_id').notNull(), // Tenant ID or User UID
       summary: text('summary').notNull(),
       details: text('details'), // Optional serialized JSON payload/diff
       createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
     },
     table => [
       index('admin_audit_logs_created_at_idx').on(table.createdAt),
       index('admin_audit_logs_operator_idx').on(table.operatorEmail),
     ],
   )

   export type ControlAdminAuditLogRow = typeof adminAuditLogs.$inferSelect
   export type NewControlAdminAuditLogRow = typeof adminAuditLogs.$inferInsert
   ```

3. **Control DB Bootstrap (`server/db/turso.ts`):**
   Update `initControlDbSchema(client: LibSqlClient)` to ensure the new columns and tables exist automatically in development and local environments:
   ```typescript
   await client.batch([
     `CREATE TABLE IF NOT EXISTS tenants (
       id TEXT PRIMARY KEY,
       name TEXT NOT NULL,
       tier TEXT NOT NULL DEFAULT 'free',
       eggs_per_tray INTEGER NOT NULL DEFAULT 30,
       currency TEXT NOT NULL DEFAULT 'PHP',
       db_url TEXT NOT NULL,
       db_auth_token TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
     `CREATE TABLE IF NOT EXISTS memberships (
       id TEXT PRIMARY KEY,
       tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
       user_id TEXT NOT NULL UNIQUE,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
     `CREATE TABLE IF NOT EXISTS admin_audit_logs (
       id TEXT PRIMARY KEY,
       operator_email TEXT NOT NULL,
       action_type TEXT NOT NULL,
       target_id TEXT NOT NULL,
       summary TEXT NOT NULL,
       details TEXT,
       created_at TEXT NOT NULL
     )`,
     `CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs (created_at)`,
     `CREATE INDEX IF NOT EXISTS admin_audit_logs_operator_idx ON admin_audit_logs (operator_email)`,
   ], 'write')
   ```

4. **Migrations execution:**
   - Generate: `bun run db:generate:control`
   - Apply: `bun run db:push:control`

5. **Tenant DB Schema:**
   Individual tenant schemas already define `farm_settings` with `tier` in `core/db/schema.ts`. When an operator toggles tier or settings via `/admin`, updates propagate atomically to both Control DB `tenants` and Tenant DB `farm_settings`.

---

### 3.2 Tenancy, Isolation & Security Architecture

1. **Database-Per-Tenant Separation:**
   - The admin control plane routes query the **Control DB** for fleet-level metadata (tenants, memberships, audit logs).
   - Tenant-specific operations (e.g. testing connectivity, inspecting change logs, applying migrations, preparing snapshots) resolve the target tenant's database connection via `getTenantDrizzleDb(dbUrl, dbAuthToken)` on-demand.
   - Farm tenant requests (`/api/**`) continue to use `defineTenantHandler` where `tenant_id` is derived strictly from the authenticated user's session in `memberships`.
   - Admin routes (`/api/admin/**`) are decoupled from tenant context and use `defineAdminHandler`.

2. **Security Guard: `defineAdminHandler` (`server/utils/handlers.ts`):**
   Enforces four non-negotiable security layers:
   ```typescript
   export interface AdminContext extends AuthContext {
     // Admin routes operate across the fleet; tenantId is NOT bound to the context.
   }

   export function defineAdminHandler<T>(
     fn: (event: H3Event<EventHandlerRequest>, ctx: AdminContext) => T | Promise<T>,
   ) {
     return defineEventHandler(async (event) => {
       noStore(event) // Cache-Control: private, no-store
       try {
         assertRequestAllowed(event) // Layer 1: CSRF origin & Content-Type validation
         const ctx = await requireAdmin(event) // Layer 2: Firebase Auth + ADMIN_EMAILS check
         return await fn(event, ctx)
       }
       catch (e) {
         throw toApiError(e)
       }
     })
   }
   ```

3. **Admin Verification: `requireAdmin` (`server/utils/auth.ts`):**
   ```typescript
   export async function requireAdmin(event: H3Event): Promise<AdminContext> {
     const auth = await requireAuth(event) // 401 unauthenticated if missing/invalid
     const adminEmailsRaw = process.env.ADMIN_EMAILS?.trim() || ''
     const adminEmails = adminEmailsRaw
       .split(',')
       .map(e => e.trim().toLowerCase())
       .filter(Boolean)

     const userEmail = (auth.email || '').toLowerCase()
     if (!adminEmails.includes(userEmail)) {
       // AC3: 403 Forbidden with generic code. Never leak tenant or infrastructure metadata.
       throw apiError(403, 'forbidden')
     }

     return auth
   }
   ```

4. **Secret Sanitization & Zero Plaintext Credentials (AC35):**
   - Turso Platform API tokens (`TURSO_API_TOKEN`), Firebase Admin service account keys, and tenant database auth tokens (`dbAuthToken`) are **strictly server-only**.
   - Admin endpoints returning tenant details return `hasToken: boolean`, never the raw token.
   - Client tenant personal information (customer names, phone numbers) are never aggregated or exposed on the global admin overview screen.

---

### 3.3 Services & Repositories Architecture

```
server/
├── services/
│   ├── turso-platform.ts        # Turso Cloud Management API client & metric fetcher
│   └── provision.ts             # Orchestrated 1-click provisioning pipeline
└── repositories/
    ├── admin-tenants.ts         # Fleet queries, settings update, connectivity ping
    ├── admin-users.ts           # Firebase Admin user list, membership transfer, reset
    ├── admin-migrations.ts      # Schema migration status & sequential batch execution
    ├── admin-sync.ts            # Fleet telemetry, CDC change log query, fresh snapshot
    └── admin-audit.ts           # Audit log persistence & query in Control DB
```

#### 1. `server/services/turso-platform.ts`
Interacts with the Turso Cloud REST API (`https://api.turso.tech/v1/organizations/{org}`).
- `getTursoOrganizationMetrics()`:
  - Fetches organization database list (`/databases`) and usage data.
  - Returns: `{ status: 'operational' | 'degraded' | 'down', activeDatabases: number, maxDatabases: number, totalBytesUsed: number, maxBytesAllowed: number, region: string, isLocalDev: boolean }`.
  - **Graceful degradation (AC12, AC13):** If `TURSO_API_TOKEN` is unset, returns local dev mock metrics. If Turso API returns 429, 502, or network error, returns `{ status: 'degraded' }` without throwing, so Control DB features remain 100% operational.
- `createTenantTursoDatabase(tenantId: string)`:
  - Provisions `tamago-${sanitizedId}` database in the organization group and mints a scoped JWT.
- `deleteTenantTursoDatabase(tenantId: string)`:
  - Rollback helper called during provisioning if subsequent schema bootstrap fails (AC16).
- `testDatabasePing(dbUrl: string, dbAuthToken?: string)`:
  - Executes a lightweight ping `SELECT 1` with a 5000ms timeout. Measures round-trip latency in milliseconds.

#### 2. `server/repositories/admin-tenants.ts`
- `listAdminTenants(filter?: { search?: string, tier?: string })`:
  - Queries Control DB `tenants` left-joined with `memberships` grouped by `tenant_id` to get `memberCount`.
  - Integrates with Turso Platform database list to annotate status (`ready`, `creating`, `degraded`) and edge region.
- `getAdminTenantDetails(tenantId: string)`:
  - Retrieves tenant record, linked Firebase users (UID, email, role, joined date), and masked connection information.
- `updateAdminTenantSettings(tenantId: string, params: { name?: string, tier?: 'free' | 'premium', eggsPerTray?: number, currency?: string }, operatorEmail: string)`:
  - Atomic transaction: updates Control DB `tenants` and Tenant DB `farm_settings`. Records audit log in `admin_audit_logs`.
- `testTenantDbConnection(tenantId: string)`:
  - Resolves tenant DB credentials from Control DB and invokes `testDatabasePing`.

#### 3. `server/repositories/admin-users.ts`
- `listFirebaseUsers(filter?: { search?: string })`:
  - Calls `adminAuth.listUsers(1000)`.
  - Cross-references Control DB `memberships` and `tenants` to annotate each user with `tenantId` and `farmName` (or `Unassigned`).
- `assignUserToFarm(uid: string, tenantId: string, operatorEmail: string)`:
  - Inserts row into `memberships`. Writes audit log.
- `reassignUserFarm(uid: string, newTenantId: string, operatorEmail: string)`:
  - Updates `memberships.tenant_id = newTenantId`.
  - Calls `adminAuth.revokeRefreshTokens(uid)` so active client sessions refresh immediately (AC21). Writes audit log.
- `unlinkUserFromFarm(uid: string, operatorEmail: string)`:
  - Deletes membership row.
  - Warns if user is the sole member of the farm (AC22). Writes audit log.
- `sendUserPasswordReset(uid: string, operatorEmail: string)`:
  - Looks up user email and triggers standard Firebase password reset dispatch.

#### 4. `server/repositories/admin-migrations.ts`
- `getFleetMigrationStatus()`:
  - Reads latest migration version in codebase (`server/db/migrations/tenant`).
  - Queries each tenant's database for highest applied migration version (via `__drizzle_migrations` or `schema_migrations`).
  - Returns fleet summary: `{ systemVersion: string, totalCount: number, upToDateCount: number, tenants: [...] }`.
- `runSingleTenantMigration(tenantId: string, operatorEmail: string)`:
  - Connects to tenant database and applies pending DDL migrations. Returns `{ success: boolean, version: string, error?: string }`.
- `runBatchMigrations(targetTenantIds?: string[], operatorEmail: string)`:
  - Iterates sequentially through all pending tenant databases.
  - **Failure isolation (AC25):** If farm A fails, error is recorded, and the runner proceeds to farm B without halting the batch. Records audit log.

#### 5. `server/repositories/admin-sync.ts`
- `getFleetSyncTelemetry()`:
  - For each cloud-backed farm, queries:
    - Max `version` in `change_log`.
    - Distinct `device_id` count over the last 30 days.
    - Most recent `change_log` timestamp (`lastPush`).
    - Most recent `sync_state.last_pulled_at` (`lastPull`).
  - Computes health badge (`synced`, `idle`, `conflict`, `error`) (AC27).
- `getTenantChangeLog(tenantId: string, options: { page: number, limit: number, entityType?: string, deviceId?: string })`:
  - Returns paginated change log records from `change_log` with parsed JSON `data`.
- `getTenantSyncIssues(tenantId: string)`:
  - Lists rejected mutations from `outbox_mutations` or sync logs (AC29).
- `prepareFreshSyncSnapshot(tenantId: string, operatorEmail: string)`:
  - Writes a baseline snapshot checkpoint in the tenant DB to unstick corrupted clients (AC30). Records audit log.

#### 6. `server/repositories/admin-audit.ts`
- `recordAdminAuditLog(entry: { operatorEmail: string, actionType: string, targetId: string, summary: string, details?: unknown })`:
  - Inserts record into `admin_audit_logs`.
- `listAdminAuditLogs(options: { page?: number, limit?: number, query?: string })`:
  - Returns paginated list of audit records ordered by `created_at DESC`.

---

### 3.4 Server API Contracts (`/api/admin/**`)

All routes wrapped in `defineAdminHandler`. All write endpoints require `content-type: application/json`. Error response format follows `ApiErrorData` (`createError({ statusCode, data: { code, ... } })`).

#### 1. Platform Metrics
- **`GET /api/admin/metrics`**
  - **Response (200):**
    ```typescript
    {
      turso: {
        status: 'operational' | 'degraded' | 'down',
        activeDatabases: number,
        maxDatabases: number,
        totalBytesUsed: number,
        maxBytesAllowed: number,
        region: string,
        isLocalDev: boolean
      },
      fleet: {
        totalTenants: number,
        totalUsers: number,
        pendingMigrationsCount: number,
        desyncTenantsCount: number
      }
    }
    ```

#### 2. Tenant Fleet Management
- **`GET /api/admin/tenants`**
  - **Query:** `?search=string&tier=free|premium`
  - **Response (200):**
    ```typescript
    {
      tenants: Array<{
        id: string,
        name: string,
        tier: 'free' | 'premium',
        eggsPerTray: number,
        currency: string,
        dbUrl: string,
        dbType: 'turso' | 'local',
        hasToken: boolean,
        memberCount: number,
        tursoStatus?: string,
        region?: string,
        bytesUsed?: number,
        createdAt: string,
        updatedAt: string
      }>,
      total: number
    }
    ```

- **`GET /api/admin/tenants/:id`**
  - **Response (200):**
    ```typescript
    {
      tenant: {
        id: string,
        name: string,
        tier: 'free' | 'premium',
        eggsPerTray: number,
        currency: string,
        dbUrl: string,
        hasToken: boolean,
        createdAt: string,
        updatedAt: string
      },
      members: Array<{
        userId: string,
        email: string,
        role: string,
        createdAt: string
      }>
    }
    ```

- **`POST /api/admin/tenants/provision`**
  - **Zod Schema:**
    ```typescript
    const provisionSchema = z.object({
      farmName: z.string().trim().min(1).max(100),
      ownerEmail: z.string().trim().email(),
      tier: z.enum(['free', 'premium']).default('premium'),
      eggsPerTray: z.number().int().min(1).max(100).default(30),
      currency: z.string().trim().length(3).default('PHP'),
      initialPassword: z.string().min(8).optional(),
    })
    ```
  - **Response (201):**
    ```typescript
    {
      tenant: {
        id: string,
        name: string,
        tier: string,
        eggsPerTray: number,
        currency: string,
        dbUrl: string
      },
      owner: {
        userId: string,
        email: string,
        generatedPassword?: string
      }
    }
    ```

- **`PATCH /api/admin/tenants/:id`**
  - **Zod Schema:**
    ```typescript
    const updateTenantSchema = z.object({
      name: z.string().trim().min(1).max(100).optional(),
      tier: z.enum(['free', 'premium']).optional(),
      eggsPerTray: z.number().int().min(1).max(100).optional(),
      currency: z.string().trim().length(3).toUpperCase().optional(),
    })
    ```
  - **Response (200):** `{ success: true, tenant: ControlTenantRow }`

- **`POST /api/admin/tenants/:id/test-connection`**
  - **Response (200):**
    ```typescript
    {
      connected: boolean,
      latencyMs: number,
      error?: string
    }
    ```

#### 3. Auth Users Management
- **`GET /api/admin/users`**
  - **Query:** `?search=string`
  - **Response (200):**
    ```typescript
    {
      users: Array<{
        uid: string,
        email: string,
        emailVerified: boolean,
        tenantId?: string | null,
        farmName?: string | null,
        createdAt: string,
        lastSignInAt?: string | null
      }>,
      total: number
    }
    ```

- **`POST /api/admin/users/:uid/assign`**
  - **Zod Schema:** `z.object({ tenantId: z.string().uuid() })`
  - **Response (200):** `{ success: true }`

- **`POST /api/admin/users/:uid/reassign`**
  - **Zod Schema:** `z.object({ newTenantId: z.string().uuid() })`
  - **Response (200):** `{ success: true, sessionsRevoked: true }`

- **`POST /api/admin/users/:uid/unlink`**
  - **Response (200):** `{ success: true, wasSoleMember: boolean }`

- **`POST /api/admin/users/:uid/reset-password`**
  - **Response (200):** `{ success: true, emailSent: true }`

#### 4. Database Migrations
- **`GET /api/admin/migrations`**
  - **Response (200):**
    ```typescript
    {
      systemVersion: string,
      fleetSummary: {
        total: number,
        upToDate: number,
        pending: number,
        error: number
      },
      tenants: Array<{
        tenantId: string,
        farmName: string,
        currentVersion: string,
        status: 'up_to_date' | 'pending' | 'error',
        lastError?: string
      }>
    }
    ```

- **`POST /api/admin/migrations/run-all`**
  - **Zod Schema:** `z.object({ tenantIds: z.array(z.string().uuid()).optional() })`
  - **Response (200):**
    ```typescript
    {
      totalMigrated: number,
      successful: number,
      failed: number,
      results: Array<{
        tenantId: string,
        farmName: string,
        success: boolean,
        version: string,
        error?: string
      }>
    }
    ```

- **`POST /api/admin/migrations/run-single`**
  - **Zod Schema:** `z.object({ tenantId: z.string().uuid() })`
  - **Response (200):** `{ success: true, tenantId: string, version: string, error?: string }`

#### 5. Sync Telemetry & Change Log
- **`GET /api/admin/sync/telemetry`**
  - **Response (200):**
    ```typescript
    {
      telemetry: Array<{
        tenantId: string,
        farmName: string,
        changeLogVersion: number,
        activeDevices30d: number,
        lastPush: { timestamp: string, deviceId: string } | null,
        lastPull: { timestamp: string, deviceId: string } | null,
        health: 'synced' | 'idle' | 'conflict' | 'error'
      }>
    }
    ```

- **`GET /api/admin/sync/tenants/:id/change-log`**
  - **Query:** `?page=1&limit=50&entityType=sizes|production|clients|sales|orders&deviceId=string`
  - **Response (200):**
    ```typescript
    {
      changes: Array<{
        version: number,
        entityType: string,
        entityId: string,
        action: 'insert' | 'update' | 'delete',
        deviceId: string,
        occurredAt: string,
        data: Record<string, unknown>
      }>,
      total: number,
      page: number,
      limit: number
    }
    ```

- **`GET /api/admin/sync/tenants/:id/issues`**
  - **Response (200):**
    ```typescript
    {
      issues: Array<{
        id: string,
        mutationId: string,
        deviceId: string,
        error: string,
        occurredAt: string,
        payload: Record<string, unknown>
      }>
    }
    ```

- **`POST /api/admin/sync/tenants/:id/snapshot`**
  - **Response (200):** `{ success: true, baseVersion: number, appliedAt: string }`

#### 6. Operator Audit Log
- **`GET /api/admin/audit-logs`**
  - **Query:** `?page=1&limit=50&query=string`
  - **Response (200):**
    ```typescript
    {
      logs: Array<{
        id: string,
        operatorEmail: string,
        actionType: string,
        targetId: string,
        summary: string,
        details?: string | null,
        createdAt: string
      }>,
      total: number,
      page: number,
      limit: number
    }
    ```

---

### 3.5 Frontend Architecture

#### 1. Routing & Auth Middleware (`app/middleware/admin.ts`)
- Navigating to `/admin` activates the `admin` middleware:
  - If unauthenticated: redirects to `/sign-in?redirect=/admin` (AC2).
  - If authenticated: calls `/api/admin/metrics` to verify admin clearance.
  - If 403 Forbidden: renders `AdminAccessDenied.vue` with button "Return to Farm Dashboard" (`/`) (AC3).

#### 2. Composable (`app/composables/useAdmin.ts`)
Encapsulates all administrative state, reactive queries, and mutations:
- `metrics`: reactive platform infrastructure and fleet health indicators.
- `tenants`: list, search filter, tier filter, and inspector state.
- `users`: Firebase user roster, assignment, transfer, and password reset actions.
- `migrations`: fleet schema status, single-run, and batch-run runners.
- `sync`: telemetry list, change log pagination, and fresh snapshot trigger.
- `audit`: operator audit log stream.

#### 3. Component Hierarchy (`app/components/admin/`)
```
app/pages/admin/index.vue
├── AdminNavShell.vue                   # Header with operator info, environment pill, tabs
├── AdminOverviewTab.vue                # Metric summary cards (Databases, Storage, Status, Fleet Sync)
├── AdminTenantsTab.vue                 # Tenants data table (desktop) / card stack (mobile) + filters
│   ├── AdminTenantDrawer.vue           # Slideover inspector (desktop) / sheet (mobile) + connection ping
│   └── AdminTenantProvisionModal.vue   # 1-click provisioning modal + credentials handoff
├── AdminUsersTab.vue                   # Firebase users roster + assignment triggers
│   └── AdminUserTransferModal.vue      # Transfer farm confirmation dialog with safety warnings
├── AdminMigrationsTab.vue              # Fleet schema status table + batch runner progress modal
├── AdminSyncTelemetryTab.vue           # Fleet sync health table
│   └── AdminSyncInspectorDrawer.vue    # Change log JSON explorer + fresh snapshot action
├── AdminAuditLogsTab.vue               # Operator audit log data table with search
└── AdminAccessDenied.vue               # 403 fallback card for unauthorized users
```

#### 4. Responsive Viewports & Nuxt UI v4
- **Desktop (≥ 1024px):** Dense `UTable` views with responsive column sorting, `USlideover` drawers for inspection, and side-by-side metric cards.
- **Mobile (~375px):** Stacked `UCard` list for tenants and users, `sheetUi` bottom sheets for drawers, full-width inputs, and tap targets ≥ 44px.
- **Components:** `UApp`, `UTabs`, `UTable`, `UModal`, `USlideover`, `UCard`, `UBadge`, `UProgress`, `UButton`, `UInput`, `USelect`, `UFormField`, `UAlert`, `USkeleton`, `UDropdownMenu`, `useToast()`.

---

### 3.6 Invariants at Risk & Protection Rules

| Invariant / System Rule | Risk in Admin Control Plane | Protection Mechanism in Technical Design |
|---|---|---|
| **Database-Per-Tenant Isolation** (`GEMINI.md`) | Admin dashboard querying cross-tenant data might accidentally mix tenant records. | Control plane queries only Control DB for SaaS metadata. Operations on tenant DBs dynamically connect to the isolated tenant DB via `getTenantDrizzleDb`. No tenant queries cross physical boundaries. |
| **No Tenant ID in Farm Requests** (`GEMINI.md`) | Exposing tenant IDs to client app might compromise tenant boundary. | Normal app routes (`/api/**`) continue deriving tenant exclusively from authenticated session. `/api/admin/**` uses `defineAdminHandler` with strict `ADMIN_EMAILS` check; non-admins get immediate 403 without data leakage. |
| **Secret Material Protection** (`GEMINI.md`, AC35) | Leaking Turso API tokens or DB auth tokens in client bundles or responses. | `TURSO_API_TOKEN` and `dbAuthToken` remain strictly server-only. The API returns `hasToken: boolean`, never plaintext secrets. Verified by `bun run check:build`. |
| **Non-Admin Reconnaissance** (AC3) | Unauthorized users probing `/admin` to discover farm names, databases, or tenant counts. | `defineAdminHandler` rejects non-admin users with 403 `forbidden` before performing any database lookups or returning any metadata. |
| **Atomic Provisioning** (AC15, AC16) | Half-created tenant if database creation succeeds but schema bootstrap fails. | If schema bootstrap or membership insert fails, `deleteTenantTursoDatabase` rolls back the Turso DB, preventing orphaned broken tenants in Control DB. |
| **Migration Failure Blast Radius** (AC25) | A syntax error or lock timeout on one tenant database halting fleet-wide migrations. | `runBatchMigrations` iterates sequentially with isolated try/catch per tenant. Errors are logged and flagged on that tenant's status without stopping the remaining tenants. |
| **User Session Invalidation on Transfer** (AC21) | Reassigned user continuing to write to previous farm's cloud database via stale tokens. | `reassignUserFarm` immediately calls Firebase Admin `revokeRefreshTokens(uid)` to force token refresh and invalidate cached membership sessions. |

---

### 3.7 Tasks (`[BE]` / `[FE]`)

#### Backend Tasks (`[BE]`)
- [x] **[BE 1] Update Control DB Schema & Turso Bootstrap**
  - Add `tier` column to `tenants` table in `server/db/schema/control.ts`.
  - Add `adminAuditLogs` table and indexes in `server/db/schema/control.ts`.
  - Update `initControlDbSchema` in `server/db/turso.ts` to include `tier` and `admin_audit_logs`.
  - Generate and push migration: `bun run db:generate:control && bun run db:push:control`.
- [x] **[BE 2] Implement `defineAdminHandler` & `requireAdmin`**
  - Add `requireAdmin` in `server/utils/auth.ts` enforcing `ADMIN_EMAILS` check.
  - Add `defineAdminHandler` in `server/utils/handlers.ts` with CSRF `assertRequestAllowed` and `noStore`.
  - Add `forbidden` error code to `ApiErrorCode` and status messages in `server/utils/errors.ts` and `shared/types/api.ts`.
- [x] **[BE 3] Implement Turso Platform Service (`server/services/turso-platform.ts`)**
  - Build `getTursoOrganizationMetrics` with local dev fallback and resilience for 429/502 errors.
  - Build `createTenantTursoDatabase`, `deleteTenantTursoDatabase`, and `testDatabasePing`.
- [x] **[BE 4] Implement Admin Audit Repository (`server/repositories/admin-audit.ts`)**
  - Build `recordAdminAuditLog` and `listAdminAuditLogs`.
  - Create endpoint `GET /api/admin/audit-logs`.
- [x] **[BE 5] Implement Admin Tenants Repository & Endpoints**
  - Build `server/repositories/admin-tenants.ts` (`listAdminTenants`, `getAdminTenantDetails`, `updateAdminTenantSettings`, `testTenantDbConnection`).
  - Wire endpoints: `GET /api/admin/metrics`, `GET /api/admin/tenants`, `GET /api/admin/tenants/:id`, `PATCH /api/admin/tenants/:id`, `POST /api/admin/tenants/:id/test-connection`.
  - Refactor provisioning service `server/services/provision.ts` to support atomic admin provisioning and wire `POST /api/admin/tenants/provision`.
- [x] **[BE 6] Implement Admin Users Repository & Endpoints (`server/repositories/admin-users.ts`)**
  - Build `listFirebaseUsers`, `assignUserToFarm`, `reassignUserFarm` (with `revokeRefreshTokens`), `unlinkUserFromFarm`, and `sendUserPasswordReset`.
  - Wire endpoints: `GET /api/admin/users`, `POST /api/admin/users/:uid/assign`, `POST /api/admin/users/:uid/reassign`, `POST /api/admin/users/:uid/unlink`, `POST /api/admin/users/:uid/reset-password`.
- [x] **[BE 7] Implement Admin Migrations Repository & Endpoints (`server/repositories/admin-migrations.ts`)**
  - Build `getFleetMigrationStatus`, `runSingleTenantMigration`, and `runBatchMigrations` with isolated failure handling.
  - Wire endpoints: `GET /api/admin/migrations`, `POST /api/admin/migrations/run-all`, `POST /api/admin/migrations/run-single`.
- [x] **[BE 8] Implement Admin Sync Telemetry Repository & Endpoints (`server/repositories/admin-sync.ts`)**
  - Build `getFleetSyncTelemetry`, `getTenantChangeLog`, `getTenantSyncIssues`, and `prepareFreshSyncSnapshot`.
  - Wire endpoints: `GET /api/admin/sync/telemetry`, `GET /api/admin/sync/tenants/:id/change-log`, `GET /api/admin/sync/tenants/:id/issues`, `POST /api/admin/sync/tenants/:id/snapshot`.

#### Frontend Tasks (`[FE]`)
- [x] **[FE 9] Admin Route Guard & Composable Foundation**
  - Create `app/middleware/admin.ts` to enforce authentication and handle 403 access denial.
  - Create `app/composables/useAdmin.ts` wrapping `/api/admin/**` endpoints with reactive state.
  - Create `app/components/admin/AdminAccessDenied.vue` with "Return to Farm Dashboard" button.
- [x] **[FE 10] Admin Shell & Overview Tab**
  - Create `app/pages/admin/index.vue` with tab navigation (`UTabs`) and URL query state (`?tab=...`).
  - Create `app/components/admin/AdminNavShell.vue` with operator profile, environment pill, and "Back to Farm App" link.
  - Create `app/components/admin/AdminOverviewTab.vue` with infrastructure gauges (Databases, Storage, Status, Fleet Sync).
- [x] **[FE 11] Tenant Fleet View & Inspection Drawer**
  - Create `app/components/admin/AdminTenantsTab.vue` with responsive table (desktop), cards (mobile), search, and tier filter.
  - Create `app/components/admin/AdminTenantDrawer.vue` (`USlideover` / bottom sheet) showing database details, members list, and "Test Connection" button.
- [x] **[FE 12] 1-Click Provisioning Modal**
  - Create `app/components/admin/AdminTenantProvisionModal.vue` (`UModal`) with validation for farm name, email, tier, tray size, and optional password.
  - Implement completion state displaying generated credentials with "Copy Credentials" button.
- [x] **[FE 13] Auth Users Roster & Transfer Workflows**
  - Create `app/components/admin/AdminUsersTab.vue` listing Firebase users, verification status, and assigned farm.
  - Create `app/components/admin/AdminUserTransferModal.vue` with safety confirmation warning and farm selector.
  - Implement action menu triggers for "Assign to Farm", "Send Password Reset", and "Unlink".
- [x] **[FE 14] Database Migrations View & Batch Runner**
  - Create `app/components/admin/AdminMigrationsTab.vue` displaying schema versions and migration status per tenant.
  - Create batch execution progress dialog displaying sequential migration status and isolated error flags.
- [x] **[FE 15] Sync Telemetry & Change Log Inspector**
  - Create `app/components/admin/AdminSyncTelemetryTab.vue` with fleet sync health badges and device counts.
  - Create `app/components/admin/AdminSyncInspectorDrawer.vue` displaying CDC change log stream, expandable JSON viewer, and "Prepare Fresh Sync Snapshot" action.
- [x] **[FE 16] Operator Audit Log View & Mobile Responsive Polish**
  - Create `app/components/admin/AdminAuditLogsTab.vue` with timestamped event stream and search filter.
  - Test and verify responsive behavior across mobile (~375px) and desktop (≥ 1024px) viewports: touch targets ≥ 44px, bottom sheets, and zero horizontal overflow.

---

### 3.8 Decisions & Trade-offs

1. **`ADMIN_EMAILS` Environment Variable vs Firebase Custom Claims:**
   - *Decision:* Use `ADMIN_EMAILS` (comma-separated, case-insensitive) checked server-side in `defineAdminHandler`.
   - *Rejected Alternative:* Pure Firebase Custom Claims (`{ admin: true }`).
   - *Rationale:* Zero runtime overhead; eliminates the need to mint and synchronize custom claims across auth lifecycles; immediate operator revocation without waiting for token claim expiry.

2. **Control DB for `admin_audit_logs`:**
   - *Decision:* Store operator audit logs in the Control DB (`admin_audit_logs`).
   - *Rejected Alternative:* Writing audit logs to individual tenant databases or cloud logging files.
   - *Rationale:* SaaS-level operations (provisioning, transferring users, batch migrations) affect multiple tenants or users outside tenant scope. Control DB is the authoritative store for SaaS metadata.

3. **Native `fetch` with Bearer Authentication for Turso Platform API:**
   - *Decision:* Native `fetch` with Bearer authentication against `https://api.turso.tech/v1/organizations/{org}`.
   - *Rejected Alternative:* Adding external SDK dependencies.
   - *Rationale:* Keeps production serverless bundle lean, matches existing Turso integration in `server/services/provision.ts`, and isolates Turso API errors cleanly.

4. **Sequential Batch Migration Execution Model:**
   - *Decision:* Sequential iteration across tenant databases during fleet migrations.
   - *Rejected Alternative:* High-concurrency `Promise.all` across hundreds of tenant databases.
   - *Rationale:* Prevents edge rate-limiting and connection spike exhaustion on the Turso organization group. Sequential execution enables real-time progress reporting and guarantees isolated failure boundaries.

5. **Local Development Mode Fallback:**
   - *Decision:* Gracefully mock Turso Platform API metrics when `TURSO_API_TOKEN` is unset or points to local SQLite file URLs (`file:local-*.db`).
   - *Rationale:* Ensures developers and automated CI suites can run, test, and preview the Admin Dashboard locally without needing live Turso Cloud credentials.

---

## 4. Implementation notes (Devs)

### Backend Implementation (`backend-dev`)
- **Schema & Control DB (`server/db/schema/control.ts`, `server/db/turso.ts`):**
  - Added `tier: text('tier').notNull().default('free')` to `tenants` table.
  - Added `adminAuditLogs` table (`id`, `operatorEmail`, `actionType`, `targetId`, `summary`, `createdAt`) with indexes on `createdAt` and `operatorEmail`.
  - Updated `initControlDbSchema` in `server/db/turso.ts` to automatically bootstrap `admin_audit_logs` table and migrate existing tenant databases with `ALTER TABLE tenants ADD COLUMN tier...`.
- **Security & Authorization (`server/utils/auth.ts`, `server/utils/handlers.ts`, `server/utils/errors.ts`):**
  - Added `requireAdmin` to enforce authenticated Firebase sessions with email matching against `ADMIN_EMAILS` (case-insensitive, trimmed, comma-separated list).
  - Created `defineAdminHandler` with strict CSRF origin enforcement (`assertRequestAllowed`) and cache disabling headers (`noStore`).
  - Added `forbidden` (HTTP 403) error code across `ApiErrorCode`, `STATUS_MESSAGES`, and `server/utils/errors.ts`.
- **Turso Platform API Client (`server/services/turso-platform.ts`):**
  - Implemented REST client for `https://api.turso.tech/v1/organizations/{org}/...` with `TURSO_API_TOKEN` bearer authentication.
  - Built methods `getTursoOrganizationMetrics`, `createTenantTursoDatabase`, `deleteTenantTursoDatabase`, and `testDatabasePing`.
  - Added seamless local development and outage resilience: falls back to mock fleet metrics when running on local SQLite files (`file:local-*.db`) or when credentials are not configured.
- **Administrative Repositories:**
  - `server/repositories/admin-audit.ts`: `recordAdminAuditLog`, `listAdminAuditLogs`.
  - `server/repositories/admin-tenants.ts`: `listAdminTenants`, `getAdminTenantDetails` (sanitizes secrets, returns `hasToken: boolean`), `updateAdminTenantSettings`, `testTenantDbConnection`, `getAdminFleetMetrics`.
  - `server/repositories/admin-users.ts`: `listFirebaseUsers`, `assignUserToFarm`, `reassignUserFarm` (forces token revocation via `revokeRefreshTokens`), `unlinkUserFromFarm`, `sendUserPasswordReset`.
  - `server/repositories/admin-migrations.ts`: `getFleetMigrationStatus`, `runSingleTenantMigration`, `runBatchMigrations` (sequential with isolated try/catch).
  - `server/repositories/admin-sync.ts`: `getFleetSyncTelemetry`, `getTenantChangeLog`, `getTenantSyncIssues`, `prepareFreshSyncSnapshot`.
- **API Endpoints (18 total under `server/api/admin/**`):**
  - `metrics.get.ts`, `audit-logs.get.ts`
  - `tenants/index.get.ts`, `tenants/[id].get.ts`, `tenants/[id].patch.ts`, `tenants/[id]/test-connection.post.ts`, `tenants/provision.post.ts`
  - `users/index.get.ts`, `users/[uid]/assign.post.ts`, `users/[uid]/reassign.post.ts`, `users/[uid]/unlink.post.ts`, `users/[uid]/reset-password.post.ts`
  - `migrations/index.get.ts`, `migrations/run-all.post.ts`, `migrations/run-single.post.ts`
  - `sync/telemetry.get.ts`, `sync/tenants/[id]/change-log.get.ts`, `sync/tenants/[id]/issues.get.ts`, `sync/tenants/[id]/snapshot.post.ts`

### Frontend Implementation (`frontend-dev`)
- **Route Guard & Client State (`app/middleware/admin.ts`, `app/composables/useAdmin.ts`):**
  - Created `admin` route middleware verifying user session and probing `/api/admin/metrics`. Redirects unauthenticated users to `/sign-in?redirect=/admin` and catches 403 `forbidden` to show `AdminAccessDenied.vue`.
  - Created `useAdmin` composable managing reactive admin state, active tabs, data fetching, mutations, and error toasts.
- **Components & Layouts (`app/pages/admin/index.vue`, `app/components/admin/**`):**
  - `AdminNavShell.vue`: Sticky header with platform branding, operator email pill, environment status indicator, and tab navigation synchronized with `?tab=` query parameter.
  - `AdminOverviewTab.vue`: Infrastructure resource utilization gauges for active databases, storage quota with percentage progress, platform health, and active sync telemetry.
  - `AdminTenantsTab.vue` + `AdminTenantDrawer.vue`: Searchable and filterable tenant fleet with desktop `UTable` and mobile stacked cards. Slideover/sheet drawer displays tenant connection metadata and runs latency pings.
  - `AdminTenantProvisionModal.vue`: 1-click atomic farm provisioning modal with inline validation, duplicate prevention spinner, and completion state with copyable credentials handoff.
  - `AdminUsersTab.vue` + `AdminUserTransferModal.vue`: Auth user roster with verification status, unassigned badges, password reset trigger, and transfer confirmation modal with blast radius warning.
  - `AdminMigrationsTab.vue`: Fleet schema status cards, tenant version table, and batch migration execution dialog.
  - `AdminSyncTelemetryTab.vue` + `AdminSyncInspectorDrawer.vue`: Sync health indicators, known device counts, change log explorer with formatted JSON payload viewer, and fresh snapshot trigger.
  - `AdminAuditLogsTab.vue`: Operator activity trail with timestamp filtering and action type badges.
  - `AdminAccessDenied.vue`: Friendly 403 error card with "Return to Farm Dashboard" button.
- **Mobile Polish:**
  - Verified viewport scaling down to ~375px: touch targets ≥ 44px, bottom sheets replacing slide-overs, full-width modal inputs, and zero horizontal overflow.

---

## 5. QA report (QA)

**Verdict:** PASS

### Acceptance Criteria Verification Matrix

| AC # | Description | Status | Evidence / Verification Notes |
|---|---|:---:|---|
| **AC1** | Admin access enforcement (`ADMIN_EMAILS`) | ✅ PASS | Verified via `server/utils/auth.ts:requireAdmin` and unit tests in `tests/unit/admin-repo.spec.ts`. |
| **AC2** | Unauthenticated access redirection | ✅ PASS | Verified via `app/middleware/admin.ts:16-19` redirecting to `/sign-in?redirect=/admin`. |
| **AC3** | Non-admin access denial (403) | ✅ PASS | Verified in `requireAdmin` throwing 403 `forbidden`; UI renders `AdminAccessDenied.vue`. No tenant data leaked. |
| **AC4** | CSRF & Origin Protection | ✅ PASS | Verified via `defineAdminHandler` invoking `assertRequestAllowed(event)` and verified by `tests/unit/server-guards.spec.ts`. |
| **AC5** | Tenant fleet listing | ✅ PASS | Verified via `server/repositories/admin-tenants.ts:listAdminTenants` and `AdminTenantsTab.vue`. |
| **AC6** | Search and tier filtering | ✅ PASS | Real-time search by name/id and tier filter dropdown implemented and tested in `AdminTenantsTab.vue`. |
| **AC7** | Tenant details drawer | ✅ PASS | Inspector drawer displays metadata, members, and sanitized token status (`hasToken`). |
| **AC8** | Farm settings editing | ✅ PASS | Endpoint `PATCH /api/admin/tenants/:id` updates Control DB and tenant DB `farm_settings`. Logs audit entry. |
| **AC9** | Database connectivity check | ✅ PASS | `POST /api/admin/tenants/:id/test-connection` executes ping query, returning latency or error. |
| **AC10** | Org resource utilization metrics | ✅ PASS | Metric gauges in `AdminOverviewTab.vue` consume `/api/admin/metrics` with storage progress bar. |
| **AC11** | Per-database cloud status & location | ✅ PASS | Surfaced in tenant list and details drawer from Turso Platform API. |
| **AC12** | Local/Dev environment distinction | ✅ PASS | Graceful fallback implemented in `server/services/turso-platform.ts` for `file:local-*.db`. |
| **AC13** | Turso API resilience | ✅ PASS | Outage/rate-limit fallback implemented with non-blocking warning banner in `AdminOverviewTab.vue`. |
| **AC14** | Provisioning modal & validation | ✅ PASS | `AdminTenantProvisionModal.vue` validates farm name, email, tier, and tray size with immediate feedback. |
| **AC15** | Unified provisioning pipeline | ✅ PASS | `POST /api/admin/tenants/provision` orchestrates Firebase user, Turso DB, schema bootstrap, default sizes, and Control DB membership atomically. |
| **AC16** | Idempotency & failure safety | ✅ PASS | Duplicate farm ownership prevented; rollback cleans up Turso DB on bootstrap failures. |
| **AC17** | Provisioning credentials handoff | ✅ PASS | Summary screen shows credentials with "Copy Credentials" button. |
| **AC18** | Duplicate submission prevention | ✅ PASS | Button loading spinner and disabled inputs prevent double-submission. |
| **AC19** | Auth users roster | ✅ PASS | `AdminUsersTab.vue` displays email, UID, verification status, and linked farm. |
| **AC20** | Link unassigned user to farm | ✅ PASS | `POST /api/admin/users/:uid/assign` creates membership record in Control DB. |
| **AC21** | Farm reassignment safety guard | ✅ PASS | `AdminUserTransferModal.vue` requires explicit confirmation; endpoint calls `revokeRefreshTokens(uid)` and records audit log. |
| **AC22** | Unlink user / Revoke farm access | ✅ PASS | Unlinking checks for sole farm owner; password reset trigger calls Firebase Admin Auth. |
| **AC23** | Fleet migration status overview | ✅ PASS | `GET /api/admin/migrations` returns latest system schema version and per-tenant migration status. |
| **AC24** | Batch migration execution | ✅ PASS | `POST /api/admin/migrations/run-all` executes migrations sequentially with progress tracking. |
| **AC25** | Migration failure isolation | ✅ PASS | Failures in `runBatchMigrations` are isolated per tenant; verified by unit test in `tests/unit/admin-repo.spec.ts`. |
| **AC26** | Single-tenant migration test run | ✅ PASS | `POST /api/admin/migrations/run-single` allows running on test/staging tenant. |
| **AC27** | Sync telemetry dashboard | ✅ PASS | `AdminSyncTelemetryTab.vue` displays change log version, known device counts, and sync health badges. |
| **AC28** | Change log viewer & audit drawer | ✅ PASS | `AdminSyncInspectorDrawer.vue` streams recent mutations with formatted expandable JSON viewer. |
| **AC29** | Failed mutation inspector | ✅ PASS | Sync issues sub-tab surfaces rejected mutations with client mutation ID and payload. |
| **AC30** | Farm desync reset / Force re-sync | ✅ PASS | `POST /api/admin/sync/tenants/:id/snapshot` generates clean snapshot for client device recovery. |
| **AC31** | Empty states | ✅ PASS | Clean empty states for zero tenants, zero search results, and zero sync issues. |
| **AC32** | Loading & error states | ✅ PASS | Skeletons displayed during fetch; error banners provide manual retry CTA. |
| **AC33** | Mobile responsiveness (~375px) | ✅ PASS | Desktop tables convert to cards on mobile; drawers open as bottom sheets; tap targets ≥ 44px. |
| **AC34** | Operator action audit log | ✅ PASS | Every admin action writes to `admin_audit_logs` in Control DB; stream visible on "Audit Log" tab. |
| **AC35** | Credential security & data protection | ✅ PASS | Secrets sanitized; `check:build` confirms zero secret leakage into client output bundles. |

### Domain Invariants & Security Review
- **Physical Multi-Tenancy:** Control DB queries are strictly decoupled from tenant databases. Tenant databases are isolated by physical database URL.
- **Tenant ID Integrity:** Normal farm routes continue to derive tenant strictly from authenticated session; admin routes enforce verified `ADMIN_EMAILS` check.
- **Secret Sanitization:** `dbAuthToken` and `TURSO_API_TOKEN` are never returned in client payloads or public configs.

### Automated Test Summary
- **Unit Tests:** `bun run test:unit` → **79 passed / 79 test files (1098 passed / 1098 tests)** in 6.17s.
- **Typecheck:** `bun run typecheck` → **0 errors**.
- **Linter:** `bun run lint` → **0 problems**.
- **Build Security:** `bun run check:build` → **0 secret key materials in .output**.
