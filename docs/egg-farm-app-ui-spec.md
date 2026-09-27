# Egg Farm Tracker — UI Specification (v1)

> Companion to `egg-farm-app-design.md` (the data model & architecture reference).
> This doc covers screen layouts, components, and navigation/flows.
> Out of scope here: visual branding, color palette, typography (left to build-time / a design pass).
> **Implementation stack: Nuxt UI v4 + Tailwind CSS** (see §13 Implementation Notes).

---

## 0. Guiding UI Principles

Derived from the product context (single owner-operator, responsive web, fast daily data entry):

1. **Single-user, single-farm feel.** v1 is used by one person (the owner). No role management, no user-switching UI, no team/collaboration surfaces. (Multi-tenancy exists in the data layer, but the UI shows only "your farm.")
2. **Data entry is the hot path.** Production and sales get logged frequently. Entry must be fast, few taps/clicks, minimal typing, forgiving. Everything else (reports, lists) is secondary.
3. **Responsive, equal weight desktop + mobile.** Every screen works on a phone (barnside, one-handed) and on a desktop (office review). Design mobile-first for entry screens, desktop-comfortable for dashboard/lists.
4. **Trays for humans, eggs under the hood.** All quantities are *displayed* in trays (with loose-egg remainder) but the app converts to/from individual eggs at the input/display boundary. The user rarely thinks in raw egg counts.
5. **Show, don't make them calculate.** Inventory, totals, and "what's pending" are computed and surfaced; the user never sums anything by hand.
6. **Forgiving over strict.** Easy to edit or delete a just-created entry. Confirmations only where data loss is real.

---

## 1. Global Layout & Navigation

### Responsive shell
- **Desktop (≥ ~1024px):** persistent left sidebar navigation + top bar. Main content area to the right.
- **Tablet (~768–1024px):** collapsible sidebar (icon rail, expandable).
- **Mobile (< ~768px):** bottom tab bar (thumb-reachable) for primary destinations; top bar for context/title and contextual actions.

### Primary navigation destinations (5)
1. **Dashboard** — home / overview.
2. **Production** — log & view egg collection.
3. **Sales** — log & view sales/deliveries.
4. **Inventory** — current stock on hand.
5. **Clients** — customer list.

> Rationale for 5: maps 1:1 to the v1 feature set, fits a mobile bottom tab bar (5 is the comfortable max), no nesting needed at this scale.

### Persistent actions
- **Primary "＋ Add" affordance** always reachable:
  - Desktop: a prominent button in the top bar (context-aware: on Production it defaults to "Add production", on Sales to "Add sale").
  - Mobile: a floating action button (FAB) bottom-right, above the tab bar, context-aware to the current section.
- **Auth/account**: a small avatar/menu in the top bar → sign out, (later: settings). Minimal in v1.

### Top bar contents
- Left: current screen title (and back affordance on drill-down screens).
- Center/left: optional date-range or "today" context where relevant (Dashboard, Production, Sales).
- Right: primary add action + account menu.

---

## 2. Screen: Auth

**Purpose:** sign in (Supabase Auth). Single-user v1, so this is minimal.

**Layout:** centered card, works identically on mobile/desktop.
- App name/logo placeholder.
- Email + password fields (or magic-link / provider per Supabase Auth config — TBD at build).
- Primary "Sign in" button.
- Secondary: "Forgot password" link.
- No public sign-up flow surfaced in v1 (owner account is provisioned). Sign-up UI can be hidden/deferred until the SaaS onboarding phase.

**States:** default, loading (button spinner), error (inline message above form), success (redirect to Dashboard).

**Flow:**
`Unauthenticated → Auth screen → (valid) → Dashboard`
`Any screen → session expired → Auth screen (return to prior screen after login if feasible)`

---

## 3. Screen: Dashboard

**Purpose:** at-a-glance status. The screen the owner lands on and glances at daily. Deliberately a *small, fixed* set of figures (no configurability in v1).

**Layout:** responsive grid of cards. Desktop: 2–3 columns. Mobile: single column, stacked, most important first.

**Cards / widgets (fixed set):**
1. **Today's production** — total eggs collected today, shown in trays + loose, optionally broken down by size. Quick-glance number, large.
2. **Current inventory (on-hand)** — total sellable eggs on hand, by size. This is the computed produced−sold figure. Show per-size mini-breakdown.
3. **Pending deliveries** — count + list-preview of sales with `status = pending`. Tapping goes to the filtered Sales list. This is the "what do I still owe" glance.
4. **Recent sales** — last few sales (date, client or "on-site", size, trays, price). Tap → Sales list.
5. **This week's production trend** *(optional, keep simple)* — a small sparkline or bar of daily totals for the current week. Not a full analytics suite.
6. *(Optional, only if hen counts are tracked)* **Lay rate** — eggs ÷ hens. Omit entirely if hen counts aren't in v1.

**Interaction:**
- Each card is tappable → drills into the relevant full screen (Production, Inventory, Sales).
- Date context: defaults to "today"/"this week"; a simple range toggle is acceptable but not required for v1.

**Empty state:** friendly "No data yet — log your first production" with a CTA to the Production add flow.

---

## 4. Screen: Production

**Purpose:** log daily egg collection and review production history.

### 4a. Production list / history (default view)
**Layout:** reverse-chronological list, grouped by date.
- Each entry/row shows: date, size, quality (good/reject), count (as trays + loose for good; raw count fine for rejects).
- Because a day = several rows (per size/quality), group them: a **day card** summarizing that day's collection (total good by size + total rejects), expandable to the individual size/quality rows.
- Desktop: table-like layout with columns (Date | Size | Quality | Trays | Count). Mobile: stacked cards per day.

**Actions per entry:** edit, delete (delete = soft where possible; confirm only if it affects inventory).

**Filter/sort (light):** by date range, by size. Keep minimal.

### 4b. Add / edit production entry (the hot path)
**Trigger:** ＋ Add (context: production) → entry form (modal on desktop, full-screen sheet on mobile).

**Form design — optimized for speed:**
- **Date** — defaults to *today* (most common). Editable via date picker for back-entry.
- **Multi-row entry in one submit.** A morning's collection is several size/quality lines, so the form supports entering *all sizes at once* rather than one submit per size:
  - A row per **size** (Small / Medium / Large / Jumbo) with a quantity input (in trays + loose, or a tray-count stepper).
  - A separate **Rejects** input (no size — single count/trays field), reflecting that rejects are size-null.
  - Quality defaults to **good** for the sized rows; rejects are their own quality.
- **Input controls:** steppers / large tap targets for quantities (barnside, mobile). Numeric keypad on mobile. Trays as primary unit, with an optional "loose eggs" secondary field, OR a single field that accepts decimals-as-trays — pick one convention and keep it consistent (see design doc §Canonical unit).
- **Save** writes one production row per non-empty size + one for rejects, all sharing the date. (Maps to the `(date, size, quality, count)` model.)

**Validation:** non-negative counts; at least one field filled. Forgiving — zero/blank sizes simply aren't recorded.

**Post-save:** toast confirmation ("Logged 6 trays large, 2 trays medium, 12 rejects"), return to list with new day-card at top.

**Empty state:** "No production logged yet" + prominent add CTA.

---

## 5. Screen: Sales (includes Deliveries)

**Purpose:** log sales (delivered or on-site) and manage delivery status. This is where "deliveries" live, as a fulfillment type of a sale.

### 5a. Sales list (default view)
**Layout:** reverse-chronological list.
- Each row: date, client name (or "On-site" if none), size, quantity (trays), price, **fulfillment type** (delivery / on-site), **status** (pending / complete).
- Visual status indicator: pending vs complete clearly distinguished (e.g., badge/chip). Pending items visually prioritized (they need action).
- Desktop: table (Date | Client | Type | Size | Trays | Price | Status | actions). Mobile: stacked cards.

**Filters (useful here):**
- **Status:** All / Pending / Complete. (Pending = the "deliveries" to-do list.)
- **Fulfillment type:** All / Delivery / On-site.
- **Client:** filter to one customer (→ becomes a simple per-client history).
- Date range.

> Note: "Deliveries list" is just this screen filtered to `fulfillment_type = delivery`. No separate screen needed.

**Row actions:**
- For a **pending delivery:** a prominent **"Mark delivered"** action. This is the key status-change interaction — it flips status→complete, stamps delivered date, and decrements inventory (one event, per design doc §Status lifecycle).
- Edit, delete (confirm if it affects inventory).

### 5b. Add / edit sale
**Trigger:** ＋ Add (context: sales) → form (modal desktop / full-screen sheet mobile).

**Form fields:**
- **Fulfillment type** — toggle: **Delivery** vs **On-site**. This choice drives the rest of the form (progressive disclosure):
  - **Delivery selected:** show **Client** selector (required-ish; from client list, with quick "add new client" inline), and status defaults to **pending**, delivered date empty.
  - **On-site selected:** Client is **optional** (hidden or "walk-in" default); status is **complete** immediately, ordered = delivered = now.
- **Client** — searchable select from the client list; inline "＋ new client" for a customer not yet saved. Optional for on-site.
- **Size** — select (Small / Medium / Large / Jumbo). Sales are always sized.
- **Quantity** — in trays (+ loose), converted to eggs on save.
- **Price** — the sale's price. Pre-fills from the client's default price if one exists, but is **editable and snapshotted onto the sale** (design doc §Price snapshot). For on-site, entered directly.
- **Date ordered** — defaults to today; editable.
- **(Delivery only) Date delivered** — normally left blank at creation; set later via "Mark delivered." Optionally settable here for back-dated entries.

**Inventory awareness (nice-to-have, not required v1):** show available on-hand for the selected size as the user enters quantity, so they don't oversell. Non-blocking hint, not hard validation.

**Save behavior:**
- On-site sale → created as `complete`, inventory decremented immediately.
- Delivery → created as `pending`, inventory **not** yet decremented (decrement happens at "Mark delivered").

**Post-save:** toast; return to Sales list with new row at top.

### 5c. Mark-delivered flow
`Sales list → pending row → "Mark delivered" → (optional confirm) → status=complete, delivered_date=now, inventory decremented → row updates in place, toast.`
- Lightweight: ideally one tap + optional confirm. This is a frequent action.

**Empty state:** "No sales yet" + add CTA.

---

## 6. Screen: Inventory

**Purpose:** show current sellable eggs on hand, by size. Read-only (computed) in v1 — there's no manual inventory editing, since it's derived from production − sales.

**Layout:** simple, scannable.
- **Per-size cards or rows:** Small / Medium / Large / Jumbo, each showing current on-hand in trays (+ loose) and raw egg count.
- **Total on-hand** summary at top.
- Optional: a small note/definition — "On-hand = sellable eggs produced minus eggs delivered." (Clarifies that pending deliveries are *not* yet subtracted, per design doc.)

**Interaction:**
- Read-only. Tapping a size *could* drill into "what produced this / what sold this" (a filtered production+sales view) — optional, not required for v1.
- No add/edit controls (inventory isn't directly mutated).

**Empty state:** "No inventory yet — log production to see stock."

> Design note: because inventory is computed, this screen is essentially a live view over the production and sales data. No separate inventory records to manage.

---

## 7. Screen: Clients

**Purpose:** manage the simple list of customers the farm sells/delivers to. Referenced by sales.

### 7a. Client list
**Layout:** alphabetical or recent list.
- Each row: client name, optional contact snippet, optional default price. Maybe a small stat (e.g., total delivered, or last sale date) — optional.
- Desktop: table/list. Mobile: cards.
- Search/filter by name.

**Row actions:** edit, and mark inactive / mark active (no delete: decided in feature 03). A sale keeps its own price snapshot but **not** the client's name (a rename shows on past sales), and a client is never deleted so a sale's client always resolves; an inactive client stays in the list and on past sales and is not offered for new sales.

### 7b. Add / edit client
**Trigger:** ＋ Add on Clients screen, OR inline "＋ new client" from the Sales form.

**Form fields:**
- **Name** (required).
- **Contact** — phone / address (optional, free-text or simple fields).
- **Default price** (optional) — a convenience that pre-fills the sale form; NOT authoritative for past sales.

**Post-save:** returns to list (or back to the Sales form if invoked inline, with the new client pre-selected).

### 7c. Client detail (optional for v1)
- Tapping a client → their info + their sales history (the Sales list filtered to that client). Nice-to-have; the same result is achievable via the Sales client filter, so this screen is optional.

**Empty state:** "No clients yet — add your first customer" + CTA.

---

## 8. Cross-Cutting Components

Reusable pieces referenced across screens:

- **Quantity input (trays + loose):** the canonical entry control. Accepts trays and optional loose eggs; converts to/from egg count. Used in Production and Sales forms. Reads eggs-per-tray from tenant settings (defaulted).
- **Quantity display (trays + loose):** the read-only counterpart; formats an egg count as "X trays + Y" consistently everywhere (single shared helper).
- **Size selector:** Small / Medium / Large / Jumbo. Segmented control or select. Categories sourced as data (extensible), not hardcoded.
- **Status chip:** pending / complete, visually distinct.
- **Fulfillment-type toggle:** delivery / on-site.
- **Client selector:** searchable, with inline-create.
- **Date field:** defaults to today; date picker for back-entry.
- **Day-summary card:** groups multi-row production for a date.
- **Add affordance:** context-aware top-bar button (desktop) / FAB (mobile).
- **Toast/confirmation:** post-save feedback; brief, dismissible.
- **Empty state:** consistent illustration/text + primary CTA, per screen.
- **Confirm dialog:** only for genuinely destructive/inventory-affecting actions.

---

## 9. Primary User Flows

### Flow A — Log the morning's production (most frequent)
`Dashboard → ＋ Add (or Production tab → ＋) → production form (date=today) → enter trays per size + rejects → Save → toast → back to Production list / Dashboard updates.`
Target: under ~30 seconds, mostly steppers, minimal typing.

### Flow B — Record a delivery order (to be fulfilled later)
`Sales tab → ＋ Add → fulfillment=Delivery → pick client (or ＋ new) → size + trays + price (pre-filled) → Save (status=pending) → appears in Sales list & Dashboard "Pending".`
Inventory not yet affected.

### Flow C — Mark a delivery as delivered
`Dashboard "Pending" or Sales (filter: Pending) → row → "Mark delivered" → confirm → status=complete, inventory decremented → toast.`

### Flow D — Record an on-site/home sale (immediate)
`Sales tab → ＋ Add → fulfillment=On-site → (client optional) → size + trays + price → Save (status=complete) → inventory decremented immediately.`

### Flow E — Check what's on hand
`Dashboard inventory card (glance) → tap → Inventory screen (per-size detail).`

### Flow F — Add a customer
`Clients tab → ＋ Add → name (+ optional contact/price) → Save.`  (Or inline from Flow B.)

### Flow G — Review a customer's history
`Clients → client → detail (their sales)` — or `Sales → filter by client`.

---

## 10. Navigation Map (summary)

```
Auth
 └─(signed in)→ App shell (sidebar desktop / bottom tabs mobile)
      ├─ Dashboard ──(card taps)──► Production / Inventory / Sales
      ├─ Production ──► [list grouped by day] ──► Add/Edit production (modal/sheet)
      ├─ Sales ──► [list, filter by status/type/client] ──► Add/Edit sale (modal/sheet)
      │              └─ pending row ──► "Mark delivered"
      ├─ Inventory ──► [per-size on-hand, read-only]
      └─ Clients ──► [list] ──► Add/Edit client (modal/sheet) ──► (optional) Client detail
```

---

## 11. Responsive Behavior Summary

| Element | Desktop (≥1024px) | Mobile (<768px) |
|---|---|---|
| Primary nav | Left sidebar | Bottom tab bar |
| Add action | Top-bar button (context-aware) | FAB (context-aware) |
| Add/edit forms | Centered modal | Full-screen sheet |
| Lists (Production/Sales/Clients) | Table-style with columns | Stacked cards |
| Dashboard | Multi-column card grid | Single-column, priority-ordered |
| Quantity entry | Inputs/steppers | Large steppers + numeric keypad |

---

## 12. Explicitly deferred (not in v1 UI)

- User/role management, team collaboration, multi-user surfaces.
- Invoicing / accounts-receivable screens (sales record price only).
- Delivery routing/scheduling/maps.
- Configurable dashboards / advanced analytics & charts beyond the fixed set.
- Feed, mortality, health/vaccination, flock-management screens.
- Offline UI states (deferred per design doc; may add "connection-resilient" polish later).
- SaaS onboarding / public sign-up / billing screens (owner account provisioned in v1).
- Settings screen beyond the minimum (eggs-per-tray setting may live in a minimal settings area or be defaulted).

---

## 13. Implementation Notes (Nuxt UI v4 + Tailwind CSS)

The UI is built with **Nuxt UI v4** (the component library) on **Tailwind CSS**. These are one integrated system, not two separate choices — Nuxt UI is built on Tailwind and layers its own design-token/theming system on top. Implement the spec by **composing Nuxt UI components**, not building primitives from scratch.

### ⚠️ Verify against current v4 docs before building
Nuxt UI v4 is recent and the v3 → v4 transition changed component APIs, the theming/design-token approach, and how Tailwind is wired in. **Do not rely on memory or v3 patterns for v4 specifics.** When building, check the current Nuxt UI v4 documentation for exact component names, prop/slot APIs, theming config, and Tailwind setup. Pull the live docs as you go rather than assuming — this is the single most important note in this section.

### Map spec components → Nuxt UI primitives
Most cross-cutting components (§8) come from the library rather than hand-built. Confirm exact names/APIs against v4 docs, but expect to use library primitives for:
- **Add/edit forms** (modal on desktop, sheet on mobile) → Nuxt UI modal / slideover components.
- **List views** (Production / Sales / Clients desktop tables) → Nuxt UI table component.
- **Form controls** (quantity steppers, price, date) → Nuxt UI input / number / date components.
- **Client selector** (searchable, inline-create) → Nuxt UI select/combobox with search.
- **Status chip** (pending / complete) → Nuxt UI badge.
- **Fulfillment-type toggle** (delivery / on-site) → Nuxt UI segmented control / button group / radio group.
- **Toast / confirmation** → Nuxt UI toast/notification system.
- **Confirm dialog** → Nuxt UI modal/dialog.
- **Navigation** (sidebar desktop / bottom tabs mobile) → Nuxt UI navigation primitives + responsive layout.
- **Cards / empty states** → Nuxt UI card + composed content.

### Genuinely custom components (build using Nuxt UI inputs underneath)
These are domain-specific and won't exist in the library — build them, but use Nuxt UI's inputs as the underlying controls:
- **Quantity input (trays + loose ↔ eggs):** the canonical entry control. Wraps Nuxt UI number inputs/steppers; owns the tray↔egg conversion (reads eggs-per-tray from tenant settings). Decide the single input convention here (two fields vs decimal-trays) and reuse everywhere.
- **Quantity display (trays + loose):** shared read-only formatter for an egg count → "X trays + Y". One helper, used everywhere.
- **Multi-size production entry form:** the per-size + rejects grid that writes multiple `(date, size, quality, count)` rows in one submit. Composed from Nuxt UI inputs.
- **Day-summary production card:** groups a date's multiple production rows into one expandable card.

### Theming / Tailwind approach
- **Theme through Nuxt UI's configuration**, not scattered raw Tailwind utilities. Nuxt UI v4's token/theme system is where the look is set once (colors, radius, spacing scale). Leaning on it keeps spacing and responsive behavior coherent for free; ad-hoc per-component Tailwind classes drift and should be the exception.
- Since this spec left **visual branding open**, Nuxt UI's theme config is the natural place to decide it at build time — set the primary color, neutral palette, radius, and font once in the theme rather than per-screen.
- Raw Tailwind utilities are fine for **layout** (grid, flex, spacing on containers) where a component isn't involved; prefer library tokens for anything component-level.

### Responsive implementation
- The desktop-sidebar / mobile-bottom-tabs split (§11) is a layout concern — implement with a responsive app shell using Tailwind breakpoints, swapping the nav pattern at the `md`/`lg` boundary.
- Forms: use the modal component on desktop and the slideover/sheet on mobile — check whether a single Nuxt UI component covers both responsively, or whether to switch by breakpoint.
- Follow Nuxt UI v4's own responsive conventions where the library provides them rather than overriding with custom breakpoints.
```
