# Feature: Invoice (printable page for one sale)

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want to open a sale and print it, or save it as a PDF, as a clean invoice with its sale number, so that I can hand or send the customer a proper record of what they got and at what price, without retyping anything.

**Why now / spec reference:**
- Sales (feature 04) already keep everything an invoice needs: sale number (the future invoice number), date, client, each line's eggs, frozen price per tray and line total, and the sale total (04 AC55-AC57). Orders (05) make deliveries into normal sales, so one invoice per delivery works with no extra rule.
- Product doc non-goals and §Deferred: a printable invoice for one sale is **not** deferred. Payment status, balances and statements stay out.
- Architecture spec, `sale_number`: "It becomes the invoice number in the invoice feature."
- `docs/design/source/template.html` has **no invoice or print design** (no print styles, no invoice screen). So the invoice is kept **minimal and plain**, built from the sale detail's fields in the app's existing visual language. UX should not invent branding. If the owner later supplies an invoice design, it replaces §2.5.

## 2. Acceptance criteria (PM)

**Entry and output**
- [ ] AC1 — A **Print invoice** action is available on a sale's detail (from Sales, and for a delivery made from an order). It is available for any sale, including voided ones (see AC12).
- [ ] AC2 — Choosing it shows a print-ready invoice for that one sale. The owner can then print it or save it as PDF with the browser's own print dialog; the invoice can also be opened with a single tap that starts the print dialog (no extra confirm step). Main path: sale detail to print dialog in at most 2 taps.
- [ ] AC3 — The app builds no PDF file itself and sends nothing by email or message. (Browser print/save-as-PDF only.)
- [ ] AC4 — When printed, the page shows only the invoice: no navigation bar, sidebar, bottom tabs, FAB, buttons, toasts or overlays. A single-sale invoice with up to 20 lines fits on A4 and US Letter (it may run to a second page only past about 12 lines, and then no line is split across pages).

**Content (every figure comes from the saved sale, nothing re-entered)**
- [ ] AC5 — Heading shows the farm name and the word "Invoice" with the sale number (for example "Invoice #1042"). The sale number is shown exactly as in the Sales list and detail, with no added prefix (see architect question 1).
- [ ] AC6 — Shows the sale date (the sale's own date, in a readable format) and the sale type ("Delivery" or "On-site").
- [ ] AC7 — Shows the client's name for a sale with a client. A client marked Inactive still shows its name. A rename since the sale shows the current name (04 AC63).
- [ ] AC8 — On-site sale with no client: the invoice shows no "Bill to" block and no placeholder like "null" or "undefined"; it may read "Walk-in sale" (copy is UX's call). It still prints with number, date and lines.
- [ ] AC9 — Each line shows size name, quantity, price per tray and line total. Quantity is shown in trays + loose eggs (for example "3 trays + 12 eggs") through the farm's eggs-per-tray, with the egg count alongside ("102 eggs"). Example with 30 per tray: 102 eggs reads "3 trays + 12 eggs (102 eggs)". Zero loose is shown without "0 eggs" clutter ("3 trays (90 eggs)"). Lines are in the same order as the sale detail.
- [ ] AC10 — Prices and totals are the **frozen** line values saved on the sale. If the farm later changes its tray size or currency, or a client's default price, or renames a size, reprinting an old sale keeps the same quantities (egg counts), prices and totals; only names show as current (04 AC55, AC63). The sale total equals the sum of the line totals, to the cent.
- [ ] AC11 — All money is shown in the farm's currency through the one price formatter (for example "₱1,250.00"), never a hand-typed symbol. The invoice shows the sale total prominently at the bottom.
- [ ] AC12 — A **voided** sale prints with a clear **VOID** mark (visible on the printed page, not colour-only, so it reads on a black-and-white printer). Its number, lines and figures still show, and it is never presented as a valid invoice. Print is still allowed for it.
- [ ] AC13 — The invoice shows **no** payment information: no "Paid"/"Unpaid" or "Amount due", no balance, no due date, no tax, no discount, no bank details. The total reads as "Total", not "Amount due".
- [ ] AC14 — The invoice shows no data that is not on the sale or the farm's name: no client phone, no client address (the app does not keep one), no farm address, tax number or logo (see Out of scope).

**Empty, error, loading**
- [ ] AC15 — While the invoice loads, a short loading state shows and the print dialog does not open until the content is complete (never a blank or partial printout).
- [ ] AC16 — A sale that does not exist, belongs to another farm, or was reached by a bad link shows a plain "Invoice not found" message with a way back to Sales, and does not reveal whether it exists in another farm.
- [ ] AC17 — If loading fails (network or server), a short error with **Try again** shows. Nothing is printed.
- [ ] AC18 — Signed-out users cannot see an invoice; they are sent to sign in, and after signing in the invoice does not remain cached on the device (client data is cleared on sign-out).

**Mobile and desktop**
- [ ] AC19 — On a phone (about 375 px wide) the invoice reads without sideways scrolling, with the Print button reachable one-handed and at least 44 px tall. Lines stay readable (size, quantity, price, total) at that width.
- [ ] AC20 — On desktop it shows the same content, centred on a page-width sheet, with a Back action.
- [ ] AC21 — The Print and Back controls are on screen only and do not appear in the printout (AC4).

**Privacy**
- [ ] AC22 — No client name, phone or any personal data appears in the address, query string, page title, or file name suggested by the browser's Save as PDF. The title and suggested file name use only the farm-neutral sale number (for example "Invoice 1042"). Opaque identifiers in the address are fine.
- [ ] AC23 — Client data is never written to server logs or error messages by this feature, and the invoice data is not included in the server-rendered page; it is fetched after the page loads (as for the client list).

**Derived numbers**
- [ ] AC24 — Viewing or printing an invoice changes nothing: no stock, inventory, dashboard, order status or sale figure moves, and the sale's data is not edited or locked. (Edit and Void keep working as in 04.)
- [ ] AC25 — Voiding a sale after printing changes what a reprint shows (it now carries VOID); the earlier paper copy is unchanged. Editing a sale's date or client (where 04 and 05 allow it) shows on the next print. No history of earlier prints is kept.

**Out of scope (for later, keep out of v1 invoice):**
- **Farm business details** on the invoice: address, phone, tax number, logo, footer notes, and the Settings fields to enter them. Candidate follow-up.
- Client address or delivery notes (feature 03 keeps only name, phone, default price).
- Invoice number prefix or format (for example "INV-"), and per-farm numbering settings.
- Payment status, amount due, balances, statements, receipts as proof of payment, tax, discounts, deposits, due dates (non-goals: accounts receivable).
- Generating or storing a PDF, emailing or messaging an invoice, sharing links, public or customer-facing pages (v1 has one internal user).
- One invoice covering several sales (a monthly statement, or all deliveries of one order). One sale = one invoice.
- A "printed" flag or print history; reprints are always from the current saved sale.
- Offline printing, multiple languages, multiple paper templates, bulk print.

## 2.5 UX design (UX)

No invoice design exists in `docs/design/`, so this is plain and uses the app's existing type, spacing and tokens. No logo, no colour branding.

### Flow
1. Sale detail (any sale, including voided): tap **Print invoice**. Tap 1.
2. Opens the dedicated page `/sales/:id/invoice` (opaque id only in the address). It shows the loading state, then the invoice.
3. When content is complete, the page starts the browser print dialog once. Print or Save as PDF there. Dialog open after **1 tap**.
4. After the dialog closes, the invoice stays on screen with **Print** (again) and **Back** (to the sale detail).

Main path: **1 tap** to the print dialog. Fallback: if the dev finds the automatic print is blocked (iOS Safari often blocks print not started by a tap), do not auto-print. The page shows the invoice and the owner taps **Print**, which is **2 taps** and still meets AC2. DEVIATION to flag: I chose auto-print on open as the default because it makes the main path one tap. The dev confirms on a real phone.

Entry points: a **Print invoice** button in the sale detail's action area (Edit, Void, Print invoice). The order detail's delivery rows open the same sale detail, so no extra entry.

### Layouts

Mobile (~375px, full-width sheet, no sideways scroll)
```
+---------------------------------+
| [<] Back                        |  UButton variant=ghost, 44px (screen only)
+---------------------------------+
|  Hilltop Egg Farm               |  farm name, text-lg bold
|  Invoice #1042                  |  text-2xl bold
|  [ VOID ]  (voided only)        |  UBadge outline + bordered text, see Print
|                                 |
|  Date      7 Oct 2026           |
|  Type      Delivery             |
|  Bill to   Aling Nena           |  hidden when no client
|  (or)      Walk-in sale         |
|---------------------------------|
|  Large                          |  one stacked block per line
|  3 trays + 12 eggs (102 eggs)   |
|  P420.00 / tray      P1,260.00  |  right: line total
|  ------------------------------ |
|  Medium  ...                    |
|---------------------------------|
|  Total               P2,310.00  |  text-xl bold
+---------------------------------+
| [ Print ]  (sticky bottom, 48px)|  UButton block, icon printer, screen only
+---------------------------------+
```
(Prices come from `formatPrice`; "P" above stands for the farm currency symbol.)

Desktop
```
+-----------------------------------------------+
| [<] Back to sale                    [ Print ] |  screen only, top right
|      +-----------------------------------+    |
|      | Hilltop Egg Farm                  |    |  sheet: max-w ~210mm, centred,
|      | Invoice #1042          [ VOID ]   |    |  white, border + subtle shadow
|      | Date 7 Oct 2026   Type Delivery   |    |
|      | Bill to  Aling Nena               |    |
|      | Size | Quantity | Price | Total   |    |  HTML table (UTable not needed)
|      | Large| 3 trays + 12 eggs (102 eggs)|   |
|      |                  Total  P2,310.00 |    |
|      +-----------------------------------+    |
+-----------------------------------------------+
```
Table columns: Size, Quantity, Price per tray, Line total. Totals right-aligned. Use a real `<table>` with `<th scope="col">`. On mobile the same markup restacks (CSS only), never scrolls sideways.

### Print layout and CSS notes
- `@media print`: hide app shell (sidebar, bottom tabs, FAB, header), Back, Print, toasts, overlays (use one `print:hidden` class on each). Page is black on white, no shadow, no border, no background colours; `@page { margin: 15mm }`, size left to the browser (A4 or Letter).
- Use the desktop table markup in print regardless of screen width. Font about 11-12pt, total 14pt bold.
- `tr { break-inside: avoid }` so no line splits; table head repeats (`thead { display: table-header-group }`). Up to 20 lines may run to a second page, with the Total row kept together with the last line (`break-inside: avoid` on the tfoot).
- VOID mark: a large word "VOID" (about 48pt, bold, 3px solid border, rotated -15 degrees, centred over the lines, uppercase text, grey outline is fine) plus the heading line "Invoice #1042 - VOID". Text and border, so it reads in black and white. Mark must not hide the figures: `opacity` only on the stamp background, text stays legible, and the numbers remain under it at normal contrast. Printing backgrounds must not be required.
- `document.title = "Invoice 1042"` (sale number only) so Save as PDF suggests that name. Restore the title on leaving the page.
- Total is shown as "Total". No payment, tax, discount or due date anywhere.

### States
| State | What shows |
|---|---|
| Loading | Back button and a skeleton sheet (`USkeleton` lines), text "Getting your invoice...". Print button disabled. Print dialog does not open. |
| Default | Invoice as above. |
| Voided | VOID mark plus a screen-only notice (`UAlert`, neutral, with icon): "This sale was voided. It is not a valid invoice." The notice does not print (the VOID mark does). |
| Walk-in (no client) | No "Bill to" block; the line "Walk-in sale" under Type. |
| Inactive client | Name shown, no extra label. |
| Not found | Centred message "Invoice not found" with button **Back to sales**. Same for other-farm or bad ids. |
| Server/network error | `UAlert` (error): "We couldn't load this invoice." with **Try again**. Nothing printed. |
| Signed out | Redirect to sign in (existing middleware). |
| Success | No toast. The print dialog is the feedback. |
| Print blocked/cancelled | Nothing; the page stays with **Print**. |

### Copy
- Sale detail button: **Print invoice**
- Page heading: farm name, then "Invoice #1042"
- Back: **Back** (to the sale detail); not-found: **Back to sales**
- Print button: **Print**
- Labels: "Date", "Type" (values "Delivery" / "On-site"), "Bill to", "Walk-in sale"
- Table heads: "Size", "Quantity", "Price per tray", "Total" (the last head is the line total; the footer row reads "Total")
- Quantity: "3 trays + 12 eggs (102 eggs)"; zero loose: "3 trays (90 eggs)"; under one tray: "12 eggs"; one tray: "1 tray (30 eggs)". Eggs are named in brackets only because AC9 asks for the count.
- Loading: "Getting your invoice..."
- Voided notice (screen): "This sale was voided. It is not a valid invoice."
- Not found: "Invoice not found" / "It may have been removed, or the link is wrong."
- Error: "We couldn't load this invoice. Check your connection and try again." / **Try again**
- Page title: "Invoice 1042"

### Quantity entry
None. Display only, through the shared trays + loose helper. Uses the farm's current eggs-per-tray; the stored egg counts never change.

### Accessibility
- Print, Back, Try again: at least 44px tall (Print 48px, sticky at the bottom on mobile, reachable one-handed).
- The sheet is semantic: `<main>`, `h1` = "Invoice #1042", `<table>` with column headers, `<dl>` for Date/Type/Bill to. Mobile stacked lines keep the same table semantics (or each line is a labelled group such as "Large: 3 trays, 12 eggs, P420 per tray, total P1,260").
- Voided status is text ("VOID", plus the screen notice), not colour alone; the alert has an icon and `role="status"`/`alert` for the error. Loading is announced with `aria-busy` and the text above.
- Contrast: print is black on white; on screen use the existing text tokens, at least 4.5:1, with no light grey for figures.
- No `inputmode` needed (no inputs).
- Focus moves to the page heading on load; it returns to Print after the dialog closes.

### Data the UI needs (for the architect)
- Farm name, eggs-per-tray, currency alongside the sale (sale lines already carry size name, eggs, frozen price and total; sale number, date, type, client name or none, voided flag).
- The invoice page must read it on the client after load (AC23), including after Try again.
- A "not found" result that looks identical for a missing and a cross-farm id.

### Flags for the PM / user
- Auto-print on open (1 tap) with a 2-tap fallback, described under Flow.
- Page-title note: the title and file name carry the sale number only (decided by the PM's default).
- No other deviations; no payment, tax, logo or address fields were added.

**Open questions for owner:** none (the owner is away; defaults below proceed).

**Open questions for the architect (recommended defaults, do not block design):**
1. **Invoice number format.** Default: show the plain sale number, "Invoice #1042", no prefix. A prefix is a later setting.
2. **Where it lives.** Default: a dedicated print-friendly page for one sale, opened from the sale detail, so the browser's print stylesheet and Save as PDF work reliably (an overlay prints poorly). Its address may hold the sale's opaque id only, never the client name or phone (AC22).
3. **Farm name on the invoice.** Default: the existing farm name (`tenants.name`, 1-100 chars), which is already in the app. If it must be editable first, that is the Farm settings feature, not this one.
4. **Which data call.** Default: reuse the existing single-sale read (`get_sale` returns everything an invoice needs per 04 AC57), plus farm name, eggs-per-tray and currency; no new stored data and no migration unless the architect finds a gap. Confirm that eggs-per-tray used for the "trays + loose" display is the farm's **current** setting (the line egg counts are stored, so only the display could shift if the tray size changed; AC10 requires egg counts to stay the same).
5. **Voided sales.** Default: printable, with a VOID mark (AC12). Alternative: block printing voided sales. Recommend allowing it so a corrected paper copy can be explained.
6. **Client name when the client is Inactive or later renamed.** Default: current name (matches 04 Q10 answer A). If the owner later wants invoices to reprint identically, names would have to be stored on the sale, which is a data migration. Flag but do not do now.
7. **Page-title and PDF file name.** Default: "Invoice 1042" so Save as PDF suggests a name with no personal data (AC22).
8. **Dates.** Default: the sale date only (deliveries already store the day the eggs left as the sale date), shown in the farm's usual readable format.

---

## 3. Technical design (Architect)

Designed 2026-10-07 (owner away; every PM/UX open question is decided here with a safe default, see 3.7). **No backend work and no migration**: every figure on the invoice already exists on the saved sale, the farm summary and the client list. All tasks are `[FE]`. No stub files were written.

### 3.1 Data
- **No migration, no new table, column, view or function.** Gap check against §2.5 "Data the UI needs":
  - **Sale** (number, date, type, `clientId`, voided flag, lines with `sizeId`, `eggs`, frozen `pricePerTray`, frozen `lineTotal`, and `saleTotal`): already returned by `get_sale` through `GET /api/sales/:id` (feature 04 §3.3, AC57). It returns voided sales too, and answers `null` (404) for a missing id and for another farm's id (RLS), so "not found looks identical" (AC16) is already met.
  - **Farm name, eggs-per-tray, currency, size names:** already in `me.farm` (`FarmSummary`, read through `useFarm()`). The farm name is not personal data and is already in the SSR payload today (the account menu), so it is **not** a privacy problem and needs no new call. (Rejected: a bundled `/api/sales/:id/invoice` returning the farm too: it would only duplicate `me.farm`.)
  - **Client name:** a sale carries `clientId` only (feature 04 AC60). The page joins the name in the browser from the client list that `useClients()` already fetches after mount (as `SaleDetail` does), so the name never rides on a sale response, `/api/me`, the SSR payload, the URL or a log. (Rejected: a `clientName` on the sale JSON, or an invoice endpoint returning it: it would put personal data in a new response and break feature 04's "a sale never carries a name" rule for no gain; the list holds at most 500 clients.) Inactive clients are in the list, so an inactive client's name shows (AC7).
- **Frozen vs current (AC10):** egg counts, `pricePerTray`, `lineTotal` and `saleTotal` print exactly as stored. Names (client, size, farm) are current. The only derived display is the "trays + loose" split of the stored egg count through the farm's **current** eggs-per-tray; the egg count in brackets always prints beside it as the fixed anchor (AC9). If a farm later changes its tray size, an old sale's split can change (90 eggs: "3 trays" at 30, "7 trays + 6 eggs" at 12) while price and total stay frozen. Accepted for v1; storing the tray size on the sale is a follow-up (3.8).
- **No stored invoice number:** the invoice number is `sales.sale_number` (per farm, database-assigned, never reused).

### 3.2 RLS
No change and no new table. Reads go through existing RLS-scoped routes (`get_sale` is `security invoker` and asserts `p_tenant_id = app.current_tenant_id()`).

### 3.3 Server API
**No new route**, so `tests/unit/server-guards.spec.ts` is unchanged. The page uses three existing ones:

| Call | When | Success | Errors the page handles |
|---|---|---|---|
| `GET /api/me` (through `useMe().ensure()`) | already loaded by the global middleware | `MeResponse` (`farm.name`, `eggsPerTray`, `currency`, `sizes`) | `me` in error state or no farm: error state with Try again (`ensure({ force: true })`) |
| `GET /api/sales/:id` | on mount, and Try again | `SaleResponse { sale: Sale }` | **404 `not_found`** and **400 `validation_failed`** (the id is not a UUID, a bad link) both show **Invoice not found** (identical, AC16). **401** is handled by `$api` (the session-expired flow, AC18). Anything else (network, 500, a reply of the wrong shape) shows the error state. |
| `GET /api/clients` (through `useClients().load`) | only when `sale.clientId !== null`, after the sale arrived | `ClientsResponse` | any failure, or a `clientId` missing from the list after a successful load, shows the error state. The invoice never silently falls back to "Walk-in sale" for a sale that has a client (AC8 is only for `clientId === null`). |

The only request input is the sale id in the path: never a `tenant_id`, no query string. Existing types are reused (`Sale`, `SaleResponse`, `SaleLine`, `FarmSummary`, `Client`, `ClientsResponse` in `shared/types/api.ts`). API responses are already `private, no-store` (`handlers.ts`) and the page HTML is `private, no-store` (`server/plugins/no-store.ts`), so an invoice is not cached and Back after sign-out shows nothing (AC18).

### 3.4 Frontend

**Route and files**
- New page `app/pages/sales/[id]/invoice.vue` (URL `/sales/:id/invoice`, default auth level `farm`, so signed-out users are redirected by the existing middleware, AC18).
- **Nuxt routing gotcha, do this first:** `app/pages/sales.vue` plus an `app/pages/sales/` directory makes `sales.vue` the **parent** route of the new page, and `sales.vue` has no `<NuxtPage />`, so the invoice would never render. Move the file: `git mv app/pages/sales.vue app/pages/sales/index.vue` (no content change; route name and path `/sales` stay). Two tests read it by path and must be updated: `tests/unit/sales-privacy.spec.ts` (about line 46) and `tests/unit/orders-screen-privacy.spec.ts` (about line 50): change `'app', 'pages', 'sales.vue'` to `'app', 'pages', 'sales', 'index.vue'` (and the `'app/pages/sales.vue'` name in any expected list). Code comments that say `sales.vue` may stay.
- New layout `app/layouts/invoice.vue`: `<div class="min-h-svh bg-muted print:min-h-0 print:bg-white"><slot /></div>`; the page sets `definePageMeta({ layout: 'invoice' })`. This is **instead of** `print:hidden` on every shell part: the shell (sidebar, top bar, bottom tabs, FAB, More sheet) never renders on this page, so nothing can leak into the printout (AC4). The layout holds no farm data and no `primaryAction`.
- `app/app.vue` (toaster): a toast raised on the previous screen (an error toast with `duration: 0`, for example) survives navigation and would print. Add `print:hidden` to the toaster `ui.viewport` in every branch, and treat the invoice layout as having no tab bar (`hasTabs = ... && route.meta.layout !== 'invoice'`) so a toast cannot cover the sticky Print button.
- `app/assets/css/main.css`: add a plain `@page { margin: 15mm; }` (page size left to the browser, A4 or Letter).
- `app/components/InvoiceSheet.vue`: **presentational only** (prop: an `InvoiceView`, below). Renders `<main>` > the sheet: farm name (`text-lg font-bold`), `<h1>` "Invoice #1042" (" - VOID" appended in the heading when voided), the VOID stamp, a `<dl>` (Date, Type, then Bill to **or** the plain "Walk-in sale" line), and a real `<table>` (`<th scope="col">`: Size, Quantity, Price per tray, Total) with a `<tfoot>` Total row.
  - **Colours:** the sheet uses explicit `bg-white text-neutral-900` (muted text `text-neutral-700`), not theme tokens. The app follows the system dark mode, and a dark-mode printout would otherwise be light text on white paper (browsers do not print backgrounds). The sheet is always black on white, on screen and in print; the page around it keeps the normal tokens.
  - **Responsive, no sideways scroll (AC19):** one table restacked with CSS only. Below `sm`, `table/thead/tbody/tr/td` are `block` (head `sr-only`) and each `td` shows its `data-label` through a `before:` pseudo-element. From `sm`, and **always in print** (`print:table`, `print:table-header-group`, `print:table-row-group`, `print:table-row`, `print:table-cell`, label pseudo-elements `print:before:hidden`), it is the normal table. Print never depends on the viewport width.
  - **Print classes:** `print:shadow-none print:border-0 print:max-w-none`; `tr` `break-inside-avoid`; `thead` `print:table-header-group` (repeats on page 2); `tfoot` `break-inside-avoid`; total row `text-xl font-bold` on screen and 14pt bold in print; body about 11.5pt in print.
  - **VOID stamp (AC12):** an `aria-hidden="true"` element with the text "VOID" (uppercase, bold, about 48pt, 3px solid border, `rotate(-15deg)`, centred over the lines, `pointer-events-none`, translucent text and border, no background so the figures stay readable and no "print backgrounds" is needed). Text plus border, so it reads on a black-and-white printer. The heading carries " - VOID" as real text for screen readers. The stamp is inside the sheet, so it prints; the screen-only `UAlert` is not in the sheet.
- `app/pages/sales/[id]/invoice.vue` (**owns** state, Print, Back, title, focus): reads `useRoute().params.id`, calls `useInvoice(id)`, renders by `state.status`:
  - `loading`: Back, `USkeleton` lines in a sheet-shaped box, text "Getting your invoice...", `aria-busy="true"`, Print disabled.
  - `ready`: a screen-only bar (desktop: Back left, Print right, `print:hidden`), a `UAlert` (neutral, icon, `print:hidden`) for a voided sale, `InvoiceSheet`, and on phones a **fixed bottom bar** with the Print button (`UButton block size="xl"`, `icon="i-lucide-printer"`, `min-h-12`, `print:hidden`, `pb-[env(safe-area-inset-bottom)]`; the sheet gets bottom padding to clear it). From `md` the Print button sits top right and the bar is not fixed. Print calls `window.print()` directly inside the click handler.
  - `not_found`: `AppPlaceholder` "Invoice not found" / "It may have been removed, or the link is wrong." with **Back to sales** (`to="/sales"`).
  - `error`: `UAlert color="error"` (`role="alert"`) "We couldn't load this invoice. Check your connection and try again." with **Try again** (`min-h-11`) and Back.
  - **Back** (screen only, 44px): `useDetailStack().handoffTo({ kind: 'sale', id }, '/sales')`. `sales/index.vue` already takes a `sale` handoff on mount and reopens that sale's detail, so Back lands on the detail the owner came from (the detail is an overlay with no URL). "Back to sales" on not-found is a plain `to="/sales"`.
  - **Title (AC22):** `useHead({ title: computed(() => view ? invoiceTitle(view.number) : 'Invoice') })`. No " · Tamago" suffix, no client name. Unhead removes it when the page unmounts, so the previous title returns by itself.
  - **Focus:** after `ready`, focus the `<h1>` (`tabindex="-1"`, `preventScroll`); on `afterprint` (VueUse `useEventListener(window, 'afterprint', ...)`) focus the Print button.
  - **No SSR data:** load only in `onMounted` (never `useAsyncData`/`useFetch`), so the server renders the loading shell and the HTML never holds a sale or a client (AC23).
- `app/composables/useInvoice.ts` (one owner of the load) returns `{ state, load, retry }`. `state` is a **local `shallowRef`**, deliberately **not** `useState`: nothing goes into the SSR payload or storage, and nothing outlives the page or sign-out (AC18; the client list it reads is already dropped by `useMe().clear()`).
  ```ts
  type InvoiceState =
    | { status: 'loading' }
    | { status: 'ready', sale: Sale, clientName: string | null }   // null only when sale.clientId === null
    | { status: 'not_found' }
    | { status: 'error' }
  ```
  `load()`: bump a local `seq` (a slower earlier call, or a second tap on Try again, is dropped); `await useMe().ensure()` and require `me.farm`; `GET /api/sales/:id` (404 or 400 gives `not_found`, anything else `error`; also treat a reply whose `sale.lines` is not a non-empty array as `error`); if `sale.clientId`, `await useClients().load({ silent: hasList })`, which must resolve `'ok'` (`'stale'` means the farm changed, drop it; `'error'` gives `error`), then find the client by id (missing gives `error`). Never logs, never throws into the page.
- `app/utils/invoice-view.ts` (pure, unit-tested): `buildInvoiceView(sale, ctx)` returns an `InvoiceView` (all strings already formatted) from `ctx = { farmName, clientName, eggsPerTray, sizeName(id), formatPrice(n) }`:
  ```ts
  interface InvoiceView {
    farmName: string
    number: number                // sale.saleNumber, shown as `#${number}`
    voided: boolean               // sale.voidedAt !== null
    dateText: string              // formatFullDate(sale.saleDate)
    typeText: 'Delivery' | 'On-site'
    billTo: string | null         // null = no "Bill to" block
    walkIn: boolean               // clientId === null: shows "Walk-in sale"
    lines: { size: string, quantity: string, price: string, total: string }[]   // sale.lines order, as the detail
    total: string                 // formatPrice(sale.saleTotal)
  }
  ```
  `quantity` = `formatQtyWithEggs(line.eggs, eggsPerTray)`, `price` = `formatPrice(line.pricePerTray)`, `total` = `formatPrice(line.lineTotal)`. It prints the saved line numbers and never recomputes a total from price and eggs. It also exports `invoiceTitle(n)` (`Invoice ${n}`) and `invoiceHeading(n, voided)`.
- `app/utils/invoice-copy.ts`: `INVOICE_COPY` with the §2.5 Copy strings (Print invoice, Back, Back to sales, Print, Date, Type, Bill to, Walk-in sale, table heads, Total, loading, voided notice, not found, error, Try again).
- **Shared helpers (the "one place" rule):**
  - **`shared/utils/quantity.ts`: add `formatQtyWithEggs(eggs, eggsPerTray, locale?)`**, built on `splitEggs`. It is the invoice's own format (AC9), because `formatQty` deliberately writes the loose part with no unit ("3 trays + 12"). Rules: no whole tray gives "12 eggs" / "1 egg" / "0 eggs" (no bracket, it would repeat itself); zero loose gives "3 trays (90 eggs)" / "1 tray (30 eggs)"; otherwise "3 trays + 12 eggs (102 eggs)" and "1 tray + 1 egg (31 eggs)". Thousands separators as `formatQty`. No tray size hardcoded. `formatQty` itself is unchanged.
  - **`app/utils/day-label.ts`: add `formatFullDate(date)`** (UTC-safe like its siblings): "Oct 7, 2026", always with the year.
  - Prices only through `useFarm().formatPrice` (the one `formatPrice`); size names through `useFarm().sizeById`.
- **Entry point, `app/components/SaleDetail.vue`** (UX did not place it; I checked the built component and the UI spec). Today the detail's footer has Edit only for a live sale, nothing for a voided sale, and only "Open in Sales" when read-only (a sale opened from the Orders screen). Add **Print invoice** to all three, as a `UButton` link (`:to="`/sales/${sale.id}/invoice`"`, no emit, so `sales/index.vue` owns nothing new): `color="neutral" variant="outline" size="xl" icon="i-lucide-printer" class="min-h-11 flex-1 justify-center"`, label `INVOICE_COPY.printInvoice`.
  - live sale: footer row = **Edit** + **Print invoice** (two equal buttons). Void stays the ghost row above, as today.
  - **voided** sale: the footer (hidden today when `voidedAt` is set) now shows **Print invoice** alone (AC1, AC12).
  - **read-only** (a delivery opened from an order): footer row = **Print invoice** + **Open in Sales**. It is navigation, not a change, so it is allowed read-only (AC1).
  Flow: sale detail, tap Print invoice (1), tap Print (2). The row menu gets no extra entry in v1.
- **Nuxt UI v4 components:** `UButton`, `UAlert`, `USkeleton`, and the existing `AppPlaceholder`. A plain `<table>` for the lines (UTable not needed, per UX).

**Privacy (CLAUDE.md, AC22, AC23):** the address holds only the opaque sale id (no name, phone or query string); the title is `Invoice {number}`; the client list stays in `useState('clients:state')` (cleared on sign-out) and the invoice's own state is a local ref; no `useAsyncData`/`useFetch`, `localStorage`, `sessionStorage`, `useCookie`, `console.*`, and no `useHead`/`navigateTo` containing a name in the new files; no server code, so nothing is logged server-side; error copy never repeats a name or an amount.

### 3.5 Invariants at risk
| Rule | How the design protects it |
|---|---|
| Client personal data never in logs, URL, `/api/me`, SSR payload, titles; cleared on sign-out | No new server code or response. Name joined in the browser from the client list fetched after mount. Local state only (not `useState`). Title and file name are `Invoice {number}`. A static guard test covers the new files (task 9). |
| Every route wrapped in `defineAuthedHandler`/`defineTenantHandler` | No new route; the guard test is unchanged. |
| Tenant derived on the server; RLS on | Reads only existing RLS-scoped routes; the path id is the only input; a missing id and another farm's id both give 404, and the page shows one "Invoice not found". |
| Eggs are the stored unit; eggs-per-tray never hardcoded; one conversion helper | `formatQtyWithEggs` lives in `shared/utils/quantity.ts` beside `formatQty` and uses `splitEggs`; the tray size comes from `useFarm()`. A test covers a non-30 tray size. |
| Frozen prices; a line total never recomputes | The view builder prints `pricePerTray`, `lineTotal` and `saleTotal` as stored; a test with a different tray size and currency asserts the same figures. |
| One `formatPrice`; no typed symbol; never convert on a currency change | `useFarm().formatPrice` only; the guard test greps the new files for a currency symbol literal. |
| Sales never deleted, voided kept; no sale status | Read-only (viewing changes nothing, AC24, AC25); a voided sale prints VOID text; no status, payment, "Paid" or due date anywhere. |
| Sizes per farm, never hardcoded | Names via `sizeById`; archived sizes still resolve. |
| Nothing long-running in handlers | No server work at all. |

### 3.6 Tasks (ordered; all `[FE]`, no backend work is needed)
- [x] 1. `[FE]` Shared helpers and tests: `formatQtyWithEggs` in `shared/utils/quantity.ts` (cases 102@30, 90@30, 30@30, 12@30, 1, 0, 31@30, a 12-per-tray farm, 1,200 trays) and `formatFullDate` in `app/utils/day-label.ts`; extend `tests/unit/quantity.spec.ts` and `tests/unit/day-label.spec.ts`.
- [x] 2. `[FE]` Routing prerequisite: `git mv app/pages/sales.vue app/pages/sales/index.vue`; update the two test paths named in 3.4; run `bun run test:unit` and confirm `/sales` still loads.
- [x] 3. `[FE]` `app/utils/invoice-copy.ts` and `app/utils/invoice-view.ts` (`buildInvoiceView`, `invoiceTitle`, `invoiceHeading`) with `tests/unit/invoice-view.spec.ts`: lines in sale order; frozen figures kept when tray size or currency differ; total equals the sum of line totals to the cent; walk-in (no Bill to); inactive client; voided heading; title is exactly `Invoice 1042` and never contains the client's name; archived or unknown size name.
- [x] 4. `[FE]` `app/composables/useInvoice.ts` (state machine in 3.4) with a unit test of its mapping rules (404 and 400 give not_found, client missing gives error, a stale call is dropped), mocking `$api` and `useClients`.
- [x] 5. `[FE]` `app/layouts/invoice.vue`; `app.vue` toaster (`print:hidden` in every branch, no tab-bar offset for the invoice layout); `@page { margin: 15mm; }` in `main.css`.
- [x] 6. `[FE]` `app/components/InvoiceSheet.vue` (semantic markup, always black on white, restacking table, print classes, VOID stamp) per 3.4.
- [x] 7. `[FE]` `app/pages/sales/[id]/invoice.vue`: the five states, Print (`window.print()` inside the click), Back (`handoffTo`), title, focus handling, load in `onMounted` only.
- [x] 8. `[FE]` `SaleDetail.vue`: add **Print invoice** to the live, voided and read-only footers (3.4).
- [x] 9. `[FE]` Privacy guard: extend `tests/unit/sales-privacy.spec.ts`'s file list with `Invoice*.vue`, `useInvoice.ts`, `invoice-*.ts` and the invoice page, and add invoice-specific assertions: no `useAsyncData`/`useFetch`/`$fetch` at setup level, no storage, cookie or `console`, no currency symbol literal, no `useHead` title built from a client name, and `window.print` only inside a click handler (never in `onMounted`).
- [ ] 10. `[FE]` Manual verification, recorded in §4: Chrome and Firefox print preview on A4 and Letter (shell absent, buttons absent, black on white, also with the OS in dark mode); a 20-line sale runs to a second page with no split line and the Total kept with the last line; a voided sale printed in black and white shows VOID and the heading suffix; at 375px there is no sideways scroll and Print is 48px; **Print on a real iPhone (Safari) opens the dialog from the tap**; sign out then Back shows nothing; a bad id and another farm's id show the same "Invoice not found".

### 3.7 Decisions
| # | Decision | Why (one line) | Rejected |
|---|---|---|---|
| D1 (PM Q1) | Show the plain sale number, "Invoice #1042", no prefix. | A prefix or numbering setting is a later feature; the number is already unique per farm. | "INV-" prefix; a per-farm format setting. |
| D2 (PM Q2) | Dedicated page `/sales/:id/invoice`, opaque id only. | Browser print and Save as PDF work reliably on a page and badly on an overlay. | Printing from the detail overlay. |
| D3 (PM Q3) | Farm name is the existing `tenants.name` from `me.farm`. | Already in the app and the SSR payload; editing it is the Farm settings feature. | A name field or call added here. |
| D4 (PM Q4) | Reuse `get_sale` and `me.farm`; no migration, no route. The tray split uses the farm's **current** eggs-per-tray, with the egg count printed beside it. | Nothing is missing; egg counts, prices and totals are frozen, so only the split can shift. | A bundled invoice endpoint; storing the tray size on the sale (follow-up). |
| D5 (PM Q5) | Voided sales are printable, with a text VOID mark. | Lets the owner explain a corrected paper copy; AC12 already forbids passing it off as valid. | Blocking print of voided sales. |
| D6 (PM Q6) | Current client name, also for an Inactive client. | Matches the owner's answer (feature 04 Q10 A); storing names on the sale would copy personal data. | Snapshotting the name on the sale. |
| D7 (PM Q7) | Title and file name `Invoice 1042`. | No personal data in a file name. | Client or farm name in the title. |
| D8 (PM Q8) | Sale date only, always with the year: "Oct 7, 2026". | A document needs the year, and the app already writes dates US-style, not "7 Oct 2026". | The list's year-less "Oct 7"; a created-at date. |
| D9 (UX deviation) | **No auto-print.** **Print** is the primary action; a tap calls `window.print()`. Main path: Print invoice, then Print. | iOS Safari only opens print from a tap, and printing after an async load is unreliable or blocked there; a visible button never fails, and I cannot test on a phone while the owner is away. | Auto-print on load, even with a fallback. |
| D10 | AC2's "single tap that starts the print dialog" is met as "at most 2 taps" (the same AC's explicit main path), not 1. | Follows D9. | Opening the dialog on page load. |
| D11 | Back returns to the sale's detail through the existing `handoffTo({ kind: 'sale' }, '/sales')`. | The detail is an overlay with no URL, so history Back would land on the bare list. | `router.back()`. |
| D12 | **Print invoice** is also on the voided and read-only (from Orders) details. | AC1 asks for any sale and for deliveries made from an order; UX's footer hid it for both. | Only live sales; a second entry on the order screen. |
| D13 | The client name is joined in the browser from `useClients()`; a sale with a client whose name cannot be resolved is an **error**, never "Walk-in sale". | Printing an invoice that wrongly shows no client is worse than asking to retry. | Reusing the detail's fallback to "Walk-in". |
| D14 | A new `invoice` layout, instead of `print:hidden` on each shell part. | The shell never renders, so nothing can leak; one place to get right. | Hiding sidebar, bars, FAB and More sheet one by one. |
| D15 | The sheet is always black on white (explicit colours, not theme tokens). | Dark mode would print light text on white paper. | Theme tokens (UX said "existing tokens"); they stay for the page around the sheet. |
| D16 | Move `pages/sales.vue` to `pages/sales/index.vue`. | A sibling `sales/` folder turns `sales.vue` into a parent route that has no `<NuxtPage />`. | A `definePageMeta({ path })` override from another folder (nesting depends on the file path, uncertain); a URL different from UX's. |
| D17 | Do not print the "From order #N" reference. | In no AC and not on UX's layout; it is an internal reference (feature 04 AC56 left the choice here). Possible follow-up. | Printing the order number. |
| D18 | `formatQtyWithEggs` is a new shared helper next to `formatQty`; `formatQty` is unchanged. | AC9's format ("3 trays + 12 eggs (102 eggs)") differs from the screens' R1 format on purpose; one tested place, same `splitEggs`. | Building the string in the component. |

### 3.8 Open questions / flags for the owner
- **Print takes two taps, not one (D9, D10).** If the owner wants one tap, a dev can add auto-print only after confirming it on a real iPhone; recommended not to.
- **A tray-size change and old invoices (D4).** The tray split can differ from an earlier printout if eggs-per-tray changes; egg counts, prices and totals never change. If that matters, the follow-up is to store eggs-per-tray on each sale (a migration with a backfill from the current setting), not part of this feature.
- **Farm business details stay out (§2).** The farm name cannot be edited in v1 unless the Farm settings feature adds it; confirm the existing name is the one to print.
- **Back from an invoice opened from the Orders screen** returns to the Sales detail, not to the order (D11).

## 4. Implementation notes (Devs)
- [BE] none expected (no backend work in this feature)
- [FE] Tasks 1-9 done; task 10 only partly checked (see below).
  - **Files:** `shared/utils/quantity.ts` (`formatQtyWithEggs`), `app/utils/day-label.ts` (`formatFullDate`), `app/utils/invoice-copy.ts`, `app/utils/invoice-view.ts` (`buildInvoiceView`, `invoiceTitle`, `invoiceHeading`), `app/utils/invoice-load.ts` (pure `resolveInvoice`), `app/composables/useInvoice.ts`, `app/layouts/invoice.vue`, `app/components/InvoiceSheet.vue`, `app/pages/sales/[id]/invoice.vue`; edited `app/app.vue` (toaster `print:hidden`, invoice layout has no tab offset), `app/assets/css/main.css` (`@page`), `app/components/SaleDetail.vue` (Print invoice link on the live, voided and read-only footers). `app/pages/sales.vue` moved to `app/pages/sales/index.vue` (git mv, no content change).
  - **Tests:** `tests/unit/quantity.spec.ts`, `day-label.spec.ts`, new `invoice-view.spec.ts` (view builder and load rules), `sales-privacy.spec.ts` (new invoice guard block; path update), `orders-screen-privacy.spec.ts` (path update). typecheck, lint, test:unit (68 files, 1053 tests) green.
  - **Deviations (small):** (1) the state-mapping logic of task 4 lives in a pure `app/utils/invoice-load.ts` (`resolveInvoice`) so it is tested with fakes; `useInvoice` is a thin wrapper that adds the stale-call `seq`. The "stale call is dropped" rule sits in the composable and is not unit-tested. (2) The `sales-privacy` guard's invoice list is a separate describe block, so the invoice files are not in `appSalesFiles`. (3) On a voided sale the detail footer shows Print invoice alone, as designed. (4) The loading state keeps the Print button visible but disabled; not-found hides it. (5) Nuxt UI components used: UButton, UAlert, USkeleton, plus AppPlaceholder; all are already used elsewhere in the app, and I did not re-fetch the v4 docs this session (the `UAlert` `actions` prop and `USkeleton` are the v4 API as used in existing screens; `UAlert actions` was not found elsewhere, verify in the browser).
  - **Task 10, checked:** dev server starts; `/sales/<uuid>/invoice` resolves and redirects to `/login?redirect=...` when signed out (AC18). **Not checked** (no sign-in available while the owner is away, no browser): the rendered page at 375px and desktop, print preview (A4/Letter, dark mode, 20-line second page, VOID in black and white), Print on a real iPhone, sign-out then Back, bad id versus other-farm id. These need a QA/browser pass.

## 5. QA report (QA)
**Verdict:** PASS (QA 2026-10-07, one small defect fixed in place; see Findings). Status stays `designed` per caller; set to `done` on merge.

**Environment.** Local Supabase stack + `bun run dev`; two farms provisioned (`QA Farm A`, `QA Farm B`, test accounts qa-a/qa-b@example.com). Driven with headless Edge over the DevTools protocol (real sign-in, real API seeding: 20 sizes, a client, delivery, on-site, 20-line and voided sales), at 375px (mobile emulation) and 1280px, with print media emulation and `Page.printToPDF` (A-size output read back).

| AC | Result | Evidence |
|---|---|---|
| AC1 | ✅ | `SaleDetail.vue` footers (live, voided, read-only) all have Print invoice; browser: opened a live sale's detail, link `/sales/<id>/invoice` present; voided + read-only traced in diff |
| AC2 | ✅ | Detail to invoice (tap 1), Print button calls `window.print()` in click (`invoice.vue:49`), tap 2. D9/D10 (no auto-print) is the documented deviation; "at most 2 taps" met |
| AC3 | ✅ | No PDF/email code in the diff |
| AC4 | ✅ | `invoice` layout has no shell; print PDFs contain only the invoice; Back/Print/alert are `print:hidden`; toaster `print:hidden` (`app.vue`). 20 lines: 2 pages, no split row, thead repeats |
| AC5 | ✅ | "QA Farm A" + "Invoice #6" (browser text dump) |
| AC6 | ✅ | "Oct 7, 2026", "Delivery"/"On-site" |
| AC7 | ✅ | "Bill to Aling Nena Test"; client list joined in browser (`invoice-load.ts:42-44`); inactive resolves from the same list (not browser-tested) |
| AC8 | ✅ | On-site sale: no Bill to, "Walk-in sale", no null/undefined |
| AC9 | ✅ | "3 trays + 12 eggs (102 eggs)", "4 trays (120 eggs)", "4 trays + 1 egg (121 eggs)"; unit tests in quantity.spec/invoice-view.spec |
| AC10 | ✅ | `invoice-view.ts:40-46` prints stored `pricePerTray`/`lineTotal`/`saleTotal`, no recompute; unit test with other tray size/currency |
| AC11 | ✅ | Prices via `useFarm().formatPrice` ("₱1,429.70"); privacy guard greps for symbol literals; Total at bottom |
| AC12 | ✅ | Voided: heading "Invoice #9 - VOID", VOID stamp text+border in the printed PDF (figures still readable under it), screen notice hidden in print |
| AC13 | ✅ | No payment/tax/due text in page output |
| AC14 | ✅ | Only farm name, sale fields, client name shown; no phone (verified in page text and SSR HTML) |
| AC15 | ✅ | Loading shell + disabled Print until `ready`; nothing auto-prints |
| AC16 | ✅ | Bad id, nonexistent uuid and farm B's sale id opened as farm A: identical "Invoice not found / Back to sales" text |
| AC17 | ⚠️ not browser-tested | Error branch traced (`invoice-load.ts`, `invoice.vue:140-149`); unit-tested mapping. `UAlert :actions` not exercised in a browser (dev flagged it) |
| AC18 | ✅ | Signed-out (cookies cleared) redirects to `/login?redirect=/sales/<id>/invoice`; invoice state is a local `shallowRef`; no storage use (guard test) |
| AC19 | ✅ | 375px: `scrollWidth == clientWidth` for all four sales; Print button measured 48px, fixed bottom bar |
| AC20 | ✅ | 1280px: same content on centred sheet with Back |
| AC21 | ✅ | PDFs show no buttons |
| AC22 | ✅ | URL has only the uuid; `document.title` = "Invoice 6" (no name) |
| AC23 | ✅ | SSR HTML of the invoice URL contains no client name/phone/farm name; load only in `onMounted`; no server code added |
| AC24 | ✅ | Read-only GETs only |
| AC25 | ✅ | Reprint reads the current sale (voided sale prints VOID) |

**Routing.** `sales.vue` to `sales/index.vue`: `/sales` renders and lists sales; opening a detail, Print invoice navigates to `/sales/<id>/invoice` (title "Invoice 8"); Back returns to `/sales` with the detail dialog reopened and the title restored ("Sales · Tamago"). `[...slug].vue` catch-all did not intercept.

**Findings**
- Blocking: none.
- Should fix (FIXED by QA): `InvoiceSheet.vue` `<tfoot>` used `print:table-footer-group`, which browsers repeat on every printed page. A 20-line sale printed the grand Total after line 16 on page 1 and again on page 2, so page 1 looked like a finished invoice with the wrong-looking total. Changed to `print:table-row-group` (`InvoiceSheet.vue:136`); re-printed: Total appears once, at the end, with the last lines on page 2. Page 1 now ends mid-table with no total (as intended).
- Notes:
  - On a phone the VOID stamp overlaps the first line's figures (translucent, readable, screen only; printing uses the desktop table).
  - "Keep Total with the last line" is not guaranteed: if the last line ends a page, Total could start the next one alone. Low risk (needs exactly a full page).
  - Not verified: real iPhone/Safari print from the tap; Firefox and Letter paper (Edge/Chromium PDF only, A-size default page); OS dark mode (the sheet uses explicit light colours and printed white in emulation, but the OS setting was not toggled); a physical black-and-white printout (stamp is text plus border); an Inactive client's name rendered in the browser; the error/Try again branch in a browser; the read-only (from Orders) footer in a browser; the stale-call `seq` guard (not unit-tested, per dev note); the "focus moves to heading / back to Print after the dialog" behaviour.

**Tests run (after the fix):** `bun run typecheck` clean; `bun run lint` clean; `bun run test:unit` 68 files, 1053 tests passed; `bun run test:db` 11 files, 1609 tests, PASS (isolation test included; no schema change, no new table). Test data left in the local DB (farms QA Farm A/B).
