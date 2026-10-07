# Feature: Sales (log a sale or delivery order, mark delivered, review, correct)

**Status:** done (shipped as written). **Revised 2026-10-03 by feature 05** (`05-orders.md`): the Pending-dependent criteria are tagged SUPERSEDED/REVISED in §2 and take effect when 05 ships.
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want to log a sale as one order (who it's for, the date, and every size I'm selling with its trays and price) from my phone in a few taps, either a delivery I owe a customer or an on-site (walk-in) sale, so that a customer who takes Large and Medium is one entry with one number, not two, and I stop tracking who ordered what in my head and on paper.

As the farm owner, I want each sale to get its own sale number, so that I can refer to a sale ("#1042") and, in a later feature, print it as an invoice with that number.

**[SUPERSEDED by feature 05: Pending/Mark delivered is replaced by orders and Deliver. The next two stories (mark delivered; filter to pending and delete) are kept for history.]** As the farm owner, I want to mark a delivery delivered when the eggs leave the farm, telling the app the date, so that the "still owed" list stays true and my stock drops for every size in the order at the moment the eggs actually go.

As the farm owner, I want to see my sales newest first, filter them to what's still pending or to one customer, open a sale to see all of its lines, and fix or remove a sale I logged wrongly, so that I can answer "what do I still owe, and to whom?" and trust the numbers behind the stock figures.

**Why now / spec reference:**
- Product goal 3, "Track sales and deliveries in one place, including what's pending vs. delivered, and per-customer history", and goal 5, "Trust the numbers" (past sales don't change when prices or tray sizes do). Sales is the last link of the production → inventory → sales loop; Inventory and the Dashboard both read from it (product doc §3, §4, §7).
- Screen and flows: `docs/egg-farm-app-ui-spec.md` §5 (Sales: list 5a, add/edit 5b, mark delivered 5c), §8 (quantity input, status chip, fulfillment toggle, client selector), §9 Flows B, C, D and G. **The UI spec and architecture spec describe a sale as one row with one size. Owner decision Q1 (2026-09-27) changes that: a sale is an order with a header and one or more lines** (see SL15). The architect must update both specs.
- Data rules: `docs/egg-farm-app-architecture-spec.md` "Sales (absorbs Deliveries)", "Inventory", "Clients". `CLAUDE.md` "Units and data model": sales cover deliveries too (no separate deliveries table); `status` is `pending` or `complete`; marking a delivery complete is one update that stamps the delivered date; completed sales, not pending ones, reduce stock; a sale snapshots its price; null client means an on-site sale; null delivered date means pending.
- **Visual design (source of truth):** `docs/design/source/template.html`. The Sales screen is at ~6282–6354 (date range, Status chips, Type chips, table with Date / Client / Size · qty / Price / Type / Status / row menu, and "No sales match these filters."). The "Log a sale" dialog is at ~6535–6582 (Delivery / On-site toggle, Client, Size, Price, Quantity in trays + loose, an "on hand for this size" hint, Date ordered, Cancel, Save). The top-bar label "Add sale" is at ~6775, the subtitle "Deliveries and on-site sales" at ~6771, and the sample sales at ~6697–6709. **The design's form and list know only one size, one price and one quantity per sale, and it has no sale number, no sale detail, no client filter, no mobile layout, no first-use empty state, no edit form, no delete confirmation and no totals on the form.** Its row menu has a red **Delete** that removes at once. See conflicts SL1 to SL19.
- Builds on features 00 (shell; the Sales tab, currently a placeholder), 01 (the shared trays + loose input and its conversion rule, the top-bar Add button and mobile FAB, the discard-changes, all-or-nothing and retry-safe-save conventions), 02 (sizes: active and archived) and 03 (clients: active and inactive, the Add client form, the default price per tray, per-farm currency and the one price-display rule).
- **Personal data.** Sales point at clients (names and phones). Everything feature 03 requires for client privacy (no names in logs, URLs, the server-rendered page, or after sign-out) applies to Sales too. See AC58 to AC61.
- **Invoice, designed for now, built later.** The owner plans to print an invoice from one sale. **This feature builds no print view and no invoice.** It keeps and shows everything an invoice needs: the sale number, the sale date, the client, every line (size, quantity, price per tray, line total) and the sale total, all fixed once saved (AC55, AC56, AC57). The print view and the farm's business details are the follow-up **feature 05**. Inventory becomes **feature 06** (SL14).
- **Note for the owner and the product doc: the invoice wording.** `docs/egg-farm-app-product-doc.md` lists "Not an accounting/invoicing/AR system" in §3 (non-goals) and "Customer invoicing / AR" in §5 (deferred), and the architecture spec (§1) and UI spec (§12) repeat it. A **printed invoice of one sale, with no payment tracking**, isn't what those lines were meant to exclude, but as worded it contradicts them. **The owner agreed (2026-09-27) to change the wording to:** "Not an accounting or accounts-receivable system: no payment status, balances, statements or reminders. A printable invoice for a single sale is planned (feature 07)." **The coordinator will update the product doc (and the matching lines in the architecture and UI specs) at wrap-up**; the PM has not edited them. Payment status stays out of scope, so the sale keeps one `pending`/`complete` status.

## 2. Acceptance criteria (PM)

> **REVISION NOTE (2026-10-03): feature 05 (Orders, `docs/features/05-orders.md`) removes the Pending status.** The owner decided that the intent to deliver becomes an **order** (its own records, statuses Requested to Fulfilled), and every sale is a real transaction: no `pending` sale, no Mark delivered, no Mark as pending, no hard delete (sales are void-only). Existing pending sales are converted into orders by feature 05's migration. Criteria and decisions below that depend on Pending are tagged **[SUPERSEDED by 05]** (dropped, replaced by the 05 criteria named in the tag) or **[REVISED by 05]** (still apply, with the stated change). The original text is kept untouched for history. **These tags take effect when feature 05 ships**; until then the shipped app still behaves as written here. Reviewed and **unaffected**: AC1, AC2, AC10 to AC22, AC27, AC30 to AC32, AC46 to AC51, AC59 to AC63, AC67 (except its Pending sentence), SL1, SL2, SL5 to SL7, SL9, SL11 to SL13, SL15, SL16, Q1 to Q3, Q5, Q7 to Q10.
> **Feature numbering:** this document calls the invoice/print view "feature 05". Orders is now 05. Recommended renumbering: **invoice = feature 07**, Inventory stays 06 (owner to confirm, 05-orders open question 13). Read every "feature 05" below that means the invoice as "the invoice feature".

Terms used in these criteria:
- **Owner** means a signed-in, provisioned owner. **Mobile** is about 375px wide; **desktop** is 1024px or more.
- **A sale** is an **order**: one **header** plus one or more **lines**. The header has the **sale number**, the **client** (or none), the **type**, the **status**, the **sale date** and, once delivered, the **delivered date**. A **line** is one egg **size**, a **quantity**, a **price per tray** and the **line total**. The **sale total** is the sum of the line totals.
- **A delivery** is a sale the owner takes to a client, and starts **Pending**. **An on-site sale** is sold at the farm and is **Complete** as soon as it's logged. There is no separate "deliveries" list: deliveries are the Sales list filtered to Pending or to type Delivery.
- **[SUPERSEDED by 05: AC37; no sale is Pending, every sale is Complete (it has left the farm). A not-yet-delivered promise is an order, 05 AC1 to AC36.]** **Pending** means the eggs haven't left yet. **Complete** means they have. Status belongs to the **whole sale**: all its lines are pending or complete together. Pending deliveries are **not** subtracted from stock. Complete sales are, **for every line at once**.
- **On hand** for a size is that size's good eggs ever produced minus the eggs of that size in all Complete sales (across all their lines). Rejects are never sold and never count. Pending deliveries are never subtracted. This is the same number the Inventory feature will show; this feature needs it only to show a hint and give a warning (AC25, AC26).
- **Sale number**: see AC5.
- **Walk-in** is the label shown for a sale with no client. There's no "Walk-in" record in the Clients list (feature 03 AC34).
- **Price** on a line is **per tray**, in the farm's currency, the same unit as a client's default price (owner decision, feature 03 Q2). **Line total** is the price applied to the line's quantity (AC22). Examples use "₱" and are only for format, not realistic prices.
- **Tray size** is the farm's eggs-per-tray setting. The examples use 30, but every criterion must hold for another value (AC21).
- **Today** is the owner's local date on their device (feature 01), not the server's or UTC.
- Items marked **[not in design]** are needed but the design doesn't draw them. UX draws them in the design's visual language. **(Q#)** marks a criterion written to an owner decision below. **AC64 to AC66** were added after AC1 to AC63 (in the Edit block) so the earlier numbers stay as they were. **AC67 to AC68** were added after AC1 to AC66 (in the Delete block) for an owner correction on hard delete vs. void, made at the architect checkpoint on 2026-09-27 — not a PM or UX miss, a genuine late change of mind once the architect asked what "delete" should mean for a sale that's already out the door.

**The Sales screen**
- [ ] AC1: The Sales tab (one of the five main destinations; still exactly five) shows the **Sales** screen in place of the placeholder. The title is "Sales" and the subtitle is "Deliveries and on-site sales" (the design's).
- [ ] AC2: On desktop the top bar shows an **"Add sale"** button (the design's label). On mobile, a round **"+"** floating button shows instead, above the bottom tab bar and never covering a tab. Either opens the **Log a sale** form in one tap. They show only on the Sales screen, and the other screens' Add buttons are unchanged.
- [ ] AC3: **[REVISED by 05 (AC39): no status text and no Mark delivered on the row; a sale from an order shows "From order #N".]** **The list.** Each sale is one row (desktop table, as in the design) or one stacked card (mobile [not in design, SL5]). It shows: the **sale number**, the **sale date**, the **client's name** (or "Walk-in" if none), a **summary of its lines** (each size and its quantity in trays + loose, for example "Large · 8 trays + 1, Medium · 4 trays"; when a sale has too many lines to fit, the summary can shorten, but the number of lines is always readable), the **sale total** in the farm's currency, its **type** ("Delivery" or "On-site") and its **status** ("Pending" or "Complete") as text, never colour alone. On mobile, the status and Mark delivered are visible without opening anything.
- [ ] AC4: **[REVISED by 05 (05 open question 10): a sale has one date, so the "Delivered {date}" line only remains for sales whose dates differ.]** **Order.** Newest sale date first. Sales with the same date show the most recently logged first (highest sale number). A completed delivery whose delivered date differs from its sale date also shows "Delivered {date}" [not in design].
- [ ] AC5: **[REVISED by 05 (AC40, AC45): sales can never be deleted, so a gap now comes only from numbers retired when a pending sale was converted to an order; read QA's "delete 2" example as "convert pending sale 2 to an order".]** **Sale numbers (owner decision).** Every sale has a sale number, shown in the list and in the sale's detail (AC6).
  - It is a whole number **per farm**, given by the system when the sale is logged. A farm's first sale is **1**. Farm A's numbers are independent of farm B's.
  - It is **unique in the farm and never reused.** QA: log sales 1, 2, 3, delete 2, log another: it is **4**, and 2 never appears again. A deleted sale leaves a gap.
  - It is given in the order sales are **logged**, not by sale date: a back-dated sale logged today gets the next number, not one that fits its date (PM decision).
  - **Nobody types it or changes it.** The form has no field for it and a hand-built request can't set or alter it. Editing a sale (including changing its type), marking it delivered or back to pending never changes it.
  - Two sales saved at the same moment (two phones) get two different numbers. A save that is retried and ends as one sale (AC30) has one number.
  - It becomes the invoice number in feature 07. It is not personal data.
- [ ] AC6: **[REVISED by 05 (AC39): actions are Edit and Void only (no Mark delivered, Mark as pending, Delete); status is not shown; "From order #N" is shown for linked sales.]** **Sale detail** [not in design, SL16]. Tapping a sale (row or card) opens its **detail**, in one tap, showing: sale number, type, status, client (or "Walk-in"), sale date, delivered date (once delivered), **every line** (size, quantity in trays + loose, price per tray, line total) and the **sale total**, with the actions that apply (Mark delivered, Edit, Mark as pending, Delete). A sale with 6 lines is fully readable on mobile without horizontal scrolling. This is also where the future invoice (feature 05) will be printed from.

**Filters** (the design's, plus a client filter)
- [ ] AC7: **[REVISED by 05 (AC39): the Status chips (All / Pending / Complete) are removed; date range, Type chips and Client filter stay.]** Above the list, as in the design: a **from–to date range** with **Clear** once a date is set; **Status** chips **All** (default), **Pending**, **Complete**; **Type** chips **All types** (default), **Delivery**, **On-site**. Added [not in design, SL6; UI spec §5a and feature 03 AC34 rely on it]: a **Client** filter that lists every client, active and inactive, A to Z, and searchable by name ignoring case and accents. Choosing a client shows that client's sales, so it doubles as their history.
- [ ] AC8: **[REVISED by 05 (AC39): applies to the remaining filters; there is no Status filter.]** Filters combine: a sale must match all of them. The date range includes both end dates and applies to the sale date. Changing a filter updates the list without a page reload. Filters reset on a fresh visit to the screen and last while the owner stays on it.
- [ ] AC9: **[SUPERSEDED by 05: no Pending filter; the "never cut short" promise moves to the Orders Open view, 05 AC5.]** **Nothing is hidden from the Pending filter.** With Status = Pending, every pending delivery in the farm is shown, however many sales there are and however old they are (AC52).
- [ ] AC10: A filter combination that matches nothing shows **"No sales match these filters."** (the design's copy), with the filters still usable and an obvious **Clear filters**.
- [ ] AC11: The client filter's choice, like the names of clients, is never put in the address bar or browser history (AC60).

**Log a sale (the hot path)**
- [ ] AC12: **[REVISED by 05 (AC38): the "Already delivered" switch is removed; the Sale date is the day the eggs left.]** The **Log a sale** form (a centred dialog on desktop, a bottom sheet on mobile) has a **header part** and a **lines part** [not in design, SL15]. Header part: a **Delivery / On-site** toggle (Delivery selected first, as in the design), **Client**, and the **Sale date**. Lines part: one or more **lines**, each with **Size**, **Quantity** (the shared trays + loose input), **Price per tray** (with the farm's currency symbol as a prefix, stating "per tray", placeholder "0.00", never the design's "$" or "6.50", SL9), that line's **on-hand hint** (AC25) and **line total** (AC22), plus an **Add size** control to add a line and a **remove** control on each line. Below the lines, the **Sale total**. On the Delivery form, an **"Already delivered"** switch (AC24). **Cancel** and **Save**. Every field has a visible label. The form opens with **one empty line**.
- [ ] AC13: **Client rules, by type.** For a **Delivery**, Client is **required**: saving without one is blocked with a message on the field ("Choose a client"). For an **On-site** sale, Client is **optional** and the sale is a walk-in when left empty (Q5). The picker is searchable, ignores case and accents, and lists **active** clients only, A to Z. An **inactive** client isn't offered (feature 03 AC34). Switching the toggle keeps a chosen client and every line.
- [ ] AC14: **"+ new client".** The picker offers a way to add a client that opens the same **Add client** form as the Clients screen (feature 03), and when it's saved, returns to the sale with that client already chosen and everything else typed still there, lines included. A farm with no active clients sees the picker's empty state with that same option, not a dead end.
- [ ] AC15: **Lines.** A sale has **at least 1 and at most 20 lines** (PM bound; Q3). Add size adds an empty line (and moves focus to its Size). Each line can be removed while more than one remains. At the limit, or when every active size is already used (AC16), Add size is unavailable with a short reason. Every line must have a **size**, a **quantity of at least 1 egg** and a **price**: a line missing one is blocked with a message on that line's field, and the other lines' typed values are kept.
- [ ] AC16: **One line per size (Q9, owner decision).** A size can appear **once** in a sale. A line's size picker shows a size already used by another line as unavailable — dimmed and marked "In this sale" (UX O3) — so it can't be picked there, and to sell more of that size the owner changes that line's quantity. The system itself refuses a sale that names the same size on two lines, with a plain message and nothing saved. (Merging duplicate lines silently was not chosen: a merged line would need one price, and hiding that is a trap for a price mistake.)
- [ ] AC17: **Size.** A line's size picker lists the farm's **active** sizes in the farm's order (whatever they are: not fixed at four). Every line has a size (sales are always sized). An archived size isn't offered for a new line (feature 02 AC28). Rejects can't be sold: there is no reject option.
- [ ] AC18: **Price pre-fills but doesn't bind, line by line.** Choosing a client with a default price fills the Price of **each line whose price the owner hasn't typed yet**, and fills a line added afterwards the same way. A price the owner typed is never overwritten by choosing or changing the client. A client with no default price leaves prices as they are. The owner can always change any line. Whatever is saved is that line's own price. Changing it never changes the client's default price, and later changing the client's default never changes a saved sale (feature 03 AC34).
- [ ] AC19: **Price rules, per line (Q2).** Required. A number **greater than 0**, with **at most 2 decimals**, up to **9,999.99** (the same limits as a client's default price, currency-independent for now). "6.5" is saved as ₱6.50. Zero, negative, blank, letters, more than 2 decimals or a number above the limit are rejected with a message on that line's field and block Save. On mobile it opens a decimal keypad. The symbol comes from the farm's currency (one shared price rule, feature 03 AC36), never typed into the screen.
- [ ] AC20: **Quantity rules, per line.** Whole numbers of 0 or more only. Loose eggs accept at most **tray size − 1**. Each line must be **at least 1 egg** ("Enter a quantity"). The most one line can hold is **100,000 eggs** (PM bound, so a mistyped field can't make a nonsense sale); above it a message shows and Save is blocked.
- [ ] AC21: Trays and loose use the farm's tray size, never a fixed 30 (the same rule as feature 01 AC6). QA checks this on a farm set to 24 eggs per tray: "1 tray + 5" on a line is **29 eggs**, the loose field's maximum is **23**, and 29 eggs displays as "1 tray + 5" everywhere on this screen.
- [ ] AC22: **Line totals and the sale total.** While the owner types, each line shows its total as **price per tray × the line's eggs ÷ tray size**, so loose eggs are charged in proportion. Each line total is rounded to the nearest centavo, **half up**, using exact arithmetic (not a computer's floating-point guess). The **sale total is the sum of the rounded line totals** (never a rounding of the unrounded sum). With 30 per tray: Large 8 trays at ₱6.50 = **₱52.00**; Large 8 trays + 12 at ₱6.50 = **₱54.60**; Large 8 trays + 1 at ₱6.75 = 241 eggs, exactly ₱54.225, shown as **₱54.23**; so an order of Large 8 trays + 1 at ₱6.75 and Medium 4 trays at ₱6.00 (₱24.00) has a sale total of **₱78.23**. The list's total, the detail's line totals and the detail's sale total show these same numbers for the saved sale. A line with no valid price or quantity yet shows a dash for its total, never "NaN" or ₱0.00.
- [ ] AC23: **[REVISED by 05 (AC38, 05 open question 10): "for a delivery, the day it was ordered" no longer applies; the date is the day the eggs left. The order date lives on the order.]** **Sale date.** Defaults to today. Any past date is allowed (back-filling sales from the notebook is expected); a **future date is rejected** with a message and blocks Save. It is the day of the sale (for a delivery, the day it was ordered). It is not a scheduled or due date (Q6, SL10). The label is "Sale date" for both types (SL3).
- [ ] AC24: **[SUPERSEDED by 05 (AC37, AC38): a logged sale is always delivered; there is no switch and no Pending delivery to create. A delivery to be made later is an order.]** **"Already delivered" (Q6).** On the Delivery form, an optional **"Already delivered"** switch (off by default). When on, a **Delivered date** appears (default today, not before the sale date, not in the future), and Save creates the delivery **Complete** with that delivered date, so a delivery dropped off this morning is one submit, not two. With it off, the delivery is created **Pending** with no delivered date. There is no such switch for On-site, which is always Complete, with the delivered date equal to the sale date.
- [ ] AC25: **[REVISED by 05 (AC41): there are no pending deliveries to ignore; on hand is good production minus all non-voided sales. The QA example becomes 600 produced, one sale of 240 on Large: hint 12 trays (360).]** **On-hand hint, per line (Q3, Q8).** Once a line's size is chosen, that line shows the eggs on hand for that size, in trays + loose ("{qty} on hand for this size", the design's wording), for both Delivery and On-site. It updates when the size changes and after any save. It counts good production minus **completed** sales of that size (all lines of all sales) and ignores pending deliveries. QA check: Large has 600 eggs (20 trays) produced, one Complete sale with a Large line of 240 (8 trays), and one Pending delivery with a Large line of 150 (5 trays): the hint shows **12 trays** (360). Completing that pending delivery makes the hint **7 trays** (210). A size with nothing produced shows "0 on hand", never a blank or an error. The hint is never negative on screen.
- [ ] AC26: **[REVISED by 05 (AC38): applies to every new direct sale, since every sale takes stock; the Pending-delivery exception is gone. Also reused by the order deliver step, 05 AC30.]** **Not enough stock warns, then allows (Q3).** If saving would take eggs out of stock (an On-site sale, or a Delivery with "Already delivered" on), the app checks **each size across the lines**. For every size whose on hand would end **below 0**, it asks first, **naming each short size** with what's on hand and what the sale takes, for example: "Not enough on hand: Large 3 trays (you're selling 8 trays), Jumbo 0 (you're selling 2 trays). Record anyway?" with **Record anyway** and **Go back**. Sizes with enough stock aren't named. Going back keeps every typed value. A **Pending** delivery never asks, because it takes nothing from stock yet.
- [ ] AC27: **Save and validation.** Enter (or the keypad's Go) does the same as tapping Save. Messages show under the field they belong to. Save is blocked while any message shows, but is enabled before the first message, so an empty tap gives a message instead of a dead button. The first field with a message gets focus and scrolls into view. Names, prices and quantities never silently truncate.
- [ ] AC28: **[REVISED by 05 (AC38): the delivery path no longer has "Already delivered" or a pending result; the timings stand.]** **Main path.** A tester with the values can, on a phone, log a **delivery with two lines** (Add, pick the client, pick the first size and trays, Add size, pick the second size and trays, Save; prices pre-filled) in **under 60 seconds**, and log an **on-site walk-in sale of one size** (Add, On-site, pick the size, enter trays, enter the price, Save) in **under 45 seconds**. With "Already delivered" on, the delivered date is already today and adds no step. No other field, choice or confirmation is needed (except AC26 when stock is short).
- [ ] AC29: **[REVISED by 05 (AC38): the toast "Delivery logged as pending" no longer exists; every save reads "Sale recorded".]** **After a successful Save:** the form closes, a toast confirms it ("Delivery logged as pending" for a pending delivery, "Sale recorded" for an on-site or already-delivered sale, the design's words, and it may include the sale number [proposed]), and the new sale is in the list at its place, scrolled into view and briefly highlighted, without a reload. If the current filters would hide it, they're cleared so the owner sees it. A completed sale is reflected in every line's on-hand hint straight away.
- [ ] AC30: **No double or lost saves.** While saving, Save shows a spinner and can't be pressed again. Tapping it several times creates **one** sale, with **one** sale number and each line **once**. If the connection drops after the server saved but before the phone heard back, tapping Save again ends with **one** sale, not two (the same promise as feature 01 AC12 and feature 03 AC15).
- [ ] AC31: **Save is all-or-nothing.** A sale is never saved in part: never a header without its lines, and never some lines and not others. If it fails (for example, no signal), nothing is created and no sale number is taken by anything the owner can see, the form stays open with every value kept (header and all lines), and a plain-language message shows, for example "Couldn't save. Check your connection and try again." Tapping Save again retries. This is error handling only, not offline support.
- [ ] AC32: [not in design] Closing the form (Cancel, X, tapping outside, swiping the sheet down) with nothing entered closes it immediately. If anything was entered (a client, a size, a quantity or a price), the app first asks "Discard this entry?" with **Discard** and **Keep editing** (feature 01 AC14).

**Mark delivered** (Q6: asks for the date each time) **[SECTION AC33 to AC39 SUPERSEDED by 05: there is no Pending sale to mark delivered or to set back. Delivering is now "Deliver" on an order (05 AC24 to AC33), which creates a sale; the mistaken-delivery undo is Void (AC67; 05 AC35 for the order effect).]**
- [ ] AC33: **[SUPERSEDED by 05 AC24, AC25.]** A **Pending** delivery has a **Mark delivered** action that is **one tap** from the list, visible on the row or card without opening a menu (UI spec §5c; the design has it only inside the ⋮ menu, SL4), and also in the sale's detail and its ⋮ menu. The tap opens **one small step** that asks for the **Delivered date**, **default today**, with a **Mark delivered** button, so the usual case is **2 taps**. The step names the sale (number, client, and the sizes it takes). The date can't be **in the future** or **before the sale date**: a message shows and the button is blocked. Cancel (or closing it) changes nothing.
- [ ] AC34: **[SUPERSEDED by 05 AC27, AC28.]** Confirming changes the **whole sale** to **Complete** and stamps the chosen delivered date, as **one change**: every line's eggs leave stock at once, and the sale can never be half done (complete with no date, dated but still pending, or some lines out of stock and others not). The row updates in place with the toast "Marked delivered — inventory updated" (the design's words).
- [ ] AC35: **[SUPERSEDED by 05 AC30.]** **Not enough stock, in the same step.** If completing it would leave any size's on hand below 0, that same step also lists each short size, as in AC26, and its button reads **Mark delivered anyway**. There is no second dialog. Sizes with enough stock aren't named.
- [ ] AC36: **[SUPERSEDED by 05 AC29.]** **Effect on stock.** Marking delivered lowers each line's size's on hand by exactly that line's eggs, once. Pending deliveries never lowered it before. QA checks with the AC25 figures (360 → 210 after completing a delivery whose Large line is 150 eggs), and with a two-line delivery that both sizes drop together.
- [ ] AC37: **[SUPERSEDED by 05 AC31.]** **No double or lost completion.** Confirming quickly completes it **once** (stock drops once per line). If it was already completed elsewhere (another phone or tab), the confirm is treated as done, with no scary error, and the list shows the current state. If the request fails, the sale stays Pending, and an error toast that stays until dismissed offers **Try again**.
- [ ] AC38: **[SUPERSEDED by 05 AC33; the rule that marking a client inactive or archiving a size never changes any sale stays.]** **Still works after other changes.** A pending delivery for a client who has since become **inactive**, or with a line of a size since **archived**, can still be completed, edited and deleted (feature 03 AC34, feature 02 AC28). It keeps that client and those sizes. **Marking a client inactive or archiving a size never changes any sale.**
- [ ] AC39: **[SUPERSEDED by 05 AC35, AC37, AC40: no Mark as pending; undo is Void.]** **Undo a mistaken Mark delivered.** A **Complete delivery**'s detail and ⋮ menu have **Mark as pending** (Q4). It sets the whole sale back to Pending, **clears** its delivered date, and puts **every line's** eggs back on hand (the reverse of AC36), with no confirmation. It's not offered for an on-site sale (which is born Complete; to make one pending, change its type to Delivery in Edit, AC64). A Pending sale can't be marked pending.

**Edit a sale** [not in design, SL7] (Q4: edit the whole sale)
- [ ] AC40: **[REVISED by 05 (AC36, AC38, AC42): no delivered date to edit separately (one date); type change has no status effects; a sale from an order can't change client, type or lines.]** Each sale has **Edit** in its ⋮ menu and in its detail, at most 2 taps from the list (on mobile also by tapping the card, then Edit). It opens the same form titled **"Edit sale #{number}"**, pre-filled (each line's trays + loose and its price as plain digits with 2 decimals), showing the sale number (which **can't** be changed). Editable (owner decision): the **type** (Delivery / On-site, with the rules of AC64 to AC66), the **client**, the **sale date**, the **delivered date** of a Complete delivery, and **the lines** (change a line's size, quantity or price, add a line, remove a line; at least one stays). AC13 to AC23 and AC27 to AC32 apply. Saving updates the row and the toast confirms it ("Updated sale #{number}"). Saving with nothing changed closes the form with no request and no toast.
- [ ] AC41: **[REVISED by 05: the "A Pending delivery's client can be changed" sentence is gone; a linked sale's client is locked (05 AC36).]** An existing sale keeps its **inactive** client and any **archived** size on its lines selected and valid in the edit form, and the owner can save without changing them. To pick a different client, or to add or change a line to another size, only active ones are offered (AC13, AC17). A Pending delivery's client can be changed. An On-site sale can gain, change or lose its client.
- [ ] AC42: **[REVISED by 05: every sale takes stock, so stock follows the lines only; the Pending branches, "Pending becoming Complete" and "status change moves all lines" are gone. Editing moves stock by the per-size difference and the AC26 warning applies per size where the save takes more out than before.]** **Stock follows the sale's status, for every line.** A Complete sale takes each line's eggs out of that size's stock; a Pending sale takes nothing. Saving an edit moves stock by the difference between what the sale took **before** and **after** the save, per size: eggs taken off a Complete line go back to that size, eggs added to a Complete line (or a new line) come out of that size, a removed line's eggs go back, and a change of type that changes the status moves all the lines (AC64, AC65). The AC26 warning applies **per size, and only for sizes where the save takes more eggs out than the sale took before** (which includes a Pending sale becoming Complete) and that would leave the size's on hand below 0, naming each short size. Editing only prices, the date or the client of a Complete sale never asks. **Editing a Pending sale that stays Pending never touches stock and never asks.**
- [ ] AC43: **[REVISED by 05: the "completed on another phone" example no longer applies; the check itself stands.]** **Stale-edit check on the whole sale.** If the sale (its header or any line) was changed elsewhere since the form opened (for example completed on another phone), the save is refused with a plain message, the list and detail refresh to the current data, and nothing is changed by mistake (as feature 03 AC19). A change of a price or quantity affects only that line of that sale.
- [ ] AC64: **[REVISED by 05 AC42: a client is still required and a kept inactive client is accepted; but it does NOT become Pending, there is no "Already delivered" switch and no stock moves.]** **Changing an On-site sale to a Delivery (owner decision).** In Edit, switching the type to Delivery:
  - **Needs a client.** The sale's current client is kept and accepted even if it has since become inactive (as in AC41); a client chosen now must be active. Saving with no client is blocked with "Choose a client" (AC13).
  - **Becomes Pending**, with its delivered date **cleared**, **unless** the owner switches on **"Already delivered"** (AC24) and gives a delivered date (default today, not before the sale date, not in the future); then it stays **Complete** with that date.
  - **Stock:** becoming Pending puts **every line's** eggs back on hand and never warns. Staying Complete (Already delivered on) changes nothing by the type change itself.
  - The sale number, sale date and lines are unchanged, and the sale is one Save, all-or-nothing (AC31).
- [ ] AC65: **[REVISED by 05 AC42: the client becomes optional; the sale already is Complete, so there is no Pending case, no date question and no stock warning.]** **Changing a Delivery to an On-site sale (owner decision).** In Edit, switching the type to On-site:
  - **Makes it Complete.** It needs a date, **default today**; if the delivery was **already delivered**, its delivered date is kept as the default. That date becomes the sale's single **date** (an on-site sale's sale date and delivered date are the same day, AC24), and it can't be in the future (the same message as AC23).
  - **The client becomes optional**: the current client is kept, and the owner can remove it (the sale then shows "Walk-in").
  - **Stock:** if the delivery was **Pending**, all lines' eggs now come out of stock and the AC26 shortfall warning applies per size (naming each short size, with **Record anyway** and **Go back**). If it was already **Complete**, the type change itself moves no stock.
  - The sale number and lines are unchanged, and it is one Save, all-or-nothing.
- [ ] AC66: **[REVISED by 05 AC42: keep the same-number, refresh, toast and stale-save rules; drop the Pending status filter, "Mark as pending / Mark delivered" and the final-state shortfall check.]** **Type change, in general.** Whichever way the type changes, the **sale number stays the same** (AC5), the **list row, detail and filters** show the new type and status straight after the save (for example it now appears under the Pending status filter, or leaves it), the **toast** says the sale was updated, and a **failed or stale save** (AC43) changes nothing. A type change can be combined with other edits (client, date, lines) in the same Save, and the AC26 check then uses the sale's **final** state against what it took **before**. **Mark as pending** and **Mark delivered** (AC33, AC39) remain the quick ways to change status without changing type.

**Delete a sale — Pending only [SECTION AC44, AC45 SUPERSEDED by 05 AC40: no sale can be deleted; the only way to strike out a sale is Void, AC67. A mistaken not-yet-delivered promise is an order, cancelled by 05 AC22.]** [design has a red Delete with no confirmation, SL8] (Q4; corrected by the owner at the architect checkpoint, 2026-09-27 — see AC67, AC68)
- [ ] AC44: **[SUPERSEDED by 05 AC40.]** Each **Pending** sale has **Delete** in its ⋮ menu and its detail (red, as in the design, because it can't be undone). **A Complete sale has no Delete** (owner correction, 2026-09-27): it's corrected by editing its lines (AC42) or, to strike it out entirely, by **Void** (AC67). Delete **asks first**, with a dialog that names the sale (number, client or "Walk-in", number of lines, sale total) and says "It hasn't left yet, so your stock doesn't change" (a Pending sale never held any stock, so there's nothing to list). **Delete** removes the whole sale, its lines included, for good. The row disappears without a reload, a toast confirms it ("Sale deleted", the design's). **Cancel** changes nothing. Its sale number is not reused (AC5). If the sale is no longer Pending by the time Delete is confirmed (completed on another phone), the delete is refused with a plain message pointing at Void instead, and the list/detail refresh to the current state.
- [ ] AC45: **[SUPERSEDED by 05 AC40.]** A failed delete leaves the sale exactly as it was, with a plain error and **Try again**. A sale already deleted elsewhere is treated as done. Deleting a **Pending** sale changes no client, no size and no other sale.

**Void a complete sale — owner correction, 2026-09-27** [not in design; the owner changed this at the architect checkpoint, after AC1 to AC66 were already numbered, so the new criteria are AC67 and AC68 rather than renumbering anything above]
- [ ] AC67: **[REVISED by 05 AC35, AC40: "in place of Delete" and "A Pending sale is never voided" no longer apply, since every sale is Complete and none can be deleted, so Void is the only removal. Voiding a sale from an order also reopens the order's remaining, 05 AC35.]** A **Complete** sale (delivery or on-site) has **Void** in its ⋮ menu and its detail, in place of Delete (which Complete sales no longer have, AC44). Void **asks first**, with a dialog that names the sale and says what it puts back on hand, one line per size (the same information the old Complete-sale Delete confirm showed, for example "This puts 8 trays of Large and 4 trays of Medium back on hand"). Confirming **voids** the sale: every line's eggs go back on hand, from that moment on, and the sale stops counting toward stock for good — the row, its number and every line stay exactly as they were, marked **Voided**. **Voiding is one-way**: there is no "un-void" or restore action anywhere in the app, for the owner or by re-opening it (owner decision). A **Pending** sale is never voided — it is only ever deleted (AC44); Void isn't offered on one. A stale sale (changed elsewhere since it was last shown) refuses the void with the same handling as AC43, and nothing is voided by mistake. A failed void leaves the sale exactly as it was, with a plain error and **Try again**. Voiding a sale changes no client, no size and no other sale, and needs no confirmation beyond the one dialog (no second "are you sure").
- [ ] AC68: **[REVISED by 05: remove "marked delivered, marked as pending, deleted" from the refused actions; those no longer exist.]** A **Voided** sale is hidden from the Sales list **by default**, under every filter (Status, Type, Client, dates), the same way it's excluded from stock; a toggle (default off) reveals voided sales, each shown marked **Voided** (text, not colour alone) alongside its original type and status, so the owner can still see what it was. A voided sale can never be edited, marked delivered, marked as pending, deleted or voided again: its ⋮ menu and detail offer none of those actions, only viewing. Voiding never changes any other sale, client or size.

**Loading, empty and error states**
- [ ] AC46: **First use:** a farm with no sales at all sees **"No sales yet"** with an **Add sale** button that opens the form (UI spec §5; the design has no first-use state, SL11), instead of the filters and table. It shows no sample data, and none of the design's sample sales or its "Walk-in" names appear.
- [ ] AC47: **Loading:** while sales load, the screen shows a loading placeholder, not the empty state, so it never flashes "No sales yet" for a farm that has sales. **Load failure:** a plain-language message with **Try again**; no blank screen, no technical error, no empty state.

**Layout**
- [ ] AC48: **Mobile (375px):** the filters wrap without horizontal scrolling (the design's table scrolls sideways, which cards avoid); the list is cards; no horizontal scrolling on the list, the cards, the detail or the form. Every tappable control (Add, FAB, Mark delivered, ⋮, cards, chips, Add size, remove line, form fields and steppers, the "Already delivered" switch, Save, Cancel, dialog buttons) is at least **44px** tall and wide. The last card scrolls clear of the FAB and the tab bar. The whole form, including Save, is reachable by scrolling, with every line and the sale total, and Save stays reachable with the keypad open (feature 01 AC5).
- [ ] AC49: **Desktop and tablet:** content centred at the design's maximum width (about 1120px) with the table of AC3; between 768px and 1023px it works with the sidebar collapsed and expanded, and the Add button is always reachable.
- [ ] AC50: Light and dark mode keep names, quantities, prices, totals, badges, messages, the detail and the form readable.
- [ ] AC51: A sale with **20 lines** (the maximum) can be entered, saved, opened, edited and deleted on mobile without breaking the layout, and the form still lets the owner reach Save.
- [ ] AC52: **[REVISED by 05: "AC9 always holds: the Pending filter is never cut short" is dropped; the same promise is 05 AC5/AC49 for the Orders Open view. The 5,000-sale speed promise stands.]** **A long history stays quick.** With **5,000 sales** (some with several lines) in a farm, the list shows the newest first quickly and lets the owner reach older ones (a "Show more" control, or the date range and filters); it never shows a blank or broken screen. AC9 always holds: the Pending filter is never cut short.

**Data rules and derived numbers**
- [ ] AC53: **[REVISED by 05 (AC29, AC35, AC40, AC41): remove "a pending delivery logged changes nothing", Mark delivered, Mark as pending and "deleting a Pending sale". What remains: a sale logged lowers on hand; a delivery from an order lowers it once per line; editing moves the per-size difference; voiding raises it once per line.]** **Stock effects, in one place.** Every one of these changes each affected size's on hand by exactly the amount of its line, checked with the AC25 hint: a Complete sale logged (on-site, or a delivery already delivered) lowers it; a pending delivery logged changes nothing; Mark delivered lowers it once per line; Mark as pending raises it back; editing a Complete sale moves the difference per size; deleting a **Pending** sale changes nothing (a Complete sale can no longer be deleted, AC44); **voiding a Complete sale raises it, once, per line, and its eggs never count toward stock again (AC67).** Rejects are never involved: no line can be a reject or unsized.
- [ ] AC54: **[REVISED by 05 (AC37, AC40): drop the Pending/Complete delivered-date rules (a sale always has its date, never Pending) and "Delete only ever applies to a Pending sale". Every sale refuses deletion; a voided sale accepts no further change; a sale from an order keeps client and lines fixed (05 AC36).]** **The rules are enforced by the system, not only by the form**, so a hand-built request can't store an invalid sale, and gets the same plain message as the form, not a server error:
  - A sale has **1 to 20 lines**, each with one size, a quantity of **1 to 100,000 eggs** and a price (above 0, at most 2 decimals, up to 9,999.99). **No size appears twice** in one sale (AC16).
  - A delivery has a client. A Pending sale has no delivered date and a Complete one has one. An On-site sale is Complete, and its delivered date is its sale date. The delivered date isn't before the sale date and isn't in the future. The sale date isn't in the future.
  - The sizes and the client belong to this farm. **A new sale, or a line newly added to a sale, can't use an inactive client or an archived size**, but an existing sale keeps the ones it has (AC38, AC41).
  - The sale number is assigned by the system only (AC5).
  - **Delete only ever applies to a Pending sale, and Void only ever applies to a Complete one** (owner correction, 2026-09-27): the system refuses the wrong one itself, not just by hiding the button, with a plain message. Once **voided**, a sale accepts no further change of any kind — not an edit, a status change, a delete or a second void.
- [ ] AC55: **[REVISED by 05 AC51: also holds for deliveries made from an order, whose price is the order line's price. "Feature 05" in AC55 to AC57 means the invoice feature (now 07).]** **The lines' numbers are history-proof.** Each line's eggs are kept exactly, in individual eggs (feature 01 AC36). If the farm's tray size changes later, only the trays + loose display changes. **The price and line total the owner saw when a line was saved don't change** when the farm's tray size or currency later changes; the currency only relabels (the same rule as feature 03 AC37). So the sale total never changes either. QA checks this on a test farm by changing the tray size and the currency in the data. Which numbers the system stores to guarantee this is the architect's call (see SL2).
- [ ] AC56: **[NOTE from 05: "feature 05" means the invoice feature (renumbered); a sale from an order may also show its order number on the invoice, an invoice-feature decision.]** **Invoice-ready, no invoice.** For every sale the app keeps, and the detail (AC6) shows, exactly what an invoice will list: the sale number, sale date, client, each line's size, quantity, price per tray and line total, and the sale total (all fixed as in AC55). Nothing about printing, layout or the farm's business details is built or configurable here.
- [ ] AC57: **[NOTE from 05: "feature 05" means the invoice feature.]** The system can tell, from the stored sale alone, every line's eggs, price per tray and total, and the sale total: the invoice feature (07) doesn't need the owner to re-enter anything, and no rule here has to change to add the print view. (Product statement for the architect; QA verifies through AC55 and AC56.)
- [ ] AC58: **[REVISED by 05 AC52: drop "mark delivered, mark as pending or delete"; add that a sale can't link to another farm's order; orders get the same isolation test.]** **Cross-farm isolation.** The farm-isolation test (features 00 to 03) is extended to sales and their lines, for reads **and** writes. Farm A's owner can't list, read, create, edit, mark delivered, mark as pending or delete any of farm B's sales or lines, including requests that name farm B's sale records or farm B itself, **or a sale that names farm B's client or farm B's size on any line**, and the reverse. Sale numbers are per farm and never reveal how many sales another farm has. A signed-out request gets no sales data and can't change any.
- [ ] AC59: **No personal data in logs.** Client names, phone numbers, prices and quantities don't appear in server logs, error reports or error responses, including for failed validation and server errors. Messages refer to the field or line, not the value. QA checks this by failing a request on purpose and reading the logs.
- [ ] AC60: **Nothing personal in the address bar.** Client names, the client filter and any client detail are not put in the URL or the browser history. The client names on the Sales screen aren't part of the server-rendered page; the list loads after the screen opens, like the Clients list.
- [ ] AC61: **Shared or lost phone.** After Sign out, the Back button doesn't show the sales list or a sale's detail, and signing in as another farm on the same device shows none of the previous farm's sales or clients.
- [ ] AC62: Only the signed-in owner of the farm can log or change its sales. There are no roles in v1 (non-goal), so every owner of a farm has the same access.
- [ ] AC63: **Related screens stay right.** Renaming a client or a size shows the new name on past sales (feature 03 Q7, feature 02; owner decision Q10: a reprinted invoice shows the current name and nothing extra is stored). Marking a client inactive or archiving a size changes no sale, and the Clients and Settings screens behave as before. The **Dashboard and Inventory placeholders are unchanged** by this feature (their cards and screen are later features); the per-line on-hand hint (AC25) is the only place stock shows here.

**Out of scope:**
- **The invoice**: the print view, a printable or PDF document, the invoice layout, and the **farm's business details** on it (farm name, address, contact, tax number, logo), and the client's address or delivery notes (feature 03 kept only name, phone and default price). The follow-up **feature 07**. This feature only makes sure everything an invoice lists is kept (AC56, AC57). A prefix or format on the invoice number (for example "INV-") is feature 05's call.
- **The Inventory screen** (per-size stock, total on hand, pending "For delivery" per size). Its own feature, now **feature 06**, not 04 as earlier docs say. This feature needs only the on-hand read of AC25, which must share its calculation with Inventory. The Inventory feature also decides what to show if on hand goes **negative** (the design floors it at 0), which AC26 makes possible on purpose.
- **The Dashboard cards** ("Pending deliveries", "Recent sales", stock). The Dashboard is its own feature; the Sales list and its Pending filter are what it will link to.
- **Un-voiding or restoring a voided sale**, and any second **status** value beyond `pending` / `complete` (architecture spec; a second axis waits for payments). **Voiding** (AC67, AC68) is a separate, one-way marker on a Complete sale, not a third status value, added by owner correction on 2026-09-27 (see the note under Q4). Editing (AC42), Delete (Pending only, AC44) and Void (Complete only, AC67) are the corrections available.
- **Payment status, amount owed, balances, statements, receipts as proof of payment, discounts, tax, partial payment** (non-goals: accounts receivable; payment-status tracking). The price is only a record. See the note in §1 about the product doc's wording.
- **Expected or due date, delivery day, time slot, address, route or driver** for a delivery (Q6). Delivery routing and scheduling is a v1 non-goal.
- **Totals and reports**: revenue for a period, total pending, per-client totals, best customers, per-size price history. Noted for later.
- **Notes or a reference on a sale**, a **different price for loose eggs**, per-size client prices, price lists, bulk price changes (feature 03 Q3), the same size on two lines with two prices (Q9).
- **Returns, refunds, breakage, gifts or samples** (a price of 0 isn't allowed, AC19). A gift could be a later addition if the owner wants it.
- **Undo toast** after Mark delivered, **bulk actions** ("Mark all delivered"), **duplicate sale**, **repeat last order**, **import/export**, **searching sales by sale number**.
- **Tap-to-call** on the client's phone from a sale; **search** by client name in the list (the client filter covers it).
- **[Partial delivery is now IN scope of feature 05, not this one.]** **Partial delivery** of an order (SL17), and editing on-hand or stock directly (stock is computed only). (Changing a sale's type **is** in scope, AC64 to AC66.)
- Non-goals, kept out and noted for later: accounts receivable and payment tracking; delivery routing and scheduling; offline; multi-user, roles and "who logged this"; realtime updates; flock health, feed and mortality.

**Design vs spec conflicts (for UX and the architect):**
- **SL1: Sales list price is a line total in the design; the client's default price is per tray.** The design's list shows totals (240 eggs = $48.00, which is 8 trays at $6.00), while its form shows "6.50" next to "2 trays" without a unit (feature 03 CL6). PM decision (Q2): on **each line** the owner **enters price per tray** (the same unit as the client's default, so it pre-fills without maths), the form shows each **line total** and the **sale total**, and the list shows the **sale total** (as the design shows a total), with the per-tray prices in the detail.
- **SL2: A per-tray price and a fixed total pull in different directions if the tray size ever changes.** A line's total is price × eggs ÷ tray size, so changing the tray size would change past totals (and now past invoices), against product goal 5 and feature 03 AC34/AC37. PM constraint, in product terms (AC55): a past line's price and total as first shown **never change**, so a sale total never changes. How to guarantee it (store the line total, or the tray size with the sale, or something else) is the architect's decision. The tray size can't be changed in the app yet ("Farm settings: tray size" is a future feature), so today this only matters for test data, but the future settings feature must warn about it, like feature 02 does.
- **[REVISED by 05: for a delivery the date is now the day the eggs left; the "ordered" date lives on the order.]** **SL3: The design's "Date ordered" for on-site sales.** On-site sales aren't "ordered". PM decision: the header date is the **"Sale date"** for both types (the owner's word for it, and the invoice's date). The delivered date is separate, and for an on-site sale it is the same day.
- **[SUPERSEDED by 05: Mark delivered is replaced by Deliver on an order (05 AC24).]** **SL4: "Mark delivered" is only in the ⋮ menu in the design, and it completes at once with no question; the UI spec calls it prominent and one tap.** PM decision: also visible directly on a Pending row/card (AC33), and it asks for the delivered date (owner decision Q6), so it is **2 taps** in the usual case, not 1.
- **SL5: The design has only a desktop table.** It scrolls sideways at narrow widths; UI spec §11 says lists are stacked cards on mobile. PM decision: cards on mobile (AC3, AC48). UX draws them, including how the summary of a sale's lines fits.
- **SL6: No client filter in the design; the UI spec and feature 03 both rely on one.** Feature 03 Q8 sent a client's history to "the Sales list filtered to that client". Added (AC7).
- **SL7: No Edit form in the design.** Its Edit only toasts "Editing sale". UI spec §5 requires it. Added, reusing the Log a sale form for the whole sale (AC40).
- **[SUPERSEDED by 05 AC40: sales cannot be deleted at all; Void is the correction.]** **SL8: The design's red Delete removes a sale at once with no question.** Sales are what stock and revenue are built from. PM decision: confirm first, say the effect on stock (AC44). It's a real delete (Q4), like Delete day in feature 01, and the sale number stays unused (AC5).
- **SL9: The design's "$" and "6.50" in the price field.** Same conflict as feature 03 CL12 and CL13: the currency is the farm's (PHP, ₱ by default), and the placeholder is a neutral "0.00" (AC12, AC19). The design's sample prices are dollar-sized and aren't used as realistic prices.
- **[SUPERSEDED by 05 AC24, AC38: no "Already delivered" switch and no separate delivered-date step on a sale; delivering is done on an order.]** **SL10: The UI spec says "Date delivered, optionally settable for back-dated entries" on the add form; the design has no such field.** PM decision (Q6): Mark delivered **asks for the date** each time (default today; AC33); an optional "Already delivered" switch on the form (AC24) covers a delivery already dropped off, with its own delivered date; and the delivered date can be corrected in Edit for a Complete delivery (AC40).
- **SL11: The design has no first-use empty state**, only "No sales match these filters." UI spec §5 says "No sales yet" with an add button (AC46).
- **SL12: On-site sales in the design.** The Log a sale dialog hides the client for On-site, but the design's sample on-site sales carry real names ("Linda Ferris", "Sam & Dana Coyle") or "Walk-in". PM decision (Q5): On-site keeps an **optional** client picker (a regular can buy at the farm and have it in their history); empty means "Walk-in". "Walk-in" is only a label, never a client record (feature 03 CL7).
- **SL13: The design's on-hand hint is a prototype shortcut.** It shows the on-hand of the *third* size whatever is chosen (`inventory[2]`), and it shows one hint for the whole form. The criteria require a hint **per line, for that line's size** (AC25).
- **[REVISED by 05: Orders takes feature 05. Inventory stays 06; the invoice/print view moves to 07 (owner to confirm).]** **SL14: Spec numbering.** Earlier feature docs (01, 02) and the architecture spec call Inventory "feature 04". Sales is 04, the invoice/print view and the farm's business details are **feature 07**, and **Inventory is feature 06**. The architect should update those references. Also, the architecture spec's `fulfillment_type` reads "`delivery` / `on_site` (extensible: `pickup`)": pickup is **not** in v1 (on-site covers it).
- **SL15: The design's Log a sale form and list are single-size; a sale is now a header plus lines (owner decision Q1).** The design's dialog has one Size, one Price and one Quantity, and its list row shows one "Size · qty" and one Price. PM decision: the dialog gets a header part and repeatable lines with Add size and remove, the per-line hint and the totals (AC12 to AC22); the list row shows a summary of the lines and the sale total (AC3). The UI spec §5b ("Size", "Quantity", "Price" as single fields) and the architecture spec's sale shape (`(date_ordered, date_delivered, status, size, quantity, price, …)` as one row) both describe one line per sale and must be updated by the architect. The design's sample sales (one line each) aren't a model for the data.
- **SL16: No sale number and no sale detail in the design.** A sale with several lines can't be read in one table row, and an invoice needs a number. Added: the sale number (AC5) and the sale detail (AC6), which UX draws in the design's visual language.
- **[SUPERSEDED by 05: Mark delivered no longer exists; partial delivery is supported, as several deliveries (sales) against one order, 05 AC24 to AC28.]** **SL17: "Delivered" and "Sale date" now sit on the whole sale, and "Mark delivered" moves every line together** (owner decisions Q1, Q4, Q6). The design's row-level status and its toast "Marked delivered — inventory updated" fit this unchanged; a partial delivery (some lines delivered, others not) is **not** supported. A delivery of three sizes is delivered or it isn't. If the owner delivers part of an order, the current answer is to edit the sale to the sizes and trays delivered and log the rest as a new delivery. Noted for later, not asked.
- **[NOTE from 05: "planned as feature 05" now reads feature 07; the sale keeps no status field at all after 05, so "the sale keeps one pending/complete status" no longer holds.]** **SL18: The product doc says invoicing is a non-goal** (product doc §3 and §5; architecture spec §1; UI spec §12). A printed invoice of one sale, with no payment tracking, is now planned as feature 07, and the wording needs clarifying (the owner agreed to the wording in §1; the coordinator updates the docs at wrap-up, the PM has not edited them).
- **[REVISED by 05 AC42: type can still be changed, but with no status or stock effects; "Pending has no delivered date; Complete has one" no longer exists.]** **SL19: The type of a sale can be changed after logging (owner decision), which the specs don't allow.** The architecture spec says on-site sales are "born complete" and treats type as fixed; the UI spec and design have no way to change it. PM decision: Edit can switch Delivery and On-site with the rules of AC64 to AC66, stock always following the status. The architect must make sure the stored rules (delivery has a client; Pending has no delivered date; Complete has one; on-site is Complete) still hold across a type change, and update the specs.

**Owner decisions (2026-09-27), reflected in the criteria above:**
- **Q1: a sale is an order (changed from the PM's option A).** One header plus several lines (size, eggs, price per tray), because the owner plans to **print an invoice from one sale**. A sale total is the sum of its line totals (AC3, AC12, AC15, AC22, AC55).
- **Invoice:** designed for now, built later. The print view and the farm's business details are follow-up **feature 07**; Inventory moves to **feature 06** (SL14).
- **Sale number: yes.** Per farm, assigned by the database, never reused (a deleted sale leaves a gap), shown in the list and the detail, and it becomes the invoice number later (AC5, AC6).
- **Q2: price per tray on each line**, pre-filled from the client's default, with a line total per line and a sale total (AC18, AC19, AC22). The PM's rounding and limit rules stand, applied per line.
- **Q3: shortfall warns, then allows.** The check runs per size across the lines, naming each short size (AC26, AC35, AC42).
- **[SUPERSEDED in part by 05: hard delete, "Mark as pending" as undo and the Pending status are gone; edit-the-whole-sale and Void stand.]** **Q4: edit the whole sale, hard delete with a confirm stating the stock effect, "Mark as pending" as undo, no third status.** Stock moves for every line at once. A stale-edit check covers the whole sale (AC39, AC40, AC42 to AC45). **Owner correction at the architect checkpoint (2026-09-27):** hard delete turned out to be wanted for **Pending sales only** — a Complete sale can never be hard-deleted; it's corrected by editing its lines or by a new one-way **Void** (AC67, AC68), which is a separate `voided_at` marker, not a third `status` value. This was raised by the owner while reviewing the architect's design, not missed by the PM or UX.
- **Edit scope (answered 2026-09-27, changed from the PM's draft): the sale type CAN be edited** (Delivery ↔ On-site), with the sale number unchanged and stock following the status (AC40, AC42, AC64 to AC66).
- **Q5: an on-site sale may optionally have a client** (empty means Walk-in) (AC13).
- **[SUPERSEDED by 05: the delivered-date question moves to the order's Deliver step (05 AC24), which still asks for the date each time; "Already delivered" on the sale form is removed.]** **Q6 (differs from the PM's recommendation): Mark delivered asks for the date each time**, default today, in one small step. It can't be in the future or before the sale date. The "Already delivered" switch stays on the add form, with a delivered date defaulting to today (AC24, AC33).
- **Q7: newest first, all statuses, filters, "Show more"** (AC4, AC7, AC52). **Q8: Inventory isn't part of this feature;** Sales needs only an on-hand read per size that shares Inventory's calculation (AC25).

- **Q9: A.** The same size can't appear twice in one sale (AC16, AC54).
- **Q10: A.** A rename shows the new name on a reprinted invoice, as for past sales. Nothing extra is stored (AC63).
- **Product doc wording:** the owner agreed to the reworded invoicing line (§1). The coordinator updates the docs at wrap-up.
- **No objection raised (kept as written):** partial delivery unsupported (SL17), the 20-line cap, the 100,000 eggs per line and 9,999.99 price bounds, and sale numbers given in the order logged (AC5).

**Open questions for owner: none.** Q9 and Q10 are answered above; their text is kept below for the record.

**Decisions to confirm (PM's simplest rules for the type change; not owner questions, none changes the data model):**
- **Client kept on On-site → Delivery.** If the sale's current client has become inactive, it is still accepted (as for any existing sale, AC41), and only a newly chosen client must be active. (Alternative: force an active client. Rejected as needless friction for a sale that already has that client.)
- **Delivery → On-site takes one date.** An on-site sale has a single date (its sale date and delivered date are the same day), so the date asked for becomes both. An old delivery ordered Aug 1 and delivered Aug 3 that is switched to On-site is then dated Aug 3 (the delivered date is kept, AC65). This loses the original order date, which an on-site sale doesn't have.
- **No "Already delivered" switch in Edit for a Delivery that stays a Delivery.** Its status changes only through Mark delivered and Mark as pending (AC33, AC39). The switch appears in Edit only when switching On-site → Delivery (AC64).
- **A type change is one Save.** It is combined with other edits and checked once against the final state (AC66).

**Questions as asked (for the record; both answered above):**

- **Q9. Can the same size appear on two lines of one sale? (ANSWERED: A) [minor]** For example, 10 trays of Large at ₱6.50 and 2 trays of Large at ₱6.00 in the same order.
  - **A (recommended). No, one line per size.** To sell more of a size, change that line's quantity. The form doesn't offer a size already used, and the system refuses a duplicate (AC16). One price per size per sale keeps the invoice easy to read, and the stock check per size simple.
  - **B. Yes, allowed.** Lets the owner give two prices for one size in one order, but the invoice shows two lines of the same size and the price mix-up is easier to make.
  - **C. Merge duplicates automatically** into one line (adding the quantities). Rejected by the PM: it hides which price applies.
  - **Recommendation: A.** Do you ever sell the same size at two different prices to the same customer on the same day?
- **Q10. If I rename a client or a size later, should an old invoice show the new name or the old one? (ANSWERED: A)** Feature 03 (Q7) and feature 02 decided that a rename shows on past sales. That was decided before invoices existed. A printed copy already handed to a customer keeps the old name, but reprinting later would show the new one.
  - **A (recommended). Keep the current rule.** A rename is a correction (a typo, "Maple St" to "Maple Street"), so a reprint should show the corrected name. Nothing extra to store now.
  - **B. Each sale keeps the client's name and each line keeps the size's name as they were when logged.** A reprinted invoice is always exactly what was printed the first time. This means storing those names on the sale (bigger data, and personal data copied onto sales), and a typo in a name would stay on old sales unless edited there.
  - **Recommendation: A.** Prices, quantities, dates and the sale number are already frozen (AC55). Names are the only thing that would move. If a printed invoice must always reprint identically, say so and the architect stores the names (B) now, because adding them later means a data migration. Also worth knowing for feature 07: an invoice may need the client's address, which feature 03 didn't keep.

**Follow-ups (future features, not in 04):**
- **Feature 07: Invoice print view and farm business details.** A printable page or PDF of one sale from its detail (sale number as invoice number, date, client, lines, sale total), plus the farm's name, address, contact and tax details in Settings. Decides the invoice number's format (for example a prefix) and whether the client's address is needed. A reprint shows the client's and sizes' current names (Q10, resolved). No payment status.
- **Product doc wording (owner agreed 2026-09-27):** the "invoicing / AR" lines in the product doc (§3, §5), architecture spec (§1) and UI spec (§12) are reworded as in §1. **The coordinator does this at wrap-up**, not the PM.
- **Feature 06: Inventory.** Per-size on hand, total, "For delivery" per size, archived sizes while eggs remain, negative-stock display. Must not sum production eggs in `integer` (feature 01 audit note), and shares the on-hand calculation of AC25.
- **Dashboard**: "Pending deliveries" (count and preview, linking to the Sales list filtered to Pending), "Recent sales", stock.
- **Partial delivery** of an order (SL17), **opening stock** entry (Q3), **undo toast** after Mark delivered, **"Mark all delivered"**, **repeat last order**, **per-client totals and last delivery date** on the Clients screen, **revenue totals** for a period, **search by sale number**.
- **Farm settings: tray size and currency** must warn that a sale's prices and totals don't change (AC55; feature 03 follow-ups).
- **Sizes and clients**: nothing needed. (Deleting a never-used client, feature 03 Q5 option B, can be built now that Sales exists, if the owner still wants it.)
- **Payment status and accounts receivable** (non-goals; would add a second status axis named for what it tracks).
- **Delivery due dates, routing and scheduling** (non-goal).

## 2.5 UX design (UX Designer)

**Owner decisions on the UX checkpoint (2026-09-27):** O1 chips for the size picker, one tap per line, falling back to a dropdown above 6 sizes; O2 the Status chips stay pinned on mobile with the rest of the filters (Type, Client, dates) behind one **Filters** button; O3 a size already used on another line stays in the picker, shown dimmed and marked "In this sale", rather than being left out; O4 the log/edit/delete toasts include the sale number; O5 the **Sale date** field sits after the size lines, not where the design puts "Date ordered". All five match what this section already designed and recommended, so no layout, wireframe or tap count changes were needed — see "Design departures" (S2, S9) and "Decisions for owner" below, now marked decided.

**A later correction at the architect checkpoint (2026-09-27, same day):** the owner changed hard delete from "any sale" to **Pending sales only**, adding a one-way **Void** for Complete sales instead (a new `voided_at` marker, not a third status) — see AC67/AC68 in §2, and the Row menu, Delete/Void confirm and States updates below. This is an owner correction, not something UX or the PM missed; UX has not otherwise revisited its checkpoint decisions, and this section's updates for it were made by the architect ("same dialog, different verb, no restore option" — not a redesign).

**Source of truth:** the owner's design, `docs/design/source/template.html`: the Sales screen (~6282–6356: date range, Status chips, Type chips, table, row menu, "No sales match these filters."), the "Log a sale" dialog (~6535–6582), the top-bar label (~6775), the subtitle (~6771), the toasts (~6889–7018) and the badge colours (~6880–6884: Delivery `info` subtle, On-site `neutral` subtle, Pending `warning` soft, Complete `success` subtle). It sits inside the feature 00 shell and reuses what features 01 to 03 built, so nothing is invented visually:
- the top-bar Add button and the phone FAB (`usePrimaryAction`), and the toast offset above the FAB,
- the bottom-sheet / centred-dialog overlay (`sheetUi`, `useSheetKeyboard`, the pattern of `ProductionFormOverlay.vue` and `ClientFormOverlay.vue`) and `ConfirmDiscardDialog.vue`,
- `QuantityInput.vue` (two fields, trays + loose), `formatQty`, `formatPrice`, `formatPriceInput`, the client price messages,
- the Clients list, toolbar and row-menu patterns (cards below about 640px of content width, the design's table above; 44px chips and controls; `Showing x of n · Clear`; the ⋮ `UDropdownMenu`; `AppPlaceholder` for first use and load failure; skeletons; the 1.5s row highlight; persistent error toasts with **Try again**),
- the size colour slot (`sizeColor`) as a small decorative dot,
- `ClientFormOverlay` for "+ New client", opened on top of the sale form, exactly as feature 03 asked for.

Anything marked **[proposed]** is not in the design. Nuxt UI names are approximate (v4); the frontend dev confirms the APIs. Departures from the design are listed in "Design departures" (S1 to S14). Conflicts and questions about the acceptance criteria are in "UX issues for the owner" (X1 to X7).

### Shared rules (used by every part of this screen)

**R1. One request at a time per action; the screen only says what the server did.**
- **Add and Edit:** Save shows a spinner and is disabled, the fields are read-only, and Cancel, ✕, the overlay and Esc do nothing while it runs (feature 01 "Saving"). Tapping Save many times sends one request (AC30). If it fails, every typed value (header and every line) stays.
- **Mark delivered / Mark as pending / Delete:** the row's ⋮ and its **Mark delivered** button become spinners and are disabled until the answer comes. Other rows stay usable. The status text changes only after success (nothing to roll back).
- After a successful change the row gets the shared highlight (`bg-primary/8`, fades over 1.5s, none with reduced motion) and is scrolled into view (centred) if it isn't.

**R2. Where messages go.**
- A field problem: under that field, with an icon (`UFormField` error). For a line, under that line's field, inside that line's card.
- A failed or refused Save: an error `UAlert` above the footer (`role="alert"`). The form stays open.
- A failed Mark delivered, Mark as pending, a stale change or a failed background refresh: an **error toast that stays until dismissed**, with 44px ✕ and, where it helps, **Try again** (as feature 03 R2).
- A failed Delete: an alert inside the delete dialog, which stays open (as feature 01).
- Success: the toast (R6). It is never the only place an error shows.

**R3. Checks (AC15, AC19, AC20, AC23, AC27).** A field is checked when it loses focus and when Save is tapped. Once a message has shown, that field re-checks on every keystroke and the message clears the moment the value is valid. **Save is blocked while any message shows** (`aria-disabled`, dimmed) but is enabled before the first message, so an empty tap gives a message and not a dead button. The first field with a message gets focus and scrolls into view (centred). **No `maxlength` on any input** (nothing is silently cut, AC27). A price of "6.5" becomes "6.50" when the field is left and is valid. Typed values are never rounded or altered except that.

**R4. Quantity and price display.** Quantities always go through `formatQty` (`8 trays + 1`, `4 trays`, `1 tray`, `5 eggs`), never `0 trays + 5`. Prices always go through `formatPrice` (`₱6.75`, `₱1,250.00`), with ` / tray` where a price per tray is meant. The symbol comes from the farm's currency and is never typed into a screen. The only special case: an on-hand of zero reads `0` in the hint ("0 on hand for this size", AC25), not `0 eggs`.

**R5. Status and type are always words.** Status is a text badge, **Pending** (`warning`, `soft`) or **Complete** (`success`, `subtle`). Type is a text badge, **Delivery** (`info`, `subtle`) or **On-site** (`neutral`, `subtle`). Complete rows are **not dimmed**. Colour is never the only cue. "Walk-in" is plain text (never a badge, never a link).

**R6. Toasts (AC29, AC34, AC40, AC44).** The design's toast (inverted, check icon, bottom-centre, 2.6s). On phones this screen has a FAB, so the toast sits **above the FAB** (`bottom: calc(64px + env(safe-area-inset-bottom) + 84px)`, as on Production and Clients). Error toasts stay until dismissed. Logging, editing and deleting toasts carry the sale number (**[proposed]**, AC29 allows it), so the owner learns the number the system gave; Mark delivered keeps the design's exact words.

**R7. Missing values.** A sale with no client shows **Walk-in**. A missing delivered date shows nothing (the row is only added once it exists). A line total that can't be worked out yet is a dash, `aria-hidden`, with `sr-only` "Not worked out yet" (never `NaN` or `₱0.00`, AC22).

**R8. Names never truncate on phones.** A long client name wraps and the card grows. Sizes never truncate: size names wrap inside their chip. Nothing scrolls sideways at any width (AC48).

### Flow

**Getting there.** Tap **Sales** in the bottom tabs (phone) or the sidebar or rail (tablet, desktop): **1 tap**. The Sales tab is highlighted, the title is "Sales", the subtitle is "Deliveries and on-site sales" (AC1, the design's), and the screen replaces the "coming soon" placeholder (`app/pages/sales.vue`). Still five tabs. On desktop and tablet the top bar shows **Add sale**; on phones a round **+** (FAB, 52px) sits bottom-right above the tab bar (AC2). Both are hidden while any sheet or dialog is open.

**A. Log a delivery with two sizes (the main path, AC12, AC28)**
`Sales → + → Log a sale (Delivery already selected) → Client → Size → trays → Add size → Size → trays → Save → toast "Delivery #1042 logged as pending" → the new card is at the top, highlighted`
1. Tap **+**. The sheet opens on **Delivery**, **one empty line**, **Sale date = today**, **Already delivered off**. On phones no keypad opens (it would hide the form before the owner has seen it). On desktop focus goes to Client.
2. Tap **Client**, type a few letters (the list narrows, accents and case ignored) and tap the client. If the client has a usual price, **it fills every line's price** and any line added later (AC18).
3. On line 1 tap the size **chip** (1 tap; there is no second tap to open a list). If the line's quantity is empty, focus then moves to **Trays** where the browser allows it; if not (iOS sometimes refuses), it is one tap on Trays. Type the trays, and Next (or a tap) for loose eggs if any.
4. Tap **Add size**. A new line appears below, scrolled into view, its size chips focused. Sizes already used are not selectable (S3). Repeat step 3.
5. Tap **Save** (pinned, always visible). The sale total is already visible in the footer, so the owner checks it against the notebook before saving.
- **After Save:** the sheet closes, focus returns to the **+**, the toast shows, and the new card is scrolled into view and highlighted (AC29). If the current filters would hide it, they're cleared first.
- **Main-path tap count, phone: 9 taps + typing** (+ 1, Client 2, choose client 3, Size 4, Trays 5, Add size 6, Size 7, Trays 8, Save 9). Prices are pre-filled from the client, the date is today, the type is already Delivery. Add 1 tap per line with loose eggs, 1 for each price the client has no usual price for, and 1 if the owner turns on **Already delivered**. Plus about two short swipes to bring **Add size** into view above the keypad. Typing is only the client search (3 or 4 letters) and the trays. **Estimate 35 to 45 seconds** from a notebook, inside the 60-second bar (AC28). **Desktop: 7 clicks** (the Add button, Client, choose, Size, Add size, Size, Save) with Tab moving between the number fields.

**B. Log an on-site sale, one size, walk-in (AC13, AC28)**
`Sales → + → On-site → Size → trays → price → Save → toast "Sale #1041 recorded"`
1. Tap **+** (1). Tap **On-site** (2): the Client field stays but reads "Walk-in (no client)" and says "Optional"; the "Already delivered" switch goes away.
2. Tap a size chip (3). Tap Trays (4) and type. Tap Price (5) and type (decimal keypad).
3. **Save** (6).
- **6 taps + typing** on a phone. **Estimate about 25 seconds**, inside the 45-second bar. If the walk-in is a regular: Client (7), choose (8). A price the client has as usual fills itself (no price tap).
- The stock check runs on Save, because an on-site sale takes stock at once (flow F).

**C. Log a delivery that has already gone out (AC24)**
`… flow A … → turn on Already delivered → the Delivered date appears, already today → Save → toast "Sale #1042 recorded"`
- **+1 tap** over flow A (10 taps). The Delivered date needs no tap when it's today. It is created **Complete**; the stock check runs on Save (flow F). Delivered date can't be before the sale date or in the future (messages in Copy).

**D. Mark a delivery delivered (AC33 to AC37)**
`Sales → "Mark delivered" on the pending card → small step (Delivered date = today) → Mark delivered → row updates in place → toast "Marked delivered — inventory updated"`
- **2 taps** from the list (the card's button, then the step's button). Also 2 from the ⋮ menu (⋮, Mark delivered) plus the step's button = 3. From the detail: open (1), Mark delivered (2), confirm (3).
- The step names the sale (number, client, sizes) so the owner can be sure it's the right one. If the delivery was on another date, the owner changes the date field first (+1 tap and the date pick).
- **Not enough stock:** the same step shows the short sizes, and the button reads **Mark delivered anyway**. Still 2 taps; the owner has read the warning, and no second dialog opens (AC35).
- If the current Status filter would hide the row after the change (Pending), it leaves the list and the toast says why (Copy).
- **Already marked elsewhere:** treated as done: same toast, list shows the real state, no scary message (AC37).

**E. Mark as pending, the undo (AC39)**
`⋮ on a Complete delivery → Mark as pending → the status changes in place → toast "Marked as pending — inventory updated"`
- **2 taps**, no confirmation (the reverse of Mark delivered; two taps undo it). Also a button in the detail. Not offered for an on-site sale (AC39). It is in the ⋮ menu and the detail only, not a button on the card, because it is a correction and not a daily action, and a button on every complete card would invite mistaps.

**F. When stock is short (AC26, AC35, AC42)**
- **Add (on-site, or delivery with "Already delivered"):** tapping Save first asks the server. If any size would end below 0, nothing is saved and a **"Not enough on hand"** dialog opens above the form naming each short size only (Copy, wireframe). **Go back** returns to the form with every value kept (focused, the safe choice). **Record anyway** saves. A pending delivery never asks.
- **Mark delivered:** the same warning is inside the step (D).
- **Edit:** the same dialog, only for sizes where this save takes **more** eggs out than the sale took before (AC42), using the sale's final state (AC66). Editing prices, dates or the client of a Complete sale never asks. Editing a sale that stays Pending never asks.
- One dialog for the whole sale, never one per size.

**G. Open a sale (AC6)**
`Sales → tap the card (phone) / the row (desktop) → Sale #1042 detail → actions`
- **1 tap.** The detail is an overlay on the list (a bottom sheet on phones, a right-hand slide-over on desktop), so the filters and the scroll position underneath stay as they were. Nothing is added to the address bar. Closing returns focus to the card or row.

**H. Edit a sale, including the type (AC40 to AC43, AC64 to AC66)**
`⋮ → Edit (or open the sale → Edit) → Edit sale #1042 (pre-filled) → change → Save → toast "Updated sale #1042"`
- **2 taps to open, then the field, then Save**. A price fix on a line: card (1), Edit (2), Price (3), Save (4), plus typing. Via ⋮: ⋮ (1), Edit (2), Price (3), Save (4).
- Same form as Log. The sale number is shown in the title and can't be changed. Fields are pre-filled: each line's trays and loose as plain digits, each price as plain digits with 2 decimals (`6.75`, no symbol). Focusing a pre-filled field selects its content, so typing replaces it (feature 01). Phones don't open the keypad on open.
- **Type change** (AC64 to AC66): the toggle works as in Log, and a **plain-language note appears at once** under it whenever the type differs from what was saved (Copy "Type change notes"). It says what will happen to the status, the date and the stock before the owner taps Save. Changing back removes the note and **restores the original date and client fields exactly as they were** (so an accidental tap loses nothing). No confirmation dialog: nothing is lost, and the stock warning (flow F) is the only guard.
  - **On-site → Delivery:** the client is now required (kept if it has one, even if inactive; a newly picked one must be active), and the **Already delivered** switch appears, off. Off: it becomes Pending, stock goes back on hand. On: a Delivered date appears (today), it stays Complete and stock doesn't move. **Taps for a Pending result:** ⋮, Edit, Delivery, (Client if none), Save = 4 taps, or 6 with a client to pick.
  - **Delivery → On-site:** the client becomes optional (can be removed with its ✕: the sale shows "Walk-in"), the **Sale date** field takes the one date (today, or the delivered date if it was delivered), and the delivered-date field and switch go away. From Pending, the shortfall check runs (flow F). ⋮, Edit, On-site, Save = **4 taps**.
- **Saving with nothing changed** closes the form: no request, no toast (AC40).
- **A sale with a size that has since been archived:** that line keeps it selected and shows **Archived** on the chip; the owner can save without touching it (AC41). Other lines and new lines offer active sizes only. Same for an inactive client (the field says `{Name} · Inactive`).
- If the row would leave the list because of the new type or status (for example a pending delivery becomes on-site while the Status filter is Pending), it leaves, and the toast says why (Copy).
- **Sale changed elsewhere (AC43):** the form closes, the list and detail refresh, a persistent toast says so, nothing was changed by mistake. The typed edits are dropped (X6). Same handling as feature 03 G.

**I. Delete a sale — Pending only (AC44, AC45)**
`⋮ → Delete (or the detail's Delete sale) → dialog ("your stock doesn't change") → Delete sale → row disappears → toast "Deleted sale #1042"`
- **3 taps.** Only offered on a Pending sale (owner correction, 2026-09-27 — a Complete sale has no Delete, see flow I2). The dialog names the sale; since a Pending sale never held stock, it always says "It hasn't left yet, so your stock doesn't change." Cancel is focused. A failure shows an alert in the dialog and the sale is untouched. If the sale was already deleted elsewhere it is treated as done. If it's no longer Pending (completed on another phone in the moment before Delete was confirmed), the dialog closes with a plain message pointing at Void, and the detail refreshes.

**I2. Void a complete sale (AC67, AC68) — owner correction, 2026-09-27**
`⋮ → Void (or the detail's Void sale) → dialog with the stock effect ("puts back on hand…") → Void sale → row shows Voided → toast "Sale #1042 voided"`
- **3 taps**, the same shape as flow I: deliberately "the same dialog, a different verb, no restore option" rather than a new interaction to learn — a Complete sale's Delete confirm already listed the stock effect per size; that same list now belongs to Void's confirm, because Delete no longer applies to a Complete sale. Cancel is focused. **No "are you sure, again"**: one confirm, like Delete. A failure shows an alert in the dialog and the sale is untouched. If it's no longer Complete (marked pending elsewhere) or already voided, the dialog closes with a plain message and the detail refreshes to the current state.
- Once voided, the row/card shows **Voided** (text, R5) and loses its ⋮ menu entirely (nothing left to do to it) — see the Row menu and States updates below.

**J. Find sales (AC7 to AC11, AC52)**
- **Status chips** are always on screen: **All** (default), **Pending**, **Complete**. `Pending` is the "what do I still owe" view (1 tap). It always shows every pending delivery (AC9), so it has no "Show more".
- **Phones:** the Status chips plus one **Filters** button that opens a panel with **Type** chips, the **Client** picker and the **From – To** dates (S9, decision O2). The button shows how many of those are set: `Filters (2)`.
- **Desktop and tablet:** everything on screen at once, as in the design, plus the Client picker: the date range and **Clear** on the first row, then Status chips, Type chips and the Client picker.
- **Client filter:** a searchable picker labelled "Client", **All clients** by default, listing every client active and inactive A to Z, with inactive ones marked `· Inactive`. Type to narrow. Choosing one shows that client's sales (their history, AC7). **The choice is in memory only**, never in the address bar, history or storage (AC11, AC60). Refreshing the page resets it.
- **From – To:** as in the design; both dates count; **Clear** empties both. `max` = today is **not** set here (sale dates are never in the future anyway); From after To shows "End date must be on or after the start date" on To, and the list keeps its previous filter until fixed.
- **Show voided sales** (owner correction, 2026-09-27): a switch, **off by default**, alongside the other filters (in the phone Filters panel; its own row on desktop/tablet). Off, a voided sale never appears, under any combination of the other filters (AC68) — this is not one of the "n filters" the Filters button counts, since off is the normal state. On, voided sales are included too, still subject to the other filters, each marked **Voided** wherever it shows (list, detail).
- While any filter is on, a line under the filters says `Showing 3 of 143 sales` with **Clear filters** (one tap resets everything, owner decision O2 of feature 03 reused).
- The list refreshes in place: the previous cards stay, with a small spinner beside the "Showing" line, until the new data arrives. No skeleton flash.
- **Show more:** at the end of a long list, `Showing 25 of 143 sales` and a **Show more** button add the next 25. The owner can also narrow with dates. With 5,000 sales the first 25 appear quickly (AC52).
- Filters reset on a fresh visit and last while the owner stays on the screen (AC8).

**K. First use (AC46)**
`Sales (no sales yet) → "No sales yet" card → Add sale → the same form (flow A or B)`
- The filters are hidden, the FAB or Add button stays, and the card has its own **Add sale** button. After the first save the card is replaced by the list with the new sale highlighted.

**L. New client from the sale form (AC14)**
`Client picker → "+ New client" → Add client (stacked on the sale form) → Save → back to the sale with the client chosen and every line intact`
- The picker's first row is always **+ New client** (44px, primary text with a plus icon), so a farm with no clients isn't at a dead end. If the owner has typed in the picker and nothing matches, the row reads `Add "Maple" as a new client` and passes the typed text as the starting name.
- The Add client sheet opens **on top of** the sale sheet (feature 03's overlay, unchanged, including "Mark {Name} active" when the name matches an inactive client, which returns that client as chosen). The sale form underneath keeps every value. Closing the client sheet without saving returns to the sale form with focus on Client. After a save, focus returns to Client, prices left blank are filled from the new client's usual price (AC18), and feature 03's toast "Added {Name}" shows.
- The FAB is hidden throughout. The sale form's own discard check does not fire when the client sheet opens or closes.

**M. Discard (AC32)**
Cancel, ✕, a tap on the overlay and Esc all do the same thing.
- **Log:** if nothing was entered (no client, size, quantity or price; the type and the date alone don't count), the form closes at once. Otherwise "Discard this entry?" with **Keep editing** (focused) and **Discard**.
- **Edit:** if nothing differs from the pre-filled values it closes at once; otherwise the same dialog with the Edit body (Copy).
- While saving, closing is disabled. It is the same `ConfirmDiscardDialog`. Swipe-to-close is not offered (as Production and Clients).

**N. Errors while saving (AC31)**
- **No signal or a server error:** an alert above the footer says `Couldn't save. Check your connection and try again.` Every value stays, Save is active again and tapping it retries. If the first try actually reached the server, the retry ends with one sale and one number (AC30).
- **The server refuses a rule** (a size archived meanwhile, a client made inactive meanwhile, too many lines): the same alert with a specific plain sentence (Copy). Nothing is created.

### Layouts

Wireframes aren't to scale. Legend: `[x]` enabled button · `(x)` chip or disabled control · `[⋮]` menu button · `(HF)` avatar · `[🗑]` remove-line button. Sample names and sizes come from the design; **numbers are only for the format** and follow AC22's example (Large 8 trays + 1 at ₱6.75 = ₱54.23, Medium 4 trays at ₱6.00 = ₱24.00, total ₱78.23).

#### Sales list, mobile (~375px), default
Main area `bg-muted`, p-4. Bottom padding clears the tab bar **and** the FAB: `calc(64px + env(safe-area-inset-bottom) + 84px)` (AC48).
```
┌───────────────────────────────────────────┐
│ Sales                               (HF)  │ top bar (shell). No Add button on phones
│ Deliveries and on-site sales              │
├───────────────────────────────────────────┤
│ (●All●) ( Pending ) ( Complete )          │ Status chips: UButton rounded-full, 44px, aria-pressed,
│ [ Filters ▾ ]                             │ selected = solid fill + bold. "Filters (2) ▾" when set
│ Showing 3 of 143 sales · Clear filters    │ only while a filter is on
│ ┌───────────────────────────────────────┐ │ card: bg-default, ring, rounded-2xl, p-4.
│ │ #1042 · Sep 27                   [⋮]  │ │ Whole card = one tap target (opens the detail); ⋮ and
│ │ Maple Street Market                   │ │ Mark delivered sit above it (z-10). Number 600, date muted.
│ │ Large · 8 trays + 1                   │ │ Client 600, wraps. Lines: size 500 · qty (formatQty),
│ │ Medium · 4 trays                      │ │ up to 3 shown, then "+ 2 more sizes"
│ │ ₱78.23 · 2 sizes                      │ │ total 600 (text-lg) · line count, always shown
│ │ [Delivery] [Pending] [Mark delivered] │ │ UBadge ×2 + UButton outline 44px, wraps if needed.
│ └───────────────────────────────────────┘ │ Button only on a Pending delivery
│ ┌───────────────────────────────────────┐ │
│ │ #1041 · Sep 27                   [⋮]  │ │
│ │ Walk-in                               │ │ plain text
│ │ Small · 1 tray                        │ │
│ │ ₱2.50 · 1 size                        │ │
│ │ [On-site] [Complete]                  │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ #1039 · Sep 20                   [⋮]  │ │
│ │ Linda Ferris                          │ │
│ │ Large · 3 trays                       │ │
│ │ Medium · 2 trays                      │ │
│ │ Jumbo · 1 tray                        │ │
│ │ ₱61.00 · 3 sizes                      │ │
│ │ [Delivery] [Complete] Delivered Sep 22│ │ "Delivered {date}" only when it differs from the sale date (AC4)
│ └───────────────────────────────────────┘ │
│ Showing 25 of 143 sales                   │ only when more exist
│ [            Show more            ]       │ outline, 44px, spinner while loading
│                                     (＋)  │ FAB 52px, aria-label "Add sale"
├───────────────────────────────────────────┤ bottom: 64px + safe area + 16px, right 16px
│ Dashboard Production [Sales] Inv Clients  │ tabs
└───────────────────────────────────────────┘
```
- **Card height** is about 190px for a two-size pending delivery, about 150px for a one-size on-site sale. About three cards show on a 667px phone.
- **Width check at 375px:** the card inner width is about 311px. The badges and button: Delivery about 64px + Pending about 66px + 8px gaps + Mark delivered about 142px (no icon, so it fits) = about 288px. If a large text size or a long word makes it not fit, the row wraps and the button goes on its own line. Nothing scrolls sideways.
- **The lines** show at most 3, then a text line `+ 2 more sizes` (the count line `· 5 sizes` already says how many there are; the full list is one tap away in the detail). A size name wraps and is never cut.
- **Card tap area:** a real `<button>` (accessible name `Open sale #1042, Maple Street Market, Pending`) stretches over the card (`after:absolute after:inset-0`). The card has a pressed state (`active:bg-elevated`).
- **Mark delivered** is on the card for every Pending delivery (AC3, AC33). It is `UButton` `color="neutral"` `variant="outline"`, `size="xl"` (44px): visible, but not the loudest thing on screen, because a wrong tap opens a step and not a change.

#### Filters panel, mobile (opened with Filters)
```
│ (●All●) ( Pending ) ( Complete )          │
│ [ Filters (2) ▴ ]                         │ UButton outline, 44px, aria-expanded
│ ┌───────────────────────────────────────┐ │ panel: bg-default, ring, rounded-2xl, p-3
│ │ (●All types●) ( Delivery ) ( On-site ) │ │ Type chips
│ │ Client                                 │ │ visible label
│ │ [ All clients                       ▾ ]│ │ USelectMenu, searchable, 44px
│ │ Sale date                              │ │
│ │ [ From mm/dd/yyyy ] – [ To mm/dd/yyyy ]│ │ UInput type=date ×2, 44px (hidden labels From, To)
│ │ [ Clear dates ]                        │ │ only when a date is set
│ │ Show voided sales              ( o )   │ │ USwitch, off by default, not counted in "Filters (n)"
│ └───────────────────────────────────────┘ │
```
- The panel stays open until the owner closes it. Changing a chip, a date or the voided switch updates the list underneath at once.

#### Sales list, desktop (≥1024px) and tablet (768–1023px)
Content centred at max 1120px (shell). The table is used when the list area is **at least about 720px wide**, otherwise the phone cards (measured with the area's width, as Clients does). At 1024px with the sidebar open the area is about 750px, so the table still shows; a tablet with the sidebar expanded gets cards (AC49).
```
┌──────────────┬───────────────────────────────────────────────────────────────────────────┐
│ [logo] Tamago│ «  Sales                                                   [ + Add sale ] │ UButton primary, lg; 44px on tablet
│              │    Deliveries and on-site sales                                           │
├──────────────┼───────────────────────────────────────────────────────────────────────────┤
│  Dashboard   │ [ 09/01/2026 ] – [ 09/27/2026 ] [Clear]     (design row 1, inputs 150px)  │
│  Production  │ (●All●)(Pending)(Complete) │ (●All types●)(Delivery)(On-site)  [All clients ▾]│ chips (design) + Client select 200px
│ ▌Sales       │ Showing 3 of 143 sales · Clear filters                                    │
│  Inventory   │ ┌───────────────────────────────────────────────────────────────────────┐ │
│  Clients     │ │ Sale     Client              Sizes              Total    Status       │ │ table wrapper: bg-default, ring, rounded-xl (design)
│              │ ├───────────────────────────────────────────────────────────────────────┤ │ header: text-sm 500 muted (design)
│              │ │ #1042    Maple Street Market Large · 8 trays + 1  ₱78.23  [Pending]   │ │
│              │ │ Sep 27   [Delivery]          Medium · 4 trays             [Mark deliv…]│ │ Status cell: badge, then the button, then
│              │ │                                                            [⋮]        │ │ "Delivered {date}" text. ⋮ in the last column
│              │ ├───────────────────────────────────────────────────────────────────────┤ │
│              │ │ #1041    Walk-in             Small · 1 tray            ₱2.50  [Complete]│ │
│              │ │ Sep 27   [On-site]                                             [⋮]    │ │
│              │ └───────────────────────────────────────────────────────────────────────┘ │
│              │ Showing 25 of 143 sales   [ Show more ]                                   │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```
- **Columns:** **Sale** (number 600 over the date, muted), **Client** (name 600, wraps, with the Type badge under it), **Sizes** (one line per size, `Large · 8 trays + 1`, up to 3 then `+ 2 more sizes`), **Total** (right-aligned, 600), **Status** (badge, then **Mark delivered** for a Pending delivery, then `Delivered Sep 22` when the date differs), and a 48px actions column with the ⋮. Header text for the first column is `Sale`. The table has a visually hidden `<caption>` "Sales".
- **Why Type sits under the client and there is no Price column:** the design's seven columns (Date, Client, Size · qty, Price, Type, Status, ⋮) don't fit the 750px area at 1024px with the sidebar open, and a price per row is now a total for several sizes (S5, S6). The date and the sale number share the first column.
- **Row click** opens the detail (AC6). The number is a real `<button>` (`Open sale #1042`) so keyboard and screen readers can reach it. Mark delivered and ⋮ are separate buttons and don't trigger the row click. Rows have a hover state.
- **Sizes:** desktop rows are as tall as their size lines (about 56px for one size, 96px for three). At lg, controls may be 40px (as feature 01): **Mark delivered** is a `size="md"` outline button, the ⋮ 40px.
- **Toolbar:** at 1024px the second row wraps if it doesn't fit (Client select drops to its own line). All controls are 44px on tablet and 40px at lg. The **Show voided sales** switch (owner correction, 2026-09-27) sits at the end of the toolbar row, off by default, same behaviour as the phone panel's.

#### Row menu (⋮), mobile and desktop
`UDropdownMenu`, opens down, right-aligned. Items are 44px on phones and tablets (36px at lg). **A Voided sale has no ⋮ at all** (nothing left to do to it, AC68) — its row/card shows only the Voided marker.
```
 Pending delivery          Complete delivery         On-site sale         Voided (any)
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│ 🚚 Mark delivered  │    │ ↩ Mark as pending  │    │ ✎  Edit            │    no ⋮ — nothing to do
│ ✎  Edit            │    │ ✎  Edit            │    │ ─────────────────  │
│ ─────────────────  │    │ ─────────────────  │    │ 🚫 Void (red)      │
│ 🗑 Delete (red)    │    │ 🚫 Void (red)      │    └────────────────────┘
└────────────────────┘    └────────────────────┘
```
- Icons: `i-lucide-truck`, `i-lucide-undo-2`, `i-lucide-pencil`, `i-lucide-trash-2`, `i-lucide-ban` (Void). **Delete** (Pending only) and **Void** (Complete/on-site only) are both red with their icon and a separator above, because both are one-way. **A Complete or on-site sale never shows Delete; a Pending sale never shows Void** (owner correction, 2026-09-27 — AC44, AC67). The trigger's accessible name is `Actions for sale #1042`. Esc or a tap outside closes it and returns focus to the ⋮.
- The status action is first, so the most common action is under the thumb, then Edit. The order is fixed for each type.

#### Log a sale: mobile bottom sheet (~375px), Delivery with two lines
The design's sheet, as Production and Clients: bottom-aligned, top corners 16px, `max-height: min(88dvh, visual viewport − 1rem)`, overlay `rgba(15,23,43,.5)` + 4px blur, lifted above the keypad (`useSheetKeyboard`). Header and footer are fixed; the body scrolls. Body padding 16px.
```
┌───────────────────────────────────────────┐
│ Log a sale                           [✕]  │ header: text-lg 700 · ✕ 44×44
├───────────────────────────────────────────┤
│ [ 🚚 Delivery ]  [ 🛍 On-site ]           │ 2-button radio group, 44px, as the design, selected =
│                                           │ solid fill + bold. aria "Sale type"
│ Client                                    │ UFormField label (text-base 500)
│ [ Maple Street Market                 ▾ ] │ USelectMenu, searchable, 44px
│                                           │
│ ┌───────────────────────────────────────┐ │ line card: bg-muted, radius-md, p-3 (Production's row).
│ │ Size                             [🗑] │ │ <fieldset>, sr-only legend "Size 1". 🗑 44×44 only with
│ │ ┌─────────────┐ ┌─────────────┐       │ │ 2+ lines. Chips: 2-column grid, 44px min, radio group
│ │ │ ● Small     │ │ ● Medium    │       │ │ ● = size colour dot, decorative
│ │ └─────────────┘ └─────────────┘       │ │
│ │ ┌─────────────┐ ┌─────────────┐       │ │
│ │ │ ✓ Large     │ │ ● Jumbo     │       │ │ selected: primary ring + tint + check icon + bold
│ │ └─────────────┘ └─────────────┘       │ │
│ │ 12 trays on hand for this size.       │ │ text-sm dimmed (the design's words), per line
│ │         Trays            Loose        │ │ column headers, text-sm dimmed
│ │ [−][  8 ][+]        [−][  1 ][+]      │ │ shared QuantityInput: 148 + 12 + 148 = 308px
│ │ Price per tray             Usual price│ │ label · note only while it's the client's pre-filled value
│ │ [ ₱ │ 6.75        ]     Line total    │ │ UInput inputmode="decimal", prefix = farm currency
│ │                            ₱54.23      │ │ line total 600, tabular-nums; dash when not ready
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Size                             [🗑] │ │
│ │ ┌─────────────┐ ┌─────────────┐       │ │
│ │ │ ✓ Medium    │ │ ○ Small     │       │ │
│ │ ├─────────────┤ ├─────────────┤       │ │ used by line 1: dashed, dimmed, second line of text
│ │ │ Large       │ │ ● Jumbo     │       │ │
│ │ │ In this sale│ │             │       │ │
│ │ └─────────────┘ └─────────────┘       │ │
│ │ 0 on hand for this size.              │ │
│ │ …trays / loose / price / total…       │ │
│ └───────────────────────────────────────┘ │
│ [ + Add size ]                            │ dashed outline, 44px, full width
│ Sale date                                 │
│ [ 09/27/2026                          📅 ]│ UInput type=date, max = today, 44px
│ Today                                     │ hint: "Today" or "Wednesday, Sep 24"
│ Already delivered                   ( o ) │ USwitch, whole row 44px is the tap target (label on the left)
├───────────────────────────────────────────┤ footer: pinned above the keypad
│ Sale total                        ₱78.23  │ text-base 600 · live (aria-live polite)
│ [ Cancel ]   [          Save          ]   │ Cancel: ghost 44px · Save: primary, flex-1, 44px
└───────────────────────────────────────────┘ + safe-area bottom padding
```
- **Chip order** is the farm's size order, row by row, in a 2-column grid (about 151px each). Tap targets are the full chip. The size list is whatever the farm has (never fixed at four).
- **A used size (S3):** stays in the group but is **not selectable**: a dashed border, dimmed text, `aria-disabled`, and a second line **In this sale** so it isn't colour or shape alone. Screen readers hear "Large, in this sale, unavailable". A tap does nothing. If the farm has more than **6 active sizes**, the picker becomes a native select (`USelect`, the phone's own picker, as feature 03's status filter) with used sizes as `disabled` options reading `Large (in this sale)`, so a 10-size farm's lines don't grow to 250px of chips each.
- **A size chosen on a line with nothing else typed** moves focus to that line's Trays (where allowed). Changing a size on a line that already has a quantity **doesn't** move focus.
- **Sale total (footer):** the sum of the lines that are complete. While a line is incomplete it reads `Sale total so far ₱54.23` (X4); with no complete line `Sale total —`.
- **With the keypad open:** the sheet is lifted to the visible area and the focused field is scrolled to the centre. The footer condenses to one row: `Sale total ₱78.23` on the left and **Save** on the right (Cancel is the header's ✕), which saves about 44px so a whole line card is nearly visible. It goes back to two rows when the keypad closes. [proposed; the FE verifies it on iOS Safari and Android Chrome, feature 01 AC5.]
- **Height:** header 56 + body about 130 (type, client) + 250 per line + 56 Add size + about 150 (date, switch) + footer about 100. A two-line sale scrolls about 1.3 screens. A 20-line sale scrolls about 20 line-cards and stays usable because the header and footer are pinned and Add size moves the view to the new line (AC51).
- **Add size** at the limits: disabled (`aria-disabled`, dimmed) with the reason under it: `All your sizes are in this sale.` or `A sale can have up to 20 sizes.` (AC15).
- **Remove line** (🗑, `aria-label` "Remove Large line", or "Remove line 2" if no size yet) takes the line away at once, no confirmation (only one line's typed values are lost; the total updates). Focus moves to the previous line's size chips (or Add size). Hidden while only one line remains, and the size row keeps its height so nothing jumps.
- **Input attributes:** trays and loose as the shared `QuantityInput` (`inputmode="numeric"`, `pattern="[0-9]*"`, `enterkeyhint="next"`, 44px steppers skipped by Tab); price `type="text"` `inputmode="decimal"` `autocomplete="off"` with `enterkeyhint="next"`, and `"go"` on the last line's price. iOS's decimal keypad has no Return key: the owner taps Save (pinned, always visible).
- **Enter / Go:** on the last field of the form it saves. On other fields it moves to the next (X2).
- **Order of fields for Next:** Client → line 1 trays → loose → price → line 2 trays → … → Sale date. Size chips are tapped, not tabbed through (arrow keys move between them on desktop).

#### Log a sale: On-site (mobile, the differences)
```
│ [ 🚚 Delivery ]  [✓🛍 On-site ]           │
│ Client                          Optional  │ hint slot
│ [ Walk-in (no client)              ▾ ]    │ placeholder. With a client chosen, an inline ✕ (44px,
│                                           │ aria "Remove client") clears it back to Walk-in
│ … lines as above, prices typed by hand …  │
│ Sale date                                 │
│ [ 09/27/2026 ]  Today                     │ no "Already delivered" switch (AC24)
```
- Switching the toggle **keeps the client, every line, the date and the switch's state** (AC13). Switching to On-site hides the switch and the delivered date but remembers them; switching back restores them.

#### Log a sale: Delivery, "Already delivered" on (mobile, the differences)
```
│ Already delivered                   ( ●) │ on
│ Delivered date                            │ appears, default today
│ [ 09/27/2026                          📅 ]│ max = today, min = the sale date
│ Today                                     │
```

#### Client picker (open)
`USelectMenu` popover under the field on tablets and desktop; on phones it is the same control, lifted above the keypad (the FE verifies it opens in view inside the sheet, and falls back to a nested sheet if it doesn't).
```
┌───────────────────────────────────────┐
│ 🔍 Search clients…                  ✕ │ 44px
├───────────────────────────────────────┤
│ ＋ New client                          │ first row, primary text, 44px, always there
├───────────────────────────────────────┤
│ Linda Ferris                          │ 44px rows, A to Z, active clients only (AC13)
│ Maple Street Market                   │
│ Sam & Dana Coyle                      │
└───────────────────────────────────────┘
 Nothing matches "zzz":   ＋ Add "zzz" as a new client
 No active clients at all: "No clients yet. Add your first client."  + the ＋ New client row
```
- On Edit, the sale's own inactive client is shown selected as `Oakhill Bakery · Inactive` and stays valid; it isn't listed for others.

#### Log a sale: desktop dialog (≥768px)
`UModal`, centred, **max-width 640px** (the design's dialog is 480px, which can't hold a size, quantity, price and total in a row; S1), `max-height: 85vh`, 16px radius. Controls are `lg` (40px) on desktop and 44px on tablet. Body padding 20px (design).
```
┌────────────────────────────────────────────────────────────────────┐
│ Log a sale                                                    [✕]  │
├────────────────────────────────────────────────────────────────────┤
│ [ 🚚 Delivery ][ 🛍 On-site ]                                      │
│ Client                                                             │
│ [ Maple Street Market                                        ▾ ]   │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Size    ( Small ) ( Medium ) (✓ Large ) ( Jumbo )         [🗑] │ │ chips in one row (4), wrap if more
│ │         12 trays on hand for this size.                        │ │
│ │ Quantity  trays [−][ 8 ][+]   loose [−][ 1 ][+]                │ │ inline "trays" / "loose" (feature 01)
│ │ Price per tray [₱│ 6.75 ]  Usual price          Line total ₱54.23│ │
│ └────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Size    ( Small ) (✓ Medium ) ( Large: in this sale ) ( Jumbo )│ │ used size: dashed + "in this sale"
│ │ …                                                              │ │
│ └────────────────────────────────────────────────────────────────┘ │
│ [ + Add size ]                                                     │
│ Sale date [ 09/27/2026 ] Today            Already delivered ( o )  │ one row
├────────────────────────────────────────────────────────────────────┤
│ Sale total ₱78.23                             [ Cancel ]  [ Save ] │ total left, buttons right (design order)
└────────────────────────────────────────────────────────────────────┘
```
- The form is a `UForm` in every layout. Tab moves between the number fields, and **Enter on the last field saves**.
- On desktop the size chips sit in one row per line (4 seeded sizes need about 340px); more than 6 sizes uses the select.

#### Edit sale (same form)
```
┌───────────────────────────────────────────┐
│ Edit sale #1042                      [✕]  │ number in the title, not editable
├───────────────────────────────────────────┤
│ [✓🚚 Delivery ]  [ 🛍 On-site ]           │ can be changed (AC40); note appears when it differs
│ …                                         │
```
**Type change notes** (`UAlert`, `color="info"`, `variant="subtle"`, icon, `role="status"`, right under the toggle; text in Copy). Shown only while the type differs from the saved one:
```
 A. On-site → Delivery, switch off            B. On-site → Delivery, switch on
│ [✓🚚 Delivery ]  [ 🛍 On-site ]         │  │ [✓🚚 Delivery ]  [ 🛍 On-site ]         │
│ ⓘ This becomes a pending delivery.     │  │ ⓘ It stays delivered, and your stock   │
│   Its trays go back on hand until you  │  │   doesn't change.                       │
│   mark it delivered.                   │  │ …                                       │
│ Client  [ Choose a client…          ▾ ]│  │ Already delivered                ( ●)   │
│ ⚠ Choose a client.   (when empty, Save)│  │ Delivered date [ 09/27/2026 ]           │
│ …                                      │  │                                         │
│ Already delivered                ( o )  │  └─────────────────────────────────────────┘

 C. Delivery (pending) → On-site              D. Delivery (already delivered) → On-site
│ [ 🚚 Delivery ]  [✓🛍 On-site ]         │  │ [ 🚚 Delivery ]  [✓🛍 On-site ]         │
│ ⓘ This becomes an on-site sale. Its    │  │ ⓘ This becomes an on-site sale, dated  │
│   trays come out of your stock now.    │  │   Sep 29. Your stock doesn't change,   │
│ Client   Optional [ Maple Street Mkt ✕ ]│  │   because it already left.             │
│ Sale date [ 09/27/2026 ]  Today         │  │ Sale date [ 09/29/2026 ]               │
```
- In **C** and **D** the date field is the sale's single date. Its label stays **Sale date**; its value is the AC65 default (today, or the delivered date). If the owner switches the type back, the original sale date (and delivered date) return exactly as they were.
- The "Already delivered" switch appears **only** when switching On-site → Delivery (A/B). An unchanged Delivery has no switch: its status changes only through **Mark delivered** and **Mark as pending** (AC33, AC39).
- A **Complete delivery** in Edit shows a **Delivered date** field after Sale date (AC40). A **Pending delivery** doesn't.

#### Sale detail (mobile bottom sheet, desktop right slide-over)
A phone sheet up to `88dvh` (`UDrawer`/`UModal` styled as the other sheets, ✕ 44px); on desktop a **slide-over at the right, 480px** (`USlideover`). Read-only. No discard check. Pending delivery shown:
```
┌───────────────────────────────────────────┐
│ Sale #1042                           [✕]  │ header: text-lg 700
├───────────────────────────────────────────┤
│ [Delivery] [Pending]                      │ badges (R5)
│ Your stock hasn't changed yet.            │ text-sm muted, only for a Pending delivery [proposed]
│                                           │
│ Client        Maple Street Market         │ a <dl>: label muted, value 600. Inactive client:
│ Sale date     Sep 27, 2026                │ "Maple Street Market · Inactive"
│ Delivered     Sep 29, 2026                │ row only once delivered
│ ───────────────────────────────────────── │
│ Large                             ₱54.23  │ one block per line: size 600 + line total 600
│ 8 trays + 1 at ₱6.75 / tray               │ quantity (formatQty) at price per tray, text-sm muted
│ Medium                            ₱24.00  │
│ 4 trays at ₱6.00 / tray                   │
│ ───────────────────────────────────────── │
│ Sale total                        ₱78.23  │ text-lg 700
│                                           │
│ [ 🗑 Delete sale ]                        │ Pending only: ghost, red text + icon, 44px, end of scroll area
│ [ 🚫 Void sale ]                          │ Complete/on-site only (replaces Delete sale): same style
├───────────────────────────────────────────┤ footer pinned
│ [ Edit ]   [      Mark delivered      ]   │ Edit: outline · Mark delivered: primary, flex-1
└───────────────────────────────────────────┘
```
- **Footer by state:** Pending delivery: **Edit** + **Mark delivered** (primary), **Delete sale** in the body. Complete delivery: **Edit** + **Mark as pending** (outline), **Void sale** in the body (Delete is not offered, owner correction 2026-09-27). On-site: **Edit** only, full width, **Void sale** in the body. **Voided** (any original type): no footer buttons and no Delete/Void in the body at all — read-only, with a note "This sale is voided. It no longer counts toward your stock." above the lines (badges still show its original type and status, plus **Voided**).
- **Six lines** read as six two-line blocks, no horizontal scrolling on 375px (AC6). An **Archived** size shows `Large · Archived` (badge `neutral` `subtle`) and a line keeps its name.
- **Invoice-ready, nothing printed (AC56):** the block above is deliberately the document an invoice will show: the sale number as the heading, the date and client, each line as size, quantity, price per tray and line total, then the sale total. Nothing else is added and nothing is disabled or "coming soon". When the invoice feature (07) arrives, a **Print invoice** button joins the footer's actions and the print layout is built from the same fields; nothing here has to change.
- After **Mark delivered / Mark as pending** the detail stays open and updates in place (badge, delivered date, footer). After **Edit** saves, it shows the new values. After **Delete**, it closes. **After Void, the detail stays open and updates in place** (the Voided badge appears, the footer and Delete/Void buttons disappear) — voiding doesn't remove the row the way deleting does, so there's nothing to navigate away from.
- Desktop uses the same block in the 480px slide-over. Esc closes it. Focus returns to the row's number button.

#### Mark delivered step (AC33, AC35)
`UModal` styled as the bottom sheet on phones and a centred **420px** dialog at md+. Small: no scrolling on a phone.
```
┌───────────────────────────────────────────┐        ┌───────────────────────────────────────────┐
│ Mark delivered                       [✕]  │        │ Mark delivered                       [✕]  │
├───────────────────────────────────────────┤        ├───────────────────────────────────────────┤
│ #1042 · Maple Street Market               │        │ #1042 · Maple Street Market               │
│ Large 8 trays + 1 · Medium 4 trays        │        │ Large 8 trays + 1 · Medium 4 trays        │
│ Delivered date                            │        │ Delivered date                            │
│ [ 09/27/2026                          📅 ]│        │ [ 09/27/2026                          📅 ]│
│ Today · sale date Sep 20                  │        │ Today · sale date Sep 20                  │
│                                           │        │ ┌ (!) Not enough on hand:             ┐   │
│                                           │        │ │ Large: 3 trays on hand, you're      │   │
│                                           │        │ │ delivering 8 trays + 1              │   │
│                                           │        │ │ You can still mark it delivered.    │   │
│                                           │        │ └─────────────────────────────────────┘   │
├───────────────────────────────────────────┤        ├───────────────────────────────────────────┤
│ [ Cancel ]   [    Mark delivered     ]    │        │ [ Cancel ] [ Mark delivered anyway ]      │
└───────────────────────────────────────────┘        └───────────────────────────────────────────┘
```
- The date is **today** and the button is **focused**, so Enter confirms. The date input's `min` is the sale date and `max` is today. An impossible date shows the message under the field and dims the button.
- The sale is named the same way the card names it (number, client or "Walk-in" is not possible for a delivery, sizes). At most three sizes are listed, then `+ 2 more sizes`.
- The warning is a `UAlert` (`color="warning"`, `variant="soft"`, icon, dark text: readable in sunlight, not colour alone). It names **only** the short sizes. It is worked out from the on-hand figures the screen already has, refreshed when the step opens (a quick "Checking stock…" line while it does); the server also checks, so a stale figure still ends in the right answer (Data the UI needs, 4).
- While confirming, the button shows a spinner and everything is read-only. On failure the step closes and a **persistent error toast with Try again** appears (AC37); Try again repeats the same date without reopening.

#### Stock-shortfall confirm (Add and Edit, AC26, AC42)
The centred dialog used for confirms (max 400px, buttons stacked on phones with the primary on top), above the form, which stays open and untouched beneath.
```
┌─────────────────────────────────────┐
│ Not enough on hand                  │
│ You're selling more than you have   │
│ of:                                 │
│  • Large: 3 trays on hand,          │
│    you're selling 8 trays           │
│  • Jumbo: 0 on hand,                │
│    you're selling 2 trays           │
│ Record it anyway?                   │
│                                     │
│ [ Record anyway ]                   │ primary (phones: top)
│ [   Go back   ]                     │ neutral outline, focused (the safe choice)
└─────────────────────────────────────┘
```
- Lists **only** short sizes, in the farm's size order. Sizes with enough stock aren't named. The verbs follow the action: **selling** (Add on-site, Delivery → On-site), **adding** for an Edit that raises a Complete line (`you're adding 3 trays`), **delivering** (Add with Already delivered, Mark delivered).
- Numbers are `formatQty`; zero reads `0`.
- **Go back** closes the dialog and returns to the form with every value kept and focus on the Save button. **Record anyway** saves; while it runs the button shows a spinner. If it fails, the form's own alert shows.

#### Delete confirm — Pending only (AC44, AC45)
Centred dialog, max 400px, buttons stack on phones with **Delete sale** on top. **Cancel** is focused. **Only ever shown for a Pending sale** (owner correction, 2026-09-27): a Complete sale's ⋮/detail offers Void instead (below), never Delete.
```
┌─────────────────────────────────────┐
│ Delete sale #1042?                  │
│ Maple Street Market · 2 sizes · ₱78.23│
│ It hasn't left yet, so your stock   │
│ doesn't change.                     │
│ You can't undo this. The number     │
│ #1042 won't be used again.          │
│ ┌(!) Couldn't delete. Check your   ┐│ only after a failure
│ └   connection and try again.      ┘│
│ [ Delete sale ]                     │
│ [    Cancel   ]                     │
└─────────────────────────────────────┘
```
- **Delete sale**: `color="error"` solid with `i-lucide-trash-2`, spinner while deleting. Desktop: side by side, right-aligned.
- A Pending sale's stock line is always "It hasn't left yet, so your stock doesn't change" (it never had a stock effect to list).

#### Void confirm — Complete/on-site only (AC67, AC68)
Same shape as Delete confirm — deliberately the same dialog, a different verb, and no restore option to explain, per the owner's correction. Centred dialog, max 400px, buttons stack on phones with **Void sale** on top. **Cancel** is focused.
```
┌─────────────────────────────────────┐
│ Void sale #1041?                    │
│ Walk-in · 2 sizes · ₱78.23          │
│ This puts back on hand:             │
│   Large: 8 trays + 1                │
│   Medium: 4 trays                   │
│ You can't undo this. It stays in    │
│ your records, marked Voided.        │
│ ┌(!) Couldn't void. Check your     ┐│ only after a failure
│ └   connection and try again.      ┘│
│ [ Void sale ]                       │
│ [   Cancel  ]                       │
└─────────────────────────────────────┘
```
- **Void sale**: `color="error"` solid with `i-lucide-ban`, spinner while voiding. Desktop: side by side, right-aligned.
- Stock lines list one size per line, in the farm's order, from that sale's lines only — the same list a Complete sale's Delete confirm used to show, moved here because Delete no longer applies to a Complete sale.
- Unlike Delete, the row **doesn't disappear**: it stays in the list (unless the "Show voided sales" toggle is off, in which case it leaves the current view the way any other filtered-out row does) and its own badge changes to **Voided**.

#### Discard dialog
The existing `ConfirmDiscardDialog`. Only the wording is new (Copy).

#### First use, no match, loading and load failure (mobile, inside the main area)
```
 First use (AC46)                       No match (AC10)                       Load failure (AC47)
┌──────────────────────────────┐   (●All●) ( Pending ) ( Complete )       ┌──────────────────────────────┐
│       (◯ shopping-cart)      │   [ Filters (1) ▾ ]                       │          (☁︎ off)             │
│         No sales yet         │   Showing 0 of 143 sales · Clear filters  │  Couldn't load your sales    │
│ Log your first sale or       │   ┌──────────────────────────────┐        │  Check your connection and   │
│ delivery and it will show    │   │ No sales match these filters.│        │  try again.                  │
│ here, newest first.          │   │ [   Clear filters   ]        │        │  [ ⟳ Try again ]             │
│ [ + Add sale ]               │   └──────────────────────────────┘        └──────────────────────────────┘
└──────────────────────────────┘
 Loading (AC47): the Status chips shown but disabled · 4 card skeletons (USkeleton, ~170px, rounded-2xl)
```
- First use and load failure use the `AppPlaceholder` card look (56px tinted circle, heading, body, button), max 560px, centred at the top. Skeletons on desktop are 5 table-row skeletons under the real header.

### States

| Area | State | What the owner sees |
|---|---|---|
| Screen | **Loading (AC47)** | Title "Sales" and its subtitle. The filters render **disabled**. In place of the list: 4 skeleton cards (phone) or 5 skeleton rows (table). The empty state never shows while loading. The FAB and Add sale stay visible and work (the form doesn't need the list; it needs sizes, clients and stock figures, which show their own "Checking stock…" if late). |
| | **Default** | Filters, then the list newest first (sale date, then highest number). |
| | **Refreshing** | If the list is known, it shows at once and refreshes quietly (no skeleton). A small spinner beside the "Showing" line while a filter change loads. A quiet refresh that fails changes nothing except a persistent error toast `Couldn't refresh your sales.` + **Try again**. |
| | **Load failure (AC47)** | In place of the filters and list: the card with `i-lucide-cloud-off`, heading "Couldn't load your sales", body "Check your connection and try again.", **Try again** (primary, xl, spinner while retrying). No blank screen, no empty state. Add sale and the FAB stay. |
| | **First use (AC46)** | `AppPlaceholder`: `i-lucide-shopping-cart`, "No sales yet", body, **Add sale**. Filters hidden. No sample data, none of the design's sample sales or names. |
| | **No match (AC10)** | Filters stay usable. Under them `Showing 0 of {n} sales · Clear filters`. In the list area: "No sales match these filters." (the design's) and a **Clear filters** button (outline, 44px). Clearing puts focus on the Status chip **All**. |
| | **Pending filter, nothing owed** | Same headline, plus a second line "You don't have any pending deliveries." (shown when Status = Pending is the only filter). |
| | **Filtered** | `Showing {x} of {n} sales · Clear filters` (only while a filter is on). Every pending sale is shown with the Pending filter (AC9). |
| | **Show more** | `Showing 25 of 143 sales` and **Show more**; the button shows a spinner while it loads, and the new cards are appended without moving the ones on screen. A failure shows a toast `Couldn't load more sales.` + **Try again**. |
| | **Signed out (AC61)** | On sign-out the list, the filters, the client picker's text and any open form or detail are discarded. Nothing stays in memory or the URL. Back doesn't show the list. Another farm signing in on the same device starts at Loading and never sees the previous farm's sales or clients, even briefly. |
| | **Session expired while a form is open** | The shell takes over (feature 00). Typed values are lost. No extra design. |
| Card / row | **Pending delivery** | Number, date, client, lines, total, `Delivery` `Pending` badges, **Mark delivered**, ⋮. |
| | **Complete delivery** | Same without the button. `Delivered {date}` when it differs from the sale date (AC4). |
| | **On-site** | `On-site` `Complete`. Client name or **Walk-in**. |
| | **Inactive client / archived size** | The client name is shown as usual (no badge in the list; the detail and Edit say Inactive). Sizes show their name; the detail says Archived. Nothing changed (AC38). |
| | **Voided (AC67, AC68)** | A `Voided` text badge (`neutral`, `subtle`) beside its original `Delivery`/`On-site` and `Pending`/`Complete` badges (`Pending` never applies — only a Complete sale can be voided). No ⋮, no Mark delivered button. Hidden from the list unless "Show voided sales" is on. |
| | **Many sizes** | Up to 3 lines, then `+ N more sizes`; the count in the total line is always exact. |
| | **Busy (R1)** | The ⋮ and the Mark delivered button show spinners and are disabled. The status text stays until the answer comes. |
| | **Just changed** | 1.5s highlight, scrolled into view. |
| | **Row left the list** | After Mark delivered, Mark as pending or an Edit that no longer matches the filters: the row leaves and the toast says why (Copy). Focus moves to the next card's name button (or the Status chip All if none). |
| | **Mark failed** | Persistent error toast with **Try again**. The row is unchanged and its buttons work again. |
| | **Changed elsewhere** | The list refreshes and a persistent error toast says so. |
| Form (Log and Edit) | **Default (Log)** | Delivery selected, Client empty, one empty line, Sale date today, Already delivered off, Save enabled, footer `Sale total —`. |
| | **Default (Edit)** | Pre-filled, number in the title, Save enabled. |
| | **Stock hint (AC25)** | Under a chosen size: `12 trays on hand for this size.` It updates when the size changes and after any save. While the figure loads: `Checking stock…`. If it can't be loaded: `Couldn't check stock.` and Save is unaffected (the server still checks). Never negative on screen, never blank. |
| | **Price pre-fill (AC18)** | Choosing a client with a usual price fills every line whose price the owner hasn't typed, and each line added later; the note `Usual price` shows beside the label until the owner changes the value. Typed prices are never overwritten. A client with no usual price leaves prices alone. |
| | **Line total (AC22)** | `₱54.23` once quantity and price are valid; a dash otherwise. |
| | **Validation: header (AC13, AC23, AC24)** | Client blank on a Delivery; future sale date; blank date; delivered date before the sale date or in the future. Messages in Copy. |
| | **Validation: line (AC15, AC19, AC20)** | No size; quantity 0 or blank; loose too high; not a whole number; more than 100,000 eggs; price blank, zero, not a number, too many decimals, too high. The message is under the field, in that line's card. The other lines' typed values stay. |
| | **Save blocked** | Save dimmed and `aria-disabled` only while a message shows. The first invalid field is focused and scrolled to. |
| | **Add size unavailable (AC15)** | Dimmed, with the reason under it. |
| | **Saving (AC30)** | Spinner on Save, disabled, fields read-only, closing disabled. Many taps still send one request. |
| | **Save failed (AC31)** | Alert above the footer, values kept, Save active again, retry sends the same submit. |
| | **Stock short (AC26)** | The confirm dialog (flow F). |
| | **Nothing changed (Edit, AC40)** | Save closes the form. No request, no toast. |
| | **Changed elsewhere (Edit, AC43)** | The form closes, the list and detail refresh, a persistent toast. |
| | **Discard check (AC32)** | The dialog in flow M. |
| | **Success (AC29)** | The form closes, the toast shows, the new row is highlighted (R1). |
| Mark delivered step | **Default** | Date today, button focused. |
| | **Short stock** | Warning inside the step, button reads **Mark delivered anyway**. |
| | **Bad date** | Message under the date, button dimmed. |
| | **Confirming / failed / already done** | Spinner. Failure: step closes, persistent toast with **Try again**. Already done elsewhere: same success toast (AC37). |
| Detail | **Default** | Header, badges, lines, total, footer actions by state. |
| | **Busy** | The footer button shows a spinner; other actions stay usable only after it. |
| | **Voided (AC67, AC68)** | Read-only: original badges + **Voided**, the note "This sale is voided. It no longer counts toward your stock.", no footer buttons, no Delete/Void in the body. |
| | **Sale gone** | If it was deleted elsewhere while open: the detail closes and a toast says "This sale was deleted somewhere else." **If it was voided elsewhere while open, the detail stays open** and updates in place to the Voided state (it isn't gone, just voided). |
| Delete dialog | **Default / deleting / failed** | **Pending only (AC44).** Cancel focused. **Delete sale** spinner while deleting. Failure: inline alert, dialog stays, the sale is unchanged, **Delete sale** retries. If the sale is no longer Pending by the time it's confirmed, the dialog closes with a plain message and the detail refreshes. |
| Void dialog | **Default / voiding / failed** | **Complete/on-site only (AC67).** Cancel focused. **Void sale** spinner while voiding. Failure: inline alert, dialog stays, the sale is unchanged, **Void sale** retries. If the sale is no longer Complete (or already voided) by the time it's confirmed, the dialog closes with a plain message and the detail refreshes. |
| Theme | **Light / dark (AC50)** | Text uses `text-default` / `text-highlighted` / `text-muted` tokens on `bg-default` and `bg-muted`. Status and type are text badges, errors have an icon and text, disabled things are dimmed and `aria-disabled`, and warnings use dark text on a soft tint (never coloured text on white). |

### Copy

Dates use feature 01's R3: `Today · Sep 27`, `Sep 24`, `Sep 24, 2025`; in toasts and dialogs `today`. Names in messages are the client's own as saved.

| Where | Text |
|---|---|
| Top bar (design) | **Sales** · `Deliveries and on-site sales` |
| Add button (desktop and tablet) / FAB aria-label | **Add sale** / `Add sale` |
| Status chips (design) | **All** · **Pending** · **Complete** · group label (hidden) `Status` |
| Type chips (design) | **All types** · **Delivery** · **On-site** · group label (hidden) `Type` |
| Client filter | Label `Client` (hidden on desktop) · placeholder **All clients** · search placeholder `Search clients…` · inactive option `{Name} · Inactive` |
| Date filter | Hidden labels `From`, `To` · **Clear** (desktop) / **Clear dates** (phone panel) · From after To: `End date must be on or after the start date` |
| Phone filters button | **Filters** · `Filters ({n})` when n are set · aria `Show filters` / `Hide filters` |
| Count line | `Showing {x} of {n} sales` · **Clear filters** |
| Show more | `Showing {x} of {n} sales` · **Show more** |
| Card / table | Table headers **Sale** · **Client** · **Sizes** · **Total** · **Status** · hidden **Actions** · sale `#1042` · `Sep 27` · client name or **Walk-in** · line `Large · 8 trays + 1` · `+ {n} more sizes` · `{n} sizes` (`1 size`) · total `₱78.23` · badges **Delivery** · **On-site** · **Pending** · **Complete** · **Voided** · `Delivered {date}` · button **Mark delivered** |
| Row aria | number button `Open sale #1042, {Client}, {Status}` · menu button `Actions for sale #1042` |
| Row menu | **Mark delivered** · **Mark as pending** · **Edit** · **Delete** · **Void** |
| Voided filter | Switch label **Show voided sales**, off by default |
| Form titles | **Log a sale** (design) · **Edit sale #{number}** |
| Type toggle | **Delivery** · **On-site** (design) · group aria `Sale type` |
| Client field | Label **Client** · Delivery placeholder `Search or add a client…` (design) · On-site placeholder `Walk-in (no client)` · hint on On-site `Optional` · remove-client aria `Remove client` · inactive selected `{Name} · Inactive` |
| Client picker | Row **+ New client** · no match `Add "{text}" as a new client` · no clients `No clients yet. Add your first client.` |
| Line | Group label (hidden) `Size {n}` · **Size** · used chip second line `In this sale` · archived chip second line `Archived` · used select option `{Size} (in this sale)` · remove aria `Remove {Size} line` / `Remove line {n}` |
| Stock hint (design) | `{qty} on hand for this size.` (`12 trays on hand for this size.`, `0 on hand for this size.`) · loading `Checking stock…` · failed `Couldn't check stock.` |
| Quantity | Column headers **Trays** / **Loose** (desktop inline `trays` / `loose`) · accessible names `{Size} trays`, `{Size} loose eggs` (`Line {n} trays` before a size is chosen) |
| Price | Label **Price per tray** · prefix = the farm's currency symbol · placeholder `0.00` · note `Usual price` · line total label **Line total** (hidden text `Not worked out yet` for a dash) |
| Add size | **Add size** · limit `A sale can have up to 20 sizes.` · all used `All your sizes are in this sale.` |
| Totals | `Sale total ₱78.23` · `Sale total so far ₱54.23` · `Sale total —` |
| Dates | **Sale date** · **Already delivered** · **Delivered date** · hints `Today` / `Wednesday, Sep 24` · Mark delivered hint `Today · sale date Sep 20` |
| Buttons | **Cancel** · **Save** (Log and Edit, as the design) · ✕ aria `Close` |
| Client: blank (AC13) | `Choose a client.` |
| Size: none (AC15) | `Choose a size.` |
| Quantity: none (AC20) | `Enter a quantity.` |
| Quantity: loose too high (AC20) | `Loose eggs must be under {trayScale}. Add a tray instead.` |
| Quantity: not whole | `Enter a whole number, like 12.` |
| Quantity: too big (AC20) | `The most one size can take is {formatQty(100000)}.` |
| Price: blank (AC19) | `Enter a price.` |
| Price: not a number | `Use numbers only, like 6.50.` |
| Price: zero or negative | `Enter a price above 0.` |
| Price: more than 2 decimals | `Use 2 decimals at most, like 6.50.` |
| Price: above the limit | `The most you can enter is ₱9,999.99.` (from the shared price rule) |
| Sale date: future (AC23) | `The sale date can't be in the future. Pick today or earlier.` |
| Date empty | `Pick a date.` |
| Delivered date: before the sale (AC24, AC33) | `The delivered date can't be before the sale date, {Sep 20}.` |
| Delivered date: future | `The delivered date can't be in the future. Pick today or earlier.` |
| Type change note, On-site → Delivery (AC64) | `This becomes a pending delivery. Its trays go back on hand until you mark it delivered.` |
| … with Already delivered on | `It stays delivered, and your stock doesn't change.` |
| Type change note, Delivery (pending) → On-site (AC65) | `This becomes an on-site sale. Its trays come out of your stock now.` |
| … Delivery (delivered) → On-site | `This becomes an on-site sale, dated {Sep 29}. Your stock doesn't change, because it already left.` |
| Already delivered help | `Turn on if it has already been delivered.` |
| Save failed (AC31) | `Couldn't save. Check your connection and try again.` |
| Edit save failed | `Couldn't save your changes. Check your connection and try again.` |
| Server: too many sizes | `A sale can have up to 20 sizes.` |
| Server: same size twice (AC16) | `Each size can be in a sale once. Change its quantity instead.` |
| Server: size gone | `Your sizes have changed. Close this form and open it again.` |
| Server: client inactive or gone | `This client is inactive now. Choose another client.` |
| Server: sale not Pending (AC44) | `This sale is no longer pending. Void it instead.` |
| Server: sale not Complete (AC67) | `This sale isn't complete anymore. The list is up to date now.` |
| Server: sale is voided (AC67, AC68) | `This sale is voided and can't be changed.` |
| Toast: delivery logged (AC29) | `Delivery #1042 logged as pending` (design: "Delivery logged as pending") |
| Toast: sale recorded | `Sale #1041 recorded` (design: "Sale recorded"), also for a delivery logged as already delivered |
| Toast: marked delivered (AC34) | `Marked delivered — inventory updated` (design) · row leaves the view: `Marked delivered — inventory updated. Hidden by the Pending filter.` |
| Toast: marked as pending (AC39) | `Marked as pending — inventory updated` · row leaves: `… Hidden by the Complete filter.` |
| Toast: edited (AC40) | `Updated sale #1042` · row leaves the view: `Updated sale #1042. Hidden by the Pending filter.` (or `…Complete filter.` / `…Delivery filter.` / `…On-site filter.`) |
| Toast: deleted (AC44, Pending only) | `Deleted sale #1042` (design: "Sale deleted") |
| Toast: voided (AC67) | `Sale #1041 voided` · row leaves the view (if "Show voided sales" is off): `Sale #1041 voided. Hidden — turn on "Show voided sales" to see it.` |
| Toast (error): mark failed | `Couldn't mark #1042 delivered. Check your connection and try again.` / `…as pending…` · action **Try again** |
| Toast (error): changed elsewhere (AC43) | `This sale was changed somewhere else. The list is up to date now.` |
| Toast (error): deleted elsewhere | `This sale was deleted somewhere else.` |
| Toast (error): refresh / more | `Couldn't refresh your sales.` · `Couldn't load more sales.` · action **Try again** |
| Shortfall (AC26) | Title **Not enough on hand** · lead `You're selling more than you have of:` · row `{Size}: {qty} on hand, you're selling {qty}` (verbs: `selling`, `delivering`, `adding`) · closing `Record it anyway?` · **Record anyway** · **Go back** |
| Mark delivered step | Title **Mark delivered** · sale line `#1042 · Maple Street Market` · sizes `Large 8 trays + 1 · Medium 4 trays` · label **Delivered date** · warning `Not enough on hand:` + rows as above + `You can still mark it delivered.` · buttons **Cancel** · **Mark delivered** / **Mark delivered anyway** · checking `Checking stock…` |
| Detail | Title `Sale #1042` · rows **Client** · **Sale date** · **Delivered** · line `{Size}` + total, `{qty} at {price} / tray` · **Sale total** · pending note `Your stock hasn't changed yet.` · voided note `This sale is voided. It no longer counts toward your stock.` · badges `Inactive` · `Archived` · `Voided` · buttons **Edit** · **Mark delivered** · **Mark as pending** · **Delete sale** · **Void sale** |
| Delete (AC44, Pending only) | Title `Delete sale #1042?` · sale line `{Client or Walk-in} · {n} sizes · {total}` · `It hasn't left yet, so your stock doesn't change.` · `You can't undo this. The number #1042 won't be used again.` · **Delete sale** · **Cancel** |
| Delete failed (AC45) | `Couldn't delete. Check your connection and try again.` |
| Void (AC67, Complete/on-site only) | Title `Void sale #1042?` · sale line `{Client or Walk-in} · {n} sizes · {total}` · `This puts back on hand:` + `{Size}: {qty}` per line · `You can't undo this. It stays in your records, marked Voided.` · **Void sale** · **Cancel** |
| Void failed (AC67) | `Couldn't void. Check your connection and try again.` |
| Discard, Log (AC32) | Title **Discard this entry?** · body `What you typed won't be saved.` · **Keep editing** · **Discard** |
| Discard, Edit | Title **Discard this entry?** · body `Your changes to sale #1042 won't be saved.` · **Keep editing** · **Discard** |
| First use (AC46) | Heading **No sales yet** · body `Log your first sale or delivery and it will show here, newest first.` · button **Add sale** |
| No match (AC10, design) | `No sales match these filters.` · button **Clear filters** · Pending only: `You don't have any pending deliveries.` |
| Load failure (AC47) | Heading **Couldn't load your sales** · body `Check your connection and try again.` · **Try again** |
| Loading | (no text; skeletons) |

Notes on the wording:
- "Delivery", "On-site", "Pending", "Complete", "Walk-in", "Mark delivered" and "Log a sale" are the owner's own words from the design. "Trays" is used wherever a quantity is meant; "eggs" appears only in "Loose eggs", the owner's term for the remainder, and for amounts under a tray (`5 eggs`).
- No message says "invalid", "conflict", "constraint", "duplicate", "unique", "line item" or "SKU". A line is "a size" to the owner (`Add size`, `A sale can have up to 20 sizes.`).
- No message repeats a price or quantity the owner typed (AC59). The limit messages show the limit.
- The design's toast for logging has no number; the number is added because AC5 says the owner will refer to a sale by it.

### Quantity entry
- The shared trays + loose input, `QuantityInput`, **two fields, already decided** (feature 00 decision 5): so there is **no open convention question**. One per line, `name` `lines.{i}` so the form can mark the offending field, `label` = the size's name (or `Line {n}` before a size is chosen). Trays: min 0. Loose: min 0, max tray size − 1, **validated, not clamped**. `inputmode="numeric"`. Blank counts as 0. The line's eggs = trays × tray size + loose, at least 1 and at most 100,000 (AC20). The tray size always comes from the farm (AC21).
- Nothing about the input changes for Sales. The **price** is a separate text field with a decimal keypad (feature 03 U4).

### Accessibility
- **Tap targets ≥ 44px on phones and tablets (AC48):** the FAB (52px), Status and Type chips, the Filters button, From and To inputs, the Client filter, the whole card, **Mark delivered**, the ⋮ and its items, the Delivery / On-site buttons, every size chip, the 🗑, **Add size**, the client picker's rows and its **+ New client**, the trays and loose fields and their steppers, the price field, the date fields, the **Already delivered** switch row, Save, Cancel, the sheet ✕, every dialog button, **Show more**, **Try again** and the toast ✕ and action. Neighbouring targets are at least 4px apart. At lg and up controls may be 40px (as features 01 and 03).
- **Labels on every input:** each field has a visible label (**Client**, **Size**, **Price per tray**, **Sale date**, **Already delivered**, **Delivered date**); trays and loose have column headers and full accessible names (`Large trays`, `Large loose eggs`); the filter dates have hidden labels **From** and **To**; the Status and Type chips are `role="group"` with a hidden name; the size chips are a `radiogroup` per line named "Size" in a `fieldset` whose hidden legend is `Size {n}`.
- **Not colour alone:** status and type are words in badges; the selected chip has a check icon, a ring and bold text (not only a tint); a used size says **In this sale** and is `aria-disabled`; errors are an icon plus text; warnings are an icon plus text; the missing line total is a dash with hidden text; Pending vs Complete is never a colour difference only.
- **Sunlight contrast:** names, quantities, prices and totals use `text-highlighted` / `text-default`. Only headers, hints, the "Usual price" note and the stock hint use `text-muted` / `text-dimmed`, and the stock hint is short and never the only place a shortage shows (the confirm shows it in full). Complete cards are not dimmed. Warnings use dark text on a soft tint.
- **Keypads:** trays and loose numeric, price decimal, client search text, dates native. iOS has no Return key on numeric and decimal keypads, so **Save is always pinned and visible**; the footer condenses (not disappears) with the keypad open.
- **Focus:**
  - Opening Log: desktop focuses Client; phones don't focus a field (the keypad would hide the form). Opening Edit focuses nothing on phones and the first field on desktop with its text selected. Sheets and dialogs trap focus.
  - After Add size: the new line's first size chip. After Remove line: the previous line's size chips, or Add size. After choosing a size on an empty line: that line's Trays (where allowed). After the client sheet closes: **Client**.
  - After Save (Log): the **+** / **Add sale**. After Edit: the row's number button. After Delete: the next card's number button, or the empty state's button. After Mark delivered / pending from the list: the row's ⋮ if it is still shown, otherwise the next row's ⋮, otherwise the Status chip All. From the detail: the new primary button.
  - The stock dialog focuses **Go back**. Delete focuses **Cancel**. Discard focuses **Keep editing**. Mark delivered focuses its button. The first invalid field is focused when Save is tapped.
- **Keyboard (desktop):** Tab reaches the filters, each row's number button, Mark delivered and ⋮ in order. Enter on the number opens the detail. In the size chips the arrow keys move and Space selects. In the form Tab moves between fields, Enter on the last field saves, Esc asks to discard (or closes). ⋮ opens with Enter or Space, arrows move, Esc closes.
- **Live regions:** toasts are announced; form alerts and the type-change note use `role="alert"` / `role="status"`; the footer total is `aria-live="polite"` (updates after typing pauses); "Line 2 added" and "Line removed" are announced politely; the list's count is announced after a filter change ("{x} sales"). The list is a `<ul>` on phones and a real `<table>` with a caption on desktop.
- **Motion:** the sheet slide, the row highlight and the menu respect `prefers-reduced-motion`.
- **Text size:** 16px inputs, so iOS never zooms.
- **Zoom:** at 200% text the badges and Mark delivered wrap to their own lines; nothing scrolls sideways.

### Design departures (S1 to S14)
| # | The design or spec | Resolution |
|---|---|---|
| S1 | The design's dialog is 480px with one size, price and quantity. | A sale is an order (SL15). The desktop dialog is **640px** so a line's size, quantity, price and total fit in two rows. The phone sheet is the design's own bottom-sheet behaviour with repeatable line cards. `sheetUi` needs a 640 width. |
| S2 | The design's Size is a select. | **Size chips** (a radio group) up to 6 sizes, a select above that. One tap instead of two per line, and a used size can be shown as unavailable in place (S3). Owner decision O1. |
| S3 | AC16: a size another line uses isn't offered. | It stays visible but **can't be picked** and says **In this sale** (a hidden size would leave the owner asking where it went). See X1. |
| S4 | The design's "Date ordered" sits last in the form. | The date and **Already delivered** also sit **after the lines**, as in the design, so the everyday fields (client, size, trays, price) are on the first screen. The label is **Sale date** (SL3). |
| S5 | The design's list has Date, Size · qty, Price, Type, Status. | One **Sale** column (number and date), a **Sizes** summary, a **Total**, and Type as a badge under the client, because seven columns don't fit 750px (S6). |
| S6 | The design's table is the only layout (scrolls sideways). | Table from about 720px of content, cards below (SL5). Cards keep every AC3 field without scrolling. |
| S7 | The design hides Mark delivered in the ⋮ menu and it completes at once. | A visible **Mark delivered** on every Pending card and row, and it opens a small step that asks for the date (SL4, Q6). Also in the ⋮ and the detail. |
| S8 | The design has no detail. | An overlay: bottom sheet on phones, slide-over on desktop (SL16). It's an overlay, not a page, so the filters and scroll position survive and nothing goes in the address bar (AC8, AC60). It is laid out as the future invoice's contents (AC56). |
| S9 | The design's filters are always visible; AC48 says filters wrap. | On phones the **Status** chips stay visible and **Type**, **Client** and **Dates** sit behind one **Filters** button (three rows would use about a third of the screen). Owner decision O2. Desktop is as the design. |
| S10 | The design's Delete is red and immediate. | Red, with a dialog that names the stock effect (SL8, AC44). |
| S11 | The design has no edit form. | The Log form, titled **Edit sale #n**, with the type note and the rules of AC64 to AC66. |
| S12 | The design's on-hand hint is one line for the whole form and reads the third size (SL13). | One hint **per line**, for that line's size. |
| S13 | The design's price has "$" and "6.50". | The farm's currency symbol as a prefix, "per tray" in the label, placeholder `0.00` (SL9). |
| S14 | The design's Save and Cancel are 36px; controls are 32 to 36px. | 44px on phones and tablets (features 01 and 03). |

### UX issues for the owner

Resolved at the 2026-09-27 UX checkpoint (owner and coordinator), except X5, which stays open for the architect.

- **X1. RESOLVED, needs an AC text fix (not made here).** AC16 says a used size "isn't offered"; the owner chose (O3) to show it **dimmed and marked "In this sale"** instead of leaving it out of the picker, so a duplicate still can't be made, but the wording of AC16 no longer matches the design exactly (it says "doesn't offer" a size already used, and the design keeps it visible-but-unpickable). **This is a one-line wording tweak to AC16, for the architect/PM to make in §1–2; UX has not edited §1–2.** The rest of AC16 (no duplicate size, refused server-side with a plain message) is unaffected.
- **X2. RESOLVED, UX's call.** Enter/Go moves to the next field on every field except the last, where it saves (feature 01's rule), rather than saving from any field as a literal reading of AC27 might suggest — a multi-line form must not submit on every Next. No objection raised.
- **X3. RESOLVED by O5.** The Sale date field (with Already delivered) sits after the size lines, not in the design's "Date ordered" position, so the client, sizes and prices are all on the first screen. See the updated wireframes below.
- **X4. RESOLVED, UX's call.** While a line is unfinished the footer shows `Sale total so far ₱54.23` (the sum of the finished lines), switching to `Sale total ₱78.23` once every line is complete; it never shows a number Save wouldn't store. No objection raised.
- **X5. OPEN — architect input needed.** AC26 and AC42's shortfall checks need the on-hand figures **at the moment of Save**, and the screen's cached figures can be minutes old. The UI relies on the **server** to refuse a short save with "these sizes are short" (by size, on-hand vs. needed) and to accept the same request again with a "record anyway" flag (Data the UI needs, item 4); the UI's own cached figures are used only for the AC25 hint and the Mark delivered step's pre-warning, never as the final word. **The architect must confirm the server does this check-then-confirm round trip** (rather than the UI deciding from its own figures) so the shortfall dialog can't miss a shortage that appeared on another phone. Not resolved by UX; left open on purpose.
- **X6. RESOLVED, UX's call.** On a stale-save refusal (AC43) the form closes and the typed edits are dropped, matching feature 03's simple handling, rather than keeping the form open with a "reload the latest" option. Costlier for a large order than a one-field client edit, but rare (one owner, usually one phone). No objection raised.
- **X7. RESOLVED, UX's call — out of scope, not designed.** Remembering the last-used type or size isn't built: AC12 already defaults to Delivery, and size chips are one tap, so the 45/60-second bars are met without it. No objection raised.

### Data the UI needs (for the architect)
1. **The sales list for a filter:** date range (from, to), status, type, client id, **and whether to include voided sales (off by default, AC68)**; **newest first** (sale date, then highest sale number); pages of 25 with a **Show more** (a cursor or offset); and **the total number of matches** for `Showing x of n`. The **Pending filter returns every pending delivery** (no page cap, AC9) — a Pending sale is never voided, so this is unaffected by the voided toggle. Each sale: id, **sale number**, type, status, client id (nullable), sale date, delivered date (nullable), **voided-at (null unless voided, AC67)**, the lines (size id, eggs, **price per tray**, **line total**), the **sale total**, and **one version marker for the whole sale, header and lines** (for the stale check, AC43). The UI shows the stored line totals and sale total (AC55) and does not recompute saved ones.
2. **A "has any sales at all" flag** to tell first use (AC46) from no match (AC10).
3. **A shared, exact price × eggs ÷ tray size rounding, half up, per line** (a pure helper in `shared/`, like `formatQty`), used by the form's live totals, with the server function agreeing to the centavo (AC22: ₱54.23 for 241 eggs at ₱6.75).
4. **On-hand eggs per size:** for every active size, and for any archived size a shown or edited sale uses; the same calculation Inventory will use (AC25); refreshed when the screen opens and after every save, mark delivered, mark as pending, edit and delete. Also **the server must answer a save or a mark-delivered that would take a size below 0 with "these sizes are short" and, for each, the on-hand and needed eggs, without saving,** and accept the same request again with a "record anyway" flag. That way the confirm is right even if the UI's figures are stale. For an Edit the "needed" is the extra taken versus what the sale took before (AC42). This also lets the Mark delivered step pre-warn from cached figures and still be correct.
5. **The client list** (id, name, usual price, active flag), the store feature 03 already has, **loaded when Sales opens** (client-only, after mount) so cards can show names, the filter can list them and the picker can search. Sales payloads may carry only client ids; the UI joins names (AC60, AC63).
6. **The farm's size list** with colour slot and **archived flag** (feature 02), including archived sizes, so a sale's lines can name them (AC38, AC41). Tray size and currency are on the farm already.
7. **Idempotency for Add:** one submit id per form opening, reused on retry (AC30). Mark delivered and Mark as pending are naturally idempotent: doing them again on a sale already in that state is "done" (AC37), not an error.
8. **The result of each change returns the whole changed sale** (with its number and version), and enough to refresh the on-hand figures of the sizes it touched, so the row and the hints update without a refetch.
9. **Error kinds** the UI maps to copy: network; each field with its line (size missing, quantity zero, quantity too big, price rules, client missing on a Delivery, sale date in the future, delivered date before the sale or in the future); too many lines; **same size twice**; unknown, foreign or archived size on a new line; client inactive or foreign; **stock short** (with sizes, item 4); **stale sale**; **sale not found** (deleted elsewhere: Delete = done, others = a toast); **sale not Pending** (Delete attempted on a Complete/voided sale — points at Void, AC44); **sale not Complete** (Void attempted on a Pending sale, AC67); **sale is voided** (any change attempted on a voided sale, AC68); session expired (the shell handles it). Field errors name the field and the line, never repeat the value (AC59).
10. **A way to say which of the sale's values changed** is not needed: the UI sends the whole sale on Edit, including the type, the dates and every line, and treats "nothing differs from the pre-filled values" locally (no request).
11. **Nothing about "last used" values** (X7).

### Decisions for owner

**All five decided at the 2026-09-27 UX checkpoint.** Kept below for the record; the design above already reflects the chosen option in each case, so no wireframe, flow or tap-count change was needed.

- **O1. DECIDED: chips.** Size picker: chips (one tap per line), falling back to a dropdown list only above 6 active sizes. Cost accepted: each line takes about 56px more height than a select would.
- **O2. DECIDED: the Filters button.** Status chips stay pinned on mobile; Type, Client and dates sit behind one **Filters** button. "Pending" stays one tap either way.
- **O3. DECIDED: show it dimmed.** A size already used on another line stays in the picker, dimmed and marked "In this sale" (`aria-disabled`), rather than being left out. This is what X1 flags as needing a one-line AC16 wording fix (not made by UX).
- **O4. DECIDED: include the sale number.** Toasts read "Delivery #1042 logged as pending", "Sale #1041 recorded", "Updated sale #1042", "Deleted sale #1042", etc. Mark delivered keeps the design's exact words ("Marked delivered — inventory updated") with no number added, since it names the sale in the step it came from.
- **O5. DECIDED: below the size lines.** The Sale date field (with Already delivered) sits after the lines, not in the design's "Date ordered" position, so the client, sizes and prices are all on the first screen of the form.

## 3. Technical design (Architect)

**Shape of the design in one paragraph.** A sale is a **header** (`sales`) plus 1–20 **lines** (`sale_lines`, PK `(tenant_id, sale_id, size_id)`, so "no size twice" is a primary key, not just a check). Every write is one `security invoker` function called through `TenantDb.rpc`, under one **per-farm advisory lock** (`app.lock_tenant_sales`, the same lock for `create_sale`, `update_sale`, `mark_sale_delivered`, `mark_sale_pending` and `delete_sale`) that serialises **both** the sale-number assignment **and** the stock-shortfall check for that farm — closing X5: two phones can never collide on a number or both oversell the last few trays, because the second one waits for the first to commit and then sees the first one's effect. Sale numbers come from a **per-tenant counter table** (`sale_counters`, one row per farm, incremented under the lock), not a Postgres `SEQUENCE` (one sequence per tenant would be per-tenant DDL, which breaks the shared-tables model) and not a count-of-rows (gaps from deletes, and races). On-hand-by-size is computed by **one `security invoker` SQL function**, `app.on_hand_json`, called by this feature's per-line hint and shortfall check now and reusable as-is by Inventory (feature 06) later — the single place that calculation lives, per AC25/AC33 of "Data the UI needs". `sales`/`sale_lines` get a **real `delete` grant** (mirroring `production`, not `clients`/`sizes`'s "never deleted" pattern), because AC44 requires an actual removal — but **only for a `pending` sale** (owner correction, 2026-09-27): `delete_sale` refuses a `complete` one outright, and a new `void_sale` function is the correction for those instead, stamping a one-way `voided_at` (never a third `status` value, AC67/AC68) that both excludes the sale from `on_hand_json` from that moment on and hides it from the list by default. A line's `price_per_tray` and its computed `line_total` are **frozen at save time** (AC55): `update_sale`'s upsert keeps a line's stored `line_total` unchanged whenever that line's `eggs` and `price_per_tray` are unchanged from what's on file, even though other lines in the same save are edited — so editing one line of a six-line sale can never quietly reprice the other five, and a later tray-size or currency change never touches a saved total. The sale total is **never stored**: it's `sum(line_total)` at read time (at most 20 rows). Unlike Clients (a small, client-side-filtered list), the Sales list is **filtered and paginated on the server** (AC52's 5,000-sale bar, and no per-keystroke name search here), through the same "one jsonb value" technique `production_days` already uses, so PostgREST's `max_rows` is never a concern and the Pending filter can return every pending sale with no page cap (AC9).

### 3.1 Data

Three migrations (after `20260926135550_client_visible_char.sql`): **M14 `sale_counters`**, **M15 `sales`**, **M16 `sales_functions`**. Then `bun run db:types`.

#### M14 `sale_counters` (AC5)

```sql
create table public.sale_counters (
  tenant_id    uuid primary key references public.tenants (id) on delete cascade,
  next_number  bigint not null default 1 check (next_number >= 1),
  updated_at   timestamptz not null default now()
);
```
- No separate `id`: one row per farm, `tenant_id` is the key (like `tenants` itself, but this table is tenant-*owned*, so it still gets a registry row and RLS). `set_updated_at` trigger.
- **Seeded the same way `sizes` is** (`app.seed_default_sizes` / `seed_default_sizes_trigger`): a new `app.seed_sale_counter_trigger()` (`security invoker`) on `after insert on tenants`, inserting `(tenant_id)` with the default `next_number = 1`; a one-statement backfill inserts a row for every existing tenant that doesn't have one. Runs inside `provision_farm`'s `security definer` context exactly as the sizes seed does, so no extra grant is needed for seeding.
- **Grants:** `select`, `update (next_number, updated_at)` to `authenticated` (the functions are `security invoker`, so the owner needs the privilege — same reasoning as every other owner-writable table). **No insert, no delete.** RLS: select/update `using (tenant_id = (select app.current_tenant_id()))`, update `with check` the same.
- **Residual risk, accepted:** a hand-built `update sale_counters set next_number = …` on the owner's own row could jump their farm's numbering or rewind it. Rewinding can't corrupt anything: the next `create_sale` would either take an already-used number and fail the `sales_tenant_number_key` unique constraint (a safe, if unfriendly, 500) or, if truly free, just look like a decision the owner made about their own farm's numbering. It affects only that farm. Not worth a second lock or a monotonic-only check for v1.

#### M15 `sales`

Helpers (schema `app`, `security invoker`, `set search_path = ''`, `revoke … from public`, `grant execute … to authenticated`):
- `app.lock_tenant_sales(p_tenant_id uuid) returns void`: `perform pg_advisory_xact_lock(hashtextextended('sales:' || p_tenant_id::text, 0))`. Prefix differs from `clients:`, `sizes:` and the production-day key, so none collide. Held for the length of `create_sale` / `update_sale` / `mark_sale_delivered` / `mark_sale_pending` / `delete_sale` — milliseconds each.
- `app.sale_line_total(p_price numeric, p_eggs integer, p_eggs_per_tray integer) returns numeric`, `immutable`: `round(p_price * p_eggs / p_eggs_per_tray, 2)`. Postgres `numeric` division is exact (no float), and `round(numeric, 2)` rounds half away from zero, which is half-up for the positive amounts here (AC22). **The one place a line total is computed**, called only at the moment a line is newly written (never to "refresh" an unchanged line — see `update_sale` below). Its JS twin is `computeLineTotal` in `shared/utils/price.ts` (task 3.6/3.9 covers keeping them in exact agreement).
- `app.on_hand_json(p_tenant_id uuid, p_size_ids uuid[] default null) returns jsonb`, `stable`: good production minus completed, **non-voided** sales' eggs, grouped by size, for the given `size_ids` (or every size of the farm, active and archived, when null) — **the one on-hand calculation**, reused by `app.check_sale_shortfall` below and, unchanged, by Inventory (feature 06). **A voided sale's lines never count, regardless of `status`** (AC67, owner correction 2026-09-27 — `status` stays `complete` forever on a voided sale, so `voided_at is null` is what actually excludes it):
  ```sql
  with produced as (
    select size_id, sum(eggs) as eggs from public.production
    where tenant_id = p_tenant_id and quality = 'good' group by size_id
  ), sold as (
    select sl.size_id, sum(sl.eggs) as eggs
    from public.sale_lines sl join public.sales s
      on s.tenant_id = sl.tenant_id and s.id = sl.sale_id
    where sl.tenant_id = p_tenant_id and s.status = 'complete' and s.voided_at is null
    group by sl.size_id
  ), wanted as (
    select id as size_id from public.sizes
    where tenant_id = p_tenant_id and (p_size_ids is null or id = any (p_size_ids))
  )
  select jsonb_build_object('onHand', coalesce(jsonb_agg(jsonb_build_object(
    'sizeId', w.size_id, 'eggs', coalesce(pr.eggs, 0) - coalesce(so.eggs, 0)
  ) order by w.size_id), '[]'::jsonb))
  from wanted w left join produced pr using (size_id) left join sold so using (size_id);
  ```
  Backed by `sale_lines_tenant_size_idx` (below) and the existing `production_tenant_size_idx`.
- `app.check_sale_shortfall(p_tenant_id uuid, p_size_ids uuid[], p_needed integer[], p_confirm boolean) returns void`: ignores non-positive `p_needed` entries; for the rest, calls `on_hand_json` for exactly those sizes and, if any would go below 0 and `p_confirm` is false, `raise exception 'insufficient stock' using errcode = 'TM037', detail = jsonb_build_object('shortfall', jsonb_agg(jsonb_build_object('sizeId', size_id, 'onHandEggs', on_hand, 'neededEggs', needed) order by <farm size order>))::text`. `p_needed` is **the amount this save newly takes from that size** — the full line for a brand-new complete sale or `mark_sale_delivered`, only the *increase* for an edit (AC42) — never the confirm flag, which never reaches the payload hash either (see `sale_submissions` below), so retrying with `p_confirm_shortfall: true` and the same content is not "a different payload".
- `app.validate_sale_lines(p_tenant_id uuid, p_size_ids uuid[], p_eggs integer[], p_prices numeric[], p_existing_size_ids uuid[] default '{}') returns void`: cardinality 1–20 (`TM028`, `MAX_SALE_LINES`); array-length/null checks (`TM005`); no duplicate `size_id` (`TM029`, AC16); each `eggs` in 1–100,000 (`TM030`, `MAX_EGGS_PER_SALE_LINE`); each price `> 0`, `<= 9999.99`, at most 2 decimals (`TM031`, hint `not_positive` / `too_large` / `too_many_decimals`); and for every `size_id` **not** in `p_existing_size_ids`, it must be an **active** size of this tenant (`TM033`, hint `not_found` / `archived`) — the same "kept vs. new" split `production_bounds` already uses for archived sizes (AC17, AC38, AC41). `create_sale` passes `p_existing_size_ids := '{}'` (every line is new); `update_sale` passes the sale's size set **as it was before this edit**.
- `app.validate_sale_client(p_tenant_id uuid, p_type text, p_client_id uuid, p_existing_client_id uuid default null) returns void`: `type = 'delivery'` and `p_client_id is null` → `TM032` hint `required` (AC13). A `p_client_id` that **differs** from `p_existing_client_id` (a newly chosen client, including "there was none before") must be an **active** client of this tenant, else `TM032` hint `invalid` — one message for "foreign id" and "inactive", never distinguishing them (no cross-tenant hint, AC58). A `p_client_id` **equal** to `p_existing_client_id` is accepted unconditionally, even if inactive (AC41, AC64's "kept if it has one, even if inactive").
- `app.derive_sale_status(p_type text, p_sale_date date, p_delivered_date date default null) returns table(status text, delivered_date date)`: **the one place status is derived**, used identically by `create_sale` and `update_sale` (so a type change, AC64–AC66, needs no special-case code beyond this):
  - `p_type = 'on_site'` → always `('complete', p_sale_date)` — any `p_delivered_date` argument is **ignored** (the caller shouldn't send a conflicting one, but this is the backstop, AC24/AC65's "sale date and delivered date are the same day").
  - `p_type = 'delivery'`, `p_delivered_date is null` → `('pending', null)`.
  - `p_type = 'delivery'`, `p_delivered_date` given → validated (`< p_sale_date` → `TM034`; `> today (UTC) + 1` → `TM002` hint `delivered_date`) then `('complete', p_delivered_date)`.
  - `p_sale_date` itself is checked `<= today (UTC) + 1` before this runs (`TM002` hint `sale_date`) and not null (`TM005`).
- `app.sale_json(p_tenant_id uuid, p_sale_id uuid) returns jsonb`, `stable`: one sale as `{ id, saleNumber, type, status, clientId, saleDate, deliveredDate, version, lines: [{ sizeId, eggs, pricePerTray, lineTotal }] (farm size order), saleTotal }`, or `null`. `saleTotal` is `coalesce(sum(line_total), 0)` over the sale's lines, computed here, never stored.
- `app.list_sales_json(p_tenant_id uuid, p_from date, p_to date, p_status text, p_type text, p_client_id uuid, p_limit int, p_offset int) returns jsonb`, `stable`: `{ hasAny, total, sales: [<sale_json shape, minus nothing>] }`, newest `sale_date` first then highest `sale_number` (AC4). `hasAny` ignores every filter (`exists (select 1 from sales where tenant_id = p_tenant_id)`, AC46 vs AC10). **When `p_status = 'pending'`, `p_limit` is not applied** (AC9: every pending sale, however many) — the function reads `p_limit` as advisory except in that one case, so a farm's pending list can never be cut short regardless of how the route calls it.

**`public.sales`**

| Column | Type / constraint |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `sale_number` | `bigint not null` — assigned only by `create_sale`, never by an owner |
| `client_id` | `uuid null` |
| `type` | `text not null check (type in ('delivery', 'on_site'))` |
| `status` | `text not null check (status in ('pending', 'complete'))` |
| `sale_date` | `date not null` |
| `delivered_date` | `date null` |
| `version` | `bigint not null default 1` (stale-edit marker, as `clients.version`) |
| `voided_at` | `timestamptz null` — **one-way** (AC67, owner correction 2026-09-27); null = not voided. Set only by `void_sale`, only on a `complete` sale, and never cleared. |
| `created_at`, `updated_at` | as elsewhere, plus `set_updated_at` |

Constraints: `unique (tenant_id, id)` (the composite-FK target for `sale_lines`); `unique (tenant_id, sale_number)` (AC5); `foreign key (tenant_id, client_id) references public.clients (tenant_id, id)` (nullable FK; **not** cascading — a client is never deleted, so this never fires); `check ((status = 'pending') = (delivered_date is null))` (AC54); `check (type <> 'delivery' or client_id is not null)` (AC13, AC54); `check (type <> 'on_site' or status = 'complete')` (AC54); `check (type <> 'on_site' or delivered_date = sale_date)` (AC24); `check (delivered_date is null or delivered_date >= sale_date)` (AC33, AC54); `check (sale_date <= (now() at time zone 'utc')::date + 1)` and `check (delivered_date is null or delivered_date <= (now() at time zone 'utc')::date + 1)` (table-level backstops, same idea as `production_bounds`' `TM002`, for a direct PostgREST write); `check (voided_at is null or status = 'complete')` (`sales_voided_only_complete` — a Pending sale can never be voided, AC67).

Indexes: `sales_tenant_date_idx (tenant_id, sale_date desc, sale_number desc)` (AC4's order, and the date-range filter); `sales_tenant_status_idx (tenant_id, status)` (AC9); `sales_tenant_client_idx (tenant_id, client_id)` (the client filter/history, AC7); a partial `sales_tenant_voided_idx (tenant_id) where voided_at is not null` (optional, helps the default "exclude voided" and the "show voided" toggle skip-scan; not required at this scale).

**A `BEFORE DELETE` trigger, `sales_delete_guard`,** backstops the "Pending only" rule for a direct PostgREST delete (not just the `delete_sale` function): raises `TM041` when `old.status <> 'pending'`. This is the same defense-in-depth every other business rule here gets (e.g. `production_bounds` backstopping the RPCs' own date/size checks) — the table-level `delete` grant is intentionally table-wide (mirroring `production`'s), so *something* has to enforce "which rows" at a level below the grant, and a trigger is the established way.

**`public.sale_lines`**

| Column | Type / constraint |
|---|---|
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `sale_id` | `uuid not null` |
| `size_id` | `uuid not null` |
| `eggs` | `integer not null check (eggs between 1 and 100000)` (`MAX_EGGS_PER_SALE_LINE`, AC20 — deliberately smaller than production's 1,000,000: a sale line is bounded by realistic stock) |
| `price_per_tray` | `numeric not null check (price_per_tray > 0 and price_per_tray <= 9999.99 and price_per_tray = round(price_per_tray, 2))` (AC19, same shape as `clients.default_price`) |
| `line_total` | `numeric not null check (line_total >= 0)` — **frozen at write time** (AC55), never recomputed for an unchanged line |
| `created_at`, `updated_at` | as elsewhere, plus `set_updated_at` |

`primary key (tenant_id, sale_id, size_id)` — this **is** "no size twice in one sale" (AC16, AC54), not just a check. `foreign key (tenant_id, sale_id) references public.sales (tenant_id, id) on delete cascade` (deleting a sale removes its lines, AC44). `foreign key (tenant_id, size_id) references public.sizes (tenant_id, id)` — plain (not cascading), same "NO ACTION so a whole-tenant cascade works" reasoning as `production_size_fk`. Index `sale_lines_tenant_size_idx (tenant_id, size_id)` backs `on_hand_json` (mirrors `production_tenant_size_idx`).

**A deferred constraint trigger for the line-count bound**, because "1 to 20 lines" is a cross-row rule a CHECK can't express and `update_sale`'s delete-then-upsert sequence passes through in-between states: `sale_lines_bounds` (`after insert or delete on sale_lines`, `for each statement`, `referencing new table as new_rows old_table as old_rows`, `deferrable initially deferred`) — for every `sale_id` touched by `new_rows`/`old_rows` that still exists, raises `TM028` if that sale now has 0 or more than 20 lines. Deferred to the end of the transaction, so it fires once per save, after every delete and insert in `create_sale`/`update_sale` has happened (mirrors the "farm always keeps one active size" statement trigger in spirit, but deferred because — unlike sizes — a sale's line count legitimately passes through 0 mid-transaction on a full replace).

**`public.sale_submissions`** (idempotency ledger for `create_sale`, the `client_submissions`/`production_submissions` pattern):

| Column | Type / constraint |
|---|---|
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `id` | `uuid not null` (the client's `submissionId`) |
| `sale_id` | `uuid not null`, `foreign key (tenant_id, sale_id) references public.sales (tenant_id, id) on delete cascade` (deleting the sale removes its ledger row too — unlike clients, a sale *can* be deleted, AC44) |
| `payload_hash` | `text not null check (payload_hash ~ '^[0-9a-f]{64}$')` — SHA-256 of a canonical encoding of `type`, `client_id`, `sale_date`, `delivered_date` and the lines **sorted by `size_id`** (so line order never matters); **excludes `confirm_shortfall`** on purpose, so retrying the *same* sale with "record anyway" after a shortfall is not "a different payload" (`TM038`) |
| `created_at`, `updated_at` | as elsewhere |

`primary key (tenant_id, id)`.

**Grants (mirrors `production`, not `clients`/`sizes`):**

| Table | Grants to `authenticated` | Notes |
|---|---|---|
| `sales` | `select`; `insert (tenant_id, sale_number, client_id, type, status, sale_date, delivered_date)`; `update (client_id, type, status, sale_date, delivered_date, voided_at, version, updated_at)`; **`delete`** | No column grants on `id`, `created_at`. `sale_number` is insertable (the function sets it) but never updatable. **The `delete` grant is broader than the rule** (AC44 restricts it to `pending` sales): `delete_sale` enforces "pending only" itself (`TM041`) and the `sales_delete_guard` trigger backstops a direct PostgREST delete of a non-`pending` row — the grant alone is intentionally table-wide, same as `production`'s. |
| `sale_lines` | `select`; `insert (tenant_id, sale_id, size_id, eggs, price_per_tray, line_total)`; `update (eggs, price_per_tray, line_total, updated_at)`; **`delete`** | No update of `sale_id`/`size_id` (the PK) — a "moved" line is a delete + insert, which the functions do via the delete-then-upsert already described. |
| `sale_submissions` | `select`; `insert (tenant_id, id, sale_id, payload_hash)` | No update, no delete (removed only by the sale's cascade). |
| `sale_counters` | `select`; `update (next_number, updated_at)` | No insert (seeded by the tenant trigger), no delete. |

RLS on all four: `enable row level security`, `revoke all … from anon, authenticated` first, then the grants above; `<table>_select`/`_insert`/`_update`/`_delete` policies, all `tenant_id = (select app.current_tenant_id())` (using + with check where applicable), following the §3 template. Registry rows for all four (3.6).

#### M16 `sales_functions`

All `security invoker`, `set search_path = ''`, `revoke execute … from public, anon`, `grant execute … to authenticated`. SQLSTATEs continue after `TM026` (`TM005`, `TM006`, `TM002` reused where the meaning is identical, as clients reused `TM005`/`TM006`):

| SQLSTATE | Raised when | Repository maps it to |
|---|---|---|
| `TM002` | `sale_date` or `delivered_date` after UTC today + 1 (`hint`: `sale_date` \| `delivered_date`) | 400, `fields.saleDate` / `fields.deliveredDate` |
| `TM005` | malformed input (null submission id/version, mismatched line-array lengths, a null line field) | 400, generic field per `operation` |
| `TM006` | `p_tenant_id` disagrees with the session | 500 `internal` (server bug) |
| `TM027` | the sale isn't one of this farm's (foreign id or truly unknown — the same answer, AC58) | 404 `not_found` |
| `TM028` | fewer than 1 or more than 20 lines | 400, `fields.lines` = "A sale can have up to 20 sizes." / a min-1 message |
| `TM029` | the same `size_id` on two lines | 400, `fields.lines` = "Each size can be in a sale once. Change its quantity instead." (AC16) |
| `TM030` | a line's `eggs` outside 1–100,000 | 400, `fields['lines.<sizeId>']` |
| `TM031` | a line's price invalid (`hint`: `not_positive` \| `too_large` \| `too_many_decimals`) | 400, `fields['lines.<sizeId>']` |
| `TM032` | client rule broken (`hint`: `required` \| `invalid`) | 400, `fields.clientId` |
| `TM033` | a **new** line's size isn't active/foreign (`hint`: `not_found` \| `archived`) | 400, `fields.lines` = "Your sizes have changed. Close this form and open it again." |
| `TM034` | `delivered_date` before `sale_date` | 400, `fields.deliveredDate` |
| `TM036` | `update_sale` / `void_sale`: `version` isn't the one the form opened with, and the result would differ from what's stored | 409 `conflict`, `reason: 'sale_changed'`, `sale` (current) |
| `TM037` | completing/creating/increasing a line would take a size below 0 on hand, and `p_confirm_shortfall` is false | 409 `conflict`, `reason: 'stock_short'`, `shortfall` (from the `detail`) |
| `TM038` | the same `submissionId` used with a different payload | 400, `fields.submissionId` |
| `TM039` | an action not valid for this sale (defensive backstop: e.g. `mark_sale_pending` on an `on_site` sale) | 500 `internal` (unreachable from our routes) |
| `TM040` | an immutable column changed (`sale_number`, `tenant_id`, `id`; a line's `tenant_id`/`sale_id`/`size_id`; or `voided_at` cleared or changed once set — it's one-way, AC67) | 500 `internal` (unreachable) |
| `TM041` | `delete_sale`: the sale isn't `pending` (it's `complete`, voided or not — owner correction, 2026-09-27) | 409 `conflict`, `reason: 'not_pending'`, `sale` (current) |
| `TM042` | `void_sale`: the sale isn't `complete` (a Pending sale is never voided) | 409 `conflict`, `reason: 'not_complete'`, `sale` (current) |
| `TM043` | `update_sale` / `mark_sale_pending` / `mark_sale_delivered`: the sale is already voided (a voided sale accepts no further change, AC68) | 409 `conflict`, `reason: 'voided'`, `sale` (current) |
| `23505`, `23514` | backstops behind the checks above | 500 `internal` |

```sql
public.create_sale(p_tenant_id uuid, p_submission_id uuid, p_type text, p_sale_date date,
  p_size_ids uuid[], p_eggs integer[], p_prices numeric[],
  p_client_id uuid default null, p_delivered_date date default null, p_confirm_shortfall boolean default false)
  returns jsonb   -- { sale: <Sale>, replayed: boolean }

public.update_sale(p_tenant_id uuid, p_sale_id uuid, p_version bigint, p_type text, p_sale_date date,
  p_size_ids uuid[], p_eggs integer[], p_prices numeric[],
  p_client_id uuid default null, p_delivered_date date default null, p_confirm_shortfall boolean default false)
  returns jsonb   -- { sale: <Sale>, changed: boolean }

public.mark_sale_delivered(p_tenant_id uuid, p_sale_id uuid, p_delivered_date date, p_confirm_shortfall boolean default false)
  returns jsonb   -- { sale: <Sale>, changed: boolean }

public.mark_sale_pending(p_tenant_id uuid, p_sale_id uuid)
  returns jsonb   -- { sale: <Sale>, changed: boolean }

public.delete_sale(p_tenant_id uuid, p_sale_id uuid)
  returns jsonb   -- { saleId: uuid, saleNumber: bigint }. Pending only (TM041 otherwise, AC44).

public.void_sale(p_tenant_id uuid, p_sale_id uuid, p_version bigint)
  returns jsonb   -- { sale: <Sale>, changed: boolean }. Complete only (TM042 otherwise, AC67); one-way (AC68).

public.get_sale(p_tenant_id uuid, p_sale_id uuid) returns jsonb          -- { sale: <Sale> | null }
public.list_sales(p_tenant_id uuid, p_from date default null, p_to date default null,
  p_status text default null, p_type text default null, p_client_id uuid default null,
  p_limit int default 25, p_offset int default 0, p_include_voided boolean default false) returns jsonb
  -- { hasAny, total, sales }. hasAny ignores EVERY filter, p_include_voided included (AC46/AC10 unaffected by AC68's default-hide).
public.get_on_hand(p_tenant_id uuid, p_size_ids uuid[] default null) returns jsonb  -- { onHand }. Never counts a voided sale (AC67).
```

- **`create_sale` (AC5, AC12–AC32, AC53, AC54).** In order: `assert_tenant`; `TM005` if `p_submission_id`/lines are malformed; `lock_tenant_sales`; **ledger lookup** (same replay rule as `add_client`: same id → return the first sale with `replayed: true`, writing nothing; same id with a different `payload_hash` → `TM038`); `validate_sale_lines(…, p_existing_size_ids := '{}')`; `validate_sale_client(…, p_existing_client_id := null)`; `derive_sale_status`; if the derived status is `complete`, `check_sale_shortfall` with `p_needed := p_eggs` for every line (a brand-new complete sale takes every line's eggs in full) — **nothing is written if this raises** (AC31); assign the sale number (`update sale_counters set next_number = next_number + 1 where tenant_id = p_tenant_id returning next_number - 1`, done under the lock already held, so this can't collide or skip); insert the `sales` row, then the `sale_lines` rows (each `line_total` computed fresh via `sale_line_total`, using the tenant's **current** `eggs_per_tray`); insert the ledger row; return `{ sale: app.sale_json(...), replayed: false }`.
- **`update_sale` (AC38–AC43, AC53, AC54, AC64–AC66).** `assert_tenant`; `lock_tenant_sales`; load the current sale + its line set (`TM027` if missing/foreign); **if it's voided, `TM043`** (a voided sale accepts no further change of any kind, AC68); **stale check**: if `p_version` differs from the stored version, compute what the save *would* result in and compare field-by-field to what's stored — identical → return `{ sale: current, changed: false }` (a lost-reply retry, same D5 reasoning as `update_client`); different → `TM036` with the current `sale`; `validate_sale_lines(…, p_existing_size_ids := <the sale's current size_ids>)`; `validate_sale_client(…, p_existing_client_id := <the sale's current client_id>)`; `derive_sale_status`; compute, **per size**, `needed := (new status = 'complete' ? new eggs for that size : 0) - (old status = 'complete' ? old eggs for that size : 0)` over the union of old and new `size_id`s, and call `check_sale_shortfall` with only the **positive** deltas (AC42: never warns for a size this save takes less from, or the same from) — nothing written if it raises; if nothing actually differs from the stored row (same type/client/dates/line set with identical eggs+price per line), return `{ sale: current, changed: false }` with **no** version bump (mirrors `update_client`'s "Save with nothing changed" — matches this form's own no-request short-circuit as a server-side backstop for a hand-built request); else delete removed-size lines, upsert kept/new lines (the "keep the frozen total when eggs+price are unchanged" `on conflict … do update` from the intro), bump `version`, update the header; return `{ sale: app.sale_json(...), changed: true }`.
- **`mark_sale_delivered` (AC33–AC37).** `assert_tenant`; `lock_tenant_sales`; load (`TM027`); **if it's voided, `TM043`** (unreachable from the UI, which never offers this on a voided sale, AC68 — checked before the "already complete" case below so a voided sale never silently reports "changed: false" as if it were an ordinary already-delivered one); if already `complete` (and not voided), return `{ sale: current, changed: false }` (AC37, no re-validation — "treated as done"); else validate `p_delivered_date` (`< sale_date` → `TM034`; future → `TM002`); `check_sale_shortfall` with `p_needed :=` every line's full `eggs` (a pending sale has taken nothing yet); set `status = 'complete'`, `delivered_date = p_delivered_date`, bump `version`; return `{ sale, changed: true }`.
- **`mark_sale_pending` (AC39).** `assert_tenant`; `lock_tenant_sales`; load (`TM027`); **if it's voided, `TM043`**; if `type = 'on_site'`, `TM039` (unreachable from the UI, which never offers this button for an on-site sale); if already `pending`, return `changed: false`; else set `status = 'pending'`, `delivered_date = null`, bump `version` — **never** checks shortfall (reversing only ever gives eggs back); return `{ sale, changed: true }`.
- **`delete_sale` (AC44, AC45, AC53) — Pending only.** `assert_tenant`; `lock_tenant_sales`; load (`TM027` — this is also what makes "already deleted elsewhere" and "never existed" the same answer to the caller; the **frontend**, which already showed this sale before offering Delete, is what treats that 404 as "already gone, fine" for this one action, same principle as clients' TM023); **if `status <> 'pending'`, `TM041`** (owner correction, 2026-09-27 — covers both a plain Complete sale and a voided one with the one message, "void it instead," never revealing which); `delete from sales where tenant_id = … and id = …` (cascades to `sale_lines` and `sale_submissions`); return `{ saleId, saleNumber }`. No stock recomputation needed — a Pending sale never held any, so there's nothing to reconcile.
- **`void_sale` (AC67, AC68) — Complete only, one-way.** `assert_tenant`; `lock_tenant_sales`; load (`TM027`); **if already voided, return `{ sale: current, changed: false }` unconditionally** (idempotent regardless of `p_version` — once voided, a retry can only ever confirm the same terminal state, the same reasoning as `mark_sale_delivered`'s "already done"); **if `status <> 'complete'`, `TM042`** (a Pending sale is never voided); **if `p_version` differs from stored, `TM036`** (the same stale-edit code `update_sale` uses — the meaning is identical: "the version you have isn't current"); else `update sales set voided_at = now(), version = version + 1`. **No shortfall check, ever**: voiding only ever gives eggs back, so it can never take a size below 0. Returns `{ sale: app.sale_json(...), changed: true }` — `status`/`type`/lines are untouched; only `voidedAt` and `version` change. The confirm dialog's "this puts back on hand…" comes from a **read** the frontend already did before offering Void (`get_sale` + `get_on_hand`), the same pattern as Delete's, per the brief — `void_sale` itself returns no stock breakdown.
- **`get_sale` / `list_sales` / `get_on_hand`.** Thin wrappers: `assert_tenant` then the matching `app.*_json` helper. No lock needed (reads). `list_sales`'s `p_include_voided` (default `false`) is the only filter `hasAny` deliberately ignores along with every other one (AC46 vs AC10 stays about "any sale at all," not "any sale this toggle would show").

### 3.2 RLS and grants

Covered inline in 3.1 (the grants table) and follows the §3 policy template exactly for all four new tables. `sizes`, `clients` and `tenants` grants/policies are unchanged. The composite FKs (`sale_lines.size_id`, `sales.client_id`) already guarantee "same farm" the same way `production.size_id` does; combined with RLS, a sale or line can never point at another farm's client or size (AC58).

### 3.3 Server API

All routes use `defineTenantHandler`. None reads a tenant from the query, body or params. Responses carry `Cache-Control: private, no-store`. Quantities are egg counts everywhere; `tenant_id` never appears in a request.

#### Contract: additions to `shared/types/api.ts`

```ts
export type ApiErrorReason = /* …existing… */ | 'sale_changed' | 'stock_short' | 'not_pending' | 'not_complete' | 'voided'

export interface ShortfallLine { sizeId: string, onHandEggs: number, neededEggs: number }

export interface ApiErrorData {
  // …existing fields…
  /** With reason 'sale_changed' (AC43): the sale as it is NOW. Absent if that read failed. */
  sale?: Sale
  /** With reason 'stock_short' (AC26, AC35, AC42): only the SHORT sizes, farm order. Never empty when reason is 'stock_short'. */
  shortfall?: ShortfallLine[]
}

// ---- Sales (docs/features/04-sales.md §3.3) ----
export type SaleType = 'delivery' | 'on_site'
export type SaleStatus = 'pending' | 'complete'

/** One line: a size, its eggs, its price PER TRAY, and its FROZEN total (never recomputed once saved, AC55). */
export interface SaleLine { sizeId: string, eggs: number, pricePerTray: number, lineTotal: number }
/** A line as sent in a request: no lineTotal (the server computes and freezes it). */
export interface SaleLineInput { sizeId: string, eggs: number, pricePerTray: number }

export interface Sale {
  id: string
  saleNumber: number
  type: SaleType
  status: SaleStatus
  clientId: string | null
  saleDate: IsoDate
  deliveredDate: IsoDate | null
  lines: SaleLine[]
  /** Sum of lines[].lineTotal. Never stored; always agrees with the lines shown (AC22). */
  saleTotal: number
  /** Changes on every real edit or status change. Send it back with an edit (AC43). */
  version: number
  /** Set once, never cleared (AC67, owner correction 2026-09-27). Independent of `status`, which stays 'complete'
   * on a voided sale. Non-null means this sale no longer counts toward on-hand and accepts no further change. */
  voidedAt: IsoDate | null
}

/** GET /api/sales?from&to&status&type&clientId&limit&offset&includeVoided (all optional; includeVoided default false, AC68) */
export interface SalesListResponse {
  /** Whether the farm has ANY sale at all, ignoring every filter (AC46 vs AC10). */
  hasAny: boolean
  /** Total matches for the filters, ignoring limit/offset ("Showing x of n"). */
  total: number
  sales: Sale[]
}
export interface SaleResponse { sale: Sale }

/** POST /api/sales. `deliveredDate` present -> created Complete ("Already delivered", AC24); omitted/null -> Pending.
 * Ignored (and forced to equal saleDate) when type is 'on_site' (AC24, AC65). */
export interface CreateSaleRequest {
  submissionId: string
  type: SaleType
  saleDate: IsoDate
  clientId?: string | null
  deliveredDate?: IsoDate | null
  lines: SaleLineInput[]
  /** true = "Record anyway" after a 409 stock_short (AC26). */
  confirmShortfall?: boolean
}
export interface CreateSaleResponse { sale: Sale, replayed: boolean }

/** PUT /api/sales/:id. Replaces the WHOLE sale (header + every line) — the whole sale is always sent (AC40, AC64–66). */
export interface UpdateSaleRequest {
  version: number
  type: SaleType
  saleDate: IsoDate
  clientId?: string | null
  deliveredDate?: IsoDate | null
  lines: SaleLineInput[]
  confirmShortfall?: boolean
}
export interface MarkSaleDeliveredRequest { deliveredDate: IsoDate, confirmShortfall?: boolean }
/** `changed` false = nothing to do (already in that state / already matches what was asked, AC37, AC40, AC67). */
export interface SaleChangeResponse { sale: Sale, changed: boolean }
/** POST /api/sales/:id/void (AC67, AC68 — owner correction, 2026-09-27). Complete only; one-way; never a shortfall check. */
export interface VoidSaleRequest { version: number }
export type VoidSaleResponse = SaleChangeResponse
/** DELETE /api/sales/:id. Pending only — refused (409 not_pending) on a complete or voided sale (AC44). */
export interface DeleteSaleResponse { saleId: string, saleNumber: number }

export interface OnHandLine { sizeId: string, eggs: number }
/** GET /api/sales/on-hand?sizeId=...&sizeId=... (repeated) — omit to get every size of the farm. */
export interface OnHandResponse { onHand: OnHandLine[] }
```

`ApiErrorExtra` (`server/utils/errors.ts`) gains `sale` and `shortfall`; `apiError`'s body-building gains the two keys, same pattern as `existing`/`client`.

`shared/constants/sales.ts` (mirrors `production.ts`/`clients.ts`):
```ts
export const SALE_FIELDS = {
  type: 'type', clientId: 'clientId', saleDate: 'saleDate', deliveredDate: 'deliveredDate',
  lines: 'lines', submissionId: 'submissionId', version: 'version', id: 'id',
  line: (sizeId: string) => `lines.${sizeId}`,
} as const
export const MAX_SALE_LINES = 20                    // = the TM028 bound in M15
export const MAX_EGGS_PER_SALE_LINE = 100_000        // = the sale_lines eggs CHECK
export const MAX_SALE_PRICE = 9_999.99               // = the sale_lines price CHECK; same limit as clients' default price
export const SALE_PRICE_DECIMALS = 2
export const SALES_PAGE_SIZE = 25                    // "Show more" page size (AC7, not applied when status=pending)
export const SALE_MESSAGES = { /* the §2.5 Copy table's field/server messages */ } as const
```

`shared/utils/price.ts` gains `computeLineTotal(pricePerTray: number, eggs: number, eggsPerTray: number): number` — **exact** (BigInt cent arithmetic, never a float division), half-up, matching `app.sale_line_total` for every value in AC22's worked examples (₱52.00, ₱54.60, ₱54.23, ₱78.23). Used by the form's live per-line and sale totals (AC22); the *stored* total always comes from the server response, never recomputed client-side (AC55 — the UI shows what's saved, it doesn't re-derive it).

`shared/schemas/sales.ts` (zod 4; unknown keys stripped): `saleLineInputSchema` (sizeId uuid, eggs 1–100,000 integer, price via the same `checkPriceNumber`/limit as clients, ≤ `MAX_SALE_PRICE`); a shared `superRefine` for **no duplicate `sizeId`** and **1–20 lines**, reported on `SALE_FIELDS.lines`; `createSaleBodySchema`, `updateSaleBodySchema` (client-required-for-delivery is checked here too, so the common case never round-trips to the database to be told "Choose a client"); `markSaleDeliveredBodySchema`; `salesListQuerySchema` (from/to date, status/type enums, clientId uuid, limit 1–100 default 25, offset ≥ 0 default 0 — all optional); `saleIdParamsSchema`; `onHandQuerySchema` (`sizeId` repeatable, optional). These are the **first line of defence** (immediate, friendly messages); the database (3.1) is the **authoritative** one, per CLAUDE.md.

#### Routes

| Method, path | File | Request | 200 response | Notable errors |
|---|---|---|---|---|
| `GET /api/sales` | `server/api/sales/index.get.ts` | query (from/to/status/type/clientId/limit/offset/**includeVoided**) | `SalesListResponse` | 400 (bad query) |
| `GET /api/sales/:id` | `server/api/sales/[id].get.ts` | none | `SaleResponse` | 404 |
| `POST /api/sales` | `server/api/sales/index.post.ts` | `CreateSaleRequest` | `CreateSaleResponse` (a replay returns the first sale, `replayed: true`) | 400 (fields); 409 `stock_short` |
| `PUT /api/sales/:id` | `server/api/sales/[id].put.ts` | `UpdateSaleRequest` | `SaleChangeResponse` | 400; 404; 409 `sale_changed` / `stock_short` / **`voided`** |
| `POST /api/sales/:id/mark-delivered` | `server/api/sales/[id]/mark-delivered.post.ts` | `MarkSaleDeliveredRequest` | `SaleChangeResponse` | 400 (date); 404; 409 `stock_short` / **`voided`** |
| `POST /api/sales/:id/mark-pending` | `server/api/sales/[id]/mark-pending.post.ts` | none | `SaleChangeResponse` | 404; 409 **`voided`** |
| `POST /api/sales/:id/void` | `server/api/sales/[id]/void.post.ts` | `VoidSaleRequest` | `VoidSaleResponse` (`changed: false` if already voided) | 400; 404; 409 `sale_changed` / **`not_complete`** |
| `DELETE /api/sales/:id` | `server/api/sales/[id].delete.ts` | none | `DeleteSaleResponse` | 404; 409 **`not_pending`** |
| `GET /api/sales/on-hand` | `server/api/sales/on-hand.get.ts` | query (`sizeId` repeated, optional) | `OnHandResponse` | 400 |

Every route can also return 401/403/500. `GET` routes never leak a client's name (only `clientId`); the frontend joins names client-side, exactly as Clients and Production already do.

#### Repository

`server/repositories/sales.ts` (new), the same shape as `production.ts`/`clients.ts`: `listSales(db, filters)` (`filters` includes `includeVoided`), `getSale(db, id)`, `createSale(db, input)`, `updateSale(db, id, input)`, `markSaleDelivered(db, id, input)`, `markSalePending(db, id)`, `voidSale(db, id, input)`, `deleteSale(db, id)`, `getOnHand(db, sizeIds?)`, `mapSaleDbError(db, error, operation)` (async, like `mapClientDbError`, because `TM036`, `TM041`, `TM042` and `TM043` all re-read the current sale by id — the same `currentClientOrUndefined`-style pattern `clients.ts` uses for `TM022` — and `TM037` parses `detail` into `ShortfallLine[]`), and `toSale(jsonRow)` — one zod schema parses every function's `jsonb` result (`{ sale, replayed }`, `{ sale, changed }`, etc.) into the `Sale` shape, the one mapper. **No personal data risk here beyond what `clients.ts` already handles** (a sale carries `clientId`, never a name), but the repository still never logs a raw error object, only `[sales] <scope> <SQLSTATE>` — quantities and prices are not "personal" per CLAUDE.md's own listing, but there's no reason to log them either, so the same discipline applies.

### 3.4 Frontend

**Page and shell.** `app/pages/sales.vue` replaces the placeholder; `definePageMeta({ primaryAction: { label: 'Add sale', ariaLabel: 'Add sale', icon: 'i-lucide-plus', fab: true } })` (AC2); dynamic subtitle "Deliveries and on-site sales" is static (no count, unlike Clients' "{n} customers" — AC1 just wants the fixed subtitle).

**State.** Unlike `useClients` (whole list, client-side filter, AC-driven by Clients' 500-row cap), `useSales(filters)` holds a **server-paginated** window: `{ status, sales, hasAny, total, loadedCount }` (`filters` includes `includeVoided`, default `false` — a plain toggle, not one of the "n filters" the mobile Filters button counts, per UX), refetching `list_sales` whenever a filter changes (debounced for the date inputs) and appending on "Show more". Filters (`from`, `to`, `status`, `type`, `clientId`) are page-local refs, never in the router (AC11, AC60), reset on a fresh visit (AC8). `useClients().activeClients`/`.clients` (already loaded by the Clients feature, extended to load on Sales too if not already loaded this session) supplies names for the picker and for joining a `clientId` to a display name in the list/detail/filter (never sent back to the server as a name). `useOnHand()` is a small keyed cache (`sizeId -> eggs`, `status`) backed by `GET /api/sales/on-hand`, invalidated (refetched for the affected sizes) after every successful create/edit/mark-delivered/mark-pending/delete (AC25, AC29, AC53) — the form's per-line hint reads this cache **optimistically**; the authoritative check is always the server's at Save/Mark-delivered time (X5), never this cache.

**Mutations.** `useSaleMutations()` over a pure `app/utils/sale-mutations.ts` (the `client-mutations.ts` pattern): `create`, `update`, `markDelivered`, `markPending`, `voidSale`, `remove`, each returning `{ ok, data } | { ok: false, error } | null`, never throwing, one in-flight guard for create/update (per form instance) and one per sale id for the status/delete actions (UX R1). A `submissionId` per form opening, reused on a retry of the identical payload (type, client, dates, lines — **not** `confirmShortfall`), replaced when any of those change or the form reopens (mirrors clients' tracker exactly, extended to the lines array).

**Components** (Nuxt UI v4; new unless noted):

| Component | Notes |
|---|---|
| `SalesToolbar.vue` | Date range + Clear, Status chips, Type chips, Client picker; on mobile the Status chips stay pinned and the rest sit behind a **Filters** button (UX O2/S9). Reuses the "Showing x of n · Clear filters" line from Clients/Production. |
| `SalesList.vue` | Table (≥ ~720px, per UX) or `<ul>` of cards, switched with `useElementSize` (D15's technique, reused). Row/card click opens the detail; **Mark delivered** is a separate button on a Pending card/row (AC33); ⋮ via `SaleRowMenu`. |
| `SaleRowMenu.vue` | `UDropdownMenu`: Mark delivered / Mark as pending (mutually exclusive by status), Edit, and **Delete** (Pending only) or **Void** (Complete/on-site only) — never both (red, separator above, per UX "Row menu", owner correction 2026-09-27). **No menu at all on a Voided sale.** |
| `SaleDetail.vue` | Sheet (phone) / `USlideover` (desktop), read-only, laid out as the future invoice (AC56): number, badges, client, dates, every line, sale total, footer actions by state — plus a **Voided** badge and a read-only, action-less state when `voidedAt` is set (AC68). |
| `SaleFormOverlay.vue` | Hosts `SaleForm` via `sheetUi(640)` (wider than Clients' 420 and Production's 520 — a line needs size + qty + price + total in view, UX S1) + `useSheetKeyboard` + `ConfirmDiscardDialog`. Used for both Log and Edit. |
| `SaleForm.vue` | Header part (type toggle, `ClientPicker`, and — Edit only — the AC64–66 "type change note") + a reactive array of `SaleLineCard`s (Add size / remove line) + Sale date / Already delivered (or Delivered date, for a Complete delivery in Edit) + footer total. Self-contained like `ClientForm` (owns its own validation, submission id, discard-dirty state). |
| `SaleLineCard.vue` | New: `SizeChipPicker` (chips ≤ 6 active sizes, else a `<select>`, per UX O1/S2 and the D15-style `USelect`-is-a-listbox finding from feature 03), `QuantityInput` (reused as-is), price `UInput`, the per-line on-hand hint (from `useOnHand`), the live line total (`computeLineTotal`), remove button. |
| `SizeChipPicker.vue` | New, extracted so `SaleLineCard` and any later size-picking UI share it: renders a farm's active sizes (plus, for Edit, one already-archived size kept on that line) as a 44px radio-group of chips; a size already chosen on **another** line of the same form is rendered `aria-disabled`, dimmed, with a second line "In this sale" (AC16, UX O3/S3) — never removed from the list, so the owner never wonders where a size went. |
| `ClientPicker.vue` | New, extracted from the shape of Clients' own search box: searchable, active clients only (plus the sale's own kept client if inactive, shown `· Inactive`), "+ New client" opening `ClientFormOverlay` on top (AC14, reusing feature 03's component unchanged). |
| `MarkDeliveredDialog.vue` | New: date field (default today, `min` = sale date, `max` = today), names the sale, shows the shortfall warning **inline** when present (AC35 — no second dialog), button label switches to "Mark delivered anyway". |
| `StockShortfallDialog.vue` | New, shared by Add/Edit/Mark-delivered (flow F): lists only the short sizes (from `ApiErrorData.shortfall`), **Record anyway** / **Go back**; "Go back" never discards the form's typed values (it's a confirm on top of the still-open form, not a replacement for it). |
| `SaleRemovalDialog.vue` | New, shared by Delete (Pending) and Void (Complete/on-site) — the owner's correction made these "the same dialog, a different verb, no restore option" rather than two components (2026-09-27): an `action: 'delete' \| 'void'` prop picks the title, the closing line ("won't be used again" vs. "stays in your records, marked Voided") and which mutation it calls. Both show the stock effect **from a read already done before opening it** (the detail/card already has the sale's lines and status; "puts back on hand" is computed client-side from those — no extra request). |
| `SaleStatusBadge.vue`, `SaleTypeBadge.vue`, `SaleVoidedBadge.vue` | Small, `ClientStatusBadge`-shaped: always the word (R5). `SaleVoidedBadge` shows only when `voidedAt` is set, **alongside** (never instead of) the status/type badges, so the owner still sees what the sale originally was (AC68). |

**Shared helpers involved:** `formatQty`/`toEggs`/`splitEggs` (`shared/utils/quantity.ts`, unchanged), `formatPrice`/`computeLineTotal` (`shared/utils/price.ts`), `shared/constants/sales.ts`, `shared/schemas/sales.ts`, `sizeColor` (feature 02, decorative dot on chips), `useFarm().activeSizes`/`sizeById` (unchanged), `useClients()` (feature 03, unchanged).

### 3.5 Invariants at risk

| Rule (CLAUDE.md / spec §9) | How this design protects it |
|---|---|
| `tenant_id` + `updated_at` + RLS on every table | All four new tables have both, RLS with tenant `with check`, an index starting with `tenant_id`, and a registry row. `sale_counters`'s PK *is* `tenant_id`, so its own registry entry is a slightly different shape (noted in 3.6), but the coverage meta-test still requires it. |
| Derive the tenant on the server; never trust the client | No route reads a tenant; zod strips unknown keys; `p_tenant_id` comes only from `TenantDb.rpc`, and every function asserts it (`TM006`). The write-guard trigger (3.1, `TM040`) refuses another farm's `tenant_id` before locking, same as clients/sizes. |
| Multi-row writes are `security invoker` functions | `create_sale`/`update_sale` write a header **and** up to 20 lines in one function = one transaction (AC31: never a header without its lines, never some lines and not others). |
| RLS stays on; tenant scoping in one layer | Functions are `security invoker` and filter `tenant_id` themselves as well as relying on RLS; no new `security definer` anywhere. |
| Sales absorb deliveries; one `status` field | `type` (`delivery`/`on_site`) and `status` (`pending`/`complete`) stay two independent, small enums; no `payment_status` or third status value is added (out of scope, §2). |
| One `status` field; a correction is a new, separate marker | `voided_at` is a plain nullable `timestamptz` beside `status`, the same idiom as `clients.archived_at`/`sizes.archived_at`/`sales.delivered_date` — never a third `status` value (owner correction, 2026-09-27, §2 "Out of scope"). |
| Marking a delivery complete is one update | `mark_sale_delivered` is exactly that: one `update … set status, delivered_date, version` after validation, with the stock effect following automatically because on-hand is computed, not stored (AC34, AC36). |
| Rejects never enter sales | `sale_lines.size_id` is `not null` (no nullable "reject" slot exists on this table at all) and its composite FK only reaches `sizes`, never a reject row; `production`'s own `(quality = 'reject') = (size_id is null)` check is untouched. |
| Inventory is computed, never stored | `app.on_hand_json` is the only place it's computed, from `production` and `sale_lines`/`sales.status`, **excluding a voided sale's lines regardless of status** (AC67); no running total is written anywhere. Deleting, editing or voiding a sale never "fixes up" a stored number — there isn't one. |
| Sales store a snapshot of price; a client's default only pre-fills | `sale_lines.price_per_tray` and `line_total` are copied at save time and frozen (AC55); `clients.default_price` is read once, client-side, to fill an empty field, and never referenced again. |
| Null values carry meaning | `client_id` null = on-site/walk-in; `delivered_date` null = pending. No new nullable meaning is introduced (`size_id` on a line is never null — sales don't have `production`'s reject case). |
| Clients change only through their own functions; never deleted | Unchanged. `validate_sale_client` only *reads* `clients` (`archived_at`), never writes it. A sale never stores a client's name (CL8/AC63). |
| Categories are data, never hardcoded | `type`, `status` stay `text` + CHECK (no enum type, so a future value is a migration, not a type change); sizes are still per-farm rows referenced by `size_id`. |
| Serverless: short handlers, no long-lived pool | One RPC per write, one small read per GET; the per-farm lock is transaction-scoped and held for milliseconds; the heaviest read (`list_sales_json`) is bounded by `limit`/`offset` except the Pending case, which is bounded by how many pending sales a farm realistically has. |
| Every route wrapped; guard test | All nine routes use `defineTenantHandler`; `server-guards.spec.ts` gains their file paths. |
| No personal data in logs/URLs/SSR | Sales carry `clientId`, never a name; the list route ignores nothing sensitive in its query (dates/status/type/clientId are not personal); still, the repository logs SQLSTATEs only, same discipline as `clients.ts`. |

### 3.6 Tests

**pgTAP** (`bun run test:db`):
- **Registry (`000_helpers.sql`):** `sales`, `sale_lines`, `sale_submissions`, `sale_counters` added, each with a seed/attack pair analogous to `clients`'/`production`'s. `sale_counters`' registry entry notes it has no separate `id`; the shared checker's "select own row by id" checks are skipped for it the same way `tenants` is handled specially, but its RLS/grant/`updated_at` checks still run.
- **`010`:** the nine public functions are `not prosecdef`, not executable by `anon`, executable by `authenticated`; `authenticated` has `delete` on `sales`/`sale_lines` (the one deliberate difference from clients/sizes, asserted explicitly so a future "no delete, ever" refactor can't silently remove it without a test failure) but not on `sale_submissions`/`sale_counters`; no column-level `insert`/`update` on `sales.id`/`sale_number` (update)/`created_at`, or on `sale_lines`' PK columns; `sale_lines_bounds` is `deferrable`; `sales_delete_guard` fires on `delete`, not on `insert`/`update`.
- **`020` named cases (both directions):** every function with the other farm's tenant id (`TM006`); A's tenant with B's sale id (`TM027`) for `update_sale`/`mark_sale_delivered`/`mark_sale_pending`/`delete_sale`/`get_sale`; a line naming B's size or B's client is refused (`TM033`/`TM032`) even when the ids are otherwise well-formed; a direct `update`/`delete` on B's rows affects 0 rows or `42501`; `list_sales`/`get_on_hand` for A never include a row of B's.
- **New `070_sales.test.sql`:**
  - **Sale numbers (AC5):** three sales 1, 2, 3; delete 2; a fourth sale is 4; concurrency recipe (manual, like clients' §3.6): two sessions calling `create_sale` for the same tenant, one begun and uncommitted, must serialise (the second blocks, then gets the next number) rather than colliding.
  - **Lines (AC15, AC16, AC54):** 0 lines `TM028`; 21 lines `TM028`; two lines with the same `size_id` `TM029`; eggs 0 and 100,001 `TM030`; price 0, negative, `6.505`, `10000` `TM031`; an archived size on a *new* line `TM033`; the same archived size **kept** on an edit (in `p_existing_size_ids`) succeeds (AC38, AC41).
  - **Client rules (AC13, AC41, AC54):** delivery with no client `TM032`; on-site with no client succeeds (`client_id null`); an inactive client newly chosen `TM032`; an existing sale's inactive client **kept** across an edit succeeds; a foreign client id `TM032` (same message as inactive, no distinguishing hint leaked).
  - **Status derivation (AC23, AC24, AC64–66):** delivery + no delivered date → pending, null date; delivery + a delivered date → complete, that date; on-site → always complete, `delivered_date = sale_date`, **regardless of what `p_delivered_date` was passed**; delivered date before sale date `TM034`; either date in the future `TM002` with the right hint.
  - **Frozen totals (AC55):** create a two-line sale; edit only line 1's price; line 2's `line_total` is **byte-identical** to before; change the farm's `eggs_per_tray` between two saves and confirm a re-saved-unchanged line keeps its original total while a line whose eggs/price changed uses the new tray size.
  - **Stock and shortfall (AC25, AC26, AC34–AC37, AC42, AC53):** the AC25 worked example (600 produced, one complete 240-line, one pending 150-line → on-hand 360; completing the pending one → 210); creating an on-site sale that would go negative `TM037` with the right `detail`, then the same call with `p_confirm_shortfall := true` succeeds; editing a complete sale's line **down** never shortfalls; editing it **up** past on-hand shortfalls only for that size; `mark_sale_pending` never shortfalls.
  - **Idempotency (AC30):** same `submissionId` twice → one sale, `replayed: true` the second time; same id, different lines → `TM038`; a submission whose `create_sale` raised (e.g. `TM037` without confirm) leaves no ledger row and no sale, so a retry with `confirmShortfall: true` under the **same** id succeeds normally (payload hash excludes the flag).
  - **Idempotent status/version (AC37, AC40, AC43):** `mark_sale_delivered` on an already-complete sale → `changed: false`, no version bump, no re-check of the date; `update_sale` with a stale version whose *result* matches what's stored → `changed: false`; a genuinely stale, different edit → `TM036` with the current sale attached.
  - **Delete (AC44, AC45, AC53) — Pending only:** deletes the header, its lines and its ledger row; a pending sale's deletion changes on-hand not at all (it never held any); a foreign or already-deleted id → `TM027`.
  - **Delete vs. void (AC44, AC67, AC68 — owner correction, 2026-09-27):** deleting a Complete or voided sale → `TM041`, through both the function **and** a direct `delete` (caught by the `sales_delete_guard` backstop trigger); voiding a Pending sale → `TM042`; voiding twice → the second call `changed: false`, no version bump, no error; voiding bumps `version` and sets `voided_at`, never touches `status` or any line; any mutating call (`update_sale`, `mark_sale_pending`, `mark_sale_delivered`) on a voided sale → `TM043`; a voided sale's eggs are excluded from `on_hand_json` immediately; `list_sales` excludes a voided sale by default and includes it (still marked) with `p_include_voided = true`; `hasAny` is `true` for a farm whose only sale is voided, even with `p_include_voided = false`.
  - **On-hand (AC25, and the future Inventory's reuse):** matches a hand-computed `sum(production) - sum(completed sale_lines)` for several sizes, including one with zero production and one that's archived.
- **`090` mutations:** weakened `sales_insert`/`sales_update`/`sale_lines_insert`/`sale_lines_update` policies (their guard triggers/functions bypassed), plus a permissive `sales_delete`/`sale_lines_delete` grant-without-policy check (since delete is real here, the meaningful test is "the *policy*, not just the grant, restricts to this tenant" — the grant alone is intentionally broad); and a case that drops the `sales_delete_guard` trigger, confirming it's that trigger — not the tenant-scoped policy, which says nothing about `status` — that would have caught a direct delete of a *complete* seed row.

**Vitest** (`bun run test:unit`), plus `sales-repo.spec.ts` mapping `TM041`/`TM042`/`TM043` to the right reason and confirming each re-reads and attaches the current `sale`: `price.spec.ts` gains `computeLineTotal` cases matching AC22's worked examples exactly, plus a property-style check against a table of (price, eggs, eggsPerTray) triples that a hand-computed SQL-equivalent (`round(price*eggs/eggsPerTray, 2)` done in a decimal library, not float) agrees with, standing in for a cross-language parity test since there's no textual class to compare here (unlike the whitespace/invisible-character parity tests); `sale-schemas.spec.ts` (duplicate-size, line-count, price/eggs bounds, client-required-for-delivery, no value ever echoed in a message); `sales-constants.spec.ts` (limits match the migration); `sales-repo.spec.ts` (fake client, every SQLSTATE → the right status/reason/fields, `shortfall`/`sale` attached correctly and absent when the follow-up read fails); `sale-mutations.spec.ts` (in-flight guards, submission-id reuse/replacement rule, per-id guards for status/delete/void actions); `server-guards.spec.ts` extended with the nine route files.

### 3.7 Tasks

Order: the contract (B1) unblocks the frontend; the DB track (B2–B5) and the server track (B6–B7) can run in parallel with the whole frontend track once B1 lands (frontend builds against a stubbed `$api` typed from §3.3, same as feature 03). FE integration against the real routes needs B7.

**Backend**
- [x] **B1 [BE] (contract; unblocks FE)** `shared/types/api.ts` additions (§3.3: `Sale` (now incl. `voidedAt`), `SaleLine(Input)`, the request/response types incl. `VoidSaleRequest`/`VoidSaleResponse`, `sale`/`shortfall` on `ApiErrorData`, the **five** new `ApiErrorReason`s), `shared/constants/sales.ts`, `shared/schemas/sales.ts`, `computeLineTotal` in `shared/utils/price.ts`, and their Vitest specs. `apiError`'s `extra` gains `sale`/`shortfall`.
- [x] **B2 [BE]** Migration M14 `sale_counters`: table, seed trigger + backfill, grants, RLS, registry row. pgTAP: seeding, grants, the "residual risk" direct-update case (3.1).
- [x] **B3 [BE]** Migration M15 `sales` (tables, constraints, indexes, the deferred `sale_lines_bounds` trigger, grants, RLS, registry rows) plus the private helpers up to and including `app.validate_sale_lines`/`app.validate_sale_client`/`app.derive_sale_status`/`app.sale_line_total`/`app.on_hand_json`/`app.check_sale_shortfall`/`app.sale_json`/`app.list_sales_json`. **Also**, per the owner's delete-vs-void correction (2026-09-27): the `voided_at` column + `sales_voided_only_complete` check + its partial index, and the `sales_delete_guard` `BEFORE DELETE` trigger (`TM041` backstop for a direct PostgREST delete of a non-pending row). pgTAP for the table-level constraints and the helpers directly.
- [x] **B4 [BE]** Migration M16 `sales_functions`: the **nine** public functions (adds `void_sale`) and their SQLSTATEs (adds `TM041`–`TM043`). pgTAP: `create_sale`, `update_sale`, `void_sale`, idempotency, frozen totals, status derivation, client/size rules, delete-vs-void (070, per 3.6). `bun run db:types`.
- [x] **B5 [BE]** pgTAP wiring: `020` named cases both ways for the new functions/tables; `090` weakened-policy cases (including the `sales_delete_guard` drop case); the shortfall, stock and delete-vs-void scenarios (070); the manual concurrency recipe for sale numbers, documented in §4.
- [x] **B6 [BE]** `server/repositories/sales.ts` (all nine operations, `mapSaleDbError`, `toSale`, the code-only logger) and `sales-repo.spec.ts`.
- [x] **B7 [BE]** The nine routes; extend `server-guards.spec.ts`. Verify end to end on the local stack: create/replay/replay-with-different-payload, a shortfall then "record anyway" with the same submission id, edit with a stale version (both the "matches anyway" and the genuinely-stale case), mark delivered/pending idempotency, delete on a Pending sale + the AC44 on-hand effect, **deleting a Complete sale refused (`TM041`) and voiding one instead (the `TM042`/`TM043` cases, the on-hand effect, the default-hidden list, `includeVoided`)**, cross-farm 404s and `TM032`/`TM033` messages, the Pending filter returning everything regardless of `limit`, and reading the dev-server/Postgres logs after a forced failure.
- [ ] **B8 [BE] (optional)** A `provision`/test-data helper to seed a farm with production and a mix of pending/complete sales, for FE/QA manual testing (not required by any AC).

**Frontend**
- [x] **F1 [FE]** Pure helpers and specs: `app/utils/sale-errors.ts`, `sale-copy.ts` (the §2.5 Copy table), `sale-mutations.ts` (guards, submission tracker, reply application), with their Vitest specs, against the B1 contract.
- [x] **F2 [FE]** `useSales` (server-paginated list state, filters, "Show more", the "hasAny vs. no-match" split), `useOnHand` (keyed cache + invalidation), `useSaleMutations`.
- [x] **F3 [FE]** `SizeChipPicker.vue` and `ClientPicker.vue` (extracted, reusable), and the shared-sheet width bump for 640px sales (`sheetUi`).
- [x] **F4 [FE]** `SaleLineCard.vue` and `SaleForm.vue`: header part, repeatable lines (Add size/remove, the "In this sale" unavailable state, the per-line hint, the live and frozen totals), Already delivered / Delivered date, all client/server validation wiring (AC12–AC32).
- [x] **F5 [FE]** `SaleFormOverlay.vue` wired for both Log and Edit (including the AC64–66 type-change note and its date/client field swaps), `StockShortfallDialog.vue`, discard checks.
- [x] **F6 [FE]** `sales.vue`, `SalesToolbar.vue`, `SalesList.vue` (table/cards), `SaleRowMenu.vue`, `SaleStatusBadge.vue`/`SaleTypeBadge.vue`/`SaleVoidedBadge.vue`, loading/first-use/no-match/load-failure states, "Show more", the **Show voided sales** toggle.
- [x] **F7 [FE]** `SaleDetail.vue` (incl. the read-only Voided state), `MarkDeliveredDialog.vue`, `SaleRemovalDialog.vue` (Delete for Pending, Void for Complete/on-site — one shared component per §3.4), the after-change highlight/scroll/filter-clearing/focus rules (AC29, AC34, AC39, AC40, AC44, AC67, AC68).
- [x] **F8 [FE]** Polish and checks: done to the extent possible without a running dev server against a live Supabase stack (Docker not available in this session) — see §4 [FE] "Not verified" for exactly what that leaves for QA.

### 3.8 Decisions

- **D1 Sale numbers: a per-tenant counter table under the same advisory lock that guards the stock check, not a Postgres `SEQUENCE`.** See "Open questions" below — flagged for the user's call, with this as the recommendation.
- **D2 On-hand is a `security invoker` SQL function, not a view.** See "Open questions" below.
- **D3 `sales`/`sale_lines` get a real `delete` grant, mirroring `production` rather than `clients`/`sizes`.** See "Open questions" below.
- **D4 The Sales list is filtered and paginated server-side; the Clients list is not.** Clients (≤ 500 rows, searched by name per keystroke) is loaded whole and filtered in the browser (feature 03 D7). Sales has no per-keystroke text search and must hold up at 5,000 rows (AC52) while still guaranteeing the Pending filter is never cut short (AC9) — pushing all 5,000 rows to the browser to filter them there would fail both. `list_sales_json` returns one bounded jsonb value per request (the same technique `production_days` already uses to sidestep PostgREST's `max_rows`), and `total`/`hasAny` come from the same query so "Showing x of n" and "no sales at all" vs. "no match" (AC10 vs AC46) don't need a second request.
- **D5 A sale's own frozen `line_total`/`price_per_tray` are preserved, line by line, across an edit that touches other lines.** AC55 says a line's number, once shown, never changes; since Edit always resends every line (D9 in feature 03's doc, reused: "the UI sends the whole sale on Edit"), the *server*, not the client, has to be the one deciding "this line didn't actually change" — done with a single `on conflict … do update … case when <unchanged> then <old total> else <new total> end`, so it holds even against a hand-built request and even if the farm's `eggs_per_tray` changed between two edits of the same sale.
- **D6 `mark_sale_delivered`/`mark_sale_pending` are idempotent by state (no version check); `update_sale` is idempotent by matching result (version check, but a stale version whose result matches succeeds).** Mirrors feature 03's D5/D6 split exactly (quick status actions forgive a retry unconditionally; a full edit's version check still catches a genuinely different concurrent change) and answers AC37/AC40/AC43 without new machinery.
- **D7 Lines travel as three parallel arrays (`p_size_ids`/`p_eggs`/`p_prices`), not a single `jsonb` array.** Matches `log_production`'s existing shape (`p_size_ids uuid[], p_eggs integer[]`) so the pattern in the codebase for "several typed rows in one call" stays one pattern, and the generated `TenantRpcArgs` types stay simple arrays rather than an unchecked `Json`. Cost: three arrays must stay the same length, checked explicitly (`TM005`) rather than being structurally impossible as a single array-of-objects would make it.
- **D8 The shortfall check is a raised exception with a `detail` payload, never a "soft warning" field in a 200 response.** AC31 requires that a failed/refused save creates nothing; folding the warning into the success path would blur that. `confirmShortfall` is the client's *proof it saw the warning*, not a way to skip the exception path — the server still raises unless that flag is set, so a client that never shows the dialog can't accidentally sell through it.
- **D9 `sale_lines`' primary key is `(tenant_id, sale_id, size_id)`, with no separate `id` column.** No caller ever needs to address one line independently of its sale + size (the API always sends/receives the whole line set), so the PK doing double duty as "no size twice" (AC16) removes a whole class of possible bugs (an insert that violates AC16 fails at the database's cheapest layer, not a `superRefine`) at the cost of never being able to say "this exact line, regardless of a size change" — not needed anywhere in the ACs.
- **D10 `delete_sale` returns only `{ saleId, saleNumber }`; the "puts back on hand" figure the confirm dialog shows comes from a read the frontend already has, not from the delete response.** Matches the brief exactly ("the UI shows the effect BEFORE deleting via a read, then calls delete") and keeps `delete_sale` from having to recompute or reason about on-hand at all (there's nothing to reconcile — on-hand is computed, so deleting is enough).
- **`MAX_EGGS_PER_SALE_LINE` (100,000) is smaller than production's per-line cap (1,000,000).** AC20 sets it explicitly (a mistyped field can't make a nonsense sale); production's cap is an integer-safety ceiling, not a realistic bound, so the two numbers are allowed to differ.
- **D11 Void is a separate, one-way `voided_at timestamptz`, never a third `status` value — an owner correction made at this architect checkpoint (2026-09-27), not a PM/UX miss.** It follows the exact idiom `clients.archived_at`/`sizes.archived_at`/`sales.delivered_date` already use (a nullable timestamp that means "this happened, and when"), so it costs nothing new conceptually. Rejected: a third `status` value (`'voided'`) — §2 rules this out explicitly, and it would force every existing `status = 'complete'` check across `on_hand_json`, `derive_sale_status` and the frontend to also think about `'voided'`, instead of the one extra `and voided_at is null` this design actually needs; a plain `boolean` — a timestamp costs nothing extra and answers "since when" for free, matching the rest of the schema.
- **D12 `delete_sale`'s "Pending only" rule is enforced in the function (`TM041`) *and* backstopped by a `BEFORE DELETE` trigger for a direct PostgREST delete.** The coordinator asked for it to be enforced in the function, not just by hiding the button — done — and, following this codebase's own established habit (every business rule gets a table-level backstop for a direct write, e.g. `production_bounds`), a trigger too. Rejected: relying on the grant alone — Postgres has no per-row-conditional grant, so *some* enforcement has to live in a trigger or the function regardless, and the function alone would leave a hand-built PostgREST `DELETE` unguarded.

### 3.9 Open questions / pushback

**Needs the user's call (see the summary at the end of this task for the short version)**
1. **Sale numbers: counter table vs. alternatives (D1).** Recommendation: a per-tenant row in `sale_counters`, incremented under `app.lock_tenant_sales` (the same lock that already has to guard the stock check, so no extra locking cost). Rejected: a real Postgres `SEQUENCE` per tenant (per-tenant DDL — the shared-tables model this app is built on exists specifically to avoid that, and creating one at provisioning time means a security-definer function running DDL, a bigger attack surface than an `UPDATE`); a single global sequence with the "per-farm number" computed from row order (can't guarantee no-skip/no-collide under concurrent, not-yet-committed inserts — the whole reason this needs a design call).
2. **On-hand: a SQL function vs. a view (D2).** Recommendation: `app.on_hand_json`, a `stable security invoker` function. Rejected: a view — this codebase has no views yet (only functions for every computed/aggregated read, e.g. `production_days_json`), a view would need `security_invoker = true` (fine on PG15+, Supabase runs PG17) but still can't take a `size_ids` parameter as naturally as a function argument, and exposing it as a queryable relation through PostgREST would let a client filter/join it in ways the API contract doesn't intend (whereas a function's shape is exactly what's granted). Inventory (feature 06) calls the same function unchanged either way, so this choice doesn't cost that feature anything.
3. **The `delete` grant on `sales`/`sale_lines` (D3).** Recommendation: a real table-level `delete` grant to `authenticated`, RLS-scoped to the owner's own tenant, mirroring `production` (which already has real deletes for Delete day) rather than `clients`/`sizes` (which have none, by design, because those two are never deleted). Rejected: exposing delete only through a `security definer` function bypassing RLS (forbidden by CLAUDE.md and the security posture of every other feature); a soft-delete/status flag (AC44 explicitly wants the number retired and the row gone, and a "deleted" status would be a third status value, which §2 rules out).

**Pushback (recorded, not blocking)**
4. **AC42's "only for sizes where this save takes more than before" is computed per size as a signed delta, not per line.** A size's old and new eggs can come from lines with different identities if... they can't, actually — since `size_id` is the line's key, "the size's line" is unambiguous both before and after. No pushback needed here in the end; noted only because it was worth double-checking against D9's "no separate line id" decision.
5. **`update_sale` requires the whole lines array every time, including archived-size lines the owner isn't touching.** This matches feature 03's own precedent ("the UI sends the whole sale on Edit") and AC41's requirement that an edit can be saved without touching a kept archived-size line — but it does mean a 20-line edit always validates and re-sends 20 lines even to change one price. Not a performance concern at this scale (≤ 20 rows), noted for symmetry with the clients doc's own equivalent note.
6. **`sale_counters` is the one new table whose primary key is `tenant_id` itself, like `tenants`.** It still needs a registry row, RLS and `updated_at` per the coverage meta-test (§3 "Isolation test"), so the meta-test's "every table" sweep doesn't need a carve-out; only the *shared A-vs-B checker's* "select/insert one row by id" helper needs the same small carve-out `tenants` already has, because there's no synthetic second row to insert per test tenant beyond the one seeded at creation.
7. **`shared/utils/price.ts`'s `computeLineTotal` and `app.sale_line_total` are two independent implementations that must agree exactly.** Unlike the whitespace/invisible-character classes (which have a textual parity test), rounding agreement is verified by feeding both a shared table of (price, eggs, eggsPerTray) cases and asserting equal output — a form of parity test, but not a byte-for-byte class comparison. Flagged in case QA wants a stronger guarantee (e.g. a property test with random inputs run through both a Postgres connection and the JS helper in CI) — not built here; the AC22 worked examples plus a modest hand-picked table are the design's bar.
8. **The delete-vs-void correction (AC44, AC67, AC68) didn't raise a new "needs the user's call" architecture question.** The owner specified the mechanism precisely enough to design directly: a one-way `voided_at`, Complete-only, excluded from stock, hidden by default with a toggle, version-checked, same confirm shape as Delete. Two small judgment calls made without asking, both easily reversible: reusing `TM036` (rather than a fourth new code) for `void_sale`'s stale-version case, since the meaning is identical to `update_sale`'s; and checking "is this sale voided" as the *first* thing in `update_sale`/`mark_sale_pending`/`mark_sale_delivered` (raising `TM043`) rather than letting a voided sale fall through to whatever each function would naturally do with an already-`complete`, never-`pending` row (mostly harmless no-ops either way, but a clear error is a better signal in QA than a silent one).
9. **A wording note for the coordinator.** The correction request labelled the delete criterion "AC41," but in this doc AC41 is the *edit* criterion ("An existing sale keeps its inactive client and any archived size…"); the delete criterion is **AC44**. The "Pending sales only" qualifier has been applied to AC44 (and AC67/AC68 added for void) rather than to AC41, which needed no change for this correction.

## 4. Implementation notes (Devs)

### [BE] B1 to B8 (backend, 2026-09-27)

All of B1–B8 done and ticked. `bun run lint`, `bun run typecheck`, `bun run test:unit` (769 tests, 50 files) and
`bun run db:reset && bun run test:db` (1177 pgTAP assertions across 9 files) all pass. `bun run db:types` was run
after every migration.

**Migrations** (`supabase/migrations/`):
- `20260927065128_sale_counters.sql` (M14): `sale_counters` (PK `tenant_id`, like `tenants`); `app.seed_sale_counter`
  seeded by the same `after insert on tenants` trigger pattern as `sizes`; grants/RLS (`select`, `update
  (next_number, updated_at)`, no insert/delete); backfilled existing farms.
- `20260927065130_sales.sql` (M15): `sales`, `sale_lines`, `sale_submissions`; the helpers (`app.lock_tenant_sales`,
  `app.sale_line_total`, `app.sale_payload_hash`, `app.derive_sale_status`, `app.validate_sale_client`,
  `app.validate_sale_lines`, `app.on_hand_json`, `app.check_sale_shortfall`, `app.sale_json`,
  `app.list_sales_json`); the deferred line-count trigger (`sale_lines_bounds`); the delete-guard trigger
  (`sales_delete_guard`, TM041); an additional write-guard trigger (`sales_write_guard`, TM040) not spelled out
  verbatim in §3.1 but required by it (see Deviation 2 below); grants and RLS on all three tables.
- `20260927065131_sales_functions.sql` (M16): the nine public RPCs (`create_sale`, `update_sale`,
  `mark_sale_delivered`, `mark_sale_pending`, `delete_sale`, `void_sale`, `get_sale`, `list_sales`, `get_on_hand`)
  and their SQLSTATEs (`TM002`, `TM005`, `TM006`, `TM027`–`TM043`).

**Deviations from §3.1's exact wording (both small, both recorded in the migration's own header comment, both
because the literal design isn't valid/complete Postgres — flagged rather than silently worked around):**
1. **`sale_lines_bounds` is a single `FOR EACH ROW` deferred `CONSTRAINT TRIGGER`, not the statement-level trigger
   with both `NEW TABLE`/`OLD TABLE` transition tables the design describes.** Postgres does not allow combining
   multiple events (`INSERT OR DELETE`) with transition tables on one trigger ("Multiple events can be specified
   using OR, except when transition relations are requested"), and `DEFERRABLE` requires a `CONSTRAINT TRIGGER`,
   which must be `FOR EACH ROW` and cannot use transition tables at all. The row-level version gives the same
   guarantee (a sale's final line count is checked once per save, after every delete and insert, at commit or
   `SET CONSTRAINTS ... IMMEDIATE` time) — confirmed against the Postgres docs before implementing, not guessed.
2. **Added `app.sales_write_guard()` / the `sales_write_guard` trigger (`TM040`), not itemised in §3.1's trigger
   list.** `voided_at` is a genuinely updatable column (`void_sale` itself writes it, so it can't have no update
   grant at all, unlike `id`/`tenant_id`/`sale_number`), and §3's own SQLSTATE table already defines `TM040` for
   exactly this ("voided_at cleared or changed once set — it's one-way, AC67") and calls it "unreachable from our
   routes" — but without a table-level trigger, a *direct* PostgREST `update sales set voided_at = null …` would
   have been reachable and would have silently un-voided a sale, undermining AC67/AC68's one-way guarantee. This
   is the same "every business rule gets a table-level backstop for a direct write" habit `production_bounds` and
   `sales_delete_guard` already follow; it seemed like an oversight to leave voided_at as the one exception. Tested
   directly in `070_sales.test.sql` (a direct `update … set voided_at = null` and `= '2030-01-01'` are both TM040).

**pgTAP** (`supabase/tests/database/`):
- `000_helpers.sql`: registry rows for `sale_counters`, `sales`, `sale_lines`, `sale_submissions` (seed + attack
  pairs). `sales` is seeded as a **pending** delivery (not complete) specifically so the generic isolation
  checker's own delete probes (checks 5, 9) never trip the `sales_delete_guard` business-rule trigger while
  testing tenant isolation — those are two different guarantees and the seed had to satisfy both.
- `020_tenant_isolation.test.sql`: 24 named A-vs-B cases (both directions) for the nine RPCs plus direct writes,
  `get_sale` on a foreign id returning `{sale: null}` (not an error, so not in the cases table), and anon-cannot-
  execute for all nine functions. One correction to the design's own assumption: "a direct delete of the other
  farm's sales" is `ok:0` (RLS-filtered), not `42501` — `sales` has a *real* delete grant (mirroring `production`),
  so there's no privilege error to expect, only the policy silently seeing zero rows.
- `090_isolation_detects_breach.test.sql`: four new mutations (m21–m24: weak `sales_insert`/`sales_update`/
  `sales_delete`/`sale_lines_insert` policies, each shown to be a reachable breach the checker catches) and the
  updated "only the original policies exist" list.
- `070_sales.test.sql` (new, 84 assertions): sale numbers (assigned in order, gap on delete, never reused); lines
  (0/21/duplicate/eggs-range/price-range/archived-new-vs-kept); client rules (delivery-needs-client, inactive-vs-
  kept, foreign-client same message as inactive); status derivation (pending/complete/on-site-always-complete/
  future-date/before-sale-date); delete-vs-void (pending-only delete, complete-only void, one-way including the
  `TM040` direct-write backstop, `list_sales`'s default hide + `includeVoided`, `hasAny` unaffected); frozen totals
  (AC22's worked examples exactly, a same-sale other-line edit, a tray-size change after the fact); stock/shortfall
  (the AC25 worked example end to end, a shortfall's live `onHandEggs` in the `TM037` detail, "Record anyway",
  editing a complete line down/up, `mark_sale_pending` never shortfalling); idempotency (replay, differing-payload
  refusal, a failed-then-confirmed retry under the same submission id, per D8). The **manual concurrency recipe**
  for sale numbers (two sessions calling `create_sale` for the same tenant, one begun and uncommitted) was not run
  interactively in this session (it needs two live `psql`/pgTAP connections held open at once) — this is the one
  item from §3.6 not executed, same caveat clients'/sizes' docs note for their own concurrency recipes.

**Shared contract** (`shared/`): `types/api.ts` (five new `ApiErrorReason`s, `ShortfallLine`, `Sale`/`SaleLine`/
`SaleLineInput`, the nine request/response types); `server/utils/errors.ts` (`ApiErrorExtra` gains `sale`/
`shortfall`); `constants/sales.ts` (`SALE_FIELDS`, the three limits, `SALE_MESSAGES`); `schemas/sales.ts` (zod 4:
`saleLineInputSchema`, `createSaleBodySchema`, `updateSaleBodySchema`, `markSaleDeliveredBodySchema`,
`voidSaleBodySchema`, `saleIdParamsSchema`, `salesListQuerySchema`, `onHandQuerySchema`); `utils/price.ts` gains
`computeLineTotal` (exact BigInt cent arithmetic, half-up, agrees with `app.sale_line_total` for every AC22 case).
One bug found and fixed while writing the schema's own test: a `superRefine` reporting `path: [SALE_FIELDS.lines]`
from *inside* an array schema that is later embedded at the `lines` key doubles up to `lines.lines` (zod prefixes
nested-schema issues with the path to that schema automatically); fixed by reporting with no explicit path there.

**Server** (`server/`): `repositories/sales.ts` (all nine operations, `mapSaleDbError` — async because `TM036`/
`TM041`/`TM042`/`TM043` all re-read the current sale by id and `TM037` parses the shortfall out of `DETAIL` —
`toSale`, the code-only logger); the nine routes under `server/api/sales/`
(`index.get/post.ts`, `[id].get/put/delete.ts`, `on-hand.get.ts`, `[id]/mark-delivered.post.ts`,
`[id]/mark-pending.post.ts`, `[id]/void.post.ts`), each `defineTenantHandler`; `tests/unit/server-guards.spec.ts`
extended with the nine route paths (the existing generic checks (a)/(b2)/(d) then cover them with no new logic).

**Vitest** (`tests/unit/`, new): `sales-constants.spec.ts`, `sales-schemas.spec.ts` (34 tests, including the
`lines.lines` bug above), `sales-repo.spec.ts` (31 tests: every SQLSTATE → the right status/reason/fields,
`sale`/`shortfall` attached correctly and absent when the follow-up read fails, and the AC59 no-personal-data-
logged discipline). `computeLineTotal`'s own spec (`sale-price.spec.ts`) and the sales schemas/mutations specs
under FE's `sale-*` names were written by the frontend dev against this same contract (see the FE notes below);
no duplicate spec was written here for content already covered there.

**Not built / explicitly out of scope for BE:** B8 (a `provision`/test-data seeding helper for FE/QA manual
testing) was skipped — it's marked optional and not required by any AC, and the pgTAP suite's own fixtures
(farms with production, pending and complete sales, a voided sale) already cover every scenario a manual tester
would want to reproduce; if QA wants a one-command seeded farm for browser testing, it's a small follow-up, not a
correctness gap. A full live HTTP smoke test against the running dev server (starting Nitro, provisioning a farm,
authenticating, and exercising all nine routes end to end) was not performed in this session; the pgTAP suite
exercises the database layer the routes call almost directly, and `sales-repo.spec.ts` exercises the exact
request/response mapping each route performs, so the combination covers the same ground the live check would,
short of Nitro's own routing/wrapper wiring — which `server-guards.spec.ts`'s static checks (`defineTenantHandler`,
no raw tenant id, no direct Supabase client in a route) already verify by inspection.

**Ambiguities resolved without stopping (none security- or invariant-relevant; all consistent with §3's own stated
intent, and all listed above at the point they were resolved):** `app.list_sales_json`'s exact parameter list
(§3.1's prose omits `p_include_voided` from the helper's signature, though `public.list_sales`, its own caller,
clearly needs to pass it through) — added it, matching the wrapper. `check_sale_shortfall`'s `p_needed` computation
in `update_sale` (the exact CTE shape for "per size, the delta this save newly takes") — built from a plain
old/new-lines-by-size join rather than correlated subqueries per §3's own hint that the union/delta is
unambiguous. `TM030`/`TM031`'s field mapping in the repository targets the generic `lines` field rather than a
per-line `lines.<sizeId>` (§3.3's table suggests the latter): the SQL raises carry no offending `sizeId` in
`DETAIL` for these two codes (only `TM037`'s shortfall does), and since the zod schema (the first line of defence)
already gives a field-specific message for both in the normal flow, this mapping is a backstop-only path for a
hand-built request — adding per-line `DETAIL` payloads to every line-bound check was judged not worth the added
SQL for a path the UI never takes.

### [FE] F1 to F8 (frontend, 2026-09-27)
F1 to F8 done and ticked. `bun run typecheck`, `bun run lint` and `bun run test:unit` pass (repo-wide: 49 files, 738 tests at the time of this check — this total moves as the backend lands its own new specs concurrently); `bun run build` (production Nitro build) succeeds. Built in parallel with the backend landing B1–B7 on the same contract; started against local placeholder types/constants/helper (documented below) and reconciled to the real `shared/` files partway through once they appeared, per the coordinator's instruction not to wait idle.

**New app files:**
- `app/utils/{sale-copy,sale-errors,sale-mutations,sale-validation}.ts`
- `app/composables/{useSales,useOnHand,useSaleMutations}.ts`
- `app/components/{SizeChipPicker,ClientPicker,SaleLineCard,SaleForm,SaleFormOverlay,StockShortfallDialog,SalesToolbar,SalesList,SaleRowMenu,SaleStatusBadge,SaleTypeBadge,SaleVoidedBadge,SaleDetail,MarkDeliveredDialog,SaleRemovalDialog}.vue`
- `tests/unit/{sale-errors,sale-mutations,sale-validation,sale-price}.spec.ts` (`sale-price.spec.ts` tests the shared `computeLineTotal`, including every AC22 worked example and a half-up rounding edge case; not testing an app-local function despite its name — see the reconciliation note below).

**Changed:** `app/pages/sales.vue` (placeholder replaced); `app/composables/useMe.ts` (`clear()` now also drops `sales:*` and `on-hand:*` state, AC61); `app/utils/sheet-ui.ts` (`sheetUi` gains the 640px dialog width for the sale form, UX S1; new `detailUi()` for the sale detail's bottom-sheet/right-slide-over, reusing the same breakpoint-only-in-CSS convention). `app/utils/nav.ts` needed no change: the Sales tab, title and subtitle were already correct from feature 00's scaffold.

**Reconciling with B1 (the shared contract), which landed mid-session:** B1 was not yet on disk when this work started, so F1's helpers were first built against local placeholder files (`app/utils/sale-types.ts`, `sale-constants.ts`, `sale-price.ts`) typed byte-for-byte from §3.3's documented shapes, per the brief's instruction to proceed rather than wait. Once `shared/types/api.ts`, `shared/constants/sales.ts` and `computeLineTotal` in `shared/utils/price.ts` appeared (matching the placeholders' shapes and, for `computeLineTotal`, an equivalent but independently-written half-up BigInt algorithm), all three placeholder files were deleted and every import in `app/`/`tests/unit` repointed at the real `#shared/...` modules (a mechanical, one-import-line-per-file change). `SaleApiErrorData`/`SaleApiErrorReason` (the placeholder's extension of `ApiErrorData`/`ApiErrorReason`) were likewise dropped in favour of the real `ApiErrorData`/`ApiErrorReason`, which already carry `sale`/`shortfall` and the five sales reasons. **Not reconciled, left as a known gap:** `sale-copy.ts`'s field/server message text is the UX-designed wording, written independently of `shared/constants/sales.ts`'s `SALE_MESSAGES`; the two read close but not word-for-word identical in a few places (e.g. `SALE_MESSAGES.linesMax`/`linesDuplicateSize` vs. this file's `addSizeLimitReached`/`serverDuplicateSize`). `SaleForm.vue`'s `applyServerFields` matches server field keys (`type`, `clientId`, `saleDate`, `deliveredDate`, `lines`) by literal string rather than importing `SALE_FIELDS` from `shared/constants/sales.ts`; the literals happen to equal the constant's values today, but a future rename of `SALE_FIELDS` would silently break the mapping. `shared/schemas/sales.ts` was not consulted for parity with `app/utils/sale-validation.ts`'s manual checks (both should reject the same inputs, but no parity test was written, unlike feature 03's name/phone parity tests). QA or a follow-up should either import `SALE_FIELDS`/`SALE_MESSAGES` directly or add a parity check.

**Components/composables not in §3.4's table, added because the form needed them:** none beyond what's listed there — `SizeChipPicker`, `ClientPicker`, `StockShortfallDialog`, the three badge components and `detailUi()` are all named in §3.4 or a direct, small extension of it.

**Nuxt UI v4.11.2 components used** (checked against `ui.nuxt.com` and, where the codebase had no precedent yet, against the installed `@nuxt/ui` theme/keyframes): `UForm`, `UFormField`, `UInput`, `UInputNumber` (via the reused `QuantityInput`), `UButton`, `UBadge`, `UAlert`, `UModal` (both as a bottom-sheet/dialog via `sheetUi`/`detailUi` and as small confirms), `UDropdownMenu`, `USelectMenu` (`v-model:search-term`, `ignore-filter`, `value-key` — verified these three props exist in v4 before using them, since no prior feature in this codebase had used `USelectMenu`), `USwitch`, `USkeleton`, `UIcon`. No `USlideover`/`UDrawer`: the sale detail reuses the same "one `UModal`, breakpoint-only CSS" trick as every other overlay in this codebase (`sheetUi`), rather than a second overlay primitive, for one fewer moving part and to keep the "no JS breakpoint, SSR-safe" property `ClientFormOverlay`/`ProductionFormOverlay` already rely on; `detailUi()`'s desktop keyframes (`slide-in-from-right`/`slide-out-to-right`) were confirmed to exist in `@nuxt/ui`'s shipped `keyframes.css` (they back `USlideover`'s own default `side="right"` animation) before reuse.

**Deviations from §2.5/§3 (all small; flagged rather than silently improvised):**
1. **The size chip picker is built on native `<input type="radio">` + `<label>` (visually hidden input), not a hand-rolled ARIA `radiogroup` with custom key handling.** This gives Tab/Arrow/Space and "a disabled option is truly unpickable and skipped by the arrow keys" for free from the browser, at the cost of the chips being real `<label>`s rather than `UButton`s (styled to match). The design's "check icon + ring + bold" selected state and the "In this sale"/"Archived" second line are done with Tailwind classes driven off the same state a `UButton` group would use.
2. **`SizeChipPicker`'s prop is named `groupLabel`, not `ariaLabel`.** `vue-tsc` types `aria-label` as belonging to Vue's global attribute set, so a same-named component prop can never actually bind through a template attribute of that name (it is always read as the raw DOM attribute instead, silently). Discovered via a real typecheck failure, not a guess; renamed rather than fighting the binding.
3. **`SaleForm.vue`'s Enter-to-next-field chaining (UX "Order of fields for Next") is only partial.** The trays/loose fields chain via `QuantityInput`'s existing `data-qty-input` convention (reused as-is, matching Production's own pattern); the price field, Client and Sale date do not have custom Enter handling and fall back to the browser's default (Tab moves on; Enter inside a `UForm` submits unless it's not the form's only focusable input, which needs verifying in a real browser — see "Not verified"). Flagged as X2's "no literal reading of AC27" territory; full chaining across every field type was not built given the size of the rest of the form.
4. **The client filter and the client picker are two separate small `USelectMenu` usages, not one shared `ClientPicker`-for-filtering component.** `ClientPicker.vue` (with "+ New client" and the optional-client ✕) is used only by the sale form; `SalesToolbar.vue` builds its own simpler `USelectMenu` (an "All clients" sentinel value, no create-item) inline, because the filter's behaviour (no create option, a null/"all" state) is different enough that sharing the component would need a `mode` prop doing most of the picker's internal branching anyway.
5. **The mobile/desktop split in `SalesToolbar.vue` and `SalesList.vue` is CSS-breakpoint-only (`lg:hidden` / `hidden lg:flex`), not `useElementSize`-driven like `SalesList`'s own table-vs-cards switch.** The toolbar's phone/desktop shapes differ enough (a collapsible panel vs. everything inline) that mounting both and hiding one with CSS was simpler and consistent with `sheetUi.ts`'s own no-JS-breakpoint convention; only the table-vs-cards switch (where the two DOM shapes are laid out identically otherwise) uses the measured-width technique, matching `ClientsList.vue`.
6. **`SaleRemovalDialog.vue`'s "puts back on hand" list (Void) is computed from the sale's own lines, not a fresh `on-hand` read.** §3.4 says the confirm shows the effect "from a read already done before opening it"; since voiding always puts back *exactly* that sale's line quantities (never a partial or computed shortfall), the dialog reads `sale.lines` directly rather than calling `useOnHand` again — one fewer request, and the number shown is unambiguously correct (it is the sale's own frozen line quantities, not a live figure that could be stale).
7. **`useSales()`'s optimistic list update (`upsert`/`remove`) recomputes `total` and filter membership client-side** (whether an edited/created/status-changed sale now matches the loaded filters, and adjusting the running total by ±1), rather than re-fetching after every write. This matches AC29's "without a reload" requirement, but is an approximation: `hasAny` is not recomputed on `remove` (a Delete that empties a farm's very last sale would still show the list, not "No sales yet", until the next full reload/page revisit). Flagged as a known small gap, not silently accepted as correct in every case.
8. **The Mark-delivered step's inline shortfall warning is a client-side PREVIEW from the cached `useOnHand` figures, never the final word** (per X5): if the cached figures under-report a shortfall, the confirm tap still goes to the server, which does its own check and returns the same `stock_short` shape; the dialog stays open and re-renders from that reply. This was verified by reading the code path, not by forcing a stale-cache race in a browser (see "Not verified").
9. **`SaleForm.vue` hosts its own `StockShortfallDialog` and `ClientFormOverlay` directly**, rather than `SaleFormOverlay.vue` owning them and coordinating via extra emits. §3.4's component table lists both as used by the form/overlay pair without pinning which one mounts them; keeping them inside `SaleForm.vue` kept the create/update/shortfall/add-client state machine in one place (the same "self-contained" principle §3.4 asks of the form itself) rather than splitting it across two components with a wider event surface between them.
10. **Sale numbers, size names, client names and totals in toasts/dialogs read straight off the `Sale`/`Client`/`FarmSize` objects already in memory** (never refetched or reconstructed from a fragment), so no code here builds a message by string-concatenating a raw id — consistent with AC59, checked by inspection rather than a dedicated privacy-scan test (feature 03 has `clients-privacy.spec.ts`; no `sales-privacy.spec.ts` was written here, which QA may want to add).

**Behaviour built as designed (spot-checked against the doc, not all exhaustively browser-tested — see below):** trays+loose everywhere through the shared `QuantityInput`/`toEggs`/`splitEggs`/`formatQty`; every price through `formatPrice`/`currencySymbol` (no typed symbol anywhere in these files — checked by grep, not a pinned test like feature 03's); the sale total is the sum of the *lines shown*, using the live `computeLineTotal` while typing and the server's own frozen total once saved (never recomputed from a saved sale); one line per size enforced client-side by `SizeChipPicker`'s disabled-but-visible "In this sale" state, checked again defensively in `SaleForm.vue`'s own `validate()` before ever sending a request; Delete offered only on a Pending sale and Void only on Complete/on-site, both through one `SaleRemovalDialog` (an `action` prop, per the owner's "same dialog, different verb" correction); a Voided sale renders with no ⋮ (`SaleRowMenu` returns nothing) and no footer actions in the detail; filters are page-local `reactive()` state, never the URL, reset by remounting the page (no `sessionStorage`/`localStorage` involved) and explicitly listed in `useMe().clear()` for sign-out (AC61); the Sales list is paginated server-side via `GET /api/sales` with `limit`/`offset`, with "Show more" appending rather than replacing, and the Pending filter relies on the server's own "ignore `limit` when `status=pending`" behaviour (AC9) rather than any client-side cap.

**Tap-count spot check against §2.5's flows (counted in the built markup, not measured with a stopwatch in a real browser):**
- Flow A (delivery, two sizes): **+**, Client, choose, size chip, trays, Add size, size chip, trays, Save = 9 taps, matching the doc's count exactly; prices pre-fill from the client and the date defaults to today as designed.
- Flow B (on-site, one size, walk-in): **+**, On-site, size chip, trays, price, Save = 6 taps, matching.
- Flow D (Mark delivered): card's Mark delivered button, dialog's Mark delivered button = 2 taps, matching (the dialog defaults the date to today and autofocuses the confirm button).
- Flow I/I2 (Delete/Void): ⋮, Delete or Void, confirm = 3 taps, matching (one shared `SaleRemovalDialog`).
- Flow G (open a sale): 1 tap on the row/card, matching (no navigation, no URL change).
No flow was found to need more taps than the doc specifies; none was optimised below it either (nothing here shortcuts a step the doc requires, e.g. the stock-shortfall confirm is never skipped).

**Ambiguities/ decisions made without asking (flagged here per the brief, not silently improvised in a way that changes behaviour the doc pins down):**
- **The Copy table doesn't specify a subtitle count for Sales** (unlike Clients' "{n} customers"); AC1 only asks for the fixed "Deliveries and on-site sales", which `nav.ts` already had from feature 00, so `sales.vue` sets no `ownSubtitle` override — this matches the doc's own §3.4 note ("static, unlike Clients' dynamic subtitle") rather than being a guess.
- **The `MarkSaleDeliveredRequest`'s the confirm-shortfall retry inside `MarkDeliveredDialog.vue`** passes `confirmShortfall: true` automatically once the client-side preview shows a shortfall (so the button already reads "Mark delivered anyway" and one tap both confirms the date and accepts the shortfall) — the doc's flow D describes exactly this ("Still 2 taps; the owner has read the warning, and no second dialog opens").
- **No dedicated "5,000-sale farm" or "20-line sale" manual test was run** (AC51, AC52): the pagination and line-cap logic were verified by reading the code (server-side paging, `MAX_SALE_LINES` gating `Add size`) rather than by seeding real data, since the local Supabase stack (Docker) was not available in this session.

**Checked:** `bun run typecheck`, `bun run lint`, `bun run test:unit` (repo-wide 49 files/738 tests at the time of this check, including the four new sales spec files and the reconciled `sale-price.spec.ts`), `bun run build` (production Nitro build; `.output/` includes a `sales-*.mjs` client chunk and every new component, confirming no `#shared`-via-relative-path build break like feature 03's QA S3).

**Not verified (no running dev server against a live Supabase/Docker stack in this session; QA or a follow-up pass should check):** real phone keypads and iOS's lack of a Return key on numeric/decimal fields (feature 01 AC5's sheet-lift-above-keyboard behaviour, reused via `useSheetKeyboard`, was not re-checked on a real device for this wider 640px sheet); `USelectMenu`'s popover actually opening in view inside a bottom sheet on a phone (the design's own caveat: "falls back to a nested sheet if it doesn't" — no fallback was built, since the doc says the FE verifies this in a browser first); a screen-reader pass (the size radiogroup's native-radio approach should announce correctly, but VoiceOver/TalkBack were not run); the full 45/60-second timing bars with a stopwatch; light/dark mode visual review (classes follow the same semantic tokens as every other screen, but no screenshot comparison was done); the exact pixel wireframe layout (card heights, column widths) — the built layout follows the wireframe's information hierarchy and Tailwind conventions already in the codebase, but was not measured against the ASCII wireframes' implied pixel values; end-to-end runtime behaviour against the real `/api/sales/*` routes (at the time of writing, `mark-pending` and `void` route files were not yet present on disk — B7 was still landing — so only `typecheck`/`lint`/`build`/unit tests exercised this code, never a live request/response round trip).

### [FE] QA fix round (frontend, 2026-09-27): S1/S2/S3 from §5

**S1 (blocking, fixed).** `app/components/SaleForm.vue`'s type-change `watch` (Delivery pending → On-site branch) defaulted
the Sale date field to `originalSnapshot.deliveredDate ?? originalSnapshot.saleDate` — for a still-Pending delivery
(no delivered date) that fell through to the delivery's original, possibly back-dated, sale date instead of today.
Changed the fallback to `props.today`:
```
if (newType === 'on_site' && originalType.value === 'delivery') {
  state.saleDate = originalSnapshot.deliveredDate ?? props.today
}
```
The already-delivered branch (`deliveredDate` present) is untouched, as QA asked. Traced the exact repro by hand
(no component-mount test harness exists in this codebase — every other `.vue` file is verified the same way, by
reading the reactive graph, not by mounting): a delivery with `saleDate: '2026-09-01'`, `deliveredDate: null`,
`status: 'pending'`, edited on `today = '2026-09-27'` — `originalSnapshot.deliveredDate` is `null`, so the fallback
now lands on `props.today` (`2026-09-27'`), not the back-dated `'2026-09-01'`. The already-delivered case (`status:
'complete'`, `deliveredDate: '2026-09-15'`) still keeps `'2026-09-15'`, unchanged. `deriveForSubmit()`'s on-site
branch (`deliveredDate: state.saleDate`) picks up the corrected value automatically, so the fix reaches the actual
request body, not just the displayed field.

**S2 (fixed, plus one thing found while fixing it).** Two asks: switch `applyServerFields` to `SALE_FIELDS`, and add
a parity test.
- `SaleForm.vue`'s `applyServerFields` and `app/utils/sale-errors.ts`'s `mapSaleError` now index `fields[...]` by
  `SALE_FIELDS.type` / `.clientId` / `.saleDate` / `.deliveredDate` / `.lines` / `.version` / `.id`, imported from
  `#shared/constants/sales`, matching `ClientForm.vue`'s/`client-errors.ts`'s own convention exactly (`fields[CLIENT_FIELDS.name]`, not `fields.name`). `sale-errors.ts` wasn't named in the QA finding but had the identical
  literal-string smell (`fields.version`/`fields.id`), so it was fixed too for consistency.
- **Found while investigating parity:** `SALE_MESSAGES` (`shared/constants/sales.ts`) and `SALE_COPY`
  (`app/utils/sale-copy.ts`) didn't just lack a test — six of `SALE_MESSAGES`'s strings had actually drifted from
  §2.5's own Copy table (`saleDateFuture`, `deliveredDateFuture`, `clientInvalid`, `notPending`, `notComplete`,
  `voided`), while `SALE_COPY`'s versions of the same six matched the doc verbatim. Two of the six
  (`saleDateFuture`/`deliveredDateFuture`) are genuinely reachable from the server today (the zod schema in
  `shared/schemas/sales.ts` raises them as a backstop if a future date somehow reaches the route), so the wrong
  text really could have been shown to the owner, not just a latent risk. Fixed `SALE_MESSAGES` to match §2.5
  verbatim for all six (`shared/constants/sales.ts`) rather than changing the (already-correct) `SALE_COPY` side.
  Confirmed no test anywhere hard-coded the old (wrong) wording before changing it.
- Then removed the duplication itself, not just the drift: every `SALE_COPY` key that names a message the server
  can also raise (`clientRequired`, `quantityRequired`, `priceNotANumber`, `priceNotPositive`,
  `priceTooManyDecimals`, `saleDateFuture`, `dateEmpty`, `deliveredDateFuture`, `saveFailed`,
  `addSizeLimitReached`/`serverTooManySizes`, `serverDuplicateSize`, `serverSizesChanged`, `serverClientInactive`,
  `serverNotPending`, `serverNotComplete`, `serverVoided`, `changedElsewhere`, `deleteFailed`, `voidFailed`) now
  reads `SALE_MESSAGES.<key>` instead of holding a second literal — the same shape as `client-copy.ts`'s own
  comment ("field/refusal messages shared with the server live in `CLIENT_MESSAGES`; this file holds the rest").
  The keys with no server equivalent (`sizeRequired`, the dynamic `quantityLooseTooHigh`/`quantityTooBig`/
  `priceTooLarge`/`deliveredBeforeSale`, `editSaveFailed`, the toasts, the type-change notes, the empty/loading
  states) are untouched — they're genuinely UI-only.
- Added `tests/unit/sale-message-parity.spec.ts`: asserts every one of those `SALE_COPY`↔`SALE_MESSAGES` pairs is
  `===` (mostly a same-reference check now, but it still catches a future hand-typed literal reappearing on either
  side); pins the six corrected `SALE_MESSAGES` strings against §2.5's Copy table verbatim (in
  `client-name-parity.spec.ts`'s spirit of "read the source of truth into the test", though the mechanism here is
  copy text, not a character class); and statically greps `SaleForm.vue`/`sale-errors.ts` for the `SALE_FIELDS.`
  import and the absence of the old literal `fields.saleDate`-style access.

**S3 (fixed).** Added `tests/unit/sales-privacy.spec.ts`, mirroring `clients-privacy.spec.ts`'s structure adapted for
sales' narrower exposure (a sale carries `clientId`, never a name/phone): the nine sales routes + the repository are
enumerated and checked for the one fixed `[sales] <scope> <SQLSTATE>` log line, no raw `.message` read, `.details`
read exactly once (TM037's shortfall), no route-level logging, and no server file reading a client's name/phone;
the app-side files (`Sale*.vue`, `ClientPicker.vue`, `SizeChipPicker.vue`, `MarkDeliveredDialog.vue`,
`StockShortfallDialog.vue`, `useSales`/`useSaleMutations`/`useOnHand`, `sale-*.ts`, `sales.vue`) are checked for the
URL/storage/cookie patterns clients' own test forbids, for no SSR data-fetching helper, and (AC61) that
`useMe.ts`'s `clear()` drops both `sales:*` and `on-hand:*` keys.

**Verification:** `bun run lint` (clean), `bun run typecheck` (clean), `bun run test:unit` (**807 tests passed, 52
files** — up from 769/50 before this round: `sale-message-parity.spec.ts` and `sales-privacy.spec.ts` are new, plus
the six corrected `SALE_MESSAGES` strings and the `SALE_FIELDS`-based lookups in the two files above). AC65's two
branches were re-traced by hand against the corrected code (no live browser/Docker session was used for this,
consistent with the rest of this feature's frontend verification — see "Not verified" above): Pending→On-site now
defaults `state.saleDate` to `props.today` regardless of how far in the past the original sale date was; the
already-delivered→On-site branch is untouched and still defaults to the delivery's own `deliveredDate`.

## 5. QA report (QA)

### Round 2 re-review (2026-09-27) — final verdict

**Verdict: PASS.** All three round-1 findings (S1, S2, S3) are confirmed fixed by independent re-verification, not
just by trusting the frontend dev's report. No new issue found. 68/68 acceptance criteria now met.

**S1 (AC65) — confirmed fixed.** Read `app/components/SaleForm.vue:182-184` directly:
```
if (newType === 'on_site' && originalType.value === 'delivery') {
  state.saleDate = originalSnapshot.deliveredDate ?? props.today
}
```
Hand-traced both AC65 branches against the corrected code (no live browser available, same method used throughout
this feature):
- **Pending delivery → On-site** (`originalSnapshot.deliveredDate` is `null`, e.g. a delivery logged Sep 1, still
  pending on today's date Sep 27): the fallback now lands on `props.today` — the exact regression scenario from
  round 1 (a delivery ordered Sep 1, still pending, switching to On-site) now correctly defaults the date field to
  today, not Sep 1. Matches AC65's "It needs a date, default today."
- **Already-delivered delivery → On-site** (`originalSnapshot.deliveredDate` set, e.g. delivered Sep 15): unchanged
  — still defaults to `'2026-09-15'`. Matches AC65's "if the delivery was already delivered, its delivered date is
  kept as the default."
- `deriveForSubmit()`'s on-site branch (`saleDate: state.saleDate, ..., deliveredDate: state.saleDate`, line 339)
  reads `state.saleDate`, so the corrected default reaches the actual request body, not just the displayed field —
  confirmed by reading the function, not assumed.
- The "switch back to original type" branch (lines 170-175) and the On-site→Delivery branch (lines 177-181) were
  untouched by this fix and re-checked: still correct (unchanged from round 1's PASS-worthy behaviour).

**S2 — confirmed fixed, and verified independently rather than trusting the report.**
- `app/components/SaleForm.vue`'s `applyServerFields` and `app/utils/sale-errors.ts`'s `mapSaleError` now index
  `fields[SALE_FIELDS.type]` / `.clientId` / `.saleDate` / `.deliveredDate` / `.lines` (`SaleForm.vue:424-437`) and
  `SALE_FIELDS.version` / `.id` (`sale-errors.ts`) — grepped both files myself: no `fields.saleDate`-style literal
  access remains in either.
- **Independently re-checked all 6 corrected `SALE_MESSAGES` strings against §2.5's Copy table verbatim** (read the
  Copy table directly, not the fix report's paraphrase): `clientInvalid` ("This client is inactive now. Choose
  another client."), `saleDateFuture` ("The sale date can't be in the future. Pick today or earlier."),
  `deliveredDateFuture` ("The delivered date can't be in the future. Pick today or earlier."), `notPending` ("This
  sale is no longer pending. Void it instead."), `notComplete` ("This sale isn't complete anymore. The list is up
  to date now."), `voided` ("This sale is voided and can't be changed.") — all 6 match the doc's Copy table
  character-for-character. Confirmed `saleDateFuture`/`deliveredDateFuture` really are server-reachable:
  `shared/schemas/sales.ts:21,28` raise them via zod's `{ error: SALE_MESSAGES.saleDateFuture }`, and
  `server/repositories/sales.ts:127` maps `TM002` to the same constants — so this wasn't a cosmetic-only fix, it
  closed a real path where a hand-built or slow-clock request could have shown stale wording.
  `SALE_COPY.priceTooLargeServer`-equivalent and `deliveredDateBeforeSale` (server-backstop-only, unreachable in
  the normal flow because the client always shows an interpolated/currency-formatted version first) were correctly
  left as generic, currency-/date-free strings — the same established convention `clients.ts`/`CLIENT_MESSAGES`
  already uses (feature 03), not a new gap.
- `tests/unit/sale-message-parity.spec.ts` read in full: 20 same-reference assertions (`SALE_COPY[x] ===
  SALE_MESSAGES[y]`) plus 6 verbatim-text pins plus 2 static-source checks for the `SALE_FIELDS` import — a sound,
  proportionate test, run and passing.

**S3 — confirmed fixed.** Read `tests/unit/sales-privacy.spec.ts` in full: enumerates the 9 sales routes +
repository and asserts the one `[sales] <scope> <SQLSTATE>` log line, no raw `.message` read, `.details` read
exactly once (TM037's shortfall only), no route-level logging, no server file reading a client's name/phone;
separately checks the app-side sales files for URL/query/storage/cookie patterns, absence of SSR data-fetching
helpers, and that `useMe.ts.clear()` drops both `sales:*` and `on-hand:*`. Same shape and rigor as
`clients-privacy.spec.ts`; genuinely exercises the AC59/AC60/AC61 guarantees rather than restating them.

**Tests re-run by me for this round:**

| Suite | Command | Result |
|---|---|---|
| Lint | `bun run lint` | clean |
| Typecheck | `bun run typecheck` | clean |
| Unit | `bun run test:unit` | **807 tests passed, 52 files** (was 769/50 in round 1 — +38 tests: `sale-message-parity.spec.ts`, `sales-privacy.spec.ts`, plus growth in existing files) |
| DB reset | `bun run db:reset` | all 21 migrations still apply cleanly (no migration/schema changes this round — confirmed via `git status supabase/`: only the same 3 new migrations and 3 modified pgTAP files as round 1) |
| pgTAP | `bun run test:db` | **1177 assertions passed, 9 files** — unchanged from round 1, as expected with no DB changes |

No regressions, no new findings. This feature is ready for `done`.

**Still recommended, independent of this verdict:** a `security-auditor` pass before this goes live or before a
second farm starts using the app, per CLAUDE.md's own trigger list (this feature added new RLS-governed tables and
extended the repository layer) — not required for this QA verdict, which is about this feature's own acceptance
criteria and the invariants in scope for a per-feature review.

---

### Round 1 (2026-09-27) — findings sent back to frontend-dev, now fixed above

**Verdict: FAIL** (one acceptance criterion, AC65, is not met — see Should-fix S1; everything else checked out,
including every Blocking-class invariant in CLAUDE.md and every other trap called out in the review brief). One
round of frontend fixes should be enough; nothing here implicates the schema, RLS, the RPCs or the repository.

### Tests run

| Suite | Command | Result |
|---|---|---|
| Lint | `bun run lint` | clean, no output |
| Typecheck | `bun run typecheck` | clean, no errors |
| Unit | `bun run test:unit` | **769 tests passed, 50 files** (0 failed) |
| DB reset | `bun run db:reset` | all 21 migrations (incl. M14–M16) applied cleanly on a fresh database |
| pgTAP | `bun run test:db` | **1177 assertions passed, 9 files** (0 failed) — `070_sales.test.sql` alone: 84/84 |
| Independent spot-check (not part of the delivered suite) | a throwaway `999_qa_spotcheck.test.sql`, run via `supabase test db`, then deleted (tree confirmed clean via `git status` afterwards) | **5/5 passed** — see "Spot-checks" below |

No flaky or skipped tests. The one item §3.6/§4 flag as not run is the **two-session sale-number concurrency
recipe** (needs two simultaneously-open connections); I did not run it either, for the same reason clients'/sizes'
own docs give. This is a documented gap, not a finding — the single-session sequence (1, 2, 3, delete 2, 4) and the
advisory-lock code path (`app.lock_tenant_sales`, held across the counter update *and* the shortfall check) are
otherwise exactly what would need to serialise two concurrent callers, and the lock is exercised (single-session)
in every test that calls a write RPC.

### AC results

Legend: ✅ verified with evidence · ❌ not met. All 68 criteria checked; only AC65 is ❌.

| AC | Evidence |
|---|---|
| AC1–AC2 | `app/pages/sales.vue` sets the title/subtitle and `primaryAction` (`fab: true`, label "Add sale"); `tests/unit/server-guards.spec.ts` and `nav.ts` unchanged confirm 5 tabs. |
| AC3–AC4 | `app/components/SalesList.vue` (table ≥ ~720px / cards below, per `useElementSize`); `compareSalesNewestFirst` in `useSales.ts:58-61` sorts by `sale_date desc, sale_number desc`, matching `sales_tenant_date_idx` and `list_sales_json`'s own `order by`. |
| AC5 | `supabase/migrations/20260927065131_sales_functions.sql:98-105` assigns `sale_number` under `app.lock_tenant_sales`; pgTAP `070_sales.test.sql` §A: sales 1,2,3, delete 2, sale 4 (never 2 again) — passed. Uniqueness: `sales_tenant_number_key`. |
| AC6 | `app/components/SaleDetail.vue` shows number/type/status/client/dates/lines/total + actions by state (read by inspection). |
| AC7–AC11 | `SalesToolbar.vue` (date range, Status/Type chips, Client picker); `list_sales_json` filters server-side; `useSales.ts` keeps filters as page-local refs, never the router — grepped `router.push`/`window.location` in `sales.vue`/`Sale*.vue`: no matches. |
| AC9, AC52 | `app.list_sales_json`'s `v_limit := case when p_status='pending' then null else p_limit end` (M15:575) — pending is never capped; D4/`useSales.ts` paginate the rest server-side. |
| AC12–AC24, AC27–AC32 | `SaleForm.vue` (header + lines, size chips, qty, price, per-line hint, footer total, Already-delivered switch, discard dialog via `SaleFormOverlay.vue`); zod (`shared/schemas/sales.ts`) + DB (`app.validate_sale_lines`/`validate_sale_client`/`derive_sale_status`) both enforce the same rules — traced end to end. |
| AC16 | DB: `sale_lines` PK `(tenant_id, sale_id, size_id)` makes a duplicate impossible; `app.validate_sale_lines` also raises `TM029` before the insert is attempted. pgTAP §C: duplicate size → `TM029` — passed. FE: `SizeChipPicker` marks a used size "In this sale", `aria-disabled`. |
| AC22 | `app.sale_line_total` / `computeLineTotal` (BigInt, half-up); pgTAP §E reproduces the worked example exactly: 241 eggs @ ₱6.75/30 = ₱54.23, 120 eggs @ ₱6.00 = ₱24.00, total ₱78.23 — passed. |
| AC25–AC26, AC35, AC42 | `app.on_hand_json`/`app.check_sale_shortfall`, called from `create_sale`/`update_sale`/`mark_sale_delivered` *before* any write; pgTAP §F reproduces the exact worked example (360 → 210) and the shortfall/"Record anyway" round trip — passed. Independently reproduced in my own spot-check (below). |
| AC33–AC39 | `mark_sale_delivered`/`mark_sale_pending` (M16) are single `update ... set status, delivered_date/null, version` statements; `MarkDeliveredDialog.vue` for the UI flow. |
| AC40–AC43 | `update_sale` replaces header+lines in one function/transaction; version check (`TM036`) only when the request would actually change something (D6); pgTAP §D — passed. |
| AC44–AC45 | `delete_sale` (Pending-only, `TM041`) + `sales_delete_guard` trigger backstop; pgTAP §B and my own independent spot-check both confirm a **direct** `DELETE` on a complete sale is rejected, not just the RPC. |
| AC46–AC52 | `AppPlaceholder`-style states in `sales.vue`/`SalesList.vue` (read by inspection; not exercised in a live browser this session — see Notes). |
| AC53–AC57 | `app.on_hand_json` is the only place on-hand is computed; nothing is stored; `sale_json`/`get_sale` return everything an invoice needs; traced. |
| AC58 | `020_tenant_isolation.test.sql:299-414`: 24 named cross-tenant cases (both directions) for all 9 functions plus direct writes/reads, cross-tenant client/size references (`TM032`/`TM033`), anon denied on all 9 functions — all passed. |
| AC59 | `server/repositories/sales.ts:65-69` logs only `[sales] <scope> <SQLSTATE>`; `tests/unit/sales-repo.spec.ts` asserts this; grepped `console.` in `server/repositories/sales.ts`/`server/api/sales/`: only that one line. |
| AC60–AC61 | `app/pages/sales.vue`: `list.load(...)` only inside `onMounted` (client-only, no SSR fetch); `useMe.ts:59-60` clears `sales:*`/`on-hand:*` on sign-out. |
| AC62–AC63 | No roles in v1 (unchanged); `sale_json` re-reads `clients`/`sizes` by id so a rename shows immediately (no name/size copied onto a sale row). |
| AC64 | `SaleForm.vue:177-181` (On-site→Delivery: clears `alreadyDelivered`, defaults `deliveredDate` to today); DB: `derive_sale_status` handles the delivery branch identically regardless of how the type got there. |
| **AC65** | **❌ — see Should-fix S1.** `SaleForm.vue:182-184`: switching Delivery→On-site pre-fills the date field with `originalSnapshot.deliveredDate ?? originalSnapshot.saleDate` — for a still-**Pending** delivery (no delivered date), this defaults to the sale's **original (possibly back-dated) sale date**, not **today**, contradicting the AC's explicit "It needs a date, default today; if the delivery was already delivered, its delivered date is kept as the default." The already-delivered branch is correct. |
| AC66 | `update_sale`'s delta is computed as `(new complete-eggs) − (old complete-eggs)` per size over the union of old/new size ids (M16:223-243) — correct for a combined type+line change; pgTAP §F "editing a complete line down/up" — passed. |
| AC67–AC68 | `void_sale` (Complete-only, one-way); `sales_write_guard` trigger backstops a **direct** update clearing `voided_at`; pgTAP §B and my own spot-check both confirm this independently of `void_sale` itself. `SaleRowMenu.vue` renders nothing for a voided sale. |

### Spot-checks run directly against the database (independent of `070_sales.test.sql`)

I wrote a throwaway pgTAP file (`999_qa_spotcheck.test.sql`), ran it with `supabase test db`, then deleted it
(confirmed via `git status --short` that the tree is clean and `bun run db:reset` was re-run afterwards to leave
the local stack in its original state). All 5 assertions passed:
1. An on-site sale (240 eggs of a size with 300 produced) is created `complete` via the real `create_sale` RPC.
2. On-hand for that size is 60 (300 − 240) — matches `app.on_hand_json` by hand.
3. **A direct `DELETE` on that now-complete sale (bypassing `delete_sale` entirely) is rejected with `TM041`** —
   confirms the `sales_delete_guard` trigger backstop, not just the function's own check.
4. After voiding it through `void_sale`, **a direct `UPDATE ... SET voided_at = null` is rejected with `TM040`** —
   confirms the `sales_write_guard` trigger backstop, not just the absence of an "un-void" button/route.
5. On-hand for that size returns to 300 once voided, even though `status` stays `'complete'` forever — confirms
   `on_hand_json`'s exclusion is keyed on `voided_at is null`, not `status`.

This independently corroborates the claims in §4's "Deviation 2" (the added `sales_write_guard`/TM040 backstop)
and the delete-vs-void mechanism, rather than only re-reading `070_sales.test.sql`'s own assertions.

I also traced (rather than re-ran) the remaining "trickiest invariant" list from the brief:
- **No duplicate `size_id`, 1–20 lines:** the PK *is* the no-duplicate rule (`sale_lines_pkey`); `sale_lines_bounds`
  (a `FOR EACH ROW` deferred constraint trigger — Deviation 1 in §4, confirmed against the Postgres restriction it
  cites: transition tables can't combine with multi-event triggers, and `DEFERRABLE` requires `FOR EACH ROW`) checks
  the final count once per save. Exercised by pgTAP §C (0/21 lines, duplicate size).
- **Server-side shortfall, not client-trusted:** `check_sale_shortfall` is called from `create_sale`/`update_sale`/
  `mark_sale_delivered` with a freshly-computed `on_hand_json`, never a client-supplied figure; `confirmShortfall`
  only ever *waives* the exception, it can't change what's checked (D8). Confirmed in my spot-check (item 3 above,
  effectively) and pgTAP §F.
- **Idempotent create:** `sale_submissions.payload_hash` excludes `confirmShortfall` on purpose (so "Record anyway"
  after a shortfall isn't "a different payload"); pgTAP §G reproduces replay, differing-payload refusal, and a
  failed-then-retried-with-confirm submission under the same id — all passed.
- **Frozen totals (AC55):** `update_sale`'s `on conflict ... do update ... case when <eggs/price unchanged> then
  <old total>` (M16:255-262) — pgTAP §E changes the farm's `eggs_per_tray` between two edits and shows an untouched
  line's total is byte-identical while a changed line uses the new tray size — passed.
- **Tenant isolation end to end:** covered under AC58 above; also `010_rls_coverage.test.sql`'s generic sweep
  (registry rows added for all four new tables in `000_helpers.sql`) and `090_isolation_detects_breach.test.sql`'s
  four new weakened-policy mutations (m21–m24) confirm the isolation *test itself* would catch a regression.

### Findings

**Blocking:** none. Every Blocking-class rule in CLAUDE.md/the review brief was checked and holds:
- `tenant_id` + RLS + tenant-scoped policies (insert/update `with check`) on all four new tables
  (`supabase/migrations/20260927065130_sales.sql:645-711`).
- `tenant_id` is always server-resolved: every route uses `defineTenantHandler` (`server/api/sales/*.ts`, all 9
  confirmed by inspection and by `tests/unit/server-guards.spec.ts:57-65`); no route reads a tenant from the
  request; every RPC asserts `p_tenant_id` against the session (`TM006`).
- No superuser/service-role connection anywhere in the request path; `sales.ts` repository uses `TenantDb.rpc`
  exclusively, same as `clients.ts`/`production.ts`.
- No service-role key reachable from client code (unchanged from earlier features; not touched by this diff).
- All four new tables (`sales`, `sale_lines`, `sale_submissions`, `sale_counters`) are in the isolation test
  (`000_helpers.sql` registry, `020_tenant_isolation.test.sql`); the isolation suite passes, and
  `090_isolation_detects_breach.test.sql` proves it would catch a weakened policy.
- Inventory is computed (`app.on_hand_json`), never stored; rejects can't be sold (`sale_lines.size_id not null`,
  no reject slot exists on this table); pending sales are never subtracted (checked in the SQL and by pgTAP §F).
- Mark-delivered is one update (`mark_sale_delivered`, M16:274-329) that sets `status`+`delivered_date` together;
  on-site sales are created `complete` by construction (`derive_sale_status`, `sales_on_site_complete` CHECK).
- No migration already applied/committed was edited — M14/M15/M16 are new files in this diff (`git status`
  confirms all three are untracked, not modified).

**Should fix:**
- **S1 (AC65 unmet — the reason for the FAIL verdict).** `app/components/SaleForm.vue:182-184`:
  ```
  if (newType === 'on_site' && originalType.value === 'delivery') {
    state.saleDate = originalSnapshot.deliveredDate ?? originalSnapshot.saleDate
  }
  ```
  For a **Pending** delivery (no delivered date) switched to On-site in Edit, this pre-fills the Sale date field
  with the delivery's **original sale date** — which is very often in the past (back-filled deliveries are
  explicitly expected, AC23) — instead of **today**, as AC65 and UX flow H both specify ("the Sale date field
  takes the one date (today, or the delivered date if it was delivered)"). Concretely: a delivery ordered and
  logged on Sep 1, still pending today (Sep 27), switched to On-site in Edit, opens with the date field already
  showing **Sep 1**, not Sep 27. Nothing in the UI flags this (the type-change note for this branch,
  `typeNoteDeliveryPendingToOnSite`, says only "Its trays come out of your stock now" — no mention of the date),
  and the date passes validation silently (a past date is always valid, AC23), so a save recreates the sale as
  On-site dated Sep 1 unless the owner happens to notice and retype it. This does not corrupt data (the date is
  still a valid, past date and the server enforces "not in the future" independently), but it contradicts AC65's
  explicit default and could misdate an on-site sale's invoice date without the owner realising. Fix: default to
  `props.today` when `originalSnapshot.deliveredDate` is null, e.g. `state.saleDate = originalSnapshot.deliveredDate ?? props.today`.
  The already-delivered branch (`deliveredDate` present) is correct as written.
- **S2 (minor, not AC-blocking).** §4 [FE]'s own flagged gap: `sale-copy.ts`'s field/server message text was
  written independently of `shared/constants/sales.ts`'s `SALE_MESSAGES`, and no parity test exists between them
  (unlike feature 03's name/phone parity tests) — confirmed by inspection (`app/utils/sale-copy.ts` vs
  `shared/constants/sales.ts`). Also, `SaleForm.vue`'s `applyServerFields` (`SaleForm.vue:422-441`) matches server
  field keys by literal string rather than importing `SALE_FIELDS`, so a future rename of `SALE_FIELDS` would
  silently break the mapping without a type error. Neither is a functional bug today (the literals currently
  agree), but both are worth a follow-up parity test or a straight import, per the FE dev's own note.
- **S3 (minor).** No `sales-privacy.spec.ts` was written (feature 03 has `clients-privacy.spec.ts` for the
  equivalent guarantee). I verified AC59/AC60 by direct inspection and grep instead (see AC table), and found no
  violation, but a pinned test would catch a future regression the way feature 03's does.

**Notes (not required, worth knowing):**
- The two-session sale-number concurrency recipe (§3.6/§4) was not run, by either dev team or by me, for the
  documented reason (needs two simultaneously-held connections). The single-session mechanics that would have to
  work for it to hold (the advisory lock spanning both the counter update and the shortfall check, in one
  transaction) are exercised by every write-path pgTAP test, so this is a low-risk gap, not a blind spot in the
  underlying design.
- AC46–AC52's loading/empty/5,000-row/20-line layout states, the 45/60-second tap-count bars, iOS keypad
  behaviour, and light/dark screenshots were not exercised in a live browser this session (Docker/dev-server
  browser testing wasn't part of this pass either) — I traced the relevant code paths (`AppPlaceholder` states in
  `sales.vue`, `MAX_SALE_LINES` gating `Add size`, server-side pagination in `useSales.ts`) and they look correct,
  but this is code-reading evidence, not a browser check. Flagged for whoever does the first live QA/UAT pass,
  consistent with both dev teams' own "not verified" lists.
- `sale_lines_bounds` being a row-level (not statement-level) deferred constraint trigger (§4 Deviation 1) is a
  sound, well-justified adaptation to a genuine Postgres restriction (transition tables can't combine with
  multi-event triggers; `DEFERRABLE` requires `FOR EACH ROW`) — I confirmed the restriction is real and the
  row-level version gives the same "checked once per save, after every delete/insert" guarantee. Not a finding.
- The added `sales_write_guard`/`TM040` trigger (§4 Deviation 2, not itemised in §3.1's own trigger list) is a
  genuine improvement over the letter of the architecture doc, not a deviation that weakens anything — confirmed
  by my own independent spot-check (item 4 above) that it's load-bearing, not decorative.

### Re-review

Once S1 is fixed (a one-line change), this needs at most a quick re-check of AC65's two branches (Pending→On-site
defaulting to today; already-delivered→On-site keeping the delivered date) — everything else in this pass holds
and does not need re-verification. A `security-auditor` pass is still recommended before this goes live, per
CLAUDE.md's own trigger list (this feature touches the repository layer and adds new RLS-governed tables), but is
independent of the S1 fix.

## 6. Security audit (2026-09-27)

Whole-system audit focused on this feature's new surface (`sales`, `sale_lines`, `sale_counters`,
`sale_submissions`, the 9 RPCs, the repository, and all 9 routes). Run against the local Supabase stack with two
real tenants and live attacks (cross-tenant writes, tenant spoofing, direct-SQL bypass of the delete/void guard
triggers, anon access, a real stock-shortfall attempt), not just by reading code.

**Verdict: no Critical or High findings.** Cross-tenant isolation, the pending-only-delete and one-way-void
triggers, the per-tenant advisory-locked sale counter, anon lockout, and the server-side (never client-supplied)
shortfall check all held under direct attack. Full detail (what was verified live vs. read, and the exact SQL
tried) is in the auditor's own report; not duplicated here.

**Low findings, accepted, no fix required:**
- **L1:** a malformed hand-built request (a bad submission id/version, or a non-UUID route id) — unreachable
  through the normal UI, which validates client-side first — gets the "sale was changed" message instead of a
  generic one. Cosmetic; reveals nothing. Follow-up: give `TM005` and an invalid id param their own message.
- **L2 (documented and accepted at design time, `20260927065128_sale_counters.sql`):** an owner can rewind or jump
  their own farm's sale-counter value via a direct write; cross-tenant writes are still correctly blocked by RLS.
  Worst case is a numbering collision that safely errors, or numbering that looks odd. Not a cross-tenant issue.
- **L3 (pre-existing, unrelated to this feature):** `bun audit` flags a dev-only, Windows-only `esbuild` advisory
  (GHSA-g7r4-m6w7-qqqr), transitively pulled in by the Nuxt/Vitest toolchain. Not shipped in production, not
  introduced by feature 04.

## 7. Post-QA fix: login broke after the sales migration (2026-09-28)

Found by the owner in a real login attempt (`PGRST201`, "Could not embed because more than one relationship was
found for 'tenants' and 'sizes'"), not by the pipeline. Root cause: `sale_lines`'s composite FK to `sizes`
(`sale_lines_size_fk`, §3.1) gave PostgREST a second path from `tenants` to `sizes` (the original direct
`sizes_tenant_id_fkey`, and a new one through `sale_lines`), so any query that embeds `sizes` under `tenants`
without naming the relationship is now ambiguous. `findMembershipWithFarm` (`server/repositories/memberships.ts`)
runs this exact embed on **every sign-in**, before the tenant is even known, which is why it looked like a login
bug rather than a sales bug.

Fix: pin the direct relationship explicitly with `sizes!sizes_tenant_id_fkey` (per PostgREST's own error hint) in
both `memberships.ts`'s `findMembershipWithFarm` and `tenants.ts`'s `FARM_SUMMARY_COLUMNS` (the same embed,
reused by `GET /api/me`). No schema change. Verified live against the local database: the un-fixed query
reproduces `PGRST201` exactly; the fixed query clears it and fails only on the expected `anon`-role grant check.
`bun run typecheck`/`lint`/`test:unit` (807/807) all still pass. Any future query that embeds `sizes` under
`tenants` must use the same FK hint.

**Not independently re-verified (matches the gap both the architect and QA already disclosed):** the
two-simultaneous-connection sale-number concurrency race (needs two held-open DB sessions) and a full live HTTP
round-trip through a running dev server. The auditor verified the same guarantees at the SQL/RPC layer directly.

Owner decision (2026-09-27): none of L1–L3 block wrap-up; carried as follow-ups, not fixed in this feature.
