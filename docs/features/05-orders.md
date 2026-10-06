# Feature: Orders (take an order, confirm it, deliver it in one or more drops, and retire pending sales)

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want to log an order from a customer (who it's for, what sizes and how many trays, at what price) before the eggs leave, move it through requested, confirmed and ready, and then deliver it, so that "what do I still owe, and to whom?" has its own list, and a sale in my books only ever means eggs that really left the farm.

As the farm owner, I want to deliver an order in several drops (20 of 30 trays today, the rest on Friday) and see "20 of 30 trays delivered" on the order, so that I don't have to edit or re-log anything when I can't deliver everything at once.

As the farm owner, I want each delivery to become a normal sale with its own sale number and a link back to the order, so that stock, sales history and the later invoice all work from real sales.

As the farm owner, I want to close an order short when I'll never deliver the rest, and cancel an order that fell through before anything went out, so that my open list holds only orders I still mean to fill.

As the farm owner, I want to keep logging a sale straight away, with no order, when a customer buys on the spot or I deliver without having taken an order first.

**Why now / spec reference:**
- Product goal 3, "Track sales and deliveries in one place, including what's pending vs. delivered" (`docs/egg-farm-app-product-doc.md` §3, §4) and goal 5, "Trust the numbers". Feature 04 mixed the intent to deliver (a `pending` sale) and the finished sale in one record. The owner's decision (2026-10-03) is to split them: **orders** are the intent, **sales** are only what has really happened.
- Replaces the pending half of feature 04 (`docs/features/04-sales.md`). Every 04 criterion that depends on the Pending status is marked superseded there and replaced here (see the banner at the top of 04 §2).
- Builds on features 00 (shell), 01 (trays + loose input, discard and retry-safe-save conventions), 02 (sizes, active and archived), 03 (clients, default price, currency and the one price-display rule) and 04 (sales, sale numbers, void, the on-hand hint and the shortfall warning).
- **Visual design:** `docs/design/` has **no Orders screen**. The design only has the single-size Sales dialog with a "Pending" status. UX draws Orders in the design's visual language, and the owner should add it to the design source afterwards (see Open questions). The Dashboard "Pending deliveries" card and the Inventory "For delivery" figure (both later features) will read from open orders instead of pending sales.
- **Personal data.** Orders point at clients (names and phones). Everything feature 03 and 04 require for client privacy applies (AC52 to AC55).

## 2. Acceptance criteria (PM)
Terms used in these criteria:
- **Owner** means a signed-in, provisioned owner. **Mobile** is about 375px wide; **desktop** is 1024px or more. **Today** is the owner's local date on their device.
- **An order** is a promise to deliver: one **header** plus one or more **lines**. The header has the **order number**, the **client**, the **order date** (the day the order was taken), an optional **wanted-by date**, and the **status**. A **line** is one egg **size**, an ordered **quantity**, a **price per tray** and the **line total**. The **order total** is the sum of its line totals.
- **Statuses**, in order: **Requested** (the customer asked), **Confirmed** (the owner agreed), **Ready** (the eggs are set aside), **Partially fulfilled** (some eggs have gone out, some are still owed), **Fulfilled** (everything ordered has gone out, or the order was closed short). Plus **Cancelled** (fell through before anything went out). Status is always shown as text, never colour alone.
- **A delivery** is one drop of eggs against an order. Each delivery **is a normal sale** (feature 04) with its own sale number, marked as coming from the order. An order can have many deliveries.
- **Delivered so far** for a line is the sum of that size's eggs on the order's deliveries that are **not voided**. **Remaining** for a line is ordered minus delivered so far. Both are always **computed from the sales**, never typed or stored separately, so they can't drift from the real sales.
- **An open order** is Requested, Confirmed, Ready or Partially fulfilled.
- **On hand** is as defined in feature 04: good production minus the eggs of **non-voided sales**. Now that sales are always real, every non-voided sale counts; there is no pending to ignore. **Orders never change on hand**, only the deliveries (sales) they create.
- **Order number** and **sale number** are separate sequences per farm. Screens always say "Order #12" or "Sale #12", never a bare number.
- **Direct sale** means a sale logged without an order (feature 04's Log a sale form). They stay.
- Quantity, price and rounding rules are feature 04's (AC19 to AC22), applied to order lines. Examples use 30 eggs per tray and "₱", only for format.
- "Open question N" points to the numbered list at the bottom; each criterion is written to its recommended default. Items marked **[not in design]** are needed but the design doesn't draw them.

**The Orders screen**
- [ ] AC1: Orders is a screen reachable from the main navigation in **one tap** (decided: on mobile the bottom bar is Home, Production, Orders, Sales and a **More** tab that opens a sheet with Inventory and Clients; on desktop the sidebar lists all six destinations, see Open question 2). The title is "Orders". On desktop the top bar shows an **"Add order"** button; on mobile a round **"+"** button shows instead, above the bottom tab bar and never covering a tab. Either opens the **New order** form in one tap. They show only on the Orders screen; the Sales screen's Add button is unchanged.
- [ ] AC2: **The list.** Each order is one row (desktop table) or one stacked card (mobile). It shows: the **order number**, the **client's name**, the **order date**, the **wanted-by date** if set, a **summary of its lines with progress** (for example "Large · 20 of 30 trays, Medium · 0 of 10 trays"; when there are too many lines to fit, the summary may shorten but the number of lines is always readable), the **order total** in the farm's currency, and the **status** as text. On mobile the status and the **Deliver** action of an open order are visible without opening anything.
- [ ] AC3: **Order of the list.** The default view is **Open** orders. In it, orders with a wanted-by date come first, soonest first, then orders without one, oldest order first (what is owed longest, and what is due soonest, is at the top). In any other view, newest order date first, then highest order number.
- [ ] AC4: **Filters.** Status chips: **Open** (default), **All**, **Fulfilled**, **Cancelled**. A **Client** filter lists every client, active and inactive, A to Z, searchable by name ignoring case and accents. A **from-to order-date range** with **Clear**. Filters combine; the date range includes both end dates. Changing a filter updates the list without a reload. Filters reset on a fresh visit and last while the owner stays on the screen. The client filter's choice is never put in the address bar or browser history (AC53).
- [ ] AC5: **Nothing hidden from Open.** The Open view shows **every** open order in the farm, however many orders there are and however old they are. A long history of fulfilled and cancelled orders never cuts it short (AC49).
- [ ] AC6: A filter combination that matches nothing shows **"No orders match these filters."** with the filters still usable and an obvious **Clear filters**. A farm with no orders at all sees **"No orders yet"** with an **Add order** button, instead of the filters and list. While loading, a loading placeholder shows (never the empty state); on load failure a plain-language message with **Try again** shows.
- [ ] AC7: **Order detail.** Tapping an order opens its detail in one tap, showing: order number, status, client, order date, wanted-by date, **every line** (size, ordered, delivered so far, remaining, price per tray, line total, all quantities in trays + loose), the **order total**, a **list of its deliveries** (sale number, delivered date, what went out, voided ones marked **Voided**; each opens that sale), and the actions that apply to its status (AC8). An order with 6 lines is fully readable on mobile without horizontal scrolling.

**Take an order (the hot path)**
- [ ] AC8: **Actions by status** (the full rules are in AC19 to AC36). Requested, Confirmed and Ready: **Deliver**, **Edit**, change status, **Cancel**. Partially fulfilled: **Deliver**, **Edit** (limited, AC19), **Close short**. Fulfilled and Cancelled: view only, except that a Fulfilled order can be viewed with its deliveries. An action not allowed for the order's status isn't offered.
- [ ] AC9: The **New order** form (a centred dialog on desktop, a bottom sheet on mobile) has a **header part** and a **lines part**, like feature 04's Log a sale. Header: **Client** (required), **Order date**, **Wanted by** (optional). Lines: one or more, each with **Size**, **Quantity** (trays + loose), **Price per tray** (farm currency symbol as a prefix, "per tray", placeholder "0.00"), **line total**, an **Add size** control and a remove control on each line. Below, the **Order total**. **Cancel** and **Save**. Every field has a visible label. The form opens with **one empty line**. There is **no** type toggle, no "Already delivered" switch and no stock hint-and-warn on this form: ordering does not touch stock (AC10). (Pickup and on-site orders: see Open questions, default none.)
- [ ] AC10: **Ordering doesn't move stock and doesn't warn.** Saving, confirming, marking ready, editing and cancelling an order leave every size's on hand unchanged, and never ask about stock. QA checks with the on-hand hint before and after.
- [ ] AC11: **Client** is required ("Choose a client"). The picker is searchable, ignores case and accents, and lists **active** clients only, A to Z. It offers **"+ new client"** that opens feature 03's Add client form and returns to the order with that client chosen and everything typed kept. A farm with no active clients sees the picker's empty state with that option.
- [ ] AC12: **Lines.** 1 to 20 lines; each line has a size, a quantity of at least 1 egg and a price; one line per size (a size already used is shown unavailable, "In this sale" wording adapted to "In this order"); only active sizes are offered; no reject option. Quantity rules (whole numbers, loose at most tray size minus 1, at most 100,000 eggs per line, using the farm's tray size, never a fixed 30) and price rules (above 0, at most 2 decimals, up to 9,999.99, decimal keypad on mobile) are feature 04's AC19, AC20 and AC21, unchanged. QA repeats the tray-size check on a farm set to 24 (1 tray + 5 = 29 eggs; loose maximum 23).
- [ ] AC13: **Price pre-fills but doesn't bind.** Choosing a client with a default price fills the price of each line the owner hasn't typed one into, and lines added later; a typed price is never overwritten (feature 04 AC18). The price on the order line is the line's own; changing it never changes the client's default, and a later change of the client's default never changes a saved order.
- [ ] AC14: **Line totals and the order total** follow feature 04 AC22 exactly: line total = price per tray × eggs ÷ tray size, rounded half up to the centavo with exact arithmetic; the order total is the sum of the rounded line totals; a line with no valid price or quantity shows a dash. Example: Large 8 trays + 1 at ₱6.75 = ₱54.23 and Medium 4 trays at ₱6.00 = ₱24.00 give an order total of **₱78.23**.
- [ ] AC15: **Dates.** The order date defaults to today; any past date is allowed (back-filling from the notebook), a future date is rejected with a message. Wanted-by is optional and may be any date from the order date onward (it can be in the future); one before the order date is rejected. There is no time slot, address, route or driver (out of scope).
- [ ] AC16: **Save, errors and double-taps.** Enter (or Go) does the same as Save; messages show under the field or on the line they belong to; the first message gets focus; Save is enabled before the first message. While saving, Save shows a spinner and can't be pressed again. Tapping it several times, or tapping again after the connection dropped but the server saved, creates **one** order with **one** order number and each line once. A failed save creates nothing, keeps every typed value (header and lines) and shows "Couldn't save. Check your connection and try again." Closing the form with anything entered first asks "Discard this entry?" with **Discard** and **Keep editing**. After a successful save: the form closes, a toast confirms it (it may include the order number), and the order appears in the list at its place, highlighted, without a reload; if filters would hide it, they are cleared.
- [ ] AC17: **Main path.** On a phone, a tester can log an order with two lines (Add, pick the client, pick the first size and trays, Add size, pick the second size and trays, Save; prices pre-filled) in **under 60 seconds**, with no other field, choice or confirmation.
- [ ] AC18: **Order numbers.** Every order gets an **order number** from the system: a whole number **per farm**, first order is 1, independent of sale numbers and of other farms. It is **unique in the farm and never reused**, given in the order orders are **logged** (not by order date). Nobody types or changes it; editing, status changes and deliveries never change it. Two orders saved at the same moment (two phones) get different numbers; a retried save that ends as one order has one number.

**Change an order**
- [ ] AC19: **Edit** is in the row menu and the detail, at most 2 taps from the list, and opens the same form titled "Edit order #{number}", pre-filled, with the order number unchangeable. Saving with nothing changed closes the form with no request and no toast. What can change depends on whether anything has been delivered (open question 3):
  - **Nothing delivered yet** (Requested, Confirmed, Ready): everything in the header (client, order date, wanted-by) and the lines (change size, quantity or price, add or remove a line, at least one stays).
  - **Something delivered** (Partially fulfilled): the **client** can't change (the eggs already went to that client); a line **can't go below what was already delivered** for it (the form states the minimum, "At least {n} delivered"), and a **line that has deliveries can't be removed or change size**. Other lines can be added, edited or removed. Price changes affect only **future** deliveries, never a delivery already made. Order date and wanted-by can change.
  - **Fulfilled and Cancelled** orders can't be edited.
  - If an edit lowers every remaining amount to zero (every line's ordered now equals delivered), the order becomes **Fulfilled** by itself, with a plain toast saying so.
  - An existing order keeps its **inactive** client and any **archived** size selected and valid in the edit form. Only active clients and sizes are offered for a newly chosen client, or a new or changed line.
- [ ] AC20: **Stale-edit check.** If the order (header, a line, or its deliveries) changed elsewhere since the form opened, the save is refused with a plain message, the list and detail refresh to the current data, and nothing is changed by mistake (feature 04 AC43, feature 03 AC19).
- [ ] AC21: **Changing status before the first delivery.** The owner can move an order among **Requested, Confirmed and Ready**, forward and backward, from the row menu and the detail, in **at most 2 taps**, with no confirmation (a quick action such as "Confirm" or "Mark ready" is one tap on the detail). The status can't be set to Partially fulfilled or Fulfilled by hand: those come only from deliveries and from Close short. Moving status does not change stock, the order number or any line.
- [ ] AC22: **Cancel.** An order with **no delivery yet** (Requested, Confirmed, Ready) can be **Cancelled**. Cancel asks first ("Cancel order #{n} for {client}? It hasn't left the farm, so your stock doesn't change.") with **Cancel order** and **Keep order**. A cancelled order keeps its row, lines and order number, drops out of the Open view, is shown marked **Cancelled** under All and Cancelled, can't be edited, delivered or reopened, and changes no client, size, stock or other order. **An order that has any non-voided delivery can't be cancelled** (voided deliveries don't count, owner decision G1): the system refuses it with a plain message pointing at Close short (available while Partially fulfilled). Hand-built requests are refused the same way. An order whose every delivery has been voided is back at Ready (AC35) and can be cancelled again.
- [ ] AC23: **Orders are never deleted.** There is no Delete for an order, in any status. A mistaken order is Cancelled (before any delivery). The number stays used.

**Deliver an order (fulfilment)**
- [ ] AC24: **Deliver** is **one tap** from an open order's row or card (visible without opening a menu) and in its detail and menu. It is offered for every open status (Requested, Confirmed, Ready, Partially fulfilled), so an owner who drops off eggs doesn't have to step through statuses first (open question 6). It opens **one small step** listing each line that still has eggs remaining, with a **"deliver now"** quantity (trays + loose) **pre-filled with that line's remaining amount**, and a **Delivered date** (default today; not in the future; not before the order date). The step names the order (number, client). The usual case, delivering everything that is left, is therefore **2 taps** (Deliver, then confirm). Cancel or closing the step changes nothing.
- [ ] AC25: **Partial and full.** The owner can lower a line's "deliver now" quantity (down to 0 to leave that line out) to deliver part of an order. At least one line must have at least 1 egg to deliver ("Enter a quantity"). A line's quantity uses the farm's tray size (feature 04 AC20, AC21).
- [ ] AC26: **Over-delivery is refused.** A line's "deliver now" can't exceed what is **remaining** on that line: the step shows a message on the line ("Only {n} left to deliver") and blocks the button. The system refuses it too, with the same plain message and nothing saved, including a request built by hand and including two phones delivering the same order at the same moment (the second one is refused for the amount that is no longer owed, with the current remaining shown). Delivering more than was ordered is done as a separate direct sale.
- [ ] AC27: **What one delivery creates.** Confirming creates **one sale**: type Delivery, the order's client, the delivered date, and one line per size with eggs delivered now, each at **the order line's price per tray** (frozen on the sale as in feature 04 AC55), with its own new **sale number**, all as one change, linked to the order. Lines with 0 now are not on the sale. The toast confirms it and includes the sale number ("Delivered: sale #{n}") and, when relevant, the order's new status.
- [ ] AC28: **Status after a delivery** is set by the system, in the same change: **Partially fulfilled** while any line still has eggs remaining; **Fulfilled** when every line has nothing remaining. The detail and list show the new status and progress straight away, without a reload.
- [ ] AC29: **Stock.** A delivery lowers each delivered size's on hand by exactly its eggs, once (same on-hand figure as the Log a sale hint). QA checks: Large has 600 eggs produced and no sales; an order for Large 300 eggs; deliver 120 now; on hand shows 480; deliver the last 180; on hand shows 300.
- [ ] AC30: **Not enough stock, in the same step.** If a delivery would take any size's on hand below 0, the same step lists each short size with what is on hand and what it takes (as in feature 04 AC26) and its button reads **Deliver anyway**. There is no second dialog. Sizes with enough stock aren't named. Going back keeps what was typed. (Warn, then allow, as for any sale.)
- [ ] AC31: **No double or lost delivery.** Tapping confirm several times creates **one** sale, one sale number, and moves stock once per line. If the connection drops after the server saved, tapping again ends with **one** delivery, not two. If the request fails, nothing is created, the order keeps its status and remaining amounts, and an error toast that stays until dismissed offers **Try again**. If another phone delivered meanwhile and the amounts no longer fit, AC26 applies, not a scary error.
- [ ] AC32: **Delivered so far is always computed.** The progress on every order equals the sum of its non-voided deliveries' eggs per size. QA checks by delivering, voiding a delivery (AC36) and editing the date of a linked sale, and comparing the order's progress to the sales.
- [ ] AC33: Delivering for an order whose **client has since become inactive**, or with a line of a size since **archived**, still works; the sale keeps that client and size. Marking a client inactive or archiving a size never changes any order or sale (feature 03 AC34, feature 02 AC28).

**Close short and what happens to deliveries later**
- [ ] AC34: **Close short.** A **Partially fulfilled** order has **Close short** in its detail and menu (and only then). It asks first, naming the order and listing what will be **dropped** per size ("Closing short drops 10 trays of Medium. Deliveries already made stay."), with **Close short** and **Keep open**. Confirming sets the order to **Fulfilled**, records that it was closed short and when, and shows it as **Fulfilled (closed short)** in the list and detail with the dropped amounts. Nothing is delivered and stock doesn't change. It is one-way: a closed order can't be edited, delivered, cancelled or reopened. Close short is refused for any other status (including Requested/Confirmed/Ready, which are Cancelled instead), by the system as well as by hiding the button.
- [ ] AC35: **Voiding a delivery.** Voiding a sale that came from an order (feature 04 AC67) keeps its rules (eggs back on hand, row and number kept) and also **updates the order in the same change**: that delivery stops counting toward delivered-so-far and remaining grows back. A **Fulfilled** order (delivered in full) falls back to **Partially fulfilled** if some non-voided delivery remains, or to **Ready** if none remains (open question 7). The same applies to a **Partially fulfilled** order whose last non-voided delivery is voided: it goes back to **Ready** (owner decision G1), so it can be edited freely, delivered or cancelled again. "Delivered" and "something delivered" in AC19 and AC22 always mean non-voided deliveries. An order **closed short** stays Fulfilled (closed short) and its dropped amount is unchanged. The void dialog on a linked sale says the order will reopen ("Order #{n} will show {x} still owed"). The order's list of deliveries shows the voided one marked **Voided**.
- [ ] AC36: **Editing a sale that came from an order.** A linked sale can't have its client or lines changed (size, quantity, price, add or remove), because the order's progress is computed from them; the Edit form shows these read-only with a note ("Void this delivery and deliver again to change eggs"), and the system refuses a hand-built change the same way (open question 5). Its **date** can still be changed, with the usual rules. Voiding is the correction.

**Sales after this feature (pending is removed)**
- [ ] AC37: **No Pending sales.** After this feature, no sale can be Pending anywhere: not in the Log a sale form, list, filters, detail, row menus, API, or database. Every sale is a real transaction that has already left the farm and counts toward stock until voided.
- [ ] AC38: **Log a sale form (direct sales).** Keeps the Delivery / On-site toggle, client rules (Delivery requires a client; On-site optional), lines, price pre-fill, totals, date and the AC26 stock-shortfall warning of feature 04. It loses the **"Already delivered"** switch and the delivered-date field: logging any sale means the eggs have gone, on the sale's **date** (default today, not in the future). The shortfall warning applies to **every** new direct sale, since every sale takes stock. The save toast includes the sale number: "Sale #{n} recorded" (owner decision D4, as in feature 04).
- [ ] AC39: **Sales list and detail.** The Status chips (Pending/Complete) and the status text are gone; the list keeps the date range, Type chips and Client filter, and the voided toggle (feature 04 AC68). A sale that came from an order shows **"From order #{n}"** in the list and detail, and tapping it opens the order. Sale detail actions are **Edit** (AC36 limits apply) and **Void** only: no Mark delivered, no Mark as pending, no Delete.
- [ ] AC40: **Sales become void-only.** A sale (any type, linked or not) can never be deleted, by anyone, in the app or by a hand-built request. Correction is Edit, or Void for a mistaken sale. The sale number of a voided sale stays used forever.
- [ ] AC41: **On hand** (the hint on Log a sale and the figure Inventory will show) is good production minus all non-voided sales. QA re-runs feature 04's example without the pending sale: Large has 600 eggs produced and one sale with a Large line of 240; the hint shows **12 trays** (360); voiding that sale shows 20 trays (600). Open orders, whatever their status, never change it.
- [ ] AC42: **Type change on a sale** (Delivery <-> On-site, feature 04 AC64 to AC66) stays, but is a plain edit: Delivery needs a client (a kept inactive client is accepted); On-site's client is optional; the sale number, date and lines are unchanged; **stock never moves** because of a type change; the AC26 warning never appears for it. A sale that came from an order can't change type (it is a delivery to the order's client, AC36).

**Converting existing pending sales (one-time migration)**
- [ ] AC43: **Every existing pending sale becomes one order**, none lost, none duplicated: same client, same lines (size, eggs, price per tray, line total unchanged), order date = the pending sale's sale date, no wanted-by date, status **Confirmed** (open question 8). Pending sales are then gone from Sales (they are not also left as sales). QA seeds pending sales (including one with a client since made inactive and one with an archived size) before the change and compares after: same count, same lines, same totals, same client and sizes still valid.
- [ ] AC44: **Stock and history don't move.** Because pending sales never counted toward stock, on hand for every size is **identical before and after** the conversion. Complete sales, their numbers, lines and totals, and voided sales are untouched.
- [ ] AC45: **Numbers.** The converted orders get **new order numbers** (in order of the old sale number, so their relative order is kept). The old sale numbers are **retired**: they are never given to another sale, and the Sales list shows a gap there. Each converted order shows **"Formerly sale #{old}"** in its detail so the owner can still find what a customer was told (open question 1). Sale numbers of Complete sales never change.
- [ ] AC46: **Repeatable and safe.** Applying the change to a farm with no pending sales changes nothing and doesn't fail. A farm's data is converted all-or-nothing: no farm ends with half its pending sales converted. Each farm's conversion only touches that farm.

**Layout, performance, data rules and privacy**
- [ ] AC47: **Mobile (375px):** no horizontal scrolling on the list, cards, detail, form or deliver step; every tappable control (Add, "+", Deliver, status actions, menu, cards, chips, Add size, remove line, steppers, Save, Cancel, dialog buttons) is at least **44px** tall and wide; the last card scrolls clear of the "+" and the tab bar; Save and the deliver button stay reachable with the keypad open. An order with **20 lines** can be entered, saved, opened, edited and delivered without breaking the layout.
- [ ] AC48: **Desktop and tablet:** content centred at the design's maximum width (about 1120px); works between 768px and 1023px with the sidebar collapsed and expanded; Add is always reachable. Light and dark mode keep names, quantities, progress, prices, badges and messages readable.
- [ ] AC49: **A long history stays quick.** With **5,000 orders** (some with several lines and several deliveries), the list shows quickly and lets the owner reach older ones ("Show more", or the date range and filters); never a blank or broken screen. AC5 always holds.
- [ ] AC50: **The rules are enforced by the system, not only by the form**, so a hand-built request can't store an invalid order and gets the same plain message as the form, not a server error: 1 to 20 lines; one line per size; quantity 1 to 100,000 eggs; price above 0 with at most 2 decimals up to 9,999.99; a client is always required; sizes and client belong to this farm; a new order, or a line newly added, can't use an inactive client or an archived size; the order date isn't in the future; wanted-by isn't before the order date; the order number is assigned only by the system; the status moves only as in AC21 to AC28 and AC34, AC35 (no jumping to Fulfilled or Partially fulfilled by hand); a delivery never exceeds what is remaining (AC26); a cancelled or fulfilled order accepts no edit, delivery, status move or second cancel/close.
- [ ] AC51: **History-proof numbers.** An order line's eggs are kept exactly in individual eggs. Its price and total don't change when the farm's tray size or currency later changes (the currency only relabels), and neither do the prices and totals on its deliveries (feature 04 AC55). Because a delivery's line total is rounded on its own eggs (AC14), the totals of several deliveries of one line may differ from the order line's total by a centavo or two; each saved delivery's own figures never change.
- [ ] AC52: **Cross-farm isolation.** The farm-isolation test is extended to orders, their lines and their deliveries, for reads **and** writes. Farm A's owner can't list, read, create, edit, change status of, cancel, deliver, close or void-through any of farm B's orders, including requests that name farm B's order, client or size, a delivery that links farm A's sale to farm B's order, or farm B itself; and the reverse. Order numbers are per farm and reveal nothing about other farms. A signed-out request gets no order data and can't change any. Only the signed-in owner can log or change orders; no roles in v1.
- [ ] AC53: **Nothing personal in the address bar or the page.** Client names, the client filter and any client detail are not put in the URL or browser history. Client names on the Orders screen aren't part of the server-rendered page; the list loads after the screen opens.
- [ ] AC54: **No personal data in logs.** Client names, phones, prices and quantities don't appear in server logs, error reports or error responses, including for failed validation and server errors. Messages refer to the field or line, not the value. QA fails a request on purpose and reads the logs.
- [ ] AC55: **Shared or lost phone.** After Sign out, the Back button doesn't show the orders list or an order's detail, and signing in as another farm on the same device shows none of the previous farm's orders, sales or clients.
- [ ] AC56: **Related screens stay right.** Renaming a client or a size shows the new name on orders and past sales. The Dashboard and Inventory placeholders are unchanged by this feature (their cards are later features). The Clients and Settings screens behave as before.

**Out of scope:**
- **Reserving or allocating stock to an order**, any stock warning on Requested/Confirmed/Ready ("you're short for this order"), and a low-stock alert. Orders never touch on hand. (A "short on stock" hint when marking Ready could be a later add.)
- **Pickup / on-site orders** (default: not in v1, see Open questions) and any order type beyond delivery.
- **The Dashboard "Pending deliveries" card, "Recent sales", and the Inventory "For delivery" figure.** Their own features; they will read open orders.
- **Invoice / print view** (renumbered, see below), **payment status, amounts owed, balances, partial payment, deposits** (non-goals: accounts receivable). The order total is only a record.
- **Delivery routing, time slots, addresses, drivers, recurring or standing orders, order notes, customer-facing order links or a customer portal** (non-goals: routing and scheduling; multi-user).
- **Reopening a cancelled or closed-short order, un-voiding a sale, deleting an order or a sale.**
- **Delivering more than was ordered inside the order** (use a direct sale), **splitting or merging orders**, **bulk status changes**, **duplicate or repeat order**, **import/export**, **searching by order number**, **per-client totals**.
- **Offline, multi-user, roles, "who logged this", realtime updates, flock health** (v1 non-goals, kept out; noted for later).

**Replaces / revises in feature 04** (all marked in `docs/features/04-sales.md`): Pending status and everything that depends on it (AC3 to AC9, AC23 to AC29, AC33 to AC45, AC52 to AC58, AC64 to AC66, and decisions SL3, SL4, SL8, SL10, SL14, SL17, SL18, SL19, Q4, Q6). Feature 04's **Void** (AC67, AC68), sale numbers (AC5), sale lines, the on-hand hint, the shortfall warning, price and rounding rules, and privacy rules **stay**.

**Spec edits needed (the PM does not make these; for the coordinator or architect at wrap-up):**
- `CLAUDE.md` "Units and data model": the sale `status` is no longer `pending`/`complete` (remove it); "Marking a delivery complete asks for the delivered date" and "pending deliveries are not subtracted" go away; "A pending sale can be hard-deleted" goes away (sales are void-only); `delivered_date` null no longer means pending; the "type can be changed" rule loses its status effects; add orders (`orders` + lines, statuses, `sales.order_id`, computed delivered-so-far, order numbers, no delete, cancel/close-short rules); the "Navigation has 5 destinations" line depends on the nav answer; "Open decisions" and the pending bullet in the Deliveries sentence ("deliveries are one kind of sale") need a note that deliveries are now fulfilments of orders or direct sales.
- `docs/egg-farm-app-architecture-spec.md`: "Sales (absorbs Deliveries)" (around the status/`date_delivered` rows, lines 172-178), the Inventory "pending/for delivery" definition, and a new Orders section; the invoice feature number.
- `docs/egg-farm-app-ui-spec.md`: Flow B (log a delivery as pending, around line 256), Sales list 5a status chips and Mark delivered 5c, the Dashboard "Pending deliveries" card (reads open orders), the Inventory "For delivery" per size, the navigation (5 vs 6 destinations), and a new Orders screen and flow.
- `docs/egg-farm-app-product-doc.md`: wording of pending deliveries in goals 3 and the dashboard goal; the invoice renumbering note.
- `docs/design/`: the owner adds an Orders screen, the deliver step and the order detail; today the design shows a Pending status on the single-size Sales dialog.
- **Feature numbering.** Feature 04 names "feature 05" as the invoice/print view and "feature 06" as Inventory. Orders is now 05. Recommended: **Inventory stays 06, the invoice/print view becomes 07**; every "feature 05" in 04, 02, 01 and the specs that means the invoice must be updated. (04 is marked with this note.)

**Open questions for owner** (each with the PM's recommended default; designers should work to the default unless told otherwise):
1. **Sale numbers of converted pending sales (blocks the migration design).** They get new order numbers; what happens to their old sale numbers? Default: retire them (never reused, a visible gap in Sales) and show **"Formerly sale #N"** on the converted order (AC45). Alternatives: the order keeps the old number as its order number (but then the order and sale sequences must not clash), or the converted rows stay in Sales marked completed (rejected: they never left). **First check whether any real pending sales exist**; if none, this question is moot.
2. **Navigation. DECIDED (owner, 2026-10-03):** six destinations in total, but the mobile bottom bar shows **five tabs: Home, Production, Orders, Sales, More**. **More** opens a bottom sheet listing **Inventory** and **Clients**. Desktop keeps a sidebar with all six (Dashboard, Production, Orders, Sales, Inventory, Clients). Six tabs were too crowded at 375px (about 62px each). The Figma frames "Mobile / Orders list" and "Mobile / More menu" show it. Feature 04 AC1 ("still exactly five") and CLAUDE.md ("5 destinations") must be updated at wrap-up. Open detail for UX: the More tab is highlighted while Inventory or Clients is open.
3. **Editing after Confirmed (AC19).** Default: an order is fully editable until its first delivery; after that the client is fixed, deliveries are protected as in AC19, and Fulfilled/Cancelled are read-only. Alternative: lock lines once Confirmed (any change = cancel and re-enter).
4. **Do pickup (on-site) orders exist?** Default: **no**. An order is always a delivery to a client; customers who collect at the farm are logged as direct on-site sales. Orders have no type toggle (AC9). Alternative: a Delivery/Pickup type on orders, with pickup fulfilments creating on-site sales.
5. **Editing a sale that came from an order (AC36).** Default: client and lines are locked (void and redo), the date stays editable. Alternative: allow reducing eggs on a linked sale (the order's remaining then grows).
6. **Can an order be delivered while only Requested (AC24)?** Default: yes, any open status, to save taps. Alternative: require Confirmed first.
7. **Status when the last delivery is voided (AC35).** Default: the order goes back to **Ready**. Alternative: Confirmed.
8. **Initial status of converted pending sales (AC43).** Default: **Confirmed**. Alternative: Ready.
9. **Wanted-by date (AC9, AC15).** Default: optional on the order, sorts the Open view, no time slot or routing. Alternative: drop it (then Open sorts by order date only). It is a light due date, close to the routing/scheduling non-goal, so the owner should confirm.
10. **One date or two on a sale.** Default: a sale has one **date** (the day the eggs left); delivery sales made from an order use the delivered date chosen in the deliver step. Feature 04 stored a sale date and a separate delivered date; the architect may keep both columns, but the owner sees one date. Alternative: keep both visible.
11. **Cancelled orders and a mistaken order.** Default: no delete (AC23); a mistake is cancelled and re-entered, and the number stays used. Alternative: allow deleting a Requested order with no deliveries.
12. **Open view sort (AC3).** Default: wanted-by soonest first, then oldest order. Alternative: newest first like Sales.
13. **Invoice feature number.** Default: invoice/print becomes feature 07 (see the numbering note above).

**Owner decisions already made (2026-10-03), reflected above:** orders are their own tables (header + lines), before the sale; statuses Requested, Confirmed, Ready, Partially fulfilled, Fulfilled, plus Cancelled; fulfilment copies into a normal sale that references the order; an order can be delivered in several deliveries, each a sale; delivered-so-far is computed; a Partially fulfilled order can be closed short; cancel only before the first delivery; over-delivery is refused; direct sales without an order remain possible; pending sales are removed and existing pending sales are converted into orders by migration; sales become void-only (no delete).

**Follow-ups (not in 05):** Dashboard "Pending deliveries" (open orders); Inventory "For delivery" per size; optional "short on stock" hint when marking Ready; invoice print view (renumbered); per-client totals and last delivery date; searching by order number; reopening orders; payment tracking (non-goal).

---

## 2.5 UX design (UX Designer)

**What this is based on.** The shell, sheets, dialogs, chips, cards, row menus, toasts, the trays + loose input and the price rules are **feature 04's** (`docs/features/04-sales.md` §2.5, R1 to R8) and are reused, not redrawn. The Figma frames (file `hFVMtay6JU3kSAu4xsUGMt`, page "Orders") were **not readable by the UX designer in this run** (no Figma tool was available), so this section works from the owner's written description of the frames. Where it says "Figma", it means that description. **The frontend dev must open the frames and reconcile**: where a frame and this section differ on pixels, spacing, colour or icon, follow the frame; where they differ on behaviour, follow the ACs and the list "Figma vs ACs" below. Things the frames do not draw are marked **[proposed]**. Nuxt UI names are approximate (v4); the frontend dev confirms the APIs. Visual language: DM Sans, green primary, slate neutrals, `bg-muted` main area, `bg-default` cards with a ring and `rounded-2xl`, 44px controls on phones and tablets (40px at lg).

### Shared rules (this feature)

**O-R1. Saving and double-taps.** Same as feature 04 R1. Forms: Save shows a spinner, is disabled, fields are read-only, and Cancel, the close button, the overlay and Esc do nothing while it runs. Many taps send one request (AC16, AC31). A failure keeps every typed value. Row actions (status change, Cancel, Close short): the card's ⋮ becomes a spinner and is disabled; the badge changes only after the server answers. The detail's status control shows a spinner on the tapped option and disables the others until the answer. The Deliver step's button shows a spinner, the step is read-only, and closing is disabled.

**O-R2. Where messages go.** Field problem: under the field, with an icon, inside the line's card for a line. Failed form save: an error `UAlert` above the footer (`role="alert"`), form stays open. Failed Deliver: an `UAlert` inside the step (the step stays open, values kept) plus nothing else, so there is one place to look. Failed row action, stale change or failed background refresh: an **error toast that stays until dismissed**, 44px close button, **Try again** where it helps. A failed Cancel or Close short: an alert inside that dialog. Success: toast.

**O-R3. Checks.** As 04 R3: a field is checked on blur and on Save; once a message has shown it re-checks on every keystroke; Save is enabled before the first message and blocked while one shows (`aria-disabled`); the first field with a message gets focus; no `maxlength`; "6.5" becomes "6.50" on leaving the field.

**O-R4. Quantity and price display.** Quantities always through `formatQty` (`8 trays + 1`, `4 trays`, `1 tray`, `5 eggs`); prices always through `formatPrice` (` / tray` where a per-tray price is meant). No currency symbol typed into a screen. **Progress text** is `{delivered} of {ordered} trays` when both are whole trays (`20 of 30 trays`, `0 of 10 trays`, `1 of 3 trays`), and otherwise each side in full `formatQty` (`8 trays + 1 of 12 trays`, `0 of 5 eggs`). The word "eggs" appears only for an amount under a tray and in "Loose eggs".

**O-R5. Status is always a word.** A text badge on every card, row and detail: **Requested**, **Confirmed**, **Ready**, **Partially fulfilled**, **Fulfilled**, **Fulfilled (closed short)**, **Cancelled**, plus **Voided** on a delivery. Suggested badge colours (the frame's colours win; the text does the work): Requested `neutral` subtle, Confirmed `info` subtle, Ready `primary` subtle, Partially fulfilled `warning` soft, Fulfilled `success` subtle, Cancelled `neutral` outline. A long badge (`Fulfilled (closed short)`) is allowed to wrap to its own row; it is never cut. Fulfilled and Cancelled cards are **not dimmed**.

**O-R6. Progress bars.** One small bar per line under or beside the line's name, a `UProgress`-like element: track `bg-accented`, fill `primary`, 8px tall, rounded. The bar is **decorative (`aria-hidden`)**: the text next to it (`20 of 30 trays`) carries the meaning, so progress never depends on colour or bar length. Full bar = fully delivered (the text says so too). Never an over-full bar (over-delivery is refused).

**O-R7. Toasts.** The design's toast, bottom-centre, 2.6s; on phones lifted above the "+" button as on Sales (`bottom: calc(64px + env(safe-area-inset-bottom) + 84px)`). Error toasts stay until dismissed.

**O-R8. Names never truncate on phones.** A long client name wraps and the card grows. A size name wraps. Nothing scrolls sideways at any width (AC47).

### Flow

**Getting there (AC1).** Phone: bottom bar is **Home, Production, Orders, Sales, More**. Tap **Orders**: **1 tap**. Desktop and tablet: the sidebar lists all six (Dashboard, Production, Orders, Sales, Inventory, Clients): 1 click. Title "Orders", subtitle "What customers are waiting for" **[proposed, not in the frames]**. Desktop top bar: **Add order** button. Phone: round **+** (52px, `aria-label` "Add order") above the tab bar, bottom-right, never over a tab; shown **only** on Orders. Both hide while any sheet or dialog is open.

**Inventory and Clients on a phone (AC1, Q2): 2 taps** (More, then the item). Down from 1 tap. The owner accepted this. See "More tab" below.

**A. Take an order with two sizes (the main path, AC17)**
`Orders -> + -> New order -> Client -> Size -> trays -> Add size -> Size -> trays -> Save -> toast "Order #12 saved" -> card at its place, highlighted`
1. Tap **+**. The sheet opens with **one empty line**, **Order date = today**, **Wanted by** empty. No keypad opens on phones. On desktop focus goes to Client.
2. Tap **Client**, type a few letters, tap the client. The client's usual price fills every line's empty price, and any line added later (AC13).
3. On line 1 tap the size chip (1 tap). Focus moves to that line's Trays if the browser allows. Type trays.
4. **Add size**. A new line appears, its chips focused. Choose size, type trays.
5. **Save** (pinned). The footer already shows the Order total to check against the notebook.
- **Phone: 9 taps + typing** (+ 1, Client 2, choose 3, size 4, trays 5, Add size 6, size 7, trays 8, Save 9). Add 1 per line with loose eggs, 1 per price the client has no usual price for, 2 to 3 for Wanted by (field, pick, done). **Estimate 35 to 45 seconds**, inside AC17's 60. **Desktop: 7 clicks.**
- After Save: sheet closes, focus returns to the **+**, toast, the new card is scrolled into view and highlighted for 1.5s. If the current filters would hide it, they reset to Open first (AC16).

**B. Deliver everything that is left (the daily action, AC24, AC27)**
`Orders -> Deliver (on the card) -> Deliver order #12 (all lines pre-filled with what is left, date today, button focused) -> Deliver -> toast "Delivered: sale #52. Order #12 is now fulfilled."`
- **2 taps** from the list. From the menu: ⋮, Deliver, confirm = 3. From the detail: open, Deliver, confirm = 3.
- **Partial:** lower a line's quantity (tap its Trays and type, or a stepper): +1 tap per line changed. Set a line to 0 to leave it out. Another date: +1 tap and the pick.
- **Stock short:** the same step shows the amber panel and the button reads **Deliver anyway**. Still 2 taps; no second dialog (AC30).
- **Nothing to deliver:** all quantities 0 -> message "Enter a quantity for at least one size." and the button is blocked while it shows.
- After success: the step closes, the card updates in place (progress, badge), focus returns to the card's **Deliver** button if it is still shown (Partially fulfilled), otherwise to its ⋮, otherwise to the next card's name button, otherwise to the **Open** chip.

**C. Change status before the first delivery (AC21)** **[proposed, not drawn in the frames]**
- **From the list: 2 taps.** ⋮, then one of the two other statuses (`Mark confirmed`, `Mark ready`, `Back to requested`, `Back to confirmed`; only the two that apply to the current status are listed). No confirmation. The card's badge updates in place.
- **From the detail: 1 tap** on the **Status** control, a three-option choice **Requested | Confirmed | Ready** with the current one selected. Forward or back, any option, no confirmation. (Opening the detail first makes it 2 from the list, the same as the menu.)
- The control is shown only for Requested, Confirmed and Ready. Partially fulfilled, Fulfilled and Cancelled have none (AC21).
- Status moves never change stock, number or lines and never ask about stock (AC10).

**D. Edit an order (AC19, AC20)**
`⋮ -> Edit (or open the order -> Edit) -> Edit order #12 (pre-filled) -> change -> Save -> toast "Updated order #12"`
- **2 taps to open**, then the field, then Save. A price fix: ⋮ (1), Edit (2), Price (3), Save (4), plus typing.
- Same form as New order, with the number in the title (unchangeable). Pre-filled values as plain digits, focus selects content so typing replaces it. No keypad opens on phones.
- **Nothing delivered yet** (Requested, Confirmed, Ready): everything editable; at least one line stays (the last line's remove button is hidden).
- **Partially fulfilled** (see the Edit wireframe): client locked, each line with deliveries has its size locked, can't be removed, and shows **At least {n} delivered** as its minimum; lines without deliveries are fully editable and removable; new lines can be added; order date and wanted-by editable.
- **Saving with nothing changed** closes the form: no request, no toast.
- **An edit that leaves nothing owed** (every line's ordered now equals its delivered): a live note appears in the form before Save ("Everything ordered has been delivered, so this order will be marked Fulfilled."), and after Save the toast says so.
- **Stale (AC20):** the form closes, the list and detail refresh, a persistent toast says "This order was changed somewhere else. The list is up to date now." Typed edits are dropped (as feature 04 X6).
- **Inactive client / archived size** on an existing order stay selected and valid (`{Name} · Inactive`, size chip with a second line **Archived**).
- Fulfilled and Cancelled orders have no Edit.

**E. Cancel an order (AC22)**
`⋮ -> Cancel order (or the detail's Cancel order) -> centred confirm -> Cancel order -> toast`
- **3 taps** from the list. Only Requested, Confirmed and Ready, and only if the order has had **no delivery at all, even a voided one** (the button isn't offered otherwise). Focus starts on **Keep order** (the safe choice). On success the order leaves Open; the toast says so; if opened from the detail, the detail stays open and updates to the read-only Cancelled view.

**F. Close short (AC34)**
`Partially fulfilled -> Close short (action bar, or ⋮) -> centred confirm listing what is dropped -> Close short -> toast`
- **3 taps** from the list, **2** from an open detail. Offered only while Partially fulfilled. Focus starts on **Keep open**. Afterwards the order is **Fulfilled (closed short)**, with the dropped amounts shown in the detail.

**G. Open an order (AC7)**
`Orders -> tap the card or row -> Order #12 detail`
- **1 tap.** An overlay on the list (bottom sheet on phones, 480px right slide-over on desktop), so filters and scroll stay; nothing is added to the address bar. Closing returns focus to the card or row.

**H. A delivery and the sale it made (AC7, AC35, AC36, AC39)**
- **Order -> its delivery:** tap a delivery row in the order detail. The **sale's detail opens stacked on top** of the order detail (same `SaleDetail` content). Closing it returns to the order. **[proposed]** The Sales page does not need to be visited.
- **Sale -> its order:** the green **From order #12** link on a Sales card or the sale's detail opens that **order's detail stacked on top**. If the sale was itself opened from that order, the link just closes the sale detail (no loop). Depth is never more than two overlays.
- **Void a linked delivery (AC35):** on the Sales screen, ⋮ -> Void sale, or the detail's Void sale. The dialog has the usual stock lines plus a line "Order #12 will show 10 trays of Large still owed." and, when the order's status will change, "It will go back to Ready." The order's delivery list then shows the delivery with **Voided**. If the order was closed short, the dialog says "Order #12 was closed short and stays closed." Toast: `Sale #52 voided. Order #12 shows 10 trays of Large still owed.`
- **Edit a linked sale (AC36):** its client and lines are read-only with a note; its date and nothing else can change.

**I. Find orders (AC3 to AC6)**
- **Status chips**, always on screen on phones: **Open** (default), **All**, **Fulfilled**, **Cancelled**. **Open** shows every open order with no "Show more" and no cap (AC5). Order: wanted-by soonest first, then no wanted-by, oldest order first (AC3). Other views: newest order date, then highest number, pages of 25 with **Show more** (AC49). "Fulfilled" includes closed-short orders.
- **Phones:** the chips plus one **Filters** button for **Client** and **Order date From - To**, showing `Filters (2)` when set. **Desktop and tablet:** all on screen at once: date range and **Clear**, chips, Client picker. (Same arrangement as 04 flow J and O2.)
- **Client filter:** searchable, "All clients" by default, every client active and inactive A to Z with `· Inactive`, in memory only (AC53). The date range includes both end dates; From after To shows "End date must be on or after the start date".
- `Showing 3 of 18 orders · Clear filters` appears while anything other than plain **Open** is on. Changing a filter refreshes the list in place (small spinner by the count line, no skeleton).

**J. First use (AC6)**
`Orders (no orders) -> "No orders yet" card -> Add order -> the New order form`

**K. New client from the order form (AC11)**
As 04 flow L: the picker's first row **+ New client** (or `Add "{text}" as a new client`) opens the Add client sheet on top; on Save the order form is back with that client chosen, every typed value kept, empty prices filled from the new client's usual price.

**L. Discard (AC16)**
Cancel, close, overlay and Esc do the same thing. New: nothing entered (no client, size, quantity or price) closes at once; otherwise "Discard this entry?" with **Keep editing** (focused) and **Discard**. Edit: nothing differs closes at once; otherwise the same dialog with the Edit body. The Deliver step has no discard check: it holds only pre-filled values, so Cancel closes it and changes nothing (AC24).

**M. More tab (AC1, Q2)**
- **Highlight rule:** the **More** tab shows the active state (tinted pill, primary label, bold) whenever the current screen is **Inventory or Clients** (any path under them) **and** while the More sheet is open. It is never highlighted together with another tab. Home, Production, Orders and Sales are highlighted only on their own screens. The screen's title in the top bar says which of Inventory or Clients is open, so the highlight on More is enough.
- **Semantics:** More is a `<button>` (not a link): `aria-haspopup="dialog"`, `aria-expanded`, and **no `aria-current`**. When the current screen is Inventory or Clients its accessible name adds the place: `More, current: Clients`. The sheet's current row has `aria-current="page"` and a check icon plus the text "Current".
- **The sheet:** a bottom sheet (same `sheetUi` look), title "More", two 56px rows (icon, label, chevron): **Inventory**, **Clients**. Tapping a row closes the sheet and navigates; focus moves to the new screen's heading. Tap the overlay, Esc, or the close button to dismiss; focus returns to More. No other items in v1 (Settings stays in the account menu).
- The Orders "+" does not show on Inventory or Clients; Clients keeps its own Add client button as before.
- Desktop and tablet (768px and up) keep the sidebar with all six; More does not exist there.

### Layouts

Legend: `[x]` button, `(x)` chip or badge, `[⋮]` menu button, `▓░` progress (decorative), lucide icon names in brackets. Numbers are only for the format: Large 30 trays at ₱6.75 (20 delivered), Medium 10 trays at ₱6.00 (0 delivered). Line totals ₱202.50 + ₱60.00, order total ₱262.50.

#### Orders list, mobile (~375px), Open view
Main area `bg-muted`, p-4; bottom padding clears the tab bar and the "+": `calc(64px + env(safe-area-inset-bottom) + 84px)`.
```
┌───────────────────────────────────────────┐
│ Orders                              (HF)  │ top bar (shell); no Add button on phones
│ What customers are waiting for            │
├───────────────────────────────────────────┤
│ (●Open●) ( All ) ( Fulfilled ) ( Cancelled)│ chips: 44px, aria-pressed, selected = solid + bold
│ [ Filters ▾ ]                             │ outline 44px; "Filters (2)" when set
│ ┌───────────────────────────────────────┐ │ card: bg-default, ring, rounded-2xl, p-4. The card is one
│ │ #12 · Oct 3     (Partially fulfilled) [⋮]│ │ tap target (opens detail); Deliver and ⋮ sit above (z-10)
│ │ Maple Street Market                   │ │ client 600, wraps
│ │ Wanted by Fri, Oct 9                  │ │ only when set; text-sm muted
│ │ Large   ▓▓▓▓▓▓▓░░░  20 of 30 trays    │ │ one row per line, up to 3, then "+ 2 more sizes"
│ │ Medium  ░░░░░░░░░░  0 of 10 trays     │ │ size 500 · bar (aria-hidden) · progress text
│ │ ₱262.50 · 2 sizes                     │ │ total 600 text-lg · line count always exact
│ │ [        Deliver        ]             │ │ full-width, primary, 44px+. Only for open orders
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ #14 · Oct 3                (Requested)[⋮]│ │
│ │ Linda Ferris                          │ │
│ │ Jumbo   ░░░░░░░░░░  0 of 4 trays      │ │
│ │ ₱120.00 · 1 size                      │ │
│ │ [        Deliver        ]             │ │
│ └───────────────────────────────────────┘ │
│                                     (＋)  │ FAB 52px, aria-label "Add order"
├───────────────────────────────────────────┤
│ Home Production [Orders] Sales  More      │ 5 tabs, 64px
└───────────────────────────────────────────┘
```
- **Fulfilled / Cancelled cards:** no Deliver button and no ⋮ (nothing to do). Fulfilled shows all bars full and `30 of 30 trays`; closed short shows the real figures (`20 of 30 trays`) and the line `Closed short` under the client; Cancelled shows `0 of 30 trays` and a muted line `Cancelled before anything was delivered`. Both stay tappable (open the detail).
- **Width check:** card inner width about 311px. Row `Large ▓▓▓ 20 of 30 trays`: size name 56px + bar flexible (min 72px) + text about 110px. Long text such as `8 trays + 1 of 12 trays` (about 150px) wraps the **text under the bar** so the bar keeps its width. Badge `Partially fulfilled` about 120px next to `#12 · Oct 3` fits; `Fulfilled (closed short)` (about 150px) wraps to its own row under the client. The ⋮ is 44x44.
- **Card tap area:** a real `<button>` with `after:absolute after:inset-0`, accessible name `Open order #12, Maple Street Market, Partially fulfilled`. ⋮ name `Actions for order #12`. Deliver name `Deliver order #12`.
- **Card height:** about 220px for two lines. About two and a half cards show on a 667px phone. The Deliver button is deliberately the card's only loud element.

#### Filters panel, mobile
```
│ (●Open●) ( All ) ( Fulfilled ) ( Cancelled)│
│ [ Filters (1) ▴ ]                         │
│ ┌───────────────────────────────────────┐ │
│ │ Client                                 │ │ visible label
│ │ [ All clients                       ▾ ]│ │ searchable select, 44px
│ │ Order date                             │ │
│ │ [ From mm/dd/yyyy ] – [ To mm/dd/yyyy ]│ │ hidden labels From, To
│ │ [ Clear dates ]                        │ │ only when a date is set
│ └───────────────────────────────────────┘ │
│ Showing 3 of 18 orders · Clear filters    │
```

#### Orders list, desktop (>=1024px) and tablet (768-1023px)
Table when the list area is about 720px or wider, otherwise phone cards (as Sales). Content centred, max 1120px.
```
┌──────────────┬──────────────────────────────────────────────────────────────────────────────┐
│ [logo] Tamago│ «  Orders                                                    [ + Add order ] │
│              │    What customers are waiting for                                            │
├──────────────┼──────────────────────────────────────────────────────────────────────────────┤
│  Dashboard   │ [ 10/01/2026 ] – [ 10/03/2026 ] [Clear]                                      │
│  Production  │ (●Open●)(All)(Fulfilled)(Cancelled)                      [ All clients ▾ ]   │
│ ▌Orders      │ Showing 3 of 18 orders · Clear filters                                       │
│  Sales       │ ┌──────────────────────────────────────────────────────────────────────────┐ │
│  Inventory   │ │ Order    Client          Progress                   Total     Status      │ │
│  Clients     │ ├──────────────────────────────────────────────────────────────────────────┤ │
│              │ │ #12      Maple Street    Large  ▓▓▓▓▓░░ 20 of 30 trays  ₱262.50 (Partially│ │
│              │ │ Oct 3    Market          Medium ░░░░░░░ 0 of 10 trays           fulfilled)│ │
│              │ │          Wanted by Oct 9                                         [Deliver] [⋮]│ │
│              │ ├──────────────────────────────────────────────────────────────────────────┤ │
│              │ │ #14      Linda Ferris    Jumbo  ░░░░░░░ 0 of 4 trays    ₱120.00 (Requested)│ │
│              │ │ Oct 3                                                            [Deliver] [⋮]│ │
│              │ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────┴──────────────────────────────────────────────────────────────────────────────┘
```
- Columns: **Order** (number 600 over date), **Client** (name 600 wraps; `Wanted by Oct 9` under it), **Progress** (up to 3 lines then `+ 2 more sizes`; bar 96px), **Total** (right-aligned, 600), **Status** (badge, then **Deliver**), and a 48px actions column with ⋮. Visually hidden `<caption>` "Orders". Row click opens the detail; the order number is a real button (`Open order #12`). Deliver and ⋮ don't trigger the row click. At lg, Deliver is a `md` button and ⋮ 40px; on tablet 44px.
- Fulfilled / Cancelled rows: badge only, no Deliver, no ⋮.

#### Row menu (⋮), mobile and desktop
`UDropdownMenu`, down, right-aligned, items 44px on phones and tablets (36px at lg). Esc returns focus to ⋮.
```
 Requested                 Confirmed                 Ready                     Partially fulfilled
┌───────────────────┐    ┌───────────────────┐    ┌────────────────────┐    ┌───────────────────┐
│ [truck] Deliver   │    │ [truck] Deliver   │    │ [truck] Deliver    │    │ [truck] Deliver   │
│ [pencil] Edit     │    │ [pencil] Edit     │    │ [pencil] Edit      │    │ [pencil] Edit     │
│ Mark confirmed    │    │ Mark ready        │    │ Back to confirmed  │    │ ───────────────── │
│ Mark ready        │    │ Back to requested │    │ Back to requested  │    │ [ban] Close short │
│ ───────────────── │    │ ───────────────── │    │ ────────────────── │    └───────────────────┘
│ [ban] Cancel order│    │ [ban] Cancel order│    │ [ban] Cancel order │     Fulfilled, Cancelled:
└───────────────────┘    └───────────────────┘    └────────────────────┘     no ⋮ at all
```
- **Cancel order** and **Close short** are red with a separator above (one-way). Status items sit between Edit and the separator (they are two taps total, the owner's AC21 bar). An order that has any delivery, even a voided one, never shows **Cancel order** (AC22).

#### Order detail, mobile bottom sheet / desktop 480px slide-over (AC7)
Read-only; up to `88dvh` on phones; ✕ 44px. Partially fulfilled shown. Footer pinned.
```
┌───────────────────────────────────────────┐
│ Order #12                            [✕]  │ text-lg 700
├───────────────────────────────────────────┤
│ (Partially fulfilled)                     │ badge (O-R5)
│ Formerly sale #1038                       │ only on a converted order; text-sm muted (AC45)
│                                           │
│ Client        Maple Street Market         │ <dl>. Inactive client: "… · Inactive"
│ Order date    Oct 3, 2026                 │
│ Wanted by     Fri, Oct 9, 2026            │ row only when set
│ ───────────────────────────────────────── │
│ Status  (Requested)(Confirmed)(● Ready ●) │ only Requested/Confirmed/Ready; 3 options, 44px,
│                                           │ radio group "Status", selected = check + bold
│ ───────────────────────────────────────── │
│ Large                             ₱202.50 │ per line: size 600 + line total 600
│ ▓▓▓▓▓▓▓░░░  20 of 30 trays                │ bar (aria-hidden) + progress text
│ Ordered       Delivered      Left         │ 3-column <dl>, labels text-sm muted
│ 30 trays      20 trays       10 trays     │ values formatQty; wraps at large text
│ At ₱6.75 / tray                           │
│ Medium                             ₱60.00 │
│ ░░░░░░░░░░  0 of 10 trays                 │
│ Ordered       Delivered      Left         │
│ 10 trays      0 trays        10 trays     │
│ At ₱6.00 / tray                           │
│ ───────────────────────────────────────── │
│ Order total                       ₱262.50 │ text-lg 700
│ ───────────────────────────────────────── │
│ Deliveries                                │ section heading; "No deliveries yet." when none
│ ┌───────────────────────────────────────┐ │ each row a 56px+ button -> opens that sale (flow H)
│ │ Sale #52 · Oct 3                   >  │ │
│ │ Large 20 trays                        │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Sale #49 · Sep 28      (Voided)    >  │ │ voided: kept, marked, "Not counted" in text-sm
│ │ Large 10 trays · Not counted          │ │
│ └───────────────────────────────────────┘ │
├───────────────────────────────────────────┤
│ [ Close short ] [ Edit ] [   Deliver   ]  │ footer, 44px; see below for each status
└───────────────────────────────────────────┘
```
- **Footer by status (AC8).** Requested / Confirmed / Ready: `[ Cancel order ] [ Edit ] [ Deliver ]` (Cancel order: outline, red text; Edit: outline; Deliver: primary, flex-1). Partially fulfilled: `[ Close short ] [ Edit ] [ Deliver ]`, as the frame draws. Fulfilled and Cancelled: **no footer**, a muted note above the lines instead. With large text or a narrow phone the footer wraps to two rows with **Deliver on top, full width**.
- **Fulfilled (delivered in full):** badge only; note "Everything ordered was delivered."
- **Fulfilled (closed short):** badge `Fulfilled (closed short)`; note "Closed short on Oct 8. Not delivered: Medium 10 trays." (one line per size when several). The "Left" column of each line then reads `Dropped`.
- **Cancelled:** badge, note "Cancelled on Oct 4. It never left the farm." No Deliveries heading when there are none.
- **Six lines** read as six blocks, no horizontal scrolling at 375px (AC7). **Twenty lines** scroll; header and footer stay pinned (AC47).
- An **Archived** size reads `Large · Archived`.
- After a status change, Edit or delivery, the detail stays open and updates in place. After Cancel or Close short it stays open and becomes the read-only version.
- Desktop: the same content in the 480px slide-over. Esc closes. Focus returns to the row's number button.

#### New order, mobile bottom sheet (~375px)
Same sheet as Log a sale (`sheetUi`, header and footer fixed, body scrolls, lifted above the keypad). Differences from Log a sale: no Delivery / On-site toggle, no stock hints, no "Already delivered", an Order date and a Wanted by.
```
┌───────────────────────────────────────────┐
│ New order                            [✕]  │
├───────────────────────────────────────────┤
│ Client                                    │
│ [ Maple Street Market                 ▾ ] │ searchable, 44px (placeholder "Search or add a client…")
│ ┌───────────────────────────────────────┐ │ line card, as Log a sale
│ │ Size                             [🗑]  │ │ remove only with 2+ lines
│ │ ┌─────────────┐ ┌─────────────┐       │ │ size chips, 2-column grid, radio group
│ │ │ ○ Small     │ │ ○ Medium    │       │ │
│ │ │ ✓ Large     │ │ ○ Jumbo     │       │ │
│ │ └─────────────┘ └─────────────┘       │ │
│ │         Trays            Loose        │ │
│ │ [−][ 30 ][+]        [−][  0 ][+]      │ │ QuantityInput
│ │ Price per tray             Usual price│ │
│ │ [ ₱ │ 6.75        ]     Line total    │ │
│ │                            ₱202.50     │ │
│ └───────────────────────────────────────┘ │
│ [ + Add size ]                            │
│ Order date                                │
│ [ 10/03/2026                          📅 ]│ max = today
│ Today                                     │
│ Wanted by (optional)                      │
│ [ mm/dd/yyyy                          📅 ]│ min = order date; no max
│ [ Clear wanted-by date ]  (only when set) │
├───────────────────────────────────────────┤
│ Order total                       ₱262.50 │ aria-live polite
│ [ Cancel ]   [          Save          ]   │
└───────────────────────────────────────────┘
```
- A size used on another line stays in the group, dashed and dimmed with the second line **In this order**, `aria-disabled`. More than 6 active sizes: a select with `{Size} (in this order)` disabled options (as 04 O1/O3).
- Footer total wording: `Order total ₱262.50`, `Order total so far ₱202.50` while a line is unfinished, `Order total —` when none is complete (04 X4). With the keypad open the footer condenses to one row (total left, Save right).
- Field order for Next: Client -> line 1 trays -> loose -> price -> line 2 ... -> Order date -> Wanted by. Enter on the last field saves. Price keypad: decimal; on the last line's price `enterkeyhint="go"`.
- **Departure:** the frames may place the dates above the lines. Keeping the dates **after** the lines (as 04 O5) keeps client, sizes and prices on the first screen; if the frame puts them first, follow the frame for placement and keep every other rule here.
- **Desktop:** `UModal`, centred, max 640px (04 S1), `max-height: 85vh`. Size chips in one row, quantity and price inline per line, `Order date` and `Wanted by` side by side in one row, footer `Order total ₱262.50` left, `[ Cancel ] [ Save ]` right.

#### Edit order, Partially fulfilled (mobile; derived from New order)
Not drawn in the frames. Title `Edit order #12`.
```
┌───────────────────────────────────────────┐
│ Edit order #12                       [✕]  │
├───────────────────────────────────────────┤
│ Client                                    │
│ [ Maple Street Market              [lock] ]│ read-only field, 44px, bg-muted; helper below
│ Can't change after a delivery.            │ text-sm muted
│ ┌───────────────────────────────────────┐ │ line WITH deliveries
│ │ Size                                   │ │ no remove button
│ │ ┌─────────────┐                        │ │ only the line's own size, shown selected + lock icon,
│ │ │ ✓ Large  [lock]                      │ │ other sizes not offered; read-only
│ │ └─────────────┘                        │ │
│ │         Trays            Loose        │ │
│ │ [−][ 30 ][+]        [−][  0 ][+]      │ │ the minus stepper stops at the minimum
│ │ At least 20 trays delivered           │ │ the minimum, text-sm, always visible (AC19)
│ │ Price per tray                         │ │
│ │ [ ₱ │ 6.75        ]     Line total    │ │ line total = new ordered quantity x price
│ │ Price changes only affect future       │ │ text-sm muted
│ │ deliveries.                            │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │ line WITHOUT deliveries: normal, with remove [🗑]
│ │ Size  (Small)(✓ Medium)(Large: in this order)(Jumbo)│ │
│ │ …                                      │ │
│ └───────────────────────────────────────┘ │
│ [ + Add size ]                            │
│ Order date / Wanted by (editable)         │
│ ┌ (i) Everything ordered has been delivered, so this order will be marked Fulfilled. ┐ │ only when it applies
├───────────────────────────────────────────┤
│ Order total                       ₱262.50 │
│ [ Cancel ]   [          Save          ]   │
└───────────────────────────────────────────┘
```
- **Nothing delivered yet:** the client is a normal picker (active clients, plus the order's own inactive client shown `{Name} · Inactive`), every line is fully editable, no minimums and no lock icons. The last remaining line has no remove button.
- Quantity below the minimum: message under the Quantity, `Can't go below what was delivered: {formatQty(delivered)}.` Blocks Save.
- A line's size or removal is simply unavailable when it has deliveries; there is no "why not" popup: the lock icon and the minimum line explain it. Screen readers hear "Large, locked, 20 trays already delivered".

#### Deliver step (AC24 to AC31)
`UModal` styled as a bottom sheet on phones (up to `88dvh`, body scrolls), a centred 480px dialog at md and up. The default case needs no scrolling for 1 to 3 lines.
```
┌───────────────────────────────────────────┐
│ Deliver order #12                    [✕]  │
├───────────────────────────────────────────┤
│ #12 · Maple Street Market                 │ names the order (AC24)
│ Delivered date                            │
│ [ 10/03/2026                          📅 ]│ min = order date, max = today
│ Today · ordered Oct 3                     │
│ ───────────────────────────────────────── │
│ Large                  10 trays left      │ one block per line with eggs remaining; lines with
│         Trays            Loose            │ nothing left aren't listed. "Deliver now" is the
│ [−][ 10 ][+]        [−][  0 ][+]          │ column header group, accessible name "Large deliver now trays"
│ At ₱6.75 / tray                  ₱67.50   │ price and this delivery's line total
│ Medium                 10 trays left      │
│ [−][ 10 ][+]        [−][  0 ][+]          │
│ At ₱6.00 / tray                  ₱60.00   │
│ ┌ (!) Not enough on hand:               ┐ │ amber UAlert (warning, soft, icon, dark text),
│ │ Medium: 3 trays on hand, you're       │ │ only short sizes, live as quantities change
│ │ delivering 10 trays                   │ │
│ │ You can still deliver it.             │ │
│ └───────────────────────────────────────┘ │
├───────────────────────────────────────────┤
│ This delivery                     ₱127.50 │
│ [ Cancel ]  [   Deliver / Deliver anyway ]│
└───────────────────────────────────────────┘
```
- **Pre-filled** with each line's remaining. The date is today and the **Deliver button is focused** so Enter confirms. A section label above the lines reads **Deliver now**.
- **Lowering:** the stepper's plus stops at the remaining; typing above shows `Only 10 trays left to deliver.` under that line and blocks the button (AC26). Setting a line to 0 dims its price line and drops it from the total ("Not in this delivery" text replaces its price line, so it isn't colour alone).
- **Stock short (AC30):** the amber panel appears inside the step; it names **only** short sizes, uses on-hand figures already on the screen refreshed on open (a quick `Checking stock…` while loading), and the server has the last word. The button text becomes **Deliver anyway**. Going back keeps what was typed. If stock can't be loaded: `Couldn't check stock.` and the button is unaffected.
- **A delivery that includes an archived size or an inactive client** works; the line shows `Large · Archived`, and the client line `{Name} · Inactive` (AC33).
- **Twenty lines:** the body scrolls, header and footer stay pinned. Every line is 120px so it stays about 2,400px; the "This delivery" total keeps the owner oriented.
- **Confirming:** spinner on the button, all read-only, closing disabled (O-R1). **Failure:** the step stays open with an alert above the footer "Couldn't deliver. Check your connection and try again." and a persistent error toast with **Try again** is not shown (one place to look); retrying sends the same request (AC31). **Another phone delivered meanwhile:** the lines refresh to the current remaining, each over-amount line shows `Only 4 trays left to deliver.`, and an alert says "Part of this order was delivered somewhere else. Check the amounts left." No scary error.

#### Close short confirm (AC34), centred, max 400px
```
┌─────────────────────────────────────┐
│ Close order #12 short?              │
│ Maple Street Market                 │
│ Closing short drops 10 trays of     │ one size: this exact sentence
│ Medium. Deliveries already made     │
│ stay.                               │
│ Your stock doesn't change. You      │
│ can't undo this.                    │
│ ┌(!) Couldn't close the order. …   ┐│ only after a failure
│ [ Close short ]                     │ phones: stacked, primary on top; desktop side by side
│ [  Keep open  ]                     │ focused
└─────────────────────────────────────┘
```
- Several sizes: the second sentence becomes a list: `Closing short drops:` then `Medium: 10 trays`, `Jumbo: 2 trays + 5`, one per line in the farm's size order, then `Deliveries already made stay.`
- **Close short**: `color="error"` solid with `i-lucide-ban`, spinner while working.

#### Cancel confirm (AC22), centred, max 400px
```
┌─────────────────────────────────────┐
│ Cancel order #12?                   │
│ Maple Street Market · 2 sizes ·     │
│ ₱262.50                             │
│ It hasn't left the farm, so your    │
│ stock doesn't change.               │
│ You can't undo this. The number     │
│ #12 stays used.                     │
│ [ Cancel order ]                    │ error solid, [ban]
│ [  Keep order  ]                    │ focused
└─────────────────────────────────────┘
```

#### Sales screen after this feature (AC37 to AC42); deltas from feature 04 only
```
│ (ghost) Sales > list card                  │
│ ┌───────────────────────────────────────┐ │
│ │ #52 · Oct 3                        [⋮]│ │ no status badge
│ │ Maple Street Market                   │ │
│ │ Large · 20 trays                      │ │
│ │ ₱135.00 · 1 size                      │ │
│ │ (Delivery) [ From order #12 ]         │ │ link pill: primary text + [link] icon, min 44px tall,
│ └───────────────────────────────────────┘ │ sits above the card tap area; opens the order (flow H)
```
- **Removed:** the Status chips (the Type chips, date range, Client filter and Show voided switch stay), the Pending / Complete badges, **Mark delivered**, **Mark as pending**, **Delete**, the "Delivered {date}" text, the Delete confirm and the Mark delivered step. Sales cards and the Sales empty/no-match states lose every word about "pending". The "No match" second line "You don't have any pending deliveries." goes.
- **Row menu:** **Edit** and **Void** (Void red, with a separator) on every non-voided sale; a voided sale has no menu (as 04).
- **Detail:** badges are Type, **From order #12** (a link pill), and **Voided** when it applies. Rows **Client**, **Sale date**, lines, **Sale total**. Footer: **Edit** only (full width), **Void sale** in the body. The note "Your stock hasn't changed yet." is gone.
- **Log a sale form:** the Delivery / On-site toggle, client rules, lines and price pre-fill stay; **Already delivered** and **Delivered date** go. Label and hint of the one date: **Sale date**, hint `Today` (or the weekday). Footer, lines and the shortfall dialog stay; the dialog now appears for **every** new direct sale that takes stock below 0, with the verb `selling` (On-site) or `delivering` (Delivery). Save button and sheet are otherwise as 04.
- **Edit a sale that came from an order (AC36):** at the top, a note `[lock] Part of order #12`. The Type toggle, Client and every line (size chips, quantity, price) are shown **read-only** (`bg-muted`, lock icons, not tabbable except as read-only text), and the note under the lines says **Void this delivery and deliver again to change eggs.** Only **Sale date** is editable. Min date = the order date, max = today. Save with nothing changed closes it.
- **Void dialog on a linked delivery:** see flow H and Copy.

### States

| Area | State | What the owner sees |
|---|---|---|
| Screen | **Loading** | Title and subtitle. The chips shown but disabled. In place of the list: 4 skeleton cards (phone) or 5 skeleton rows under the real table header. Never the empty state while loading. The "+" and Add order stay and work. |
| | **Default (Open)** | Chips with Open selected; every open order, wanted-by soonest first, then oldest order first (AC3). No "Showing" line, no Show more. |
| | **Refreshing** | The list stays, a small spinner by the count line; a failed quiet refresh gives a persistent toast `Couldn't refresh your orders.` + **Try again**. |
| | **Load failure** | `AppPlaceholder`: `i-lucide-cloud-off`, heading, body, **Try again** (primary, spinner while retrying). Filters and list replaced; Add order and "+" stay. |
| | **First use (no orders at all)** | `AppPlaceholder`: `i-lucide-clipboard-list`, "No orders yet", body, **Add order**. Filters hidden. |
| | **Open view empty, orders exist** | In the list area "No open orders." and body "Everything has been delivered or cancelled." + **Add order**; chips stay. (AC6 doesn't cover this case; see gaps.) |
| | **Filtered, nothing matches** | Filters stay usable; `Showing 0 of 18 orders · Clear filters`; list area "No orders match these filters." with **Clear filters** (outline, 44px). Clearing puts focus on the **Open** chip. |
| | **Filtered** | `Showing {x} of {n} orders · Clear filters`. |
| | **Show more** (not Open) | `Showing 25 of 143 orders` + **Show more**, spinner while loading, appended without moving what is on screen; failure toast `Couldn't load more orders.` + **Try again**. |
| | **Signed out** | List, filters, the picker's text and every open form, detail and dialog are discarded; Back doesn't show them; another farm starts at Loading and never sees the previous farm's orders, sales or clients, even briefly (AC55). |
| Card / row | **Requested / Confirmed / Ready** | Number, date, client, wanted-by, line bars, total, status text, **Deliver**, ⋮. |
| | **Partially fulfilled** | Same, with bars part-filled and `20 of 30 trays`. |
| | **Fulfilled** | Full bars, `30 of 30 trays`, badge, no Deliver, no ⋮. |
| | **Fulfilled (closed short)** | Real figures (`20 of 30 trays`), badge `Fulfilled (closed short)`, line `Closed short`, no Deliver, no ⋮. |
| | **Cancelled** | Badge, line `Cancelled before anything was delivered`, no Deliver, no ⋮. |
| | **Inactive client / archived size** | Name shown as usual; the detail and the forms say Inactive / Archived. Nothing changes (AC33). |
| | **Many sizes** | Up to 3 lines, then `+ N more sizes`; `· N sizes` always exact. |
| | **Busy** | ⋮ shows a spinner and is disabled; the Deliver button is not affected (it only opens the step). Badge changes after the answer. |
| | **Just changed / saved** | 1.5s highlight, scrolled into view; none with reduced motion. |
| | **Row left the view** | After Cancel, Close short, a delivery that fulfils it, or an edit that fulfils it: the card leaves Open and the toast says why; focus goes to the next card's name button, or the **Open** chip. |
| | **Changed elsewhere** | The list refreshes and a persistent toast says so. |
| Form (New / Edit) | **Default (New)** | Client empty, one empty line, Order date today, Wanted by empty, `Order total —`, Save enabled. |
| | **Default (Edit)** | Pre-filled, number in the title, locks as in the wireframe, Save enabled. |
| | **Price pre-fill** | A client with a usual price fills lines whose price the owner hasn't typed and later-added lines; note `Usual price` beside the label until changed; typed prices never overwritten. |
| | **Validation: header** | Client blank; order date blank or future; wanted-by before the order date. |
| | **Validation: line** | No size; quantity 0 or blank; loose too high; not a whole number; over 100,000 eggs; below the delivered minimum (Edit); price blank, zero, not a number, too many decimals, too high. Under the field, in the line's card. |
| | **Save blocked** | Dimmed and `aria-disabled` only while a message shows; first invalid field focused. |
| | **Add size unavailable** | Dimmed with the reason under it. |
| | **Saving / failed / nothing changed / stale / discard / success** | As O-R1, flow D, flow L. Success: form closes, toast, highlighted card. |
| | **Locked (Edit, partially fulfilled)** | See wireframe. |
| Deliver step | **Default** | Pre-filled with what is left, date today, button focused. |
| | **Short stock** | Amber panel, button **Deliver anyway**. |
| | **Over-delivery** | `Only {n} left to deliver.` on the line, button blocked. |
| | **Nothing to deliver** | Message under the lines, button blocked. |
| | **Bad date** | Message under the date, button blocked. |
| | **Confirming / failed / delivered elsewhere** | Spinner; failure: alert in the step, values kept; amounts changed elsewhere: lines refreshed + message. Order cancelled or closed elsewhere: the step closes, persistent toast "This order was changed somewhere else. The list is up to date now." |
| Detail | **Default** | Header, badge, rows, status control (pre-delivery only), lines with bars, total, deliveries, footer by status. |
| | **Voided delivery in the list** | Row shows **Voided** (text badge) and `Not counted`; it still opens. Delivered-so-far and the bar already exclude it. |
| | **No deliveries yet** | `No deliveries yet.` |
| | **Converted pending order** | A muted `Formerly sale #1038` under the badge. Nothing else differs. |
| | **Fulfilled / Closed short / Cancelled** | Read-only: no footer, no status control; a note; closed-short shows the dropped amounts. |
| | **Busy** | The tapped footer button or status option shows a spinner; the others wait. |
| | **Order gone / changed** | Changed elsewhere: stays open and updates in place. If it can no longer be found: closes with a toast. |
| Cancel / Close short dialogs | **Default / working / failed / no longer allowed** | Keep order / Keep open focused. Spinner on the action. Failure: alert in the dialog, order unchanged. Not allowed any more (a delivery arrived from another phone): the dialog closes with a plain message and the detail refreshes. |
| Sales | **From order** | Link pill on card and detail. A voided linked sale keeps the pill. |
| | **Voided linked sale** | **Voided** badge as 04, plus a pill still opening the order. |
| More | **Closed / open / on Inventory or Clients** | See flow M. |
| Theme | **Light / dark** | Text uses `text-default` / `text-highlighted` / `text-muted` on `bg-default` / `bg-muted`. Bar track `bg-accented`, fill `primary`; the text beside the bar carries the number, so it is readable even if the fill is faint. Badges are soft/subtle with text, amber panel uses dark text on a soft tint in light mode and `text-highlighted` on a soft tint in dark mode; focus rings stay visible on both. Prices, names and quantities never use `text-dimmed`. |

### Copy

Dates as feature 01 R3 (`Today · Oct 3`, `Sep 24`); in toasts and dialogs `today`. Names in messages are the client's own.

| Where | Text |
|---|---|
| Top bar | **Orders** · `What customers are waiting for` **[proposed]** |
| Add button / "+" aria | **Add order** / `Add order` |
| Mobile tab bar | **Home** · **Production** · **Orders** · **Sales** · **More** |
| More sheet | Title **More** · rows **Inventory** · **Clients** · current row text `Current` · More accessible name when on those screens `More, current: Clients` · close aria `Close` |
| Status chips | **Open** · **All** · **Fulfilled** · **Cancelled** · hidden group name `Status` |
| Client filter | Label `Client` · placeholder **All clients** · search `Search clients…` · `{Name} · Inactive` |
| Date filter | Label `Order date` (phone panel) · hidden `From`, `To` · **Clear** / **Clear dates** · `End date must be on or after the start date` |
| Phone filters button | **Filters** · `Filters ({n})` · aria `Show filters` / `Hide filters` |
| Count line | `Showing {x} of {n} orders` · **Clear filters** |
| Card / table | Headers **Order** · **Client** · **Progress** · **Total** · **Status** · hidden **Actions** · `#12` · `Oct 3` · `Wanted by Fri, Oct 9` · line `Large` + `20 of 30 trays` · `+ {n} more sizes` · `{n} sizes` (`1 size`) · button **Deliver** · `Closed short` · `Cancelled before anything was delivered` |
| Status badges | **Requested** · **Confirmed** · **Ready** · **Partially fulfilled** · **Fulfilled** · **Fulfilled (closed short)** · **Cancelled** · **Voided** |
| Row aria | `Open order #12, Maple Street Market, Partially fulfilled` · `Actions for order #12` · `Deliver order #12` |
| Row menu | **Deliver** · **Edit** · **Mark confirmed** · **Mark ready** · **Back to confirmed** · **Back to requested** · **Cancel order** · **Close short** |
| Form titles | **New order** · **Edit order #{number}** |
| Client field | Label **Client** · placeholder `Search or add a client…` · inactive `{Name} · Inactive` · locked helper `Can't change after a delivery.` |
| Client picker | **+ New client** · `Add "{text}" as a new client` · `No clients yet. Add your first client.` |
| Line | Hidden legend `Size {n}` · **Size** · used chip second line `In this order` · archived chip `Archived` · select option `{Size} (in this order)` · remove aria `Remove {Size} line` / `Remove line {n}` · locked aria `{Size}, locked, {qty} already delivered` |
| Quantity | **Trays** / **Loose** (desktop `trays` / `loose`) · accessible names `{Size} trays`, `{Size} loose eggs` · minimum `At least {qty} delivered` |
| Price | **Price per tray** · prefix = farm currency · placeholder `0.00` · `Usual price` · **Line total** · locked-line note `Price changes only affect future deliveries.` |
| Add size | **Add size** · `An order can have up to 20 sizes.` · `All your sizes are in this order.` |
| Totals | `Order total ₱262.50` · `Order total so far ₱202.50` · `Order total —` |
| Dates | **Order date** · **Wanted by (optional)** · **Clear wanted-by date** · hints `Today` / `Wednesday, Sep 24` |
| Buttons | **Cancel** · **Save** · close aria `Close` |
| Edit note: becomes fulfilled | `Everything ordered has been delivered, so this order will be marked Fulfilled.` |
| Validation: client | `Choose a client.` |
| Validation: size | `Choose a size.` |
| Validation: quantity none | `Enter a quantity.` |
| Validation: loose too high | `Loose eggs must be under {trayScale}. Add a tray instead.` |
| Validation: not whole | `Enter a whole number, like 12.` |
| Validation: too big | `The most one size can take is {formatQty(100000)}.` |
| Validation: below delivered | `Can't go below what was delivered: {qty}.` |
| Validation: price | `Enter a price.` · `Use numbers only, like 6.50.` · `Enter a price above 0.` · `Use 2 decimals at most, like 6.50.` · `The most you can enter is ₱9,999.99.` |
| Validation: order date | `The order date can't be in the future. Pick today or earlier.` · empty `Pick a date.` |
| Validation: wanted by | `Wanted-by can't be before the order date, {Sep 20}.` |
| Save failed | `Couldn't save. Check your connection and try again.` · Edit: `Couldn't save your changes. Check your connection and try again.` |
| Server: too many sizes | `An order can have up to 20 sizes.` |
| Server: same size twice | `Each size can be in an order once. Change its quantity instead.` |
| Server: size gone | `Your sizes have changed. Close this form and open it again.` |
| Server: client inactive | `This client is inactive now. Choose another client.` |
| Server: order not open | `This order is already fulfilled or cancelled, so it can't be changed.` |
| Server: cancel refused (AC22) | `This order already has a delivery, so it can't be cancelled. Use Close short instead.` |
| Server: close short refused | `Only a partly delivered order can be closed short.` |
| Server: stale (AC20) | toast `This order was changed somewhere else. The list is up to date now.` |
| Toast: saved | `Order #12 saved` |
| Toast: edited | `Updated order #12` · becomes fulfilled `Updated order #12. It's fulfilled now.` |
| Toast: status | `Order #12 is now Confirmed.` (or Ready, Requested) |
| Toast: delivered (AC27) | `Delivered: sale #52. Order #12 is now partially fulfilled.` / `…is now fulfilled.` · hidden by the filter: add ` Hidden by the Open filter.` |
| Toast: cancelled | `Order #12 cancelled.` · hidden: ` Hidden by the Open filter.` |
| Toast: closed short | `Order #12 closed short.` · hidden: ` Hidden by the Open filter.` |
| Toast (error): deliver | alert in the step: `Couldn't deliver. Check your connection and try again.` |
| Toast (error): action | `Couldn't update order #12. Check your connection and try again.` · **Try again** |
| Toast (error): refresh / more | `Couldn't refresh your orders.` · `Couldn't load more orders.` · **Try again** |
| Detail | Title `Order #12` · rows **Client** · **Order date** · **Wanted by** · **Status** (options **Requested** · **Confirmed** · **Ready**) · per line **Ordered** · **Delivered** · **Left** (closed short: **Dropped**) · `At {price} / tray` · **Order total** · heading **Deliveries** · `Sale #52 · Oct 3` · `Not counted` · empty `No deliveries yet.` · `Formerly sale #1038` · buttons **Cancel order** · **Close short** · **Edit** · **Deliver** |
| Detail notes | Fulfilled `Everything ordered was delivered.` · closed short `Closed short on Oct 8. Not delivered: Medium 10 trays.` · cancelled `Cancelled on Oct 4. It never left the farm.` |
| Deliver step | Title `Deliver order #12` · line `#12 · Maple Street Market` · **Delivered date** · hint `Today · ordered Oct 3` · section **Deliver now** · per line `{qty} left` (`10 trays left`) · `This delivery ₱127.50` · not-in-delivery `Not in this delivery` · buttons **Cancel** · **Deliver** / **Deliver anyway** · checking `Checking stock…` |
| Deliver: over | `Only {qty} left to deliver.` |
| Deliver: none | `Enter a quantity for at least one size.` |
| Deliver: date | `The delivered date can't be before the order date, {Oct 3}.` · `The delivered date can't be in the future. Pick today or earlier.` |
| Deliver: short | `Not enough on hand:` + `{Size}: {qty} on hand, you're delivering {qty}` (zero reads `0`) + `You can still deliver it.` |
| Deliver: raced | `Part of this order was delivered somewhere else. Check the amounts left.` |
| Cancel confirm | Title `Cancel order #12?` · `{Client} · {n} sizes · {total}` · `It hasn't left the farm, so your stock doesn't change.` · `You can't undo this. The number #12 stays used.` · **Cancel order** · **Keep order** · failed `Couldn't cancel. Check your connection and try again.` |
| Close short confirm | Title `Close order #12 short?` · `{Client}` · `Closing short drops 10 trays of Medium. Deliveries already made stay.` (several sizes: `Closing short drops:` + `{Size}: {qty}` per line + `Deliveries already made stay.`) · `Your stock doesn't change. You can't undo this.` · **Close short** · **Keep open** · failed `Couldn't close the order. Check your connection and try again.` |
| Discard | Title **Discard this entry?** · New `What you typed won't be saved.` · Edit `Your changes to order #12 won't be saved.` · **Keep editing** · **Discard** |
| First use | Heading **No orders yet** · body `Take an order when a customer asks for eggs. Deliver it later, all at once or in a few drops.` · **Add order** |
| Open empty | `No open orders.` · `Everything has been delivered or cancelled.` · **Add order** |
| No match | `No orders match these filters.` · **Clear filters** |
| Load failure | Heading **Couldn't load your orders** · body `Check your connection and try again.` · **Try again** |
| Sales: link | **From order #12** · aria `Open order #12` |
| Sales: void dialog | Existing Void copy plus `Order #12 will show {qty} still owed.` (several sizes: `Order #12 will show these still owed:` + lines) and, when it changes, `It will go back to {Ready / Partially fulfilled}.` · closed short `Order #12 was closed short and stays closed.` |
| Sales: void toast | `Sale #52 voided. Order #12 shows {qty} still owed.` |
| Sales: edit linked | `Part of order #12` · `Void this delivery and deliver again to change eggs.` |
| Sales: save toast | `Sale #1041 recorded` (see gap G2) |

Notes on the wording:
- "Deliver", "Deliver anyway", "Close short", "Fulfilled", "Requested / Confirmed / Ready" and the progress text are the owner's own words from the frames and ACs. "Trays" everywhere a quantity is meant; "eggs" only in "Loose eggs" and amounts under a tray.
- No message says "invalid", "conflict", "constraint", "fulfilment", "line item" or "SKU". A line is "a size". Messages never repeat a typed value; the limit messages show the limit.
- "Order #12" and "Sale #52" always carry the word and the number (AC, "Terms").

### Quantity entry
The shared trays + loose input, **two fields, already decided**; no open convention question. One per line on the order form, name `lines.{i}`; on the Deliver step one per remaining line, pre-filled. Trays min 0; loose min 0, max tray size minus 1, validated and not clamped; `inputmode="numeric"`; blank counts as 0. On Edit, the lower bound for a line with deliveries is its delivered amount (the minus stepper stops there and a message appears if typed lower). On Deliver, the upper bound is the remaining amount (the plus stepper stops there; a typed higher value shows the message). Tray size always from the farm. Price: a separate text field, decimal keypad.

### Accessibility
- **Tap targets >= 44px on phones and tablets (AC47):** the "+" (52px), the five tabs (64px), More and its sheet rows (56px), status chips, Filters button, card (whole), Deliver, ⋮ and its items, the Status control's three options, From and To, Client filter, size chips, trays and loose fields and steppers, remove-line, Add size, price, date fields, Clear wanted-by date, Save, Cancel, ✕, every dialog button, delivery rows in the detail, **From order** link pills, Show more, Try again, toast close and action. Neighbouring targets are at least 4px apart. At lg controls may be 40px.
- **Labels on every input:** visible labels (**Client**, **Size**, **Price per tray**, **Order date**, **Wanted by (optional)**, **Delivered date**, **Deliver now**); trays and loose have column headers and full names (`Large trays`, `Large loose eggs`; on Deliver `Large deliver now trays`); filter dates have hidden `From` and `To`; the chips are `role="group"` with hidden names; size chips are a `radiogroup` per line inside a `fieldset` with a hidden `Size {n}` legend; the Status control is a `radiogroup` named `Status`.
- **Not colour alone:** status is words in badges (the closed-short and Voided states have their own words); progress is `20 of 30 trays` in text, bars are `aria-hidden`; the selected chip and status option have a check, a ring and bold text; a used size says **In this order**; locked fields have a lock icon and helper text; errors and warnings are icon plus text; the amber panel names the sizes; a line left out of a delivery says **Not in this delivery**; a missing line total is a dash with hidden "Not worked out yet".
- **Sunlight contrast:** names, quantities, prices, totals and progress text use `text-highlighted` / `text-default`; only headers, hints, the "Usual price" note, "Formerly sale #…" and dates under names use `text-muted`. Fulfilled and Cancelled cards are not dimmed. Progress text must meet 4.5:1 on `bg-default` in both themes; the bar needs 3:1 against its track.
- **Keypads:** trays, loose numeric; price decimal; client search text; dates native. iOS has no Return on numeric keypads, so Save, Deliver and the Deliver step's footer stay pinned and visible; the footer condenses (not disappears) with the keypad open.
- **Focus:**
  - Opening New order: desktop focuses Client; phones focus nothing (the keypad would hide the form). Opening Edit: phones nothing, desktop the first editable field with its text selected. Sheets and dialogs trap focus.
  - Opening the Deliver step: the **Deliver** button. Cancel order and Close short confirms: **Keep order** / **Keep open**. Discard: **Keep editing**.
  - After Add size: the new line's first chip. After Remove line: the previous line's chips, or Add size. After choosing a size on an empty line: that line's Trays (where allowed). After the Add client sheet closes: **Client**.
  - After Save (New): the "+" / **Add order**. After Edit: the card's name button. After Deliver: see flow B. After a status change from the menu: that card's ⋮. After a status change in the detail: the same option. After Cancel or Close short from the list: the next card's name button, or the **Open** chip; from the detail: the detail heading.
  - After the More sheet navigates: the new screen's heading. After it is dismissed: the More tab. After a stacked sale or order detail closes: the row that opened it.
  - First invalid field is focused when Save or Deliver is tapped.
- **Keyboard (desktop):** Tab reaches the filters, each row's number button, Deliver and ⋮ in order; Enter on the number opens the detail; size chips by arrow keys and Space; Enter on the last field saves; Esc asks to discard or closes; menu opens with Enter or Space, arrows move, Esc closes.
- **Live regions:** toasts announced; form alerts `role="alert"`; the footer total and the Deliver step's "This delivery" total `aria-live="polite"`; the "will be marked Fulfilled" note and the stock panel `role="status"`; the count line announced after a filter change (`{x} orders`); status changes announced through the toast. List is a `<ul>` on phones and a real `<table>` with a caption on desktop.
- **Motion:** sheet slide, row highlight, bar growth and menus respect `prefers-reduced-motion`.
- **Text size / zoom:** 16px inputs; at 200% text the footer actions, badges and progress text wrap, nothing scrolls sideways.

### Design departures and Figma vs ACs

The frames were not seen directly (see the top of this section), so this list is the conflicts found between the owner's description and the ACs or the built app. The frontend dev checks each against the actual frame.

| # | The frames (as described) | The ACs / built app | What to follow |
|---|---|---|---|
| F1 | Mobile bar says **Home**. | The built bar and the sidebar say **Dashboard** (`APP_NAV`). AC1 says Home on the bar. | **Home** on the phone bar only; **Dashboard** in the sidebar and as the page title. `APP_NAV` needs a separate short label for the bar. |
| F2 | Bottom bar has 5 tabs including **More** (a sheet). | Built `AppBottomTabs` is a 5-column grid of links; feature 04 AC1 says "exactly five" Dashboard..Clients. | Frames and Q2 win. More is a button, not a link; see flow M for the highlight rule. |
| F3 | Detail action bar: **Deliver / Edit / Close short**. | AC8 needs **Cancel order** and status change for Requested, Confirmed, Ready. | Same bar; the third slot is **Cancel order** before the first delivery and **Close short** after. The Status control (flow C) is added to the detail and the menu; not drawn. |
| F4 | Cards show a status badge, per-size progress bars, total, one-tap **Deliver** and a menu. | AC2: summary may shorten, line count readable; Deliver visible for open orders. | Frames. Cards for Fulfilled and Cancelled show no Deliver and no menu. The bar is decorative; the text carries the number. |
| F5 | **Deliver (stock short)** is one step with an amber panel and **Deliver anyway**. | AC30 says the same. | Matches. The panel is live as quantities change, only short sizes named. |
| F6 | **Close short confirm** is a centred dialog. | AC34 matches. | Matches; copy for several sizes added. |
| F7 | **Sales list (From order)** shows a green link. | AC39: Status chips and text gone. | If the frame still shows Status chips, Pending or Mark delivered, remove them (AC37). Keep the green link, give it a 44px tap area. |
| F8 | New order is a bottom sheet. Date placement not known. | AC9 lists header then lines. | Placement per frame. If it puts dates first, keep client + first line on the first screen (04 O5) as a preference, not a rule. |
| F9 | Edit order not drawn. | AC19. | Derived here (wireframe). |
| F10 | Order detail: assumed a sheet like Sales detail (frame not seen). | AC7: readable on mobile without horizontal scrolling. | Overlay, no address-bar change. If the frame is a full page, keep it in memory only (AC53) and keep the same content. |
| F11 | Desktop Orders list only is drawn. | AC48. | Detail slide-over, forms and dialogs follow Sales' desktop patterns (480px / 640px / 400px). |

### Data the UI needs (for the architect)
1. **Orders list for a filter:** status view (open / all / fulfilled / cancelled), client id, order date from-to; order per AC3; **the Open view returns every open order, no cap (AC5)**; other views in pages of 25 with a way to load more and **the total number of matches**; a **"has any orders at all" flag** (first use vs no match) and a way to tell "Open is empty but orders exist". Each order: id, **order number**, client id, order date, wanted-by (nullable), status, **closed-short flag + date + dropped eggs per size**, **converted-from sale number (nullable, AC45)**, **a flag/count of deliveries including voided ones** (decides whether Cancel order is offered and which Edit rules apply), the lines (size id, ordered eggs, **delivered-so-far eggs computed from non-voided deliveries**, price per tray, line total), the order total, and **one version marker covering the header, the lines and the deliveries** (stale check, AC20).
2. **An order's deliveries:** sale id, sale number, delivered date, voided-at, eggs per size, so the detail can list them, mark voided ones, and open the sale.
3. **On a sale:** whether it came from an order (order id, order number, and the order's status), so Sales cards can show **From order #n**, lock the edit form and build the Void dialog. For the Void dialog before confirming: **the order's resulting status and the still-owed amount per size** after this void (or the server returns them with a "what will happen" read).
4. **On-hand eggs per size** (same figure as the Log a sale hint) for the Deliver step's panel, refreshed on open and after each save/deliver/void; and the server must answer a **deliver that would take a size below 0 with the short sizes (on hand and needed) without saving**, and accept the same request again with an "allow anyway" flag (feature 04 X5 pattern).
5. **Deliver request/response:** delivered date and eggs per size; the response returns the new sale (number), the whole updated order (new status, delivered-so-far, version) and enough to refresh on-hand. Over-delivery refusal returns the **current remaining per line**.
6. **Idempotency:** one submit id per New order form opening and per Deliver step opening, reused on retry (AC16, AC31). Status moves, Cancel and Close short are naturally repeatable: doing them again on an order already in that state is "done", not an error.
7. **The client list** (id, name, usual price, active flag), loaded after mount; **the size list** with colour slot and archived flag; tray size and currency from the farm.
8. **Every change returns the whole changed order** (number, version, status) so the card updates without a refetch.
9. **Error kinds the UI maps to copy:** network; each field with its line; too many lines; same size twice; unknown, foreign or archived size on a new line; client inactive or foreign; **stock short**; **over-delivery (with remaining)**; **order changed elsewhere (stale)**; **order not found**; **order not open / already fulfilled or cancelled**; **cancel refused because of a delivery**; **close short refused (not partly delivered)**; **line below delivered / locked line removed or resized (Edit)**; **linked sale locked fields (Sales Edit)**; session expired (the shell handles it). Messages name the field or line and never the value (AC54).
10. **Cross-screen opening:** the shared `SaleDetail` and the order detail must be openable from either screen as stacked overlays from in-memory state, without putting an id in the URL.
11. **A short More-tab matcher:** which routes count as Inventory or Clients (any path beneath them) for the highlight rule.

### Decisions for owner
**RESOLVED (owner, 2026-10-03):** D1 = three-option control; D3 = stacked; D4 = keep the number ("Sale #{n} recorded", AC38 reworded); D5/G1 = voided deliveries don't count, so an order whose last delivery is voided goes back to Ready and can be cancelled (AC22 and AC35 reworded). D2 was not asked; the recommended default (Cancel in the detail footer and the ⋮ menu) stands unless the owner objects. The text below is kept for the record.

- **D1. Status control on the order detail (not drawn).** Recommended: a three-option **Requested | Confirmed | Ready** choice, any option one tap, plus two taps from the ⋮ menu. Alternative: a single "next step" button (Confirm, then Mark ready) with going back only through the menu. The recommendation gives forward and back in one tap; the alternative is simpler to look at.
- **D2. Where Cancel order lives.** Recommended: the detail's footer (left slot) and the ⋮ menu, red, always asked first. Alternative: only inside the ⋮ menu and a red text link at the bottom of the detail (smaller footer, one more tap).
- **D3. Linked sale and order open on top of each other** (flow H) instead of jumping between the Sales and Orders screens. Recommended: stacked, never more than two deep. Alternative: jump to the other screen.
- **D4. The "Sale recorded" toast (AC38).** Recommended: keep the number, `Sale #1041 recorded`, as decided for feature 04 (O4). AC38 says "Sale recorded". Either is fine; pick one.
- **D5. A stuck order (see gap G1).** Decision for the PM and owner, below.

### Gaps and contradictions found in §2 (not changed; for the PM)
- **G1. Dead end after voiding the only delivery.** AC35 sends a voided Fulfilled order to Ready if no delivery remains, but AC22 refuses Cancel for any order that has ever had a delivery (even voided), and AC34 allows Close short only while Partially fulfilled. So an order whose only delivery was voided (status Ready) can never be cancelled or closed. Same for a Partially fulfilled order whose only delivery is voided (AC35 doesn't say what status it takes; the sensible answer is Ready). Needs one of: Cancel allowed when no non-voided delivery exists; or Close short allowed on any open status with a delivery; or such orders keep a way out. Also AC19's "nothing delivered yet" should say whether voided deliveries count (the design assumes only non-voided ones unlock editing the client and sizes, while Cancel looks at all).
- **G2. AC38 vs feature 04 O4.** AC38 says the toast reads "Sale recorded"; feature 04 decided "Sale #1041 recorded". This design keeps the number; the PM should change AC38 or say otherwise.
- **G3. AC6 doesn't cover the empty Open view** (orders exist, none open). Added copy "No open orders." with an Add order button; the "No orders match these filters." text would mislead when nothing is filtered.
- **G4. AC7 "each opens that sale"** has no place to open it: the Sales detail is an overlay on the Sales screen with no address-bar id. Designed as a stacked overlay (D3); the architect should confirm it is feasible.
- **G5. AC21 gives no way back in one tap** from the list, and the frames don't draw any status control for the detail. Designed (flow C, D1).
- **G6. AC2 "wanted-by sorted first" has no cue** to show an order is late. Not added (out of scope); a muted "Wanted by" line is all the owner gets. If the owner wants "late" shown, that is a new criterion.
- **G7. AC36 "date can still be changed with the usual rules"** doesn't say the limit for a linked sale. Designed: not before the order date, not in the future. The PM should confirm.
- **G8. AC1 and feature 04 AC1 / CLAUDE.md.** Feature 04 AC1 still says "exactly five" and the built `APP_NAV` and `AppBottomTabs` are a plain 5-link grid; also the tab label "Home" vs "Dashboard" (F1). Already known to the PM (spec edits list); the frontend dev needs a short label.
- **G9. AC4 "Fulfilled" chip and closed short:** a closed-short order shows under Fulfilled with the words "(closed short)"; there is no separate chip. Assumed intended.
- **G10. AC33 vs Edit:** AC19 keeps an archived size selectable only on existing lines; AC33 lets Deliver proceed with archived sizes. No conflict, noted so QA tests both.

**Main-path tap counts (phone):** take an order with two sizes **9 taps** + typing (35 to 45 s); deliver everything left **2 taps**; change status **2 taps** from the list, **1 tap** in an open detail; edit an order **2 taps** to open; cancel **3 taps**; close short **3 taps** (2 from an open detail); Inventory or Clients **2 taps**.

---

## 3. Technical design (Architect)

**Written 2026-10-03.** Inputs: §1-2 (acceptance criteria, owner decisions), §2.5 (UX, including the RESOLVED D1/D3/D4/D5-G1 list), the approved plan (a proposal; where §2 or an owner decision differs, §2 wins and the difference is listed in 3.10), the shipped feature 04 migrations (`20260927065128_sale_counters.sql`, `20260927065130_sales.sql`, `20260927065131_sales_functions.sql`), `server/repositories/sales.ts`, `shared/`, and the pgTAP and unit guard tests.

**One stub was written (architect scaffold, additive only):** the order types, the new `ApiErrorReason` values and `ApiErrorData.order` are appended to `shared/types/api.ts` so the contract compiles before the devs start. The `Sale` changes (remove `status` and `deliveredDate`, add `orderId` / `orderNumber`) are **not** applied there; that is task B8 because it breaks the shipped sales code until the backend and frontend change together.

### 3.0 The design in one page

```
tenants
  |-- order_counters   (1 row/farm, next order number)        sale_counters (unchanged)
  |-- orders ----------< order_lines            (PK tenant,order,size)
  |     ^  |
  |     |  '-- order_submissions (create_order ledger)
  |     |
  |     '------ sales.order_id (nullable, NOT unique, composite FK) ----< sales >---- sale_lines
  |                                                                         |
  |                                                          sale_submissions (also the deliver_order ledger)
  '-- clients, sizes (unchanged; composite FKs from orders / order_lines)
```

- An **order** is a promise: header + 1-20 lines, its own number sequence, one `status`. It never touches stock.
- A **delivery** is a normal `sale` (`type = delivery`) whose `order_id` points at the order. Many sales per order. Created only by `deliver_order`, in one transaction: sale number, sale + lines at the order lines' prices, the order's new status.
- **Delivered so far and remaining are never stored.** They are computed from the order's non-voided linked sale lines (`app.order_delivered_eggs`). The only stored derived fact is `order_lines.dropped_eggs`, written once when an order is closed short (see D5).
- **Status is kept right by the database, not by remembering to.** `deliver_order`, `update_order` and a trigger on `sales` (void) all use one function, `app.order_status_for`, and a `BEFORE UPDATE` guard on `orders` refuses any status that disagrees with the deliveries. A hand-built request cannot jump an order to Fulfilled (AC50).
- **Sales lose their status.** After this feature every `sales` row is a real, completed transaction: no `status`, no `pending`, no mark-delivered, no delete (void-only). `on_hand_json` loses its status test.

**Order status machine** (the single reference for the functions, the guard trigger, `orderActions()` in `shared/utils/order-status.ts`, and QA):

| From | To | Caused by | Condition |
|---|---|---|---|
| requested / confirmed / ready | any other of the three | `set_order_status` | no non-voided delivery |
| requested / confirmed / ready | partially_fulfilled | `deliver_order` | something remains |
| requested / confirmed / ready | fulfilled | `deliver_order` | nothing remains (one delivery of everything) |
| requested / confirmed / ready | cancelled | `cancel_order` | no non-voided delivery (G1: voided ones don't count) |
| partially_fulfilled | partially_fulfilled | `deliver_order` | something still remains |
| partially_fulfilled | fulfilled | `deliver_order`; or `update_order` that lowers every line to its delivered amount | nothing remains |
| partially_fulfilled | fulfilled + `closed_short_at` | `close_order` | one-way |
| partially_fulfilled | **ready** | void of the last non-voided delivery (trigger) | owner decision G1 / Q7 |
| fulfilled (not closed short) | partially_fulfilled or **ready** | void of a delivery (trigger) | partially if another non-voided delivery remains, else ready |
| fulfilled (closed short), cancelled | (none) | | terminal. A closed-short order still gets `version + 1` when one of its deliveries is voided; nothing else changes |

`app.order_status_for(tenant, order)` encodes the rule once: cancelled or closed short -> unchanged; delivered = 0 -> keep the current status if it is requested/confirmed/ready, otherwise `ready`; remaining = 0 (every line delivered >= ordered) -> `fulfilled`; else `partially_fulfilled`.

### 3.1 Data

#### 3.1.0 Migration plan (four files, in this order, after `20260927065131_sales_functions.sql`)

Supabase applies each file in its own transaction, in filename order. Use `supabase migration new <name>` so the dev gets real timestamps, keeping the order.

| # | File (suggested name) | What | Why this position |
|---|---|---|---|
| M17 | `..._orders.sql` | `order_counters`, `orders`, `order_lines`, `order_submissions`, `sales.order_id`, helper functions, guard triggers, grants + RLS. **Additive only.** | Everything the conversion and the new functions need exists first. Safe to apply alone. |
| M18 | `..._orders_convert_pending.sql` | Pending sales -> orders (data). | Must run **before** `sales.status` goes, and before `sales_delete_guard` goes (it deletes the pending rows). |
| M19 | `..._sales_drop_pending.sql` | Drop the pending machinery; `delivered_date` becomes a generated, not-null copy of `sale_date`; replace the sale functions and `on_hand_json` / `sale_json` / `list_sales_json`; sale-side guard triggers. | Only after M18 emptied every pending row. |
| M20 | `..._orders_functions.sql` | `order_json`, `list_orders_json`, and the eight public order functions. | Uses M17 tables and M19's `sale_json`. |

A `db:reset` runs all four. **Do not apply M19 to a hosted database without a backup**: it drops a column and three functions. There is no down migration (the project has none); the safety net is the M18 post-conditions and the migration test (3.7).

#### 3.1.1 M17: new tables

**`order_counters`**: identical to `sale_counters`: `tenant_id uuid primary key references tenants on delete cascade`, `next_number bigint not null default 1 check (>= 1)`, `updated_at`; `set_updated_at` trigger; `app.seed_order_counter(uuid)` + `app.seed_order_counter_trigger()` + trigger `seed_order_counter after insert on tenants`; backfill `select app.seed_order_counter(t.id) from tenants t`. Order numbers are assigned by `create_order` (and by M18) with `update order_counters set next_number = next_number + 1 ... returning next_number - 1`, under the per-farm lock.

**`orders`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `tenant_id` | uuid not null -> `tenants(id)` on delete cascade | |
| `order_number` | bigint not null | per-farm, never reused (AC18). `unique (tenant_id, order_number)` |
| `client_id` | uuid **not null** | composite FK `(tenant_id, client_id) -> clients(tenant_id, id)`, no action / no cascade. An order always has a client (AC11) |
| `order_date` | date not null | the day the order was taken |
| `wanted_by` | date null | null = no date wanted (AC9) |
| `status` | text not null default `'requested'` | `check (status in ('requested','confirmed','ready','partially_fulfilled','fulfilled','cancelled'))` |
| `cancelled_at` | timestamptz null | one-way flag. `check ((status = 'cancelled') = (cancelled_at is not null))` |
| `closed_short_at` | timestamptz null | one-way flag, not a status value (like `sales.voided_at`). `check (closed_short_at is null or status = 'fulfilled')` |
| `converted_from_sale_number` | bigint null | "Formerly sale #N" (AC45). Written only by M18; no grant to owners |
| `version` | bigint not null default 1 | `check (version >= 1)`. Bumped on every real change to the header, a line, **or a delivery** (AC20) |
| `created_at`, `updated_at` | timestamptz not null default now() | `set_updated_at` trigger |

Constraints: `orders_tenant_id_id_key unique (tenant_id, id)` (FK target for `order_lines`, `order_submissions`, `sales`); `orders_wanted_not_before_order check (wanted_by is null or wanted_by >= order_date)`; `orders_date_not_future check (order_date <= (now() at time zone 'utc')::date + 1)` (same UTC+1 slack as `sales_date_not_future`); partial `unique (tenant_id, converted_from_sale_number) where converted_from_sale_number is not null` (a pending sale converts at most once: the idempotency backstop for M18).

Indexes: `orders_tenant_open_idx on orders (tenant_id, wanted_by asc nulls last, order_date, order_number) where status in ('requested','confirmed','ready','partially_fulfilled')` (the Open sort, AC3); `orders_tenant_date_idx on orders (tenant_id, order_date desc, order_number desc)` (every other view); `orders_tenant_client_idx on orders (tenant_id, client_id)`.

**`order_lines`**

`tenant_id uuid not null -> tenants on delete cascade`, `order_id uuid not null`, `size_id uuid not null`, `eggs integer not null check (eggs between 1 and 100000)`, `price_per_tray numeric not null check (> 0 and <= 9999.99 and = round(price_per_tray, 2))`, `line_total numeric not null check (>= 0)` (frozen, AC51), `dropped_eggs integer not null default 0 check (dropped_eggs >= 0)`, `created_at`, `updated_at`. `primary key (tenant_id, order_id, size_id)` (one line per size is the key, AC12). `foreign key (tenant_id, order_id) -> orders(tenant_id, id) on delete cascade`; `foreign key (tenant_id, size_id) -> sizes(tenant_id, id)` (plain, same "no action so a whole-tenant cascade works" reasoning as `sale_lines_size_fk`). Index `(tenant_id, size_id)` (Dashboard "for delivery" and Inventory later). `set_updated_at` trigger.

**`order_submissions`** (the `create_order` ledger, mirror of `sale_submissions`): `tenant_id`, `id` (the client's submissionId), `order_id`, `payload_hash text check (~ '^[0-9a-f]{64}$')`, timestamps, `primary key (tenant_id, id)`, FK `(tenant_id, order_id) -> orders` on delete cascade. `deliver_order` has **no new ledger**: it reuses `sale_submissions` (D6).

**`sales.order_id`**: `alter table public.sales add column order_id uuid null`, `constraint sales_order_fk foreign key (tenant_id, order_id) references public.orders (tenant_id, id)` (plain; **not unique**: many sales per order), `constraint sales_order_is_delivery check (order_id is null or type = 'delivery')`, `create index sales_tenant_order_idx on public.sales (tenant_id, order_id) where order_id is not null` (the progress query).

**Helper functions in M17** (all `security invoker`, `set search_path = ''`, in `app`, `revoke ... from public`, `grant execute ... to authenticated`):

- `app.order_delivered_eggs(p_tenant_id uuid, p_order_id uuid) returns table (size_id uuid, eggs bigint) stable`: `sale_lines` joined to `sales` where `sales.order_id = p_order_id and sales.voided_at is null`, grouped by size. **The only definition of delivered-so-far.**
- `app.order_status_for(p_tenant_id uuid, p_order_id uuid) returns text stable`: the rule in 3.0.
- `app.recompute_order_status(p_tenant_id uuid, p_order_id uuid, p_bump_version boolean default true) returns void`: locks the order row `for update`, sets `status = app.order_status_for(...)` (and `version = version + 1` when `p_bump_version`). Used by `deliver_order` and the void trigger. `update_order` sets status in its own single UPDATE (see below).
- `app.order_payload_hash(p_client_id uuid, p_order_date date, p_wanted_by date, p_size_ids uuid[], p_eggs integer[], p_prices numeric[]) returns text immutable`: SHA-256 hex of the normalised payload, lines sorted by size id (same recipe as `app.sale_payload_hash`).

`app.lock_tenant_sales(uuid)` is **reused as is** for every order write (D7): one per-farm lock keeps sale-number assignment, order-number assignment, the cap check and the stock check serialised together, with one lock order (advisory lock, then the order row lock) so two functions can never deadlock.

**Guard triggers (all in M17 except the two sale-side ones in M19; they are the DB-level form of AC50):**

| Trigger | On | Rule | SQLSTATE |
|---|---|---|---|
| `order_lines_bounds` | `order_lines` after insert or delete, **deferred** constraint trigger, per row | the order has 1 to 20 lines at commit (same shape as `sale_lines_bounds`; skips an order that no longer exists) | `TM028` |
| `order_lines_write_guard` | `order_lines` before insert / update / delete | the parent order is not `cancelled` or `fulfilled` (insert, update, delete) -> `TM046`; an update may not take `eggs` below the non-voided delivered eggs of that size -> `TM051` hint `below_delivered`; a delete may not remove a line with non-voided delivered eggs > 0 -> `TM051` hint `line_locked` | `TM046`, `TM051` |
| `orders_write_guard` | `orders` before insert or update | **insert:** `status in (requested, confirmed, ready)`, `cancelled_at` and `closed_short_at` null, `version = 1`. **update:** (1) if the old row was cancelled or closed short, only `version` / `updated_at` may change; (2) if the old row was `fulfilled`, header columns are frozen and status may only go to `partially_fulfilled` or `ready`; (3) `cancelled_at` may be set only from requested/confirmed/ready with delivered = 0 (`TM047`); `closed_short_at` only from `partially_fulfilled` (`TM048`); neither can be cleared or moved; (4) `client_id` may not change while delivered > 0 (`TM051` hint `client_locked`); (5) **the new status must agree with the deliveries**: requested/confirmed/ready -> delivered = 0; partially_fulfilled -> delivered > 0 and remaining > 0; fulfilled without `closed_short_at` -> delivered > 0 and remaining = 0 | `TM047`, `TM048`, `TM051`, `TM054` (anything else) |
| `sale_lines_linked_guard` (M19) | `sale_lines` before insert / update / delete | if the parent sale has `order_id is not null`, refuse unless the transaction-local setting `app.order_delivery` is `'on'` (set by `deliver_order` around its own insert, nowhere else) | `TM053` |
| `sales_write_guard` (extended, M19) | `sales` before update | existing `voided_at` one-way rule (`TM040`); **plus** a linked sale's `client_id` and `type` may not change | `TM040`, `TM053` |
| `sales_void_sync_order` (M19) | `sales` **after update of `voided_at`**, when `old.voided_at is null and new.voided_at is not null and new.order_id is not null` | `perform app.recompute_order_status(tenant, order_id)` (bumps the order's version). Lives on the table, not only in `void_sale`, so even a hand-built `update sales set voided_at = now()` leaves the order right | (none) |

Why the setting flag in `sale_lines_linked_guard`: the guard must let `deliver_order` write a linked sale's lines and refuse every other write path. The flag is `set_config('app.order_delivery', 'on', true)` (transaction-local) and the browser cannot call `set_config`: PostgREST only exposes functions in the exposed schemas (`public`), and `pg_catalog.set_config` is not one. A pgTAP case proves a hand-built `rpc/set_config` call fails (3.7). Residual risk accepted: none worse than today's, since a sale's lines were always writable by the owner's JWT; this only narrows it.

#### 3.1.2 M18: convert pending sales to orders (data only)

One SQL file, one transaction (so **all-or-nothing for every farm, and therefore for each farm**). It runs as the migration owner (RLS does not apply), uses no function from M20, and touches no complete sale.

1. **Map**: `create temp table _conv on commit drop as select s.tenant_id, s.id as sale_id, gen_random_uuid() as order_id, s.sale_number, s.client_id, s.sale_date, s.created_at, oc.next_number + row_number() over (partition by s.tenant_id order by s.sale_number) - 1 as order_number from sales s join order_counters oc on oc.tenant_id = s.tenant_id where s.status = 'pending'`. Order numbers follow the old sale-number order (AC45) and start at the farm's counter (1 on a new farm).
2. **Orders**: insert into `orders` `(id, tenant_id, order_number, client_id, order_date = sale_date, wanted_by = null, status = 'confirmed', converted_from_sale_number = sale_number, created_at)` (preserving `created_at` keeps the logging order), `on conflict (tenant_id, converted_from_sale_number) do nothing`. A pending delivery always had a client (`sales_delivery_needs_client`), so `client_id not null` holds. No active-client / active-size check applies: an inactive client and an archived size convert as they are (AC43), because those checks live in the functions, never in a trigger.
3. **Lines**: insert into `order_lines` copying `size_id, eggs, price_per_tray, line_total` **exactly** (no recompute: AC43, AC51), `dropped_eggs = 0`.
4. **Counters**: `update order_counters oc set next_number = oc.next_number + c.n from (select tenant_id, count(*) n from _conv group by 1) c where oc.tenant_id = c.tenant_id`. `sale_counters` is **not touched**, which is exactly what retires the old numbers: the counter only moves forward, so a deleted pending sale's number can never be issued again (the same mechanism as feature 04's delete).
5. **Post-conditions, asserted in a `do $$` block that raises on any mismatch (which rolls the whole migration back)**: per farm, the converted orders' line count, eggs sum and `line_total` sum equal the pending sales' (computed from `_conv` before deletion); the new `order_counters.next_number` equals the old plus the conversion count; no farm's complete sale count or `sale_counters` changed.
6. **Remove**: `delete from public.sales s using _conv c where s.tenant_id = c.tenant_id and s.id = c.sale_id` (lines and `sale_submissions` cascade; `sales_delete_guard` still exists and allows it because the rows are pending). A last assertion: no `sales` row has `status = 'pending'`.

**Idempotent:** a second run finds no pending sale, so `_conv` is empty, nothing is inserted, no counter moves, no assertion fails. The partial unique index is the belt to that brace. A farm with no pending sales is untouched (AC46). `on_hand_json` is identical before and after because it never counted pending sales (AC44).

#### 3.1.3 M19: remove pending, make sales void-only

In this order inside one file:

1. **Drop the old public functions** (their signatures change or they go): `mark_sale_delivered(uuid,uuid,date,boolean)`, `mark_sale_pending(uuid,uuid)`, `delete_sale(uuid,uuid)`, `list_sales(uuid,date,date,text,text,uuid,int,int,boolean)`, `create_sale(uuid,uuid,text,date,uuid[],integer[],numeric[],uuid,date,boolean)`, `update_sale(uuid,uuid,bigint,text,date,uuid[],integer[],numeric[],uuid,date,boolean)`. Drop `app.derive_sale_status`, the old `app.list_sales_json` and `app.sale_payload_hash` signatures.
2. **Sales become void-only at the database**: `drop trigger sales_delete_guard`, `drop function app.sales_delete_guard()`, `drop policy sales_delete on public.sales`, `revoke delete on public.sales from authenticated`. There is then **no delete grant, no policy, no function, no route** for a sale (the same locks clients and sizes have). `sale_lines` keeps its delete grant and policy: `update_sale` replaces a direct sale's lines, and `sale_lines_bounds` keeps the count honest.
3. **The one date**: `update public.sales set sale_date = delivered_date where delivered_date is not null and sale_date <> delivered_date` (decision U1: the one date means "the day the eggs left"); assert no `delivered_date is null` remains (M18 removed the pending rows). Drop constraints `sales_status_delivered_date`, `sales_on_site_complete`, `sales_voided_only_complete`, `sales_on_site_same_day`, `sales_delivered_not_before_sale`, `sales_delivered_date_not_future`; drop index `sales_tenant_status_idx`; `alter table sales drop column status`; `alter table sales drop column delivered_date, add column delivered_date date generated always as (sale_date) stored` (not null by construction, can never differ from `sale_date`, not writable: it leaves the insert and update grants). Keep `sales_delivery_needs_client` and `sales_date_not_future`.
4. **Grants**: `grant insert (tenant_id, sale_number, client_id, type, sale_date, order_id) on public.sales`; `grant update (client_id, type, sale_date, voided_at, version, updated_at)`; `order_id` is insertable (only `deliver_order` sets it) and never updatable.
5. **Replaced / new sale-side functions** (3.3.4): `app.on_hand_json` (status test removed), `app.sale_json` (status and deliveredDate out; `orderId`, `orderNumber` in), `app.list_sales_json` (no `p_status`, no uncapped branch), `app.sale_payload_hash` (no delivered date), `public.create_sale`, `public.update_sale`, `public.void_sale` (`create or replace`, same signature), `public.list_sales`, plus the triggers `sale_lines_linked_guard`, `sales_void_sync_order` and the extended `sales_write_guard` from 3.1.1.
6. **SQLSTATEs retired, never reused:** `TM034`, `TM039`, `TM041`, `TM042`. `TM035` was never used and stays unused. Highest in use before this feature: `TM043`.

#### 3.1.4 M20: functions (3.3 has every signature)

`app.order_json(p_tenant_id uuid, p_order_id uuid, p_with_deliveries boolean default false) returns jsonb`, `app.list_orders_json(...)`, `app.validate_order_lines(...)` (a thin wrapper that calls `app.validate_sale_lines`, so the line rules, `TM028` to `TM033`, stay literally the same), and the eight public functions. Grants as the sale functions: `revoke execute ... from public, anon; grant execute ... to authenticated`.

### 3.2 RLS and grants

Every new table: RLS enabled; `revoke all ... from anon, authenticated` first; `tenant_id = (select app.current_tenant_id())` in `using` and `with check`. No delete policy on `orders`, `order_counters`, `order_submissions` (no delete grant either: orders are never deleted, AC23).

| Table | Grants to `authenticated` | Policies |
|---|---|---|
| `order_counters` | `select`; `update (next_number, updated_at)` | select, update |
| `orders` | `select`; `insert (tenant_id, order_number, client_id, order_date, wanted_by, status)`; `update (client_id, order_date, wanted_by, status, cancelled_at, closed_short_at, version, updated_at)` | select, insert, update |
| `order_lines` | `select`; `insert (tenant_id, order_id, size_id, eggs, price_per_tray, line_total, dropped_eggs)`; `update (eggs, price_per_tray, line_total, dropped_eggs, updated_at)`; `delete` | select, insert, update, delete |
| `order_submissions` | `select`; `insert (tenant_id, id, order_id, payload_hash)` | select, insert |
| `sales` (changed) | as 3.1.3 step 4; **delete removed** | `sales_delete` dropped |

Not granted to owners, ever: `id`, `created_at`, an update of `order_number`, `converted_from_sale_number`, an update of `order_id`. Residual risk, accepted and unchanged from feature 04: an owner can hand-insert their own `order_number` (unique per farm, affects only their farm); `dropped_eggs` is cosmetic (read only on closed orders). `app.current_tenant_id()` is unchanged.

### 3.3 Database functions (the contract the repository calls)

Every public function: `security invoker`, `set search_path = ''`, takes `p_tenant_id uuid` **first** (the repository's `TenantDb.rpc` fills it; callers never pass it), starts with `perform app.assert_tenant(p_tenant_id)` (`TM006`), then `perform app.lock_tenant_sales(p_tenant_id)` for every write, then `select ... from orders ... for update` on the order it changes. One call = one transaction. No message or detail ever holds a name, phone or price.

#### 3.3.1 SQLSTATEs (continuing after `TM043`)

| Code | Meaning | HINT / DETAIL | API |
|---|---|---|---|
| `TM044` | the order isn't one of this farm's (foreign or unknown: same answer) | | 404 `not_found` |
| `TM045` | the order's `version` isn't the one the form opened with, and the request would change something | | 409 `conflict` `order_changed` + `order` |
| `TM046` | the order is closed to this change: cancelled, or fulfilled (`update_order`, `set_order_status`, `deliver_order`; and `order_lines_write_guard`) | hint `cancelled` / `fulfilled` / `closed_short` | 409 `order_closed` + `order` |
| `TM047` | `cancel_order`: the order has a non-voided delivery (also the guard's cancel backstop) | | 409 `has_delivery` + `order` |
| `TM048` | `close_order`: the order isn't partially fulfilled (also the guard's close-short backstop) | | 409 `not_partial` + `order` |
| `TM049` | `set_order_status`: the order is partially fulfilled (has a non-voided delivery) | | 409 `has_delivery` + `order` |
| `TM050` | `deliver_order`: a line exceeds what is remaining | | 409 `over_delivery` + `order` (its `lines[].remainingEggs` is the current remaining) |
| `TM051` | `update_order` (and the guards): breaks a delivery | hint `below_delivered` / `line_locked` / `client_locked`; DETAIL `{"sizeIds":[...]}` for the two line hints | 400 `validation_failed` on `lines.{sizeId}` or `clientId` |
| `TM052` | `deliver_order`: a size isn't a line of this order, or the delivery has no lines | hint `not_on_order` / `empty` | 409 `order_changed` + `order` / 400 on `lines` |
| `TM053` | a linked sale's client, type or lines changed (`update_sale`, guards) | | 409 `sale_locked` + `sale` |
| `TM054` | `orders_write_guard` refused an impossible state or transition (only a hand-built write reaches it) | | 500 `internal` |
| `TM055` | a date is earlier than the order date | hint `wanted_by` / `delivered_date` / `sale_date` / `order_date` | 400 `validation_failed` on that field |

**Reused with the same meaning:** `TM002` (date in the future; hint now includes `order_date`), `TM005` (malformed), `TM006` (tenant), `TM028` to `TM033` (lines and client, via `validate_order_lines` and `validate_sale_client`), `TM036` / `TM043` (sales), `TM037` (stock short: `deliver_order` raises it through the existing `app.check_sale_shortfall`), `TM038` (a submission id reused with another payload), `TM040` (`voided_at` one-way).

#### 3.3.2 Order functions (M20)

All return `jsonb`. `OrderJson` / `OrderDetailJson` are exactly the `Order` / `OrderDetail` shapes in `shared/types/api.ts` (camelCase, dates as `YYYY-MM-DD`, `closedShortAt` / `cancelledAt` as the UTC date of the timestamp).

```sql
public.create_order(p_tenant_id uuid, p_submission_id uuid, p_client_id uuid, p_order_date date,
                    p_size_ids uuid[], p_eggs integer[], p_prices numeric[], p_wanted_by date default null)
  returns jsonb  -- { order: OrderDetailJson, replayed: boolean }
```
1. Null checks (`TM005`). Lock. Hash with `app.order_payload_hash`.
2. **Replay first:** a row in `order_submissions` for `(tenant, p_submission_id)`: hash differs -> `TM038`; else return `{ order: order_json(first order, with deliveries), replayed: true }` and write nothing (a retry never fails for the order it just made).
3. `app.validate_order_lines(..., '{}')`; `app.validate_sale_client(tenant, 'delivery', p_client_id, null)` (a client is required and must be **active** for a new order: `TM032`); `p_order_date > today(utc) + 1` -> `TM002` hint `order_date`; `p_wanted_by < p_order_date` -> `TM055` hint `wanted_by`.
4. `order_counters` increment -> `order_number`; insert `orders` (`status = 'requested'`); insert lines with `line_total = app.sale_line_total(price, eggs, tenants.eggs_per_tray)` (the one price rounding function, AC14, AC51); insert the ledger row. Ordering touches no stock and calls no stock function (AC10).

```sql
public.update_order(p_tenant_id uuid, p_order_id uuid, p_version bigint, p_client_id uuid, p_order_date date,
                    p_size_ids uuid[], p_eggs integer[], p_prices numeric[], p_wanted_by date default null)
  returns jsonb  -- { order: OrderDetailJson, changed: boolean }
```
1. Null checks; lock; `select ... for update`; not found -> `TM044`; status `cancelled` or `fulfilled` -> `TM046` (AC19).
2. Read the current lines and the delivered eggs per size. `validate_order_lines` with `p_existing_size_ids` = the order's current size set (a kept, since-archived size is never refused, AC19); `validate_sale_client(.., 'delivery', p_client_id, current client)` (the order's own inactive client is accepted, a newly chosen one must be active); date rules (`TM002`, `TM055 wanted_by`); **and** `p_order_date` may not be after the earliest `sale_date` of a non-voided delivery (`TM055` hint `order_date`; pushback P3).
3. **Nothing to write:** if client, dates and the line set (size, eggs, price) equal what is stored, return `{ changed: false }` without checking the version (a retry whose reply was lost, or the same edit made elsewhere; no version bump, so an open detail isn't made stale by a no-op).
4. `p_version <> version` -> `TM045`.
5. **Delivery locks (only when delivered > 0), after the version check so they only fire for a hand-built request:** a different `p_client_id` -> `TM051 client_locked`; a size with delivered eggs missing from the new set -> `TM051 line_locked`; a delivered size with `p_eggs < delivered` -> `TM051 below_delivered` (DETAIL lists the offending size ids). The guard triggers re-check the same rules for any other write path.
6. Write: delete lines not in the new set; upsert the rest keeping a line's **frozen total** when eggs and price are unchanged (the `update_sale` pattern); then **one** `UPDATE orders SET client_id, order_date, wanted_by, version = version + 1, status = app.order_status_for(tenant, order)` (lines are already written, so an edit that lowers every line to its delivered amount makes the order `fulfilled` in the same statement, AC19; the guard validates the result).

```sql
public.set_order_status(p_tenant_id uuid, p_order_id uuid, p_status text) returns jsonb  -- { order, changed }
```
`p_status` not in (`requested`,`confirmed`,`ready`) -> `TM005`. Cancelled / fulfilled -> `TM046`; partially_fulfilled -> `TM049`. Same status -> `{ changed: false }` (repeatable, AC21). Else set status, `version + 1`. No version argument: a move among three harmless states is last-write-wins and idempotent (D8).

```sql
public.cancel_order(p_tenant_id uuid, p_order_id uuid) returns jsonb  -- { order, changed }
```
Already cancelled -> `{ changed: false }`. A non-voided delivery exists (status partially_fulfilled or fulfilled) -> `TM047`. Else `status = 'cancelled'`, `cancelled_at = now()`, `version + 1`. Voided deliveries do not block it (G1).

```sql
public.close_order(p_tenant_id uuid, p_order_id uuid, p_version bigint) returns jsonb  -- { order, changed }
```
Already closed short -> `{ changed: false }` (any version). Status not `partially_fulfilled` -> `TM048`. `p_version` stale -> `TM045` (a one-way action must be taken from the figures the owner saw). Else, per line, `dropped_eggs = greatest(eggs - delivered, 0)`; then `status = 'fulfilled'`, `closed_short_at = now()`, `version + 1`. Stock is untouched.

```sql
public.deliver_order(p_tenant_id uuid, p_submission_id uuid, p_order_id uuid, p_delivered_date date,
                     p_size_ids uuid[], p_eggs integer[], p_confirm_shortfall boolean default false)
  returns jsonb  -- { order: OrderDetailJson, sale: SaleJson, replayed: boolean }
```
1. Null / length checks (`TM005`); lock; hash `(order id, delivered date, lines sorted by size)`, **excluding** `p_confirm_shortfall` so "Deliver anyway" is the same request (the `create_sale` rule).
2. **Replay:** a `sale_submissions` row for `(tenant, p_submission_id)`: hash differs -> `TM038`; else return `{ order: order_json(current), sale: sale_json(first), replayed: true }` writing nothing (AC31).
3. Lock and read the order (`TM044`); `cancelled` / `fulfilled` -> `TM046`.
4. Dates: `p_delivered_date > today(utc) + 1` -> `TM002` hint `delivered_date`; `< order_date` -> `TM055` hint `delivered_date`.
5. Lines: at least one (`TM052 empty`); eggs 1 to 100,000 (`TM030`); no size twice (`TM029`); every size is a line of the order (`TM052 not_on_order`); **each line <= remaining** (ordered minus non-voided delivered) else `TM050` (AC26). A client that has become inactive and a size that has been archived are **not** checked (AC33).
6. **Stock:** `app.check_sale_shortfall(tenant, size_ids, eggs, p_confirm_shortfall)` (`TM037` + DETAIL, unless confirmed). Every delivery takes its full eggs.
7. Create the sale: `sale_counters` increment -> `sale_number`; `insert into sales (tenant_id, sale_number, client_id = order.client_id, type = 'delivery', sale_date = p_delivered_date, order_id)`; `set_config('app.order_delivery','on',true)`; insert `sale_lines` with `price_per_tray` = the **order line's** price and `line_total = app.sale_line_total(price, eggs, eggs_per_tray)` on the delivery's own eggs (so several deliveries of a line may differ from the order line's total by a centavo or two, AC51); `set_config(..., 'off', true)`; insert the `sale_submissions` ledger row.
8. `app.recompute_order_status(tenant, order)` (status + `version + 1`). Return the whole order (with deliveries), the sale and `replayed: false`.

```sql
public.get_order(p_tenant_id uuid, p_order_id uuid) returns jsonb   -- { order: OrderDetailJson | null }

public.list_orders(p_tenant_id uuid, p_view text default 'open', p_client_id uuid default null,
                   p_from date default null, p_to date default null, p_limit int default 25, p_offset int default 0)
  returns jsonb  -- { hasAny, total, orders: OrderJson[] }   (no deliveries array in the list)
```
`p_view in ('open','all','fulfilled','cancelled')` else `TM005`. `open` = status in (requested, confirmed, ready, partially_fulfilled); `fulfilled` includes closed short. **`open` ignores `p_limit` / `p_offset` entirely: every open order is returned (AC5)**; the other views page. The date range is on `order_date` (both ends inclusive). Sort: open = `wanted_by asc nulls last, order_date asc, order_number asc` (AC3); every other view = `order_date desc, order_number desc`. `hasAny` ignores every filter; `total` is the filtered count. Because it returns one jsonb value, PostgREST's `max_rows` (1000) does not truncate the Open view.

`order_json` cost: one correlated aggregate per order over `sale_lines` / `sales` by `sales_tenant_order_idx`; the Open set is the farm's live orders (tens), history is paged 25 at a time (AC49).

#### 3.3.3 Order JSON, line by line

`lines[]` per `order_lines` row (farm size order: `sizes.sort_order, name, id`): `orderedEggs = eggs`; `deliveredEggs` = `app.order_delivered_eggs`; `remainingEggs = 0` if cancelled, closed short, or `fulfilled`, else `greatest(eggs - delivered, 0)`; `droppedEggs = dropped_eggs`; `pricePerTray`; `lineTotal`. `orderTotal = sum(line_total)`. `deliveryCount` / `voidedDeliveryCount` count the order's linked sales without / with `voided_at`. `deliveries[]` (detail only) newest first: `{ saleId, saleNumber, deliveredDate (= sale_date), voidedAt, lines: [{ sizeId, eggs }] }`.

#### 3.3.4 Changes to the sale functions (M19)

```sql
public.create_sale(p_tenant_id uuid, p_submission_id uuid, p_type text, p_sale_date date,
                   p_size_ids uuid[], p_eggs integer[], p_prices numeric[],
                   p_client_id uuid default null, p_confirm_shortfall boolean default false) returns jsonb  -- { sale, replayed }
public.update_sale(p_tenant_id uuid, p_sale_id uuid, p_version bigint, p_type text, p_sale_date date,
                   p_size_ids uuid[], p_eggs integer[], p_prices numeric[],
                   p_client_id uuid default null, p_confirm_shortfall boolean default false) returns jsonb  -- { sale, changed }
public.void_sale(p_tenant_id uuid, p_sale_id uuid, p_version bigint) returns jsonb   -- { sale, changed, order: OrderDetailJson | null }
public.list_sales(p_tenant_id uuid, p_from date default null, p_to date default null, p_type text default null,
                  p_client_id uuid default null, p_limit int default 25, p_offset int default 0,
                  p_include_voided boolean default false) returns jsonb
```
- `create_sale`: no `p_delivered_date`, no status. `sale_date` and the generated `delivered_date` are the one date (AC38, D3). `app.check_sale_shortfall` runs for **every** new sale (every sale takes stock now). `order_id` is never set here. `validate_sale_client` rules by `type` are unchanged. The hash drops the delivered date.
- `update_sale`: loses `p_delivered_date`. The shortfall delta is simply new eggs minus old eggs per size (both sides always count): a type change moves no stock and never asks (AC42). **Linked sale (`order_id is not null`):** client, type and the line set (size, eggs, price) must equal what is stored, else `TM053` (AC36); only `sale_date` may change, and then it must be `>= order.order_date` (`TM055` hint `sale_date`) and not in the future (`TM002`); on a real change it bumps `sales.version` **and** the order's `version` (the order's delivery list shows that date). No shortfall check for a linked edit (nothing about stock changes). A voided sale still gives `TM043`.
- `void_sale`: the `TM042` "not complete" check disappears (every sale is complete). Sets `voided_at`, `version + 1`; the `sales_void_sync_order` trigger recomputes the linked order in the same statement. The response adds `order` (the recomputed detail, or null for a direct sale) so the UI updates the order without a second call. Idempotent regardless of version once voided, as today.
- `get_sale`, `get_on_hand`, `app.check_sale_shortfall`, `app.sale_line_total`, `app.validate_sale_lines`, `app.validate_sale_client` are unchanged. `app.on_hand_json` loses `s.status = 'complete'`: good production minus the eggs of **non-voided** sales, by size; orders appear nowhere in it (AC10, AC41).
- `app.sale_json` returns `{ id, saleNumber, type, clientId, saleDate, orderId, orderNumber, version, voidedAt, lines, saleTotal }`: no `status`, no `deliveredDate`.

### 3.4 Server API

Conventions as features 03/04: every route is `defineTenantHandler`; the request never carries `tenant_id`; inputs go through zod (`validateInput`); one repository, `server/repositories/orders.ts`, mirrors `sales.ts` (zod-validated jsonb, `toOrder` mapper, `mapOrderDbError(db, error, operation, orderId)`, log line `[orders] <scope> <SQLSTATE>` only). Responses are `Cache-Control: private, no-store` from the wrapper. Quantities are eggs. Client names never appear anywhere server-side: only `clientId`.

| Method + path | File (under `server/api/orders/`) | Request | 200 response | Errors |
|---|---|---|---|---|
| GET `/api/orders` | `index.get.ts` | query `view`, `clientId`, `from`, `to`, `limit`, `offset` | `OrdersListResponse` | 400 (dates, view), 401, 403, 500 |
| POST `/api/orders` | `index.post.ts` | `CreateOrderRequest` | `CreateOrderResponse` | 400 `validation_failed`, 401, 403, 500 |
| GET `/api/orders/:id` | `[id].get.ts` | | `OrderResponse` | 404 |
| PUT `/api/orders/:id` | `[id].put.ts` | `UpdateOrderRequest` | `OrderChangeResponse` | 400, 404, 409 `order_changed` / `order_closed` |
| POST `/api/orders/:id/status` | `[id]/status.post.ts` | `SetOrderStatusRequest` | `OrderChangeResponse` | 404, 409 `order_closed` / `has_delivery` |
| POST `/api/orders/:id/cancel` | `[id]/cancel.post.ts` | (no body) | `OrderChangeResponse` | 404, 409 `has_delivery` |
| POST `/api/orders/:id/close` | `[id]/close.post.ts` | `CloseOrderRequest` | `OrderChangeResponse` | 404, 409 `not_partial` / `order_changed` |
| POST `/api/orders/:id/deliver` | `[id]/deliver.post.ts` | `DeliverOrderRequest` | `DeliverOrderResponse` | 400, 404, 409 `stock_short` (+ `shortfall`) / `over_delivery` / `order_closed` / `order_changed` |

All types are already in `shared/types/api.ts` (stub). Error `reason`s and the payload each carries:

| reason | HTTP | Carries | When |
|---|---|---|---|
| `order_changed` | 409 | `order` | stale version (`TM045`), or a size no longer on the order (`TM052 not_on_order`) |
| `order_closed` | 409 | `order` | cancelled / fulfilled / closed short (`TM046`) |
| `has_delivery` | 409 | `order` | cancel or manual status on an order with a non-voided delivery (`TM047`, `TM049`) |
| `not_partial` | 409 | `order` | close short on any other status (`TM048`) |
| `over_delivery` | 409 | `order` | `TM050` |
| `stock_short` | 409 | `shortfall` | `TM037` from deliver (existing reason) |
| `sale_locked` | 409 | `sale` | `TM053` on `PUT /api/sales/:id` |
| `voided` | 409 | `sale` | existing (`TM043`) |

`validation_failed` field keys (`ORDER_FIELDS` in `shared/constants/orders.ts`): `clientId`, `orderDate`, `wantedBy`, `lines` and `lines.{sizeId}`, `deliveredDate`, `submissionId`, `version`, `status`, `id`. Messages come from `ORDER_MESSAGES` (the §2.5 Copy table), never contain a typed value, a name or a price.

**Routes to remove** (and their tests): `server/api/sales/[id].delete.ts`, `server/api/sales/[id]/mark-delivered.post.ts`, `server/api/sales/[id]/mark-pending.post.ts`. **Routes to change:** `GET /api/sales` (drop the `status` query param; zod strips an unknown one), `POST` / `PUT /api/sales` (drop `deliveredDate`; stripped if sent), `PUT /api/sales/:id` (new 409 `sale_locked`), `POST /api/sales/:id/void` (response gains `order`). `GET /api/sales/on-hand` is unchanged (the Deliver step reads it).

**Shared types to change (task B8, types and schemas first so F7 can start):** `Sale` loses `status` and `deliveredDate` and gains `orderId: string | null`, `orderNumber: number | null`; remove `SaleStatus`, `MarkSaleDeliveredRequest`, `DeleteSaleResponse`; `CreateSaleRequest` / `UpdateSaleRequest` lose `deliveredDate`; `VoidSaleResponse` becomes `{ sale, changed, order: OrderDetail | null }`; `ApiErrorReason` drops `not_pending` and `not_complete`.

**Shared schemas / constants (task B0):** `shared/constants/orders.ts` (`ORDER_FIELDS`, `ORDER_MESSAGES`, `MAX_ORDER_LINES = MAX_SALE_LINES`, `MAX_EGGS_PER_ORDER_LINE = MAX_EGGS_PER_SALE_LINE`, `ORDERS_PAGE_SIZE = 25`), `shared/schemas/orders.ts` (`createOrderBodySchema`, `updateOrderBodySchema`, `setOrderStatusBodySchema`, `closeOrderBodySchema`, `deliverOrderBodySchema`, `orderIdParamsSchema`, `ordersQuerySchema`; line rules reuse `checkPriceNumber` and the same bounds as sales, with order messages), `shared/utils/order-status.ts` (below). The date rule in zod is the same UTC + 1 slack as the sales schema; the exact local-today check is the form's. `wantedBy >= orderDate` is checked in zod and again in the database.

### 3.5 Frontend

All screens follow §2.5 and the design language; where a Figma frame and §2.5 differ the frame wins on pixels (§2.5 header). Confirm Nuxt UI v4 component APIs in the docs before building (`UModal`, `USlideover`, `UDropdownMenu`, `UBadge`, `UProgress`, `UAlert`, `UButton`, `USelectMenu`, `UInput`).

**Shared helpers (frontend and backend both import these; parity-tested)**
- `shared/utils/order-status.ts`: `ORDER_STATUS_LABEL`, `isOpenStatus(status)`, `orderStatusLabel(order)` (adds "(closed short)"), `orderActions(order) -> { deliver, edit, status: OrderManualStatus[], cancel, closeShort }` (the single source for AC8/AC21: no template decides this by itself), `orderEditRules(order) -> { clientLocked, minEggs: Record<sizeId, number>, lockedSizes: Set<string>, willFulfil(lines) }` (AC19), `orderAfterVoid(order, saleId) -> { status, owed: {sizeId, eggs}[], stays: 'closed_short' | null }` (the Void dialog preview, a pure twin of `app.order_status_for`; D9), `deliverableLines(order)`.
- `shared/utils/order-progress.ts`: `formatProgress(deliveredEggs, orderedEggs, eggsPerTray)` implementing O-R4 (`20 of 30 trays`, else both sides through `formatQty`). Everything else uses the existing `formatQty` / `formatPrice` / `computeLineTotal`. Tray size always from the farm; never a literal.

**Navigation (AC1, Q2)**
- `app/utils/nav.ts`: `AppNavKey` gains `orders`; `APP_NAV` order = Dashboard, Production, Orders, Sales, Inventory, Clients (icon `i-lucide-clipboard-list`, title Orders, subtitle "What customers are waiting for"). `AppNavItem` gains `tabLabel?: string` (Dashboard -> `Home` on the phone bar only; sidebar and page title stay Dashboard, F1) and `mobile: 'tab' | 'more'` (Inventory, Clients = `more`). Export `MORE_ITEMS`, `MOBILE_TABS`, and `isMoreActive(path)` (true for any path under Inventory or Clients; flow M).
- `AppBottomTabs.vue`: `grid-cols-5`: the four `tab` links plus a **More `<button>`** (not a link: `aria-haspopup="dialog"`, `aria-expanded`, no `aria-current`; name `More, current: Clients` when on one). `AppMoreSheet.vue` (new): bottom sheet in the existing `sheetUi` look, title More, two 56px rows with `aria-current="page"` + check + "Current" on the active row; closes on navigation; open state lives in `default.vue` so route changes close it. The sidebar lists all six.

**Pages / components / composables (new)**

| File | Role |
|---|---|
| `app/pages/orders.vue` | `definePageMeta({ primaryAction: { label: 'Add order', ariaLabel: 'Add order', icon: 'i-lucide-plus', fab: true } })`. Fetches **after mount** (client names are personal: not in the SSR payload, AC53). Page-local filter refs (never the router), reset on a fresh visit. Hosts the New/Edit overlay and the Deliver, Cancel and Close-short dialogs. |
| `OrdersToolbar.vue`, `OrdersList.vue` | chips Open / All / Fulfilled / Cancelled, client select, date range, count line; cards on phones, table at >= 720px list width (as Sales). |
| `OrderStatusBadge.vue`, `OrderProgress.vue` | text badge (O-R5); per-line decorative bar (`aria-hidden`) + `formatProgress` text (O-R6). |
| `OrderRowMenu.vue` | `UDropdownMenu`, items from `orderActions()`. |
| `OrderDetail.vue` | content of the detail overlay (bottom sheet / 480px `USlideover`), with `OrderStatusControl.vue` (radio group Requested / Confirmed / Ready) and `OrderDeliveriesList.vue`. |
| `OrderForm.vue`, `OrderFormOverlay.vue` | New and Edit; reuses `ClientPicker.vue`, `SizeChipPicker.vue`, `QuantityInput.vue`, `ConfirmDiscardDialog.vue`, and `SaleLineCard.vue` with its on-hand hint turned off by a prop plus `minEggs` / `lockedSize` props (do not fork the line card). |
| `DeliverOrderDialog.vue` | the one-step Deliver. Replaces `MarkDeliveredDialog.vue`. The stock panel is **inline** (AC30), not `StockShortfallDialog`. |
| `CancelOrderDialog.vue`, `CloseShortDialog.vue` | centred confirms (Keep order / Keep open focused). |
| `FromOrderLink.vue` | the "From order #12" pill on Sales cards and detail. |
| `AppMoreSheet.vue` | above. |
| `app/composables/useOrders.ts` | like `useSales`: page-local filters; `Open` loads everything (no paging), other views page 25 with Show more; `patchOrder(order)` replaces a row in place; state in `useState` keyed by farm id, cleared by `useMe().clear()` on sign-out (AC55). |
| `app/composables/useOrderMutations.ts` + `app/utils/order-mutations.ts` | pure handlers injected with deps (as `sale-mutations.ts`): create, update, setStatus, cancel, close, deliver. Each patches the list, refreshes `useOnHand` for touched sizes, and for deliver also refreshes the Sales list. One `submissionId` per form / Deliver-step opening, reused on retry. |
| `app/composables/useDetailStack.ts` | in-memory stack `[{ kind: 'order' \| 'sale', id, readonly }]`, depth <= 2 (D3, D10); never in the URL; cleared on sign-out and route change. |
| `app/utils/order-copy.ts`, `order-errors.ts`, `order-validation.ts` | §2.5 Copy, reason -> message maps, form checks. Server messages come from `shared/constants/orders.ts` so form and API cannot drift (the feature-04 S2 lesson). |

**Behaviours the dev must get right**
- **Deliver step:** lines pre-filled with `remainingEggs`; the plus stepper stops at remaining; typing above shows `Only {n} left to deliver.`; the date is `min = orderDate`, `max = today`. Shortfall is computed client-side from the `useOnHand` cache for the panel and the "Deliver anyway" label; the server is authoritative: a `409 stock_short` flips the same step to the panel (values and submission id kept) and the next tap sends `confirmShortfall: true`. A `409 over_delivery` replaces the lines with `error.data.order`'s remaining and shows "Part of this order was delivered somewhere else." A `409 order_closed` / `order_changed` closes the step and shows the persistent stale toast.
- **Edit form:** driven by `orderEditRules(order)`. Client locked after a delivery; a delivered line shows its size read-only with `At least {n} delivered`; the live note "Everything ordered has been delivered, so this order will be marked Fulfilled." uses `willFulfil`. The existing inactive client / archived size stay selected and valid. Save with nothing changed closes with no request.
- **Void dialog (Sales):** when the sale has an `orderId`, fetch `GET /api/orders/:id` on open and show the preview from `orderAfterVoid()`; the void response's `order` is patched into `useOrders` so the Orders list is right when the owner returns.
- **Stacked overlays (D3, D10):** the order detail's delivery row and Sales' "From order" pill call `useDetailStack().open(...)`. A detail opened **from the other screen is read-only** (no footer actions; one "Open in Orders" / "Open in Sales" link that navigates and opens it there). The actions (Edit, Void, Deliver, ...) stay on their own screen, so no form or dialog has to be hosted globally. This deviates from a literal reading of flow H and needs UX / owner confirmation (3.10, U2).
- **After success:** New order closes, toast `Order #12 saved`, the card is highlighted, filters reset to Open if they would hide it (AC16). Rows that leave the Open view (cancel, close, fulfil) go with a toast saying why.

**Stripped from the Sales UI (AC37 to AC42)**
- Delete: `SaleStatusBadge.vue`, `MarkDeliveredDialog.vue`; rename `SaleRemovalDialog.vue` -> `SaleVoidDialog.vue` (void only; adds the order preview line).
- `SaleForm.vue`: remove "Already delivered", the delivered-date field and all status derivation; one **Sale date** (hint `Today`); the shortfall dialog now applies to every new direct sale (`selling` / `delivering` verb as today); linked-sale mode: read-only type / client / lines with the lock note, only the date editable (min = order date, max = today).
- `SalesToolbar.vue` (Status chips out; Type chips, dates, client, Show voided stay), `SalesList.vue` (no badge; "From order #n" pill; no "pending" words in empty / no-match states), `SaleRowMenu.vue` (Edit, Void), `SaleDetail.vue` (Type, From order, Voided badges; no Mark delivered / pending / Delete; no "Your stock hasn't changed yet"), `useSales.ts` (no `status` filter, no uncapped-pending branch), `sale-copy.ts`, `sale-errors.ts` (drop `not_pending`, `not_complete`, delivered messages; add `sale_locked`), `sale-mutations.ts` (drop markDelivered / markPending / delete; void patches the order store), `sale-validation.ts` (no delivered date), `shared/constants/sales.ts` and `shared/schemas/sales.ts` (drop the delivered-date messages / schema / `status` query).
- The Sales subtitle "Deliveries and on-site sales" stays.

### 3.6 Invariants at risk

| CLAUDE.md rule | How this design protects it |
|---|---|
| Tenancy: shared tables, `tenant_id`, RLS, server derives tenant | Four new tables have `tenant_id`, `updated_at`, RLS, column-level grants. Every route is `defineTenantHandler`; the request never has a tenant; functions assert `p_tenant_id` (`TM006`). All FKs are composite `(tenant_id, x)`: an order can never point at another farm's client or size, a sale never at another farm's order. |
| Multi-row writes are `security invoker` functions via `TenantDb.rpc` | All eight order functions and the three changed sale functions are. Nothing is `security definer`. |
| Service-role key not used at runtime; guard test wraps every route | Unchanged. New route files are added to the guard test's list; a new guard asserts no `*.delete.ts` exists under `server/api/sales` or `server/api/orders` (AC23, AC40). |
| Stored unit is eggs; trays only at input / display | `eggs` everywhere; no tray column. Tray size is read from `tenants.eggs_per_tray` inside the functions (`line_total`), never hardcoded; `formatProgress` takes it as a parameter. |
| Sizes are rows, never columns; same-farm composite FK | `order_lines.size_id` with a `(tenant_id, size_id)` FK; sizes are never hardcoded in any new file. Archived sizes stay valid on existing order lines (the `validate_sale_lines` existing-set rule). |
| Inventory is computed, never stored; one `on_hand_json` | `on_hand_json` is simplified, not duplicated. **Orders appear in no stock figure** (AC10, AC41): no reservation column, no function reads `orders` for stock. Delivered-so-far / remaining come from one function (`order_delivered_eggs`); the only stored derived value is `dropped_eggs` (D5). Dashboard / Inventory "for delivery" later read `orders` + that function. |
| Sales = header + lines, sale numbers sequential, never reused | Structure untouched. Retired pending numbers stay retired because `sale_counters` only moves forward (M18 does not touch it). A delivery takes the next number like any sale. |
| Sale `status` is `pending` or `complete`; mark-delivered asks the date; pending deletable | **Superseded by this feature (owner decision).** `sales.status` is gone. The Deliver step asks for the date every time (`deliver_order.p_delivered_date`). A sale of any kind can only be edited or voided. CLAUDE.md must change (3.10). |
| Complete sale can never be deleted; voided keeps row and number | Now true for **every** sale, enforced by the missing grant, missing policy, missing function and missing route. `voided_at` stays one-way (`TM040`). |
| Price snapshot; a line total never recomputes | A delivery freezes the order line's price and its own rounded total at delivery time (AC51). `update_order` keeps a line's total frozen while eggs and price are unchanged. Converted lines are copied byte for byte (M18). |
| Null values carry meaning | `delivered_date` no longer means pending (it is a generated copy of `sale_date`); `client_id` null still means an on-site sale; `orders.wanted_by` null = none; `size_id` null only on production rejects. An order's `client_id` is never null. |
| One status field; a second only for payment tracking | `orders.status` is the only status. `cancelled_at` / `closed_short_at` are one-way flags like `voided_at`, not a second axis. |
| Clients never deleted; inactive stays valid | Orders FK to clients with no cascade; an inactive client stays on its orders and deliveries (AC33). New orders require an active client; existing ones keep theirs. |
| Personal data: not in logs, URLs, SSR, `/api/me` | Orders carry `clientId` only. The repository logs `[orders] <scope> <SQLSTATE>` only (a privacy spec mirrors `sales-privacy.spec.ts`). Order lists load after mount; overlay state is in memory, never in the URL; stores are keyed by farm and cleared on sign-out. |
| Serverless: short handlers, no long-lived pool | Each route is one rpc call. The Open list is the only unbounded read; see risk R2. |

### 3.7 Tests

**pgTAP (`bun run test:db`)**
- New `080_orders.test.sql` (after `070_sales`, before `090`): numbering (first = 1, per farm, never reused, replay = same number); `create_order` validation (every `TM0xx` above, inactive client, archived size, future date, `wanted_by` before the date, 0 / 21 lines, duplicate size); ledger replay and `TM038`; **no stock effect** (`on_hand_json` before / after create, edit, status moves, cancel); the full status machine from the 3.0 table, including each refusal; `set_order_status` idempotence; `cancel_order` (ok, repeat, refused after a delivery, **allowed again after the only delivery is voided**); `close_order` (drops per size, refuses others, stale version, idempotent, dropped stays after a later void); `deliver_order` (partial then rest, `TM050` including a simulated second delivery, cap exactly at remaining, `TM037` + `p_confirm_shortfall`, replay returns the first sale, `TM038`, date rules, inactive client and archived size still deliver, sale has the order's price and its own rounded total, sale number is the next one, stock drops once per line, **two deliveries of a line may differ from the order line total by a centavo**); `update_order` (free edit before delivery; after delivery: client locked, line floor, locked line removal, unlocked line edit, becomes fulfilled by itself, order date vs earliest delivery, stale `TM045`, unchanged = `changed: false` with no version bump, frozen totals); `void_sale` of a linked sale (partial -> partial, partial -> **ready** when the last goes, fulfilled -> partial / ready, closed short stays and `droppedEggs` unchanged, order version bumps, direct sale returns `order: null`); a **hand-built** `update sales set voided_at` also fixes the order (trigger); `update_sale` on a linked sale (`TM053` for client / type / line changes, date ok within bounds, `TM055` before the order date, order version bumps) and on a direct sale (a type change moves no stock and never warns); `list_orders` (Open uncapped with 60 orders and `p_limit = 5`, sort per AC3, other views paged and sorted, client and date filters combine, `hasAny` vs `total`, closed short under `fulfilled`); `get_order` deliveries incl. voided; guards by hand-built writes: `insert into sale_lines` on a linked sale, `update orders set status = 'fulfilled'` on an undelivered order, `delete from order_lines` of a delivered line, `update order_lines set eggs` below delivered, `update orders set client_id` after a delivery, edits to cancelled / fulfilled orders, `rpc/set_config` unreachable from `authenticated`; grants (no `delete` on `orders` / `order_counters` / `order_submissions` / **`sales`**, column lists as 3.2, `order_id` not updatable); anon cannot execute any function.
- **Updated** `070_sales.test.sql`: remove every pending / mark-delivered / mark-pending / delete case; the AC25 on-hand example without a pending sale (600 produced, one sale of 240 -> 360; void -> 600); the shortfall applies to **every** `create_sale`; `delivered_date` is generated (an insert naming it fails); a type change case without stock movement.
- **Updated** `000_helpers.sql` registry: add `orders`, `order_lines`, `order_counters`, `order_submissions` rows (seed + attack inserts; the `orders` seed needs a client, `order_lines` an order and a size); change the `sales` seed to a normal row (`status` gone) and drop the "seeded pending so delete probes pass" comment. **`020_tenant_isolation`**: extend with orders in both directions, reads and writes: every order function with the other farm's tenant id (`TM006`) and with the other farm's order id (`TM044`), `deliver_order` naming the other farm's order / size, `create_order` naming the other farm's client (`TM032`) and size (`TM033`), a direct insert of a `sales` row with the other farm's `order_id` (FK failure), direct insert / update / delete of the other farm's `orders` / `order_lines` (0 rows or `42501`), `get_order` of a foreign id returns `{ order: null }`, anon denied; remove the pending / mark / delete cases. **`010_rls_coverage`**: adjust the plan count; assert no delete privilege on the three order tables and on `sales`. **`090_isolation_detects_breach`**: new mutants for `orders_insert` / `orders_update` / `order_lines_insert` weakened to `with check (true)`; fix m21 / m22's insert text (no `status`).
- **Migration test (new, outside pgTAP because it needs the old schema):** `bun run test:migration` = a script that (1) runs `supabase db reset --local --version 20260927065131` (applies only up to M16; confirmed in the CLI reference), (2) seeds through `supabase db query --local -f` (check `--help`; CLI >= 2.79): farm A with 3 pending sales (one whose client is made inactive, one with an archived size, one with 2 lines), 2 complete sales, 1 voided sale; farm B with 1 pending; farm C with none; records `on_hand_json` and the complete-sale rows, (3) `supabase migration up --local` (M17 to M20), (4) asserts: order counts, numbers 1..n in old sale-number order, `converted_from_sale_number`, status `confirmed`, lines / prices / totals identical, client and size still resolve, no pending sale remains, `sale_counters` unchanged and the next `create_sale` gets a never-used number, `order_counters` correct, farm C has none, complete and voided sales unchanged, `on_hand_json` identical; (5) re-executes the M18 file and asserts nothing changed (idempotent). The same script is the manual QA recipe for AC43 to AC46.

**Unit (`bun run test:unit`)**
- New: `order-schemas.spec` (every bound, 20 lines, duplicate size, dates, `wantedBy`, unknown keys stripped incl. `tenantId` / `orderNumber` / `status`), `orders-constants.spec`, `orders-repo.spec` (every SQLSTATE -> API error, no `.message` read, `.details` only for TM037 and TM051), `orders-privacy.spec` (mirror of `sales-privacy.spec.ts`: one fixed `[orders] ...` log line, no client name or phone, order files listed), `order-errors.spec`, `order-mutations.spec` (in-flight, retry with the same submission id, conflicts patch the store), `order-status.spec` (`orderActions` for each status x delivered state; `orderAfterVoid`; `orderEditRules`) with a **shared fixture table also asserted in pgTAP** so the TS twin and `app.order_status_for` cannot drift, `order-progress.spec` (`20 of 30 trays`, `8 trays + 1 of 12 trays`, `0 of 5 eggs`, a 24-egg tray), `nav.spec` (six items, four tabs + More, `isMoreActive`), `order-message-parity.spec` (form copy equals the API constants).
- Updated: `server-guards.spec.ts` (the route list: add the eight order routes, remove the three sales routes; new guard: no `.delete.ts` under `sales` or `orders`), `sales-privacy.spec.ts` (file lists: drop `MarkDeliveredDialog`, `SaleStatusBadge` and the removed route files), and `sales-schemas`, `sales-repo`, `sales-constants`, `sale-errors`, `sale-mutations`, `sale-message-parity`, `sale-validation`, `sale-price` wherever they mention status, delivered date, pending, delete or mark.

**Manual QA recipe** (the plan's walk-through): create order -> confirm -> ready -> deliver part -> deliver the rest; separately close short; separately void a delivery (G1); a direct sale and a void still work; each sale's stock drop; "From order" links both ways; the 24-egg tray farm; a farm with 5,000 seeded orders for AC49.

### 3.8 Tasks

Dependencies are in brackets. **B0 first**: it fixes the contract. FE starts when B0 is merged and works against the types and fixtures until the routes land.

**Contract (blocks the FE)**
- [x] **B0 [BE]** Finish the orders contract (the `Sale` changes wait for B8): write `shared/constants/orders.ts`, `shared/schemas/orders.ts` (+ `order-schemas.spec`, `orders-constants.spec`), `shared/utils/order-status.ts` (+ `order-status.spec`), `shared/utils/order-progress.ts` (+ spec). The order types already exist (stub).

**Database [BE] (sequential: each file builds on the last)**
- [x] **B1 [BE]** M17 `orders` migration: tables, indexes, `sales.order_id`, helpers, order-side guard triggers, grants + RLS. [B0]
- [x] **B2 [BE]** M18 conversion migration with its post-condition assertions. [B1]
- [x] **B3 [BE]** M19 `sales_drop_pending`: 3.1.3, replaced sale functions, sale-side triggers, grants. [B2]
- [x] **B4 [BE]** M20 order functions: `order_json`, `list_orders_json`, eight public functions, grants. [B3]
- [x] **B5 [BE]** `bun run db:reset`, then `bun run db:types` (regenerates `shared/types/database.types.ts`; `TenantRpc` is derived from it). [B4]
- [x] **B6 [BE]** pgTAP: `080_orders.test.sql`; update `000`, `010`, `020`, `070`, `090` (3.7). [B4; can start per migration]
- [x] **B7 [BE]** `test:migration` script, seed and assert SQL (3.7). [B2, B4]

**Server [BE]**
- [x] **B8 [BE]** Sales contract and server changes (commit the `Sale` type, schema and constants changes first so F7 can start): repository (drop mark-delivered / mark-pending / delete, `orderId` / `orderNumber`, `sale_locked`, void returns `order`), delete the three routes, drop `status` / `deliveredDate` from schemas, constants and types; update the sales unit specs. [B5]
- [x] **B9 [BE]** `server/repositories/orders.ts` (zod JSON schemas, `toOrder`, `mapOrderDbError`, fixed `[orders]` log line) and `orders-repo.spec`. [B5]
- [x] **B10 [BE]** The eight `server/api/orders/**` routes. [B9]
- [x] **B11 [BE]** `server-guards.spec.ts` route list + the no-delete-route guard; `orders-privacy.spec.ts`; update `sales-privacy.spec.ts`. [B10]

**Frontend [FE] (parallel with B1 to B11 after B0)**
- [x] **F1 [FE]** Nav: `nav.ts` (six items, `tabLabel`, `mobile`, `isMoreActive`), `AppBottomTabs` (4 tabs + More button), `AppMoreSheet`, sidebar of six, `nav.spec`. [B0]
- [x] **F2 [FE]** `app/pages/orders.vue` + `useOrders` + `OrdersToolbar`, `OrdersList`, `OrderStatusBadge`, `OrderProgress`, `OrderRowMenu`, empty / loading / error states, against fixtures. [B0]
- [x] **F3 [FE]** `OrderDetail` overlay (+ `OrderStatusControl`, `OrderDeliveriesList`), `useDetailStack`. [F2]
- [x] **F4 [FE]** `OrderForm` / `OrderFormOverlay` (New + Edit with `orderEditRules`), `SaleLineCard` props for no-hint / min / locked, `order-validation`, `order-copy`. [B0]
- [x] **F5 [FE]** `useOrderMutations` + `order-mutations.ts` + `order-errors.ts` and their specs; wire create / update / status. [F4; integration needs B10]
- [x] **F6 [FE]** `DeliverOrderDialog` (inline stock panel, over-delivery refresh, same submission id on retry), `CancelOrderDialog`, `CloseShortDialog`. [F5]
- [x] **F7 [FE]** Sales strip-down (3.5 list), `SaleVoidDialog` with the order preview, `FromOrderLink`, linked-sale edit mode, void patches the order store. [B8 types; integration needs B8]
- [ ] **F8 [FE]** Integration pass against the real routes: the manual QA recipe, mobile 375px and desktop, light / dark, a 20-line order, the 24-egg farm. [B10, F6, F7]

**DevOps [DEVOPS]**
- [x] **D1 [DEVOPS]** Add `"test:migration"` to `package.json` and the script from B7; document it in `README.md` next to `test:db`. Keep it out of plain `bun run test` unless the local stack is up (it resets the DB). [B7]
- [ ] **D2 [DEVOPS]** Deploy note in the README: apply M17 to M20 to the hosted project **before** deploying the new app build, back up first, and deploy the app immediately after (the old build calls functions M19 drops). No CI exists yet; if it is added, run `db:reset`, `test:db`, `test:migration`, `typecheck`, `lint`, `test:unit`. [B4]

Then **QA** (qa-reviewer, per CLAUDE.md), then **security-auditor** (a new PII table, new RLS, new triggers and the linked-sale guard flag are exactly what it is for).

### 3.9 Decisions

| # | Decision | Rejected alternatives | Why |
|---|---|---|---|
| D1 | Orders are their own tables (`orders` + `order_lines`); a delivery is a normal sale linked by `sales.order_id` (non-unique). | One `sales` table with an order status; one order <-> one sale. | Owner decision. Keeps `sales` always-real, makes on-hand simple, and many sales per order falls out of a plain FK. |
| D2 | Delivered-so-far / remaining are computed (`app.order_delivered_eggs`), never stored. | A `delivered_eggs` column kept in step by functions. | AC32; one source of truth; the void trigger can't drift. |
| D3 | Sales keep **one date**: `sale_date` is the day the eggs left; `delivered_date` becomes a `generated always as (sale_date) stored` column. | Keep two editable dates; drop `delivered_date` now; plain `not null` + an equality CHECK. | AC "one date" and the brief (`delivered_date not null`). A generated column can't drift, needs no writer, and leaves any code that may read it untouched. Dropping the column is a clean follow-up. |
| D4 | Status is guarded in the database: `orders_write_guard` checks the new status against the deliveries; the sales void trigger recomputes the order. | Trust the functions (the plan's approach). | AC50 says a hand-built request can't store an invalid state, and the owner's JWT can reach `orders` directly. It is the project's established pattern (TM028, TM040). Costs three small triggers and a status-vs-deliveries query on each order update. |
| D5 | `order_lines.dropped_eggs` is stored once at Close short. | Compute dropped as ordered - delivered. | AC35: "the dropped amount is unchanged" when a delivery is voided later; a computed value would grow. It is a recorded decision, not running progress, so it doesn't break the "never store progress" rule. |
| D6 | `deliver_order` reuses `sale_submissions` as its ledger; `create_order` gets `order_submissions`. | A third ledger; deliver without idempotency. | The delivery *is* a sale and the ledger already maps submission -> sale. The payload hash includes the order id so a collision across kinds is `TM038`. |
| D7 | One per-farm lock (`app.lock_tenant_sales`) for sales and orders; lock order is advisory lock, then the order row. | A separate order lock. | `deliver_order` needs sale numbers, the cap and the stock check serialised together; two locks invite deadlocks. Farm write volume is tiny. |
| D8 | `set_order_status` and `cancel_order` take **no** version; `close_order` and `update_order` do. | Version on all. | Status moves are idempotent last-write-wins among harmless states and cancel is guarded by its own precondition. Close short is one-way and irreversible, and Edit replaces whole records, so both must act on what the owner saw. |
| D9 | The Void dialog's "what will happen" is a pure shared helper (`orderAfterVoid`) over the already-loaded order, parity-tested against `app.order_status_for`. | A server preview endpoint. | No extra route or round trip; one fixture table runs in both pgTAP and Vitest. |
| D10 | A detail overlay opened from the *other* screen is read-only with an "Open in ..." link. | Host all order and sale forms and dialogs globally so everything works everywhere. | Avoids mounting every form in the layout. Deviates from a literal flow H; needs UX / owner OK (U2). |
| D11 | Reuse `validate_sale_lines`, `validate_sale_client`, `check_sale_shortfall`, `sale_line_total` and `TM028` to `TM033` for orders. | Order-specific copies and codes. | One rule, one place, one set of messages. The order wrappers only keep call sites readable. |
| D12 | New SQLSTATEs `TM044` to `TM055`; `TM034`, `TM039`, `TM041`, `TM042` retired and never reused; `TM035` stays a gap. Highest previously used: `TM043` (verified by searching `supabase/`, `server/`, `shared/`, `app/`, `tests/`). | Reuse retired codes. | A code once shipped keeps one meaning forever. |
| D13 | The Open view returns every open order in one jsonb value (no cap, no paging); history is paged 25. | One paged list with a priority sort. | AC5. See risk R2 for the ceiling. |
| D14 | Pickup / on-site orders do not exist (Q4); an order is always a delivery to a client; `sales_order_is_delivery` enforces it for linked sales. | A `type` on orders. | Q4 default; a type column can be added later without touching existing rows. |

### 3.10 Open questions, pushback and decisions for the user

**RESOLVED (owner, 2026-10-03):** U1 = rewrite `sale_date` to `delivered_date`; U2 = cross-screen overlays are read-only with an "Open in Orders/Sales" link; U3 = keep `delivered_date` as a generated column and drop it in a later cleanup; P3 = **yes, block**: the order date can't be moved later than the earliest non-voided delivery's date (new AC57 below; backend/UX add the error message "Order date can't be after its first delivery ({date})"). P4 = follow AC22/G1: Cancel is hidden only while a **non-voided** delivery exists, so UX §2.5 flow E and the row-menu note must say "non-voided" instead of "even a voided one" (frontend follows AC22). P5 (linked sale's date not before the order date and not in the future) is accepted as implemented.

**AC57 (added after the architect's P3):** The order date can be changed while an order is Partially fulfilled, but not to a date later than the earliest non-voided delivery's date; the form and the system refuse it with a plain message. Voided deliveries don't count.

**Decisions that needed the user's call (kept for the record)**
- **U1. Rewrite old sale dates?** The "one date" rule means a sale's date is the day the eggs left. Old complete deliveries that were logged one day and delivered later have two different dates today. M19 sets `sale_date = delivered_date` for those rows (so a sale can move in the date-sorted list and in date filters). The alternative keeps `sale_date` and discards `delivered_date` (history shows the order day, not the delivery day). **Recommended: rewrite** (the owner thinks of a sale's date as when it went out). Probably a no-op locally: the plan says no real pending sales exist yet.
- **U2. Cross-screen detail overlays are read-only (D10).** Flow H says a sale's detail opens on top of the order detail and the reverse, "same content". Making their Edit / Void / Deliver buttons work from the other screen means mounting the sale and order forms and dialogs in the layout. The design shows them read-only with a link to the screen that owns the actions. Confirm, or accept the larger build.
- **U3. Keep `delivered_date` as a generated column, or drop it (D3)?** Recommended: keep as generated for now, drop in a later cleanup.

**Pushback on the acceptance criteria (nothing dropped; each is built as written unless the owner says otherwise)**
- **P1. AC5 (Open is never capped) has no ceiling.** One jsonb value is returned, so `max_rows` doesn't cut it, but at several hundred open orders the response and the page get heavy. Not built; recommend revisiting (a "stale open orders" prompt, or paging inside Open) if a farm ever has more than about 300 open orders. No schema change would be needed.
- **P2. AC34 / AC35 vs "computed, never stored".** "Dropped amount unchanged after a later void" is only possible with a stored `dropped_eggs` (D5). Flagged so QA tests it as a deliberate exception.
- **P3. AC19 lets the order date change after a delivery.** A delivery dated before a moved order date would break "delivery not before the order date" (AC24, G7). The design refuses an order date later than the earliest non-voided delivery (`TM055 order_date`). This adds a rule that is not in §2; PM to add an AC, UX to add copy ("The order date can't be after its first delivery, {date}.").
- **P4. UX flow E and the row-menu note say Cancel is hidden for an order "with any delivery, even a voided one".** AC22 and the resolved G1 say voided deliveries do not count. The design follows AC22 (Cancel is offered when there is no non-voided delivery). UX §2.5 flow E, the menu note and the "Cancel / Close short dialogs" States row need that sentence corrected.
- **P5. G7 (a linked sale's date bounds)** is implemented as UX proposed: not before the order date, not in the future (`update_sale`, `TM055 sale_date`). PM to confirm.
- **P6. AC50 "the order number is assigned only by the system"** is true for the app and the functions. As with sale numbers (feature 04), an owner using their own JWT can hand-insert a number into their own farm (unique per farm, harmless to others). Same accepted residual.
- **P7. Feature 04 AC1 "exactly five destinations" and CLAUDE.md "5 destinations"** are obsolete (six destinations, five phone tabs). Listed in the doc edits below.

**Risks**
- **R1. M19 is destructive and has no down migration.** Mitigation: M18's in-transaction assertions, the migration test, a backup before any hosted apply, and the file order (M17 additive, M18 data, M19 drops).
- **R2. Open-list size** (P1) and `order_json` per-order aggregates: indexed, fine for hundreds; revisit with real data.
- **R3. Trigger density.** Six triggers across four tables is a lot of cross-row logic; a bug blocks writes rather than corrupting data (the guards raise). Mitigation: the pgTAP file tries every transition and every hand-built write. The advisory-lock-then-row-lock order is the same in every function; the void trigger path takes only the order row lock, so it can't deadlock against a function (which takes the advisory lock first, then the row).
- **R4. The `app.order_delivery` setting flag** relies on `set_config` not being callable by the browser. Proven by a pgTAP case; the security auditor should re-check when a Supabase upgrade changes exposed functions.
- **R5. Deploy window.** The old app build calls functions M19 drops. Single owner, no real traffic; D2 sequences it.
- **R6. `database.types.ts` regeneration** is required before the repositories typecheck (`TenantRpc` is derived from it); B5 gates B8 to B10.
- **R7. Hash change.** `app.sale_payload_hash` loses an argument, so a `create_sale` retry of a submission made *before* the migration would get `TM038`. A form re-submits within seconds, not across a deploy; accepted.
- **R8. Unread Figma frames.** The UX designer did not read them (§2.5 header). The frontend dev reconciles them in F2 to F6; F1 (nav) and F7 (sales strip) don't depend on them.

**Edits needed outside this document (the architect does not edit CLAUDE.md)**
- **CLAUDE.md, "Units and data model":** remove "`status` is either `pending` or `complete`..."; the Sales bullet becomes "every sale is a real, completed transaction; there is no pending sale". Remove "Marking a delivery complete asks for the delivered date each time..." and "On-site sales are created already `complete`" (replace with: a delivery is made by `deliver_order`, which asks for the delivered date each time). Replace "A **pending** sale can be hard-deleted..." with "No sale is ever deleted: a sale can only be edited or **voided**" (keep the `voided_at` text). Change "Inventory is computed ... Pending deliveries are not subtracted" to "Orders never change inventory". Drop `delivered_date` (pending) from "Null values carry meaning". "Inventory-on-hand (... completed, non-voided sales ...)" becomes "non-voided sales". Add an **Orders** bullet: `orders` + `order_lines` + `order_counters`; statuses requested / confirmed / ready / partially_fulfilled / fulfilled / cancelled; deliveries are sales with `sales.order_id`; delivered-so-far computed (`app.order_delivered_eggs`); never deleted; cancel only with no non-voided delivery; close short one-way; order numbers per farm, never reused; `deliver_order` is the only way to create a linked sale. The "type can be changed" sentence loses its status effects. "Navigation has 5 destinations" -> "6 destinations (Dashboard, Production, Orders, Sales, Inventory, Clients): a sidebar on desktop, four bottom tabs plus a More sheet and a FAB on mobile". Project status paragraph: add feature 05.
- **`docs/egg-farm-app-architecture-spec.md`:** done by the architect in this pass (Sales header / status / completion-event paragraphs, Inventory "pending", Dashboard outstanding deliveries, a new Orders section, the nullable and one-status bullets in §9).
- **`docs/egg-farm-app-ui-spec.md`, `docs/egg-farm-app-product-doc.md`, `docs/design/`:** the PM's list in §2 stands (Flow B, Sales 5a / 5c, Dashboard card, Inventory "For delivery", navigation, the invoice renumbering to feature 07). Not edited here.

**Traceability (acceptance criteria -> where designed)**

| AC | Where |
|---|---|
| AC1 | 3.5 Navigation |
| AC2 to AC6 | `list_orders` (3.3.2), `orders_tenant_open_idx`, `OrdersToolbar` / `OrdersList` |
| AC7 | `get_order` + `OrderDetail` |
| AC8, AC21 | `orderActions()`, `set_order_status` |
| AC9 to AC17 | `create_order`, `OrderForm`, shared line rules (D11) |
| AC18 | `order_counters`, `create_order` step 4 |
| AC19, AC20 | `update_order`, `order_lines_write_guard`, `orderEditRules`, order `version` |
| AC22, AC23 | `cancel_order`, `orders_write_guard`, no delete grant / route |
| AC24 to AC33 | `deliver_order`, `DeliverOrderDialog`, `sale_submissions` ledger |
| AC34 | `close_order`, `dropped_eggs` |
| AC35 | `sales_void_sync_order`, `void_sale`, `orderAfterVoid` |
| AC36 | `update_sale` linked branch, `sale_lines_linked_guard`, `sales_write_guard` |
| AC37 to AC42 | M19, 3.3.4, 3.5 "Stripped from the Sales UI" |
| AC43 to AC46 | M18 and `test:migration` |
| AC47 to AC49 | 3.5, indexes, paging |
| AC50 | the guard triggers (D4), the shared zod schemas |
| AC51 | frozen `line_total`, `deliver_order` step 7 |
| AC52 | 3.7 `020_tenant_isolation`, composite FKs |
| AC53 to AC55 | 3.5 and 3.6 privacy rows, `orders-privacy.spec`, farm-keyed state |
| AC56 | unchanged joins by `clientId` / `sizeId` |

---

## 4. Implementation notes (Devs)

### [BE] B0: orders contract in `shared/` (done)

**Files (all new; no existing file was edited except this doc's B0 tick):**
- `shared/constants/orders.ts`: `ORDER_FIELDS` (incl. `line(sizeId)`), `ORDER_MESSAGES`, `MAX_ORDER_LINES` (20), `MAX_EGGS_PER_ORDER_LINE` (100,000), `MAX_ORDER_PRICE` (9,999.99), `ORDER_PRICE_DECIMALS`, `ORDERS_PAGE_SIZE` (25), `ORDER_STATUSES`, `ORDER_MANUAL_STATUSES`, `ORDERS_VIEWS`, `OPEN_ORDER_STATUSES`. The limits re-export the sales values, so the two cannot drift.
- `shared/schemas/orders.ts`: `createOrderBodySchema`, `updateOrderBodySchema`, `setOrderStatusBodySchema`, `closeOrderBodySchema`, `deliverOrderBodySchema`, `orderIdParamsSchema`, `ordersQuerySchema`, plus `orderLineInputSchema`, `deliverLineInputSchema` and the inferred `*Body` / `OrdersQuery` / `OrderIdParams` types. Unknown keys (tenantId, orderNumber, status, id, price/client on a deliver) are stripped.
- `shared/utils/order-status.ts`: `ORDER_STATUS_LABEL`, `ORDER_CLOSED_SHORT_LABEL`, `ORDER_DELIVERY_VOIDED_LABEL`, `isOpenStatus`, `orderStatusLabel`, `orderActions`, `orderEditRules`, `orderStatusFor` (twin of `app.order_status_for`), `orderAfterVoid`, `deliverableLines`.
- `shared/utils/order-progress.ts`: `formatProgress(deliveredEggs, orderedEggs, eggsPerTray, locale?)`.
- Specs (78 tests): `tests/unit/orders-constants.spec.ts`, `order-schemas.spec.ts`, `order-status.spec.ts`, `order-progress.spec.ts`.

**Deviations / decisions (small, for the architect and frontend to know):**
1. `ORDER_MESSAGES` holds only **fixed strings** (no functions). Messages with a value ("Only {n} left to deliver.", "Wanted-by can't be before the order date, {Sep 20}.", "Can't go below what was delivered: {qty}.", "...first delivery ({date}).") are built by the frontend from the fixed base here (`wantedByBeforeOrder`, `deliveredDateBeforeOrder`, `orderDateAfterFirstDelivery`, `belowDelivered`) plus the value, so the server can never echo one (AC54). `ORDER_MESSAGES.overDelivery` is the 409 text ("Part of this order was delivered somewhere else...").
2. Copy added that §2.5 did not list, needed for the SQLSTATE map: `lineLocked` (TM051 line_locked), `clientLocked` (TM051 client_locked, also the helper "Can't change after a delivery."), `statusLocked` (409 `has_delivery` on POST /status, TM049, since `cancelRefused` would mislead there), `orderDateAfterFirstDelivery` (AC57, per the §3.10 note), `statusInvalid`, `filtersInvalid`. UX to confirm wording.
3. `formatProgress` rule beyond O-R4's examples: a single ordered tray is singular ("0 of 1 tray"); an order under a tray is plain egg counts ("0 of 5 eggs", "0 of 1 egg"); with loose eggs on either side each side goes through `formatQty`, except nothing delivered reads `0` ("0 of 12 trays + 15", "8 trays + 1 of 12 trays").
4. `orderActions` takes `Pick<Order, 'status' | 'deliveryCount'>` (not-voided deliveries); Cancel is offered for requested/confirmed/ready only when `deliveryCount === 0` (AC22/G1, non-voided). `status` lists only the two other hand-set statuses and is empty once Partially fulfilled.
5. `orderEditRules(order)` treats "something delivered" as `deliveryCount > 0` or any line with `deliveredEggs > 0`. `willFulfil(lines)` is true only when something was delivered and every line in the new set has `eggs <= delivered` (a newly added line keeps the order open).
6. `orderAfterVoid(orderDetail, saleId)` returns `{ status, owed, stays }`. `owed` is empty for a closed-short or cancelled order (UI says "stays closed"); a voided or unknown sale id changes nothing. It needs the **detail** (it reads `deliveries`).
7. The `orderStatusFor` fixture table lives in `order-status.spec.ts` (14 rows). When B6 writes `080_orders.test.sql`, assert the same rows against `app.order_status_for` (D9).
8. The ordersQuery `view` defaults to `open`; `limit` 1..100 default 25; `offset` default 0 (the server ignores both for `open`).
9. No parity test against the M17 migration yet (no migration exists); B1 should add one like `sales-constants.spec.ts` (20 lines, 100,000, 9,999.99 in `order_lines` checks).

**For the frontend dev: import from**
- `shared/constants/orders`: `ORDER_FIELDS`, `ORDER_MESSAGES`, `MAX_ORDER_LINES`, `MAX_EGGS_PER_ORDER_LINE`, `MAX_ORDER_PRICE`, `ORDERS_PAGE_SIZE`, `ORDER_STATUSES`, `ORDER_MANUAL_STATUSES`, `ORDERS_VIEWS`, `OPEN_ORDER_STATUSES`
- `shared/utils/order-status`: `ORDER_STATUS_LABEL`, `isOpenStatus`, `orderStatusLabel`, `orderActions`, `orderEditRules`, `orderAfterVoid`, `deliverableLines`, `orderStatusFor`, `ORDER_DELIVERY_VOIDED_LABEL`, `ORDER_CLOSED_SHORT_LABEL`
- `shared/utils/order-progress`: `formatProgress`
- `shared/schemas/orders`: the schemas above (the form may reuse `orderLineInputSchema` etc.)
- `shared/types/api.ts` (unchanged by B0): `Order`, `OrderLine`, `OrderDetail`, `OrderDelivery`, `OrderStatus`, `OrderManualStatus`, `OrdersView`, request/response types.

No contract change to `shared/types/api.ts`; the `Sale` changes remain B8.

**Results:** `bunx vitest run` on the four new specs: 4 files, 78 tests passed. `bun run typecheck` and `bun run lint` both clean (exit 0).


### [FE] F1 to F7: nav, Orders screen, forms, Deliver, Sales strip-down (done; F8 not done)

**Not done / not verified (read first).**
- **F8 (integration against the real routes) is NOT done.** The backend routes/functions were not available to me, so nothing was run end to end: no create/edit/status/cancel/close/deliver/void against the real API, no 375px or desktop browser check, no light/dark check, no 20-line order, no 24-egg farm. Everything is built against the typed contract (shared/types/api.ts) and the §3.4 routes and verified only by typecheck, lint and unit specs.
- **Figma could not be read** (no Figma tool in this run; a plain fetch returns only the login shell). Pixels, spacing and colour follow §2.5 and the design's visual language, not the frames. Date placement on the New order form follows §2.5 (dates after the lines). Re-compare against the frames in F8.
- Remaining red unit specs are backend-owned (sales-repo, sales-constants, sales-privacy server file list, server-guards route list: B8/B9/B11 still to update). All frontend specs pass; typecheck and lint are clean.

**F1 Nav.** app/utils/nav.ts (six items, tabLabel Home, mobile tab|more, MOBILE_TABS, MORE_ITEMS, isMoreActive, findActiveMoreItem), app/components/AppBottomTabs.vue (4 tabs + More button, no aria-current, 'More, current: Clients'), app/components/AppMoreSheet.vue (new), app/layouts/default.vue (moreOpen, closes on route change, FAB hidden while open), app/utils/sheet-ui.ts (480 width). Spec: tests/unit/nav.spec.ts.

**F2 Orders screen.** app/pages/orders.vue, app/composables/useOrders.ts, app/utils/order-list.ts, order-copy.ts, components OrdersToolbar, OrdersList, OrderStatusBadge, OrderProgress, OrderRowMenu. Open view loads without limit/offset; other views page 25. useFarm gained trayEggs (no literal tray size in new code). useMe().clear() also drops orders: and detail-stack: state.

**F3 Detail.** OrderDetail, OrderStatusControl, OrderDeliveriesList, app/composables/useDetailStack.ts. Cross-screen overlays are read-only with Open in Orders/Sales; the hand-off id travels in memory (never the URL) and is consumed on mount by the target page.

**F4 Form.** OrderForm, OrderFormOverlay, order-validation.ts. SaleLineCard gained optional props (hideOnHand, lockedLabel, minEggs, minNote, priceNote, usedLabel, idPrefix); SizeChipPicker gained usedLabel/usedOptionLabel; QuantityInput gained minEggs/maxEggs. Edit rules come from orderEditRules; AC57 checked against the first non-voided delivery date (needs deliveries, which the page fetches).

**F5 Mutations.** app/utils/order-mutations.ts, order-errors.ts, app/composables/useOrderMutations.ts (also useAfterDelivery: refreshes on-hand and, if loaded, the Sales list). Specs: order-mutations, order-errors, order-list, order-validation, order-copy, orders-screen-privacy.

**F6 Dialogs.** DeliverOrderDialog (inline stock panel, over-delivery refresh, same submission id for Deliver anyway), CancelOrderDialog, CloseShortDialog.

**F7 Sales strip-down.** Deleted SaleStatusBadge and MarkDeliveredDialog; SaleRemovalDialog became SaleVoidDialog (order preview via orderAfterVoid, fetched on open); new FromOrderLink; SaleRowMenu (Edit, Void), SaleDetail, SalesList, SalesToolbar (Type chips always visible, no Status chips), SaleForm (one Sale date; linked sale read-only except date), SaleFormOverlay, sales.vue, sale-copy/errors/mutations/validation, useSales, useSaleMutations (void patches the order store). Specs updated: sale-mutations, sale-errors, sale-validation, sale-message-parity.

**Deviations.** (1) Type chips stay visible on phones (they took the Status chips' place). (2) The detail stays open under Edit/Deliver/Cancel forms (stacked) rather than closing, per "stays open and updates in place". (3) Order editing of a linked sale fetches the order to learn its date (SaleForm min date); the server still enforces. (4) Frontend privacy spec is named orders-screen-privacy.spec.ts to avoid the backend's orders-privacy.spec.ts. (5) ORDER_COPY.stackedSaleFailed and SALE_COPY.openOrderFailed are new copy not in §2.5.

### [BE] B1 to B11 and D1: database, server and tests (done)

**Migrations** (`supabase/migrations/`, real timestamps from `supabase migration new`):
- `20261003105235_orders.sql` (M17): `order_counters`, `orders`, `order_lines`, `order_submissions`, `sales.order_id` (+ `sales_order_is_delivery`), helpers `app.order_delivered_eggs`, `app.order_status_for`, `app.recompute_order_status`, `app.order_payload_hash`, triggers `order_lines_bounds`, `order_lines_write_guard`, `orders_write_guard`, grants and RLS as 3.2.
- `20261003105240_orders_convert_pending.sql` (M18): temp-table conversion with the post-condition `do` block; idempotent (re-run asserted by the migration test).
- `20261003105245_sales_drop_pending.sql` (M19): drops the six old functions + helpers, `sales_delete_guard`, the delete policy/grant; `update sales set sale_date = delivered_date` (U1); drops `status` and the status constraints; `delivered_date` becomes `generated always as (sale_date) stored` (U3); new `create_sale`, `update_sale`, `void_sale`, `list_sales`, `on_hand_json`, `sale_json`, `list_sales_json`, `sale_payload_hash`; triggers `sale_lines_linked_guard`, extended `sales_write_guard`, `sales_void_sync_order`.
- `20261003105249_orders_functions.sql` (M20): `app.order_json`, `app.list_orders_json`, `app.validate_order_lines`, `app.deliver_payload_hash`, and `create_order`, `update_order`, `set_order_status`, `cancel_order`, `close_order`, `deliver_order`, `get_order`, `list_orders`.
- `bun run db:reset` applies all four cleanly; `shared/types/database.types.ts` regenerated.

**Tests.** pgTAP `080_orders.test.sql` (236 tests: numbering, replay, every validation code, status machine, cancel/close/deliver, caps, stock and shortfall, AC33, edit after delivery, AC57, void paths including the hand-built-void trigger, linked-sale edits, hand-built guard attempts, list_orders, and the 14-row `order_status_for` fixture table shared with `order-status.spec.ts`). Updated `000`, `010`, `020` (orders in both directions, reads and writes), `070` (rewritten without pending/delete), `090` (m23 reworked, m25 to m28 added). Unit: `orders-repo.spec`, `orders-privacy.spec`, `server-guards.spec` (eight order routes, no-delete-route guard), plus sales specs updated. `scripts/test-migration.mjs` (`bun run test:migration`) and a README row (D1).

**Server.** `server/repositories/orders.ts` (+ `order-json.ts`, shared with `sales.ts` so a void response can carry the order), eight routes under `server/api/orders/`, three sales routes removed, `errors.ts` carries `order` in `ApiErrorData`. `sales.ts` loses mark-delivered, mark-pending, delete; `voidSale` returns `{ sale, changed, order }`; TM053 maps to 409 `sale_locked` (+ sale), TM055 hint `sale_date` to 400 `saleDate`.

**Shared (B8, done first):** `Sale` loses `status` / `deliveredDate`, gains `orderId` / `orderNumber`; removed `SaleStatus`, `MarkSaleDeliveredRequest`, `DeleteSaleResponse`, `markSaleDeliveredBodySchema`, the `status` list query, `not_pending` / `not_complete`, and the delivered-date / not-pending / delete / mark messages and `SALE_FIELDS.deliveredDate`; added `SALE_MESSAGES.saleLocked` and `saleDateBeforeOrder`. `VoidSaleResponse = { sale, changed, order: OrderDetail | null }`. `deliveredDate`, `status` in request bodies are stripped by zod.

**Deviations from 3.**
1. `void_sale` lives in M19 (as designed) but calls `app.order_json`, created in M20; fine because plpgsql resolves it at run time, and all four always apply together.
2. `orders_write_guard` raises TM046 (not TM054) for a change to a cancelled/closed-short/fulfilled order's header, and also guards the AC57 order-date rule (TM055) and the client lock (TM051) for hand-built updates; `sales_write_guard` also refuses any change of `order_id`.
3. The guards that fire on delete skip when the tenant row is already gone, so a whole-farm cascade is not blocked.
4. `TM052 not_on_order` on deliver is a 409 `order_changed` (+ order); `TM052 empty` is a 400 on `lines`.
5. `sale_json` has no `status` / `deliveredDate`; `delivered_date` is only a column.
6. A hand-built `sales` header can be inserted with `order_id` (the insert grant has to include it) but can never get lines (`sale_lines_linked_guard`), so it counts as a delivery in `deliveryCount` yet moves no stock. Residual, owner-self-inflicted, noted for the security auditor.
7. The migration test runs SQL through `docker exec ... psql` (the `supabase db query` command accepts one statement) and applies M17+M18 through a temporary `--workdir`, then M19+M20. It resets the LOCAL database; run `bun run db:reset` afterwards.

**For the frontend:** `ApiErrorData.order` is set for `order_changed`, `order_closed`, `has_delivery`, `not_partial`, `over_delivery`; `sale_locked` carries `sale`. Order messages come from `ORDER_MESSAGES`; `fields` keys for TM051 are `lines.{sizeId}` or `clientId`.

**Results:** `bun run db:reset`, `db:types`, `bun run typecheck` (exit 0), `bun run lint` (clean), `bun run test` (1012 unit tests + pgTAP 10 files, 1568 tests, PASS), `bun run test:migration` (19 checks ok).

### [BE] QA round 1 fixes (B-1, B-2, S-1)

The new order migrations were edited in place (none committed or applied outside local).
- **B-1** (`20261003105245_sales_drop_pending.sql`): new BEFORE INSERT trigger `sales_order_id_guard` refuses a sale with `order_id` unless the transaction-local flag `app.order_delivery = 'on'` (TM053). `deliver_order` (M20) now sets the flag before its `insert into sales` (it already set it for the lines; it is still switched off afterwards). pgTAP: a hand-built linked sale is refused (080), and 020's two "linked sale" cases now expect TM053 (the trigger answers before the FK/RLS).
- **B-2**: deferred constraint triggers require at least one line at commit: `orders_need_lines` on `orders` insert (M17) and `sales_need_lines` on `sales` insert (M19, closes the feature 04 hole); both TM028. pgTAP: header-only order and header-only sale are refused with `set constraints all immediate`, and an order inserted together with its line is accepted. (A test that leaves constraints immediate must set them deferred again; the fixture helper in 080 also disables the `sales` triggers.)
- **S-1** (`20261003105249_orders_functions.sql`): `app.list_orders_json` is now set-based: one pass of CTEs (matched/page, delivered-so-far, delivery counts, lines with `jsonb_agg`) and no per-order function call; same JSON as before, the Open view is still uncapped (non-open views page by row number). `app.order_json` is unchanged and still used for single orders. Measured with 5,000 open orders of 2 lines each: 296 ms as postgres, 265 ms as an authenticated owner through `public.list_orders` (was a statement timeout).
- pgTAP 080 now has 237 tests. Results: `bun run db:reset`, `db:types`, typecheck (0), lint (clean), `bun run test` (1012 unit + pgTAP 10 files PASS), `bun run test:migration` (passes), then `db:reset` again.

## 5. QA report (QA)

**Verdict: FAIL (round 1).** No Blocking rule is broken, but AC50 is not fully met (two hand-built writes still store invalid data, B-1 and B-2 below) and a few ACs could not be verified (list at the end). Both findings are small database fixes. Status set back to `in-progress`.

**Tests run (all on the final tree, local Supabase up):**
- `bun run typecheck`: clean. `bun run lint`: clean.
- `bun run test:unit`: 65 files, 1012 tests passed. `bun run test:db` (pgTAP): 10 files, 1568 tests, PASS (`080_orders` ok, `010`/`020`/`090` ok).
- `bun run test:migration`: 19 checks ok (conversion of 3 pending sales incl. inactive client + archived size, counters, retired sale numbers, on hand identical, re-run changes nothing). `bun run db:reset` run afterwards.
- End to end against the real API (`bun run dev`, local farms "QA Farm" and "Farm B", scripts in the QA scratchpad): 85 checks, all ok (the only red was my own arithmetic: 10 trays x 6.75 + 4 x 6.00 = 91.50). Covered: create (number 1; replay returns the same order; same submissionId with another payload is refused; 4 simultaneous creates got numbers 2..5; tenantId/orderNumber/status in the body ignored), 12 validation cases, status moves both ways and hand-set partial/fulfilled refused, edit (stale 409 with the order, no-op `changed:false`), cancel (idempotent; refused on delivered; 404/405 on DELETE), deliver partial 120 then 180 (on hand 600 -> 480 -> 300, retry of the same submissionId returns one sale, two phones delivering the last 180 at once gave exactly one 200 and one 409 `over_delivery`), over-delivery, not-on-order size, empty, future and pre-order dates, stock short then "Deliver anyway" (negative on hand allowed), edit limits after a delivery (below delivered, remove delivered line, change client all refused; price change allowed and used by the next delivery), AC57, close short (stale version 409, dropped 60, then cancel/deliver refused), void of a delivery on a closed-short order (stays Fulfilled, dropped unchanged), G1 (void the only delivery of a Fulfilled order -> Ready -> cancel allowed; two deliveries, void one -> Partially fulfilled, void last -> Ready), direct on-site sale works, `status:'pending'` in the body is dropped, linked-sale line edit and type change refused, DELETE sale 404/405.
- Hand-built PostgREST requests with the owner's own JWT: no DELETE grant on orders or sales; status jump to fulfilled/partial refused (TM054); edits to cancelled/closed-short refused (TM046); order_number and converted_from_sale_number not updatable; linked sale_lines insert/update/delete refused (TM053); `set_config` is not reachable over RPC (404), so the linked-lines flag cannot be set from the browser; old `delete_sale` and `mark_sale_delivered` RPCs gone (404); `create_order` with another farm's tenant id gives TM006; anon key gets 401.
- Two farms: farm B got 404 on get, status, cancel, deliver, close and put against farm A's order, and 400 when creating an order with farm A's client; signed-out requests got 401; the server-rendered `/orders` redirects to login and holds no client name or phone; no client name or phone in the dev-server log.
- Headless Chrome at 375px and 1280px (screenshots checked): Orders list, card actions, Deliver step, order detail, row menu, bottom tabs with More. No horizontal scroll at 375px on Orders, the Deliver step, the New order sheet, the detail or Sales. Tap targets at 375px: none under 44px. At 1280px a few controls are 36 to 40px (Add order, Deliver, the menu button), which matches the design's 40px at lg.
- Volume: 5,000 orders seeded (500 open, 4,500 cancelled): Open view 0.93 s for 507 orders; All/Cancelled pages 0.1 to 0.2 s, including offset 4000. With 5,000 orders all open the Open view returned a 500 after 8 s (statement timeout); see S-1.

**Acceptance criteria**

| AC | | Evidence |
|---|---|---|
| 1 | ✅ | Screenshots: five mobile tabs Home, Production, Orders, Sales, More; "+" above the tab bar (never over a tab, shown only on Orders); desktop sidebar lists six and "Add order" in the top bar. `nav.spec.ts`. |
| 2, 3, 5 | ✅ | Cards and rows show number, client, date, progress, total, status, Deliver. Open view sorted wanted-by first then oldest (SQL `list_orders_json`, `order-list.spec.ts`); Open returns all 507 (no cap). |
| 4, 6 | ✅/⚠️ | Chips, client filter, date range present in screenshots; filter logic unit tested. Empty/error/loading copy in `order-copy.ts`; the empty and error screens were not looked at in a browser. |
| 7 | ✅ | Detail screenshot at 375px: lines with ordered/delivered/left, total, deliveries list, actions; no sideways scroll. 6-line order not exercised (see unverified). |
| 8 | ✅ | `orderActions` (unit) and menu screenshot (Partially fulfilled: Deliver, Edit, Close short). |
| 9 | ⚠️ | Form opens with one line, no type toggle; not walked through in full. |
| 10 | ✅ | On hand 600/300 unchanged after create, edit, status moves, cancel. |
| 11 | ⚠️ | Server side ok (inactive/foreign client refused for new orders); picker and "+ new client" not exercised in a browser. |
| 12 | ✅/⚠️ | Server refuses 0/100001 eggs, price 0/10000/3 decimals, duplicate size, 21 lines, foreign size. Tray size comes from `useFarm`, not a literal (grep). 24-egg farm not run. |
| 13 | ⚠️ | Price pre-fill is a form behaviour; unit tests only. |
| 14 | ✅ | Total 91.50 confirmed; shared rounding helper (`app.sale_line_total`) used for orders and deliveries. |
| 15 | ✅ | Future order date, wanted-by before order date refused (API). |
| 16 | ✅/⚠️ | Replay returns one order; failed save keeps values and discard dialog are form logic covered by unit tests; not clicked through. |
| 17 | ⚠️ | Not timed in a browser. Tap count in §2.5 is 9. |
| 18 | ✅ | Numbers 1..n per farm, 4 concurrent creates distinct, replay keeps the number, cancelled numbers stay used; M18 numbers follow old sale numbers. |
| 19 | ✅ | API: free edit, limits after delivery, no-op `changed:false`, inactive client/archived size kept (pgTAP `080`). Edit to zero owed -> Fulfilled is in pgTAP. |
| 20 | ✅ | Stale PUT returned 409 `order_changed` with the current order. |
| 21 | ✅ | Moves both ways, hand-set partial/fulfilled refused, refused once a delivery exists. |
| 22 | ✅ | Cancel refused with non-voided delivery (409 `has_delivery`), allowed after the only delivery was voided (G1), idempotent, keeps row and number. Only NON-voided deliveries block it (`cancel_order`, `deliveryCount` in `orderActions`). Note the §2.5 text says "even a voided one"; AC22/G1 win and the code follows them. |
| 23 | ✅ | No DELETE route (404/405), no DELETE grant (403). |
| 24, 25 | ✅/⚠️ | Deliver step screenshot at 375px: pre-filled with what is left, date, "1 tray left", total, Deliver. Partial down to 0 per line enforced by the API; the step's "Enter a quantity" message not seen. |
| 26 | ✅ | 181 > 180 refused with 409 and the current order; two simultaneous deliveries: one succeeds, one 409. |
| 27 | ✅ | One sale, type delivery, order's client, delivered date, lines at the order line price (6.75, and 7.00 after a price edit), new sale number, `orderId` set. |
| 28 | ✅ | partial/fulfilled set in the same transaction. |
| 29 | ✅ | 600 -> 480 -> 300. |
| 30 | ✅ | 409 `stock_short` names only the short size; same submissionId allowed with `confirmShortfall`. Single-step panel seen in code only. |
| 31 | ✅ | Replay with the same submissionId returns the first sale, one stock move. |
| 32 | ✅ | Delivered-so-far computed by `app.order_delivered_eggs`; voiding a delivery drops it to 0. Changing a linked sale's date does not change figures. |
| 33 | ✅ | pgTAP AC33 (inactive client, archived size still deliverable) and migration test. |
| 34 | ✅ | Close short: stale version refused, dropped 60 recorded, `closedShortAt` set, one-way; refused from other statuses. |
| 35 | ✅ | Void -> order recomputed in the same statement by trigger; closed short stays; void response carries the order. |
| 36 | ✅ | Hand-built line/client/type changes refused (API and PostgREST). Date still editable. |
| 37 | ✅ | No `status` on sales (column dropped), pending key ignored, mark routes and RPCs gone. |
| 38 | ⚠️ | API: every direct sale is shortfall-checked (409), on-site created fine. Sale form not clicked through. |
| 39 | ✅/⚠️ | Sales list has no Status chips (code); "From order" link in `FromOrderLink`; Sales screenshot shows no overflow. |
| 40 | ✅ | See AC23 for sales. |
| 41 | ✅ | `on_hand_json` ignores orders and counts only non-voided sales. |
| 42 | ✅ | Type change refused on a linked sale; direct type change tested in `070`. |
| 43 to 46 | ✅ | `test:migration` (19 checks): same count, lines, totals, client, Confirmed, no pending left, on hand identical, re-run no-op, new numbers follow old, "Formerly sale #" kept, sale counter untouched. M18 is one transaction with post-condition checks that abort the whole file. |
| 47 | ✅/⚠️ | 375px: no overflow, no target under 44px (checked on list, Deliver step, New order sheet, detail, Sales). 20-line order and keypad behaviour not run. |
| 48 | ✅/⚠️ | Desktop at 1280 looked right (dark). 768 to 1023 and light mode not checked. |
| 49 | ✅ | 5,011 orders: pages in 0.1 to 0.2 s; Open 0.93 s for 507. See S-1 for the extreme case. |
| 50 | ❌ | See B-1 and B-2. Everything else in the AC held against hand-built requests. |
| 51 | ✅ | Line totals frozen; delivery totals rounded on their own eggs; update keeps a line's total when eggs and price are unchanged. |
| 52 | ✅ | pgTAP `020`/`090` extended (reads and writes on orders, lines, ledger, counters); API check above; composite FKs on `sales.order_id`. |
| 53 | ✅ | SSR page has no client data; no client name in any URL (only `clientId`); `orders-screen-privacy.spec.ts`. |
| 54 | ✅ | Only `[orders] <scope> <SQLSTATE>` is logged; log file had no names after failing requests. |
| 55 | ⚠️ | `useMe().clear()` drops orders and detail state (code, unit tested); Back-button behaviour not tried. |
| 56 | ✅/⚠️ | Names are read live (no name stored on orders). Not re-checked in the UI. |
| 57 | ✅ | Order date after the earliest non-voided delivery refused by function and by trigger. |

**Findings**

*Blocking*: none.

*Should fix, backend-dev (these make AC50 fail):*
- **B-1** `supabase/migrations/20261003105245_sales_drop_pending.sql:74` (insert grant includes `order_id`). Repro: with the owner's JWT, `POST /rest/v1/sales {tenant_id, sale_number:9001, type:'delivery', sale_date, client_id, order_id:<a Ready order>}` returns 201. The order now counts one delivery (`deliveryCount` 1), so it cannot be cancelled and shows a delivery with no lines (deviation 5). It is the owner's own farm only, and void_sale clears it, but AC50/§3 say only `deliver_order` links a sale. Fix: a before-insert trigger on `sales` that refuses `order_id is not null` unless `app.order_delivery = 'on'`, and have `deliver_order` set the flag before its `insert into sales` (it already sets it before the lines). Add a pgTAP case.
- **B-2** `supabase/migrations/20261003105235_orders.sql` section 7a (`order_lines_bounds` fires only on `order_lines` rows). Repro: `POST /rest/v1/orders {tenant_id, order_number:9002, client_id, order_date, status:'requested'}` returns 201 and the order appears in Open with no lines and a total of 0.00 (seen in the desktop screenshot as "#9002 ... ₱0.00"). AC50 says 1 to 20 lines. Same pattern exists for `sales` from feature 04, so fix both: add a deferred constraint trigger on `orders` (and `sales`) insert that checks the line count at commit.

*Should fix, backend-dev (performance):*
- **S-1** `app.list_orders_json` / `app.order_json` (`supabase/migrations/20261003105249_orders_functions.sql:31-87, 118-135`): each open order costs about 2 ms (several correlated subqueries), so the uncapped Open view (AC5) hits the 8 s statement timeout near 4,000 open orders and returns a 500. Repro: seed 5,000 `confirmed` orders with 2 lines each, `GET /api/orders` -> 500 after 8.1 s. Unlikely for a real farm, fine today (507 open = 0.9 s), but worth a set-based rewrite (aggregate delivered eggs and lines once for all matched orders) before volume grows.

*Notes:*
- N-1 `CLAUDE.md` is still stale and the doc's own "Spec edits needed" list is open: lines 57, 59, 62 (pending status, pending delete, `delivered_date` null), "5 destinations", and feature 04 AC1. For the coordinator at wrap-up.
- N-2 The detail shows "Delivered 0 eggs" and "Left 0 eggs" for zero amounts (screenshot). O-R4 limits the word "eggs" to amounts under a tray, so this is arguable, but "0 trays" may read better. Frontend-dev call.
- N-3 `ORDER_MESSAGES` deviation list and the unit-test fixture for `order_status_for` (14 rows) match the SQL; no action.
- N-4 M19 is destructive (drops `sales.status`, replaces `delivered_date` by a generated copy of `sale_date`) with no down migration, and moves old "logged one day, delivered later" sales to their delivered date. It is documented and the migration test shows on hand and numbers unchanged; take a backup before applying to a hosted database.
- N-5 No migration that was already committed was edited (all four are new files).
- N-6 The dev server is slow on the first render in dev mode (the list skeleton shows for several seconds); not an app issue.

### QA round 2

**Verdict: PASS.** B-1, B-2 and S-1 are fixed and verified against the real local API and PostgREST. No new findings.

- **B-1 fixed.** Owner JWT, `POST /rest/v1/sales` with `order_id` of a Ready order: 400 TM053 "a delivery can only be created by delivering an order" (was 201). `PATCH sales {order_id}` is 403 (no grant). Real deliveries through `/api/orders/:id/deliver` still work (flag set by `deliver_order`).
- **B-2 fixed.** Header-only `POST /rest/v1/orders`: 400 TM028 "an order must have 1 to 20 lines". Header-only sale, both on_site and delivery: 400 TM028. Deleting all lines of an existing order or sale: 400 TM028. Nothing left behind (no rows with number >= 9000).
- **S-1 fixed.** 5,000 extra open orders (2 lines each, 5,006 open in total) through the real `GET /api/orders?view=open`: 200 with all 5,006 orders in 0.71 to 0.79 s (was a 500 after 8 s). `view=all&limit=25&offset=4000`: 0.15 s. Parity: for the 10 orders from the e2e run (partial, fulfilled, closed short, voided deliveries, cancelled) the list entry equals `GET /api/orders/:id` minus `deliveries`; 30 bulk orders differ only by that same `deliveries` field.
- **Tests (final tree):** `bun run typecheck` clean; `bun run lint` clean; `bun run test`: 65 unit files, 1012 tests pass, pgTAP 10 files, 1569 tests, PASS (`080_orders` ok); `bun run test:migration` passed (M17 to M20 conversion, on hand identical, re-run no-op); `db:reset` applies all migrations cleanly. The four order migrations are new untracked files; no committed migration is modified (rule 8 ok).
- **E2E regression** (fresh farms, real API, same script as round 1): 85 checks, 84 ok. The only red is the known arithmetic in my own script (expects 226.5, the order is 10 x 6.75 + 4 x 6.00 = 91.50). Covered create, replay, concurrent numbers, validation, status moves, partial deliver 120 then the rest 180 (on hand 600 to 480 to 300), close short, void a delivery, G1, direct on-site sale, stock short and "Deliver anyway".
- AC50 is now met; AC49 is met including the extreme case. The round 1 "Not verified" list below is unchanged and needs the owner or a browser pass; none of it is Blocking. The local DB was reset afterwards (QA farms removed).

**Not verified (needs the owner or a follow-up round), including the Figma frames I could not read:**
1. Compare against the Figma frames (https://www.figma.com/design/hFVMtay6JU3kSAu4xsUGMt): Orders list mobile and desktop, More sheet, order detail, Deliver step, New/Edit order, cancel and close-short dialogs, badge colours, spacing, icons, the "+" position, the Partially fulfilled warning chip.
2. AC17: log a two-size order on a phone against a 60 s clock.
3. AC47: a 20-line order (enter, save, open, edit, deliver) at 375px; Save/Deliver reachable with the keypad open.
4. AC12: a farm set to 24 eggs per tray (1 tray + 5 = 29; loose maximum 23) in the order form and the Deliver step.
5. AC48: 768 to 1023px with the sidebar collapsed and expanded; light mode on every new screen.
6. AC6: empty ("No orders yet"), filtered-empty and load-error states; AC11 "+ new client" round trip; AC13 price pre-fill; AC16 discard dialog and failed-save keeps values; AC30 single-step shortfall panel and "Deliver anyway" label; AC35 void dialog wording ("Order #n will show ... still owed"); AC55 Back button after sign-out; focus handling in the dialogs and More sheet.
7. Keyboard and screen-reader pass over the card (the whole-card button with Deliver and the menu above it), the More sheet and the status control.
