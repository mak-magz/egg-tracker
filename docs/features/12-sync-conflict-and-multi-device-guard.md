# Feature: Multi-Device Sign-In Guard & Sync Conflict Management

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)

**User Stories:**
- As a farm owner-operator logging daily egg collection and deliveries across multiple devices (e.g. switching between my barn phone, an office tablet, or a replacement phone), when I sign into an existing Cloud account on a device that already has locally logged records, I want the app to warn me before overwriting my local data and give me the option to download a JSON backup or cancel, so that I never accidentally destroy un-backed-up production, sales, orders, or client data.
- As a farm owner upgrading from Free to Premium, I want registration to guarantee that my initial farm snapshot is successfully backed up to the cloud before upgrading my account tier, so that network drops or server timeouts during migration don't leave me in a half-synced or corrupted state.
- As a farm owner logging barnside while offline, when network reconnection or server validation rejects one or more of my queued changes, I want to see an immediate, clear attention indicator and open a dedicated conflict resolution screen where I can see why the change failed, and choose whether to retry, discard, or download a local backup, so that no eggs or deliveries disappear from my awareness.
- As the SaaS platform operator, I want cloud push rejections to be recorded as structured, non-sensitive telemetry in the `/admin` Sync Inspector, so that when a farmer reports a sync issue, I can quickly inspect why their mutations were rejected without compromising customer privacy.

**Why now / spec reference:**
- Context: Feature 08 implemented offline-first SQLite WASM in browser OPFS, background cloud sync (`POST /api/sync/push`), and self-serve upgrade (`UpgradeModal.vue`).
- Post-implementation audit identified critical integrity and data-safety gaps:
  1. **Destructive Secondary Sign-In**: Signing into an existing cloud account on a browser that had accumulated local Free-tier data currently wipes the local OPFS database via `importFullSnapshot` with zero user confirmation, causing irreversible data loss.
  2. **Unvalidated Upgrade Transitions**: If `POST /api/sync/snapshot` failed during `UpgradeModal` registration, errors could be swallowed, leaving the UI displaying Premium status while the cloud DB had no farm records.
  3. **Silent Outbox Failures**: Rejected mutations in `outbox_mutations` (e.g. concurrent order state conflicts, validation errors) transitioned to `status: 'failed'` locally, but `SyncStatusPill` did not alert the owner, no UI existed to inspect or retry failed outbox items, and the `/admin` Sync Inspector inspected a cloud table that never stored client outbox records.
- Architecture reference: `docs/egg-farm-app-architecture-spec.md` §2.1 (Offline Sync), `docs/egg-farm-app-product-doc.md` §3 (Goals: Trust the numbers; Non-goals: hold v1 scope), and the approved improvement plan (Workstreams B & C).

---

## 2. Acceptance criteria (PM)

### Group A: Secondary-Device Sign-In Guard (Data Loss Prevention)

- [ ] **AC1 — Local Business Data Detection on Sign-In**:
  When an owner signs into an existing Cloud account (via `/login` or `UpgradeModal` login mode), before executing cloud hydration (`importFullSnapshot`), the client must evaluate whether the local device contains any non-empty business data.
  - Non-empty business data is defined as: ≥ 1 production entry, ≥ 1 sale, ≥ 1 order, ≥ 1 client, or ≥ 1 pending outbox mutation.
  - If the local database is pristine (empty of production, sales, orders, clients, and pending outbox mutations), sign-in proceeds directly to cloud snapshot hydration without displaying a confirmation guard.

- [ ] **AC2 — Multi-Device Overwrite Confirmation Guard Modal**:
  If non-empty local business data is detected upon existing-account sign-in, the system must immediately pause cloud hydration and display a blocking confirmation modal (`ConfirmReplaceLocalDialog`).
  - The modal explicitly summarizes the local records at risk in farmer terms without technical jargon or PII (e.g., *"This device has 4 production entries, 6 sales, and 2 pending changes that are not synced to your cloud account"*).
  - The modal presents three distinct actions:
    1. **Download JSON Backup**: Instantly generates and triggers a browser download of the entire local database as a structured JSON backup file. The modal remains open after download so the owner can safely proceed to replace or cancel.
    2. **Replace Local Data with Cloud**: The owner explicitly confirms that the local records on this device should be replaced by their cloud farm account. Upon clicking, the system imports the cloud snapshot, initializes background sync, and shows a success toast: *"Cloud farm loaded successfully"*.
    3. **Cancel**: Immediately aborts cloud hydration, signs the user out cleanly from Firebase Auth, and leaves all local OPFS records untouched. The owner is returned to their local offline workspace.

- [ ] **AC3 — Strict Non-Merge Policy (No Auto-Merge)**:
  Under no circumstances does the system attempt an automatic or semi-automatic merge of local device records into the cloud database upon secondary-device sign-in. Data replacement is all-or-nothing with the mandatory backup guard.

- [ ] **AC4 — Strict Error Handling on Premium Registration (`UpgradeModal`)**:
  When an offline user registers for Premium in `UpgradeModal` (`register` mode), the initial farm snapshot upload (`POST /api/sync/snapshot`) must succeed before the account tier is updated.
  - If `POST /api/sync/snapshot` fails (network failure, HTTP 500, timeout):
    - The farm tier must NOT be flipped to Premium.
    - SyncEngine must NOT be started.
    - An actionable error alert/toast is displayed (*"Could not upload farm data to the cloud. Please verify your connection and try again."*).
    - The modal remains open with a functional "Retry Upload" action.
    - All local OPFS data remains 100% intact and operational in Free/local mode.

### Group B: Sync Conflict & Failed Outbox Management UI

- [ ] **AC5 — SyncStatusPill Failure Attention State**:
  When background sync (`sync_push`) encounters one or more rejected mutations (`status = 'failed'` in local outbox):
  - `SyncStatusPill` transitions to an alert state with an amber/red attention indicator and text displaying the count of failed changes (e.g. *"1 sync issue"* or *"3 sync issues"*).
  - Tapping or clicking `SyncStatusPill` opens an interactive popover displaying:
    - Current connection status (`Offline`, `Connecting`, `Connected` / sync status).
    - Last successful sync timestamp.
    - Pending outbox count.
    - Manual **"Sync Now"** button.
    - When failed mutations exist: A prominent button **"Review Sync Issues (N)"** that opens the Sync Conflicts modal.

- [ ] **AC6 — Non-Blocking Barnside Conflict Banner**:
  When ≥ 1 outbox mutation is in `failed` status, a persistent, non-blocking alert banner is rendered across farm app views:
  - Copy summarizes how many offline changes could not be synced to the cloud, with a **"Review Issues"** button opening `SyncConflictsModal`.
  - The banner must NOT obstruct normal data entry: the owner can continue to log morning egg counts or record sales barnside without disruption.

- [ ] **AC7 — Interactive Sync Conflict Management Modal**:
  Opening the conflict UI displays a dedicated modal (`SyncConflictsModal`) listing all failed outbox mutations in chronological order:
  - Each item displays:
    - Friendly mutation type in farmer terms (e.g., *"Daily Production"*, *"Sale / Delivery"*, *"Order Status"*, *"Client Update"*, *"Egg Size"*).
    - Local timestamp of when the action occurred.
    - Summary of affected non-PII parameters (e.g., date, egg/tray summary, or entity ref).
    - Server rejection reason in plain language.
    - Strict privacy rule: Customer names, phone numbers, and personal notes are never exposed in logs, URLs, or telemetry.

- [ ] **AC8 — Outbox Conflict Actions (Retry, Discard, Backup)**:
  Within `SyncConflictsModal`, the owner can perform the following actions:
  - **Retry**: Re-queues the failed mutation as `status = 'pending'`, clearing its previous error and triggering an immediate push attempt.
  - **Discard**: Prompts the owner with a confirmation guard (*"Discard this unsynced change? It will be permanently removed from this device."*). On confirmation, removes the mutation from `outbox_mutations` and reconciles local state to cloud truth.
  - **Retry All**: When multiple failed mutations exist, a button to re-queue all failed items at once.
  - **Download Local Backup**: A button inside the modal allowing the owner to export a JSON backup of their current local state before discarding any records.

- [ ] **AC9 — Immediate Rebalancing of Derived Inventory & Orders**:
  When a failed mutation is discarded:
  - Local optimistic state impacted by the discarded mutation is reconciled back to authoritative cloud state (and any active inventory cards, orders, production views, and dashboard figures refresh immediately without requiring a manual page reload).

- [ ] **AC10 — Empty & Resolved States**:
  - When all failed items are resolved (either retried and successfully pushed, or discarded), `SyncConflictsModal` displays a clean state (*"All sync issues resolved! Your device is up to date."*) with a **"Done"** button.
  - `SyncStatusPill` returns to the standard synced state, and the top alert banner automatically dismisses.

### Group C: Server Telemetry & Admin Sync Observability

- [ ] **AC11 — Server-Side Rejection Telemetry Recording (`sync_rejections`)**:
  When `POST /api/sync/push` rejects an offline mutation, the server must write a record to the tenant's `sync_rejections` table with:
  - Client mutation ID, device ID, mutation type, occurred timestamp, rejected timestamp, error code, and error message.
  - Entity reference must be non-PII (e.g. `order_id`, `sale_id`, or `produced_on` date). Client phone numbers, client names, and customer notes must NEVER be stored in `sync_rejections`.

- [ ] **AC12 — Admin Dashboard Sync Inspector Observability**:
  In `/admin` under the Sync Telemetry tab / Sync Inspector Drawer:
  - The operator can view the real-time count of rejected mutations for each tenant farm.
  - The operator can inspect recent rejection entries with mutation type, device ID, rejection reason, and timestamp to assist farm owners during support inquiries.

### Group D: Mobile Form-Factor Responsiveness

- [ ] **AC13 — Mobile Viewport Usability (~375px)**:
  - `ConfirmReplaceLocalDialog`, `SyncStatusPill` popover, and `SyncConflictsModal` must fit cleanly on standard 375px mobile screens.
  - On mobile, dialogs use touch-friendly layout / `sheetUi` bottom sheets consistent with existing app modals.
  - All action buttons (Download JSON Backup, Replace Local Data, Cancel, Retry, Discard) must have tap targets ≥ 44px with clear visual feedback.
  - No horizontal scrolling on any dialog, table, or sheet.

---

### Scope & Non-Goals

**Out of scope:**
- Automatic three-way merging or semantic reconciliation between divergent local and cloud databases on secondary-device sign-in (explicitly rejected: all-or-nothing replace with backup).
- Farm Profile settings form in `app/pages/farm/settings.vue` (explicitly deferred by user decision).
- Multi-user role management or team-level conflict permissions (single owner-operator per tenant in v1).
- Direct peer-to-peer device sync over local Wi-Fi or Bluetooth.

**Open questions for owner:**
- None.

---

## 2.5 UX design (UX Designer)

### Guiding Principles & Barnside Context
1. **Zero Silent Data Loss (Strict Non-Merge)**: Overwriting local device data upon secondary sign-in is irreversible. When local farm records exist, cloud hydration is paused, providing 3 unambiguous options: Download JSON Backup, Replace Local Data with Cloud, or Cancel. There is intentionally **no auto-merge** button.
2. **Non-Blocking Conflict Visibility**: A rejected sync mutation in the barn must never halt morning egg collection or sales recording. Failed outbox mutations are signaled via an attention indicator on `SyncStatusPill` and a compact, dismissible top banner that never covers form inputs, bottom tabs, or the mobile FAB.
3. **Farmer-Friendly Conflict Inspection**: Mutation errors are translated into plain farm terms ("Daily Production", "Sale / Delivery", "Order Status") with non-PII record summaries (trays, sizes, sale/order numbers, or dates). Server errors are mapped to plain explanations ("Order was updated on another device" rather than raw HTTP codes).
4. **Touch & Sunlight Ergonomics**: All actionable buttons and dismiss targets adhere to ≥44px touch boundaries (`min-h-11`). Modals use the established `sheetUi` responsive system: bottom sheets on mobile (~375px) with bottom safe-area insets, and centered modals on desktop (≥768px).

---

### Primary Flows & Tap Counts

#### Flow S1: Secondary-Device Sign-In Overwrite Guard (`ConfirmReplaceLocalDialog`)
**Entry Point:** Owner signs in with an existing Cloud account via `/login` or `UpgradeModal` (login mode).
1. Owner submits credentials (Email + Password).
2. The client checks local OPFS storage before pulling cloud data:
   - **Pristine Device** (0 production rows, 0 sales, 0 orders, 0 clients, 0 outbox mutations): Skips guard dialog. Cloud snapshot hydrates immediately. Toast: *"Cloud farm loaded successfully"*. Main-path tap count: **0 extra taps**.
   - **Non-Pristine Device** (≥1 production entry, sale, order, client, or outbox mutation): Cloud snapshot hydration pauses. `ConfirmReplaceLocalDialog` opens.
3. Owner reviews the summary of local records at risk (e.g. *"4 production entries · 6 sales · 1 client · 2 unsynced changes"*).
4. Options:
   - **Path A (Safe Replace - Recommended)**: Tap **"Download Backup (JSON)"** (1) → local backup downloads instantly → button updates to *"Backup downloaded"* → Tap **"Replace Local Data with Cloud"** (2) → dialog shows loading spinner → cloud snapshot imported → sync starts → toast: *"Cloud farm loaded successfully"*. (**2 taps**).
   - **Path B (Direct Replace)**: Tap **"Replace Local Data with Cloud"** (1) → cloud snapshot imported → toast: *"Cloud farm loaded successfully"*. (**1 tap**).
   - **Path C (Cancel & Preserve Local)**: Tap **"Cancel and keep local data"** (1) → Firebase Auth signs out cleanly → dialog closes → user returned to local offline workspace intact. (**1 tap**).

#### Flow S2: Upgrade Modal Registration Failure & Safe Retry (`UpgradeModal`)
**Entry Point:** Offline user registers for Premium in `UpgradeModal` (`register` mode).
1. Owner fills Farm Name, Email, Password and taps **"Create & Sync"**.
2. If `POST /api/sync/snapshot` fails (network drop, 500 error):
   - Tier is **NOT** flipped to Premium (remains Free Offline).
   - Sync engine is **NOT** started.
   - An inline `UAlert` displays: *"Could not upload farm data to the cloud. Please verify your connection and try again."*
   - Primary submit button transforms to **"Retry Upload"** (`UButton` loading state supported).
   - Local OPFS database remains 100% operational in Free mode.
3. Owner taps **"Retry Upload"** (1 tap). If network restored, snapshot completes, tier flips to Premium, and modal closes with toast: *"Upgraded to Cloud Sync"*.

#### Flow C1: Review & Retry Sync Conflicts from Top Alert Banner (Main Path)
**Entry Point:** Background sync failed one or more mutations (`failedCount > 0`). Top banner appears across farm screens.
1. Owner notices persistent, non-blocking top banner: *"2 offline changes couldn't be synced to the cloud."*
2. Tap **"Review Issues"** in banner (1 tap) → `SyncConflictsModal` opens showing failed mutation cards.
3. Tap **"Retry All"** in modal header (2 taps) → all failed mutations re-queue as pending and immediate push triggers.
4. If sync succeeds, modal smoothly transitions to resolved state (*"All sync issues resolved! Your device is up to date."*). Tap **"Done"** (3 taps) → modal closes, top banner dismissed, `SyncStatusPill` shows *"Cloud synced"*.
- **Main-path tap count:** **2 taps** to retry all; **3 taps** to finish.

#### Flow C2: Review & Discard Conflicted Mutation with Confirmation Guard
**Entry Point:** Owner in `SyncConflictsModal` decides an outdated change should not overwrite cloud truth.
1. Owner identifies the conflicted item card (e.g., *"Order Status · Marked Fulfilled"* rejected because order was cancelled on another device).
2. Tap **"Discard"** on that item card (1 tap) → `ConfirmDiscardConflictDialog` (or inline confirm guard) opens.
3. Guard reads: *"Discard unsynced change? This change will be permanently deleted from this device and your local numbers will match the cloud. This cannot be undone."*
4. Tap **"Discard change"** (2 taps) → mutation removed from outbox, local optimistic state reconciles with cloud database. Active inventory, orders, and sales views update immediately without page reload (AC9).
- **Tap count:** **2 taps** to safely discard.

#### Flow C3: Interactive Sync Status Popover (`SyncStatusPill`)
**Entry Point:** Tapping `SyncStatusPill` in top bar (mobile/desktop) or sidebar rail.
1. Tap `SyncStatusPill` (1 tap) → popover menu opens below/beside pill.
2. View connection state, last sync timestamp, and pending mutation count.
3. Actions:
   - Tap **"Sync Now"** (2 taps) to force an immediate push/pull cycle.
   - If `failedCount > 0`, tap **"Review Sync Issues (N)"** (2 taps) → opens `SyncConflictsModal`.

#### Flow N1: Account Menu Navigation Polish (`AppAccountMenu`)
**Entry Point:** Tapping account avatar or sidebar footer.
1. Open account menu → tap **"Settings"** (`to: '/farm/settings'`).
2. Directly opens `/farm/settings` (Sizes, Data & Backup export/import, Cloud Upgrade).
*(Note: Farm Profile editing is explicitly deferred/excluded from v1 per PM scope).*

---

### Layouts & ASCII Wireframes

#### 1. Secondary-Device Sign-in Guard (`ConfirmReplaceLocalDialog`)

```
===================================================================
MOBILE BOTTOM SHEET (~375px) - ConfirmReplaceLocalDialog
Nuxt UI: UModal (:ui="sheetUi(480)")
===================================================================
| [─ Drag Handle / Sheet Header ─────────────────────────────────] |
|                                                                 |
| ( /!\ ) Replace local farm data?                                |
|                                                                 |
| This device has local records that haven't been synced to the   |
| cloud:                                                          |
|                                                                 |
| +─────────────────────────────────────────────────────────────+ |
| | [4 production entries] [6 sales] [1 client] [2 unsynced]    | |
| +─────────────────────────────────────────────────────────────+ |
|                                                                 |
| Replacing local data with your cloud account will overwrite     |
| these records. This cannot be undone.                           |
|                                                                 |
| +-------------------------------------------------------------+ |
| | [v] Download Backup (JSON)               (min-h-11, outline)| |
| +-------------------------------------------------------------+ |
| | [/!\] Replace Local Data with Cloud        (min-h-11, error)| |
| +-------------------------------------------------------------+ |
| | Cancel and keep local data                (min-h-11, subtle)| |
| +-------------------------------------------------------------+ |
|                                   [env(safe-area-inset-bottom)] |
===================================================================

===================================================================
DESKTOP MODAL (≥768px, max-w-[480px]) - ConfirmReplaceLocalDialog
Nuxt UI: UModal (:ui="sheetUi(480)")
===================================================================
+-----------------------------------------------------------------+
| Replace local farm data?                                    [X] |
+-----------------------------------------------------------------+
| An existing cloud farm account was found for this user.         |
| However, this device currently contains local records that are  |
| not backed up to the cloud:                                     |
|                                                                 |
|  * 4 production entries                                         |
|  * 6 completed sales                                            |
|  * 1 customer contact                                           |
|  * 2 pending offline changes                                    |
|                                                                 |
| Overwrite warning:                                              |
| Loading your cloud account will replace the local records on    |
| this browser. To keep a permanent copy, download a backup first.|
+-----------------------------------------------------------------+
| [v Download Backup (JSON)]      [Cancel]  [Replace Local Data]  |
+-----------------------------------------------------------------+
```

#### 2. `SyncStatusPill` & Interactive Popover

```
===================================================================
TOP BAR PILL & EXPANDED POPOVER
Nuxt UI: UBadge + UPopover
===================================================================
Top Bar (Mobile & Desktop):
+-----------------------------------------------------------------+
| [=] Tamago · Sunrise Farm       [ (!) 2 sync issues ]  [Avatar] |
+-----------------------------------------------------------------+
                                           |
                                           v (Tap opens UPopover)
+-----------------------------------------------------------------+
| CLOUD SYNC STATUS                                           [X] |
+-----------------------------------------------------------------+
| Connection:    (o) Connected to cloud                           |
| Last Synced:   Today at 10:14 AM                                |
| Pending Queue: 0 changes waiting                                |
+-----------------------------------------------------------------+
| [!] 2 changes could not be synced to the cloud.                 |
|                                                                 |
| [  Review Sync Issues (2)  ]        (UButton color="error" full)|
+-----------------------------------------------------------------+
| [ Sync Now ]                        (UButton variant="outline") |
+-----------------------------------------------------------------+
```

#### 3. Non-Blocking Conflict Banner in App Shell (`default.vue`)

```
===================================================================
APP SHELL CONTENT AREA (Mobile ~375px & Desktop)
Nuxt UI: UAlert in layout slot (under navbar, above page content)
===================================================================
| [Tamago Navbar]                                                 |
+-----------------------------------------------------------------+
| /!\  2 offline changes couldn't be synced to cloud.             |
|      Your local records remain safe on this phone.              |
|                                                                 |
|      [ Review Issues ]  (min-h-11 on mobile)                [X] |
+-----------------------------------------------------------------+
|                                                                 |
| [Dashboard / Production / Sales Page Content Continues Uncut]   |
|                                                                 |
```

#### 4. Sync Conflict Management Modal (`SyncConflictsModal`)

```
===================================================================
MOBILE BOTTOM SHEET (~375px) - SyncConflictsModal
Nuxt UI: UModal (:ui="sheetUi(520)")
===================================================================
| [─ Drag Handle ───────────────────────────────────────────────] |
| Sync Issues (2)                                             [X] |
| Unsynced offline changes that need review before uploading.     |
|                                                                 |
| [v Backup JSON]                                     [Retry All] |
+-----------------------------------------------------------------+
| [CARD 1: Daily Production]                     Today, 6:30 AM   |
| --------------------------------------------------------------- |
| 18 trays Large, 6 trays Medium, 4 loose rejects                 |
|                                                                 |
| Server reason:                                                  |
| Production could not be saved due to a validation conflict.     |
|                                                                 |
| [ Retry ]                              [ Discard (red text) ]   |
+-----------------------------------------------------------------+
| [CARD 2: Order Status]                     Yesterday, 4:15 PM   |
| --------------------------------------------------------------- |
| Order #1018 · Status changed to Fulfilled                       |
|                                                                 |
| Server reason:                                                  |
| Order #1018 was cancelled on another device.                    |
|                                                                 |
| [ Retry ]                              [ Discard (red text) ]   |
+-----------------------------------------------------------------+
|                                   [env(safe-area-inset-bottom)] |
===================================================================

===================================================================
RESOLVED EMPTY STATE - SyncConflictsModal
Nuxt UI: Clean state when all items retried or discarded
===================================================================
| [─ Drag Handle ───────────────────────────────────────────────] |
|                                                                 |
|                     (  *✓*  )  [green circle icon]              |
|                                                                 |
|                 All sync issues resolved!                       |
|          Your device is up to date with your cloud farm.        |
|                                                                 |
| +-------------------------------------------------------------+ |
| | [ Done ]                         (UButton color="primary")  | |
| +-------------------------------------------------------------+ |
|                                   [env(safe-area-inset-bottom)] |
===================================================================
```

#### 5. Discard Confirmation Guard & Upgrade Retry State

- **Discard Confirmation**: *"Discard unsynced change? This change will be permanently deleted from this device and your local numbers will match the cloud. This cannot be undone."* Actions: `[Keep change]`, `[Discard change]`.
- **Upgrade Modal Snapshot Upload Failure**: Keeps user on Free mode (`Register` tab remains open), renders inline `UAlert` (*"Could not upload farm data to the cloud. Please check your internet connection and try again. Your local records remain safe on this device."*), switches submit CTA to `[Retry Upload]`.

---

### Nuxt UI v4 Component Mapping

| Design Element | Nuxt UI v4 Component | Key Props & Classes |
|---|---|---|
| Overwrite Guard Modal | `UModal` | `:ui="sheetUi(480)"`, `:dismissible="!loading"` |
| Conflict Modal | `UModal` | `:ui="sheetUi(520)"` |
| Discard Guard Dialog | `UModal` | `:ui="sheetUi(420)"` |
| Sync Pill | `UBadge` / trigger button | `size="sm"`, dynamic `color` (`neutral`, `primary`, `success`, `warning`, `error`), `variant="subtle"` |
| Sync Status Popover | `UPopover` | `w-72` content panel |
| Top Alert Banner | `UAlert` | `color="warning"`, `variant="subtle"`, icon `i-lucide-alert-triangle` |
| Backup Download Action | `UButton` | `variant="outline"`, icon `i-lucide-download`, `min-h-11` |
| Destructive Action Button | `UButton` | `color="error"`, `variant="solid"`, `min-h-11` |
| Entity Badges | `UBadge` | `size="xs"`, `variant="subtle"` |

---

### Status Indicators & Matrix

| State | Pill Color | Pill Icon | Pill Label (Desktop) | Pill Label (Mobile) | Banner Shown? |
|---|---|---|---|---|---|
| `local_only` | `neutral` | `i-lucide-hard-drive` | Local storage | *(icon only)* | No |
| `syncing` | `primary` | `i-lucide-refresh-cw animate-spin` | Syncing... | *(spinner)* | No |
| `synced` | `success` | `i-lucide-cloud` | Cloud synced | *(cloud icon)* | No |
| `offline` | `neutral` | `i-lucide-wifi-off` | Offline | *(wifi-off icon)* | No |
| `offline_changes` | `warning` | `i-lucide-cloud-off` | {N} saved offline | {N} | No |
| `error` (0 failed outbox) | `error` | `i-lucide-alert-triangle` | Sync error | *(alert icon)* | No |
| `error` (≥1 failed outbox) | `error` | `i-lucide-alert-triangle` | {N} sync issue(s) | {N} (red badge) | **Yes (Inline Top)** |

---

### Copy Specifications (Farmer Terms)

- **Overwrite Guard Dialog:** *"Replace local farm data?"* / `[Download Backup (JSON)]`, `[Replace Local Data with Cloud]`, `[Cancel and keep local data]` / Toasts: *"Backup saved: ..."*, *"Cloud farm loaded successfully"*.
- **Top Barnside Alert Banner:** *"1 offline change couldn't be synced to the cloud..."* / *"{N} offline changes couldn't be synced to the cloud..."* / `[Review Issues]`.
- **Sync Conflicts Modal:** *"Sync Issues ({N})"* / `[Download Local Backup]`, `[Retry All]`, `[Retry]`, `[Discard]` / Resolved: *"All sync issues resolved! Your device is up to date with your cloud farm."* + `[Done]`.
- **Friendly Entity Labels (Non-PII):** Production (*"Daily Production"*), Sale/Delivery (*"Sale / Delivery"*), Order (*"Order Update"*), Client (*"Customer Update"*, customer names & phones strictly omitted), Size (*"Egg Size Setting"*).

---

### Data Requirements for Architect (§3)
1. `GET_LOCAL_DATA_SUMMARY` RPC returning non-empty business counts (`production`, `sales`, `orders`, `clients`, `pendingOutbox`).
2. `GET_FAILED_MUTATIONS`, `RETRY_FAILED_MUTATION`, `RETRY_ALL_FAILED_MUTATIONS`, `DISCARD_FAILED_MUTATION` RPCs plus cloud reconciliation on discard (AC9).
3. `failedOutboxCount` & `lastRemoteUpdateAt` exposed via `SyncEngine` / `useSync()`.
4. `sync_rejections` non-PII server telemetry table surfaced in `/admin` Sync Inspector.

## 3. Technical design (Architect)

### 3.1 Data & Schema (`core/db/schema.ts`, `PRAGMA user_version`, `core/utils/sync-payload.ts`)

#### Tenant DB Drizzle Schema (`core/db/schema.ts`, re-exported by `server/db/schema/tenant.ts`)
1. **New table `syncRejections` (`sync_rejections`):**
   ```ts
   export const syncRejections = sqliteTable('sync_rejections', {
     id: text('id').primaryKey(),
     mutationId: text('mutation_id').notNull(),
     deviceId: text('device_id').notNull(),
     mutationType: text('mutation_type').notNull(),
     entityRef: text('entity_ref').notNull(), // Non-PII ref only: e.g. 'order:<uuid>', 'sale:<uuid>', 'day:YYYY-MM-DD', 'size:<uuid>', 'client:<uuid>', 'farm:default'
     errorCode: text('error_code').notNull(), // e.g. 'conflict' | 'not_found' | 'validation_failed' | 'internal'
     reason: text('reason'), // Structured conflict reason, e.g. 'version_mismatch' | 'insufficient_stock' | 'already_voided' | 'duplicate_name'
     errorMessage: text('error_message').notNull(), // Strictly sanitized non-PII message; never includes client name, phone, or notes
     occurredAt: text('occurred_at').notNull(), // Mutation client timestamp (ISO)
     rejectedAt: text('rejected_at').notNull(), // Server rejection timestamp (ISO)
     resolvedAt: text('resolved_at'), // Nullable ISO timestamp; populated when retried mutation succeeds or resolved
   }, table => [
     index('sync_rejections_unresolved_idx').on(table.resolvedAt, table.rejectedAt),
     index('sync_rejections_mutation_idx').on(table.mutationId),
   ])
   ```
2. **Update `syncState` (`sync_state`):**
   Add `needsReconcile: integer('needs_reconcile', { mode: 'boolean' }).notNull().default(false)` (`needs_reconcile INTEGER NOT NULL DEFAULT 0`). Tracks when a user discards a failed mutation while offline so the next online sync runs snapshot reconciliation cleanly.
3. **Update `outboxMutations` (`outbox_mutations`) index:**
   Add `index('outbox_mutations_status_seq_idx').on(table.status, table.seq)` to keep pending/failed outbox scans fast in OPFS.
4. **Drizzle migration generation:**
   Run `bun run db:generate:tenant -- --name add_sync_rejections_and_reconcile_flag` (output in `server/db/migrations/tenant/`).

#### Versioned Migrations (`PRAGMA user_version = 3`)
Both Turso tenant databases (`server/db/turso.ts` + `server/repositories/admin-migrations.ts`) and browser OPFS SQLite (`app/local/worker.ts`) move from ad-hoc DDL checks to explicit `PRAGMA user_version` migrations using `TENANT_SCHEMA_USER_VERSION = 3` (surfaced in `/admin` as `SYSTEM_SCHEMA_VERSION = 'v3'`):

- **Shared Turso migration runner `migrateTenantDatabase(client)` in `server/db/turso.ts`:**
  Reads `PRAGMA user_version` (`currentVersion`), executes only pending steps idempotently, and advances `PRAGMA user_version`:
  - **`v0 -> v1` (Baseline Core DDL):** `CREATE TABLE IF NOT EXISTS ...` for baseline tables + all baseline unique/lookup indexes.
  - **`v1 -> v2` (Backfill Legacy Unversioned Columns):** Check `PRAGMA table_info(...)` before altering so pre-existing databases stay idempotent (`sizes.default_price NUMERIC`, `farm_settings.tier TEXT NOT NULL DEFAULT 'free'`).
  - **`v2 -> v3` (Feature 12 Schema):**
    - `CREATE TABLE IF NOT EXISTS sync_rejections (...)` + `sync_rejections_unresolved_idx` + `sync_rejections_mutation_idx`.
    - Add `sync_state.needs_reconcile INTEGER NOT NULL DEFAULT 0` if missing via `PRAGMA table_info(sync_state)`.
    - `CREATE INDEX IF NOT EXISTS outbox_mutations_status_seq_idx ON outbox_mutations(status, seq)`.
  - Set `PRAGMA user_version = 3`.
- **OPFS Worker migration runner `migrateLocalSchema(db)` in `app/local/worker.ts`:**
  Mirrors the exact `v0 -> v1 -> v2 -> v3` steps against OPFS SQLite on startup and sets `PRAGMA user_version = 3`.

#### Snapshot & Payload Contracts (`core/utils/sync-payload.ts`, `shared/types/api.ts`)
- **`FarmSnapshotPayload` (`core/utils/sync-payload.ts`):**
  Extend `sizes` item shape with `defaultPrice: number | null` (optional on input for backward compatibility with older backup JSONs, normalized to `number | null` in `normalizeFarmSnapshot`).
- **Shared Sync & Guard Types (`shared/types/api.ts`):**
  - `LocalDataSummary`: `{ hasData: boolean; productionDays: number; clients: number; orders: number; sales: number; customSizesCount: number; pendingOutboxCount: number; failedOutboxCount: number; farmName: string | null }`
    (`hasData` is `true` iff `productionDays > 0 || clients > 0 || orders > 0 || sales > 0 || pendingOutboxCount > 0 || failedOutboxCount > 0 || customSizesCount > 0`; a fresh browser with only default seeded `farm_settings` and 4 seeded sizes has `hasData: false`.)
  - `FailedOutboxMutation`: `{ id: string; seq: number; type: string; entityLabel: string; detailLabel: string; errorCode: string; errorMessage: string; createdAt: string }`
  - `DiscardMutationResult`: `{ discarded: boolean; remainingPendingCount: number; remainingFailedCount: number; needsReconcile: boolean }`
  - `AdminSyncIssueItem` / `AdminSyncTelemetryItem`: extend `AdminSyncTelemetryItem` with `unresolvedRejectionCount: number` and `AdminSyncIssueItem` with `mutationType: string`, `entityRef: string`, `errorCode: string`, `reason: string | null`, `rejectedAt: string`, `resolvedAt: string | null` (retaining `id`, `mutationId`, `deviceId`, `error`, `occurredAt`, `payload` with strictly sanitized non-PII summary).

---

### 3.2 Tenancy, Isolation, Privacy & Security Hardening

1. **Database-per-tenant + `TenantDb` scoping:**
   `sync_rejections` lives inside each farm's isolated Turso database (never in Control DB). All tenant queries continue through `defineTenantHandler` -> `requireTenant(event)` -> `createTenantDb(tenant)`.
2. **Strict PII Protection (`GEMINI.md`):**
   - **Never store client names, phone numbers, or notes in `sync_rejections` or server logs.**
   - `sanitizeSyncRejection(mutation, err)` in `server/db/adapter.ts` derives non-PII `entityRef` (`order:<id>`, `sale:<id>`, `day:<YYYY-MM-DD>`, `size:<id>`, `client:<id>`, `farm:default`) and maps `err` to safe static `errorCode`, `reason`, and `errorMessage`.
   - `server/repositories/admin-sync.ts`: `getTenantSyncIssues()` reads `sync_rejections WHERE resolved_at IS NULL` and `getTenantChangeLog()` redacts PII keys (`name`, `phone`, `notes`, `clientName`, `clientPhone`) to `'[redacted]'`.
3. **`server/api/admin/login.post.ts`:**
   Remove `adminEmails` array from `console.warn`; log only `adminEmails.length`.
4. **`server/utils/auth.ts` (`verifyBearerTokenWithFallback`):**
   Use `auth.verifyIdToken(token, false)` under Firebase Auth emulator; otherwise call `auth.verifyIdToken(token, true)` and only fall back to `checkRevoked = false` on `auth/internal-error` or `app/network-error` (logging error code only). Expired/revoked/malformed tokens fail closed with `401`.
5. **Content Security Policy (`nuxt.config.ts`):**
   Harden CSP with explicit `default-src 'self'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`, `worker-src 'self' blob:`, `child-src 'self' blob:`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' data: https://fonts.gstatic.com`, `img-src 'self' data: blob:`, and `connect-src` for Firebase Auth (+ dev emulator/WS in non-production).

---

### 3.3 Server API, Control/Tenant Consistency & Performance

1. **Canonical `change_log` Writes in `sync_push` (`server/db/adapter.ts`):**
   Write canonical domain `entityType`, real domain `entityId`, `action` (`delete` for `delete_production_day`, else `upsert`), and canonical post-RPC `payload` with `{ op: m.type, ... }` across all 22 operations (`update_farm_settings`, `add_size`, `rename_size`, `archive_size`, `restore_size`, `reorder_sizes`, `log_production`, `replace_production_day`, `delete_production_day`, `add_client`, `update_client`, `archive_client`, `restore_client`, `create_sale`, `update_sale`, `void_sale` returning `{ sale, order }`, `create_order`, `update_order`, `set_order_status`, `cancel_order`, `close_order`, `deliver_order` returning `{ order, sale }`).
   - On rejection in `sync_push`, insert sanitized `sync_rejections` row; on applied retry with matching `mutation_id`, set `resolved_at`.
2. **Snapshot Export/Import Integrity (`server/db/adapter.ts`, `server/api/sync/snapshot.post.ts`):**
   Include `defaultPrice` on `sizes` in `sync_export_snapshot`, `snapshot.post.ts`, and `sync_snapshot`; clear provisioned defaults when empty or reassign `color_slot` safely on conflict.
3. **Control DB / Tenant DB Metadata Consistency (`server/repositories/memberships.ts`, `server/repositories/tenants.ts`, `server/repositories/sync.ts`):**
   Keep `server/db/adapter.ts` isomorphic; add `syncControlTenantMetadata()` in `server/repositories/tenants.ts` called from `updateFarmSettings()`, `applyFarmSnapshot()`, and `applySyncPush()` (`update_farm_settings`). Add `default_price` to `findMembershipWithFarm()` sizes select.
4. **N+1 Query Batching (`server/db/adapter.ts`):**
   Batch child queries (`clients`, `order_lines`, `sales`, `sale_lines`) in `list_orders`, `buildOrderJson`, and `get_inventory`.
5. **Connection Pooling & Bounded Concurrency (`server/db/turso.ts`, `server/utils/concurrency.ts`, `server/repositories/admin-sync.ts`, `server/repositories/admin-migrations.ts`):**
   Export `getTenantLibsqlClient()`, implement `mapWithConcurrency(..., 5)`, query `sync_rejections` in `admin-sync.ts`, and set `SYSTEM_SCHEMA_VERSION = 'v3'` using `migrateTenantDatabase()` in `admin-migrations.ts`.

---

### 3.4 Frontend, Worker & Sync Engine Architecture

1. **Worker (`app/local/worker.ts`), Client (`app/local/client.ts`) & Export (`app/local/export.ts`):**
   Run `migrateLocalSchema(db)` (`PRAGMA user_version = 3`); fix `PUT /api/farm` tier read; parameterize `importFullSnapshot(..., { preserveOutbox, tier })` (`export.ts` passes `'free'`); add `GET_LOCAL_DATA_SUMMARY`, updated `GET_SYNC_STATUS` (`failedOutboxCount`, `needsReconcile`), `GET_FAILED_MUTATIONS`, `RETRY_FAILED_MUTATION`, `RETRY_ALL_FAILED_MUTATIONS`, `DISCARD_FAILED_MUTATION`, `RECONCILE_FROM_SNAPSHOT`.
2. **Complete `APPLY_REMOTE_CHANGES` & `SyncEngine` (`app/local/worker.ts`, `app/local/sync.ts`, `app/composables/useSync.ts`):**
   Support all 22 `op` handlers; always advance `lastPulledVersion` when `latestVersion > lastPulledVersion`; track `failedCount` and `lastRemoteUpdateAt`; reconcile via `RECONCILE_FROM_SNAPSHOT` on discard (online immediately, offline deferred via `needs_reconcile` until next online sync).
3. **Multi-Device Overwrite Guard & Upgrade Safety (`useLocalReplaceGuard.ts`, `ConfirmReplaceLocalDialog.vue`, `app/app.vue`, `useAuthActions.ts`, `UpgradeModal.vue`):**
   Mount `<ConfirmReplaceLocalDialog />` inside `<UApp>` in `app/app.vue`. Guard both `useAuthActions.signIn` and `UpgradeModal` login mode with `getLocalDataSummary()`. Block `UpgradeModal` `upgradeToPremium()` on `POST /api/sync/snapshot` failure with inline retry.
4. **Conflict UI & Nav (`SyncConflictsModal.vue`, `SyncStatusPill.vue`, `default.vue`, `AppAccountMenu.vue`):**
   Interactive `SyncStatusPill` `UPopover` + inline top `UAlert` banner in `default.vue` + `<SyncConflictsModal />` + `/farm/settings` link in `AppAccountMenu.vue` (Farm Profile UI remains excluded).
5. **Reactive Refresh & Admin UI (`useProductionDays`, `useInventory`, `useOrders`, `useSales`, `useClients`, `useFarm`, `farm/index.vue`, `useAdmin`, `AdminSyncTelemetryTab`, `AdminSyncInspectorDrawer`).**

---

### 3.5 Ordered Tasks & Strict File Ownership

#### Phase 1 — Shared Contracts (`[BE-1]`, Prerequisite)
- [x] **[BE-1]** `core/db/schema.ts`, `core/utils/sync-payload.ts`, `shared/types/api.ts`, `server/db/migrations/tenant/*`

#### Phase 2A — Backend (`backend-dev`, after `[BE-1]`)
- [x] **[BE-2]** `server/db/turso.ts`, `server/utils/concurrency.ts`, `server/repositories/admin-migrations.ts`
- [x] **[BE-3]** `server/db/adapter.ts`, `server/api/sync/snapshot.post.ts`
- [x] **[BE-4]** `server/repositories/memberships.ts`, `server/repositories/tenants.ts`, `server/repositories/sync.ts`, `server/repositories/admin-sync.ts`
- [x] **[BE-5]** `nuxt.config.ts`, `server/api/admin/login.post.ts`, `server/utils/auth.ts`, backend unit tests

#### Phase 2B — Frontend & Worker (`frontend-dev`, parallel after `[BE-1]`)
- [x] **[FE-1]..[FE-6]** `app/local/*`, `app/composables/*`, `app/components/*`, `app/layouts/default.vue`, `app/app.vue`, `app/pages/farm/index.vue`, frontend unit tests

---

### 3.6 Architectural Decisions & Trade-offs
1. **Deterministic `RECONCILE_FROM_SNAPSHOT` on Discard** over inverse rollback deltas (guarantees local OPFS matches Turso).
2. **Canonical Post-RPC `change_log` `{ op, ... }` payloads** over raw request deltas (preserves `saleNumber`/`orderNumber`/`lineTotal`/linked order state & idempotency).
3. **Isomorphic `server/db/adapter.ts`** (`syncControlTenantMetadata()` kept in `server/repositories/*` so client worker bundle never pulls server DB modules).
4. **Global `ConfirmReplaceLocalDialog` in `app/app.vue`** shared across `/login` and `UpgradeModal`.
5. **Strict No Auto-Merge** on secondary sign-in.
6. **Farm Profile UI in `settings.vue` explicitly deferred**.

## 4. Implementation notes (Devs)
- **[BE-1]**: Added `syncRejections` table, `syncState.needsReconcile`, and `outboxMutations` indexes in `core/db/schema.ts`; extended `FarmSnapshotPayload` + `normalizeFarmSnapshot` in `core/utils/sync-payload.ts` with `size.defaultPrice`; exported Feature 12 + Admin types in `shared/types/api.ts`; generated `server/db/migrations/tenant/0000_add_sync_rejections_and_reconcile_flag.sql`.
- **[BE-2..5]**: Implemented `mapWithConcurrency` (`server/utils/concurrency.ts`), pooled `getTenantLibsqlClient` + `migrateTenantDatabase` (`PRAGMA user_version = 3`) in `server/db/turso.ts`, and `SYSTEM_SCHEMA_VERSION = 'v3'` in `server/repositories/admin-migrations.ts`. Updated `server/db/adapter.ts` with N+1 batching (`buildOrderJson`, `buildOrdersJsonBatch`, `list_orders`, `get_inventory`), canonical `{ op, ... }` `change_log` payloads (`action: 'insert' | 'update' | 'delete'`), cumulative day `log_production`, `size.defaultPrice` snapshot preservation, and sanitized non-PII `sync_rejections` persistence/resolution. Kept Control DB sync (`syncControlTenantMetadata`) inside `server/repositories/*`; added `default_price` in `memberships.ts` & `snapshot.post.ts`; surfaced non-PII rejections + scrubbed PII in `admin-sync.ts`; hardened CSP (`nuxt.config.ts`), redacted `adminEmails` logs (`admin/login.post.ts`), and restricted `verifyBearerTokenWithFallback` allowlist (`server/utils/auth.ts`). Added `tests/unit/sync-backend.spec.ts` and `tests/unit/auth-hardening.spec.ts`.
- **[FE-1..6]**: Extracted pure `app/local/sync-helpers.ts` (`migrateLocalSchema` v3, `summarizeLocalData`, `formatFailedMutation`, `applyRemoteChangesOps` covering all 22 ops idempotently with counter advancement). Updated `app/local/worker.ts` (including `saleId`/`saleNumber` on `deliver_order` outbox, `PUT /api/farm` tier read, `importFullSnapshot` options, and all 6 new worker RPCs), `app/local/client.ts`, `app/local/export.ts` (`defaultPrice` + `'free'` tier), `app/local/sync.ts` (monotonic pull cursor advancement even on empty filtered pulls, `failedCount`, `needsReconcile` auto-reconciliation, `lastRemoteUpdateAt`), and `app/composables/useSync.ts`. Implemented global overwrite guard (`useLocalReplaceGuard.ts`, `ConfirmReplaceLocalDialog.vue` in `app/app.vue`, `useAuthActions.ts`, `UpgradeModal.vue` with non-swallowed snapshot error retry, `'cancelled'` kind in `auth-errors.ts`), conflict UX (`SyncConflictsModal.vue`, `SyncStatusPill.vue` popover, inline `UAlert` in `default.vue`), `/farm/settings` menu fix (`AppAccountMenu.vue`), reactive `lastRemoteUpdateAt` watchers (`useProductionDays`, `useInventory`, `useOrders`, `useSales`, `useClients`, `useFarm`), and Admin Sync Inspector updates (`useAdmin.ts`, `AdminSyncTelemetryTab.vue`, `AdminSyncInspectorDrawer.vue`). Added `tests/unit/local-sync-conflicts.spec.ts` and `tests/unit/multi-device-guard.spec.ts`. Farm Profile UI (`app/pages/farm/settings.vue`) intentionally left untouched.

- **Security hardening**: Added `sync_state.owner_uid` tracking + `CLEAR_LOCAL_DATA` wipe on explicit `signOut()` + cross-account OPFS isolation on sign-in, removed silent `upgradeToPremium()` mutation inside `useTier().getAuthToken()`, cleared dangling Firebase sessions on `UpgradeModal` close while Free, tightened `verifyBearerTokenWithFallback` (`app/invalid-credential` fails closed when production or service-account credentials are configured), made explicit `Authorization: Bearer` headers authoritative in `resolveAuth`, redacted `admin/login` error objects, bounded pagination with Zod in admin endpoints + filtered `change_log` count, capped `sync/push` batches (`max(100)`), made default size seeding idempotent (`INSERT OR IGNORE`), and sanitized `admin-migrations` errors.

## 5. QA report (QA)

**Verdict:** PASS

### Executive Summary
Feature 12 and the cross-cutting post-sync hardening enhancements have been reviewed by both `qa-reviewer` and `security-auditor`. All 13 Acceptance Criteria (AC1–AC13) are met with concrete code traceability and unit test coverage, and High/Medium findings identified during security review (cross-account OPFS isolation, `useTier().getAuthToken()` tier safety, `verifyBearerTokenWithFallback` fail-closed production check, authoritative Bearer token handling, bounded admin pagination, filtered `change_log` counts, bounded push payloads, and sanitized migration errors) have been fixed. All system invariants in `GEMINI.md` are preserved and `app/pages/farm/settings.vue` remains untouched per user decision.

### Acceptance Criteria Verification

| AC# | Status | Evidence |
|---|:---:|---|
| **AC1 — Local Business Data Detection on Sign-In** | PASS | `app/local/sync-helpers.ts` (`summarizeLocalData`), `app/composables/useLocalReplaceGuard.ts` (`confirmOrHydrateCloudFarm`), `tests/unit/multi-device-guard.spec.ts` |
| **AC2 — Multi-Device Overwrite Confirmation Guard Modal** | PASS | `app/components/ConfirmReplaceLocalDialog.vue`, `app/app.vue`, `app/composables/useAuthActions.ts`, `tests/unit/multi-device-guard.spec.ts` |
| **AC3 — Strict Non-Merge Policy (No Auto-Merge)** | PASS | Strictly all-or-nothing replacement with prior JSON backup; cross-account OPFS data belonging to another authenticated UID (`ownerUid !== targetUid`) is automatically overwritten without exposing the prior user's backup. |
| **AC4 — Strict Error Handling on Premium Registration** | PASS | `app/components/UpgradeModal.vue` (`provisionAndUploadSnapshot`, inline retry, cleans up incomplete Firebase auth session on cancel/close), `app/composables/useTier.ts` |
| **AC5 — SyncStatusPill Failure Attention State** | PASS | `app/components/SyncStatusPill.vue` (`UPopover` + error state pill badge + Review Issues CTA) |
| **AC6 — Non-Blocking Barnside Conflict Banner** | PASS | `app/layouts/default.vue` (top `UAlert`, auto-resets on new failures, leaves forms/bottom bar unobstructed) |
| **AC7 — Interactive Sync Conflict Management Modal** | PASS | `app/components/SyncConflictsModal.vue`, `app/local/sync-helpers.ts` (`formatFailedMutation`, `classifyOutboxError`) |
| **AC8 — Outbox Conflict Actions (Retry, Discard, Backup)** | PASS | `app/components/SyncConflictsModal.vue`, `app/composables/useSync.ts`, `app/local/worker.ts` |
| **AC9 — Immediate Rebalancing of Derived Inventory & Orders** | PASS | `app/local/worker.ts` (`RECONCILE_FROM_SNAPSHOT`), `app/local/sync.ts` (`reconcileFromCloud`, `lastRemoteUpdateAt`), `watch(lastRemoteUpdateAt)` across all 6 farm composables |
| **AC10 — Empty & Resolved States** | PASS | `app/components/SyncConflictsModal.vue` resolved state + auto-cleared banner/pill |
| **AC11 — Server-Side Rejection Telemetry Recording** | PASS | `server/db/adapter.ts` (`sanitizeSyncRejection`, `sync_rejections`), `tests/unit/sync-backend.spec.ts` |
| **AC12 — Admin Dashboard Sync Inspector Observability** | PASS | `server/repositories/admin-sync.ts`, `app/components/admin/AdminSyncTelemetryTab.vue`, `app/components/admin/AdminSyncInspectorDrawer.vue` |
| **AC13 — Mobile Viewport Usability (~375px)** | PASS | `sheetUi(480)` / `sheetUi(520)`, safe-area bottom insets, ≥44px (`min-h-11`) touch targets |
