# Feature: Inventory screen

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want one screen that shows how many eggs I have on hand right now, per size, and how many are still owed on open orders, so that I can see at a glance what I can sell and whether I can cover what customers are waiting for, without counting trays or adding anything up.

**Why now / spec reference:** Product doc goal 5 ("show, don't make them calculate") and the Inventory destination; UI spec §6 (Inventory, read-only, computed); architecture spec "Inventory" (on-hand = physically present; orders never change it; "for delivery" reads open orders' remaining). Features 04 and 05 are merged, so on-hand and open orders both exist. The Inventory design is in `docs/design/source/template.html` (screen `inventory`): a Total on hand summary card (with Sellable and For delivery), and one card per size (trays and loose, eggs on hand, Sellable, For delivery). The screen is currently a placeholder.

**Definitions (fixed by earlier features):**
- **On hand** per size = good production minus non-voided sales, computed live (the same figure the Log a sale hint uses). Rejects never count. Orders, whatever their status, never change it.
- **For delivery** per size = the eggs still owed on **open** orders (Requested, Confirmed, Ready, Partially fulfilled), computed as ordered minus delivered-so-far per line (feature 05 "Remaining"). It is information only: it does **not** reserve or reduce on-hand.

## 2. Acceptance criteria (PM)
Example data used below (eggs per tray 30): Large produced 600 good eggs, one non-voided sale with a Large line of 240; Medium produced 300, no sales; Small produced 0; Jumbo produced 90. Open orders: A wants Large 10 trays (300 eggs), nothing delivered; B wants Medium 5 trays (150) with 2 trays (60) already delivered.

**Content and numbers**
- [ ] AC1 — The screen shows one card per **active** size, in the farm's size order, using the farm's size names. A size with no stock still shows a card (0).
- [ ] AC2 — Each size card shows on-hand as **trays + loose** (the shared display format) and the exact egg count, e.g. "eggs on hand". With the example: Large 360 eggs = 12 trays; Medium 300 = 10 trays; Small 0; Jumbo 90 = 3 trays.
- [ ] AC3 — A **Total on hand** summary shows the sum across sizes in trays + loose (example: 750 eggs = 25 trays). It equals the sum of the size cards exactly.
- [ ] AC4 — **For delivery** is shown per size (only when above 0) and in total. Example: Large 300 eggs (10 trays); Medium 90 eggs (3 trays, ordered 150 minus delivered 60); total 390 eggs (13 trays). A Cancelled or Fulfilled order contributes 0; a Closed-short order contributes 0 (its dropped eggs are not owed).
- [ ] AC5 — For delivery does **not** change on-hand. In the example Large on hand stays 12 trays while 10 trays are owed. Creating, editing, confirming, marking Ready or cancelling an order changes only For delivery, never on-hand.
- [ ] AC6 — When a size's For delivery is more than its on-hand, the card says so in words (for example "Short by 2 trays"), not by colour alone. Information only: no blocking and no action. (Example: Large owed 300 vs 360 on hand is not short; if on hand were 240 it would show short by 60 eggs = 2 trays.)
- [ ] AC7 — A rejects total is **not** shown as stock, and rejects never appear in any on-hand figure.
- [ ] AC8 — **Sellable** is not defined as a reservation. Whatever the screen shows under Sellable must equal on-hand minus nothing, or the label must be removed (see Open question 1). The footnote must match the real rule: on hand is good eggs produced minus eggs sold, and owed eggs are shown for information, not subtracted.

**Live correctness**
- [ ] AC9 — After logging production, the figures change by exactly those eggs per size when the screen is next opened or refreshed (example: log 2 trays Small, Small shows 2 trays and Total goes to 27 trays).
- [ ] AC10 — Logging a sale lowers on-hand by exactly the sale's eggs per size; **voiding** a sale returns them (voiding the 240-egg sale makes Large 20 trays). A delivery made from an order lowers on-hand and lowers that order's owed in the same step (deliver 4 trays of A: Large on hand 8 trays, For delivery 6 trays).
- [ ] AC11 — Rejected production, orders of any status, and voided sales never create or remove stock except as stated above.
- [ ] AC12 — The figures agree with the Log a sale on-hand hint for the same size at the same moment, and with the Dashboard "On hand now" card when that exists. One computation backs all of them.
- [ ] AC13 — If a size's computed on-hand is negative (data entered out of order, e.g. a backdated sale before the production was logged), the screen shows the true negative value with a plain note ("Sales are ahead of logged production"); it is not silently clamped to 0. (See Open question 2.)
- [ ] AC14 — Inventory includes **archived (inactive) sizes only if they still have eggs on hand or owed**, shown in a clearly marked "Inactive size" way after the active ones. Archived sizes with 0 and 0 are not shown. (See Open question 3.)

**States**
- [ ] AC15 — **Empty state:** with no production logged at all, the screen shows "No inventory yet. Log production to see stock." with a button to Production (the one-tap path to log). No size cards of zeros are shown in this state beyond that message.
- [ ] AC16 — **Loading:** a skeleton or loading state is shown while figures load; no stale or zero numbers are shown as if real.
- [ ] AC17 — **Error:** if loading fails, a plain message with Retry is shown, and no partial or old numbers appear as current. The message contains no technical detail.
- [ ] AC18 — A refreshed figure after the user returns to the screen is not older than the last change they made in this session (no stale cached on-hand after a sale or production entry).

**Read-only and navigation**
- [ ] AC19 — The screen has **no** add, edit, adjust, or delete control and no manual stock entry. The only actions are navigation: the empty-state button, and (if offered) tapping For delivery to open Orders (see Open question 4).
- [ ] AC20 — Reachable on desktop from the sidebar and on a phone via **More > Inventory** (2 taps); the top bar title reads "Inventory" and More shows its active state (feature 05). The Dashboard "On hand now" card tap-through goes here once that card exists.
- [ ] AC21 — Only the signed-in farm's data is shown; another farm's production, sales or orders never affect any figure (cross-tenant test).

**Mobile and display**
- [ ] AC22 — On a 375px-wide phone nothing scrolls sideways; the Total card is first, then size cards stacked (one or two per row per the design). All text is readable without zoom and tray figures are not truncated.
- [ ] AC23 — Trays come from the farm's eggs-per-tray setting through the shared conversion helper; changing eggs per tray (e.g. 30 to 12) changes the tray display immediately on the next load while egg counts stay the same.
- [ ] AC24 — Status and shortage are never shown by colour alone; every coloured figure has a text label.

**Out of scope:**
- Stock adjustments, manual counts, write-offs, breakage, spoilage, stocktake (inventory is derived only; no manual editing).
- Reserving or allocating eggs to orders; "available to promise" as a stored or enforced number.
- Stock history, trends, charts, per-day movement, or a per-size ledger (a possible later follow-up).
- Low-stock alerts or thresholds, reorder prompts.
- Rejects reporting (belongs to Production/Dashboard).
- Hen counts, lay rate, flock health, invoicing, payments, routing, offline, realtime updates, multi-user and roles (non-goals).
- The Dashboard "On hand now" and "Pending deliveries" cards (their own feature), and the invoice/print view (feature 07).
- Exports and printing.

**Open questions for owner:** None (owner is unavailable; see below for architect decisions).

**Open questions for the architect** (recommended default in bold)
1. **"Sellable" in the design.** The design computes Sellable = on-hand minus pending (a reservation) and its footnote says "pending deliveries are reserved". That contradicts the settled rule that orders reserve nothing. **Recommended: drop the Sellable line and rename the summary to Total on hand plus For delivery (information only); fix the footnote text.** Alternative: keep "Sellable" meaning on-hand minus owed, floored at 0, labelled "Left after open orders". Needs the owner to update the design either way (flag to owner: design/spec conflict).
2. **Negative on-hand.** The design clamps to 0. **Recommended: show the true value with a note (AC13)** since clamping hides a data-entry problem. Confirm whether `app.on_hand_json` can return negatives and how Log a sale already treats it.
3. **Archived sizes.** **Recommended: show an archived size only if it has stock or owed eggs (AC14).** Alternative: active sizes only (stock in an archived size would vanish from view).
4. **For delivery drill-down.** **Recommended: no drill-down in v1** (display only). Alternative: tapping a For delivery figure opens Orders filtered to Open.
5. **Source of For delivery.** **Recommended: compute with the same rule as order Remaining (ordered minus non-voided delivered, open orders only) in one server-side function, alongside `app.on_hand_json`, reused by the future Dashboard.** Closed-short and cancelled contribute 0.
6. **Freshness.** **Recommended: load on screen open and on return to the tab/screen; no realtime and no polling (non-goal).**
7. **Design's optional "Pending delivery" card** (`showPendingCard`, default off in the design). **Recommended: omit it**; For delivery already sits in the Total card.

---

## 2.5 UX design (UX Designer)
Design follows `docs/design/source/template.html` (screen `inventory`): a centred Total card, then a grid of size cards. Read-only, no form, no toasts. Deviations from the design follow the PM's recommended defaults and are listed at the end.

- **Flow:** Desktop: sidebar Inventory (1 tap). Phone: More, then Inventory (2 taps). Also from the Dashboard "On hand now" card once it exists. The screen loads on open and each time the owner returns to it (AC18). The only action is the empty-state button "Go to Production". No drill-down in v1. **Main-path tap count: 2 on phone, 1 on desktop; the answer is visible with no further taps.**

- **Layouts**

Mobile (~375px), one size card per row (two per row would truncate "12 trays + 15 loose"):
```
+-------------------------------------+
| Inventory                           |  top bar title
+-------------------------------------+
| +---------------------------------+ |  UCard (rounded-2xl, ring)
| |        Total on hand            | |
| |         25 trays                | |  text-4xl bold (trays + loose)
| |         750 eggs                | |
| | ------------------------------- | |
| | Truck  Owed on open orders      | |
| |        13 trays                 | |
| +---------------------------------+ |
| +---------------------------------+ |  UCard per active size
| | (o) Small                       | |  size colour dot + name
| | 0 trays                         | |  text-2xl bold
| | 0 eggs on hand                  | |  text-sm muted
| +---------------------------------+ |
| | (o) Large                       | |
| | 12 trays                        | |
| | 360 eggs on hand                | |
| | ------------------------------- | |
| | Truck  Owed on orders  10 trays | |  only if > 0
| +---------------------------------+ |
| | (o) Extra small [Inactive size] | |  UBadge; only if eggs or owed
| +---------------------------------+ |
| On hand is good eggs produced minus |  footnote, text-sm muted
| eggs sold. Owed eggs are shown for  |
| information and are not taken off.  |
| [Home][Prod][Orders][Sales][More]   |
+-------------------------------------+
```
Inside a size card, shortage (icon plus words, never colour alone):
```
| Truck  Owed on orders   10 trays    |
| (!) Short by 2 trays                |
```
Negative on-hand:
```
| -2 trays                            |
| -60 eggs on hand                    |
| (!) Sales are ahead of logged       |
|     production                      |
```

Desktop (sidebar + content, max width 1120px, centred):
```
+--------+--------------------------------------------------+
| Sidebar| Inventory                                        |
|        | +----------------------------------------------+ |
| >Inven-| |  Total on hand   25 trays   750 eggs         | |
|  tory  | |  Owed on open orders: 13 trays               | |
|        | +----------------------------------------------+ |
|        | +--------+ +--------+ +--------+ +--------+      |  4 columns, wraps if more
|        | | Small  | | Medium | | Large  | | Jumbo  |      |
|        | | 0 trays| |10 trays| |12 trays| | 3 trays|      |
|        | | 0 eggs | |300 eggs| |360 eggs| | 90 eggs|      |
|        | |        | | Owed 3 | | Owed 10| |        |      |
|        | +--------+ +--------+ +--------+ +--------+      |
|        |   footnote (centred)                             |
+--------+--------------------------------------------------+
```
Component map: Total and size cards = UCard (same pattern as the Production day-summary card); size dot = the existing size colour swatch; "Inactive size" = UBadge (neutral, outline); shortage and negative notes = inline text with UIcon (not UAlert, to stay compact); empty state = the existing empty-state pattern with UButton to /production; loading = USkeleton; error = UAlert (error) with UButton Retry. Quantities use the shared trays + loose display helper; there are no inputs on this screen, so the two-fields-vs-decimal question doesn't arise.

- **Order and grouping:** active sizes in the farm's size order (shown even at 0 once any production exists). Inactive sizes with eggs on hand or owed come after, labelled "Inactive size". Inactive sizes at 0 and 0 are hidden.

- **States**
  - Default: as above.
  - Loading: Total card and four size-card skeletons. No numbers until loaded; on return to the screen, skeletons show again instead of old numbers (AC16, AC18).
  - Empty (no production ever logged): one centred block, no zero cards, no Total. Button "Go to Production".
  - Server error: replaces the content, no old numbers. Retry shows skeletons again.
  - Shortage (owed more than on hand, per size): extra line "Short by 2 trays". The Total card shows the same line only when total owed exceeds total on hand.
  - Negative on-hand: true value shown with the note; the Total sums the true values.
  - Owed is 0: the owed row is hidden on the size card; the Total card shows "0 trays".
  - Validation error and success toast: not applicable (read-only).

- **Copy** (exact)
  - Title: "Inventory". Subtitle (from the design): "Live view, produced minus sold".
  - Total card: "Total on hand"; second line "{n} eggs"; owed row "Owed on open orders".
  - Size card: "{n} eggs on hand"; owed row "Owed on orders"; badge "Inactive size".
  - Shortage: "Short by {trays + loose}". Negative: "Sales are ahead of logged production".
  - Footnote: "On hand is good eggs produced minus eggs sold. Owed eggs are shown for information and are not taken off."
  - Empty: "No inventory yet" / "Log production to see stock." / button "Go to Production".
  - Error: "Couldn't load your stock." / "Check your connection and try again." / button "Retry".
  - Quantities: "12 trays", "1 tray", "12 trays + 15 loose" (shared format). The egg count line is the only place "eggs" appears, as in the design and AC2.

- **Accessibility**
  - Go to Production and Retry are at least 44px tall; there are no other controls.
  - Each card is a labelled group (e.g. aria-label "Large, 12 trays on hand"). Skeleton container has aria-busy="true"; the error has role="alert".
  - Shortage, negative and owed states always have an icon plus words; colour is secondary.
  - Contrast in sunlight: the design's text-dimmed (egg count, footnote) and warning orange on white are weak. Use text-muted for those and a darker warning shade for warning text; frontend to verify 4.5:1.
  - The size colour dot is decorative; the size name is always written.

- **Data the UI needs:** (for the architect)
  - Per size: id, name, colour slot, position, archived or not, on-hand eggs (may be negative), owed eggs (open orders only, ordered minus delivered). Archived sizes only when on-hand or owed is non-zero (or the UI filters).
  - Whether any good production has ever been logged (empty state vs zero cards).
  - Eggs-per-tray (the shared helper already reads it).
  - Totals are summed in the UI from the per-size figures so they match exactly (AC3).

- **Deviations from the owner's design (follow the PM defaults; the owner should update the design file)**
  1. "Sellable" removed from the Total card and the size cards (it implied orders reserve stock). For delivery is relabelled "Owed on open orders" / "Owed on orders" in plain words.
  2. Footnote rewritten: the design's "Pending deliveries are reserved" is no longer true.
  3. Negative on-hand shows the true value with a note instead of being clamped to 0.
  4. Added "Short by N trays" (AC6) and "Inactive size" cards (AC14).
  5. Added an empty state for no production at all; the design shows zero cards.
  6. Optional "Pending delivery" card omitted; no drill-down on owed figures.
  7. Mobile size cards stack one per row (the design leaves it open). The design's green Sellable and orange For delivery figure colours are dropped; the owed row keeps the Truck icon plus a text label.

- **Decisions for owner:** None blocking. Please update the design for deviations 1 to 3. A later option, not designed: tap an owed figure to open Orders filtered to Open.

---

## 3. Technical design (Architect)

Read-only feature: **one new migration (two functions plus one public wrapper, no table, no column, no index), one route, one repository file, one page.** Everything is derived. The owner was unavailable, so the architect decided the PM's seven open questions (table in 3.8).

### 3.0 Findings from the code
- `app.on_hand_json(p_tenant_id, p_size_ids)` (M19, `20261003105245_sales_drop_pending.sql`) is `coalesce(good production) - coalesce(non-voided sale_lines)` per size over **all** of the farm's sizes (archived included). It does **not** clamp, so **it can be negative**. Nothing prevents that: the Log a sale shortfall check is overridable ("Record anyway", `confirmShortfall`), a sale can be backdated before the production it needs, and Edit day / Delete day on Production have no sold-eggs guard. Sales already compare against the true figure (`neededEggs > onHandEggs`) and nothing clamps in SQL. So negatives are real and must be shown as-is.
- `formatQty` / `splitEggs` in `shared/utils/quantity.ts` **throw a RangeError on a negative** (`assertWholeCount`). The screen must never pass a negative to them (task FE1 adds a signed wrapper).
- A closed-short order has `status = 'fulfilled'` with `closed_short_at` set (`orders_closed_short_status` check); a cancelled order has `status = 'cancelled'`. `app.order_json` defines remaining as `0` when `status in ('cancelled','fulfilled') or closed_short_at is not null`, else `greatest(ordered - delivered, 0)`, where delivered is `app.order_delivered_eggs` (non-voided linked sale lines). That is the rule to reproduce.
- Existing indexes already cover the new reads (`orders_tenant_open_idx` partial on open statuses, `order_lines_tenant_size_idx`, `sales_tenant_order_idx`, `sale_lines_tenant_size_idx`, `production_tenant_size_idx`). **No new index.**

### 3.1 Data (migration `20261007090000_inventory.sql`, "M21")
No new table, column, constraint, view or index. Functions are `security invoker`, `stable`, `set search_path = ''`, in the style of `app.on_hand_json`.

**`app.owed_by_size(p_tenant_id uuid) returns table (size_id uuid, eggs bigint)`**: eggs still owed on open orders, per size. Set-based (one pass, no per-order loop):
```sql
with open_lines as (
  select l.order_id, l.size_id, l.eggs
  from public.orders o
  join public.order_lines l on l.tenant_id = o.tenant_id and l.order_id = o.id
  where o.tenant_id = p_tenant_id
    and o.status in ('requested', 'confirmed', 'ready', 'partially_fulfilled')
    and o.closed_short_at is null and o.cancelled_at is null
), delivered as (        -- same definition as app.order_delivered_eggs, for all orders at once
  select s.order_id, sl.size_id, sum(sl.eggs) as eggs
  from public.sales s
  join public.sale_lines sl on sl.tenant_id = s.tenant_id and sl.sale_id = s.id
  where s.tenant_id = p_tenant_id and s.order_id is not null and s.voided_at is null
  group by s.order_id, sl.size_id
)
select ol.size_id, sum(greatest(ol.eggs - coalesce(d.eggs, 0), 0))::bigint
from open_lines ol left join delivered d on d.order_id = ol.order_id and d.size_id = ol.size_id
group by ol.size_id
```
**`app.inventory_json(p_tenant_id uuid) returns jsonb`**: the whole screen payload `{ hasAny, sizes: [{ id, name, sortOrder, colorSlot, active, onHandEggs, owedEggs }] }`.
- `on_hand` CTE = `jsonb_array_elements(app.on_hand_json(p_tenant_id, null) -> 'onHand')` (**the one on-hand calculation, called, not copied**); `owed` CTE = `app.owed_by_size(p_tenant_id)`.
- `sizes` = the tenant's `public.sizes z` left-joined to both, `coalesce(..., 0)`, kept when `z.archived_at is null or on_hand <> 0 or owed > 0` (Q3). `active = z.archived_at is null`. Ordered `(z.archived_at is not null), z.sort_order, z.name, z.id` (the `FarmSize` order from feature 02).
- `hasAny` = `exists (good production row) or exists (non-voided sale line)` for the tenant. A farm with nothing, or only rejects, gets the empty state; a farm with sales but no production gets cards (negative).
- Name, colour slot and order ride in the payload (`InventorySize extends FarmSize`), so the screen is self-contained and never shows "Unknown size" when the client's cached farm list is stale. Sizes are not personal data.

**`public.get_inventory(p_tenant_id uuid) returns jsonb`**: `plpgsql stable security invoker`; `perform app.assert_tenant(p_tenant_id); return app.inventory_json(p_tenant_id);` (the pattern of `get_on_hand`). Grants: `revoke execute ... from public, anon; grant execute ... to authenticated` for `public.get_inventory(uuid)`; `revoke all ... from public; grant execute ... to authenticated` for the two `app` functions (invoker functions need execute rights, as `app.order_delivered_eggs`). Only SQLSTATE raised: `TM006` (tenant mismatch, from `assert_tenant`). No new TM code.

**One definition of "remaining".** The rule now exists as `app.order_json` (per order, for the Orders screen) and `app.owed_by_size` (set-based, all open orders). Rewriting `order_json` to share code would touch a function the whole Orders feature depends on, for a gain (no N+1) only the set-based form needs, so it is left alone and **a pgTAP parity test makes divergence fail loudly** (3.6). A third consumer (Dashboard "Pending deliveries") reads `app.owed_by_size` / `get_inventory`, never a fourth copy.

After the migration: `bun run db:reset`, then `bun run db:types` (adds `get_inventory` to `database.types.ts`; `TenantRpc` then accepts it).

### 3.2 RLS
**No policy changes, no new table.** The functions run as the signed-in user, so the existing select policies on `sizes`, `production`, `sales`, `sale_lines`, `orders`, `order_lines` filter every row by `app.current_tenant_id()`; `p_tenant_id` is asserted by `assert_tenant` and used in every `where`. No `security definer`, no view. `010_rls_coverage` must stay green; if it enumerates public function grants, add `get_inventory` (no anon execute).

### 3.3 Server API
One route under `defineTenantHandler` (signed in, farm member, `Cache-Control: private, no-store`, cross-site refusal, errors mapped). No body, no query, **no `tenant_id` anywhere** (it comes from the membership).

`GET /api/inventory` returns `200 InventoryResponse`:
```ts
export interface InventorySize extends FarmSize { onHandEggs: number, owedEggs: number } // onHandEggs may be < 0; owedEggs >= 0
export interface InventoryResponse { hasAny: boolean, sizes: InventorySize[] }
```
`sizes`: every active size in the farm's order, then archived sizes only when on-hand or owed is non-zero. Errors: `401 unauthenticated`, `403 no_farm`, `500 internal`. No `validation_failed` (no input), no `conflict`, no `404`. The repository logs only the SQLSTATE; `TM006` and a result that fails the zod parse are both `500 internal` (as every other repository).

Repository `server/repositories/inventory.ts`: `getInventory(db: TenantDb): Promise<InventoryResponse>` = `db.rpc('get_inventory', {})`, zod-parse the shape, return. Integers only; `bigint` sums arrive as JSON numbers. Route `server/api/inventory/index.get.ts` is a few lines (no `.rpc`/`.from` in a route: guard (b2)); add it to the expected-routes list in `tests/unit/server-guards.spec.ts`.

`GET /api/sales/on-hand` stays (Sale form hint and Deliver dialog); both it and Inventory call `app.on_hand_json`, so the figures agree (AC12).

**Stub written by the architect:** `InventorySize` and `InventoryResponse` added to `shared/types/api.ts` (types only, no runtime code).

### 3.4 Frontend
- **Page** `app/pages/inventory.vue` replaces the placeholder. Navigation already lists Inventory under More (`APP_NAV`). `nav.ts` subtitle currently reads "Live view — produced minus sold"; UX copy is "Live view, produced minus sold" (FE aligns `nav.ts` and `nav.spec.ts`). No `primaryAction` (no FAB here; check the layout copes with a page that sets none).
- **Composable** `app/composables/useInventory.ts`: **page-local state, not `useState`**: `{ status: 'loading' | 'ready' | 'error', data, load() }`. `load()` sets `status = 'loading'` and `data = null` first (skeletons, no stale numbers: AC16/AC18), then `useApi()` GET `/api/inventory`; a farm change or a superseded reply is ignored (sequence counter, as `useOrders`). The page calls it in `onMounted` and again on `visibilitychange` to visible (return to the tab). State dies with the page, so there is nothing to clear on sign-out (no `useMe.clear()` change) and nothing shared with `useOnHand`. Client-side only (no SSR fetch): first paint is the skeleton.
- **Components** (new): `InventoryTotalCard.vue` (Total on hand, owed row, shortage line) and `InventorySizeCard.vue` (dot, name, optional `UBadge` "Inactive size", trays, eggs, owed row, shortage / negative note). Both `UCard`; the dot uses the existing size colour helper (`app/utils/size-colors.ts`, as `ProductionDayCard`); loading = `USkeleton` in an `aria-busy` container; error = `UAlert` (error) with `UButton` Retry; empty = the existing empty-state pattern with a `UButton` to `/production`. Layout `grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` in a 1120px max-width container (one card per row on a 375px phone).
- **Shared helpers**
  - Trays + loose only through `formatQty`, with `eggsPerTray` from `useFarm()`; never a literal 30. **New** `formatQtySigned(eggs, eggsPerTray)` in `shared/utils/quantity.ts`: negative gives `'-' + formatQty(-eggs, ...)`, otherwise `formatQty`. Required because `formatQty` throws on a negative.
  - **New** pure `shared/utils/inventory.ts`: `inventoryTotals(sizes)` returns `{ onHandEggs, owedEggs }`, the plain sums of the rows shown (so AC3 holds exactly); `shortByEggs(onHand, owed)` = `max(owed - max(onHand, 0), 0)`. Using `max(onHand, 0)` keeps "Short by" within what is owed; a negative on-hand gets its own note (AC13). The Total card applies the same function to the totals.
  - Egg-count line: `Intl.NumberFormat` + " eggs on hand" ("egg" for exactly 1, as `formatQty`); negative shows `-60 eggs on hand`.
  - Copy in `app/utils/inventory-copy.ts` (the pattern of the other `*-copy.ts` files), strings exactly as UX §2.5.
- **Accessibility / contrast** per UX §2.5 (text-muted, darker warning shade, icon plus words, cards as labelled groups).

### 3.5 Invariants at risk (CLAUDE.md)
| Rule | How the design protects it |
|---|---|
| Eggs are the unit; tray size is per-farm | The API returns eggs only. Trays appear only through `formatQty` / `formatQtySigned` with `useFarm().eggsPerTray`. |
| Inventory computed, never stored; one on-hand function | `get_inventory` **calls** `app.on_hand_json`; no stored figure, no second copy of the formula. Orders never enter on-hand; owed is a separate figure and is never subtracted (AC5, AC8). |
| Orders never touch stock; delivered-so-far is computed | `owed_by_size` only reads orders; delivered comes from non-voided sale lines (same definition as `order_delivered_eggs`), parity-tested against `order_json`. |
| Rejects never in inventory | `on_hand_json` restricts to `quality = 'good'`; `hasAny` looks at good production only. |
| Sizes are data | Sizes come from `public.sizes`; no hardcoded list; archived via `archived_at`. |
| Tenancy: server-derived tenant, RLS on, repository layer, invoker functions via `TenantDb.rpc` | `defineTenantHandler`; `db.rpc('get_inventory', {})` injects `p_tenant_id`; `assert_tenant`; no service key; the request carries nothing. |
| No personal data in logs / SSR / URL | No client data is read (orders and sales are read only as egg sums by size). Repository logs the SQLSTATE only. Fetched client-side. Page-local state: nothing survives sign-out. |
| Serverless limits | One short call, three aggregate scans on existing tenant-leading indexes; no pool, no long work. |
| Sales void-only, orders never deleted | Untouched (read-only feature). |

### 3.6 Tests
- **pgTAP** `supabase/tests/database/100_inventory.test.sql`: the PM's worked example exactly (Large 600 - 240 = 360, owed 300; Medium 300, owed 90 = 150 - 60 delivered; Small 0; Jumbo 90; total on hand 750; total owed 390); Cancelled, Fulfilled and Closed-short orders each contribute 0 (AC4); create / edit / confirm / ready / cancel leave every `onHandEggs` unchanged (AC5, AC11); deliver 4 trays of A lowers on-hand and owed together (AC10); void a sale returns the eggs, void the delivery returns it to owed; rejects never appear (AC7); a backdated sale gives the **true negative** (AC13); an archived size appears only when on-hand or owed is non-zero (AC14); `hasAny` false for an empty farm and for rejects only, true for production only and for sales only; `onHandEggs` equals `app.on_hand_json` for every size (AC12); **parity**: per size, the sum of `order_json(o).lines[].remainingEggs` over all orders equals `owedEggs`; cross-tenant: farm B's production, sales and orders change nothing in farm A's result (AC21); `anon` cannot execute `get_inventory`.
- **Vitest**: `inventory-repo.spec.ts` (rpc name, tenant arg dropped, bad shape gives 500, logs SQLSTATE only; like `sales-repo.spec.ts`), `inventory.spec.ts` (totals equal the sum of shown rows; `shortByEggs` incl. negative on-hand), `quantity.spec.ts` (+ `formatQtySigned`), `server-guards.spec.ts` (+ the route), `nav.spec.ts` if the subtitle changes. No privacy spec needed: the screen touches no client data.
- **Manual/QA**: AC22 (375px), AC23 (change eggs per tray, reload), AC18 (log a sale, return to Inventory: skeleton then fresh figures), AC20 (More > Inventory active state).

### 3.7 Tasks (ordered)
**Backend / contract first**
- [x] **[BE0, architect]** Stub the contract: `InventorySize` and `InventoryResponse` in `shared/types/api.ts`.
- [x] **[BE1]** Migration `supabase/migrations/20261007090000_inventory.sql`: `app.owed_by_size`, `app.inventory_json`, `public.get_inventory`, grants/revokes, comments (3.1). Then `bun run db:reset` and `bun run db:types`.
- [x] **[BE2]** pgTAP `100_inventory.test.sql` (3.6) with the `order_json` parity test and the negative / archived / `hasAny` cases; `010_rls_coverage` stays green.
- [x] **[BE3]** `server/repositories/inventory.ts` (`getInventory`, zod parse, SQLSTATE-only logging) and `server/api/inventory/index.get.ts` under `defineTenantHandler`; add the route to `tests/unit/server-guards.spec.ts`; `inventory-repo.spec.ts`.

**Frontend (can start against the 3.3 types now; needs BE3 for real data)**
- [ ] **[FE1]** `formatQtySigned` in `shared/utils/quantity.ts` and `shared/utils/inventory.ts` (`inventoryTotals`, `shortByEggs`) with unit tests.
- [ ] **[FE2]** `app/utils/inventory-copy.ts` (UX copy) and `app/composables/useInventory.ts` (page-local state, load on mount and on tab return, sequence guard).
- [ ] **[FE3]** `InventorySizeCard.vue` and `InventoryTotalCard.vue` (dot, "Inactive size" badge, owed row, "Short by", negative note, labelled groups, contrast).
- [ ] **[FE4]** `app/pages/inventory.vue`: skeletons, error + Retry, empty state with "Go to Production", Total card then size cards, footnote; verify at 375px and desktop, More > Inventory active state, no FAB; align `nav.ts` subtitle.

### 3.8 Decisions
**The PM's open questions (decided autonomously; owner to confirm on return)**
| # | Decision | Reason |
|---|---|---|
| 1 Sellable | **Dropped.** Total card shows Total on hand plus "Owed on open orders"; footnote rewritten. | Orders reserve nothing (settled), so a "Sellable" figure would contradict the rule and the Sale form's hint. **Design/spec conflict:** `docs/design` still shows Sellable and "Pending deliveries are reserved". |
| 2 Negatives | **True negatives shown** with the note; DB and API never clamp. `on_hand_json` can go negative (overridable shortfall, backdating, Edit/Delete day). | Clamping hides a data-entry problem; Sales already compares against the true figure. |
| 3 Archived sizes | **Server returns them only when on-hand <> 0 or owed > 0**, after the active ones. | The server owns the rule so the Total always equals the visible cards. |
| 4 Drill-down | **None in v1.** | Display only; Orders-filtered-to-Open needs a filter deep link the Orders contract doesn't have. |
| 5 Source of owed | **One server-side function**, `app.owed_by_size`, called by `get_inventory`, reusable by the Dashboard; same remaining rule as `order_json`, held in step by a parity test. | Set-based (no N+1) while `order_json` stays untouched. |
| 6 Freshness | **Load on open and on return to the tab; skeleton each time; no cache, realtime or polling.** | AC16/AC18: no stale numbers; page-local state has nothing to invalidate or clear. |
| 7 Pending card | **Omitted.** | Owed already sits in the Total card. |

**Other choices**
- **New `GET /api/inventory`, not `/api/sales/on-hand`.** Inventory needs size metadata, owed and `hasAny` in one round trip. Rejected: extending `get_on_hand` (Sales and Deliver depend on it) and composing three calls on the client (three round trips; totals could disagree across moments).
- **Payload carries size name / colour / order** rather than ids only. Rejected: joining to `useFarm().sizes` (can be stale, would show "Unknown size").
- **`hasAny` counts good production or non-voided sale lines** (PM wording: "no production logged at all"). A farm with sales but no production should show its negative figures, not "No inventory yet". A small, deliberate widening of AC15.
- **Short by = owed - max(onHand, 0)**, never more than what is owed; the negative note covers the rest.
- **No new index, view or table; nothing stored.**
- **Not done:** sharing code between `order_json` and `owed_by_size` (see 3.1).

**For the owner on return (not blocking):** update `docs/design` for UX deviations 1-3 (Sellable removed, footnote, negatives) and confirm the autonomous answers above.

---

## 4. Implementation notes

### [FE] (frontend-dev)
FE1-FE4 done. Built against the 3.3 types; not yet exercised against the live endpoint (backend in progress) and not checked in a browser at 375px/desktop (no dev server run).

- **FE1:** `formatQtySigned` added to `shared/utils/quantity.ts`; new `shared/utils/inventory.ts` (`inventoryTotals`, `shortByEggs`). Tests: `tests/unit/inventory.spec.ts` (totals, short-by incl. negative on-hand, signed format, copy strings, egg-line).
- **FE2:** `app/utils/inventory-copy.ts` (`INVENTORY_COPY`, `eggsOnHandLine`), `app/composables/useInventory.ts` (page-local, blanks data on each `load()`, sequence + farm guard).
- **FE3:** `app/components/InventorySizeCard.vue`, `InventoryTotalCard.vue` (UCard, UBadge, UIcon; labelled groups; icon + words for owed/short/negative; `text-warning-700` / `dark:text-warning-300` for warning text).
- **FE4:** `app/pages/inventory.vue` (skeleton with aria-busy, UAlert error + Retry, AppPlaceholder empty state with "Go to Production", Total then size grid 1/2/4 columns, footnote). Loads on mount and on `visibilitychange` to visible. `nav.ts` subtitle now "Live view, produced minus sold" (no nav test referenced it).
- **Decisions / deviations:** the empty state replaces the whole screen when `hasAny` is false. The Total card is capped at 720px wide and centred (design shows it centred). The Total card's second line is "{n} eggs" (the "on hand" suffix stripped from the size-card line). The Total card owed row always shows (0 trays when nothing owed), per UX. Contrast of the warning shades was chosen, not measured. Nuxt UI components used (UCard, UBadge, UAlert, UButton, USkeleton, UIcon) are the same ones already in use elsewhere in the app; props not re-checked against ui.nuxt.com this session.
- **Checks:** `bun run typecheck` clean, `bun run lint` clean, `bun run test:unit` 66 files / 1021 tests passed.

### [BE] (backend-dev)
BE1-BE3 done as designed. No contract change: `GET /api/inventory` returns `InventoryResponse` exactly as in 3.3.

- **BE1:** `supabase/migrations/20261007090000_inventory.sql` (`app.owed_by_size`, `app.inventory_json`, `public.get_inventory`, grants/revokes, comments). `bun run db:reset` and `bun run db:types` run; `get_inventory` is in `shared/types/database.types.ts`.
- **BE2:** `supabase/tests/database/100_inventory.test.sql` (40 tests): the PM's worked example (360/300/0/90, total 750, owed 300/90, total 390), cancelled / closed-short / fulfilled contribute 0, order create/confirm/ready/cancel leave on-hand byte-identical, delivery lowers on-hand and owed together, voiding a sale and a delivery, rejects ignored, true negative on-hand, archived size listed only with eggs (and after active sizes), `hasAny` for empty / rejects-only / sales-only / production, on-hand equals `app.on_hand_json`, parity with `app.order_json` remaining (after each state change), cross-farm (farm J's data changes nothing in farm I; TM006 on another farm's tenant id; anon cannot execute). `010_rls_coverage` and `020_tenant_isolation` unchanged and green (no new table).
- **BE3:** `server/repositories/inventory.ts` (`getInventory`, zod parse incl. `owedEggs >= 0`, SQLSTATE-only logging), `server/api/inventory/index.get.ts` (`defineTenantHandler`), route added to `tests/unit/server-guards.spec.ts`, `tests/unit/inventory-repo.spec.ts` (3 tests).
- **Small decisions:** an archived size cannot receive production (`production_bounds` refuses), so the "archived with eggs" test archives after producing, and the "archived at 0/0 is hidden" test uses a second farm.
- **Checks:** `bun run test:db` all 11 files PASS (1609 tests); `bun run test:unit` 1024 passed; `bun run typecheck` clean; `bun run lint` clean.

---

## 5. QA report (qa-reviewer)

**Verdict: PASS** (static and automated evidence; no browser run, so AC22/AC23/AC24 visuals are code-traced, not seen)

| AC | | Evidence |
|---|---|---|
| 1, 2, 3 | ✅ | `inventory_json` lists active sizes in `sort_order`, zero-filled; `formatQtySigned`/`formatQty` in cards; Total = `inventoryTotals` of shown rows. pgTAP worked example 360/300/0/90, total 750. |
| 4, 5, 10, 11 | ✅ | `owed_by_size` (open statuses only, minus non-voided linked sale lines); pgTAP covers cancelled/fulfilled/closed-short = 0, order changes leave on-hand identical, deliver/void. |
| 6 | ✅ | `shortByEggs` + "Short by" with icon and words (both cards); unit-tested. |
| 7 | ✅ | On-hand from `app.on_hand_json` (good only); pgTAP rejects test. |
| 8 | ✅ | No Sellable; footnote matches rule (`inventory-copy.ts`). |
| 9, 18 | ✅ | Computed live; `load()` blanks data, reloads on mount and visibilitychange. |
| 12 | ✅ | `inventory_json` calls `on_hand_json`; pgTAP equality test. |
| 13 | ✅ | No clamp; `formatQtySigned`; negative note in `InventorySizeCard.vue`. |
| 14 | ✅ | Archived kept only if on-hand<>0 or owed>0, ordered after active; pgTAP. |
| 15, 16, 17 | ✅ | `inventory.vue`: empty (hasAny false) with "Go to Production", skeleton with aria-busy, UAlert + Retry, no old numbers. |
| 19, 20 | ✅ | No controls except navigation; `APP_NAV` more-tab item, title "Inventory". Dashboard card tap-through N/A (card not built). |
| 21 | ✅ | invoker functions + RLS, `assert_tenant`; pgTAP cross-farm and TM006. |
| 22, 24 | ✅ (code) | grid-cols-1 on phone, `truncate` only on name, icon+words on all notes. Not viewed at 375px. |
| 23 | ✅ | `eggsPerTray` from `useFarm()`, no literal. |

**Blocking:** none. Tenant from server (`defineTenantHandler`, no input), repository via `TenantDb.rpc`, SQLSTATE-only logging, no service key, no new table, migration new, grants revoke public/anon.
**Should fix:** none.
**Notes:** (1) The page shows skeletons forever if `eggsPerTray` never resolves (no error state for that); low risk. (2) Warning-colour contrast (4.5:1) not measured. (3) Owner must update `docs/design` (Sellable, footnote, negatives).

**Tests run:** `bun run typecheck` clean; `bun run lint` clean; `bun run test:unit` 1024 passed; `bun run test:db` 11 files, 1609 tests, PASS (incl. 100_inventory, 010_rls_coverage, 020_tenant_isolation).
