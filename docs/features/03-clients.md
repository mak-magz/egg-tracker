# Feature: Clients (list, add, edit, mark inactive)

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want to keep a list of the customers I sell and deliver to (name, phone and the price I usually charge them), and add one from my phone in a few seconds, so that when I record a sale I can pick the customer instead of typing it again, and the usual price is already filled in.

As the farm owner, I want to fix a client's details, and to mark a client inactive when they stop buying (and bring them back later), so that my list stays tidy while every past sale keeps its customer and its price.

**Why now / spec reference:**
- Product doc §3 goal 3 ("per-customer history") and §5 ("Client list (simple, referenceable)"). Clients are the third link after Production and Inventory. **Sales (the next feature) can't be built until a client can be referenced.**
- UI spec §7 (Clients: list 7a, add/edit 7b, detail 7c "optional for v1", empty state), §8 (client selector), §9 Flow F. Architecture spec "Clients" and "Sales" (`client_id` nullable, price snapshotted on the sale, "prefer soft-delete/archive"). `CLAUDE.md` "Units and data model": clients are the farm's customers, **not** tenants; soft-delete so past sales keep their data.
- **Visual design (source of truth):** `docs/design/source/template.html`. It draws the Clients screen (markup ~6416–6472: search box, status filter, table with Client / Phone / Default price / Status / row menu) and the "Add client" dialog (~6584–6611: Name, Phone, Default price, Cancel, Save). Sample data is at ~6681–6687. The top-bar "Add client" label is at ~6775 and the subtitle "{n} customers" at ~6773. The design has **no Edit, no Restore, no mobile layout and no first-use empty state**, and its row menu has a red **Delete**. See conflicts CL1 to CL7.
- Builds on features 00 (shell, the Clients tab and its "coming soon" placeholder), 01 (the top-bar Add button and mobile FAB mechanism, the discard-changes and all-or-nothing save conventions) and 02 (name rules, "archived" behaviour, isolation test extended to writes).
- **Personal data.** Clients are the first personal data in the app (names, phone numbers). The architecture spec already names them "the first isolation target". See AC28 to AC33.

## 2. Acceptance criteria (PM)
Terms used in these criteria:
- **Owner** means a signed-in, provisioned owner. **Mobile** is about 375px wide; **desktop** is 1024px or more.
- **Client**: one of the farm's customers (a shop, restaurant or person). Not a farm/tenant.
- **Active client** is offered for new sales. **Inactive client** is not offered for new sales, but is still in the list, still on every past sale, and can be made active again. **A client is never deleted** (AC21).
- **Default price**: the price the owner usually charges this client **per tray** (owner decision Q2). It is a convenience that pre-fills the sale form later. It is not authoritative for any sale.
- **The farm's currency** is a per-farm setting. It is **Philippine peso (PHP, symbol ₱)** for every farm for now, and the owner will be able to change it in Settings later (owner decision Q4; AC35 to AC37). Examples use "₱" and are only there to show the format, not a realistic price.
- Examples use a farm with 30 eggs per tray. Nothing in this feature does egg maths, but the price unit is per tray, so the tray size matters to Sales later (AC34).
- Items marked **[not in design]** are needed but the design doesn't draw them. UX draws them in the design's visual language. **All owner questions were answered on 2026-09-26 (see "Owner decisions"), and the criteria are written to those answers.**

**The Clients screen**
- [ ] AC1: The Clients tab (one of the five main destinations; still exactly five) shows the **Clients** screen in place of the "coming soon" placeholder. The title is "Clients". The subtitle is "{n} customers" ("1 customer") and counts all clients, active and inactive (the design's "5 customers" counts an inactive one too).
- [ ] AC2: On desktop, the top bar shows an **"Add client"** button (the design's label). On mobile, a round **"+"** floating button shows instead, above the bottom tab bar and never covering a tab. Either opens the **Add client** form in one tap. They show only on the Clients screen, and the other screens' Add buttons are unchanged.
- [ ] AC3: **The list.** Each client shows its **name**, **phone** (or a "no phone" dash if none), **default price** (in the farm's currency, for example "₱6.50 / tray", or a dash if none; AC35) and **status** as text: "Active" or "Inactive". The badge isn't colour alone. Desktop (design): a table with Client, Phone, Default price, Status and a row menu. Mobile [not in design, CL3]: one stacked card per client with the same fields.
- [ ] AC4: **Order.** Clients are listed A to Z by name, ignoring upper/lower case, and accented letters sort with their plain letter ("Émile" among the E's). "The Green Table Café" sorts under T. Active and inactive clients are mixed in the same order (Q9).
- [ ] AC5: **Search.** The box filters the list as the owner types, with no reload and no Enter needed. It matches any part of the **name**, ignoring upper/lower case and accents ("cafe" finds "The Green Table Café", "table" finds it too), and ignores leading and trailing spaces. Clearing the box shows everything again. The list shows no client that doesn't match.
- [ ] AC6: **Status filter** (design): **All statuses** (default), **Active**, **Inactive** (Q9). It combines with the search: both must match. The subtitle count doesn't change with the filters.
- [ ] AC7: With a search or filter that matches nothing, the list shows **"No clients match this filter."** (the design's copy) and the search box and filter stay usable, with an obvious way to clear them.

**Add a client**
- [ ] AC8: The **Add client** form shows **Name** (required), **Phone** (optional), **Default price** (optional), **Cancel** and **Save** (the design's fields, Q1). On desktop it is a centred dialog (the design's dialog, up to about 420px wide). On mobile it is a bottom sheet [not in design]. Every field has a visible label.
- [ ] AC9: **Main path.** Tap Add, type a name, tap Save is enough. No other field, choice or confirmation is required. A tester who has the values can add a client with name, phone and default price on a phone in **under 30 seconds**.
- [ ] AC10: **Name rules**, for add and edit:
  - Leading and trailing spaces are ignored and any run of spaces inside is collapsed to one (same as sizes, feature 02), so "Maple  Street Market" is saved and compared as "Maple Street Market".
  - 1 to 60 characters after that. Blank or longer than 60 is rejected with a message on the field ("Enter a name" when blank). There is no silent cutting of a long pasted name.
  - Letters, digits, punctuation and accents are kept exactly as typed: "Sam & Dana Coyle", "The Green Table Café" and "O'Brien's" save and show unchanged.
  - Invisible or control characters (zero-width spaces, control codes, unpaired surrogates) are rejected with a message on the field. A hand-built request with one gets the same message, not a server error (feature 02 QA findings S2, N1).
  - Save is blocked while a message shows.
- [ ] AC11: **Name must be unique within the farm** (Q6): a name that matches another client's, ignoring upper/lower case and spacing ("maple street market" when "Maple Street Market" exists), is rejected with a message on the field. This includes **inactive** clients. If the match is inactive, the message says so and points to marking it active (AC20), so the owner isn't left with an unexplained clash. The same name at **another farm** never blocks this one and is never revealed (AC28).
- [ ] AC12: **Phone rules:** optional, free text, up to 30 characters after trimming. No format is enforced: "(555) 201-3348", "+63 917 123 4567", "555-2013 ext 4" all save unchanged. Invisible or control characters are rejected as in AC10. On mobile the phone field opens a phone/numeric keypad.
- [ ] AC13: **Default price rules:** optional; blank means "no default price". If filled, it is a number **greater than 0**, with **at most 2 decimals**, up to **9,999.99** (PM bounds). "6.5" is saved and shown as "₱6.50" (with the farm's currency, AC35). Negative, zero, letters, more than 2 decimals ("6.505") or a number above the limit are rejected with a message on the field and block Save. On mobile it opens a decimal keypad. The field shows the farm's currency symbol as a prefix (the design's leading "$" becomes "₱") and states its unit, "per tray", so the owner knows what the number means. Its placeholder is a neutral "0.00", not the design's "6.50", which is a dollar-sized price (CL13). **These limits don't depend on the currency**: the same 0 to 9,999.99 range and 2 decimals apply whatever the farm's currency is set to. The follow-up "Farm settings: currency" must re-check the limit and the 2-decimal rule when it lets the owner pick a currency (for example one with no decimals).
- [ ] AC14: **After a successful Save:** the form closes, a toast confirms it and names the client (for example "Added Maple Street Market"), and the new client is in the list at its A to Z place, scrolled into view and briefly highlighted, without a reload. If the current search or status filter would hide the new client, the filters are cleared so the owner sees it.
- [ ] AC15: **No double or lost saves.** While saving, Save shows a spinner and can't be pressed again. Tapping it several times adds **one** client. If the connection drops after the server saved but before the phone heard back, tapping Save again ends with **one** client and **no** "name already exists" error about the client that was just saved.
- [ ] AC16: **Save is all-or-nothing.** If it fails (for example, no signal), nothing is created, the form stays open with every value kept, and a plain-language message shows, for example "Couldn't save. Check your connection and try again." Tapping Save again retries. This is error handling only, not offline support.
- [ ] AC17: [not in design] Closing the form (Cancel, X, tapping outside, swiping the sheet down) with nothing typed closes it immediately. If anything was typed (Add) or changed (Edit), the app first asks "Discard this entry?" with **Discard** and **Keep editing** (feature 01 AC14).

**Edit a client** [not in design, CL1, CL4]
- [ ] AC18: Each client has **Edit**, reachable in **at most 2 taps** from the list: the row menu (⋮) then Edit, and on mobile also tapping the card. It opens the same form titled "Edit client", pre-filled, on desktop and mobile, for active and inactive clients alike. Saving updates the list without a reload, and a toast confirms it ("Updated Maple Street Market"). Emptying the phone or the default price removes it (the list then shows the dash). Saving with nothing changed closes the form with no request and no toast. Changing only the capitalisation or spacing of the name is a real change, and never clashes with the client's own name (AC11).
- [ ] AC19: If the client has been changed elsewhere since the form opened (another phone or tab; for example its name was taken, or it became inactive), the save is refused with a plain message, the list refreshes to the current data, and nothing is changed by mistake.

**Mark inactive and active** [CL1, CL2, Q5]
- [ ] AC20: An active client's row menu offers **Mark inactive**. An inactive client's offers **Mark active**. Neither needs a confirmation: nothing is lost and the other action undoes it in one tap. The status label changes in place and a toast names the change (for example "Marked Oakhill Bakery inactive"). Name, phone and default price are kept exactly. If the Active filter is on, an inactive client leaves the view, and the Inactive filter shows it.
- [ ] AC21: **A client is never deleted.** No action in the app removes a client or any of its details. The design's red **Delete** menu item and its "{name} deleted" toast aren't offered (CL1). Mark inactive is the only "remove from use" (Q5). Marking a client inactive doesn't change its name, phone, default price or any past record.

**Loading, empty and error states**
- [ ] AC22: **First use:** a farm with no clients sees an empty state instead of the table, filters and count of matches: "No clients yet" with a line such as "Add your first customer" and an **Add client** button that opens the form (UI spec §7; the design has no first-use state, CL5). It shows no sample clients, and none of the design's five example names appear.
- [ ] AC23: **Loading:** while the clients load, the screen shows a loading placeholder, not the empty state, so it never flashes "No clients yet" for a farm that has clients. **Load failure:** a plain-language message with **Try again**; no blank screen, no technical error, no empty state.

**Layout**
- [ ] AC24: On mobile (375px), the search box and status filter each fit the width and wrap as needed (the design's fixed 220px + 160px row doesn't fit). No horizontal scrolling on the list, the cards or the form. Every tappable control is at least **44px** tall and wide (Add, FAB, row menu, cards, form fields, Save, Cancel, dialog buttons), against the design's roughly 28 to 36px (feature 01 D7). The last card scrolls clear of the FAB and the tab bar. Save stays reachable with the keypad open (feature 01 AC5).
- [ ] AC25: On desktop, the content is centred at the design's maximum width (about 1120px) with the table layout of AC3. Between 768px and 1023px it works with the sidebar both collapsed and expanded, and the Add button is always reachable.
- [ ] AC26: Light and dark mode both keep names, phones, prices, the status text, messages and the form readable.

**Data rules, privacy and limits**
- [ ] AC27: **A farm's clients are its own.** A client has no effect on Production, Inventory or the Dashboard: adding, editing or marking a client inactive changes no egg count and no derived number anywhere.
- [ ] AC28: **Cross-farm isolation** (the first personal data, so this is the first isolation target). The farm-isolation test (features 00 to 02) is extended to clients, for reads **and** writes. Farm A's owner can't list, read, create into, edit, or mark inactive or active any of farm B's clients, including requests that name farm B's client records or farm B itself, and the reverse. A signed-out request gets no client data at all and can't change any. Uniqueness is per farm: farm A can add "Maple Street Market" even when farm B has it, and gets no hint that B does.
- [ ] AC29: **No personal data in logs.** Client names, phone numbers and prices don't appear in server logs, error reports or error responses, including for failed validation and server errors. Messages refer to the field ("That name already exists"), not the value. QA checks this by failing a request on purpose and reading the logs.
- [ ] AC30: **Nothing personal in the address bar.** The search text isn't put in the URL or the browser history. Nothing but the app's own view is sent to any service other than the app's own server and database.
- [ ] AC31: **Shared or lost phone.** After Sign out, the browser's Back button doesn't show the client list, and signing in as another farm on the same device shows none of the previous farm's clients.
- [ ] AC32: Only the signed-in owner of the farm can add or change its clients. There are no roles in v1 (non-goal), so every owner of a farm has the same access. The field limits (name 60, phone 30, price range and 2 decimals) are enforced by the system itself, not only by the form, so a hand-built request can't store a longer or invalid value.
- [ ] AC33: **A farm can hold at most 500 clients** (PM default, Q10). Adding the 501st is refused with a plain message such as "You've reached the limit of 500 clients", nothing is created, and the existing clients can still be edited and marked inactive or active. The list works with 500 clients (search and filters stay responsive).

**Later features rely on these rules, which this feature must not break:**
- [ ] AC34: (Not testable until Sales ships; recorded so nothing here blocks it.)
  - **Sales** stores a client on each delivery. A client can be on many sales. The Sales client picker offers **active** clients only. A sale, or a pending delivery, for a client who has since become inactive keeps that client, its name and its price, and a pending delivery can still be completed. **Marking a client inactive is always allowed**, even with pending deliveries.
  - The default price **only pre-fills** a new sale's price, which the owner can change. Changing or clearing a client's default price changes **no** past sale, because each sale keeps its own price. A price of "₱6.50 per tray" isn't converted or re-scaled if the farm's tray size changes later; Sales decides how the sale's price is entered (a line total or per tray, CL6).
  - **On-site sales may have no client.** The Clients list never contains a "Walk-in" record (CL7).
  - Renaming a client shows the **new name on past sales too**, the same as renaming a size (Q7).
  - Sales' "＋ new client" opens **this** Add client form, and returns to the sale with the new client already picked.
  - A client's sales history is the **Sales list filtered to that client** (UI spec §9 Flow G). There is no client detail screen here (Q8).

**Currency** (owner decision Q4, added 2026-09-26; numbered AC35 to AC37 so AC1 to AC34 stay as they were)
- [ ] AC35: **The currency is the farm's own data, and it defaults to Philippine peso.** Every farm has a currency. A newly provisioned farm gets **PHP (₱)** with no extra provisioning step, and so does every farm that already exists when this feature ships. It is private to each farm (farm A's currency never shows on farm B). **There is no control in this feature to change it**: no screen, button or menu item. It can only be set directly in the data, or at provisioning. The screen to change it is the follow-up "Farm settings: currency" (see Follow-ups).
- [ ] AC36: **One shared rule shows every price**, the same way one rule shows trays + loose. Every price on this screen (the list's default price, the Edit form's price prefix and any message that shows one) is shown with the farm's currency symbol **before** the amount, always with **2 decimals**, and with a thousands separator: "₱6.50", "₱250.00", "₱1,250.00". The symbol isn't hardcoded anywhere in the screens. **QA check:** with a farm's currency set to US dollars in the test data, the same clients show "$6.50 / tray" and the form prefix shows "$", with no other change, while a farm still on PHP shows "₱". A missing or unknown currency never breaks the screen: it falls back to showing the number with the ₱ symbol.
- [ ] AC37: **Changing the currency relabels prices and doesn't convert them.** A client's default price of 250.00 stays the number 250.00 when the farm's currency changes from PHP to another currency, and only the symbol changes. Nothing is re-scaled by an exchange rate. QA checks this by changing a test farm's currency in the data. The future settings feature has to warn about this before saving (see Follow-ups). Sales must do the same for the prices it stores (AC34).

**Out of scope:**
- **A screen to change the currency**, and picking from a list of currencies. Follow-up "Farm settings: currency". Also out: currency conversion, and showing more than one currency for a farm.
- **Sales, prices on sales, deliveries, pending/complete status.** The next feature. No sales columns, totals or history appear here.
- **Deleting** a client (AC21). If the owner later wants to remove a client added by mistake and never used, that needs Sales to exist first (Q5, option B). Noted for later.
- **Client detail screen** (UI spec 7c "optional for v1"; the design's "Display details" item): see Q8. The design's menu item becomes **Edit** here.
- **Last delivery date, total delivered, or any per-client total** on the list (the UI spec's optional "small stat"). They need Sales, so they follow it.
- **Address, delivery notes, email, tags**, or any field beyond name, phone and default price (Q1).
- **Different default prices per size**, or per-client price lists (Q3).
- **Importing** clients from a file or contacts, exporting, merging two clients, bulk actions (feature 01 already defers CSV).
- **Tap-to-call or tap-to-message** on a phone number. A worthwhile later addition on a phone, but it needs care with the ⋮ tap target. Noted for later.
- **Sort options** (recent, most active) and **paging**. The list is A to Z and shows everything (AC33 keeps that safe).
- **Editing or reordering** by drag, undo, and a change history or "who changed this" (multi-user, non-goal).
- Erasing a client's personal details on request (Q11).
- Non-goals, kept out and noted for later: invoicing, what a client owes and payment status; delivery routing and scheduling (an address would only feed that); offline; multi-user, roles and "who logged this"; realtime updates; flock health, feed and mortality.

**Design vs spec conflicts (for UX and the architect):**
- **CL1: The design's row menu is "Display details" and a red "Delete".** It has no Edit and no restore, and its Delete toasts "{name} deleted". The UI spec §7a asks for "view/edit, delete (consider soft-delete or archive)". PM decision: the menu is **Edit** and **Mark inactive / Mark active** (AC18, AC20). There is no Delete (AC21). It is reversible, so it isn't red. "Display details" becomes Edit (Q8).
- **CL2: Vocabulary: "Inactive" or "Archived".** The design calls the state **Active / Inactive** (badge, status filter). Feature 02 and the architecture spec call it **archived**. PM decision: the owner sees the design's words (Active, Inactive, Mark inactive, Mark active). "Archive" stays as the internal name. The architect chooses how it's stored (an archive timestamp as for sizes is the obvious fit). Q5.
- **CL3: The design has only a desktop table.** At 375px a table with a 220px search and 160px select can't fit. UI spec §11 says lists are stacked cards on mobile. PM decision: cards on mobile (AC3, AC24). UX draws them.
- **CL4: The design has no Edit and no "Edit client" form.** The Add dialog is titled "Add client" only. UI spec §7b says "Add / edit client". Edit reuses the form (AC18).
- **CL5: The design has no first-use empty state**, only "No clients match this filter." UI spec §7 says "No clients yet, add your first customer" with a button. The app's current placeholder says "Your client list is coming soon". PM decision: both states (AC7, AC22).
- **CL6: The default price has no unit in the design, and the sale "Price" is ambiguous.** The design's default prices ($6.00 to $7.25) match a **per-tray** price when read against its sample sales (240 eggs for $48, 90 eggs for $21.75 and 30 eggs for $7.00 are 8 trays at $6.00, 3 trays at $7.25 and 1 tray at $7.00, at 30 eggs per tray). Its sale form, though, shows a price of 6.50 next to a quantity of 2 trays, and its sales list shows a line total. PM decision for this feature: the default price is **per tray** (Q2). Whether a sale's own price is a line total or per tray is **the Sales feature's** call. This affects Sales, so it is raised now.
- **CL7: "Walk-in" in the design's sales.** Its sample on-site sales use the client name "Walk-in", and some on-site sales carry a real name. The architecture spec says `client_id` is null for on-site sales, with no fake "walk-in" client. PM decision: the Clients list never contains a Walk-in record (AC34). Sales shows "On-site" (or "Walk-in", as copy) for a sale with no client.
- **CL8: "Snapshotted client name".** UI spec §7a and the architecture spec say a sale keeps its "snapshotted client name/price". The data model only stores `client_id` and a price snapshot, not a name snapshot. So renaming a client renames it on past sales, unless the owner wants otherwise (Q7). The architect should correct the spec wording once Q7 is answered.
- **CL9: "Contact / address" in the specs, "Phone" only in the design.** UI spec §7b and the architecture spec list "phone / address" as optional contact. The design has a Phone field only. PM follows the design (Q1).
- **CL10: The design's default status filter is "All statuses"** and its sample list isn't sorted (Maple, Green Table, Linda, Oakhill, Sam). PM follows the design for the filter default and sets A to Z as the order (AC4, Q9). The design's search matches the name only (AC5). Its phone placeholder "(555) 000-0000" is a US format and is only a placeholder: the field accepts any phone (AC12).
- **CL11: Isolation test and personal data.** Both specs say clients should be the first isolation target, but features 00 to 02 already built the shared isolation checker. This feature adds clients to it, for writes as well as reads (AC28), and adds no-PII-in-logs and no-cache-after-sign-out expectations that earlier features didn't need (AC29 to AC31).

- **CL12: The design shows "$"; the owner chose the Philippine peso (added 2026-09-26).** The Add client form has a leading "$" and the list shows "$6.50". Owner decision Q4 overrides it: prices show in the farm's currency, **PHP (₱) by default**, and the owner wants to change the currency in Settings later. So the currency is **per-farm data, never hardcoded in the UI** (AC35, AC36), the same rule as eggs-per-tray. **For the architect (data-model change):** a per-farm currency value on the farm's own (tenant) record, defaulting to PHP for newly provisioned farms, with **every existing farm backfilled to PHP** in the same migration, read through the signed-in farm like eggs-per-tray, and formatted by one shared helper. Only the value and its default are in this feature. The architecture spec and `CLAUDE.md` should say prices are shown in a per-farm currency, and the design's "$" is a placeholder.
- **CL13: The design's price sample and placeholder are dollar-sized.** The design's placeholder is "6.50" and its default prices run $6.00 to $7.25 per tray. In pesos those look like a per-egg price, not a tray of 30, and would mislead the owner. PM decision: the form's placeholder is a neutral "0.00" (AC13), and any example numbers in copy and test data are only for format. The design's own numbers aren't used as realistic prices. The limit of 9,999.99 (AC13) stays wide enough for a peso tray price and is currency-independent for now.

**Owner decisions (answered 2026-09-26):** all matching the PM recommendations except Q4, where the owner changed the scope.
- **Q1: A.** Name (required), Phone and Default price only. No address or notes (AC8).
- **Q2: A.** The default price is **per tray** (AC13).
- **Q3: A.** One default price for all sizes.
- **Q4: changed scope.** Not "$". Prices default to the **Philippine peso (₱)**, and the owner wants to **change the currency in Settings later**. So the currency is a per-farm setting stored as data (AC35 to AC37, CL12). The settings screen to change it is a **follow-up** ("Farm settings: currency"), not part of this feature.
- **Q5: A.** No delete. "Mark inactive / Mark active", with an Active / Inactive status (AC20, AC21). Option B (a real delete for a never-used client) stays a possible follow-up after Sales.
- **Q6: A.** Names are unique within a farm, and inactive clients count (AC11).
- **Q7: A.** Renaming a client shows the new name on past sales too (AC34).
- **Q8: A.** No client detail screen. Tapping a client (or ⋮ then Edit) opens the Edit form (AC18).
- **Q9: A.** The list shows name, phone, default price and status, A to Z, with all statuses by default (AC3, AC4, AC6).
- **Q10: A.** At most 500 clients per farm (AC33).
- **Q11: A.** Erasing a client's personal details on request is handled by hand outside the app and isn't in v1.

**No open questions remain for the owner.** The currency change raised none that need an answer (see the note under "Follow-ups"). The questions below are kept for the record.

**Questions as asked (for the record; all answered above):**

- **Q1. Which client details do you keep? (ANSWERED: A)** The design has Name, Phone and Default price.
  - **A. Name (required), Phone, Default price.** As in the design.
  - **B. A + one "Address / delivery notes" box** (free text, for example "Back door, ask for Ana").
  - **C. B + email.**
  - **Recommendation: A.** It's what the design draws, it keeps adding a client to a few seconds, and you already know where your regular customers are. B is one optional field to add later without touching past data, so it can wait until you miss it. (Each extra detail is one more piece of personal data to protect.) If you pick B, AC8 to AC12 gain one field of up to 500 characters and the list doesn't show it.
- **Q2. What unit is the default price in? (ANSWERED: A, per tray)** You think in trays, and eggs are stored one by one.
  - **A. Per tray** ("$6.50 / tray"). It matches how you talk and the design's sample prices.
  - **B. Per egg** ("$0.22 / egg"). Unwieldy: 6.50 per 30 is 0.2167, which doesn't round.
  - **C. Per dozen.**
  - **Recommendation: A**, shown as "per tray" on the form and "/ tray" on the list. One thing to accept: if you ever change your tray size (30 to 24), the number stays what you typed, and the meaning of the price follows the new tray. You would update prices then. Sales must also decide whether a sale's price is a line total or per tray (CL6).
- **Q3. One default price for all sizes, or a price per size? (ANSWERED: A)** Your sizes can be edited (Settings), and in the design's sample sales larger eggs cost more.
  - **A. One default price** per client, as designed. You change the price on the sale when it differs.
  - **B. A price per size** for each client (a small grid that follows your sizes).
  - **Recommendation: A.** It's the design, it keeps the form to three fields, and B is a real feature (it interacts with adding and archiving sizes). Revisit when Sales is in use.
- **Q4. Which currency symbol? (ANSWERED: changed scope, Philippine peso, changeable later in Settings; see Owner decisions).** The design shows "$" and a US-style phone example. Nothing in the app says which currency your farm uses.
  - **A. "$"**, as designed. The app shows it and doesn't convert.
  - **B. Another symbol** (tell us which), shown before the number.
  - **Recommendation was: A only if "$" is right for you**, with a per-farm currency setting as a later Settings item. The owner went further: peso by default, and a per-farm setting stored as data from the start.
- **Q5. Removing a client, and the words for it. (ANSWERED: A)** The design has a red **Delete** that toasts "deleted". Real deleting would break past sales that point to the client.
  - **A. No delete. "Mark inactive / Mark active"** with an Active / Inactive status (the design's words). The client stays in the list, is greyed out of new sales later, and keeps its past sales. You can undo it in one tap.
  - **B. A + a real "Delete" that is only allowed for a client with no sales** (a typo or a duplicate). It needs Sales to exist, so it would be a later addition.
  - **C. Same as A, but with the words "Archive / Archived"** (the words used for sizes in Settings).
  - **Recommendation: A** now, B as a follow-up once Sales exists if you find you need it (you can also just rename a mistaken client). "Inactive" reads more naturally for a customer than "archived", and it is the design's word.
- **Q6. Can two clients have the same name? (ANSWERED: A)** Like sizes, a duplicate would make the future client picker on the Sales form show two identical names.
  - **A. No.** Names must be different, ignoring upper/lower case and spacing, and inactive clients count. Two people with the same name need something extra ("Linda Ferris (Oak St)").
  - **B. Yes,** duplicates are allowed.
  - **Recommendation: A.** Barnside, with a picker, you can't tell two "Linda Ferris"s apart. If you already have two clients with one name, tell us and we'll pick B.
- **Q7. If you rename a client, do old sales change? (ANSWERED: A)** For example, "Maple St Market" corrected to "Maple Street Market".
  - **A. Yes, old sales show the new name too.** One client is one customer, the same as renaming a size. Fixes a typo everywhere.
  - **B. No, old sales keep the name they were sold under.** This needs the app to store the name on each sale, a larger change.
  - **Recommendation: A.** The specs say "snapshotted name", but that is only right if the name must never change on old records, and nothing here needs that (the snapshot that matters is the price, which is kept).
- **Q8. Does each client get its own detail screen? (ANSWERED: A)** UI spec §7c calls it "optional for v1". The design's "Display details" only toasts.
  - **A. No.** Tapping a client (or ⋮ then Edit) opens the edit form. The customer's history is the Sales list filtered to that customer, when Sales ships.
  - **B. A read-only detail page** with the same three details.
  - **C. Detail page with their sales history,** after Sales ships.
  - **Recommendation: A.** With only three details there's nothing to show that the list doesn't. C is a natural later feature once Sales exists.
- **Q9. What does the list show and how is it ordered? (ANSWERED: A)**
  - **A (PM default). Name, phone, default price, Active/Inactive.** A to Z. All statuses shown by default (as in the design), inactive ones badged. Search by name. No last-delivery date or totals until Sales exists.
  - **B.** As A, but the list opens on **Active** only, so inactive customers are out of the way until you look for them.
  - **Recommendation: A** (the design's default), because it hides nothing surprising. B is one setting away if a long inactive list gets in the way.
- **Q10. How many clients does your farm have, and is 500 a fine limit? (ANSWERED: 500)** Each farm can hold at most 500 clients (AC33), so the list stays quick on a phone and one runaway request can't fill the database. **Recommendation: 500.** Roughly how many clients do you have today? (Typing each in is the cost of setting up. There's no import in this feature.)
- **Q11. Erasing a client's personal details on request. (ANSWERED: A)** Clients are people (and their phone numbers). Without a delete, a name and phone stay in the database even for an inactive client. **A.** Not in v1: if a customer asks, it is handled by hand outside the app (name and phone cleared). **B.** Add an in-app "Clear personal details" action for inactive clients later. **Recommendation: A** for v1. Tell us if privacy rules in your country mean you need B sooner.

**Follow-ups (future features, not in 03):**
- **Farm settings: currency (next settings item, added 2026-09-26).** A section on the Settings screen (feature 02) where the owner picks the farm's currency. It can sit beside the future "Farm settings: tray size" (feature 01 follow-up), since both change how a stored number is shown. The data (a per-farm currency, PHP by default) and the shared formatting rule already exist after this feature (AC35, AC36). That feature has to:
  - **Warn before saving** that changing the currency **relabels** every stored price (clients' default prices, and each sale's price once Sales exists) and does **not convert** them. For example: "Prices will show in US dollars. The amounts won't change." This is the same principle as the tray-size warning "Egg counts don't change" (feature 02 Q2).
  - Decide how a **currency with no decimals, or a different decimal or grouping style**, is handled, and re-check the price limit of 9,999.99 and the 2-decimal rule (AC13), which are currency-independent for now.
  - Decide whether the symbol is shown as a symbol (₱) or a code (PHP). Nothing to ask now: this feature shows the symbol, as the owner requested.
- **Delete a never-used client** (Q5, option B), once Sales exists, if the owner wants it.
- **Client detail with sales history** (Q8, option C), once Sales exists. The Sales list filtered by client already gives the history.
- **Tap-to-call** on a phone number, **address / delivery notes** and **erasing a client's personal details in the app** (Q1, Q11): all deferred, not asked for.
- **Note on the currency change:** it raised **no new owner question**. The symbol (₱) and the default (PHP) are the owner's decision. The placeholder and sample-price mismatch is a PM decision (CL13, AC13). The one thing that is the owner's to know, what a tray really costs, doesn't affect any criterion.

## 2.5 UX design (UX Designer)

**Owner decisions on the UX checkpoint (2026-09-26):**
- **Additions O1, O2, O3 are all in:** O1 a one-tap "Mark {Name} active" button in the name-taken message when the match is an inactive client; O2 the "Showing x of n · Clear" line while a search or filter is on; O3 an Inactive badge in the Edit title, and "Hidden by the Active filter" in the toast when a row leaves the current list.
- **Accents in names:** "Cafe" and "Café" are **different** names (AC11 stands: names clash ignoring case and spacing only). Search still ignores accents, so "cafe" finds "Café". The architect keeps the unique index accent-sensitive.
- **Designer's questions to the PM, taken as the designer proposed:** filters are cleared when an Edit rename would hide the row (same rule as AC14 for Add); "Discard this entry?" is the title for both Add and Edit (AC17); the "Mark {Name} active" button in the message is kept (this is O1).

**Source of truth:** the owner's design, `docs/design/source/template.html`: the Clients screen (~6416–6472: search, status select, table, row menu), the Add client dialog (~6584–6611), the top-bar label (~6775), the subtitle (~6773) and the sample data (~6681). It sits inside the feature 00 shell and reuses what features 01 and 02 built, so nothing is invented visually:
- the top-bar Add button and the phone FAB (`usePrimaryAction`, feature 01 AC1/AC31/AC32), and the toast offset above the FAB,
- the bottom-sheet / centred-dialog overlay (`ProductionFormOverlay.vue`: one `UModal` styled by breakpoint, lifted above the keypad), and `ConfirmDiscardDialog.vue`,
- cards (`bg-default`, hairline ring, 16px radius), `UBadge` `subtle`, the ⋮ `UDropdownMenu` (feature 01 day cards, feature 02 rows), the row highlight, `AppPlaceholder` for the empty state and the load-failure card (feature 01 and 02 States),
- 16px DM Sans, primary / neutral-outline / ghost buttons.

Anything marked **[proposed]** is not in the design. Nuxt UI names are approximate (v4); the frontend dev confirms the APIs. Feature 01 rules R1 to R3 (quantity format, colours, dates) don't apply here: this screen has no quantities and no dates. Design-versus-AC conflicts are in "Design conflicts: UX resolution" (U1 to U14).

### Shared rules (used by every part of this screen)

**R1. One request at a time per action, and the list only changes when the server says yes.**
- **Add and Edit:** Save shows a spinner and is disabled, the fields are read-only, and Cancel, ✕, the overlay, swipe and Esc do nothing while it runs (feature 01 "Saving"). Tapping Save many times sends one request (AC15). If it fails, every typed value stays.
- **Mark inactive / Mark active:** the row's ⋮ becomes a spinner and is disabled until the answer comes. Other rows stay usable (each is its own request). The status text changes only after success, so the screen never says something the server didn't do. Nothing needs rolling back.
- After a successful change the affected row gets the same highlight as a saved day card (`bg-primary/8`, fades over 1.5s, none with reduced motion), and it is scrolled into view if it isn't.

**R2. Where messages go.**
- A field problem: under that field, with an icon (`UFormField` error).
- A failed or refused Save in the form: an error `UAlert` above the buttons inside the form (`role="alert"`). The form stays open.
- A failed Mark inactive/active, a stale change, or a failed background refresh: an **error toast that stays until dismissed** (44px ✕, optional **Try again** action). This is a deliberate difference from feature 02, which used an alert at the top of its short card. Here the list can hold 500 clients and the owner may be far down it, so a message at the top of the list would be off screen. The row itself still shows its true status, so nothing is left wrong.
- Success: the toast (R4). It is never the only place an error shows, because success toasts vanish and error toasts don't.

**R3. Name, phone and price checks (AC10, AC12, AC13).** Checked when the field loses focus and when Save is tapped. After a message has shown, the field re-checks on every keystroke and the message clears the moment the value is valid. **Save is blocked while any message shows** (`aria-disabled`, dimmed). Before any message it is enabled, so an empty tap gives the message instead of a dead button. Enter / Go does the same as tapping Save.
- **Tidying on leaving a field:** the name is trimmed and inner runs of spaces collapse to one, and the phone is trimmed, **visibly in the field**, so what is saved is what the owner sees. A price of "6.5" becomes "6.50" when the field is left and is valid.
- **No `maxlength` on any input**, so a pasted long name shows a message instead of being silently cut (AC10).
- The first field with a message gets focus and scrolls into view when Save is tapped.
- A "name taken" message that came from the server clears as soon as the name is edited, and shows again on the next Save if it still clashes. If the client list is already loaded, the form also checks it locally on blur, with the same rule as the server (case and spacing ignored).

**R4. Toasts (AC14, AC18, AC20).** The design's toast (inverted, check icon, bottom-centre, 2.6s). On phones the Clients screen has a FAB, so the toast sits **above the FAB** (`bottom: calc(64px + env(safe-area-inset-bottom) + 84px)`), as on Production. Error toasts stay until dismissed (R2). Every toast that names a client uses the client's name as saved.

**R5. Price display (AC3, AC13, AC36).** One shared price helper (the counterpart of `formatQty`) turns a stored number and the farm's currency into text: symbol first, always 2 decimals, thousands separator: `₱6.50`, `₱250.00`, `₱1,250.00`. It is used by the list, the form's prefix and any message that shows a price. The list adds ` / tray`. The symbol is never typed into a screen. A missing or unknown currency shows the number with ₱ and doesn't break anything. The design's "$" is a placeholder (CL12).

**R6. Status is always text.** "Active" (`UBadge` success, subtle) and "Inactive" (`UBadge` neutral, subtle) both say the word. Inactive rows are **not dimmed**, so they stay readable in sunlight.

**R7. Missing values are a dash with a spoken label.** No phone: "—" with hidden text "No phone". No default price: "—" with hidden text "No default price". The dash is `aria-hidden` and the hidden text is `sr-only`, so screen readers don't read "em dash".

**R8. Names never truncate on phones.** A 60-character name wraps to two or three lines and the card grows. On desktop the name column wraps too. Nothing scrolls sideways (AC24).

### Flow

**Getting there.** Tap **Clients** in the bottom tabs (phone) or the sidebar or rail (tablet, desktop). **1 tap.** The Clients tab is highlighted, the title is "Clients" and the subtitle is "5 customers" ("1 customer", "0 customers"), counting active and inactive clients and not changing with the filters (AC1, AC6). The screen replaces the "coming soon" placeholder (`app/pages/clients.vue`). Still five tabs.

**A. Add a client (AC8, AC9, AC14)**
`Clients → + (FAB on phones, "Add client" in the top bar on tablet and desktop) → Add client sheet (Name focused, keypad open) → type the name → Save or the keypad's Go → sheet closes → toast "Added Maple Street Market" → the new card is in its A to Z place, scrolled into view and highlighted`
1. Tap **+**. The sheet opens with all three fields empty and **Name focused**. Phones get the keypad at once: unlike the Log production form (feature 01), this sheet is short and the sheet is lifted above the keypad, so nothing the owner needs is covered. If iOS refuses the programmatic focus, it costs one extra tap on Name.
2. Type the name. That alone is enough (AC9).
3. **Save**, or **Go** on the keypad, or Enter on desktop.
- For a phone number and a price: tap **Phone** and type (numeric phone keypad), tap **Default price** and type (decimal keypad), then **Save**. The order doesn't matter, and every field is optional apart from Name.
- **After Save:** the sheet closes, focus returns to the **+** or **Add client** button that opened it, the toast shows, and the new row is scrolled into view (centred) and highlighted. If the current search or status filter would hide the new client, both are cleared first (AC14), so the search box empties and the status goes back to "All statuses".
- **Main path:** phone **2 taps + typing** (+, Save). With a phone and a price: **4 taps + typing**. Desktop: **2 clicks** (Add client, then Save or Enter).
- **Name matches an inactive client:** the message points to marking it active, with a one-tap button (flow F).

**B. Edit a client (AC18, AC19)**
`Clients → tap the card (phone) / click the row or its name (desktop) → Edit client sheet (pre-filled) → change a field → Save → toast "Updated Maple Street Market" → the row is updated and highlighted`
- Also reachable through the row's ⋮, then **Edit** (2 taps). Same form, titled **Edit client**, for active and inactive clients. An inactive client shows an **Inactive** badge beside the title so the owner knows what they opened [proposed].
- Fields are pre-filled. The price is pre-filled as plain digits with 2 decimals (`250.00`, no symbol or separator) so it is easy to change. The keypad is not opened on phones (the owner hasn't said which field to change). Desktop focuses Name with its text selected. Focusing a pre-filled field selects its content, so typing replaces it (feature 01).
- Emptying Phone or Default price removes it (the list then shows the dash).
- **Save with nothing changed** closes the form: no request, no toast (AC18). A change of capitalisation or spacing in the name is a real change and saves, and never clashes with the client's own name.
- If the change would hide the row from the current search (a rename), the search and status filter are cleared so the owner sees it [proposed extension of AC14, Question 1].
- **Main path (phone):** tap the card (1), tap the field (2), **Save (3)**, plus typing. Via ⋮: 4 taps.

**C. Mark inactive / Mark active (AC20, AC21)**
`Clients → ⋮ on the card or row → Mark inactive → the status text changes in place → toast "Marked Oakhill Bakery inactive"`
- **2 taps**, no confirmation: nothing is lost and the other action undoes it in two more taps. Name, phone and price stay.
- **Mark active** on an inactive client is the same, 2 taps.
- If the current status filter would hide the row after the change, it leaves the list and the toast says why (see Copy): `Marked Oakhill Bakery inactive. Hidden by the Active filter.` Focus moves to the next row's ⋮ (or to the search box if none is left).
- If the row stays in view, it is highlighted and focus returns to its ⋮.
- If the client is already in the wanted state (changed on another phone), the app treats it as done: same status, same toast, no scary message.

**D. Search and filter (AC5, AC6, AC7)**
`Clients → tap the search box → type "cafe" → the list narrows as you type ("The Green Table Café" stays)`
- **1 tap + typing.** No Enter, no reload. Matches any part of the name, ignoring case, accents and leading/trailing spaces. Clearing the box (✕ inside the box, or select-all and delete) shows everything again.
- **Status:** the select next to it: **All statuses** (default), **Active**, **Inactive**. **2 taps** (open, choose). Both must match. The subtitle count doesn't change.
- While a search or filter is on, a line under the filter row says `Showing 3 of 12` with a **Clear** button (returns to an empty search and All statuses in one tap) [proposed].
- Search text is never put in the address bar, so refreshing the page clears it (AC30). The search and filter reset on a fresh visit to the screen and last while the owner stays on it (as on Production).
- Nothing matches: the "No clients match this filter." state (see States), with **Clear filters**.

**E. First use (AC22)**
`Clients (no clients yet) → empty card "No clients yet" → Add client → the same form (flow A)`
- The filter row and the "Showing" line are hidden, the top-bar button or FAB is still shown, and the card has its own **Add client** button. After the first save the empty card is replaced by the list with the new client highlighted.

**F. Name matches an inactive client (AC11) [proposed button]**
`Add client → type "oakhill bakery" → Save (or leave the field) → message "Oakhill Bakery is on your list, but marked inactive. Mark it active instead." with a "Mark Oakhill Bakery active" button → tap → the sheet closes, toast "Marked Oakhill Bakery active", the row is highlighted`
- **1 extra tap**, and the typed name doesn't need retyping. Same idea as feature 02's Restore button in its message. The button is on **Add only**. In **Edit**, the message is text only ("Pick another name, or mark it active from the list."), because reactivating a different client from inside another client's Edit form would be surprising.
- If it fails, an error alert in the form: `Couldn't mark Oakhill Bakery active. Check your connection and try again.`

**G. Something changed elsewhere (AC19)**
`Edit → Save → the server says this client has changed since the form opened → the form closes → the list refreshes → a toast says so → nothing was changed by mistake`
- The owner sees the current data and taps the card again. The typed edits are dropped (three short fields, so it is cheap to redo). The same handling shows if the change was a rename that now clashes.

**H. Discard (AC17)**
Cancel, ✕, a tap on the overlay, swiping the sheet down and Esc all do the same thing.
- **Add:** if all three fields are empty (spaces only count as empty), the form closes at once. If anything was typed: "Discard this entry?" with **Keep editing** (focused, the safe choice) and **Discard**.
- **Edit:** if nothing differs from the pre-filled values, it closes at once. Otherwise the same dialog with the Edit wording (see Copy and conflict U10).
- While saving, closing is disabled. It is the same `ConfirmDiscardDialog` as feature 01.

**I. Errors while saving (AC16, AC33)**
- **No signal or a server error:** the alert in the form says `Couldn't save. Check your connection and try again.` Values stay, Save is active again, and tapping it retries. If the first try actually reached the server, the retry ends with **one** client and no "already exists" message (AC15).
- **500-client limit:** the alert in the form says `You've reached the limit of 500 clients. You can still edit the ones you have.` and nothing is created. No message tells the owner to delete something, because clients can't be deleted, and inactive clients count toward the 500.

### Layouts

Wireframes aren't to scale. Legend: `[x]` enabled button · `(x)` disabled or secondary · `[⋮]` menu button · `(HF)` avatar. Example names come from the design. **Prices in wireframes only show the format** (CL13).

#### Clients, mobile (~375px), default
Main area `bg-muted`, p-4 (shell). Bottom padding clears the tab bar **and** the FAB: `calc(64px + env(safe-area-inset-bottom) + 84px)` (AC24, same as Production). Below about 640px of content width (all phones, and a tablet with the sidebar open) the list is stacked cards.
```
┌───────────────────────────────────────────┐
│ Clients                             (HF)  │ top bar (shell). Subtitle = all clients, active + inactive
│ 5 customers                               │ No Add button on phones
├───────────────────────────────────────────┤
│ [🔍 Search clients…    ✕] [All statuses ▾]│ UInput 44px (label hidden, aria-label "Search clients") +
│                                           │ USelect (native) 44px, aria-label "Filter by status".
│                                           │ Wraps to two full-width rows when it doesn't fit.
│ ┌───────────────────────────────────────┐ │ card: bg-default, ring, rounded-2xl, p-4. The whole card
│ │ The Green Table Café             [⋮]  │ │ is one tap target (opens Edit); ⋮ is a separate 44×44 button
│ │ (555) 488-2210                        │ │ name: text-base 600 highlighted, wraps. phone: text-default
│ │ ₱250.00 / tray            [ Active ]  │ │ price: text-base 600. badge: UBadge success subtle, text
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Linda Ferris                     [⋮]  │ │
│ │ —  (No phone)                         │ │ dash = "No phone" for screen readers
│ │ —  (No default price)     [ Active ]  │ │ dash = "No default price"
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Maple Street Market              [⋮]  │ │
│ │ (555) 201-3348                        │ │
│ │ ₱1,250.00 / tray          [ Active ]  │ │ shared price rule: symbol, 2 decimals, thousands
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Oakhill Bakery                   [⋮]  │ │
│ │ (555) 375-1190                        │ │
│ │ ₱235.50 / tray          [ Inactive ]  │ │ UBadge neutral subtle. Not dimmed.
│ └───────────────────────────────────────┘ │
│ ┌ Sam & Dana Coyle … ───────────────────┐ │
│                                     (＋)  │ FAB 52px, primary, bottom: 64px + safe area + 16px, right 16px
├───────────────────────────────────────────┤ aria-label "Add client". Hidden while a sheet or dialog is open
│ Dashboard Production Sales Inv [Clients]  │ tabs (Clients highlighted)
└───────────────────────────────────────────┘
```
- **Width check at 375px:** the card inner width is 343 − 32 = 311px. Name column = 311 − 44 (⋮) − 8 = 259px, so "The Green Table Café" (about 175px) fits on one line and a 60-character name wraps to three. The search box gets about 187px beside a 148px status select. Below about 340px wide (small phones, or large text) the two controls wrap to full-width rows.
- **Card tap area:** the name is a real `<button>` (accessible name `Edit {Name}`) that stretches over the whole card (`after:absolute after:inset-0`). The ⋮ button sits above it (`relative z-10`), so it opens the menu and doesn't open Edit. Tapping the phone or the price opens Edit as well. There is no tap-to-call (out of scope).
- **The card gives a pressed state** (`active:bg-elevated`) so a tap feels received.
- **No avatar/initials on phones** (the design has them in the table): the name needs the width.
- **Card height** is about 108px (three rows), so about five clients show on a 667px-tall phone before scrolling.

#### Row menu (⋮), mobile and desktop
`UDropdownMenu`, opens down, right-aligned to the button. Items are 44px tall on phones and tablets (36px at lg). Neither item is red (nothing is deleted, CL1).
```
   Active client                  Inactive client
┌────────────────────┐          ┌────────────────────┐
│ ✎  Edit            │          │ ✎  Edit            │  i-lucide-pencil
│ ⊘  Mark inactive   │          │ ✓  Mark active     │  i-lucide-user-x / i-lucide-user-check
└────────────────────┘          └────────────────────┘
```
- The trigger's accessible name is `Actions for {Name}`. Edit is first, so the most common action is the first thing under the thumb. Esc or a tap outside closes it and returns focus to the ⋮.
- Item order is fixed (Edit first) so the muscle memory is the same for every row.

#### Clients, desktop (≥1024px) and tablet (768–1023px), default
Content centred at max 1120px (shell). The design's table is used whenever the content area is at least about 640px wide, which covers desktop and a tablet with the sidebar collapsed to the rail. **A tablet with the sidebar expanded has only about 500px** (768 − 224 − padding), which is too narrow for five columns, so the list falls back to the phone cards there (AC25). The switch is a container query on the content area, not the screen width (SSR-safe, pure CSS).
```
┌──────────────┬───────────────────────────────────────────────────────────────────────────┐
│ [logo] Tamago│ «  Clients                                              [ + Add client ]  │ UButton primary, lg; 44px on tablet
│              │    5 customers                                                            │ top bar #right slot (AC2)
├──────────────┼───────────────────────────────────────────────────────────────────────────┤
│  Dashboard   │ [🔍 Search clients…      ]                                [All statuses ▾]│ design: search 220px left, select 160px right
│  Production  │ ┌───────────────────────────────────────────────────────────────────────┐ │ table wrapper: bg-default, ring, rounded-xl (design)
│  Sales       │ │ Client                  Phone           Default price  Status        │ │ header: text-sm 500 muted (design). No sorting.
│  Inventory   │ ├───────────────────────────────────────────────────────────────────────┤ │
│ ▌Clients     │ │ (MS) Maple Street Market (555) 201-3348  ₱1,250.00 / tray [Active] [⋮]│ │ avatar initials 32px, decorative (aria-hidden)
│              │ │ (TG) The Green Table Café(555) 488-2210    ₱250.00 / tray [Active] [⋮]│ │ name 600. Row = one click target that opens Edit
│              │ │ (LF) Linda Ferris        —                          —     [Active] [⋮]│ │
│              │ │ (OB) Oakhill Bakery      (555) 375-1190    ₱235.50 / tray [Inactive][⋮]│ │ rows 56px (48px at lg); ⋮ 44px (40px at lg)
│              │ │ (SD) Sam & Dana Coyle    (555) 903-4471    ₱250.00 / tray [Active] [⋮]│ │
│              │ └───────────────────────────────────────────────────────────────────────┘ │
│              │                                                                           │
│  ──────────  │                                                                           │
│ (JH) Hendri… │                                                                           │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```
- **Table:** `UTable` (or a plain `<table>`; the frontend picks) with columns Client, Phone, Default price (right-aligned), Status (right-aligned) and an actions column (44px). Not sortable (A to Z is fixed, AC4). A visually hidden `<caption>` says "Clients".
- **Row click** opens Edit (owner decision Q8, AC18). The name is a real `<button>` (`Edit {Name}`) so keyboard and screen readers can reach it. The ⋮ is a separate button and doesn't trigger the row click.
- **Phone text is `text-default`**, not the design's muted grey, because the owner reads it to call someone, and muted grey is too faint in sunlight (U7).
- **Avatar initials** (design): the first letter of each of the first two words that start with a letter or digit, in capitals ("Sam & Dana Coyle" is `SD`, not the design's rule that would give `S&`). Purely decorative; screen readers skip it.
- **Toolbar:** the design's row, kept: search 220px at left, status 160px at right. On tablet both are 44px tall.
- The `Showing 3 of 12 · Clear` line appears between the toolbar and the table only while a search or filter is on.

#### Add client: mobile bottom sheet (~375px)
The design's own client dialog already turns into a bottom sheet on phones (bottom-aligned, top corners 16px). This is the same overlay as the Log production sheet: `UModal` styled as a sheet below `md`, `max-height: min(88dvh, visual viewport − 1rem)`, lifted above the keypad (`--sheet-kb`), overlay `rgba(15,23,43,.5)` + 4px blur. Header and footer are fixed and the body scrolls. Body padding 16px.
```
┌───────────────────────────────────────────┐
│ Add client                           [✕]  │ header: text-lg 700 · ✕ 44×44
├───────────────────────────────────────────┤
│ Name                                      │ UFormField label (text-base 500). Required, no asterisk
│ [ e.g. Maple Street Market              ] │ UInput 44px, focused on open, autocapitalize="words"
│                                           │
│ Phone                            Optional │ hint (UFormField hint slot), text-sm dimmed
│ [ 0917 123 4567                         ] │ UInput type="tel" inputmode="tel" 44px
│                                           │
│ Default price                    Optional │
│ [ ₱ │ 0.00                     per tray ] │ UInput, inputmode="decimal", leading "₱" (farm currency),
│ For one tray. Leave blank if there's no   │ trailing "per tray" text-muted. help: text-sm dimmed
│ usual price.                              │
├───────────────────────────────────────────┤ footer: pinned above the keypad
│ [ Cancel ]   [          Save          ]   │ Cancel: ghost 44px · Save: primary, flex-1, 44px
└───────────────────────────────────────────┘ + safe-area bottom padding
```
- **Height:** header 56 + body about 290 + footer 76 = about 420px. With the keypad open on a 667px phone the visual viewport is about 370px, so the body scrolls a little, Save stays pinned, and Name is in view. The FE verifies on iOS Safari and Android Chrome (feature 01 AC5).
- **Input attributes:**
  - Name: `type="text"`, `autocapitalize="words"`, `autocomplete="off"`, `autocorrect="off"`, `spellcheck="false"`, `enterkeyhint="go"`.
  - Phone: `type="tel"`, `inputmode="tel"`, `autocomplete="off"`, `enterkeyhint="go"`. **Note:** the iOS phone and decimal keypads have no Return key, so on iPhone the owner taps Save (it is pinned and always visible). Android shows Go.
  - Default price: `type="text"` with `inputmode="decimal"` (not the design's `type="number"`, see U4), `autocomplete="off"`, `enterkeyhint="go"`, `aria-describedby` on the help and error.
  - Every field has a visible label. Errors and help are linked with `aria-describedby`; `aria-invalid` is set while a message shows.
- **Enter / Go saves from any field** (one rule, the same as feature 02's inline forms). Moving between fields is by tapping or, on desktop, Tab. Name-only is the main path, so Go from Name saves; if a phone was meant to follow, Edit is 3 taps away.
- **Price field:** the prefix comes from the farm's currency and the "per tray" text is always shown, so the number is never ambiguous (AC13). The prefix and "per tray" sit **inside** the field (leading and trailing slots). The label doesn't change with the currency.
- **Placeholders:** Name is the design's `e.g. Maple Street Market`. Price is a neutral `0.00` (AC13, CL13). Phone is `0917 123 4567` in place of the design's US `(555) 000-0000`, because the farm's currency is pesos (U12).

#### Add client: desktop dialog (≥768px)
`UModal`, centred, max-width **420px** (design), 16px radius. Body padding 20px, fields 14px apart (design). Fields are `lg` (40px) at desktop and 44px on tablet.
```
┌──────────────────────────────────────────────┐
│ Add client                              [✕]  │
├──────────────────────────────────────────────┤
│ Name                                         │
│ [ e.g. Maple Street Market                 ] │ focused on open
│ Phone                               Optional │
│ [ 0917 123 4567                            ] │
│ Default price                       Optional │
│ [ ₱ │ 0.00                        per tray ] │
│ For one tray. Leave blank if there's no      │
│ usual price.                                 │
├──────────────────────────────────────────────┤
│                        [ Cancel ]  [ Save ]  │ right-aligned (design)
└──────────────────────────────────────────────┘
```

#### Edit client (same form)
```
┌───────────────────────────────────────────┐
│ Edit client  [Inactive]              [✕]  │ badge only for an inactive client
├───────────────────────────────────────────┤
│ Name                                      │
│ [ Oakhill Bakery                        ] │ pre-filled; not focused on phones
│ Phone                            Optional │
│ [ (555) 375-1190                        ] │
│ Default price                    Optional │
│ [ ₱ │ 235.50                    per tray ] │ plain digits, 2 decimals
│ For one tray. Leave blank if there's no   │
│ usual price.                              │
├───────────────────────────────────────────┤
│ [ Cancel ]   [          Save          ]   │
└───────────────────────────────────────────┘
```
- No Delete and no "Mark inactive" in the form. Mark inactive / active lives in the row menu only (AC20, AC21).

#### Validation and error variants (sheet, mobile)
```
 Name matches an active client            Name matches an inactive client (Add)
│ Name                              │    │ Name                                       │
│ [ maple street market        ⚠ ]  │    │ [ oakhill bakery                      ⚠ ]  │
│ ⚠ You already have a client       │    │ ⚠ Oakhill Bakery is on your list, but      │
│   called Maple Street Market.     │    │   marked inactive. Mark it active instead. │
│                                   │    │   [ ✓ Mark Oakhill Bakery active ]         │ 44px, ghost/link
│ Price with a problem              │    │ Save failed
│ [ ₱ │ 6.505                  ⚠ ]  │    │ ┌ (!) Couldn't save. Check your connection ┐│ error UAlert above the footer
│ ⚠ Use 2 decimals at most, like    │    │ └     and try again.                       ┘│ values stay; Save active again
│   6.50.                           │    │ [ Cancel ]   [        Save        ]         │
```
- An invalid field gets an error ring, an icon and the message, never a red ring alone. **Save is dimmed (`aria-disabled`) while a message shows.**
- The "Mark {Name} active" button is a `UButton` link/ghost, 44px, with a check icon.

#### Empty, no-match, loading and load-failure (mobile, inside the main area)
```
 First use (AC22)                       No match (AC7)                       Load failure (AC23)
┌──────────────────────────────┐   [🔍 zzz          ✕] [All statuses ▾]  ┌──────────────────────────────┐
│           (◯ users)          │   Showing 0 of 12   [ Clear ]           │          (☁︎ off)             │
│       No clients yet         │   ┌──────────────────────────────┐      │  Couldn't load your clients  │
│ Add your first customer.     │   │ No clients match this filter.│      │  Check your connection and   │
│ Keep their phone and usual   │   │ [   Clear filters   ]        │      │  try again.                  │
│ price here.                  │   └──────────────────────────────┘      │  [ ⟳ Try again ]             │
│ [ + Add client ]             │                                          └──────────────────────────────┘
└──────────────────────────────┘
 Loading (AC23): filter row shown but disabled · 5 card skeletons (USkeleton, ~108px, rounded-2xl) · subtitle blank
```
- First use and load failure use the `AppPlaceholder` card look (56px tinted circle, heading, body, button), max 560px, centred at the top.
- Skeletons on desktop are 5 table-row skeletons under the real header.

#### Discard dialog
The existing `ConfirmDiscardDialog` (centred at every width, max 400px, buttons stacked with **Discard** on top on phones, **Keep editing** focused by default). Only the wording is new (see Copy).

### States

| Area | State | What the owner sees |
|---|---|---|
| Screen | **Loading (AC23)** | Title "Clients" and no subtitle (never "0 customers" while loading). The filter row renders **disabled**. In place of the list: **5 skeletons** (cards on phones, rows on desktop). The empty state never shows while loading. The FAB and Add client stay visible and work (the form doesn't need the list). |
| | **Default** | Subtitle "{n} customers", the filter row, the list A to Z (active and inactive mixed, AC4). |
| | **Refreshing** | If the list is already known, it shows at once and refreshes quietly (no skeleton, no spinner). A quiet refresh that fails changes nothing on screen except an error toast (see Load failure). |
| | **Load failure (AC23)** | In place of the filter row and list: the card with `i-lucide-cloud-off`, heading "Couldn't load your clients", body "Check your connection and try again.", **Try again** (primary, xl, `i-lucide-refresh-cw`, spinner while retrying). No blank screen, no empty state. Subtitle hidden. Add client and the FAB stay. If a **refresh fails while the list is showing**, the list stays and an error toast says "Couldn't refresh your clients." with **Try again**. |
| | **First use (AC22)** | `AppPlaceholder`: `i-lucide-users`, "No clients yet", "Add your first customer. Keep their phone and usual price here.", **Add client** (primary, xl, `i-lucide-plus`). Filter row hidden. Subtitle "0 customers". No sample clients (none of the design's five names). |
| | **No match, search (AC7)** | Filter row stays usable. Below it `Showing 0 of {n}` + **Clear**. In the list area: "No clients match this filter." and a **Clear filters** button (outline, 44px). Clearing puts focus in the search box. |
| | **No match, status only** | Same headline (the design's copy). A second line explains the two likely cases: Inactive with none: "You haven't marked any clients inactive." Active with none: "All your clients are marked inactive." |
| | **Filtered** | `Showing {x} of {n}` + **Clear** (only while a search or status filter is on). The subtitle count stays at {n}. The list has no client that doesn't match. |
| | **Live result count** | A visually hidden `aria-live="polite"` line announces "{x} clients" after typing pauses (about 500ms), so a screen-reader user hears the effect of the search. |
| | **Just changed** | Row highlight (R1) and a toast (R4). |
| | **Signed out (AC31)** | Sign out is in the account menu (unchanged). On sign-out the client list, the search text, the filter and any open form are discarded and nothing about clients stays in memory or the URL. Back doesn't show the list (signed-out pages go to the login screen). Signing in as another farm starts at **Loading**, and never shows the previous farm's clients even for a moment. |
| | **Session expired while a form is open** | The shell takes over (feature 00) and the owner goes to sign-in. Typed values in the open form are lost. No extra design, noted so nobody is surprised. |
| Row | **Default** | Name, phone or dash, price or dash, status text, ⋮. |
| | **Inactive** | Same as Default with the **Inactive** badge. Not dimmed. |
| | **Long name** | Wraps to more lines. Never truncated or scrolled. |
| | **Pressed** | Card pressed state on phones, row hover on desktop. |
| | **Busy (R1)** | The ⋮ shows a spinner and is disabled. The status text is unchanged until the answer comes. |
| | **Just changed** | 1.5s highlight. Scrolled into view. |
| | **Mark failed** | Error toast (stays until dismissed): "Couldn't mark {Name} inactive. Check your connection and try again." with **Try again**. The row is unchanged and its ⋮ works again. |
| | **Changed elsewhere** | The list refreshes and an error toast says "This client was changed somewhere else. The list is up to date now." (AC19). |
| Menu | **Open** | Edit, and Mark inactive (active client) or Mark active (inactive client). |
| Form (Add and Edit) | **Default (Add)** | Empty fields, Name focused, Save enabled. |
| | **Default (Edit)** | Pre-filled. An **Inactive** badge by the title if the client is inactive. Save enabled. |
| | **Validation: Name (AC10, AC11)** | Blank, too long, hidden characters, matches an active client, matches an inactive client. Messages in Copy. |
| | **Validation: Phone (AC12)** | Longer than 30 characters, hidden characters. |
| | **Validation: Price (AC13)** | Zero or negative, not a number, more than 2 decimals, above the limit. |
| | **Save blocked** | Save is dimmed and `aria-disabled` only while a message shows. |
| | **Saving (AC15)** | Save shows a spinner and is disabled, fields are read-only, Cancel/✕/overlay/swipe/Esc do nothing. Many taps still send one request. |
| | **Double tap / lost reply (AC15)** | The retry reuses the same submit, so the owner ends with one client and never sees "name already exists" about the client just saved. |
| | **Save failed (AC16)** | Error alert above the buttons: "Couldn't save. Check your connection and try again." Every typed value stays, Save is active again, and tapping it retries. Nothing was created. |
| | **Limit reached (AC33)** | Alert: "You've reached the limit of 500 clients. You can still edit the ones you have." Values stay. Nothing is created. |
| | **Nothing changed (Edit, AC18)** | Save closes the form. No request, no toast. |
| | **Changed elsewhere (Edit, AC19)** | The form closes, the list refreshes, the error toast (Copy) shows. |
| | **Discard check (AC17)** | The dialog in flow H. |
| | **Success (AC14, AC18)** | The form closes, the toast shows, the row is highlighted (R1). |
| Success | **Toasts** | Wording in Copy. Names are the client's own. |
| Theme | **Light / dark (AC26)** | Text uses `text-default` / `text-highlighted` / `text-muted` tokens on `bg-default` cards. Status is a text badge. Errors have an icon and text. Disabled buttons are dimmed and `aria-disabled`. |

### Copy

| Where | Text |
|---|---|
| Top bar (design) | **Clients** · `{n} customers` (`1 customer`, `0 customers`) |
| Add button (desktop and tablet) / FAB aria-label | **Add client** / `Add client` |
| Search | Placeholder `Search clients…` (design) · hidden label `Search clients` · clear button aria-label `Clear search` |
| Status filter | Hidden label `Filter by status` · options **All statuses** · **Active** · **Inactive** (design) |
| Filtered line | `Showing {x} of {n}` · button **Clear** |
| Card / table | Table headers **Client** · **Phone** · **Default price** · **Status** (design) · price `₱250.00 / tray` · no phone `—` (hidden text `No phone`) · no price `—` (hidden text `No default price`) · badges **Active** · **Inactive** |
| Row aria | name button `Edit {Name}` · menu button `Actions for {Name}` |
| Row menu | **Edit** · **Mark inactive** · **Mark active** |
| Form titles | **Add client** (design) · **Edit client** |
| Form labels (design) | **Name** · **Phone** · **Default price** · hint on the last two: `Optional` |
| Placeholders | Name `e.g. Maple Street Market` (design) · Phone `0917 123 4567` · Price `0.00` |
| Price affixes and help | prefix = the farm's currency symbol (`₱`) · trailing `per tray` · help `For one tray. Leave blank if there's no usual price.` |
| Buttons | **Cancel** · **Save** (both Add and Edit, as in the design) · close ✕ aria-label `Close` |
| Name: blank (AC10) | `Enter a name.` |
| Name: too long (AC10) | `Use 60 characters or fewer.` |
| Name: hidden characters (AC10) | `This name has a hidden character. Try typing it instead of pasting.` |
| Name: matches an active client (AC11) | `You already have a client called {Existing name}.` |
| Name: matches an inactive client, Add (AC11) | `{Existing name} is on your list, but marked inactive. Mark it active instead.` + button **Mark {Existing name} active** |
| Name: matches an inactive client, Edit (AC11) | `{Existing name} is on your list, but marked inactive. Pick another name, or mark it active from the list.` |
| Phone: too long (AC12) | `Use 30 characters or fewer.` |
| Phone: hidden characters (AC12) | `This phone number has a hidden character. Try typing it instead of pasting.` |
| Price: not a number (AC13) | `Use numbers only, like 250.00.` (a comma is refused too, so "6,5" is never silently read as 65) |
| Price: zero or negative (AC13) | `Enter a price above 0, or leave it blank.` |
| Price: more than 2 decimals (AC13) | `Use 2 decimals at most, like 6.50.` |
| Price: above the limit (AC13) | `The most you can enter is ₱9,999.99.` (the amount from the shared price rule, so it follows the farm's currency) |
| Save failed (AC16) | `Couldn't save. Check your connection and try again.` |
| Limit reached (AC33) | `You've reached the limit of 500 clients. You can still edit the ones you have.` |
| Mark-active shortcut failed | `Couldn't mark {Name} active. Check your connection and try again.` |
| Toast: add (AC14) | `Added {Name}` |
| Toast: edit (AC18) | `Updated {Name}` (the new name if it changed) |
| Toast: mark inactive (AC20) | `Marked {Name} inactive` · row leaves the view: `Marked {Name} inactive. Hidden by the Active filter.` |
| Toast: mark active (AC20) | `Marked {Name} active` · row leaves the view: `Marked {Name} active. Hidden by the Inactive filter.` |
| Toast (error): mark failed | `Couldn't mark {Name} inactive. Check your connection and try again.` / `…active…` · action **Try again** |
| Toast (error): changed elsewhere (AC19) | `This client was changed somewhere else. The list is up to date now.` |
| Toast (error): refresh failed | `Couldn't refresh your clients.` · action **Try again** |
| Discard, Add (AC17) | Title **Discard this entry?** · body `What you typed won't be saved.` · **Keep editing** · **Discard** |
| Discard, Edit (AC17) | Title **Discard this entry?** · body `Your changes to {Name} won't be saved.` · **Keep editing** · **Discard** |
| First use (AC22) | Heading **No clients yet** · body `Add your first customer. Keep their phone and usual price here.` · button **Add client** |
| No match (AC7, design) | `No clients match this filter.` · button **Clear filters** · second line (status only) `You haven't marked any clients inactive.` / `All your clients are marked inactive.` |
| Load failure (AC23) | Heading **Couldn't load your clients** · body `Check your connection and try again.` · **Try again** |
| Loading | (no text; skeletons) |

Notes on the wording:
- "Client" in the screen, tab and form (the design's word); "customers" only in the subtitle, as the design has it. "Inactive" and "Mark inactive / Mark active" are the owner's words; "archive" never shows (CL2).
- No message says "invalid", "conflict", "constraint", "duplicate" or "unique". Messages name the field or the client and say what to do.
- "Trays" appears only as "per tray" and "/ tray". Nothing says "eggs" on this screen.
- Names in messages use the existing client's own capitalisation ("maple street market" gets `You already have a client called Maple Street Market.`).
- No message repeats a phone number or a price the owner typed (AC29). The price limit message shows the limit, not the typed value.

### Quantity entry
This screen has no egg quantities, so the trays + loose input isn't used and the open convention question doesn't arise (two fields, already decided). The only number is the **price per tray**, a single decimal field (R5).

### How the Sales client picker will reuse this form (AC34)
No Sales design is drawn here. The requirement this design puts on the build:
- **One self-contained form component** (fields, checks, the discard check, and the save call), hosted by a thin overlay. The Clients screen hosts it. The Sales client picker's "＋ new client" hosts the **same** component in the **same** overlay. Nothing in it knows which screen opened it.
- **It returns the created client** (its id, name and default price) to whoever opened it, so Sales can pick that client and pre-fill the price. It does not navigate.
- **It opens on top of the sale form** (a second sheet or dialog above the first), so the sale's typed values stay untouched underneath. Closing it returns focus to the picker. The FAB and Add button are hidden while any overlay is open.
- **It accepts an optional starting name**, so a name typed into the picker's search ("Maple") can pre-fill Name. Sales UX decides whether to use it.
- **Same rules everywhere:** the same messages, the same limit message, the same "Mark {Name} active" shortcut in the name message (Sales should pick the reactivated client), the same discard check.
- After a save, any cached client list (this screen's, the picker's) must refresh so the new client shows in both.
- The Sales picker offers **active** clients only, and never a "Walk-in" record (AC34, CL7). That is Sales' design.

### Account and navigation behaviour
- The **Clients tab** (bottom tabs) and sidebar item show the Clients screen in place of the placeholder. Still five destinations, the tab is highlighted at `/clients`. Title and `<title>` are "Clients" (`Clients · Tamago`).
- **Top-bar Add client** (tablet and desktop) and the **FAB** (phones) show only on this screen and are wired through the same primary-action mechanism as Production. Production's "Add production" and the FAB elsewhere are unchanged. Settings still has none.
- **Sign out** is unchanged (avatar menu on phones, account row in the sidebar). See the Signed-out state for what it clears.
- Nothing personal goes in the address bar or history: the search, the filter and an open form are held in memory only (AC30). Reloading the page returns to All statuses with an empty search.
- The **Settings → Sizes** screen and Production are unaffected. Nothing here changes any egg count (AC27).

### Accessibility
- **Tap targets ≥ 44px on phones and tablets (AC24):** FAB (52px), search box and its clear ✕, the status select, the whole card, the ⋮, menu items, the form fields, Cancel and Save, the sheet ✕, the "Mark {Name} active" button, **Clear** / **Clear filters**, **Try again**, dialog buttons, error-toast ✕ and action. Neighbouring 44px targets are at least 4px apart. At lg and up controls may be 40px (table ⋮ 40px, rows 48px), as in feature 01.
- **No tiny hit areas:** the design's ⋮ (~28px) and inputs (36px) are raised (U8). The card's ⋮ is separate from the card's own tap area so a thumb never opens the wrong thing.
- **Labels on every input:** the form fields have visible labels; the search and status controls have hidden labels (`Search clients`, `Filter by status`) because their purpose is clear from the placeholder and selected value. `aria-describedby` links help and errors, and `aria-invalid` is set on a field with a message. Icon-only buttons name the client (`Actions for {Name}`).
- **Keypads:** Name `autocapitalize="words"`, Phone `inputmode="tel"`, Price `inputmode="decimal"`. iOS has no Return key on those last two, so Save is always pinned and visible.
- **Not colour alone:** status is the word Active or Inactive; errors are an icon plus text; the missing phone and price have a text alternative; there are no colour-only cues anywhere on the screen.
- **Sunlight contrast:** names and prices use `text-highlighted` / `text-default`; the phone is `text-default` (U7); only headers, hints and help are `text-muted` / `text-dimmed`. Inactive rows aren't dimmed.
- **Focus:**
  - Opening Add focuses Name. Opening Edit focuses Name only on desktop; on phones focus starts on the sheet (no keypad until the owner picks a field). Dialogs and sheets trap focus.
  - After Add: focus returns to the **+** / **Add client** button. After Edit: to that row's name button. After Cancel or Discard: to whatever opened the form.
  - After Mark inactive/active: the row's ⋮ if it is still shown, otherwise the next row's ⋮, otherwise the search box.
  - After **Clear** / **Clear filters**: the search box. After **Try again**: it stays on the button until the list appears, then moves to the first row's name button.
  - The discard dialog focuses **Keep editing** and returns focus to the form when kept.
  - The first invalid field is focused when Save is tapped.
- **Keyboard (desktop):** Tab reaches search, status, each row's name button and ⋮ in order. Enter on the name button opens Edit. Enter/Space on ⋮ opens the menu, arrows move, Esc closes. In the form, Tab moves between fields, Enter saves, Esc asks to discard (or closes).
- **Live regions:** toasts are announced (Nuxt UI toaster); form alerts use `role="alert"`; the search result count is a polite live region. The list is a `<ul>` on phones and a real `<table>` with a caption on desktop, so screen readers announce the count and column headers.
- **Motion:** the sheet slide, the row highlight and the menu respect `prefers-reduced-motion`.
- **Text size:** 16px inputs, so iOS never zooms (as in feature 00).

### Design conflicts: UX resolution
| # | Conflict | Resolution |
|---|---|---|
| U1 | AC8 marks the mobile bottom sheet "[not in design]" and UI spec §11 says forms are a full-screen sheet on phones. | The design's own client dialog already switches to a bottom-aligned sheet with rounded top corners below 768px (`modalAlign: flex-end`). It is used as designed, and matches feature 01's Log production sheet and its keyboard handling. Three fields don't need full screen, and a full-screen page would hide the list for no benefit. |
| U2 | The design's toolbar is a fixed 220px search and 160px select with `space-between` (CL3, AC24). | Desktop keeps it as drawn. On phones the two controls sit in one row (search flexible, select about 148px) and wrap to two full-width rows when they can't fit. |
| U3 | The design's status control is a Select. | Kept, as a native `USelect`: the phone's own picker is easier to hit than a custom menu and needs no styling work. It is 2 taps to change. |
| U4 | The design's price is `type="number"` with a leading "$" (CL12). | The price is a text field with a decimal keypad and a leading currency prefix from the farm, plus a trailing "per tray". `type="number"` shows spin arrows, changes on mouse wheel, allows "e" and treats commas by locale, and it can't check "at most 2 decimals". |
| U5 | The design's menu is "Display details" and a red "Delete" (CL1). | **Edit** and **Mark inactive / Mark active**, neither red. Icons: pencil, user-x, user-check. |
| U6 | The design's avatar initials use the first letter of the first two words, which gives `S&` for "Sam & Dana Coyle". | Skip non-letters (`SD`). Desktop table only; decorative. Phones drop the avatar to give the name room. |
| U7 | The design shows the phone in muted grey. | `text-default`, because it is data the owner reads, and muted grey is faint in sunlight. Headers and hints stay muted. |
| U8 | The design's ⋮ is about 28px and controls are 36px. | 44px on phones and tablets (AC24), 40px at lg. Same as features 01 and 02. |
| U9 | The design's menu items are small text with no touch size. | 44px items on phones and tablets. |
| U10 | AC17 says "Discard this entry?" for Add and Edit. Feature 01's Edit says "Discard your changes?". | **AC17 wins**: the title is "Discard this entry?" for both, with an Edit-specific body ("Your changes to {Name} won't be saved."). If the PM prefers the feature 01 wording for Edit, it is a one-string change. |
| U11 | Feature 02 puts failure alerts at the top of the card (its R2). | Mark inactive/active failures and stale changes use a persistent error toast, because the Clients list is long and a top alert could be off screen. In-form failures stay in the form. |
| U12 | The design's phone placeholder is the US "(555) 000-0000" (CL10). | `0917 123 4567`, since the farm's currency is pesos. It is only a placeholder; the field accepts any phone (AC12). Trivial to revert. |
| U13 | AC3 says table on desktop, cards on mobile. AC25 says it must also work at 768 to 1023px with the sidebar collapsed or expanded. | The switch is by **content width** (about 640px), not screen width. Tablet with the rail gets the table, and tablet with the expanded sidebar gets cards. |
| U14 | The design's dialog has no titled state for Edit or an Inactive marker. | Title "Edit client" and an **Inactive** badge beside it for inactive clients [proposed]. |

### Data the UI needs (for the architect)
1. **The farm's full client list** (active and inactive), each with: id, name, phone (nullable), default price (nullable, the number the owner typed), status (active or inactive), and a **version marker** (for example the last-updated time) for the stale-change check. Returned so the UI can sort A to Z without accents or case mattering ("Émile" among the E's, "The Green Table Café" under T), or already sorted the same way. The subtitle count is the length of this list.
2. **The farm's currency** (code, from which the UI gets the symbol and grouping), on the farm context the same way eggs-per-tray is, available **before the form opens** so the prefix shows at once. A missing or unknown value must be handled by the UI as ₱ (AC36).
3. **A fresh list when the screen opens** (a quiet refresh even if the context has one), so the screen isn't stale after a change on another phone.
4. **The result of each change returns the whole changed client** (id, fields, status, version): for Add so the UI can insert it, highlight it and hand it to Sales; for Edit and for Mark inactive/active so the row can update from one response without refetching the whole list.
5. **Idempotency for Add:** one submit id per form opening, reused on retry, so an ambiguous failure followed by a retry gives one client and no "name already exists" (AC15). The same "return the client that was already created" behaviour is what the Sales picker relies on.
6. **The version marker goes back with Edit** so the server can refuse a stale save (AC19). Mark inactive/active on a client that is already in the wanted state should succeed (treated as done), not error.
7. **Error kinds** the UI maps to copy: network/unreachable · name blank · name too long · name has hidden/control characters · **name taken, with the existing client's name, whether it is inactive, and its id** (so the "Mark it active" pointer and button can work even when the local list is stale) · phone too long · phone hidden characters · price not a number · price zero or negative · price more than 2 decimals · price above the limit · **500-client limit reached** · **stale change** (client changed since it was opened) · session expired (the shell handles it). Field errors say which field.
8. **Name matching rule for the local check:** case and spacing are ignored (AC11). **Question for the architect and PM:** should "Cafe" and "Café" clash? AC11 says case and spacing only, and search ignores accents. The UI follows whatever the server does, so the two must agree.
9. **A starting name for the form** (optional), for the Sales picker.
10. **Nothing about "last used" values.** This form has no memory or defaults: all three fields start empty.

### Questions for PM
- **Q1 (edit that hides the row):** if a rename means the client no longer matches the current search, I clear the search and status filter so the owner sees the updated row (the same rule AC14 gives for Add). AC18 doesn't say. OK, or should the row just leave the view and the toast be the only signal?
- **Q2 (AC17 wording):** see U10. OK to keep "Discard this entry?" for Edit, or switch to "Discard your changes?" as in feature 01?
- **Q3 (button in the name message):** the "Mark {Name} active" button in the "name is inactive" message (Add only) goes one step beyond AC11, which only asks the message to point to marking it active. It mirrors feature 02's approved Restore button. OK, or message only?

### Decisions for owner
**No blocking decisions.** Owner decisions Q1 to Q11 are applied as answered. Three small additions to your design that you can confirm or strike (none adds a step to any main path):
- **O1: A "Mark {Name} active" button in the message** when you type the name of an inactive client while adding (saves retyping and a screen trip). The alternative is the message alone.
- **O2: A "Showing 3 of 12 · Clear" line** while a search or filter is on, so you always know the list is narrowed and can clear it in one tap.
- **O3: The Inactive badge beside "Edit client"** for an inactive client, and an explanation in the toast when a row leaves the list because of the filter ("Hidden by the Active filter").

Small changes to the design that only affect wording or size, listed so they aren't silent: the phone placeholder is a Philippine-style number (U12), the phone is darker text (U7), the price is a decimal text field with "per tray" (U4).

### Main-path tap counts (phone)
| Task | Taps | Notes |
|---|---|---|
| Open Clients | 1 | the tab |
| Add a client, name only | **2 + typing** | +, Save (or the keypad's Go). Name is already focused. |
| Add a client with phone and price | **4 + typing** | +, Phone, Default price, Save. Well under 30 seconds (AC9): about 15 to 25 seconds for a name, a phone and a price. |
| Add a client from anywhere | 3 + typing | Clients tab, +, Save |
| Edit a client (one field) | **3 + typing** | tap the card, tap the field, Save. Via ⋮ it is 4. |
| Reach Edit | 1 (card) or 2 (⋮, Edit) | AC18 asks for at most 2 |
| Mark inactive | **2** | ⋮, Mark inactive. No confirmation. |
| Mark active | **2** | ⋮, Mark active. No confirmation. |
| Find a client | **1 + typing** | tap the search box; the list narrows as you type |
| Filter by status | 2 | open the select, choose |
| Use the name-taken shortcut (Add) | +1 | Mark {Name} active |
| Clear a search and filter | 1 | Clear |

Desktop: Add a client is **2 clicks** (Add client, Save or Enter); Edit is a click on the row, then Save; Mark inactive is 2 clicks (⋮, Mark inactive). Every touch target is at least 44px on phones and tablets.

## 3. Technical design (Architect)

**Owner decisions on the design checkpoint (2026-09-26):**
- **Name in the 409 body (§3.9 point 1): include it.** `existing.name` (and the current row on a stale edit) is returned only in the 409 body to the signed-in owner of that same farm. Names stay out of logs, out of the server's own field message and out of DB exception text. This is the accepted reading of AC29.
- **Invisible characters (D13): keep refusing,** including the zero-width joiner and non-joiner, the same as sizes.
- **CLAUDE.md:** add the architect's three bullets (§3.8) at wrap-up, and show them in the summary. (Done 2026-09-26: prices/currency and clients bullets under "Units and data model", personal data under "Tenancy and security".)
- **Security audit:** run `security-auditor` after QA. Clients are the first personal data, and the feature adds a table with owner write grants, a ledger and security-invoker functions.

Checked on 2026-09-26 against the code (migrations `tenants_memberships`, `provisioning_functions`, `sizes`, `production*`, `sizes_write_rules`, `sizes_functions`, `sizes_hardening`; `server/utils/{db,errors,handlers,auth}.ts`; `server/repositories/{sizes,tenants,memberships}.ts`; `shared/`; `app/` shell, `useMe`, `useFarm`, `usePrimaryAction`, `ProductionFormOverlay`, `size-mutations`), the pgTAP helpers, the running local Postgres 17 and Node 24, and Nuxt UI 4.11.2 as installed. **Verified by running them:** the database is `en_US.UTF-8` (`lower('É')` gives `é`, so `lower(name)` works for accents); `numeric(6,2)` would round `6.505` before any trigger sees it (hence unconstrained `numeric`); `6.500::numeric = round(6.500, 2)` is true while `scale(6.500)` is 3 (hence the value-based check); `'NaN'::numeric <= 9999.99` is false; the `\uXXXX` / `\UXXXXXXXX` character class and `sha256()` work in a Postgres regex/function; `unaccent` is available but not enabled; `Intl` with `narrowSymbol` prints `₱1,250.00` and `$6.50`, and `Intl.supportedValuesOf('currency')` excludes `ZZZ`, `XXX` and lowercase codes. **Findings that differ from the docs (code wins):** in Nuxt UI 4.11.2 `USelect` is a Reka UI listbox, **not** a native `<select>`, and there is no `UNativeSelect` (UX U3 assumed native). See 3.9 item 9.

**Shape of the design in one paragraph.** Clients are the second table whose owner-facing writes are `security invoker` functions (feature 02's pattern), so the owner holds column-limited write grants and **every rule lives in the database for every write path**: a `BEFORE` trigger normalises and validates name, phone and price and caps a farm at 500 clients, CHECK constraints repeat the rules, a unique index makes names unique per farm (case and spacing ignored, accents kept), and there is no delete grant, policy, function or route. The four functions (`add_client`, `update_client`, `archive_client`, `restore_client`) add the friendly errors, the per-farm lock, idempotency (a submission ledger for add, a `version` marker for edit, "already in that state" for mark inactive/active) and never put a name or phone into an exception message. Each write returns the changed client's id and the repository re-reads that one row, so one mapper defines the `Client` shape. The list is one small route the browser calls after the page mounts (never in `/api/me`, never in the SSR payload), and **sorting, search and accent-folding are done in the browser** by one shared helper, because the search has to filter as you type with no round trip and the list is capped at 500. The farm's currency is a new `tenants.currency` column (default `PHP`, every existing farm backfilled by the same statement) that rides on `/api/me` next to `eggsPerTray`, and one shared `formatPrice` turns a number into `₱1,250.00`.

**What already exists and is reused unchanged:** `app.assert_tenant` (`TM006`), `app.set_updated_at`, the tenant-scoped `TenantDb` (`scoped`, `rpc`), `defineTenantHandler` and its guard test, the `conflict` (409) code, `apiError(status, code, fields, extra)`, `validateInput`, `app.normalize_size_name` (whose whitespace class is the one definition of "a space", parity-tested against JavaScript), `shared/utils/size-name.ts`, the isolation checker (`tests.tenant_table_registry`, 11 checks per table), the `usePrimaryAction` mechanism and `page-meta.d.ts`, `ConfirmDiscardDialog`, `AppPlaceholder`, the size-mutations pattern (pure core + thin composable + stubbed-`$api` spec), the toast offset for FAB pages (`app.vue`, unchanged), and the row-highlight CSS keyframe from feature 02.

### 3.1 Data

Three migrations, created with `bunx supabase migration new <name>` (after `20260926024518`): **M11 `tenants_currency`**, **M12 `clients`**, **M13 `clients_functions`**. Then `bun run db:types` (which adds `clients`, `client_submissions`, the four functions and `tenants.currency` to `shared/types/database.types.ts`, and so to `TenantTable` and `TenantRpc`).

#### M11 `tenants_currency` (AC35, AC36)

`alter table public.tenants add column currency text not null default 'PHP'`, plus `constraint tenants_currency_format check (currency ~ '^[A-Z]{3}$')`.
- **Backfill:** adding a column with a constant `NOT NULL DEFAULT` fills every existing row with `PHP` in the same statement, so there is no separate `update` and no window with nulls.
- **Where the default lives:** the column default (like `eggs_per_tray`) and the formatter's fallback `DEFAULT_CURRENCY` in `shared/constants/currency.ts` (AC36 requires a fallback in the UI, so a second copy is unavoidable). A Vitest test parses the migration and requires the two to be equal (the `MAX_SIZES_PER_FARM` pattern).
- **Why the check is a format check, not a list:** any three capital letters is stored; the app decides what it can show. The formatter treats a code as known only if `Intl.supportedValuesOf('currency')` lists it (so `ZZZ`, `XXX` and lowercase fall back to `₱`). The follow-up settings feature picks the list it offers, and needs no migration to add one.
- **Grants and policies: none change.** `tenants` stays `select`-only for owners (no write grant, no write policy), so the owner still can't change it (AC35). The new column is readable through the existing table-level `select` and the existing `tenants_select_own` policy.
- **Provisioning:** `provision_farm` inserts without naming the column, so a new farm gets `PHP` with no extra step (AC35). Its signature is **not** changed (that would touch the 010 assertions, the CLI and `provision-args` for no acceptance criterion). To make a test farm use another currency (QA, AC36/AC37), set it in the data as postgres: `docker exec supabase_db_magz-egg-tracker psql -U postgres -c "update public.tenants set currency = 'USD' where name = '<farm>'"`, then reload the app (`useMe` reads it once per page load). An optional CLI flag is task B9.
- **Isolation of the value:** the row is already filtered by `tenants_select_own` (`id = current tenant`), so farm A never receives farm B's currency. Covered by a named 020 case (3.6).

#### M12 `clients`

Helpers first (schema `app`, so PostgREST doesn't expose them; `revoke all … from public`; `grant execute … to authenticated`, because the CHECK constraints and functions run as the caller; all `security invoker`, `set search_path = ''`):

- `app.normalize_client_name(p text) returns text`, `immutable`: `select app.normalize_size_name(p)`. Same rule as sizes (NFC, every run of whitespace becomes one space, trimmed), **by calling the one existing definition**, so the JS/SQL parity test already covers it.
- `app.normalize_client_phone(p text) returns text`, `immutable`: NFC, then **trim only** (strip the whitespace class from both ends, inner text untouched, because AC12 says "saves unchanged"), and an empty result becomes `null`. The whitespace class is copied **verbatim** from `20260925172544_sizes_write_rules.sql` (line 32); a parity test (3.6) parses both and compares.
- `app.client_text_invalid(p text) returns boolean`, `immutable`: true if the text holds a control or invisible character. The class spells out, with `\uXXXX` escapes: `U+0001–001F`, `007F–009F`, `00AD` (soft hyphen), `061C`, `180E`, `200B–200F` (zero-width space, non-joiner, joiner, LRM, RLM), `202A–202E`, `2060–2064`, `2066–206F` (bidi and invisible operators), `FFF9–FFFB`, and `U+E0000–E007F` (tag characters). NUL and lone surrogates can't exist in a Postgres UTF-8 `text`; they are refused earlier (PostgREST `PGRST102`, `22P05`) and by the zod schema. This closes feature 02's audit L-3 and QA N1 for clients, **in the database as well as in zod**. Postgres regexes have no `\p{Cf}`, so the class is explicit; the JS twin (`hasInvalidClientTextChar`) uses the same ranges plus `\p{Cs}` and U+0000, and a parity test compares them over every code point (skipping the ones Postgres can't hold). Tab, newline, NBSP and the other spaces in the size-name class are **not** "invalid": for a name they are already collapsed to spaces before the check.
- `app.lock_tenant_clients(p_tenant_id uuid) returns void`: `pg_advisory_xact_lock(hashtextextended('clients:' || p_tenant_id::text, 0))`. The prefix differs from `sizes:` and the production-day key, so they never collide. It serialises the 500 count, the name check and the version check for one farm.
- `app.assert_client_input_size(p_name text, p_phone text) returns void`: refuses a **raw** name or phone over 200 characters (`TM017` / `TM018`, hint `too_long`) before anything is normalised (audit M-2).
- `app.assert_client_fields(p_name text, p_phone text, p_price numeric) returns void`: takes the **normalised** values and raises `TM017` (name; hint `blank`, `too_long` for over 60 code points, or `invalid`), `TM018` (phone; `too_long` over 30, or `invalid`), `TM019` (price; hint `not_positive`, `too_large` over 9999.99, `too_many_decimals`; checked in that order). Both the trigger and the functions call it, so the rule has one SQL definition. The `hint` carries the reason, and the message is a fixed string that never contains a value (AC29).
- `app.client_payload_hash(p_name text, p_phone text, p_price numeric) returns text`, `immutable`: `encode(sha256(convert_to(p_name || chr(31) || coalesce(p_phone, '') || chr(31) || coalesce(round(p_price, 2)::text, ''), 'UTF8')), 'hex')`. `chr(31)` can't appear in a valid name or phone, so the join is unambiguous, and `round(...)::text` makes `6.5` and `6.50` the same payload.

**`public.clients`**

| Column | Type / constraint |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` (never insertable by an owner) |
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `name` | `text not null` |
| `phone` | `text` (null = none) |
| `default_price` | `numeric` (null = none). **Unconstrained `numeric`, not `numeric(6,2)`:** a typmod would silently round `6.505` to `6.51` before any trigger or check could see it, which breaks "refuse more than 2 decimals" for a direct write. |
| `archived_at` | `timestamptz` (null = active; the owner sees "Inactive", CL2) |
| `version` | `bigint not null default 1`: the stale-edit marker (AC19). Bumped by the trigger on every real change. `bigint` so it can never overflow, and it is a plain number in JSON. |
| `created_at`, `updated_at` | `timestamptz not null default now()`, plus the `set_updated_at` trigger (010 requires it) |

Constraints and indexes:
- `clients_tenant_id_id_key unique (tenant_id, id)`: **the composite key Sales will reference** as `foreign key (tenant_id, client_id) references public.clients (tenant_id, id)` (the same shape as `(tenant_id, size_id)`). Sales' FK must not cascade or set null: a client is never deleted, and a sale's `client_id` must always resolve.
- `clients_name_key`: `create unique index clients_tenant_name_key on public.clients (tenant_id, lower(name))`. Names are stored normalised (NFC, single spaces, trimmed), so `lower(name)` is exactly "ignoring case and spacing". **It is not accent-folded on purpose** (owner decision: "Cafe" and "Café" are different names). NFC means a composed and a decomposed `é` are the same name. It includes inactive clients (there is no partial index) and starts with `tenant_id` (010).
- `clients_name_normalised check (name = app.normalize_client_name(name))`, `clients_name_length check (char_length(name) between 1 and 60)`, `clients_name_chars check (not app.client_text_invalid(name))`.
- `clients_phone_valid check (phone is null or (phone = app.normalize_client_phone(phone) and char_length(phone) between 1 and 30 and not app.client_text_invalid(phone)))`.
- `clients_default_price_valid check (default_price is null or (default_price > 0 and default_price <= 9999.99 and default_price = round(default_price, 2)))`. `default_price = round(default_price, 2)` is value-based, so a JSON `6.500` (scale 3) is accepted and `6.505` refused; `NaN` and `Infinity` fail the range test. The 9999.99 bound is **currency-independent** (AC13); the follow-up currency feature re-checks it.

**Trigger `clients_write_guard`** (`BEFORE INSERT OR UPDATE`, row level, `app.clients_write_guard()`, `security invoker`; applies to every write path, including a direct PostgREST call with the owner's JWT):
- **INSERT:** if `current_user = 'authenticated'` and `new.tenant_id` is not `app.current_tenant_id()`, raise `42501` **before taking any lock** (audit L-1; the RLS `WITH CHECK` runs after the trigger). Then `assert_client_input_size`; normalise name and phone (`''` becomes null); `assert_client_fields`; `lock_tenant_clients(new.tenant_id)`; if the farm already has 500 clients (**inactive included**), `TM021`.
- **UPDATE:** `tenant_id` and `id` are immutable (`TM025`). If name, phone or price changed: the same size check, normalise and `assert_client_fields`. If `name`, `phone`, `default_price` or `archived_at` differs from the old row, `new.version := old.version + 1`; otherwise the version is kept, so a no-op update doesn't stale anyone's open form.
- Trigger order (alphabetical): `clients_write_guard`, then `set_updated_at`.

**`public.client_submissions`** (the idempotency ledger for add, the twin of `size_submissions`, with the payload bound to the row and no personal data in it):

| Column | Type / constraint |
|---|---|
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `id` | `uuid not null` (the client's `submissionId`) |
| `client_id` | `uuid not null`, `foreign key (tenant_id, client_id) references public.clients (tenant_id, id)` |
| `payload_hash` | `text not null check (payload_hash ~ '^[0-9a-f]{64}$')`: the SHA-256 of the normalised name, phone and price. A replay whose payload differs is refused (`TM024`, audit L1) instead of silently returning the first client. Storing a hash instead of the values avoids a second copy of the name and phone (one place to erase, Q11). |
| `created_at`, `updated_at` | as above, plus `set_updated_at` |

`primary key (tenant_id, id)`. Hardened up front (audit M-1): the insert grant is column-limited to `(tenant_id, id, client_id, payload_hash)`; a `BEFORE INSERT` trigger `client_submissions_guard` raises `42501` for another farm's `tenant_id` **before** the lock (L-1), takes `lock_tenant_clients`, and refuses a 501st ledger row for the farm (`TM026`, reachable only by direct inserts). The cap equals the client cap because a ledger row is created only by `add_client` (one per created client) and clients are never deleted, so the routes can never reach it. **Retention:** the ledger is bounded at 500 small rows per farm, so growth is not a concern; when the deferred retention job (audit L3) arrives it may prune rows older than a few days, since a replay only happens within minutes of the first try.

#### M13 `clients_functions`

All `language plpgsql`, **`security invoker`**, `set search_path = ''`, `revoke execute … from public, anon`, `grant execute … to authenticated`. Each takes `p_tenant_id` first (filled by `TenantDb.rpc`, never from the request) and calls `app.assert_tenant(p_tenant_id)` first (`TM006`). Optional arguments are declared `default null` and trail the signature, so the repository **omits the key** for "none" (supabase-js types treat these as `?: string`, not `string | null`; passing `null` through `rpc` is also valid JSON, but omitting is what the generated types allow).

Custom SQLSTATEs, continuing the list after `TM016` (never the `PT` prefix). `TM005` (malformed input: null submission id, client id or version) and `TM006` are reused:

| SQLSTATE | Raised when | Repository maps it to |
|---|---|---|
| `TM017` | name blank, over 60 characters, or has a control/invisible character (`hint`: `blank`, `too_long`, `invalid`); a raw name over 200 characters | 400 `validation_failed`, `fields.name` (message chosen by `hint`) |
| `TM018` | phone over 30 characters or has a control/invisible character (`hint`: `too_long`, `invalid`) | 400, `fields.phone` |
| `TM019` | price not above 0, above 9999.99, or with more than 2 decimals (`hint`: `not_positive`, `too_large`, `too_many_decimals`) | 400, `fields.defaultPrice` |
| `TM020` | another client of the farm (inactive too) has the same name ignoring case and spacing. `detail` = `{"id","archived"}` only, **no name** | 409 `conflict`, `reason: 'name_taken'`, `fields.name`, `existing` (the repository reads the name by id) |
| `TM021` | the farm already has 500 clients (inactive included) | 409 `conflict`, `reason: 'client_limit'` |
| `TM022` | `update_client`: the client's `version` isn't the one the form was opened with, and the request would change something | 409 `conflict`, `reason: 'client_changed'`, `client` (the current row) |
| `TM023` | the id isn't one of this farm's clients (another farm's id looks exactly the same) | 404 `not_found` |
| `TM024` | the same `submissionId` was used with a different payload | 400, `fields.submissionId` |
| `TM025` | `tenant_id` or `id` changed (trigger) | 500 `internal` (unreachable from our routes) |
| `TM026` | the farm's client ledger already has 500 rows (direct inserts only) | 500 `internal` (unreachable) |
| `TM006` | `p_tenant_id` isn't the caller's tenant | 500 `internal` (a server bug) |
| `22P05`, `22021`, `PGRST102` | NUL or invalid text the schema should have refused | 400, `fields.name` (add/update only), else 500 |
| `23505`, `23514` | backstops behind the checks above (unique name, CHECKs); the functions check first, under the lock | 500 `internal` (logged as the code only) |

```sql
public.add_client(p_tenant_id uuid, p_submission_id uuid, p_name text, p_phone text default null, p_default_price numeric default null) returns jsonb   -- { "clientId": uuid, "replayed": bool }
public.update_client(p_tenant_id uuid, p_client_id uuid, p_version bigint, p_name text, p_phone text default null, p_default_price numeric default null) returns jsonb  -- { "clientId": uuid, "changed": bool }
public.archive_client(p_tenant_id uuid, p_client_id uuid) returns jsonb   -- { "clientId": uuid, "changed": bool }
public.restore_client(p_tenant_id uuid, p_client_id uuid) returns jsonb   -- { "clientId": uuid, "changed": bool }
```

- **`add_client` (AC8 to AC16, AC33).** In this order: `assert_tenant`; `TM005` if the submission id is null; `assert_client_input_size`; normalise; `assert_client_fields` (`TM017`–`TM019`); `lock_tenant_clients`; **ledger lookup**: if the id exists, then a different `payload_hash` is `TM024`, otherwise **return the first client with `replayed: true` and write nothing** (a retry after a lost reply never reaches the name check, so it can never fail as "already exists": AC15); then the name check (`lower(name)` match: `TM020`); then the insert (the trigger enforces the 500 cap, `TM021`); then the ledger row. If anything raises, the ledger row rolls back with the client, so a retry after a **refused** add re-evaluates. A replay after the client was since renamed or made inactive returns its current state.
- **`update_client` (AC18, AC19).** Same size/normalise/validate steps, then the lock, then load the client (`TM023`). **If `version` differs:** when the requested name, phone and price already equal the stored ones, return the client with `changed: false` (a retry of an edit whose reply was lost, or the same edit made elsewhere: nothing to refuse); otherwise `TM022`. Then the name check **excluding this client** (`id <> p_client_id`), so a case- or spacing-only change to its own name is fine (AC11, AC18). If nothing differs, return `changed: false`; else `update` (the trigger bumps `version`). A name comparison is exact (case-sensitive) for "did it change", so a capitalisation change is a real change.
- **`archive_client` / `restore_client` (AC20, UX flow C).** Lock, load (`TM023`); if already in the wanted state, return `changed: false` and touch nothing (no version bump, so an open Edit form isn't made stale by a no-op); else set or clear `archived_at`. Restoring can't clash on name (names are unique across inactive clients), so there is no `TM020` here. **Marking inactive is always allowed** (AC34): the function never looks at sales.
- **Nothing here touches `production`, `sizes` or any other table** (AC27); a pgTAP test proves the production rows are byte-identical after every client operation.

**Idempotency, per action (stated once):**

| Action | If the same request arrives twice |
|---|---|
| Add | The ledger returns the first client; one client exists; no "already exists" (AC15). Same id with another payload: `TM024`. |
| Edit | The second call finds the version moved, sees the stored fields equal the requested ones, and returns success with `changed: false`. |
| Mark inactive / active | The second call finds the client already in that state and returns it, `changed: false`. The screen treats it as done (UX flow C). |

**Concurrency:** all four take the per-farm clients lock, so two adds can't both pass the 500 count, two phones can't both take the same name, and a version check can't race an update. Two owners of one farm don't exist in v1; this is protection for two tabs and a retry. Not testable inside one pgTAP session (manual recipe in 3.6).

### 3.2 RLS and grants

| Table | Grants to `authenticated` (anon: `revoke all`) | Policies (all `to authenticated`, `tenant_id = (select app.current_tenant_id())`) |
|---|---|---|
| `clients` (new) | `select`; `insert (tenant_id, name, phone, default_price)`; `update (name, phone, default_price, archived_at, updated_at)`; **no delete, no truncate, no references, no trigger** | `clients_select`, `clients_insert` (with check), `clients_update` (using + with check). **No delete policy.** |
| `client_submissions` (new) | `select`; `insert (tenant_id, id, client_id, payload_hash)`; no update, no delete | `client_submissions_select`, `client_submissions_insert` (with check). No update/delete policy. |
| `tenants` | unchanged (`select` only); `currency` is covered by the table-level select | unchanged |

Each new table: `enable row level security`, `revoke all … from anon, authenticated` first, then the grants above, a `set_updated_at` trigger, a registry row (3.6).

- **Why an owner can write `clients` directly at all.** The functions are `security invoker` (the rule), so the caller needs the privilege, and the browser holds the same JWT, so PostgREST can reach the table. The design closes it as feature 02 did: column grants (never `id`, `version`, `created_at`, `tenant_id` on update, and `archived_at` is not insertable, so a client is born active), RLS (own farm only), the trigger (normalise, validate, cap, immutability), CHECKs behind it, and no delete. What a hand-built call **can** still do is change its **own** farm's clients within these rules, which is exactly what the screen lets the owner do. **One deliberate difference:** a direct `update` does not carry the version check; the stale-edit protection (AC19) belongs to the API path the UI uses. It only affects the owner's own farm.
- `updated_at` is in the update grant so isolation check 11 has teeth (feature 02 QA N8). The trigger overwrites it.
- `id` is not insertable, so an owner can't choose an id (no squatting a future Sales reference).
- 010's "anon has no privileges", "every table has RLS/`updated_at`/`tenant_id`/an index starting with `tenant_id`" and "no `security definer` in `public` executable by `authenticated`" keep passing; **zero new `security definer`**.

### 3.3 Server API

All five routes use **`defineTenantHandler`** (the guard test picks them up: rules (a), (b2), (d)). None reads a tenant from the query, body or params, only the repository calls `db.rpc` / `db.scoped`, and `GET /api/clients` **ignores the query string entirely** (no server-side search; the search text never leaves the browser, AC30). Every route can also return 401 `unauthenticated`, 403 `no_farm`, 500 `internal`. Each handler is one validation, one RPC and one small select (plus the auth and membership lookups every route has). Responses carry `Cache-Control: private, no-store`.

#### Contract: additions to `shared/types/api.ts`

```ts
export type ApiErrorReason = 'name_taken' | 'last_active_size' | 'sizes_changed' | 'client_limit' | 'client_changed'

/** A row with the name being saved (sizes and clients). `archived` is what the owner sees as "inactive" for a client. */
export interface NameMatch { id: string, name: string, archived: boolean }
export type SizeNameMatch = NameMatch            // kept: feature 02 code still imports it

export interface ApiErrorData {
  // …existing fields…
  existing?: NameMatch          // was SizeNameMatch; with reason 'name_taken'. Absent if the lookup failed.
  /** With reason 'client_changed': the client as it is NOW, so the row updates with no second request. */
  client?: Client
}

export interface FarmSummary { /* …existing… */ currency: string }   // ISO 4217 code, e.g. 'PHP'. Any 3 capital letters may arrive; the UI treats unknown ones as PHP.

// ---- Clients (docs/features/03-clients.md §3.3) ----
/** One customer of the farm. The price is the number the owner typed, PER TRAY, in the farm's currency. Never a tenant id. */
export interface Client {
  id: string
  name: string
  phone: string | null
  defaultPrice: number | null
  /** false = "Inactive" in the UI (archived_at is set). Inactive clients keep their past sales. */
  active: boolean
  /** Changes on every real edit or status change. Send it back with an edit (AC19). */
  version: number
}
export interface ClientsResponse { clients: Client[] }                       // GET /api/clients: ALL clients, active and inactive, in NO promised order
export interface AddClientRequest { submissionId: string, name: string, phone?: string | null, defaultPrice?: number | null }   // POST /api/clients
export interface AddClientResponse { client: Client, replayed: boolean }
export interface UpdateClientRequest { version: number, name: string, phone: string | null, defaultPrice: number | null }       // PUT /api/clients/:id (replaces the three fields; null clears)
/** PUT, archive and restore: `changed` is false when there was nothing to do (already in that state, or the same values). */
export interface ClientChangeResponse { client: Client, changed: boolean }
```

`apiError`'s `extra` in `server/utils/errors.ts` gains `client` (`ApiErrorExtra` picks it too). Nothing else in the error module changes: `conflict` and `not_found` already exist. **Quantities: none; no eggs here.**

`shared/constants/clients.ts` (one source for the server, the schemas, the form and the constants test):

```ts
export const CLIENT_FIELDS = { name: 'name', phone: 'phone', defaultPrice: 'defaultPrice', submissionId: 'submissionId', version: 'version', id: 'id' } as const
export const MAX_CLIENT_NAME_LENGTH = 60          // code points, after normalising; = clients_name_length
export const MAX_CLIENT_PHONE_LENGTH = 30         // after trimming; = clients_phone_valid
export const MAX_CLIENT_TEXT_INPUT_LENGTH = 200   // raw cap before normalising (audit M-2); = assert_client_input_size
export const MAX_CLIENTS_PER_FARM = 500           // = the TM021 cap in M12
export const MAX_CLIENT_PRICE = 9999.99           // = clients_default_price_valid
export const CLIENT_PRICE_DECIMALS = 2
export const CLIENT_MESSAGES = { /* the §2.5 "Copy" strings for fields and errors; functions take the existing name where the copy names it */ }
```

Field messages come from the UX copy table. **The server's own `fields.name` for a clash is the generic `That name already exists.`** (no value, AC29); the form composes "You already have a client called {Existing name}." from `existing`. The "price above the limit" message has no amount in the shared string (`The most you can enter is {max}.`, filled by the form from the shared price rule so it follows the farm's currency); the server's copy for the same case is the number without a symbol.

`shared/utils/price.ts` (**the one price rule**, the counterpart of `quantity.ts`; pure, so tests import it directly):
- `formatPrice(amount: number, currency?: string | null): string` → `₱6.50`, `₱250.00`, `₱1,250.00`, `$6.50`. Uses `new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 })`: a **fixed locale** (not the device's, unlike `formatQty`) so the server, the browser and the tests print the same thing, symbol first, comma thousands, always 2 decimals (checked on Node 24: `PHP` gives `₱`, `USD` `$`, `EUR` `€`).
- `currencySymbol(currency?)` → the symbol only (from `formatToParts`), for the form's prefix.
- `isKnownCurrency(code)`: `Intl.supportedValuesOf('currency').includes(code)`. A **missing, lowercase, malformed or unsupported** code (`undefined`, `''`, `'php'`, `'ZZZ'`, `'XXX'`) falls back to `DEFAULT_CURRENCY`, so the screen never breaks and shows `₱` (AC36). Nothing multiplies or converts, so a currency change relabels only (AC37).
- `checkPriceNumber(n: number)` → `null | 'not_positive' | 'too_large' | 'too_many_decimals'`, in that order, decimals counted from `String(n)` (a value printed with an exponent counts as too large or too many decimals); used by the schema. `parsePriceInput(raw: string)` → `{ ok: true, value: number | null } | { ok: false, reason: 'not_a_number' | 'not_positive' | 'too_large' | 'too_many_decimals' }`: trims, blank means null, digits with one optional `.` only (a comma or a letter is `not_a_number`, so `6,5` is never read as 65), a leading `-` reads as `not_positive`, and **decimals are counted after stripping trailing zeros**, so `6.500` is fine and `6.505` is not. `formatPriceInput(n)` → `'250.00'` (plain digits for the Edit form). The **Sales** feature reuses `formatPrice` for the prices it stores (AC34, AC37).

`shared/utils/client-name.ts` (pure): `normalizeClientName` (calls `normalizeSizeName`), `normalizeClientPhone(raw)` (NFC, trim, `''` → `null`), `clientNameLength` (code points), `hasInvalidClientTextChar` (twin of `app.client_text_invalid`, plus `\p{Cs}` and U+0000), and `checkClientName(raw, clients, selfId?)` → `{ ok: true, name } | { ok: false, reason: 'blank' | 'invalid' | 'too_long' | 'taken', message, existing?: NameMatch }`, the form's live check: it compares `toLowerCase()` of normalised names (**not** accent-folded), skips `selfId`, and returns the other client's own spelling and `archived`. The server does not use it for the clash; the database decides, under the lock (the same split as sizes).

`shared/utils/client-list.ts` (pure; the Sales picker reuses it):
- `foldForSearch(s)` = `s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()`, applied to both the query and the name; the query is also collapsed and trimmed. This is **the only place accents are ignored**, and only for search and sort, never for the uniqueness rule.
- `compareClients(a, b)`: `Intl.Collator('en', { sensitivity: 'base' })` on the name (case and accents ignored: "Émile" sits among the E's, "The Green Table Café" under T; punctuation is not ignored and there is no numeric collation), then the exact name (so "Cafe" then "Café" is stable), then the id.
- `filterClients(clients, { search, status })` (both must match; `status` is `'all' | 'active' | 'inactive'`), `clientMatchesFilters(client, filters)` (for "would this filter hide it": AC14, UX flow B), and `clientInitials(name)` (first letter or digit of the first two words that start with one: `SD` for "Sam & Dana Coyle", U6).

`shared/schemas/clients.ts` (zod 4, relative imports; unknown keys are stripped, so a smuggled `tenant_id`, `active`, `archivedAt` or `version` on an add never reaches the repository):
- `clientNameSchema`: `z.string().max(200)` (too long), transform `normalizeClientName`, then blank, invalid, over 60. `clientPhoneSchema`: `z.string().max(200)` transform `normalizeClientPhone`, then invalid, over 30; `clientPriceSchema`: `z.number()` (not a number, no NaN or infinity) refined by `checkPriceNumber`. Every issue has our own message, and **none echoes the input** (AC29; a test feeds a sentinel).
- `addClientBodySchema = { submissionId: z.uuid(), name, phone: phone.nullish(), defaultPrice: price.nullish() }` (omitted means none); `updateClientBodySchema = { version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), name, phone: phone.nullable(), defaultPrice: price.nullable() }` (all three keys required, `null` clears, so a body that forgets `phone` is a 400 and never an accidental clear); `clientIdParamsSchema = { id: z.uuid() }`.

#### Routes

| Method, path | File | Request | 200 response | Errors |
|---|---|---|---|---|
| `GET /api/clients` | `server/api/clients/index.get.ts` | none (query ignored) | `ClientsResponse` | none beyond the common ones |
| `POST /api/clients` | `server/api/clients/index.post.ts` | `AddClientRequest` | `AddClientResponse` (a replay returns the first client with `replayed: true`) | 400 `fields.name` / `phone` / `defaultPrice` / `submissionId`; 409 `name_taken` + `existing`; 409 `client_limit` |
| `PUT /api/clients/:id` | `server/api/clients/[id].put.ts` | `UpdateClientRequest` | `ClientChangeResponse` | 400 `fields.id` / `name` / `phone` / `defaultPrice` / `version`; 404 `not_found`; 409 `client_changed` + `client`; 409 `name_taken` + `existing` |
| `POST /api/clients/:id/archive` | `server/api/clients/[id]/archive.post.ts` | none | `ClientChangeResponse` (`changed: false` when already inactive) | 400 `fields.id`; 404 |
| `POST /api/clients/:id/restore` | `server/api/clients/[id]/restore.post.ts` | none | `ClientChangeResponse` (`changed: false` when already active) | 400 `fields.id`; 404 |

Notes:
- **Every write returns the whole changed client** (AC14, AC18, AC20; UX data need 4). Add's `client` carries the id, name and default price the Sales picker needs (AC34).
- **`PUT`, not `PATCH`:** it replaces the three editable fields and is idempotent. There is **no DELETE route** (AC21), and no route exposes `archived_at`, a version bump, or a timestamp.
- **404 for another farm's id and for an unknown id are the same answer** (AC28), and a 409/400 never reveals another farm's data. Uniqueness is per farm, so farm A adding "Maple Street Market" when farm B has it gets no error and no hint.
- The error body is the existing shape (`FetchError.data.data` is `ApiErrorData`); `client_changed` carries the current row **unless that read failed** (then the client refreshes the list itself).

#### Repository and server utils

- **`server/repositories/clients.ts`** (new): `listClients(db)`, `addClient(db, input)`, `updateClient(db, id, input)`, `archiveClient(db, id)`, `restoreClient(db, id)`, `mapClientDbError(db, error, operation)`, and `toClient(row)` (the one mapper: `default_price` is a JSON number from PostgREST, `active = archived_at === null`). Reads use `db.scoped('clients').select('id, name, phone, default_price, archived_at, version')`, ordered by `name` only so the output is deterministic (**not** the display order). Each write calls `db.rpc(...)`, parses the small `{ clientId, … }` result with zod (the generated type is `Json`), then reads that one row through the same mapper and returns it. `TenantDb` and `TenantRpc` need no change.
- **`mapClientDbError`** implements the SQLSTATE table (3.1). It is async because `TM020` reads the existing client's name and status **by id** (`db.scoped('clients').select('id, name, archived_at').eq('id', id)`), and `TM022` reads the current client; if either follow-up read fails, the error is thrown **without** `existing`/`client` (the form then shows the generic messages and the screen refreshes on its own). A `TM017`/`TM018`/`TM019` `hint` picks the message; an unknown hint falls back to the generic field message.
- **No personal data in logs (AC29), designed rather than hoped for.** Raw PostgREST errors carry values: a `23505` detail holds the key `(tenant, name)`, a `23514` detail holds the whole failing row, and `22P02` quotes the input. The current `console.error('[sizes]', error)` style would leak them, so **the clients repository never logs an error object, `message`, `details` or `hint`**: its one `internalError(scope, code)` logs `[clients] <scope> <SQLSTATE>` and throws `apiError(500, 'internal')`. The functions' own messages are fixed strings and `TM020`'s detail has an id only, so the database log doesn't gain a name from our own exceptions either. Nothing in a route handler logs. Residual risk, stated: a direct PostgREST write (or a lost race, which the lock prevents) can still make Postgres itself log a constraint detail with that owner's own row; that needs a hand-built request and shows only the owner's own data. Logs from the sizes and production repositories are unchanged (no personal data there).
- **No new server util is needed for the sentinel guarantee:** a Vitest spec drives `mapClientDbError` with an error whose `message`, `details` and `hint` contain a sentinel and asserts that no `console.*` call and no returned body contains it.

### 3.4 Frontend

**Page and shell**
- **`app/pages/clients.vue`** replaces the placeholder (default `farm` auth level). `definePageMeta({ primaryAction: { label: 'Add client', ariaLabel: 'Add client', icon: 'i-lucide-plus', fab: true } })`, so the layout draws the top-bar button (md+) and the FAB (<md) with nothing new (AC2), and the page handles the click with `usePrimaryAction().onPrimaryAction(openAdd)`; the FAB hides while the form or a dialog is open (`primary.hidden`), as on Production. The toast offset for a FAB page already exists (`app.vue`).
- **Dynamic subtitle ("5 customers", AC1).** The nav's subtitle is static. Add `app/composables/useShellSubtitle.ts`: `useState<{ text: string | null } | null>('shell:subtitle', () => null)` plus `setSubtitle(text)` and a cleanup on page unmount. `layouts/default.vue`'s `subtitle` computed prefers the override when it is set (its `text` may be `null`, which hides the subtitle: "no subtitle while loading"), else the current behaviour. The page sets `{ text: null }` in `setup` (so SSR and hydration agree) and then `"{n} customers"` / `"1 customer"` / `"0 customers"` from the list length once it is ready (all clients, unaffected by the filters, AC1, AC6). Cleared in `onBeforeUnmount`.
- **`app/types/page-meta.d.ts`:** no change (`primaryAction` exists).
- **Shared sheet.** Extract from `ProductionFormOverlay.vue` (behaviour-preserving) into `app/composables/useSheetKeyboard.ts` (the `--sheet-kb` / `--sheet-vvh` visual-viewport handling) and `app/utils/sheet-ui.ts` (`sheetUi(maxWidthPx)`, the bottom-sheet-below-md, centred-dialog-at-md classes), and make both overlays use them. The client overlay is 420px wide (the design's), Production stays 520px. A regression pass of the Log production sheet is part of the task (F2).
- **Currency in the farm context.** `useFarm()` gains `currency` (computed, `farm.currency`), `currencySymbol` and `formatPrice(n)` (thin wrappers over `shared/utils/price.ts` using `farm.currency`). Nothing else in the UI names a currency or a symbol.
- **Select control (U3 correction).** UX asked for a native `USelect`; in 4.11.2 `USelect` is a custom Reka listbox. Use a plain `<select>` styled with the same tokens as `UInput` (44px, `text-base`), with an `aria-label`: it keeps the OS picker on phones, which was UX's reason, and needs about ten classes. If FE prefers `USelect`, its items must be 44px and the popover must fit 375px. Either is acceptable; no owner decision.

**State: the list, kept out of anything that could persist or leak (AC30, AC31)**
- **`app/composables/useClients.ts`**: the one owner of the client list. State lives in `useState('clients:list', …)` holding `{ farmId, clients }` (**memory only: nothing is put in the URL, `localStorage`, `sessionStorage`, a cookie or `/api/me`**). The list is fetched **on the client after mount** (`onMounted`), never with `useAsyncData` or on the server, so the SSR HTML and `__NUXT_DATA__` never contain a client (and the page's SSR render is the loading state, which also removes any hydration difference). It exposes `status` (`idle | loading | ready | refreshing | error`), `clients`, `activeClients` (for the Sales picker), `count`, `load({ silent })`, `upsert(client)`, and `reset()`.
- **First visit** shows `loading`. **A later visit in the same session** shows the known list at once and refreshes quietly (`refreshing`, UX "Refreshing"); a failed quiet refresh keeps the list and toasts (UX R2).
- **Sign-out and switching farm.** `useMe().clear()` (called by both `signOut` and `handleSessionExpired` via `endSessionLocally`) is extended to `clearNuxtState(key => key.startsWith('clients:'))`, so the list, and any other `clients:*` state, is gone; sign-out also does a full reload, so nothing survives in memory. **Defence in depth:** `useClients` ignores stored state whose `farmId` is not the current `useFarm().farm.id`, so farm B can never briefly see farm A's clients even if a clear was missed (AC31).
- **Search and status filter** are page-local `ref`s (reset on every fresh visit, kept while on the page: UX flow D). They never touch the router. `filtered = filterClients(sorted, { search, status })`, where `sorted` is `[...clients].sort(compareClients)` and each name's folded form is cached per list, so a keystroke is up to 500 `includes` calls. The "Showing x of n" line, the empty and no-match states and the polite live-region count (debounced about 500ms) read from `filtered`.

**Mutations: `useClientMutations()`** is a thin wrapper over `app/utils/client-mutations.ts` (a pure core with no Nuxt auto-imports, driven by a stubbed `$api` in Vitest, like `size-mutations.ts`):
- `add(input)` and `update(client, input)` share **one in-flight guard** per form instance (a second call while one runs resolves to `null`, so many taps send one request: AC15). `archive(id)` and `restore(id)` are guarded **per client id** (`pendingIds`), because UX R1 says other rows stay usable while one runs.
- Each returns `{ ok: true, data } | { ok: false, error: ClientError } | null`, never throws, with a 20s timeout like sizes (a hung request becomes the normal "Couldn't save" path; a retry is safe: add reuses its `submissionId`, edit and mark are idempotent).
- **Add retry rule** (feature 01 §3.4, feature 02): a `submissionId` per form opening (`crypto.randomUUID()`), **reused on a retry of the same normalised payload (name, phone and price)**, replaced when any of the three changes; a reopened form gets a new one. Because the server now compares the whole payload, reusing an id for a changed payload would be refused (`TM024`), so the tracker keys on all three.
- On success it applies the reply through `useClients().upsert(client)`. On `client_changed` it upserts `error.client` (when present) and starts a quiet `load`; on `name_taken` it starts a quiet `load` (the clashing client may have been made elsewhere: feature 02 QA N5); on `not_found` it removes nothing (clients can't be deleted) and just reloads.
- **`app/utils/client-errors.ts`**: `mapClientError(e) → ClientError`, kinds `network | invalid (fields) | name_taken (existing) | limit | changed (client?) | not_found | unknown`, mirroring `size-errors.ts`. A fetch with no response, or 502/503/504, is `network`. 401 is handled by `$api`.
- **`app/utils/client-copy.ts`**: the UI-only copy from UX §2.5 (toasts, titles, aria-labels, states). Field messages and the limit message come from `CLIENT_MESSAGES`.

**Components** (Nuxt UI v4; the frontend dev confirms props against 4.11.2, as in feature 02)

| Component | Built from | Notes |
|---|---|---|
| `ClientsToolbar.vue` | `UInput` (leading search icon, clear button, 44px, `aria-label`), the styled `<select>`, `UButton` | The search box, the status filter and the "Showing x of n · Clear" line. Disabled while loading. |
| `ClientsList.vue` | `<table>` (plain, with a `<caption>`) or `UTable`; `<ul>` of cards; `UBadge`, `USkeleton` | Renders the sorted, filtered list once, as the **table when the container is at least 640px wide, else as cards** (see the note below). Row and card click open Edit; the name is a real `<button>` with `Edit {Name}`; the ⋮ is separate. Highlight and scroll-into-view by id. Missing phone and price show the dash with `sr-only` text (UX R7). |
| `ClientRowMenu.vue` | `UDropdownMenu` (Edit, Mark inactive / Mark active) | 44px items below lg, `aria-label="Actions for {Name}"`, spinner and disabled while that row's request runs. |
| `ClientForm.vue` | `UForm`, `UFormField`, `UInput`, `UAlert`, `UButton` | **Self-contained (AC34):** the three fields, live checks (name via `checkClientName` against the loaded list, phone, price via `parsePriceInput`), the discard check state, the submission id, the save call through `useClientMutations`, and the "Mark {Name} active" button (Add only). Props `mode: 'add' \| 'edit'`, `client?`, `initialName?` (for the Sales picker). Emits `saved` with `{ kind: 'added' \| 'updated' \| 'unchanged' \| 'activated', client }`, `changed-elsewhere`, `cancel`, `close`. Exposes `dirty`, `saving`, `focusName()`. It knows nothing about which screen opened it and never navigates. Edit with nothing changed emits `saved` (`unchanged`) with no request. |
| `ClientFormOverlay.vue` | `UModal` styled by `sheetUi(420)` + `useSheetKeyboard`, `ConfirmDiscardDialog` | The thin host (like `ProductionFormOverlay`): every close goes through the discard check and is blocked while saving. Sales hosts the same component, on top of the sale form. Its Edit title shows the **Inactive** badge (U14). |
| `ClientStatusBadge.vue` | `UBadge` (success / neutral, `subtle`) | Always the word "Active" or "Inactive". |

- **Container-width switch, JS instead of CSS.** UX asked for a container query "SSR-safe, pure CSS" so both layouts are in the DOM. With up to 500 clients that would render 1,000 rows. The list is client-only (it appears after mount), so hydration is not a concern and the page can pick **one** layout with VueUse's `useElementSize` on the list wrapper (`>= 640` is the table). Same visible behaviour, half the DOM (3.9 item 10).
- **After a change (AC14, AC18, AC20; UX R1).** The page keeps `highlightedId` and `pendingRevealId`; it scrolls the row into view (`block: 'nearest'` on cards, centred as UX says) and applies the 1.5s highlight through the existing `size-row-flash` keyframe (reduced motion turns it off). **Filter clearing:** after an add or an edit, if `!clientMatchesFilters(client, filters)` the page clears the search and status first. After mark inactive/active, if the current status filter would hide the row, it leaves the list and the toast adds "Hidden by the Active filter" (UX copy); focus follows UX ("Accessibility").
- **Not verified from here (as in earlier features):** real-phone keypads, screen-reader pass, reduced-motion on the modal. QA/FE run them.

**Shared helpers involved:** `shared/utils/price.ts` (one price rule, new), `client-name.ts`, `client-list.ts`, `shared/constants/clients.ts`, `shared/constants/currency.ts`, `shared/schemas/clients.ts`. `shared/utils/quantity.ts` and `eggsPerTray` are **not** involved (nothing here converts eggs, AC27).

### 3.5 Invariants at risk

| Rule (CLAUDE.md / spec §9) | How this design protects it |
|---|---|
| `tenant_id` + `updated_at` + RLS on every table | `clients` and `client_submissions` have `tenant_id` (FK to `tenants`), `updated_at` + `set_updated_at`, RLS with tenant `with check` on insert and update, an index starting with `tenant_id`, and a registry row. 010 fails otherwise. `tenants.currency` needs no policy change (the row is already RLS-filtered). |
| Derive the tenant on the server; never trust the client | No route reads a tenant. Zod strips unknown keys (`tenant_id`, `active`, `version` on add). `p_tenant_id` comes only from `ctx.tenantId` via `TenantDb.rpc`, and every function asserts it (`TM006`). The trigger refuses another farm's `tenant_id` with `42501` before locking. The guard test (d) covers the five new route files. |
| Tenant scoping in one layer; RLS stays on | Functions are `security invoker` and run as the owner (RLS applies inside) and filter `tenant_id = p_tenant_id` as well. The list goes through `db.scoped`. No new `security definer`. |
| Service role not used at runtime | Nothing here uses it. |
| Multi-row writes are `security invoker` functions | Add (client + ledger) is one function call, all-or-nothing. Edit and the two status changes are single-row but go through functions too, for the lock, the friendly errors and no raw constraint errors reaching the logs (D3). |
| Clients are the farm's customers, never deleted, archived instead | No delete grant, no delete policy, no delete route, no delete in any function (pgTAP proves 42501 for `delete` and `truncate`). Archive only sets `archived_at`. `id` is not insertable and `(tenant_id, id)` is the composite key Sales will point at, with no cascade. Mark inactive is always allowed and never reads sales. |
| Unit and prices | Nothing stores or converts eggs. A price is a plain `numeric`, 2 decimals, `> 0`, `<= 9999.99`, **the number the owner typed, per tray**; the API and the DB never multiply or convert it, so a currency change relabels only (AC37). Sales will snapshot its own price, so changing a client's default changes no past sale. |
| Currency is per-farm data, never hardcoded (new; proposed for `CLAUDE.md`, 3.8) | `tenants.currency` (default `PHP`) rides on `/api/me`; every price is shown through `formatPrice(amount, currency)`; the symbol is not typed anywhere; a missing or unknown code falls back to `PHP`. |
| Personal data (first PII table) | Names and phones never appear in logs (sanitised repository logging, fixed exception messages, `TM020`'s detail is an id), in error messages (the server's clash message has no value), in the URL (search is client-side, `GET` takes no query), in the SSR payload or `/api/me` (the list is fetched after mount only), or after sign-out (`useMe().clear()`, farm-keyed state, full reload). Tests in 3.6. |
| Isolation, reads **and** writes | Registry rows for both tables (the shared checker runs 11 checks per table, both directions), named 020 cases for the RPCs and direct writes, 090 mutations for the new policies (3.6), and a 404 that is the same for "not yours" and "doesn't exist". |
| Categories are data; one `status` field; nullable meanings | Unchanged. `archived_at` null = active is a nullable timestamp with a meaning; `phone` and `default_price` null mean "none". A client is never a fake "Walk-in" row (CL7). |
| Serverless: short handlers, no long-lived pool | supabase-js over HTTP, one RPC plus one small select per write. The advisory lock is transaction-scoped and held for milliseconds; a farm's whole list is at most 500 small rows (under PostgREST's `max_rows` of 1000). |
| Every route wrapped; guard test | Five routes use `defineTenantHandler`; `server-guards.spec.ts` expects them by name. |

### 3.6 Tests

**pgTAP** (`bun run test:db`, local stack running):
- **`000_helpers.sql` registry:** add, after `size_submissions`:
  - `public.clients`, `tenant_id`, seed `insert into public.clients (tenant_id, name) values (%1$L, 'Seed client')`, attack `insert into public.clients (tenant_id, name) values (%1$L, 'Attack')`. The attack names only insertable columns, so a `42501` means the policy or the trigger, not a column privilege.
  - `public.client_submissions`, `tenant_id`, seed `insert into public.client_submissions (tenant_id, id, client_id, payload_hash) select %1$L, gen_random_uuid(), c.id, repeat('0', 64) from public.clients c where c.tenant_id = %1$L limit 1`, attack the same with a random `client_id` (RLS/trigger reports `42501` before the FK).
  - Checks 8 and 10 stop on the column privilege for `clients` (owners can't write `tenant_id`), so **check 11** (`update … set updated_at = now() where true`, which needs `updated_at` in the grant) is what keeps a weakened `clients_update` detectable.
- **`010`:** the four public functions are `not prosecdef`, not executable by `anon`, executable by `authenticated`; the new `app.*` helpers and trigger functions are not executable by `anon` (and the ones the CHECKs and functions call are executable by `authenticated`); `authenticated` has no `delete`, `truncate`, `references`, `trigger` on `clients` or `client_submissions`; no column-level `insert` on `id`, `version`, `archived_at`, `created_at`, `updated_at` of `clients`; no `update` on `id`, `tenant_id`, `version`, `created_at`; `clients` has no delete policy; the ledger insert grant is exactly `(tenant_id, id, client_id, payload_hash)`; `authenticated` has no `update` on `tenants.currency` or any `tenants` column.
- **`020` named cases, both directions** (A against B and B against A): each RPC with the **other farm's tenant id** raises `TM006` and the other farm's clients are unchanged; A's tenant with **B's client id** raises `TM023` for `update_client`, `archive_client`, `restore_client`; a direct `update public.clients set name = 'Pwned' where tenant_id = <B>` affects 0 rows, a direct `insert` into B raises `42501`, `delete` raises `42501`; A reads none of B's `client_submissions`; anon gets `42501` executing each RPC; **A can add "Maple Street Market" when B has it, with no error** (uniqueness is per farm); `tenants`: A selecting `currency` where `id = <B>` returns 0 rows, and after setting B to `USD` as postgres, A still reads `PHP` for itself and B reads `USD`.
- **New `060_clients.test.sql` (rules and functions, as the farm owner plus postgres setup):**
  - **Names (AC10, AC11):** padded and multi-space names normalise; composed and decomposed `é` are one name; **"Cafe" and "Café" both save** (different), `Café` twice clashes; `maple street market` clashes with `Maple Street Market` and with an **inactive** client (`TM020` whose `detail` has an id and `archived: true` and **no name**); renaming to its own name in another case or spacing works; blank (also only NBSP/tabs) `TM017` `blank`; 60 characters OK, 61 `too_long`, an emoji counts as one; a raw name over 200 characters is refused before normalising; **control and invisible characters refused** (U+0001, U+007F, U+0085, U+00AD, U+200B, U+200C, U+200D, U+200E, U+202E, U+2060, U+FEFF becomes a space and is trimmed, tab and newline become spaces, NBSP is a space); the same refusals **for a direct insert and a direct update** (bypass); `Sam & Dana Coyle`, `O'Brien's`, `The Green Table Café` save unchanged.
  - **Phone (AC12):** trimmed, `''` becomes null, inner spaces kept (`(555) 201-3348`, `+63 917 123 4567`, `555-2013 ext 4` unchanged), 30 OK and 31 `TM018` `too_long`, control and invisible refused, an NBSP at the ends trimmed.
  - **Price (AC13):** `6.5` stored and read back as `6.50`; `0`, `-1`, `10000`, `9999.995`, `6.505`, `'NaN'`, `'Infinity'` refused with the right hint; `9999.99` and `0.01` accepted; `6.500` accepted; a **direct** insert or update of each bad value is refused (proves the unconstrained `numeric` plus check catches what a typmod would round).
  - **Limit (AC33):** the 500th client is accepted and the 501st is `TM021` (through the function **and** a direct insert); at 500, edit, mark inactive and mark active still work; inactive clients count; another farm's count is independent.
  - **Add and idempotency (AC15):** same `submissionId` twice returns the same `clientId` (`replayed: true`) and leaves one row and **no `TM020`**; same id with a different name, phone or price `TM024`; a refused add (`TM020`, `TM021`) leaves no ledger row; a replay still works when the farm is at 500; a replay after a rename returns the renamed client.
  - **Edit and version (AC18, AC19):** `version` starts at 1, increases on a real change and on archive or restore, and **does not** change on a no-op function call; a stale `version` with different values `TM022`; a stale `version` whose values equal the stored ones returns `changed: false`; an owner can't set `version` directly (`42501`); emptying phone or price stores null.
  - **Status (AC20, AC21):** archive and restore change only `archived_at` and `version`; the second call is `changed: false` with no version bump; an unknown or foreign id `TM023`; name, phone and price are kept exactly.
  - **No delete (AC21):** as the owner, `delete from public.clients` and `truncate` give `42501`; as postgres, deleting a client that a `client_submissions` row points at gives `23503`; updating `tenant_id` or `id` as postgres `TM025`.
  - **Ledger hardening (audit M-1, L-1):** a ledger insert for another farm gives `42501`; a row pointing at another farm's client `23503`; a `payload_hash` that isn't 64 hex characters fails; the 501st ledger row for one farm `TM026`.
  - **Currency:** a new farm (`tests.create_farm`) has `PHP`; `currency` is `not null` with default `PHP`; `'php'`, `'US'`, `'USDX'`, `''` are refused; the owner can't update it (`42501`).
  - **AC27:** the `production` rows (a hash of all of them), `sizes` and every count are identical before and after every client operation.
  - **Not testable in one pgTAP session (concurrency), manual recipe for QA in §5:** session 1 `begin; select public.add_client(…'Alpha'…);` uncommitted, session 2 `select public.add_client(…'alpha'…);` must block and then fail `TM020`; two adds at 499 clients must produce one success and one `TM021`; a cross-farm insert must fail fast without waiting on the other farm's lock (L-1).
- **`090` mutations** (so the new policies aren't vacuous): m17 `clients_insert` → `with check (true)` **and** the guard trigger disabled (as m14), plus m17b showing the policy alone still refuses; m18 `clients_update` → `using (true) with check (true)` (check 11 detects it); m19 `grant delete` on `clients` plus a permissive delete policy; m20 the same weakening on `client_submissions_insert`. Update `plan(...)` and the final policy-list assertion (add `clients_select`, `clients_insert`, `clients_update`, `client_submissions_select`, `client_submissions_insert`, and the two tables to the table list).
- **`030`:** unchanged and must still pass (`provision_farm` is untouched; the new column defaults).

**Vitest** (`bun run test:unit`):
- `price.spec.ts`: `formatPrice` for `PHP`, `USD`, `EUR` (`₱6.50`, `$6.50`, `€6.50`), `1250` → `₱1,250.00`, `250` → `₱250.00`, 2 decimals always, **missing (`undefined`, `null`, `''`), lowercase, malformed and unknown codes (`'php'`, `'ZZZ'`, `'XXX'`) fall back to `₱`**, the same output for the same input regardless of the runtime locale; `currencySymbol`; `checkPriceNumber` and `parsePriceInput` (`6.5`, `6.50`, `6.500`, blank, `0`, `-1`, `6,5`, `abc`, `6.505`, `9999.99`, `10000`, `1e21`, `.5`, whitespace); `formatPriceInput`.
- `client-name.spec.ts`: `normalizeClientName` (leading/trailing, inner runs, tabs, NBSP, NFC, idempotent), `normalizeClientPhone`, `clientNameLength` (code points), `hasInvalidClientTextChar` (a table of allowed and refused characters, including each range edge), `checkClientName` (blank, invalid, 60 vs 61, case-insensitive match on active and inactive with the existing spelling, **"Cafe" vs "Café" are not a match**, `selfId` excluded, a spacing-only change is not "unchanged").
- `client-list.spec.ts`: `foldForSearch`; `compareClients` (**"Émile" among the E's, "The Green Table Café" under T**, case ignored, "Cafe" then "Café" then a stable id tie-break, sorting is idempotent); `filterClients` (search matches any part, ignores case, accents and leading/trailing spaces, "cafe" and "table" find "The Green Table Café", status combines with search, empty search shows all, a query with only spaces shows all); `clientMatchesFilters`; `clientInitials` (`SD`).
- `client-schemas.spec.ts`: each body and param schema; `tenant_id`, `active`, `archivedAt` stripped; the name/phone/price limits and messages; omitted phone or price on add is null, but **required on update**; a `version` of 0, 1.5 or a string is refused; **no issue message contains the input** (sentinel).
- `clients-constants.spec.ts`: `MAX_CLIENT_NAME_LENGTH` (60), `MAX_CLIENT_PHONE_LENGTH` (30), `MAX_CLIENT_TEXT_INPUT_LENGTH` (200), `MAX_CLIENTS_PER_FARM` (500) and `MAX_CLIENT_PRICE` (9999.99) equal the numbers in the M12 migration; `DEFAULT_CURRENCY` equals the M11 column default.
- `client-name-parity.spec.ts` (the size-name-parity pattern): parses the whitespace class from `normalize_client_phone` and the invisible-character class from `client_text_invalid` in the migration and compares them with the JavaScript sets over every code point Postgres can hold; the whitespace class must also equal the one in the sizes migration.
- `clients-repo.spec.ts` (fake client, as `sizes-repo.spec.ts`): every SQLSTATE gives the right status, `code`, `reason`, `fields`; the `hint` picks the field message; `existing` is read by id and is **absent** when that read fails; `client` attached on `TM022` and absent when its read fails; `p_tenant_id` injected from the db, never from input; a `null` phone or price is **omitted** from the rpc args; a write returns the re-read client; **sentinel: an error whose `message`, `details` and `hint` contain a sentinel string produces no `console` output containing it and no response body containing it (AC29)**.
- `client-errors.spec.ts`, `client-mutations.spec.ts` (with a stubbed `$api`: one in-flight guard for add/update so a second call resolves to `null`; archive and restore guarded per id, two different rows run at once; the submission tracker reuses the id for the same payload and replaces it when name, phone or price changes or the form reopens; success upserts the reply; `client_changed` upserts the returned client and reloads; `name_taken` reloads without waiting; a 20s timeout becomes `network`).
- `clients-privacy.spec.ts` (static guard, in the style of `server-guards.spec.ts`): the clients page, components and composables never reference `route.query`, `router.replace`/`push` with a `query`, `localStorage`, `sessionStorage`, `useCookie` or `document.cookie`; no file under `server/` for clients logs an error object (`console.*(…, error)`), only codes (AC29, AC30).
- `server-guards.spec.ts`: "finds the server sources" expects the five clients route files, so rules (a), (b2) and (d) run over them. `api-errors.spec.ts`: `client` passes through `apiError`'s `extra`; the new reasons pass through `toApiError`.
- Fixtures that build a `FarmSummary` (`size-order.spec.ts`, `production-form.spec.ts`) gain `currency: 'PHP'`, since it is now required.
- Component and page behaviour (states, focus, 44px targets, dark mode, phone keypads) has no unit harness in this repo; it is verified by QA against the ACs, and the logic sits in the pure utils above.

### 3.7 Tasks

Order: contract first, then DB and server, with the frontend building against the contract in parallel. **B1 unblocks everything.** After B1 three tracks can run **in parallel**: the DB track (B2, B3, B4, B5), the server track (B6, B7; needs B4 for `db:types`, but the repository can be written and unit-tested against typed fakes before that), and the whole FE track (F1 to F7, using a stubbed `$api` typed from the §3.3 contract). **F1, the shared-sheet extraction in F2 and the currency plumbing on the FE side need nothing from the backend.** FE integration against the real routes needs B7.

**Backend**
- [x] **B1 [BE] (contract; unblocks FE)** `shared/types/api.ts` additions (3.3: `NameMatch`, the new reasons, `client` on `ApiErrorData`, `FarmSummary.currency`, the client types), `shared/constants/currency.ts` and `clients.ts`, `shared/utils/price.ts`, `client-name.ts`, `client-list.ts`, `shared/schemas/clients.ts`, `apiError`'s `extra` gaining `client`, and their Vitest specs (`price`, `client-name`, `client-list`, `client-schemas`, `clients-constants` (the migration comparisons can be filled in with B2/B3), `api-errors`). Update the two `FarmSummary` test fixtures.
- [x] **B2 [BE]** Migration M11 `tenants_currency` and the currency plumbing: `FARM_SUMMARY_COLUMNS`, the `memberships.ts` embed and `toFarmSummary` gain `currency`; `/api/me` returns it. pgTAP currency cases (in `060`) and the `020` currency isolation case. `bun run db:types`.
- [x] **B3 [BE]** Migration M12 `clients`: helpers, `clients`, constraints, the unique index, `clients_write_guard`, `client_submissions` and its guard, grants and policies. Rules-level pgTAP in `060` (names, phone, price, 500 cap, no delete, ledger hardening, immutability, direct-write bypasses). Copy the whitespace class verbatim and add `client-name-parity.spec.ts`.
- [x] **B4 [BE]** Migration M13 `clients_functions`: the four RPCs with the SQLSTATEs, revokes and grants. Function-level pgTAP in `060` (add and idempotency, edit and version, status, AC27). `bun run db:types`.
- [x] **B5 [BE]** pgTAP wiring: registry rows (`clients`, `client_submissions`), `010` additions, `020` named cases both ways, `090` m17 to m20 and the policy list. `bun run test:db` passes.
- [x] **B6 [BE]** `server/repositories/clients.ts` (`listClients`, the four writes, `toClient`, `mapClientDbError`, the code-only logger) and `clients-repo.spec.ts` including the PII sentinel.
- [x] **B7 [BE]** The five routes; extend `server-guards.spec.ts`; `clients-privacy.spec.ts`. Verify end to end on the local stack: add and a replay, a replay with another payload, a clash with an inactive client (`existing.archived`), the 500 limit, edit, a stale edit (`client_changed` + `client`), an edit whose stale version carries the same values, archive and restore twice, a foreign id (404, same as unknown), `?tenant_id=` and a body `tenant_id` ignored, no query support on `GET`, `/api/me` carries `currency`, and **read the dev-server and Postgres logs after failing requests on purpose to confirm no name, phone or price appears (AC29)**.
- [x] **B8 [BE]** Manual concurrency checks (3.6) and a note in §4.
- [ ] **B9 [BE] (optional, not required by any AC)** `provision --currency <ISO code>`: a new `p_currency` argument on `provision_farm` (drop and recreate; update the three 010 regprocedure strings, the CLI, `provision-args` and its spec). Defer unless QA or the owner wants it.

**Frontend**
- [x] **F1 [FE]** Pure helpers and their specs: `app/utils/client-errors.ts`, `client-copy.ts`, `client-mutations.ts` (guards, retry tracker, reply application) with `client-errors.spec.ts` and `client-mutations.spec.ts`.
- [x] **F2 [FE]** Shell and shared pieces: `useShellSubtitle` and the layout's subtitle preference; `useFarm()` `currency`, `currencySymbol`, `formatPrice`; extract `useSheetKeyboard` and `sheet-ui.ts` from `ProductionFormOverlay` and make it use them (regression-check the Log production sheet on phone and desktop); `useMe().clear()` also clears `clients:*` state.
- [x] **F3 [FE]** `useClients` (farm-keyed state, client-only load, quiet refresh, `upsert`, `activeClients`, `reset`) and `useClientMutations`.
- [x] **F4 [FE]** `clients.vue` replacing the placeholder: `primaryAction`, the subtitle, `ClientsToolbar`, `ClientsList` (table and cards by container width), `ClientStatusBadge`, the loading, load-failure, first-use and no-match states, the "Showing x of n" line, the live count (AC1 to AC7, AC22 to AC25).
- [x] **F5 [FE]** `ClientForm` and `ClientFormOverlay`: Add and Edit, live checks, price prefix from the farm currency, input attributes and keypads, the discard check, the submission id, in-form errors (limit, generic save failure, name taken with the "Mark {Name} active" button), Edit with nothing changed, `initialName` (AC8 to AC19, AC33).
- [x] **F6 [FE]** `ClientRowMenu` and the page's after-change behaviour: mark inactive/active with per-row spinner, toasts, "Hidden by the … filter", the highlight and scroll, the filter-clearing rules, the stale-change flow, focus rules (AC14, AC18 to AC21).
- [x] **F7 [FE]** Polish and checks: 375px, tablet with the sidebar collapsed and expanded, no horizontal scroll, 44px targets, light and dark, reduced motion, a 500-client farm (search and filter stay responsive), a farm set to USD in the data (prefix `$`, `$6.50 / tray`), a missing-currency fallback, sign-out then another farm on the same browser, Back after sign-out (AC24 to AC26, AC30, AC31, AC35 to AC37).

### 3.8 Decisions

- **D1 Database-enforced rules with column-level grants, not `security definer`.** Same reasoning as feature 02 D1: `security invoker` functions force the owner to hold write privileges, so a hand-built PostgREST call must hit the same rules. Rejected: table-level grants with the rules only in the functions (an owner could store a 5,000-character name, `6.505`, an invisible-character name, or a 501st client); `security definer` (forbidden).
- **D2 `numeric` with checks, not `numeric(6,2)` and not integer cents.** A typmod rounds silently before any check runs, which breaks "refuse a third decimal" for direct writes. Integer minor units would hard-wire "2 decimals" into the storage and the API, while the follow-up currency feature may pick a currency with none. Storing the number the owner typed also keeps Sales' snapshot simple (AC37). Accepted cost: a JSON number goes through a JavaScript float, which is exact for values this small with 2 decimals (`String(9999.99)` round-trips) and is checked by `checkPriceNumber`.
- **D3 All four writes are functions, including single-row edit and status changes.** CLAUDE.md requires functions for multi-row writes only, but a function keeps the lock, the friendly error codes, the idempotency and the "no raw constraint error in the logs" property in one place, and matches feature 02. Rejected: direct `update … where version = …` from the repository (a `23505` or `23514` then carries the name or the whole row in its detail, straight into a place a log could see it).
- **D4 An integer `version` column is the stale-edit marker, not `updated_at`.** `updated_at` is `now()` at transaction start, can be equal for two quick changes, and loses precision through a JavaScript `Date`. `version` is exact, opaque to the UI, bumped by the trigger only on a real change, and not writable by the owner. Rejected: `xmin` (not portable and not meant for this).
- **D5 Edit is a full replacement with a version check, and a stale version whose values already match the stored ones succeeds (`changed: false`).** It makes a retry after a lost reply harmless (AC15's spirit for Edit) and never refuses a change that has already happened. A case where it could surprise: the client was made inactive elsewhere and the owner's edit happens to equal its current fields; the response then shows the row as Inactive and the toast says "Updated" (nothing was wrong to write). Flagged in 3.9 in case UX wants otherwise.
- **D6 Mark inactive/active is idempotent by state, with no version.** Already in the wanted state counts as done (UX flow C), with no version bump so an open Edit form isn't made stale by a no-op. This differs on purpose from feature 02's archive (whose owner decision was to show "changed elsewhere" on a retry); the UX for clients says otherwise and it is the friendlier choice for a one-tap action.
- **D7 Sorting, search and accent-folding are done in the browser by one shared helper; the database uniqueness stays accent-sensitive.** The search must react per keystroke, so it can't be a request; with at most 500 rows a JS filter is instant. Doing the sort in SQL as well would need the `unaccent` extension (available locally but not enabled, needs an immutable wrapper to index, and makes hosted setup an extra step) plus a second implementation of the fold that could drift from the search. One `foldForSearch` and one `compareClients` in `shared/` serve the page, the Sales picker and the tests. The server returns rows in a deterministic order that is **not** promised as the display order. Rejected: `unaccent` in SQL; a server-side search route (search text would then travel in requests and could reach logs, against AC29 and AC30).
- **D8 The uniqueness key is `(tenant_id, lower(name))` over NFC-normalised names, accent-sensitive.** Owner decision ("Cafe" and "Café" differ). NFC keeps one visual name from being stored two ways. Known edge (same as sizes, feature 02 QA N6): JavaScript `toLowerCase()` and Postgres `lower()` can differ for a few letters, so the form's local check may say "free" where the server then says "taken"; the server is the authority and the message appears after Save.
- **D9 A submission ledger with a payload hash, no personal data.** AC15 needs it and audit L1 wants the payload bound. Hashing the normalised name, phone and price avoids a second copy of personal data and makes Q11's by-hand erase one place shorter. Rejected: storing the fields (a second copy); a name-only key like sizes (a replay with a different phone would silently return the first client).
- **D10 The client list is not embedded in `/api/me` and is never rendered on the server.** `/api/me` runs on every page load and its payload is serialised into the SSR HTML; putting up to 500 names and phones there would put personal data in a cacheable, loggable place and slow every screen. The list is fetched after mount. Sizes are embedded because they are small, non-personal and needed on first paint; that reasoning doesn't apply here.
- **D11 The currency is one column on `tenants`, format-checked, with a fixed-locale formatter.** Same shape as `eggs_per_tray`. Rejected: a `farm_settings` table (nothing else needs it yet); a list-checked column (a migration per currency); a device-locale formatter (server, browser and tests would print different strings, and AC36 fixes the format). `narrowSymbol` gives `₱` and `$`, where the default display would print `US$` for dollars in some locales.
- **D12 `ApiErrorData.existing` becomes the general `NameMatch`, and clients add `client` and two reasons.** `SizeNameMatch` stays as an alias, so feature 02 code doesn't change. The clash carries `id` and `archived` (the inactive flag the form needs) and the name (for the UX copy). See the owner question in 3.9.
- **D13 The invisible-character set includes zero-width joiner and non-joiner.** AC10 names "zero-width spaces" and feature 02's N1 was about the same family; a name made only of them looks blank. The cost is that a joined emoji sequence (👨‍🌾) or a Persian non-joiner can't be typed into a client name. Owner-visible, tiny; flagged in 3.9.
- **D14 `PUT` (replace) for edit, `POST …/archive` and `…/restore` for status, no `DELETE`.** The API can't set `archived_at` to an arbitrary value, bump a version, or delete.
- **D15 The list layout switch is JavaScript (`useElementSize`), not a container query.** See 3.4: one layout in the DOM instead of two for up to 500 rows, and safe because the list renders only on the client.
- **Doc updates done by the architect (2026-09-26):** `docs/egg-farm-app-architecture-spec.md` (§3 "As built" gains the feature 03 paragraph; §5 gains `tenants.currency`, the rewritten Clients section and the corrected "snapshot" wording; §9 gains the price/currency bullet), and `docs/egg-farm-app-ui-spec.md` §7a (the same CL8 wording fix). **Proposed `CLAUDE.md` wording (not edited; for the team lead to put to the user):**
  - Under "Units and data model", add: *"Prices are plain numbers (`numeric`, 2 decimals, above 0) shown in the farm's currency, which is a per-farm setting (`tenants.currency`, an ISO code, default `PHP`, shown as ₱). Every price goes through the one `formatPrice` helper in `shared/utils/price.ts`; never type a currency symbol into a screen, and never convert a stored price when the currency changes (it only relabels). Clients' default price is per tray."*
  - Replace the clients bullet with: *"Clients are the farm's customers, not tenants, and are never deleted: no delete grant, policy, function or route. `archived_at` marks one inactive (the UI says "Inactive"), and past sales keep pointing at it. Names are unique per farm ignoring case and spacing, inactive ones included, and are not folded for accents. A sale stores its own price but **not** the client's name: a rename shows on past sales. Clients change only through `security invoker` functions (`add_client` with the `client_submissions` ledger, `update_client` with a `version` check, `archive_client`, `restore_client`); a farm holds at most 500."*
  - Under "Tenancy and security", add: *"Clients are the first personal data (names, phones). Never put them in logs (repositories log SQLSTATE codes, not error objects, because Postgres error details carry row values), in error messages, in the URL or search string, or in `/api/me` or the SSR payload (fetch the list on the client after mount). Clear client state on sign-out."*

### 3.9 Open questions / pushback

**Needs the owner's (or PM's) call**
1. **AC29 versus the name in a 409 body.** AC29 says names don't appear in "error responses". UX needs the existing client's spelling for "You already have a client called {Existing name}" and for the Mark-active button, and wants it to work when the local list is stale. The design returns `existing: { id, name, archived }` (and `client` on a stale edit) **only in the 409 body to the signed-in owner of that same farm**, and keeps names out of logs, out of the server's own `fields` message (`That name already exists.`) and out of the database's exception text. Reading: "error responses" means responses that are logged or reported, and the owner's own data going back to the owner is not that. **If the PM means it strictly**, the alternative is `existing: { id, archived }` with the form looking the name up in its loaded list (and, when the list is stale, showing the generic message until a quiet refresh finishes). It costs a slightly worse message in the stale case and about one more state in the form; it is a small change to the contract. **Default in the task list: include the name.**
2. **Invisible characters (D13).** The refused set includes zero-width joiner and non-joiner (a joined emoji or a Persian word can't be typed into a name). Say if the owner wants those two allowed; it is one range in one SQL class and one JS class.

**Pushback and notes on the acceptance criteria and UX (none blocking)**
3. **AC19 and Edit retries (D5).** A stale-version request whose values already match the stored ones succeeds instead of being refused. Refusing it would only annoy the owner (nothing would be lost by accepting it), and accepting it makes a lost-reply retry of an Edit harmless. UX or the PM can strike it (a one-line change in `update_client`).
4. **AC13 and trailing zeros.** "More than 2 decimals" is applied to the value, so `6.500` is accepted (stored as `6.50`) and `6.505` is not. The form and the server use one rule (`checkPriceNumber`); the price limit and the 2-decimal rule stay currency-independent (AC13), for the currency follow-up to revisit.
5. **AC20 versus feature 02 (D6).** Already-in-state is success for clients, whereas feature 02's owner decision made a retried archive show "changed somewhere else". The UX and AC20 for clients say the friendlier thing, and nothing conflicts, but the two screens now behave differently on a retry.
6. **AC31 and SSR.** The list is client-side only (D10), so the SSR HTML never holds a client; Back after sign-out already reloads (feature 00), and client state is cleared by `useMe().clear()` and keyed by farm.
7. **AC35 to AC37.** `useMe` reads the currency once per page load, so a change made in the data shows after a reload; nothing in this feature changes it at runtime. When the settings feature adds a setter it should call `setSizes`-style `useMe` replacement so the whole app relabels at once. It needs a write path then (a function, not a table grant), which is that feature's design.
8. **CL8 is fixed in the specs (see "Doc updates" in 3.8).** A sale keeps its own price but not the client's name; a rename shows on past sales (owner decision Q7), and because a client is never deleted a sale's `client_id` always resolves. Sales must **not** add a name snapshot without a new decision.
9. **UX U3 correction.** `USelect` in Nuxt UI 4.11.2 is a custom listbox, not a native select (verified in the installed package: `Select.vue` has no native mode, and there is no native-select component). Use a styled `<select>` (recommended) or a 44px `USelect`. No owner decision.
10. **UX "pure CSS container query".** Replaced by a `useElementSize` switch that renders one layout (D15). If UX wants both layouts in the DOM, the cost is 2 × up to 500 rows.
11. **Q11 (erase by hand).** With no delete, the by-hand erase is one `update` as postgres on the row (`phone = null`, `default_price = null`, `name` to a placeholder such as `Removed client 1a2b3c`, which the guard accepts) plus deleting that client's `client_submissions` rows. Sales history keeps working because the row and id remain. Not built in the app.
12. **Sales, for later (not built here):** the composite key `(tenant_id, id)` and the "never cascade" rule (3.1); CL6 (whether a sale's price is a line total or per tray) is Sales' call, and `formatPrice` is what it must use; the picker uses `activeClients` from `useClients` and the same `ClientForm`.
13. **Deferred audit items, unchanged:** L-4 (retention job; the new ledger is bounded at 500 rows per farm) and L-5 (security headers, before the first deploy) are unrelated. The sizes and production repositories still log raw error objects (no personal data there); only the clients repository is code-only.

**Notes for the architect from the PM (product constraints, not designs; kept as written):**
- **Personal data (AC28 to AC33).** Extend the shared isolation checker to clients (reads and writes). Keep names, phones and prices out of logs and error bodies. Keep search text out of the URL. Make sure the page isn't served from cache after sign-out. Enforce the field limits and the 500-client cap in the database, not only in the form. Feature 02's audit found unbounded direct inserts and a name-validation gap (M-1, M-2, S2, N1), so plan for both up front.
- **A retried save mustn't fail as "already exists" (AC15).** With unique names, a replayed create looks like a duplicate. Feature 01 and 02's submission-id approach is the known pattern.
- **Sales will reference a client and read its default price.** Store the price so that the number the owner typed stays the number they see (Q2). Archive rather than delete (AC21), with a name-uniqueness rule that covers inactive clients (AC11).
- **Currency is per-farm data (AC35 to AC37, CL12).** A per-farm currency value on the farm's own record, PHP by default, with every existing farm backfilled to PHP, read like eggs-per-tray and never hardcoded in the UI. One shared formatting helper for every price (symbol before the amount, 2 decimals, thousands separator). Prices are stored as plain numbers, so a currency change relabels them and never converts them. No screen or route to change it in this feature; keep the isolation test and the "no change without the owner" rules in mind for when the settings feature adds one. The currency-independent price limit (AC13) is enforced in the database.
- **The Add client form must be reusable from the Sales form** (AC34), and a create must return the new client so Sales can pick it.

## 4. Implementation notes (Devs)
- [BE] **B1 (contract) done.** Typecheck, lint and `bun run test:unit` (32 files, 496 tests) pass. Nothing of B2 onward is started (no migration, repository, route or `app/` file).
  - **Types:** `shared/types/api.ts`: `NameMatch` (with `SizeNameMatch` kept as an alias), `ApiErrorReason` gains `client_limit` and `client_changed`, `ApiErrorData.client`, `FarmSummary.currency`, and `Client`, `ClientsResponse`, `AddClientRequest`, `AddClientResponse`, `UpdateClientRequest`, `ClientChangeResponse` exactly as in 3.3.
  - **Constants:** `shared/constants/currency.ts` (`DEFAULT_CURRENCY = 'PHP'`); `shared/constants/clients.ts` (`CLIENT_FIELDS`, `MAX_CLIENT_NAME_LENGTH` 60, `MAX_CLIENT_PHONE_LENGTH` 30, `MAX_CLIENT_TEXT_INPUT_LENGTH` 200, `MAX_CLIENTS_PER_FARM` 500, `MAX_CLIENT_PRICE` 9999.99, `CLIENT_PRICE_DECIMALS` 2, `CLIENT_MESSAGES`).
  - **Utils:** `shared/utils/price.ts` (`formatPrice`, `currencySymbol`, `isKnownCurrency`, `checkPriceNumber`, `parsePriceInput`, `formatPriceInput`, plus the extra `priceProblemMessage`); `shared/utils/client-name.ts` (`normalizeClientName`, `normalizeClientPhone`, `clientNameLength`, `hasInvalidClientTextChar`, `CLIENT_TEXT_INVALID_RANGES`, `checkClientName`, plus the extra `checkClientPhone`); `shared/utils/client-list.ts` (`foldForSearch`, `compareClients`, `filterClients`, `clientMatchesFilters`, `clientInitials`, `ClientFilters`, `ClientStatusFilter`).
  - **Schemas:** `shared/schemas/clients.ts` (`clientNameSchema`, `clientPhoneSchema`, `clientPriceSchema`, `addClientBodySchema`, `updateClientBodySchema`, `clientIdParamsSchema`, and their inferred types).
  - **Server:** `server/utils/errors.ts`: `ApiErrorExtra` and `apiError` carry `client`. `server/repositories/tenants.ts`: `toFarmSummary` returns `currency: DEFAULT_CURRENCY` as a **temporary stand-in** so the required `FarmSummary.currency` typechecks; **B2 must replace it** with the real `tenants.currency` column (there is a `TODO(feature 03, task B2)` at the line).
  - **Tests:** `tests/unit/{price,client-name,client-list,client-schemas,clients-constants}.spec.ts` (new), `api-errors.spec.ts` (extended: `client` extra, new reasons), `size-order.spec.ts` fixture gains `currency: 'PHP'` (`production-form.spec.ts` builds no `FarmSummary`, so it needed nothing). `clients-constants.spec.ts` has a TODO for the migration comparisons (B2/B3).
  - **Small choices where 3.3 left room (none changes the contract):**
    - `checkClientName` picks the inactive-match wording from `selfId`: no `selfId` (Add) gives the "Mark it active instead" message, a `selfId` (Edit) the text-only one.
    - `checkClientPhone(raw)` is an extra, the phone twin of `checkClientName` for the form's live check. `priceProblemMessage(problem, currency)` is an extra that maps a price problem to the UX copy (the limit message is built with `formatPrice`, so it follows the farm's currency).
    - `CLIENT_MESSAGES.priceTooLargeServer` is a fixed string (`The most you can enter is 9,999.99.`, no symbol) for the server's schema; `changedElsewhere` is used as the message for a bad `version` or `id` (like sizes).
    - `formatPrice` throws `RangeError` for a non-finite amount (like `formatQty`); an unknown currency never throws. `-0` prints `0.00`.
    - `parsePriceInput` accepts `.5` and `5.`; `-` followed by a valid number is `not_positive`, anything else non-numeric (including `-abc`) is `not_a_number`.
    - `CLIENT_TEXT_INVALID_RANGES` is exported so the B3 parity test can compare it with the SQL class (it starts at U+0000; the SQL class starts at U+0001).
    - `clientInitials` uses only words that START with a letter or digit ("(Oak St)" is skipped as a word). Empty result when none qualifies.
    - The raw-input cap (200) is measured in UTF-16 units in JS (like sizes) and in code points in SQL, so JS is very slightly stricter for a raw value with many astral characters. Harmless: such a value would fail the 60 or 30 limit anyway unless padded with whitespace.
### [BE] B2 to B8 (backend, 2026-09-26)
B2 to B8 done and ticked. **B9 (`provision --currency`) is deferred, not built**: it would touch `provision_farm`'s signature, three 010 regprocedure strings, the CLI, `provision-args` and its spec, for no acceptance criterion (a test farm is switched with the `update public.tenants set currency = 'USD' ...` recipe in 3.1). Results: `bun run test:unit` 38 files, 585 tests pass (includes the frontend's specs); `bun run test:db` 8 files, 868 pgTAP tests pass (010: 47, 020: 285, 060: 239 new file, 090: 26); `bun run typecheck` passes; `eslint` on `tests server shared` is clean. `bun run lint` still fails, but only on the frontend's temporary preview files (`app/pages/pv-clients.vue`, `pv-production.vue`, `app/plugins/00.pv-*.ts`), which are not mine.
- **Migrations** (`supabase/migrations/`): `20260926082430_tenants_currency.sql` (M11), `20260926082431_clients.sql` (M12), `20260926082433_clients_functions.sql` (M13). `shared/types/database.types.ts` regenerated (`clients`, `client_submissions`, the four functions, `tenants.currency`).
- **Server:** `server/repositories/clients.ts` (`toClient`, `listClients`, `addClient`, `updateClient`, `archiveClient`, `restoreClient`, `mapClientDbError`), `server/api/clients/index.get.ts`, `index.post.ts`, `[id].put.ts`, `[id]/archive.post.ts`, `[id]/restore.post.ts` (no DELETE, no PATCH); `server/repositories/tenants.ts` and `memberships.ts` now select and return `tenants.currency` (the B1 stand-in is gone; `FARM_SUMMARY_COLUMNS` has `currency`).
- **pgTAP:** `000_helpers.sql` registry rows for `clients` and `client_submissions` (11 generic checks each, both directions); `010` +15 (RPCs invoker and anon-blocked, helpers, no delete/truncate/references/trigger, insert and update column privileges, no delete policy, ledger grant, no write on any `tenants` column); `020` +42 (15 cases x 2 directions: every RPC with the other farm's tenant id `TM006`, other farm's client id `TM023`, direct update/insert/delete/select/ledger bypasses, plus per-farm uniqueness both ways, anon, and the currency isolation cases); new `060_clients.test.sql` (helpers, names, phone, price, hidden characters by direct insert and direct update, CHECKs with the trigger off, column grants, version, immutability, the 500 cap, ledger hardening incl. `TM026`, the four functions incl. replay/`TM024`/`TM020` detail without a name/stale version/idempotent status, AC27 hashes, currency); `090` m17, m17b, m18, m19, m20, m20b and the policy list.
- **Vitest:** `clients-constants.spec.ts` now compares the limits and `DEFAULT_CURRENCY` with the migrations; new `client-name-parity.spec.ts` (parses the SQL classes from the migration and compares them with the JavaScript sets over every code point Postgres can hold; the phone whitespace class must equal the sizes one verbatim), `clients-repo.spec.ts` (30 tests, incl. the PII sentinel), `clients-privacy.spec.ts` (static guards, also scans whichever `app/` client files exist), `server-guards.spec.ts` lists the five routes.
- **Deviations from §3 (all small; none changes the contract):**
  1. **The trigger stores `default_price` rounded to 2 decimals** (after the check proved it has no more), so `6.5` reads back as `6.50` (the 060 test in 3.6 expects it). The functions round too, before hashing.
  2. **`assert_client_fields` checks the name in the order blank, invalid, too_long** (the order of `clientNameSchema`, so the server and the form give the same message for a name that is both too long and hidden-character), not the order the hint list is written in 3.1.
  3. `mapClientDbError(db, error, operation, clientId?)` has an optional fourth argument: `TM022` needs the client id to attach the current client. `existing.archived` comes from the fresh read by id, not from the exception detail. `TM021` carries no `fields` (only `reason: 'client_limit'`), as the 3.1 table says.
  4. The two `assert_*` SQL functions are not `immutable` (they raise; a planner must not constant-fold them). The index is named `clients_tenant_name_key` (3.1 wrote both `clients_name_key` and that).
  5. **Harness lesson applied:** the Write tool turned `\uXXXX` escapes in the migration into literal invisible characters; `app.client_text_invalid` was rewritten with plain-ASCII escapes (`­` ... `\U000E0000-\U000E007F`) and every new file was scanned for stray non-ASCII or control characters.
- **Verified by hand (B7, local stack, a second dev server on :3100 with its own build dir, two provisioned farms; 51 HTTP checks, all pass):** `/api/me` carries `currency: 'PHP'` and no clients; signed-out `GET` is 401; add, replay (`replayed: true`, same client, one row), replay with another payload (400 `submissionId`), a clash with an active and with an inactive client (`existing.archived` true/false, generic `fields.name`), "Cafe Uno" and "Café Uno" both save; archive/restore twice (`changed: false`, no version bump); edit, edit of only the capitalisation, edit with nothing changed, stale edit (409 `client_changed` + current `client`), stale version with the same values (200 `changed: false`), edit into another client's name (409 + `existing`), a body without `phone` (400); farm B adds "Maple Street Market" with no hint; another farm's id and an unknown id give the identical 404 body; `?tenant_id=`, a body `tenant_id`/`active`/`version` and `GET ?search=` are ignored; validation of every limit (blank, 61, zero-width space, control character, escaped NUL and lone surrogate in raw JSON -> 400 on `name`, phone 31 and hidden, price 6.505/0/-1/10000/"6.50", missing `submissionId`, malformed JSON); 9999.99 and `6.500` accepted. **500 limit:** farm B filled to 500 through the API (499 sequential adds, about 60 s), the 501st is 409 `client_limit`, edit, archive and restore still work at 500, an inactive client still counts (502nd refused), and `GET` of 500 clients is 65 KB in about 70 ms. `DELETE /api/clients/:id` and `PATCH` return 404, but as Nuxt's HTML not-found page (the same as any unknown `/api` path in this app), not the JSON error body.
- **Logs (AC29), read after failing requests on purpose** (a sentinel name, phone and price through validation failures, a clash, a stale edit, and direct PostgREST calls with the owner's own JWT): the dev-server log holds no name, phone or price and no `[clients]` line (no 500 happened); the Postgres log for the failed calls holds only the fixed messages (`a client with this name exists`, `client was changed elsewhere`, `too many clients`, `client name has a hidden character`) and `DETAIL {"id": ..., "archived": ...}`, and the `STATEMENT` lines show only `$1` placeholders; PostgREST and Kong logs hold no client value (Kong logs request lines with ids only, the search string never appears because it never leaves the browser). A **direct** duplicate insert logged the constraint name and **no DETAIL**: Postgres suppresses the key/row values from DETAIL for a role without RLS bypass, so the "residual risk" in 3.3 is smaller than the design says (nothing to add).
- **B8, manual concurrency (two psql sessions as the owner, local stack):** (1) session 1 `add_client('Bravo')` uncommitted, session 2 `add_client('bravo')`: session 2 waited 3,772 ms for the commit and then failed `TM020`. (2) Farm at 499 clients, two concurrent adds: session 2 waited 2,769 ms and failed `TM021`; the farm ended at exactly 500. (3) Farm B's owner inserting a client into farm A while A's clients lock was held: refused `42501` after 2 ms (the guard runs before the lock: audit L-1).
- **Parity checked against the live database as well** (one-off, not a test): `app.client_text_invalid` versus `hasInvalidClientTextChar` over U+0001 to U+10FFFF (minus surrogates), and `app.normalize_client_phone`'s trim class versus JavaScript `trim()`: 0 differences each. Note for the phone: NFC maps U+2000 and U+2001 to U+2002 and U+2003 inside a phone, in SQL and JavaScript alike.
- **For the frontend and QA:** `db:reset` wipes the local database, so dev accounts must be re-provisioned (`bun run provision`); I did one last reset, so no test farms are left. `FarmSummary.currency` is live on `/api/me`. `PUT` needs all of `version`, `name`, `phone`, `defaultPrice` (null clears). A 409 `name_taken` carries `existing` and a 409 `client_changed` carries `client` unless the follow-up read failed. Add reuses no cache: a replay comes back `replayed: true` with the first client's *current* state. `tests/unit/clients-privacy.spec.ts` scans `app/components/Client*.vue`, `app/composables/useClient*.ts`, `app/utils/client-*.ts` and `app/pages/clients.vue` for `route.query`, storage, cookies and `useAsyncData`/`useFetch`.
- **QA S1/S2 fixes (backend, 2026-09-26; new migration `20260926125723_ledger_uniqueness_and_blank_names.sql`, M14; M11 to M13 untouched).**
  - **S1 (owner could brick Add by filling the ledger): fixed structurally, not with a flag or a delete.** `client_submissions` gets `UNIQUE (tenant_id, client_id)` (`client_submissions_client_key`), one ledger row per client. `add_client` writes exactly one row for the client it has just created, so the ledger can never hold more rows than the farm has clients (at most 500) and no direct insert can have used up the id of a client that doesn't exist yet: the key and the 500-row backstop (TM026) can never be in `add_client`'s way. Owners keep their insert grant (the functions are `security invoker` and need it) and still have no delete; the most they can write is one row per existing client. Nothing to forge (no transaction-local setting, no policy on caller state), functions unchanged. Checked with QA's attack: 493 rows for one client through PostgREST is now 409 `23505` and writes nothing; one row per client is accepted; after it `POST /api/clients` is 200, its replay is 200 `replayed: true`, and an earlier submission still replays. pgTAP boundary case: a farm at 499 clients with 499 ledger rows still adds the 500th. The migration first deletes duplicate ledger rows, keeping the oldest, so an already-attacked database upgrades cleanly.
  - **`size_submissions` (feature 02) had the same problem** (cap 100, `TM016`, insert grant, no delete): an owner could fill it and make `add_size` fail. Fixed the same way in the same migration: `UNIQUE (tenant_id, size_id)` (`size_submissions_size_key`). Checked live (100 rows for one size: 409 `23505`; one per size: accepted; `POST /api/sizes` and its replay still 200) and in pgTAP (farm at 99 sizes with 99 ledger rows adds the 100th). `050_sizes.test.sql`: the "fill to 100, expect TM016" case (which wrote 100 rows for one size, now impossible) was replaced by these; TM016 is still tested, at 100 sizes with 100 ledger rows. **`production_submissions` (audit item L3) was not touched.**
  - **S2 (visually blank names): `app.client_text_invalid` (names and phones) and `CLIENT_TEXT_INVALID_RANGES` now refuse every Unicode Default_Ignorable_Code_Point except U+FEFF (which is whitespace and is trimmed), plus U+2800.** The set: U+0001-001F, 007F-009F, 00AD, 034F, 061C, 115F-1160, 17B4-17B5, 180B-180F, 200B-200F (joiners still refused), 202A-202E, 2060-206F (U+2065 is now in), 2800 (braille blank), 3164, FE00-FE0F, FFA0, FFF0-FFFB, 1BCA0-1BCA3, 1D173-1D17A, E0000-E0FFF. Order and messages unchanged (`raw > 200`, blank, invalid, too long). **The extra "needs one visible character" rule adds no code:** whitespace is collapsed and trimmed first and every other character that draws nothing is now refused, so a name that passes always has a visible character (`client-name.spec.ts` checks this over every code point, and that every Default_Ignorable_Code_Point of the runtime's Unicode data is refused). A name of only such characters gets the "hidden character" message, not "Enter a name". Existing rows are not rewritten. **Trade-off for the owner to know:** U+FE0F and the other variation selectors are refused wherever they appear, so text-style emoji typed with a phone keyboard (a heart, a cup of coffee, which carry U+FE0F) are refused in a name, like joiner emoji sequences already were; emoji without a selector (for example an egg) are fine. If the owner wants those allowed, it is a small follow-up: a new migration that narrows the class, `CLIENT_TEXT_INVALID_RANGES`, and the tests, plus a real "needs a visible character" check so a name of only a selector is still refused.
  - **Sizes' name rule now differs from clients'** (unchanged in feature 02, N1 stays an open decision): sizes still accept invisible-only names; clients refuse them.
  - **Tests:** `client-name.spec.ts` (+4 specs), `client-name-parity.spec.ts` (+1; it now reads the newest definition of `app.client_text_invalid` across all migrations), `client-schemas.spec.ts` (longer lists); `060_clients.test.sql` 239 to 270 tests (edge lists updated, S2 by direct insert, direct update, CHECK constraints with the trigger off, `add_client` and `update_client`; S1 attack and the 499-client boundary in new farm N); `050_sizes.test.sql` 180 to 190 (new farm O). `db:types` regenerated: only `isOneToOne` on the two ledger relationships changed.
### [BE] Audit fixes L7/L6/L1/L3 (backend, 2026-09-26)
Security audit findings L7, L6, L1 and L3, fixed with the owner's approval (joiners and variation selectors stay refused). Nothing is committed or deployed and the local DB is empty, so no data migration was needed.
- **L7 (quadratic price regex).** `parsePriceInput` uses `^(?:\d+(?:\.\d*)?|\.\d+)$` (one way to match: linear) and `hasTooManyDecimals` trims trailing zeros with a loop; `/0+$/` was quadratic too ("5." then 60,000 zeros then 1 took 2.8 s). Same language: `.5`, `5.` accepted, "6,5" `not_a_number`, `6.500` ok, `6.505` `too_many_decimals`. Regression tests in `price.spec.ts`.
- **L6 (widening `app.client_text_invalid`).** Comment corrected in place in `20260926125723_ledger_uniqueness_and_blank_names.sql`: CHECK constraints re-run on every UPDATE, so a legacy row with a newly refused character fails (23514, a 500) even on archive or restore. Any future widening of a refused set, once data exists, needs a data migration that rewrites or blocks existing rows first. No machinery added.
- **L1 (CSRF beyond `SameSite=Lax`).** `server/utils/request-guard.ts` (pure `checkRequest`) and `assertRequestAllowed` in `server/utils/handlers.ts`, called first in both wrappers, so every route has it and `server-guards.spec.ts` (f) pins that. For POST, PUT, PATCH, DELETE: `Sec-Fetch-Site` present and not `same-origin`/`none` (so `same-site`, `cross-site`, unknown values), or `Origin` present and not the request host (`Host` or `X-Forwarded-Host`, scheme ignored, `null` refused): **403, code `no_farm`** (the only 403 in the contract; no new code, no fields, no data). A request that has a body (`Content-Length` above 0 or `Transfer-Encoding`) must be `application/json` (parameters allowed): otherwise **400 `validation_failed`**. Absent headers never block; GET/HEAD/OPTIONS are not checked. Archive/restore/delete carry no body and need no content type. Deviation to know: the wrapper cannot tell which routes read a body, so the JSON rule is "any request with a body", which covers every route including future ones.
- **L3 (at least one visible character).** New migration `20260926135550_client_visible_char.sql` (M15): `app.client_text_visible(text)` (invoker, `search_path = ''`, immutable; an ASCII letter or digit short-circuits before the big class), used by `app.assert_client_fields` (the name step and the phone step, hint `invalid`, so the order stays raw > 200, blank, invalid, too long) and by two new CHECKs `clients_name_visible` and `clients_phone_visible`. Rule: at least one code point in Unicode L, N, S or P, **except U+FFFC**. U+FFFC is category So, so the plain rule would still accept it although the audit lists it; it is excluded on purpose (allowed next to a visible character). Postgres regexes have no `\p{..}` and `[[:alpha:]]` follows the OS libc, so the class is 801 explicit ranges generated from Node 24's Unicode 17.0 data (157,068 code points). JS twin: `hasVisibleClientTextChar` in `shared/utils/client-name.ts`, used by `checkClientName`, `checkClientPhone` and both zod schemas. The message is the existing "hidden character" copy (name and phone); no new message. **Phone:** the same requirement (if present, at least one visible character; no digit needed: "---", "+" and "ext" pass). **Cap on combining marks: not done** (it needs a second ~300-range class and a threshold that Thai, Hebrew and Tibetan must not trip; the 60-character limit bounds it, and a stack still needs a letter). Versioning: a later-assigned code point counts as unassigned here until the ranges are regenerated in a new migration; the parity spec fails when the runtime's Unicode moves.
- **Tests.** Unit: 43 files, 650 tests pass (the run includes another agent's new spec; mine: new `request-guard.spec.ts`, extended `price.spec.ts`, `client-name.spec.ts`, `client-schemas.spec.ts`, `client-name-parity.spec.ts` with the visible class over every code point, `server-guards.spec.ts` (f)). pgTAP: 8 files, 941 tests pass (060: 270 to 302; 010 lists the new helper). Live: DB vs JS over all 1,114,111 code points: 0 differences (157,068 visible each). L1 over every route with a real session (curl-style, browser same-origin, `none`, Origin only, cross-site, same-site, unknown, evil/null/other-port Origin, urlencoded/multipart/text-plain/no content type, signed out): 290 checks pass; in headless Chrome the real UI (add, mark inactive, mark active, edit) and `$api` calls for all 12 write routes send `Sec-Fetch-Site: same-origin`, the app `Origin` and JSON and get 200, and real cross-site and same-site form posts (urlencoded, text/plain, archive) get 403 and change nothing (34 checks). Direct PostgREST inserts and patches with an owner JWT for L3: 34 checks pass (refused with `TM017`/`TM018`, value not echoed; letter plus mark, emoji, CJK, punctuation-only phone accepted).
### [FE] F1 to F7 (frontend, 2026-09-26)
F1 to F7 done and ticked. `bun run typecheck`, `bun run lint` and `bun run test:unit` (40 files, 595 tests) pass. Nuxt UI 4.11.2 components used (props checked on ui.nuxt.com and against `.nuxt/ui/*.ts`): `UInput` (leading, trailing, `inputRef`), `UForm`, `UFormField` (`error`, `hint`, `help` and `#error` slots), `UButton`, `UBadge`, `UAlert`, `UModal` (`content` slot, `onOpenAutoFocus`, `onCloseAutoFocus`), `UDropdownMenu`, `UIcon`, `USkeleton`, `UCard` (through `AppPlaceholder`), `useToast` (`duration: 0`, `close`, `actions`). No `USelect` (see deviation 1).
- **New app files:** `app/utils/{client-errors,client-copy,client-mutations,client-store,sheet-ui}.ts`; `app/composables/{useClients,useClientMutations,useShellSubtitle,useSheetKeyboard}.ts`; `app/components/{ClientsToolbar,ClientsList,ClientRowMenu,ClientStatusBadge,ClientForm,ClientFormOverlay}.vue`. **Changed:** `app/pages/clients.vue` (placeholder replaced), `app/layouts/default.vue` (subtitle override; `data-primary-action` on the top-bar button and the FAB, so a page can return focus to whichever is showing), `app/composables/useFarm.ts` (`currency`, `currencySymbol`, `formatPrice`), `app/composables/useMe.ts` (`clear()` drops `clients:*` state), `app/components/ProductionFormOverlay.vue` (now uses `useSheetKeyboard` and `sheetUi(520)`; behaviour unchanged, checked in a browser on phone and desktop and by `sheet-ui.spec.ts`, which pins the class string).
- **Tests added (Vitest, stubbed `$api`):** `client-errors`, `client-mutations` (guards, per-id guards, submission tracker, reply application, conflict handling), `client-store`, `client-copy`, `sheet-ui`.
- **Behaviour built as designed:** state keyed by farm id and held in memory only (`useState('clients:state')`), loaded after mount, never in SSR or `/api/me`; quiet refresh on a later visit; a client saved while a read is in flight is merged back into that read's result (`mergeRecent`), and an older reply never overwrites a newer row (`upsertClient` compares `version`). Add uses one submission id per form opening, reused for the same name, phone and price. Mark inactive/active: no confirmation, per-row spinner, persistent error toast with Try again, "Hidden by the Active filter" toast, focus to the next row's ⋮ (else the search box). Filters are cleared when an add, edit or shortcut would hide the row. The price prefix is `useFarm().currencySymbol`; no symbol is typed anywhere (`client-copy.spec.ts` asserts it). The form's Edit with nothing changed emits `saved` (`unchanged`) with no request and no toast.
- **Deviations from §2.5 / §3 (all small; none changes the contract):**
  1. **Status filter is a plain styled `<select>`**, as §3.4 says (USelect is not native). 44px, chevron overlay, `aria-label="Filter by status"`.
  2. **Rows are drawn in steps (60 at a time), not all at once.** §3.4 asked for "one layout, rendered once", but 500 rows of Nuxt UI components took about 1 second to draw in dev. `ClientsList` renders the first 60 and adds 60 more when an end marker comes within about 600px (IntersectionObserver). Search and filters still run over the whole list, so "Showing x of n" and the empty states are exact; `ensureRendered(id)` adds rows up to a client that was just saved far down the list. Table rows carry `aria-rowindex`/`aria-rowcount`, cards `aria-posinset`/`aria-setsize`.
  3. **Each row's ⋮ starts as a plain button; the real `UDropdownMenu` is mounted, already open, the first time it is pressed.** Same reason. Keyboard (Enter, arrows, Esc, focus return) checked.
  4. **The desktop initials are a plain `<span>`**, not `UAvatar` (decorative, `aria-hidden`; same size and look).
  5. **The layout switch measures a zero-height marker at the top of the list**, not the list itself: measuring the list made the browser log "ResizeObserver loop completed with undelivered notifications".
  6. **The overlay does not swipe to close** (same as the Log production sheet: feature 01 §3.4 fallback). Every other close goes through the discard check.
  7. **`ClientForm` has no `close` emit** (Edit with nothing changed goes through `saved`/`unchanged`). It also emits `cancel`, `saved`, `changed-elsewhere`; exposes `dirty`, `saving`, `focusName(select?)`.
  8. **Focus after the overlay closes is decided by the page** (`ClientFormOverlay` suppresses Reka's focus return and emits `closed`), because the opener may be gone: the FAB is hidden while the sheet is open and the first-use card is replaced by the list after the first save. Add returns to the visible top-bar or FAB button, Edit to that row's name button.
  9. **`sheetUi(width)` takes 420 or 520**, a fixed map of literal Tailwind classes (Tailwind can't see `md:max-w-[${n}px]`).
  10. Skeletons use `bg-accented` (the default `bg-elevated` was invisible in dark mode).
  11. `useClients` keeps one state key (`clients:state`: farm id, status, list, failure count) instead of three, so a farm mismatch or a cleared state reads as "idle" in one place. The search fold is not cached per name (§3.4 mentioned it): `filterClients` in `shared/` folds per call, and 500 names per keystroke measured under 15 ms.
  12. Keypress detail: while a field message shows, Save is `disabled` (so Enter does nothing either), as in feature 02; the message clears the moment the value is valid.
- **Checked in a browser (headless Chrome, dev server) against a fake in-page backend, then against the real routes and a provisioned farm (removed afterwards; the local DB is empty again):** 375px, 320px, tablet 900px with the sidebar collapsed (table) and expanded (cards), 1280px; light and dark; no horizontal scroll; every control at 375px is at least 44px (list, toolbar, sheet); reduced-motion media query on. Flows: add name-only with Enter, add with phone and price, blank and 61+-character names, "Cafe" and "Café" both saved, active clash message, inactive clash with the "Mark {Name} active" shortcut, edit (pre-fill selects on focus, price 6.505 refused, 300 saved, `₱300.00 / tray`), edit with nothing changed (no request), discard dialog, stale edit (409 `client_changed`: toast, list current), mark inactive/active from the menu and by keyboard, filter-hides-row toast and focus, no-match, first use, loading skeletons, load failure and Try again, network failure keeps typed values and a retry makes one client, 500-client cap (alert text, existing clients still editable), USD farm (`$14.00 / tray`, prefix `$`, no ₱ anywhere), SSR HTML, `__NUXT_DATA__`, `/api/me`, `localStorage`, `sessionStorage` and cookies hold no client, sign out then Back shows the login screen. A 500-row list: first paint 60 rows, keystrokes 15 to 140 ms in dev.
- **Not verified (QA, please):** real phone keypads (`inputmode`, Go/Return, iOS has no Return on tel/decimal), iOS Safari and Android sheet-above-keyboard behaviour, a screen-reader pass (VoiceOver/TalkBack: names, live count, table caption, toast announcements), a production build's speed with 500 clients (dev numbers above are 3 to 5 times slower than production), signing in as a second farm on the same device and seeing none of the first farm's clients (the farm-id keying is unit-level and by clearing state in the browser; only one farm was used), the toast offset above the FAB on a real phone, and the 4px gap between neighbouring 44px targets on the card (⋮ beside the card's tap area).
- **Ambiguities and small notes:** (a) UX asks the phone Edit form not to open the keypad; focus then starts on the sheet's ✕, which shows a focus ring on open (same as Log production). (b) The "Showing x of n · Clear" line is 44px tall because of the Clear tap target, so it adds a visible gap above the list. (c) The Sales picker will need `ClientFormOverlay` mounted above the sale form; it does not hide the FAB itself (the page does), and it takes `initialName`.

### [FE] Hydration mismatch fix: Clients top-bar subtitle (2026-09-26)
- **Symptom:** `/clients` logged "Hydration node mismatch" (`p.truncate.text-sm.text-muted` in the navbar) and "Hydration completed but contains mismatches". Reproduced in headless Chrome (CDP), signed in, at 1280px.
- **Cause:** the layout draws the top bar before the page's setup runs, and the server never re-renders. So SSR read no override and drew the static nav text ("Your customers"), while the client hydrated with the page's override (`useState`, `{ text: null }` = hide) and expected no `<p>`. The other screens have no override, so they matched.
- **Fix:** a page that sets its own subtitle now says so in page meta (`definePageMeta({ ownSubtitle: true })`; typed in `app/types/page-meta.d.ts`). The layout reads that flag on both sides, and such a page shows no subtitle until it has set one (never the static text). The `<p>` keeps its line (`min-h-5`) while empty, so the title does not move when the count arrives. The rule is one pure function, `resolveShellSubtitle` (`app/utils/shell-subtitle.ts`); the layout and `useShellSubtitle` use it. `setSubtitle` is a no-op on the server. The override now records its owner, and `releaseSubtitle` drops it only for that owner, so a page that unmounts after the next page has set its own cannot wipe it.
- **Files:** `app/utils/shell-subtitle.ts` (new), `app/composables/useShellSubtitle.ts`, `app/layouts/default.vue`, `app/pages/clients.vue`, `app/types/page-meta.d.ts`, `tests/unit/shell-subtitle.spec.ts` (new). The live count in the subtitle and the top-bar button / FAB are unchanged.
- **Verified:** no hydration warnings after a hard reload, signed in, on `/clients`, `/settings`, `/production` and `/` at 1280px and 375px; Clients to Production to Clients in-app keeps the right subtitle; the title stays at the same height on every screen; the top-bar button shows at 1280px and the FAB at 375px. `bun run typecheck`, `bun run lint`, `bun run test:unit` pass.

### [DevOps] QA S3: `nuxt build` failed on relative `shared/` imports from `app/` (fixed, 2026-09-26)
- **Reproduced** in a scratch copy of the working tree, on Windows and on Linux (WSL Ubuntu, Node 24.18, Bun 1.3.14, `bun install --frozen-lockfile`): `RollupError: Could not resolve "../../../../../shared/utils/client-name.ts" from "node_modules/.cache/nuxt/.nuxt/dist/server/_nuxt/clients-*.js"`. It is **not Windows-only**: Vercel's Linux builder would fail the same way, so the first deploy was blocked. (Not built in-tree: a dev server was running on :3000.)
- **Cause:** Nuxt's Vite SSR build marks `shared/` external (`@nuxt/vite-builder`, `external: ["#shared", ^<root>/shared/]`) so Nitro bundles it once. An absolute or `#shared` import stays an absolute path and Nitro resolves it. A relative specifier (`../../shared/...`, only in `app/utils/*.ts`) is external too, but it is rewritten relative to the emitted chunk and points at a path that does not exist. Dev (Vite dev server) and `typecheck` resolve the source path, so neither notices. `server/` is bundled by Nitro directly, so its relative imports are fine (the build passed with them).
- **Why they were relative:** Vitest had no `#shared` alias, so the specs that import `app/utils/*` needed relative paths.
- **Fix:** the 14 relative import lines in 8 `app/utils/*.ts` files now use `#shared/...` (no other change); `vitest.config.ts` gets `resolve.alias['#shared']` -> `shared/`; `eslint.config.mjs` adds a `no-restricted-imports` rule for `app/**/*.{ts,vue}` that rejects relative imports of a `shared` folder (so it cannot come back; `server/`, `shared/` and `tests/` are unaffected).
- **Verified:** `nuxt build` in a scratch copy of the fixed tree: "Build complete"; `node .output/server/index.mjs` served `/login` 200, `/clients` 302 to `/login`, `/api/clients` 401. `bun run lint`, `bun run typecheck` and `bun run test:unit` (40 files, 600 tests) pass. Not run in-tree (dev server on :3000).

### [DevOps] Audit fix M1: security headers (2026-09-26)
- **Where:** `nuxt.config.ts`, `routeRules['/**'].headers` (built from a `securityHeaders` constant at the top of the file). One place, applies to pages, `/api` and static assets, in dev, the Node build and the Vercel build. New guard `tests/unit/security-headers.spec.ts` (frame-ancestors only, permissions denied, HSTS production-only, no `swr`/`isr`/`cache`/`prerender` rule and no `cache-control` set there).
- **Headers:** `X-Frame-Options: DENY`; `Content-Security-Policy: frame-ancestors 'none'` (frame-ancestors ONLY, no script-src/default-src yet); `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` denying accelerometer, bluetooth, browsing-topics, camera, display-capture, geolocation, gyroscope, hid, magnetometer, microphone, midi, payment, serial, usb (the app uses none of them); `Cross-Origin-Opener-Policy: same-origin` (sign-in is same-tab email/password/OTP, no popup); `Strict-Transport-Security: max-age=31536000` only when `NODE_ENV=production` (no includeSubDomains/preload). `Cache-Control` is untouched: `server/plugins/no-store.ts` and `handlers.ts` keep `private, no-store`, and Nitro's `/_nuxt/**` immutable rule still applies.
- **Note:** Nitro's own error handler replaces some headers on error responses (401/404 JSON): `x-frame-options: DENY`, `x-content-type-options: nosniff` and `referrer-policy: no-referrer` stay strict, but its CSP is `script-src 'none'; frame-ancestors 'none'` in production (`script-src 'self' 'unsafe-inline'; ...` in dev). HSTS and COOP are still present on those.
- **Verified:** typecheck, lint pass; the new spec passes (`test:unit` currently has 8 failures in `client-name*`/`client-schemas` specs from the backend's in-progress audit L3 work, unrelated). `curl` on a dev server (:3000 and a second on :3300 with its own build dir) for `/login`, `/clients` (302), `/api/me` (401), `/api/clients` (401), `/favicon.svg`. A real `nuxt build` in a scratch copy (deleted), served with `node .output/server/index.mjs`: same set plus HSTS on `/login`, `/clients`, `/api/*`, `/favicon.svg`, a hashed `/_nuxt/*.js` (still `public, max-age=31536000, immutable`) and a 404. Headless Chrome on dev and on the production build: login page hydrates, sign-in with the Supabase password flow works under COOP, `/clients` loads and the Add sheet opens, no CSP/frame/permissions-policy console messages, an iframe on another origin is blocked (`Framing ... violates ... frame-ancestors 'none'`), and a same-origin iframe of `/login` is blocked too. Nuxt DevTools' iframe (`/__nuxt_devtools__/client/`) is served by Vite outside Nitro and still loads. A "Hydration node mismatch" warning on `/clients` (`p.truncate.text-sm.text-muted` in the navbar, the shell subtitle) also appears in a production build with no headers at all, so it is not from this change (frontend to look at).
- **Vercel:** `NITRO_PRESET=vercel nuxt build` emits the `/(.*)` header route in `.vercel/output/config.json`. Nitro writes it without `continue: true` (same as its own `/_nuxt` cache rules); this could not be confirmed without a deploy. Dynamic responses (pages, `/api`) get the headers from the same Nitro runtime rule as the Node build regardless, so only static assets on the CDN depend on it. **To confirm on the first preview deploy** (needs the owner's go-ahead): `curl -I` `/login`, `/api/me` and a `/_nuxt/*.js` asset and check the headers.
- **Follow-ups (not done):**
  1. **Full CSP** (script-src/default-src), which needs a Report-Only rollout first. Not added now: without a report endpoint it only produces console noise. Considerations: the SSR HTML has inline scripts (theme/colour-mode init, `window.__NUXT__` config and payload bootstrap) and inline `<style>` (Nuxt UI colours) plus a `style=` attribute, so it needs a nonce or hashes, or `'unsafe-inline'` for `style-src` at least; a per-request nonce means SSR pages can never be cached (already true). `connect-src 'self'` plus the Supabase URL (`NUXT_PUBLIC_SUPABASE_URL`, https and wss for the hosted project); fonts are self-hosted by `@nuxt/fonts` at build (`font-src 'self'`); icons are bundled locally (`img-src 'self' data:`); `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`. Dev needs `'unsafe-eval'`/ws for Vite HMR, so keep the CSP production-only.
  2. **HSTS `includeSubDomains`/`preload`** once the custom domain is chosen and every subdomain is HTTPS (Vercel also adds its own HSTS on its domains).
  3. **Vercel WAF / rate limiting (audit M2):** rules for `/api/*` and sign-in, set in the Vercel dashboard (outward-facing, needs the owner's approval; nothing prepared in code).
  4. Optionally `Cross-Origin-Resource-Policy: same-origin` for `/api/**` once nothing cross-origin reads it.

## 5. QA report (QA)
**Verdict: PASS** (2026-09-26). No Blocking finding and every AC is met. There are 3 Should-fix items and a few Nice-to-haves (below); none of them is an acceptance-criterion failure. Not built or checked here: real-device keypads and screen readers (see "Unverified").

**How it was checked.** Full suite, typecheck and lint were run. Then two provisioned farms (QA Farm A, QA Farm B) were attacked through PostgREST with owner JWTs (about 190 calls) and through the real API routes (about 110 calls), and the UI was driven in headless Chrome (CDP) against a **production build** (`nuxt build`, node server on :3200, built from a scratch copy, see finding S3) at 320, 375, 768, 900, 1023, 1024, 1280 and 1440px, light and dark, reduced motion. Postgres, PostgREST, Kong, Auth and the app server logs were read after the failing requests. Sentinel values: `SENTINELNAMEzq9`, `SENTINELPHONEzq9`, `SENTINELPRICEzq9`, `B Secret Client`, `Maple`, `Oakhill`.

### Per-AC evidence
| AC | | Evidence |
|---|---|---|
| 1 | ✅ | `/clients` shows "Clients" and "16 customers" / "29 customers" / "500 customers" (all clients, unchanged by search or filter: "Showing 71 of 500" with subtitle still 500). Still 5 tabs. `document.title` = "Clients · Tamago". |
| 2 | ✅ | 375px: one visible 52x52 FAB `Add client` at bottom right, above the 65px tab bar (FAB y 668-720, nav y 735). 768-1440px: top-bar "Add client" (120x44 tablet, 120x36 desktop), no FAB. Production's own button is unchanged (Production regression below). |
| 3 | ✅ | Cards (375px) and table (Client/Phone/Default price/Status/actions) show name, phone or "— / No phone", "₱6.50 / tray" or "— / No default price", and the words Active/Inactive. Screenshots `s1-*`, `s10-*`. |
| 4 | ✅ | Order seen in UI: "Cafe", "Café", "CC test", "maple street market", "Oakhill Bakery"... (case- and accent-insensitive, stable tie-break). `client-list.spec.ts` covers "Émile" among the E's and "The Green Table Café" under T. |
| 5 | ✅ | Typing "cafe" gives Cafe + Café at once, no request sent (network log: no request contains the text), "  MAPLE " (spaces, capitals) finds "maple street market"; clear returns all. |
| 6 | ✅ | `<select>` All statuses / Active / Inactive; combined with search; subtitle unchanged. Marking inactive under the Active filter removed the row and toasted "Marked Cafe inactive. Hidden by the Active filter." |
| 7 | ✅ | "zzz" gives "Showing 0 of 16 · Clear", "No clients match this filter." and "Clear filters"; status-only variant "You haven't marked any clients inactive." Search box and select stay usable (`s1-nomatch.png`). |
| 8 | ✅ | Form has Name, Phone (Optional), Default price (Optional, "₱ ... per tray"), Cancel, Save, all labelled. Phone: bottom sheet (375px, radius 16px top, full width); desktop: centred 520px (Production) / 420px client dialog per `sheet-ui.spec.ts`. |
| 9 | ✅ | FAB, type name, Enter: 2 interactions (name is focused on open). Name + phone + price: 4 taps plus typing (`s4-*`). |
| 10 | ✅ | "  QA   Flow  One " saved as "QA Flow One"; blank "Enter a name."; 61 chars refused, 60 saved, emoji count as one; ZWSP, ZWJ/ZWNJ, LRM, RLO/LRE/PDF, isolates, word joiner, soft hyphen, control, DEL, C1, tag chars, ALM, U+180E refused by API, form and direct PostgREST; NUL and lone surrogate in raw JSON gave a 400 field message, not a 500. Save blocked while a message shows. See N1 for visually blank characters that are still accepted. |
| 11 | ✅ | "maple STREET   market" refused with "You already have a client called maple street market."; inactive match shows "... is on your list, but marked inactive. Mark it active instead." plus a button that marked it active (toast "Marked Oakhill Bakery active", 1 restore request); "Cafe" and "Café" both saved, "CAFÉ" and decomposed "Cafe\u0301" clash with Café; a case-only edit of the client's own name saved (version 3); farm B added "Maple Street Market"-style names with no hint (same names in two farms: pgTAP 020 both directions; not repeated by hand). |
| 12 | ✅ | "+63 917 123 4567", "(555) 201-3348" kept exactly; 30 saved, 31 refused; NBSP at the ends trimmed; hidden characters refused (API and direct). Phone input: `type=tel`, `inputmode=tel`, 44px. |
| 13 | ✅ | UI and API: 6.5 saved as 6.50 (field shows "6.50" on blur, list "₱6.50 / tray"); 6.505 refused; 6.500 accepted; 0, 0.00, -1, 10000 (message shows "₱9,999.99"), "6,5", "abc", "1e3", "+6.5", "6.5.1", Arabic digit refused; 9999.99, 0.01, " 6.5 ", "5." accepted. Direct: 9999.995, NaN, Infinity, 1e30 refused; `.5` in the form is accepted as 0.50. Input `inputmode=decimal`, placeholder `0.00`, prefix from the farm currency, "per tray". |
| 14 | ✅ | Toast "Added QA Flow One", form closed, row highlighted (`size-row-flash` animation) and in view, subtitle 16 to 17. Filter clearing is implemented (`clientMatchesFilters` in `clients.vue`) and unit-tested; the Edit-rename path was not driven by hand. |
| 15 | ✅ | 4 rapid Save taps sent 1 POST. Response for a saved request was dropped (CDP `Fetch.failRequest`): form stays open with values, "Couldn't save...", Save again reused the **same** submissionId, ended with **one** client and no "already exists". API replays: same payload returns the first client (`replayed: true`, also with different spacing or 6.50); different phone or name case returns 400 on `submissionId`; replay after a rename or archive returns the current state. |
| 16 | ✅ | Offline (CDP `emulateNetworkConditions`): alert "Couldn't save. Check your connection and try again.", all values kept, no client created; online retry made exactly one. |
| 17 | ✅ | Cancel with nothing typed closes at once; typed text gives "Discard this entry?" with Discard / Keep editing (Keep editing keeps the text); Esc goes through the same check. Swipe-to-close is not offered (FE deviation 6; same as Production). |
| 18 | ✅ | Tap the card body (or ⋮, Edit) opens "Edit client", pre-filled ("6.50"); Save with no change: no request, no toast; case-only rename saved ("Updated oakhill bakery"); clearing phone and price shows dashes; own-name never clashes; edit into another client's name gave the name message. Enter on the row's name button opens Edit on desktop. |
| 19 | ✅ | Edit opened, the client changed through the API, Save: form closed, list refreshed to the other change (`000-ELSEWHERE`, ₱9.00) and the toast "This client was changed somewhere else. The list is up to date now." API: 409 `client_changed` + current `client`; stale version with the same values gives 200 `changed: false`. |
| 20 | ✅ | Menu shows Edit + Mark inactive (Mark active for an inactive client), 44px items; no confirmation; toast "Marked Oakhill Bakery inactive"; fields kept; second archive returns `changed: false` and version stays 2. |
| 21 | ✅ | No delete anywhere: PostgREST `DELETE` on `clients` gives 42501 (own and other farm, delete-all), `DELETE`/`PATCH` on the API path give 404, no delete in the menu, `060` and `010` assert the grant and policy are absent. |
| 22 | ✅ (code trace) | The first-use card was **not seen in the browser** (both QA farms already had clients when the screen was first opened). Evidence: `app/pages/clients.vue` + `client-copy.spec.ts` (copy and no sample names), and the SSR HTML never shows "No clients yet" while loading. FE reported checking it. |
| 23 | ✅ | SSR HTML contains skeleton markup and no "No clients yet"; the list appears after mount (load measured 0.9 s desktop, 1.5 s at 4x CPU throttle). Load-failure card: code trace and unit tests only (not forced in the browser). |
| 24 | ✅ | 375px and 320px: `scrollWidth == innerWidth`, no control under 44x44 (audit of every visible button, input and link), last card scrolls clear of FAB and tab bar (the scroll container has bottom padding, checked with the FAB at y 668 vs nav 735), ⋮ is 8px from the name button. Sheet shrinks with a 420px viewport and Save stays pinned (emulated keyboard). |
| 25 | ✅ | 768/900px collapsed sidebar: table, Add button in top bar; 768/900px expanded: cards, no overflow, no small target; 1023px expanded: table fits; 1024/1280/1440: table 1007px wide. Add is always reachable. |
| 26 | ✅ | Dark screenshots at 375 (`s17-dark.png`) and 1280: names, phone, price, badges and messages readable; skeletons visible in dark (FE deviation 10). |
| 27 | ✅ | `060` compares hashes of `production` and `sizes` before and after every client operation (868 pgTAP pass); no client code touches egg tables (grep). |
| 28 | ✅ | Registry rows for `clients` and `client_submissions` (11 checks each, both directions), 020 named cases, 090 mutations m17 to m20. Live: A read/updated/deleted/upserted B's client via PostgREST: 0 rows or 42501, B's data unchanged after every attempt; A insert with B's `tenant_id` gave 42501; foreign ids through the API give the same 404 as unknown ids; rpc with B's tenant gives TM006, with B's client id TM023; anon gets 401/42501 on table and rpc; signed-out `GET /api/clients` is 401. Same names in both farms are allowed with no hint. |
| 29 | ✅ | After every failing request (validation, clash, stale, limit, cross-farm, hidden characters, 22P02, oversized): app server log has no line at all; Postgres log holds only the fixed messages and `DETAIL {"id","archived"}` (0 hits for the sentinels, names, phones; STATEMENT lines use `$1`); Kong, PostgREST, Auth logs clean. The 409 body carries the existing name only to the same farm (owner decision). See N3 for the direct-write 22P02 line. |
| 30 | ✅ | Search text never in the URL, network log or history; `localStorage` only `nuxt-color-mode`, `sessionStorage` empty (or `nuxt:reload`), cookies only the Supabase session; requests only to :3200 and :54321. SSR HTML and `__NUXT_DATA__` of `/clients` and `/` contain no client (`$sclients:state` is null); `/api/me` has none. `clients-privacy.spec.ts` guards it. |
| 31 | ✅ | Sign out: lands on `/login`, Back stays on `/login` with 0 rows and no names; `/clients` signed out redirects to `/login`; second farm signed in on the same browser saw only its own client and never A's names (MutationObserver over the whole session: 0 hits). Note: sign-out does a full reload, so the farm-id keying was not needed and only unit-tested. |
| 32 | ✅ | Every limit enforced in the database for direct writes (name 60/200, phone 30/200, price range/2 decimals, hidden characters, 500 rows, id/tenant_id/version/created_at not writable, no delete). Only the owner's farm is reachable. |
| 33 | ✅ | Farm A filled to 500 (bulk 600 in one request refused atomically, TM021, count unchanged); 501st via API 409 `client_limit`, via UI "You've reached the limit of 500 clients. You can still edit the ones you have." (values kept); at 500 edit, archive, restore all 200; list of 500 loads in 0.9 s, first paint 60 rows (rendered in steps of 60), search keystrokes about 33 ms each (about 50 ms at 4x CPU throttle, one 570 ms sample right after a filter change at 4x). |
| 34 | ✅ | Not testable. Checked what it needs: composite key `(tenant_id, id)`, no cascade, `archive_client` never reads sales, `ClientForm` self-contained with `initialName`, `activeClients`, `formatPrice` reusable. |
| 35 | ✅ | New farms provisioned with no currency argument read `PHP`; `tenants.currency` column defaults `PHP`; A and B each see only their own value; owner UPDATE/INSERT/DELETE on `tenants` all 42501; no currency control anywhere in the UI (checked menus and pages). |
| 36 | ✅ | With farm B set to `USD` in the data: list "$1,250.50 / tray", "$250.00 / tray", prefix `$`, limit message "The most you can enter is $9,999.99.", no "₱" anywhere on the page; farm A still "₱". `ZZZ` in the data falls back to "₱". `'usd'` is refused by the DB check. One formatter: only `shared/utils/price.ts` and `useFarm.ts` (grep for a hardcoded symbol found comments only). |
| 37 | ✅ | B's default price stored as `250.00` before and after the currency change; the screen showed "₱250.00" then "$250.00" (relabel only); nothing multiplies a price. |

### Findings
**Blocking:** none.

**Should fix**
- **S1 [backend-dev] The add ledger can be filled by the owner, permanently disabling Add for that farm.** `supabase/migrations/20260926082431_clients.sql:400` grants the owner `insert` on the ledger and `:339-357` caps a farm at 500 ledger rows (`TM026`). Scenario (run): farm B had 8 clients and 7 ledger rows; `POST /rest/v1/client_submissions` with 493 rows `(tenant_id, id, client_id = own client, payload_hash = 64 hex)` returned 201; after that every `POST /api/clients` returns **500 `internal`** (`add_client` cannot insert its own ledger row), and the owner cannot delete the rows (`DELETE` gives 42501), so only an operator with postgres can repair it. It affects only the attacker's own farm (a stolen session or a script), but it is irreversible without an operator and it shows a "500". Fix: stop owners writing the ledger directly (for example let `client_submissions_guard` accept rows only while `add_client` has set a transaction-local flag with `set_config(..., true)`, or raise the cap well above what a farm creates and make `add_client` prune old rows), and add a 060 case. Feature 02's size ledger has the same shape; worth checking there too.
- **S2 [backend-dev] Visually blank names are accepted.** `20260926082431_clients.sql:85` (and `CLIENT_TEXT_INVALID_RANGES` in `shared/utils/client-name.ts`) do not list the "blank-looking" characters U+3164 (Hangul filler), U+115F/U+1160, U+2800 (braille blank), U+034F, U+17B4/U+17B5, U+FE00-FE0F. Run: a name of only `\u3164` (also `\u2800`, `\uFE0F`) was saved as a client and shows as an empty card. It only harms the owner's own list, but AC10's reason for refusing invisible characters is "a name that looks blank". Fix: add the ranges to the SQL class and the JS twin (parity spec keeps them in step) or refuse names with no visible glyph. Also add them to the `060` and `client-name` tests.
- **S3 [devops / frontend-dev] `nuxt build` fails on `app/` code that imports `shared/` with a relative path.** `app/utils/*.ts` use `../../shared/...` (for example `app/utils/production-errors.ts:4`, `production-range.ts:6`, `size-mutations.ts:15`, and now `client-mutations.ts:20`, `client-errors.ts`, `client-store.ts`). In a scratch copy of the tree, and also of a clean `git archive HEAD` (so it predates this feature), `nuxt build` stops with `RollupError: Could not resolve "../../../../../shared/constants/production.ts" from ".nuxt/dist/server/_nuxt/production-*.js"`. Replacing those imports with `#shared/...` (the alias the components already use) made the build succeed, and that scratch build is what the 500-row performance figures come from. I did not run `nuxt build` in the working tree (it rewrites `.nuxt`, which the running dev server uses), so please have devops confirm in-tree. If it fails there, first Vercel deploy is blocked. Not caused by feature 03 alone, but this feature adds more of the same imports.

**Nice to have**
- **N1 [frontend-dev]** Tablet table (768-1023px, sidebar collapsed): the row's name `<button>` is 25-36px wide (44px tall). The whole row opens Edit, so it is not a real problem, but it is under the "44px on tablets" wording of UX Accessibility.
- **N2 [backend-dev]** `DELETE`/`PATCH /api/clients/:id` return Nuxt's HTML 404 page rather than a JSON error (already noted by BE); harmless, and there is intentionally no such route.
- **N3 [note, backend-dev]** A direct hand-built PostgREST write with a non-numeric price (for example `"abc"`) makes Postgres log `invalid input syntax for type numeric: "abc"` (22P02) with the typed value. It needs a hand-built request and shows the owner's own text only; the routes never send it because zod refuses first. Matches the design's stated residual risk.
- **N4 [note for the security auditor]** `__NUXT_DATA__` on every page includes the Supabase session (`$ssupabase_session.access_token`, refresh token). That is feature 00 behaviour, not clients, but it is a token in the SSR HTML, worth a look in the audit.
- **N5 [note]** The `.` price (`.5`) is accepted in the form as 0.50 and "5." as 5.00 (as documented in BE notes); fine.

**Owner-decision items checked:** Fields Name/Phone/Default price only; price per tray; PHP default and owners can't write it (42501 on every `tenants` write); no delete, "Mark inactive / Mark active"; names unique per farm including inactive, matched ignoring case and spacing only ("Cafe" and "Café" both saved, decomposed é clashes with composed é); 500 cap; existing client's name in the 409 body only (`existing.name`; not in the server's own field message, Postgres DETAIL or any log); invisible characters and joiners refused; O1 (Mark ... active button), O2 ("Showing x of n · Clear") and O3 ("Hidden by the ... filter" toast seen in the browser; the Inactive badge in the Edit title is by code trace only, `ClientForm.vue:305`, not opened on an inactive client) present. Sales-side items (AC34) untestable.

### Tests run
- `bun run test:unit`: **40 files, 595 tests, all pass** (1.5 s).
- `bun run test:db` (pgTAP, local stack): **8 files, 868 tests, all pass** (010, 020, 060, 090 included). `bun run test` = both.
- `bun run typecheck`: exit 0, no errors. `bun run lint`: exit 0, no warnings.
- Extra, run by hand and not added to the repo (throwaway scripts): PostgREST attack matrix on `clients`, `client_submissions`, `tenants`; API matrix (validation, replays, stale edits, cross-farm, tenant smuggling via query, body and header); 500-client fill; browser flows above. No test files were added or changed by QA; S1 and S2 need new tests from backend-dev (a 060 case for a ledger insert by `authenticated` that `add_client` did not make, and blank-looking characters in the parity spec).

### Unverified (could not be checked here)
Real phone keypads (`inputmode`, Go/Return, no Return on iOS tel/decimal), iOS Safari and Android sheet-above-keyboard behaviour (only an emulated viewport shrink was done), VoiceOver/TalkBack (names, live count, table caption were confirmed in the DOM only), the toast offset over the FAB on a real phone (seen at 375px in a screenshot only), reduced-motion on the modal (the media query was emulated; no animation checks), the empty-state and load-failure cards in the browser (code and unit tests only), `nuxt build` in the working tree (S3), and performance on a real low-end phone (throttled 4x CPU only).

### State left behind
Both QA farms, their accounts and all client rows were deleted; local DB is empty again (tenants, clients, ledger, sizes, production, memberships, auth users all 0). The production-build server and headless Chrome were stopped and the two scratch copies of the repo (outside the project, `D:\Projects\qa-copy-tmp`, `D:\Projects\qa-head-tmp`) were removed. Working tree unchanged by QA except this section.

### Regression pass (after QA S1-S3 and audit fixes)
**Verdict: PASS** (2026-09-26). No Blocking and no Should-fix finding; Status stays `done`. Two Nice-to-haves (below). Checked against the working tree, the dev server on :3000 (not stopped) and a production build in a scratch copy.

**Tests.** `bun run test:unit`: **43 files, 650 tests, all pass**. `bun run test:db`: **8 files, 941 tests, all pass** (010, 020, 030, 040, 050, 060, 090 included). `bun run typecheck`: exit 0. `bun run lint`: exit 0. No test files were added by QA (the new guard, header, visible-char, ledger and subtitle specs from the devs already cover the fixes; the checks below were run live).

**1. Real sessions, headless Chrome (own profile, own random debug port), owner of a throwaway farm, dev server.**
- *Clients:* add (name only; name + phone + price), "Café Uno" beside "Cafe Uno", "O'Brien & Sons", CJK (日本語の店), an egg emoji without a selector, "Émile Ünal", "Fish & Chips", "Café" (clash with an earlier "Café"): all behave. Name clash "cafe   UNO" gives "You already have a client called Cafe Uno."; an **inactive** match gives "Cafe Uno is on your list, but marked inactive. Mark it active instead." plus the "Mark Cafe Uno active" button, which sent one `restore` and closed the sheet. Price rules: 0, -1 ("Enter a price above 0..."), 10000 ("The most you can enter is ₱9,999.99."), 6.505 ("Use 2 decimals at most..."), "abc" ("Use numbers only..."); 61-char name, blank, ZWSP, U+3164, U+2800+U+FE0F all refused with the right message and Save blocked. Phone U+3164 or U+FFFC: "This phone number has a hidden character." "---" saved. Edit (pre-filled, phone set, price cleared, saved), edit into another client's name refused, Cancel goes through Discard. Mark inactive under the Active filter: toast "Marked Émile Ünal inactive. Hidden by the Active filter.", "Showing 5 of 6", focus moved to the next row's menu; Inactive and All filters, search ("CAFE" finds Cafe + Café, "日本" finds the CJK name, "zzz" gives "No clients match this filter."), Mark active from the menu.
- *500 cap:* farm filled to 500 through the real API (with the session cookie), 501st is 409 `client_limit`; in the UI at 500: subtitle "500 customers", 60 rows drawn, Add shows "You've reached the limit of 500 clients. You can still edit the ones you have."
- *Sizes (Settings):* add "Peewee", rename to "Pullet", move up, archive (dialog text right, archived card shows), restore: every request 200. *Production:* log (3 trays + 4 Small, 2 trays Large, 5 loose rejects), edit day (Small 3 to 5 trays), log again to the same day (adds: Jumbo 7), delete day (dialog "Delete today's production?"), first-use card back: every request 200. *Sign out* lands on `/login`, Back stays on `/login` with no client names, sign in as the second farm shows "0 customers" and none of the first farm's names (checked in the whole HTML).
- *Console:* **0 errors, 0 warnings, 0 hydration messages, no CSP / frame / permissions-policy messages** across every page load and flow (hard reloads of `/clients` (populated: 18, 19 and 500 clients), `/production`, `/settings`, `/` at 1280px and 375px; in-app navigation Clients, Production, Dashboard, Clients, Production; the production build too). The only Log entry is the browser's own line for the deliberate 409 at the cap.
- *Subtitles:* Dashboard "Today, Sep 26"; Production "Logged by day, most recent first"; Settings "Farm settings"; Clients "N customers" (0, 18, 19, 500) and blank (never the static text) while loading or after a failed load. The SSR HTML has the empty `min-h-5` `<p>`. Load failure (`Fetch.failRequest`): "Couldn't load your clients" card, then "Try again" loads the list and the count returns. Primary action: "Add client" top-bar button at 1280px and a 52x52 fixed FAB at 375px on Clients; "Add production" / FAB on Production; none on Settings or Dashboard; `scrollWidth == innerWidth` everywhere.
- *Request headers seen by the server (CDP extra info), every write from the UI:* `Sec-Fetch-Site: same-origin`, `Origin: http://localhost:3000`, `Content-Type: application/json` on POST/PUT/PATCH/DELETE-with-JSON; archive, restore and production DELETE carry no content type and no body; all 200. Routes used: clients (5 routes), sizes (POST, PATCH, PUT order, archive, restore), production (POST entries, PUT day, DELETE day).

**3. The guard (real session, curl, state counted before and after).** No `Sec-Fetch-Site`/`Origin` (curl-style) JSON POST 200; `Sec-Fetch-Site: same-origin` + matching `Origin` + `application/json; charset=utf-8` 200; `Sec-Fetch-Site: none` 200. Refused with **403 and no state change**: `cross-site`, `same-site`, a made-up value, `Origin: http://evil.example`, `Origin: null`, `Origin` on another port; archive with cross-site and with an evil Origin (client stayed active), PUT with cross-site, and `/api/sizes` POST cross-site. Refused with **400**: urlencoded, `text/plain`, multipart, and a body with no content type, on `/api/clients` and urlencoded on `/api/sizes`. Client count went 6 to 9 for exactly the 3 allowed writes. Archive and restore with plain curl (no headers, no body) 200; GET with `cross-site` 200; signed-out plain POST 401; signed-out cross-site POST 403 (the guard runs first). The same results on the production build.

**4. S1, S2, L3 re-attack (direct PostgREST as the owner).** Ledger: 493 rows for one client in one insert is 409 `23505` (`client_submissions_client_key`), writes nothing; a second row for the same client 409; then `POST /api/clients` 200. `size_submissions`: 100 rows for one size 409 (`size_submissions_size_key`), one per size accepted, a duplicate 409, then `POST /api/sizes` 200. Names of only U+3164, U+2800, U+FE0F, U+115F+U+1160, U+034F, U+17B4, U+200B, U+00AD, U+0301, U+FFFC: 400 `TM017` "hidden character", message does not echo the value; the same as a phone: `TM018`. Direct PATCH of name to U+3164 and of phone to U+FFFC refused. A name "X" plus U+FFFC or a combining mark is accepted (a visible letter is present; as designed). Legitimate direct inserts accepted: "Café", "Cafe", "A & B", "日本語", an egg emoji, "O'Brien", "Émile", "Ünal ñ", "---", phones "+", "---", "ext", "+63 917 123 4567". A text-style emoji with U+FE0F (a heart) is refused in the form (documented owner trade-off, see N-R1).

**5. Headers.** `/login`, `/api/me`, `/api/clients`, `/favicon.svg` and a 404 on the dev server, and the same plus a hashed `/_nuxt/*.js` on the production build: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, the `Permissions-Policy` list, `Cross-Origin-Opener-Policy: same-origin` everywhere; `Strict-Transport-Security: max-age=31536000` only on the production build (not in dev, as designed). `Cache-Control: private, no-store` still on pages and `/api`, `public, max-age=31536000, immutable` still on the hashed asset. (Dev's Vite-served `/_nuxt/*` has no security headers; production Nitro serves it with them.) On the Vercel build the static-asset headers remain unconfirmed (see the DevOps note).

**6. Build.** `bun run build` in a scratch copy (`D:\Projects\qa-regress-build`, copied with node_modules, outside the repo): "Build complete!", exit 0. Served with `NODE_ENV=production node .output/server/index.mjs` on :3355: headers and guard as above, `/clients` (18 rows), `/production`, `/settings`, `/` hydrate with no console messages at 1280px and 375px, and an Add through the UI got 200. Server stopped by its own PID and the copy deleted.

**7. Regressions from the fixes themselves.** (a) *`no_farm` as the 403 code for a cross-site write:* no legitimate flow can hit it (a same-origin browser sends `same-origin` and a matching `Origin`; curl, the CLI and server-side calls send neither header). If it did happen, the frontend would not route to `/no-farm`: the only routing to `/no-farm` is in `app/middleware/auth.global.ts:32,40` and it reads `me.farm` from `GET /api/me`, which the guard never blocks (GET); no file under `app/` reads the error code `no_farm` (grep), `useMe` treats only 401 specially, and `mapClientError` / the size and production mappers turn a 403 into the generic "unknown" save error (form stays open, values kept). (b) The guard runs before auth, so a signed-out cross-site POST is 403 rather than 401 (harmless: `$api`'s session-expired flow is only for 401 and a cross-site request is not the app). (c) `same-site` writes are refused: fine while the app and API share one origin; a future sibling-subdomain client would need an allowlist. (d) The `Origin` check compares to `Host`/`X-Forwarded-Host`; a proxy that rewrites `Host` without setting `X-Forwarded-Host` would make every browser write 403, worth one look on the first Vercel preview (Vercel keeps the public host). (e) The rest (populated list after the hydration fix, subtitles, FAB) is covered above.

**New findings**
- **Blocking:** none.
- **Should fix:** none.
- **Nice to have**
  - **N-R1 [frontend-dev / owner]** The "hidden character" message says "Try typing it instead of pasting", but a text-style emoji typed on a phone keyboard (a heart, which carries U+FE0F) is refused too, and typing does not help. It is the owner's documented trade-off (BE notes, S2); if it bites, either narrow the class or change the copy for that case. Not a regression.
  - **N-R2 [backend-dev]** The cross-site refusal reuses code `no_farm`, which the contract defines as "signed in but no farm". Harmless today (nothing branches on it, see 7a), but a later feature that maps `no_farm` to the no-farm page would misroute it. A dedicated code (for example `forbidden`) would need a contract change, so only do it if such a mapping is ever added.

**Unverified (could not be checked here).** Real phone keypads (`inputmode`, Go/Return, no Return on iOS tel/decimal) and iOS Safari / Android sheet-above-keyboard; screen readers (VoiceOver/TalkBack); the hosted Supabase project and Vercel (the Vercel `/(.*)` header route for static assets, `X-Forwarded-Host`/`Host` behaviour behind the proxy, HSTS on a real domain, Vercel's own serverless body/`Content-Length` handling for the JSON rule); a real browser sending a genuine cross-site or same-site form post (this pass forged the headers with curl; the devs' pass used real cross-site pages in Chrome and the browser cannot be told to send a wrong `Sec-Fetch-Site` from CDP).

**State left behind.** Both throwaway farms, their accounts, clients (522), ledger rows, sizes and production days deleted (tenants, clients, client_submissions, sizes, size_submissions, production, memberships, auth users, sessions and identities all 0). My headless Chrome was closed through the DevTools protocol (no process was killed but my own scratch node server) and the scratch build copy was removed. The dev server on :3000 was left running.

### Security audit (2026-09-26, read-only, after the first QA pass)
Run by the `security-auditor` agent (its `security-review` skill was removed earlier because it needs an `origin` remote).
- **Verdict:** no Critical or High findings. As an owner, no way found to read or write another farm's clients, ledger rows or currency (direct PostgREST, RPCs, routes). QA's S1 and S2 fixes held under attack. No personal data in any log, error body beyond the allowed same-farm 409 fields, SSR payload, storage, cookies or caches.
- **Fixed after the audit (owner decision):** M1 security headers (`nuxt.config.ts` `routeRules`; `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS in production only), L1 CSRF guard (`server/utils/request-guard.ts`, run by both handler wrappers), L3 (name and phone need a visible character; `20260926135550_client_visible_char.sql`), L7 (linear price regex), L6 (M14 comment corrected). Regression pass in §5: PASS.
- **Owner decision:** keep refusing variation selectors and joiners in client names (a text-style emoji such as a heart is refused; QA note N-R1 asks for copy or a narrower class if that bites).
- **Deferred (follow-ups):**
  - **M2:** no rate or request-size limits (Vercel WAF/rate limiting, hosted Supabase request limits), and `production_submissions` (feature 01 ledger) has no cap, unique key or retention job. Not blocking for one farm; **must be fixed before a second farm starts.**
  - **L2 (audit):** session tokens appear in `__NUXT_DATA__` on authenticated pages. Consider stripping `refresh_token`/`access_token` from the server-serialised state; check hydration still works.
  - **L4:** owners can set `archived_at` to any timestamp directly; Sales must only test `archived_at is not null`.
  - **L5:** a hand-built write (not the routes) can put a typed value in the Postgres log (invalid numeric or submission id). Check hosted log settings; keep `log_parameters_on_error` off.
  - **L8:** back/forward cache after sign-out in Safari and Firefox untested; a `pageshow` reload when `event.persisted` is cheap.
  - **Full script CSP** (nonce or hashes for inline scripts; `connect-src` for the Supabase URL), HSTS `includeSubDomains`/preload after the domain is chosen, `Cross-Origin-Resource-Policy` for `/api/**`.
  - **N-R2:** the CSRF refusal reuses `no_farm` (the only 403 code); add a dedicated `forbidden` code if a mapping to the no-farm page is ever added.
  - **Sales notes:** its foreign key to `clients(tenant_id, id)` must be NO ACTION (not CASCADE or SET NULL), archived clients must stay referenceable by pending deliveries, use `formatPrice`, and never build an `href` from a stored phone without whitelisting `tel:`.
- **First preview deploy checklist:** `curl -I` on `/login`, `/api/me` and a `/_nuxt/*.js` asset to confirm the headers; check that `Host` versus `X-Forwarded-Host` behind Vercel doesn't make browser writes 403.

