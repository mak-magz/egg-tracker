# Feature: Production logging (log, review, correct daily collection)

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want to log a morning's collection on my phone (trays and loose eggs for each size, plus rejects) in one quick form and one Save, then see my production day by day with a simple trend. That way I stop keeping it on paper, and I can see whether the flock's output and my reject rate are rising or falling.

As the farm owner, I want to fix or remove a day I logged wrongly, so that the numbers I trust later (what's on hand, today's production on the Dashboard) are right.

**Why now / spec reference:**
- Product goal 1, "Log production in seconds". Success bar: logging a morning's production takes **well under a minute** (`docs/egg-farm-app-product-doc.md` §3, §6).
- Production is the first link in the production → inventory → sales loop. Inventory, Sales and the Dashboard all read from it (product doc §4, §7).
- Screen and flow: `docs/egg-farm-app-ui-spec.md` §4 (Production), §8 (quantity input/display, day-summary card, add affordance), §9 Flow A.
- Data rules: `docs/egg-farm-app-architecture-spec.md` (Canonical unit, Production, Rejects). `CLAUDE.md` "Units and data model".
- **Visual design (source of truth):** `docs/design/source/template.html`. It includes the Production screen (markup ~6206–6280: date range, Week/Month chips, "Production trend by size" chart, day cards), the "Log production" form (~6493–6533), the top-bar "Add production" button (~6133) and the mobile FAB (~6478). Sample data and logic are in the `text/x-dc` script (~6618–6850).
- Builds on feature 00. The Production placeholder screen, the shell, and the farm's eggs-per-tray setting (default 30, read from the signed-in farm) already exist.

## 2. Acceptance criteria (PM)
Terms used in these criteria:
- **Owner** means a signed-in, provisioned owner.
- **Mobile** means a viewport about 375px wide. **Desktop** means 1024px wide or more.
- **The farm's sizes** are the farm's own ordered list of egg sizes (owner decision 2). Every farm starts with **Small, Medium, Large, Jumbo**, in that order. Where these criteria say "each size", they mean each of the farm's current sizes in the farm's order, not a fixed four. The examples use the four starting sizes.
- **Tray size** is the farm's eggs-per-tray setting. The examples assume 30, but every criterion must also hold for another value (see AC6).
- **Good eggs** are sized, sellable eggs. **Rejects** have no size and are never sellable.
- A **day** is all of the production logged for one calendar date.
- **Today** is the owner's local date on their device. It is not the server's or UTC date: logging at 9 pm must still count as "today".

Items marked **[not in design]** are needed for correctness but the owner's design doesn't draw them. UX draws them in the design's visual language.

**Log production (the hot path)**
- [ ] AC1: On desktop, the Production screen's top bar shows an **"Add production"** button. On mobile, a round **"+"** floating button shows instead, positioned above the bottom tab bar and never covering a tab. Either one opens the **"Log production"** form in one tap. On desktop the form is a centred dialog. On mobile it's a bottom sheet (the design's sheet, up to about 88% of the screen height). The Add button and FAB show only on the Production screen in this feature. Sales and Clients add their own later.
- [ ] AC2: The form shows, top to bottom:
  - **Date**, defaulting to today.
  - **"Good eggs, by size"**: one line per farm size, in the farm's order (Small, Medium, Large, Jumbo for a new farm), each with a **trays** field and a **loose** field.
  - **"Rejects (no size)"**: one trays field and one loose field.
  - **Cancel** and **Save**.

  Every quantity field starts empty or at 0.
- [ ] AC3: Save records every size that has a quantity above zero as good eggs of that size for the chosen date. It records rejects as one unsized amount. Sizes left blank or at 0 are not recorded. Everything goes in **one Save tap**. Example with a tray size of 30:

  | Line | Entry | Eggs |
  |---|---|---|
  | Small | 1 tray + 12 | 42 |
  | Medium | 4 trays + 28 | 148 |
  | Large | 8 trays + 24 | 264 |
  | Jumbo | 1 tray + 10 | 40 |
  | Rejects | 0 trays + 5 | 5 |

  The day then shows **494 good eggs (16 trays + 14)** and **5 rejects**. Nothing is recorded for a size that was left empty.
- [ ] AC4: The main path is: tap Add, enter the quantities, tap Save. Date stays at today, and no other field, choice or confirmation is needed. A tester who knows the numbers can log four sizes plus rejects on a mobile phone in **under 60 seconds**.
- [ ] AC5: On mobile, every trays and loose field opens a **numeric keypad**. Each field has − and + steppers, and each stepper and field is at least **44px** tall or wide as a tap target. The whole form, including Save, can be reached by scrolling inside the sheet, and nothing needs horizontal scrolling at 375px. Save stays reachable while the keypad is open. For example, Save can sit in a footer that stays visible, or the sheet can scroll to it.
- [ ] AC6: Tray conversion uses the farm's tray size, never a fixed 30. QA checks this on a farm set to 24 eggs per tray:
  - "1 tray + 5" is recorded as **29 eggs**.
  - The loose field's maximum is **23**.
  - 29 eggs displays as **"1 tray + 5"** everywhere on this screen.
- [ ] AC7: After a successful Save:
  - The form closes.
  - A toast confirms it, and names the date when it isn't today. For example: "Logged today's production", or "Logged production for Aug 3".
  - The owner is back on the Production list. That date's day card is at its place in the list (at the top if it's today), is expanded, and shows the new numbers without a page reload.
- [ ] AC8: **Logging a date that already has production adds to that day** (owner decision 3). Edit day (AC23) is for corrections. For example, Large 8 trays + 24 is logged in the morning and Large 2 trays + 6 is added in the afternoon. The day then shows Large as **11 trays** (264 + 66 = **330 eggs**). The loose eggs carry over into a full tray, so it never shows "10 trays + 30". The day still shows as **one** day card, and each size appears once, with its total. [not in design: while a date that already has production is selected, the form shows a short note, for example "Aug 4 already has 16 trays + 14 logged. This adds to it."]

**Validation and errors**
- [ ] AC9: Quantities accept whole numbers of 0 or more only.
  - Negative numbers, decimals and letters can't be entered, or they're rejected with a message on that field.
  - Blank counts as 0.
  - The loose field accepts at most **tray size − 1** (29 at 30 per tray). A higher value shows a field message, for example "Loose eggs must be under 30. Add a tray instead.", and blocks Save.
- [ ] AC10: If every quantity is blank or 0, Save doesn't record anything and shows one message, for example "Enter at least one amount." The form stays open.
- [ ] AC11: The date can't be in the future. Choosing a future date shows a message on the date field and blocks Save. Any past date is allowed, with no limit (owner decision 4). For example, a date two years ago saves normally.
- [ ] AC12: While saving, the Save button shows a spinner and can't be pressed again. Tapping Save several times quickly records the day's amounts **once**, not twice.
- [ ] AC13: **Save is all-or-nothing.** If it fails (for example, no signal in the barn):
  - Nothing from that submit is recorded. There's never a partial day, such as Large saved but Medium lost.
  - The form stays open with every value kept.
  - A plain-language message shows, for example "Couldn't save. Check your connection and try again."
  - Tapping Save again retries.

  This is error handling only, not offline support.
- [ ] AC14: [not in design] Closing the form (Cancel, X, tapping outside it, or swiping the sheet down) with nothing typed closes it immediately. If any quantity was typed, the app first asks "Discard this entry?" (Discard / Keep editing), so a stray tap barnside doesn't lose a morning's numbers.

**Production list (history)**
- [ ] AC15: The Production screen's title is **"Production"**, with the subtitle **"Logged by day, most recent first"**. Days show as **day cards**, newest date first, on both mobile and desktop (the design uses cards on both, not a table). Days with no production don't appear.
- [ ] AC16: The collapsed day card shows:
  - The date label: "Today · Aug 4" for today, "Aug 3" for other dates, and the year when the date isn't in the current year.
  - The day's **total good eggs** in trays + loose. Rejects are not included.
  - A red **rejects badge** showing the day's rejects, only when the day has any.

  With the AC3 data, the card reads "Today · Aug 4 | 16 trays + 14 | 5 rejects".
- [ ] AC17: Tapping a day card expands or collapses it. When expanded, it lists one line per size that has good eggs, in the farm's size order, each with a "Good" badge and its trays + loose. It then shows one "—" line with a "Reject" badge and the rejects amount. Today's card starts expanded, and older cards start collapsed. The size lines add up exactly to the card's total. For AC3, 42 + 148 + 264 + 40 = 494 eggs = 16 trays + 14.
- [ ] AC18: All amounts on this screen use one display format, trays + loose: "1 tray", "8 trays + 24", "0 trays + 5" or the UX-approved form for amounts under one tray (see design conflict D4). The same number of eggs always displays the same way in the badge, the expanded lines, the chart tooltip and the toast.
- [ ] AC19: **Range filters.** Above the list are **Week** and **Month** chips, with Week selected by default, and a **from–to date range** with a **Clear** action that appears once a date is set.
  - Week shows today and the 6 days before it. Month shows today and the 29 days before it. These are PM defaults; see design conflict D3.
  - Setting a from and/or to date shows only days inside that range, including both end dates, and takes priority over the chip.
  - Clear goes back to the selected chip.
  - Changing the filter updates the list and the chart without a page reload.
- [ ] AC20: **"Production trend by size" chart.** A card above the list shows one line per farm size (in the farm's order) plus one for Rejects, across the days in the current filter, oldest on the left. It has a colour legend and day labels along the bottom. Each size has its own distinct colour in the legend, whatever the number of sizes, and Rejects is always red. Each point is that day's eggs for that series, and a day with no entry for a size plots as 0. With only one day in range, the chart still renders and doesn't error. The chart is read-only.
- [ ] AC21: The list and chart show only this farm's production. Another farm's production never appears, even when the request names that farm (this extends feature 00's AC23 and AC26; see AC34).

**Edit and delete** [not in design: the design has no edit or delete for production, but the UI spec requires corrections (§0.6, §4a)]
- [ ] AC22: Each day card has an actions menu with **Edit day** and **Delete day**. On mobile its trigger is at least 44px, and it can be used without first expanding the card.
- [ ] AC23: **Edit day** opens the same form, titled "Edit production" (or as UX specifies), with the date fixed. The form is pre-filled with that day's current total for each size and for rejects, in trays + loose. The date can't be changed here: to move a day, the owner deletes it and logs it again.
  - Saving **replaces** the day's amounts with what's shown.
  - A size changed to 0 or blank is removed from the day.
  - AC9, AC12, AC13 and AC14 all apply.

  For example, correcting Large from 8 trays + 24 to 7 trays + 24 makes the day's total **464 eggs (15 trays + 14)**.
- [ ] AC24: If an edit leaves every amount at 0, Save doesn't silently empty the day. The app asks "Delete production for Aug 3?" (see AC25).
- [ ] AC25: **Delete day** asks for confirmation. The dialog names the date and what will be removed, for example "Delete production for Aug 3? This removes 16 trays + 14 good eggs and 5 rejects." On confirm, the day card disappears from the list and the chart without a reload, and a toast confirms it. Cancel changes nothing.
- [ ] AC26: A failed edit or delete leaves the day exactly as it was and shows a plain-language error. Nothing is half-changed.

**Empty, loading and error states**
- [ ] AC27: **First use:** a farm with no production at all sees an empty state instead of the chart and list. For example, "No production logged yet", with a **Log production** button that opens the form. It shows no sample data or made-up numbers.
- [ ] AC28: **Empty range:** a farm with production that has none in the current filter sees "No production logged in this date range." (the design's copy) in place of the list, and the chart shows its empty state. The filters stay usable.
- [ ] AC29: **Loading:** while production is loading, the screen shows a loading placeholder, not the empty state, so it never flashes "No production logged yet" for a farm that has data.
- [ ] AC30: **Load failure:** if production can't be loaded, the screen shows a plain-language message with **Try again**. It shows no blank screen, no technical error and no empty state.

**Layout**
- [ ] AC31: On mobile (375px), the filters wrap onto as many lines as they need without horizontal scrolling. Day cards take the full width. The last day card can be scrolled clear of both the FAB and the bottom tab bar.
- [ ] AC32: On desktop, the content is centred at the design's maximum width (about 1120px), and the "Add production" button sits at the right of the top bar. Between 768px and 1023px, the screen works with the sidebar both collapsed and expanded, and the Add button is always reachable.
- [ ] AC33: Both light and dark mode keep amounts, badges (Good, Reject, rejects), chart lines and the legend readable. Badges show text as well as colour, so they don't rely on colour alone.

**Data rules and derived numbers**
- [ ] AC34: The farm-isolation test from feature 00 is extended to production and to farm sizes. Farm A's owner can't list, create, change or delete farm B's production, and can't read farm B's size list, and the reverse. This includes requests that name the other farm's records or the farm itself. A signed-out request gets no production data at all.
- [ ] AC35: Production is kept in individual eggs, by date, size and quality. Rejects are always unsized: one amount per day, entered as trays + loose (owner decisions 5 and 6). A sized reject and an unsized good egg can't be saved, through the form or any other request. Good eggs can only be saved against one of the farm's own current sizes. A size that belongs to another farm, or that doesn't exist, is rejected.
- [ ] AC36: If the farm's tray size changes later, past production keeps its exact egg counts. Only the trays + loose display changes. For example, 494 eggs shows as 16 trays + 14 at 30 per tray, and as 20 trays + 14 at 24 per tray.

**Farm sizes: data now, UI later** (owner decision 2)
Each farm's sizes are stored as that farm's own data: an ordered list, not a fixed set built into the app. This feature only reads the list. The owner can't manage sizes in the app yet; that's the follow-up feature "Farm settings: sizes". How the list is stored is the architect's call. For QA, a farm's sizes can be changed directly in the test data.
- [ ] AC37: Every farm has its own size list. It's seeded with **Small, Medium, Large, Jumbo**, in that order, both for newly provisioned farms and for any farm that already exists when this feature ships. Provisioning a farm needs no extra step to get its sizes.
- [ ] AC38: The form, the day cards (collapsed and expanded) and the chart show **whatever sizes the farm has, in the farm's order**. Nothing is limited to or hardcoded as the starting four. QA checks this with a farm seeded as **Peewee, Small, Medium, Large, Extra Large, Jumbo**:
  - The form shows those 6 lines in that order.
  - Logging Peewee 1 tray + 0 and Extra Large 0 trays + 12 records **30** and **12** eggs.
  - The day card total includes both.
  - The expanded card lists Peewee first and Extra Large between Large and Jumbo.
  - The chart has 6 size lines plus Rejects, each in its own legend colour.
- [ ] AC39: Changing a farm's size order changes the order in the form, the expanded day cards and the chart legend. It doesn't change any egg counts. Renaming a size changes its label everywhere, **including on past days**, and doesn't change any egg counts. Past production belongs to the size, not to the size's name.
- [ ] AC40: Sizes are private to each farm. Adding, renaming or reordering farm A's sizes has no effect on farm B's form, list or chart. Farm A's owner can't see farm B's size list. This is covered by the isolation test in AC34.
- [ ] AC41: Sizes are stored so that a size can later be retired without losing or changing the production already logged against it. This is a product constraint for the architect. The retire (archive) behaviour itself is defined in the follow-up feature.

**Derived numbers (for later features, not built here):** this feature doesn't build Inventory or the Dashboard, and it doesn't change their placeholders. Those features will rely on these rules, so production has to support them from the start:
- **Inventory** counts **good eggs only, by the farm's sizes, across all dates**, minus completed sales. Sales will pick a size from the same per-farm list. Rejects never count. Editing or deleting a past day changes on-hand retroactively. The Inventory feature has to decide what the screen shows if a correction pushes a size below what's already been sold. The design shows a floor at 0.
- **Dashboard "Today's production"** is today's good total in trays + loose, with a per-size breakdown and "{n} rejects logged separately". **"This week's production"** uses daily good totals for the last 7 days. Both are read from the same day totals shown here (AC16).
- **Reject rate**, a possible later metric, is rejects ÷ (good + rejects) per day.
- **Lay rate** isn't in v1 (owner decision 1). See the follow-ups.

**Out of scope:**
- Inventory screen, Dashboard figures and cards, Sales and Clients. These are later features. The Dashboard stays a placeholder, and the design has no "Add" or FAB on the Dashboard.
- Filtering the list by size. UI spec §4a lists it, but the design doesn't have it. Deferred.
- Editing or deleting a single size line on its own. Corrections work through Edit day and Delete day.
- Moving a day to a different date while editing it.
- Undo after delete.
- Per-day notes, collection times, or recording several collections as separate items. Multiple collections simply add up (AC8).
- The sizes management screen (add, rename, reorder, archive). That's the follow-up feature "Farm settings: sizes".
- A settings screen for tray size.
- Hen counts and lay rate (owner decision 1; see the follow-ups).
- Sized or graded rejects, such as "cracked large" (owner decision 5).
- Non-goals, kept out and noted for later: flock health, feed and mortality; offline logging (the app only shows a clear error when there's no signal, per AC13); multi-user, including "who logged this"; realtime updates; CSV import and export.

**Design vs spec conflicts (for UX and the architect):**
- **D1: Edit and delete aren't in the design.** UI spec §0.6 and §4a require edit and delete, but the design shows no actions on production. PM decision: include them as Edit day and Delete day (AC22–AC26). UX draws them in the design's style.
- **D2: Sized rejects.** The architecture spec (Production section) calls size and quality "independent axes" and gives `large/reject/5` as an example. `CLAUDE.md`, the UI spec and the design all treat rejects as **unsized**, entered as one "Rejects (no size)" amount. This feature follows the design and `CLAUDE.md` (AC35). The owner confirmed unsized rejects on 2026-09-25, so the architecture spec example should be updated.
- **D3: Week and Month chips.** In the design prototype, the chips don't actually change which days are shown. The PM defaults are rolling 7 and 30 days (AC19). The design also has no "Day" chip, although its code references one.
- **D4: How rejects are displayed.** The day card badge reads "5 loose rejects", the expanded line reads "0 trays + 5", and the Dashboard reads "5 rejects". These are three formats for the same number. AC18 requires one consistent format. UX picks the wording for amounts under one tray (for example "5 eggs"), and it has to apply to good eggs too.
- **D5: Desktop layout.** UI spec §4a asks for a table on desktop, but the design uses day cards at every width. This feature follows the design (AC15).
- **D6: Hardcoded 29.** The design caps the loose field at 29. That's tray size − 1 at 30 per tray, and it must come from the farm setting (AC6, AC9).
- **D7: Tap targets.** The design's number inputs are about 32px tall and its Save button about 36px. Mobile targets are raised to 44px (AC5), the same as in feature 00.
- **D8: Where the FAB sits.** The design's FAB is 20px from the bottom, which assumed the drawer navigation. With feature 00's bottom tabs, it has to sit above the tab bar (AC1).
- **D9: Toast wording.** The design always says "Logged today's production", which is wrong for backdated entries. AC7 names the date when it isn't today.
- **D10: Sizes are per-farm data (owner decision 2).** The design hardcodes four sizes, along with a colour and short code for each (SM, MD, LG, JB). The architecture spec and UI spec list "small / medium / large / jumbo" as the allowed values. With this decision, sizes are a per-farm, ordered list instead (AC37–AC41). UX needs a colour rule that works for any number of sizes. The architect should update the architecture spec and `CLAUDE.md`, which currently say size is a column value, to describe the per-farm size list.

**Owner decisions (2026-09-25):**
1. **Hen counts:** **not in v1.** No hen count and no lay rate. It's recorded as a future feature (see the follow-ups).
2. **Sizes:** **editable per farm, as "data now, UI later".**
   - In this feature, sizes become per-farm data: an ordered list seeded with Small, Medium, Large and Jumbo, which production refers to (AC37–AC41).
   - The form, the day cards and the chart show whatever sizes the farm has.
   - The screen for managing sizes is the next feature, "Farm settings: sizes".
3. **Same date logged twice:** **add to the day** (A). Edit day is for corrections (AC8, AC23).
4. **Backdating:** **any past date** (A). Future dates are never allowed (AC11).
5. **Reject detail:** **one unsized amount per day** (A). The owner kept the recommendation (AC35).
6. **Reject entry:** **trays + loose** (A). The owner kept the recommendation (AC2, AC35).

**Open questions for owner:** none.

**Follow-ups (future features, not in 01):**
- **Farm settings: sizes (next feature).** Add, rename, reorder and archive the farm's sizes. That feature defines archiving:
  - An archived size stays visible, with its counts, on past days, in the chart for past ranges, and in inventory while eggs of that size remain.
  - It isn't offered for new entries.
  - A farm can't archive or remove its last active size.
  - It also covers what happens to the colours when sizes are added.
- **Hen counts and lay rate (future).** The lay-rate metric (eggs ÷ hens) needs a hen count. The options are a single "current hens" farm setting or a daily hen count. That feature decides which, and adds the Dashboard card (UI spec §3 card 6).
- **Farm settings: tray size (future).** It's still set at provisioning (feature 00).
- **Tray typo warning (future).** A soft, non-blocking "That's a lot of trays. Check the number." for unusually large amounts (UX Q3).
- **Security audit follow-ups (2026-09-25; M1 was fixed in 01):**
  - **L1:** bind the idempotency ledger to the payload (store a hash; a replay with a different payload gets an error instead of a silent replay). Same as QA note N1.
  - **L2:** security headers (CSP with `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`). Do before the first deploy.
  - **L3:** a retention job for `production_submissions` (e.g. delete rows older than 30 days), outside request handlers.
  - Inventory (feature 04) must not sum `production.eggs` in `integer`.
  - `bun update` for the dev-only esbuild advisory.
- **Tooling:** after `bun run db:reset`, PostgREST's schema cache can be stale; run `notify pgrst, 'reload schema'` (or restart the stack). Worth folding into the `db:reset` script (devops).
- **Not verified on a device:** a real phone keypad and keyboard lift (AC5), the 60-second timing (AC4), the chart tooltip by touch, a screen reader, dark mode by eye, the 768–1023px sidebar toggle.

<!-- previous open questions (answered 2026-09-25, see Owner decisions above):
1. **Hen counts (lay rate).** Do you want to track how many hens you have, so the app can show a lay rate (eggs per hen)?
   - A. No hen counts in v1 and no lay rate. Nothing changes here.
   - B. One "current number of hens" setting that you update now and then. Lay rate is today's eggs ÷ that number. This needs a small settings screen later, and nothing on this form.
   - C. Enter the hen count each day on the Log production form. This is the most accurate, but it adds a field to the hot path.
   - **Recommendation: A.** The design shows no lay rate anywhere, and it keeps the morning form fast. B can be added later without touching past data. **Doesn't block design unless you pick C.**
2. **Egg sizes.** Are Small, Medium, Large and Jumbo exactly the sizes you sort into?
   - A. Yes, these four, fixed for v1.
   - B. Different names or more or fewer sizes (for example Peewee or Extra Large). Tell us the list and we'll use it, still fixed for v1.
   - C. Sizes you can add and rename yourself in the app. This needs a settings screen, which would be a separate later feature.
   - **Recommendation: A, or B with your list.** Sizes are stored so they can be changed later without losing history, so C can come later. **Blocks design** because the form has one line per size.
3. **Logging the same date twice.** Do you collect more than once a day, and what should happen when you log a date that already has production?
   - A. **Add to the day.** A second entry adds on top (the afternoon collection). Mistakes are fixed with Edit day. This is what AC8 assumes.
   - B. **Replace the day.** The new entry overwrites that date's numbers.
   - C. **Open the existing day.** Choosing a date that already has production loads its numbers into the form to adjust.
   - D. **Block it.** Show "Already logged, use Edit" and make the owner edit instead.
   - **Recommendation: A.** It's safe for one or several collections a day, it never silently loses numbers, and the note in AC8 shows what's already logged. B is risky, because a second phone or a re-tap can wipe a morning's count. **Blocks design** (AC8 and the form).
4. **Backdating.** How far back should you be able to log or correct production?
   - A. Any past date, with no limit. Good for catching up after a missed day or entering history from your notebook.
   - B. Only the last 7 (or 30) days.
   - C. Today only.
   - Future dates are never allowed.
   - **Recommendation: A.** It's the simplest, and it lets you enter your notebook's history when you start. **Doesn't block design.**
5. **Rejects.** Is one daily rejects amount with no size enough, or do you need rejects by size or by reason (cracked, dirty, small)?
   - A. One unsized amount per day, as in the design.
   - B. Rejects by size.
   - C. Rejects by reason.
   - **Recommendation: A for v1.** It's in the design, it keeps the form short, and it's still enough to see your reject rate. B and C can be added later without losing past data. **Doesn't block design if you pick A.**
6. **How rejects are entered.** Rejects are usually a handful of eggs. Should they use trays + loose like everything else (as in the design), or just an egg count?
   - A. Trays + loose, the same as the sizes (the design).
   - B. A single "eggs" count.
   - **Recommendation: A.** It's one convention everywhere, as you decided in feature 00. The trays field can simply stay at 0. **Doesn't block design.**
-->

## 2.5 UX design (UX Designer)

**Source of truth:** the owner's design, `docs/design/source/template.html`: the Production screen (~6206–6280), the "Log production" form (~6493–6533), the top-bar Add button (~6133), the FAB (~6478), the toast (~6486), and the logic (~6618–6855: `fmtQty`, `SIZE_COLOR`, chart, filters). It sits inside the feature 00 shell (`app/layouts/default.vue`, `AppBottomTabs.vue`, `app.config.ts`, `main.css`). Anything marked **[proposed]** isn't in the design; it's drawn in the same visual language (cards `bg-default` + hairline ring + 16px radius, rows `bg-muted` + 6px radius, 16px DM Sans, same badges). The resolution for each of D1–D10 is in "Design conflicts: UX resolution" below.

### Shared rules (used by every part of this screen)

**R1. Quantity display (resolves D4, AC18).** There's one helper, `formatQty(eggs, eggsPerTray)`, and it's used for the day card, the badge, the expanded lines, the chart tooltip, the form total, the "adds to" note, the delete dialog and toasts. There are no other formats.

| Eggs (tray = 30) | Shows | Rule |
|---|---|---|
| 0 | `0 eggs` | Under one tray: `{n} eggs` (`1 egg` when n = 1) |
| 5 | `5 eggs` | |
| 30 | `1 tray` | Whole trays: `{t} tray` / `{t} trays` |
| 42 | `1 tray + 12` | Trays plus loose: `{t} tray(s) + {loose}`. The loose part never has a unit, as in the design |
| 494 | `16 trays + 14` | |
| 36,000 | `1,200 trays` | Thousands separators come from the device locale |

- `0 trays + 5` and `5 loose` **never appear**. The design's "5 loose rejects" badge and its "0 trays + 5" reject line both become `5 eggs`.
- Where it helps to say *what* the amount is, the label always comes first, followed by a colon: `Good: 16 trays + 14`, `Rejects: 5 eggs`. The badge, the note, the form total and the delete dialog all use this pattern. It works for any amount (`Rejects: 1 tray + 2`), so the badge never needs a second format.
- AC6 at 24 per tray: 29 eggs shows `1 tray + 5`. AC36 at 24 per tray: 494 shows `20 trays + 14`.

**R2. Size colours for any number of sizes (resolves D10, AC20/AC38).** A colour belongs to the **size**, not to its position in the list. Each size has a stable **colour slot** (0, 1, 2, …), and the slot picks from one ordered palette. Reordering or renaming a size never changes its colour.

| Slot | Colour | Token (light / dark) | Seeded size |
|---|---|---|---|
| 0 | Blue | `info` (blue-600 / blue-400) | Small (design) |
| 1 | Yellow | `warning` (yellow-600 / yellow-400) | Medium (design) |
| 2 | Green | `success` (green-600 / green-400) | Large (design) |
| 3 | Slate | `neutral` (slate-600 / slate-400) | Jumbo (design) |
| 4 | Violet | violet-600 / violet-400 | new sizes take the lowest unused slot → |
| 5 | Cyan | cyan-600 / cyan-400 | |
| 6 | Orange | orange-600 / orange-400 | |
| 7 | Pink | pink-600 / pink-400 | |
| 8 | Lime | lime-700 / lime-400 | |
| 9 | Indigo | indigo-600 / indigo-400 | |
| 10+ | repeat 0–9 | same colours, **dashed** line and hollow legend dot | |
| — | **Red** | `error` | **Rejects, always.** No size ever gets red |

- The four seeded sizes keep the design's colours exactly. Slots 4–9 avoid red, and none is close to another in the first six, so the AC38 six-size farm gets six clearly different lines.
- **Light mode uses the 600 shade** for chart lines and legend dots. The design's 500 yellow on white is about 1.9:1, which is too faint in sunlight. That's the same hue, only darker, like the owner's O1 decision for brand green in feature 00. Dark mode uses 400, as designed.
- Size colour appears **only in the chart** (lines, dots, legend). The day cards use the design's **Good** (green) / **Reject** (red) badges. They don't use size colours, so no size is ever identified by colour alone.
- **Short codes:** this feature shows **full size names everywhere**. The design's codes (SM/MD/LG/JB) appear only in unused calendar code and aren't needed here. If a later feature needs codes: the seeded four keep SM/MD/LG/JB, and Rejects is RJ. Any other size uses the first letter of each of its first two words ("Extra Large" → `EL`), or the first two letters of a one-word name ("Peewee" → `PE`), in upper case. A clash gets a digit (`PE2`). "Farm settings: sizes" can let the owner override it.
- **Long names** ("Extra Large") wrap in the form and truncate with an ellipsis in the expanded day lines and the legend. The full name stays in `title` and in the accessible name.

**R3. Date labels.** All dates use the device's local date. Today is `Today · Sep 25`. Other dates in this year are `Sep 24`, and dates in another year are `Sep 24, 2025`. In toasts and dialogs, today reads `today's` or `today` (see Copy).

### Flow

**A. Log the morning's production (main path, AC1–AC4)**
`Production → FAB "+" (mobile) / "Add production" (desktop) → Log production (date = today) → type amounts → Save → sheet closes → toast → today's card at the top, expanded, with the new numbers`

1. Tap **+** (the FAB) → the sheet opens with **Date = today** and every quantity field empty (placeholder `0`).
2. Tap each field that has an amount and type the number. The keypad is numeric. Enter/Next moves to the next quantity field, in the order Small trays → Small loose → Medium trays → … → Rejects loose. Small amounts can use **+** instead of typing.
3. Tap **Save** (or press Enter/Go on the last field, Rejects loose).

**Main-path tap count, mobile (AC3's morning: four sizes plus rejects): 11 taps** (FAB 1 + 9 field taps + Save 1) **plus 13 digit keystrokes**. The date, the sizes and the quality never need touching. On Android the keypad's Next key replaces most of the field taps. The estimate is **about 25–35 seconds** for someone reading from a notebook, well under the 60-second bar (AC4). A morning with no loose eggs is quicker: 4 trays fields + Save.
**Desktop: 2 clicks** (Add production, then Save, or press Enter). Small trays is autofocused and Tab moves between quantity fields.

Behaviour that keeps it fast:
- **Fields start empty** with a `0` placeholder, not a real 0, so typing never produces "08". In Edit, focusing a pre-filled field **selects its content**, so typing replaces it.
- **Stepper buttons are skipped by Tab** (`tabindex="-1"`). ↑/↓ in a field does the same thing. So Tab and the keypad's Next key go field to field.
- **Autofocus:** desktop focuses Small trays on open. Mobile doesn't autofocus, because the keypad would cover the form before the owner sees it, and iOS ignores programmatic focus after an animation anyway.
- **Same date already logged (AC8):** a note appears under Date as soon as that day's totals are known. It doesn't block Save and needs no tap.
- **After Save (AC7):** the form closes, then the toast shows. The saved day's card is expanded, **scrolled into view** and gets a short highlight (a `bg-primary/8` fade over 1.5s, none with reduced motion). If the saved date is **outside the current filter** (for example a date two months back while Week is selected), the range switches to **From = To = that date** so the card is visible, and **Clear** returns to the chip. [proposed; see PM question Q1]

**B. Edit a day (AC22–AC24, AC26) [proposed, D1]**
`Day card ⋮ → Edit day → Edit production (date fixed, pre-filled) → change amounts → Save → toast → card updated`
Taps: ⋮ (1), Edit day (2), then the field(s) (3+), then Save. **4 taps for a one-number fix.**
- It's the same form and layout. The title is **Edit production**. In place of the date input, the date shows as **read-only text** with the hint "To move this day to another date, delete it and log it again."
- Fields are pre-filled with the day's current total per size and for rejects, split with the current tray size. Sizes with nothing show empty.
- **Save replaces** the day. A size set to blank or 0 is removed. If nothing changed, Save simply closes: no request, no toast.
- **Everything 0 (AC24):** Save doesn't save. It opens the delete dialog (flow C) with the edit-specific lead line. **Delete day** deletes the day. **Keep editing** returns to the form with the values intact.
- There's no "adds to" note in Edit.

**C. Delete a day (AC25, AC26) [proposed, D1]**
`Day card ⋮ → Delete day → confirm dialog → Delete → card disappears → toast`
**3 taps.** This is the one place a confirm guards real data loss. There's no undo (out of scope).

**D. Discard (AC14) [proposed]**
Cancel, ✕, a tap on the overlay, swiping the sheet down and Esc all do the same thing:
- **Log:** if no quantity was typed, the form closes at once. A changed date alone doesn't count. If any quantity was typed, the app asks "Discard this entry?".
- **Edit:** if nothing differs from the pre-filled values, it closes at once. Otherwise it asks "Discard your changes?".
- While saving, closing is disabled (AC12).

**E. Filter (AC19, D3)**
- **Week** (default) is today and the 6 days before it. **Month** is today and the 29 days before it. Both use the device date.
- Setting **From** and/or **To** overrides the chip. While a range is active **neither chip is highlighted**, so it's clear the range wins, and **Clear** appears.
- **Clear** empties both dates and restores the chip that was selected. Tapping a chip while a range is active does the same with that chip: one tap back.
- **From only** shows From to today. **To only** shows everything up to To.
- **From after To** shows an error on To ("End date must be on or after the start date"), and the list keeps its previous filter until it's fixed.
- Both date inputs have `max` = today.
- Changing the filter updates the list and the chart in place. The previous content stays visible with a small spinner in the chart header until the new data arrives, with no skeleton flash.
- The filter lasts while the owner is on the screen and resets to Week on a fresh visit.

### Layouts

Wireframes aren't to scale. Nuxt UI names are approximate (v4), and the frontend dev confirms the APIs.

#### Production screen, mobile (~375px)
Main area: `bg-muted`, p-4 (from the shell). Bottom padding clears the tab bar **and** the FAB: `calc(64px + env(safe-area-inset-bottom) + 84px)` on this screen (AC31).
```
┌───────────────────────────────────────────┐
│ Production                          (HF)  │ top bar (shell). No Add button on mobile
│ Logged by day, most recent first          │
├───────────────────────────────────────────┤
│ [ From  mm/dd/yyyy ] – [ To  mm/dd/yyyy ] │ UInput type=date ×2, 44px, each ~(100%-24px)/2
│ (●Week●) ( Month )             [ Clear ]  │ chips: UButton rounded-full, 44px, aria-pressed
│                                           │ Clear: UButton ghost, only when a date is set
│ ┌───────────────────────────────────────┐ │ UCard (design chart card, p-5)
│ │ Production trend by size          (◌) │ │ text-base 500 muted · (◌) refetch spinner only
│ │ Sep 19 – Sep 25                       │ │ [proposed] range caption, text-sm dimmed
│ │ ● Small ● Medium ● Large ● Jumbo      │ │ legend wraps; 8px dots + text-sm labels
│ │ ● Rejects                             │ │
│ │   ╱╲__╱‾‾╲_                            │ │ 130px SVG, one polyline per series,
│ │  ╱       ‾‾╲__•                        │ │ 3px dots at every point (so 1 day still shows)
│ │ 19   20   21   22   23   24   25       │ │ day labels (see chart notes)
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │ day card: UCard-style, overflow hidden
│ │ ⌄  Today · Sep 25                 [⋮] │ │ header row: <button aria-expanded> + menu
│ │    16 trays + 14   [Rejects: 5 eggs]  │ │ total 600 · UBadge error subtle
│ │ ┌───────────────────────────────────┐ │ │ expanded lines: bg-muted rows, radius-md
│ │ │ Small    [Good]       1 tray + 12 │ │ │ size (500) · UBadge success subtle xs ·
│ │ │ Medium   [Good]      4 trays + 28 │ │ │ amount right, 600, muted
│ │ │ Large    [Good]      8 trays + 24 │ │ │
│ │ │ Jumbo    [Good]       1 tray + 10 │ │ │
│ │ │ —        [Reject]          5 eggs │ │ │ reject amount in error colour
│ │ └───────────────────────────────────┘ │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ ›  Sep 24                         [⋮] │ │ collapsed (older days start collapsed)
│ │    15 trays + 20   [Rejects: 8 eggs]  │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ ›  Sep 23                         [⋮] │ │ no rejects → no badge
│ │    16 trays + 5                       │ │
│ └───────────────────────────────────────┘ │
│                                     (＋)  │ FAB: 52px circle, primary, shadow-lg
├───────────────────────────────────────────┤ right: 16px; bottom: 64px + safe-area + 16px
│  Dashboard [Production] Sales Inv Clients │ (D8). aria-label "Log production"
└───────────────────────────────────────────┘
```
- **Filters row** (design order: range, then chips). It wraps at 375px and nothing scrolls sideways. The design's vertical divider between range and chips is hidden when the row wraps (below `md`). The date inputs have visually hidden labels **From** and **To**.
- **Day card header (mobile) [proposed layout tweak]:** the design's single row doesn't fit at 375px once the 44px menu button is added, so the total and the badge drop to a second line under the date. The whole header, apart from ⋮, is **one toggle button** (min-height 56px, `aria-expanded`). **⋮ is a separate 44×44 button** (`UButton` ghost, `i-lucide-ellipsis-vertical`) beside it, not nested inside, so the menu works without expanding (AC22).
- **Actions menu:** `UDropdownMenu` with **Edit day** (`i-lucide-pencil`) and **Delete day** (`i-lucide-trash-2`, error colour + icon). Items are 44px tall on mobile.
- The FAB **hides while the sheet or a dialog is open**. It appears only on Production (AC1).

#### Production screen, desktop (≥1024px) and tablet (768–1023px)
Content is centred at max 1120px (shell). The same components, one line per card header, as in the design.
```
┌──────────────┬───────────────────────────────────────────────────────────────────────────┐
│ [logo] Tamago│ «  Production                                        [ + Add production ] │ UButton primary, md (lg on tablet ≥44px)
│              │    Logged by day, most recent first                                       │ in the navbar #right slot (AC32)
├──────────────┼───────────────────────────────────────────────────────────────────────────┤
│  Dashboard   │  [ From mm/dd/yyyy ] – [ To mm/dd/yyyy ]  [Clear]  │  (●Week●) ( Month )   │ inputs 150px (design), size md
│ ▌Production  │ ┌───────────────────────────────────────────────────────────────────────┐ │
│  Sales       │ │ Production trend by size  Sep 19 – Sep 25    ● Small ● Medium ● Large │ │ legend right-aligned, wraps
│  Inventory   │ │                                               ● Jumbo ● Rejects        │ │
│  Clients     │ │  (lines, 130px; hover/focus a day → tooltip)                          │ │
│              │ │  19        20        21        22        23        24        25        │ │
│              │ └───────────────────────────────────────────────────────────────────────┘ │
│              │ ┌───────────────────────────────────────────────────────────────────────┐ │
│              │ │ ⌄ Today · Sep 25                  16 trays + 14  [Rejects: 5 eggs] [⋮]│ │ header p 14×18 (design)
│              │ │ ┌───────────────────────────────────────────────────────────────────┐ │ │
│              │ │ │ Small        [Good]                                  1 tray + 12  │ │ │ size column min 7rem
│              │ │ │ …                                                                 │ │ │
│              │ │ │ —            [Reject]                                     5 eggs  │ │ │
│              │ │ └───────────────────────────────────────────────────────────────────┘ │ │
│              │ └───────────────────────────────────────────────────────────────────────┘ │
│              │ ┌───────────────────────────────────────────────────────────────────────┐ │
│              │ │ › Sep 24                          15 trays + 20  [Rejects: 8 eggs] [⋮]│ │
│              │ └───────────────────────────────────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```
- Day cards at every width, not a table (D5).
- On tablet the Add button stays in the top bar whether the rail is collapsed or expanded. There's no FAB at 768px and up (the design switches at `isMobile` < 768). The button and chips are 44px tall at tablet width. The button text is the full "Add production"; below about 900px with the sidebar expanded, it may shrink to the **+** icon, keeping its aria-label.

#### Chart details (AC20)
- **Series:** one per farm size in the farm's order, then Rejects last, each in the R2 colour. The legend uses the same order.
- **X axis:** the days that **have production** in the current filter (the same days as the list), oldest on the left, evenly spaced as in the design. A day that wasn't logged isn't a zero-production day, so it isn't plotted as one. A logged day that has no entry for a size plots that size at 0 (AC20).
- **Labels:** day-of-month numbers (design). The first label and any label where the month changes also get the month (`Aug 29 · 30 · 31 · Sep 1`). At most **7 labels on mobile and 14 on desktop**, evenly thinned, always keeping the first and last.
- **One day in range:** a single centred point per series (the dots make it visible; a one-point polyline is invisible).
- **Tooltip [proposed, AC18 names it]:** hover (desktop) or tap (mobile) near a day shows a vertical guide and a small panel. It shows the date label, then one line per series, e.g. `● Large  8 trays + 24` and `● Rejects  5 eggs`, in R1 format. It closes on tap outside. The chart is otherwise read-only.
- **Accessibility:** the SVG is `role="img"` with an `aria-label` such as "Production trend by size, Sep 19 to Sep 25". The day cards below carry the same numbers as text.
- **Component:** Nuxt UI has no chart. The design's hand-drawn SVG is enough (polylines, dots, labels). The architect/FE may choose a small chart library if it can match the look. That isn't a UX requirement.

#### Log production: mobile bottom sheet (~375px)
The design's sheet: bottom-aligned, top corners 16px, `max-height: 88dvh`, overlay `rgba(15,23,43,.5)` + 4px blur, slide-up animation. Header and footer are fixed, and the body scrolls. **Body padding is 16px** (the design uses 20px; this gives the 44px steppers room at 375px).
```
┌───────────────────────────────────────────┐
│ Log production                       [✕]  │ header: text-lg 700 · ✕ 44×44 (design ✕ was ~26px)
├───────────────────────────────────────────┤
│ Date                                      │ UFormField label
│ [ 09/25/2026                          📅 ]│ UInput type=date, max=today, 44px, full width
│ Today                                     │ hint [proposed]: "Today" or "Wednesday, Sep 24"
│ ┌───────────────────────────────────────┐ │ UAlert color=info variant=subtle [proposed, AC8]
│ │ ⓘ Today already has production logged.│ │ only when the date has production
│ │   This adds to it.                    │ │
│ │   Good: 16 trays + 14 · Rejects: 5 eggs│ │
│ └───────────────────────────────────────┘ │
│ Good eggs, by size                        │ group label (design)
│                  Trays          Loose     │ column headers once, text-sm dimmed [proposed]
│ ┌───────────────────────────────────────┐ │ row: bg-muted, radius-md, p-3
│ │ Small                                 │ │ size name on its own line (wraps if long)
│ │ [−][   1   ][+]    [−][  12   ][+]    │ │ 2 × UInputNumber: 44 + 60 + 44 = 148px each
│ └───────────────────────────────────────┘ │ 148 + 12 + 148 = 308px ≤ 311px available
│ ┌───────────────────────────────────────┐ │
│ │ Medium                                │ │
│ │ [−][   4   ][+]    [−][  28   ][+]    │ │
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Large                                 │ │
│ │ [−][   8   ][+]    [−][ (35)  ][+]    │ │ invalid loose → error ring on that input +
│ │ (!) Loose eggs must be under 30.      │ │ message under the row (UFormField error)
│ │     Add a tray instead.               │ │
│ └───────────────────────────────────────┘ │
│ ┌ Jumbo … ──────────────────────────────┐ │
│ Rejects (no size)                         │ group label (design)
│ ┌───────────────────────────────────────┐ │
│ │ [−][       ][+]    [−][   5   ][+]    │ │ no name line; same two columns
│ └───────────────────────────────────────┘ │
├───────────────────────────────────────────┤ footer: fixed at the bottom of the sheet
│ Good: 16 trays + 14 · Rejects: 5 eggs     │ live total, text-sm muted [proposed]
│ [ Cancel ]   [          Save          ]   │ Cancel: ghost 44px · Save: primary, flex-1, 44px
└───────────────────────────────────────────┘ + safe-area bottom padding
```
- **Why the row is stacked:** the design puts name, trays and loose on one line with 32px inputs. At 44px (D7) that can't fit at 375px, so the size name sits above its two steppers. The design's row already uses `flex-wrap`, so this is its own wrap behaviour made deliberate. At `sm` and up the row returns to one line (see desktop).
- **Visible labels:** the column headers **Trays** and **Loose** are visible. Each input's accessible name is `"{Size} trays"` / `"{Size} loose eggs"` (`"Rejects trays"` / `"Rejects loose eggs"`). The steppers are labelled `"Increase {Size} trays"`, and so on.
- **Keypad and Save (AC5):** the footer stays pinned to the sheet's bottom. When the keypad opens, the focused field scrolls into view (`scrollIntoView({ block: 'center' })`), and Save stays reachable by scrolling the body or by pressing **Go/Enter on Rejects loose**. The FE verifies on iOS Safari and Android Chrome. Adding `interactive-widget=resizes-content` to the viewport meta helps Android keep the footer above the keypad.
- **Component:** `UDrawer` (direction bottom) gives the swipe-down that AC14 expects. If it fights the on-screen keyboard, use `UModal` styled as the bottom sheet (the design's own approach) and let ✕/Cancel/overlay handle closing. In both cases, closing goes through the discard check (it must be preventable, e.g. `dismissible: false` + `close:prevent`).

#### Log production: desktop dialog (≥768px)
`UModal`, centred, max-width **520px** (design), `max-height: 85vh`, 16px radius. Rows are single-line as in the design.
```
┌──────────────────────────────────────────────────────┐
│ Log production                                  [✕]  │
├──────────────────────────────────────────────────────┤
│ Date                                                 │
│ [ 09/25/2026    📅 ]  Today                          │ date 180px (design) + inline hint
│ ┌ ⓘ Today already has production logged. This adds ┐│ AC8 note, only when relevant
│ │   to it.  Good: 16 trays + 14 · Rejects: 5 eggs   ││
│ └───────────────────────────────────────────────────┘│
│ Good eggs, by size                                   │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Small        trays [−][  1 ][+]  loose [−][ 12 ][+]│ size col ~7rem (wraps long names)
│ │ Medium       trays [−][  4 ][+]  loose [−][ 28 ][+]│ design's inline "trays"/"loose"
│ │ Large        trays [−][  8 ][+]  loose [−][ 24 ][+]│ (visible labels, text-sm dimmed)
│ │ Jumbo        trays [−][  1 ][+]  loose [−][ 10 ][+]│ each row bg-muted, radius-md
│ └──────────────────────────────────────────────────┘ │
│ Rejects (no size)                                    │
│ │              trays [−][    ][+]  loose [−][  5 ][+]│
├──────────────────────────────────────────────────────┤
│ Good: 16 trays + 14 · Rejects: 5 eggs  [Cancel][Save]│ total left, buttons right (design order)
└──────────────────────────────────────────────────────┘
```
- On desktop, inputs and buttons use size `lg` (40px). The 44px minimum applies below `md` and on tablet (768–1023px, usually touch).
- The form is a `UForm` in all layouts, so Enter goes to the next field and Enter on the last field submits (see Flow A).

#### Edit production (same form) [proposed, D1]
```
┌───────────────────────────────────────────┐
│ Edit production                      [✕]  │
├───────────────────────────────────────────┤
│ Date                                      │
│ Today · Sep 25                            │ read-only text (text-base 600), not an input
│ To move this day to another date, delete  │ hint, text-sm dimmed
│ it and log it again.                      │
│ Good eggs, by size    (pre-filled rows)   │
│ …                                         │
├───────────────────────────────────────────┤
│ Good: 16 trays + 14 · Rejects: 5 eggs     │
│ [ Cancel ]   [          Save          ]   │
└───────────────────────────────────────────┘
```

#### Confirm dialogs [proposed]
`UModal`, centred at every width, max-width 400px. On mobile the buttons stack full width, 44px tall, with the primary action on top. On desktop they sit side by side, right-aligned.
```
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│ Delete production for Sep 24?       │   │ Discard this entry?                 │
│ This removes:                       │   │ The amounts you typed won't be      │
│   Good: 15 trays + 20               │   │ saved.                              │
│   Rejects: 8 eggs                   │   │                                     │
│ You can't undo this.                │   │         [Keep editing] [Discard]    │
│ ┌ (!) Couldn't delete. Check your ┐ │   └─────────────────────────────────────┘
│ │     connection and try again.   │ │    Discard: color=error variant=soft
│ └─────────────────────────────────┘ │    Keep editing: neutral outline, and
│           [Cancel] [Delete day]     │    focused by default (the safe choice)
└─────────────────────────────────────┘
  Delete day: color=error solid, loading spinner while deleting.
  Cancel is focused by default. The error UAlert shows only after a failure.
```
- The delete dialog lists only the lines that are above zero (a day with no rejects shows only "Good: …").
- The AC24 variant (from Edit with everything at 0) shows the lead line "You've set every amount to 0." above "This removes:", and its buttons are **Keep editing** / **Delete day**.

### States

| Area | State | What the owner sees |
|---|---|---|
| Screen | **Loading (AC29)** | The filters row renders but is disabled. A chart-card skeleton (`USkeleton`, 130px) and **3 day-card skeletons** follow. The empty state never shows while loading. The FAB and Add button stay visible and work, since the form doesn't depend on the list loading. |
| | **Default** | Filters (Week), chart, day cards newest first. Today's card is expanded when it's in range. |
| | **Refetching (filter change, after a save)** | The current content stays. A small spinner shows in the chart header. There's no skeleton and no empty flash. |
| | **First use (AC27)** | Filters and chart are hidden, replaced by one empty card (the `AppPlaceholder` look: 56px tinted icon circle `i-lucide-clipboard`, heading, body) with a **Log production** button (primary, `size="xl"`, `i-lucide-plus`) that opens the form. The FAB/Add button is still shown. No sample numbers. |
| | **Empty range (AC28)** | Filters stay visible and usable. The chart card shows its header and, in place of the lines, "Nothing to chart in this range." (text-sm dimmed, centred in the 130px area, legend hidden). In place of the list: "No production logged in this date range." (the design's text: centred, muted, 40px padding), and below it a **Show last 30 days** ghost button when the Week chip is active [proposed], or a **Clear dates** ghost button when a range is set. |
| | **Load failure (AC30)** | Filters and chart are replaced by a card with `i-lucide-cloud-off`: heading "Couldn't load production", body "Check your connection and try again.", and a **Try again** button (primary, xl, `i-lucide-refresh-cw`, spinner while retrying). If a *refetch* fails while content is showing, the content stays and an error toast offers **Try again**. |
| Day card | Collapsed / expanded | Chevron › / ⌄ (the design's icons), `aria-expanded`. Today's card starts expanded (older ones collapsed), and the most recently saved day is expanded. |
| | Rejects present / none | Red `Rejects: 5 eggs` badge only when rejects > 0. The expanded "—" Reject line appears only when rejects > 0. |
| | Just saved / edited | A short highlight fade, scrolled into view. |
| Form | **Default (log)** | Date = today, all quantities empty, Save enabled. |
| | **Default (edit)** | Date is read-only text, fields pre-filled, Save enabled. |
| | **Adds-to note (AC8)** | An info `UAlert` under Date when the chosen date already has production. It updates when the date changes and disappears for a date with none. While the lookup runs, nothing shows (no spinner). The note never blocks Save. |
| | **Validation: field (AC9, AC11)** | The message sits under the row (quantity) or under Date. The offending input gets an error ring. Messages appear on blur and on Save, and clear as soon as the value is valid. Save is blocked. The first invalid field is focused and scrolled into view. Letters, `-`, `.` and `,` can't be typed (they're filtered as the owner types). A pasted non-whole number shows the "whole number" message. **Loose over the max is not silently clamped** (the FE must turn off `UInputNumber`'s clamp-on-blur for loose) and shows the message. The loose **+** stepper is disabled at the max (tray size − 1). The **−** stepper is disabled at 0 or blank. |
| | **Validation: nothing entered (AC10)** | A form-level error `UAlert` directly above the footer: "Enter at least one amount." The form stays open, and focus goes to the first trays field. |
| | **Saving (AC12)** | The Save button shows a spinner and is disabled. Fields become read-only, and Cancel, ✕, the overlay and swipe do nothing. One submit per open form: a double tap records once. |
| | **Server/network error (AC13, AC26)** | An error `UAlert` above the footer (`role="alert"`) with the plain-language copy. Every value stays. Save becomes active again, and tapping it retries the **same** submit (see Data: idempotency). |
| | **Discard check (AC14)** | The "Discard this entry?" / "Discard your changes?" dialog (above). |
| | **All zero in Edit (AC24)** | The delete confirm with the AC24 lead line. |
| Delete dialog | Default / deleting / failed | Cancel focused. Delete day shows a spinner while deleting. On failure, an inline error alert appears, the dialog stays open, the day is unchanged, and Delete day retries. |
| Success | **Toasts** | The design's toast (inverted, check icon, bottom-centre, 2.6s, from feature 00). **On mobile Production the toast sits above the FAB** (bottom = 64px + safe-area + 84px) so it never covers the FAB or the tabs. |

### Copy

| Where | Text |
|---|---|
| Top bar (design) | **Production** · `Logged by day, most recent first` |
| Add button (desktop) / FAB aria-label | **Add production** / `Log production` |
| Filters | Chips **Week**, **Month** · date labels (visually hidden) `From`, `To` · **Clear** |
| From after To | `End date must be on or after the start date` |
| Chart | **Production trend by size** · caption `{from} – {to}` [proposed] · legend `{size names…}`, **Rejects** · empty `Nothing to chart in this range.` · aria-label `Production trend by size, {from} to {to}` |
| Day card | `Today · Sep 25` / `Sep 24` / `Sep 24, 2025` · total `{formatQty}` · badge `Rejects: {formatQty}` · expanded badges **Good**, **Reject** · reject line name `—` |
| Day card aria | toggle `{date label}, {total} good, {rejects} rejects` · ⋮ `Actions for {date label}` |
| Menu | **Edit day** · **Delete day** |
| Form titles | **Log production** · **Edit production** [proposed] |
| Form labels (design) | **Date** · **Good eggs, by size** · **Rejects (no size)** · **Trays** / **Loose** (desktop inline: `trays` / `loose`, as in the design) |
| Date hint [proposed] | `Today` · otherwise the weekday and date: `Wednesday, Sep 24` |
| Edit date hint [proposed] | `To move this day to another date, delete it and log it again.` |
| Adds-to note (AC8) | `{Today / Sep 24} already has production logged. This adds to it.` + second line `Good: {qty} · Rejects: {qty}` (lines above zero only) |
| Live total [proposed] | `Good: {qty} · Rejects: {qty}` · when nothing is entered: `Nothing entered yet` |
| Buttons | **Cancel** · **Save** (both log and edit, as in the design) |
| Loose too high (AC9) | `Loose eggs must be under {trayScale}. Add a tray instead.` |
| Not a whole number | `Enter a whole number, like 12.` |
| Nothing entered (AC10) | `Enter at least one amount.` |
| Future date (AC11) | `You can't log a future date. Pick today or earlier.` |
| Date empty | `Pick a date.` |
| Save failed (AC13) | `Couldn't save. Check your connection and try again.` |
| Edit save failed (AC26) | `Couldn't save your changes. Check your connection and try again.` |
| Size no longer available (server) | `Your sizes have changed. Close this form and open it again.` |
| Toast: new day (AC7, D9) | `Logged today's production` · `Logged production for Sep 24` |
| Toast: added to an existing day (AC8) | `Added to today's production` · `Added to production for Sep 24` |
| Toast: edited | `Updated today's production` · `Updated production for Sep 24` |
| Toast: deleted | `Deleted today's production` · `Deleted production for Sep 24` |
| Discard (log) | Title **Discard this entry?** · body `The amounts you typed won't be saved.` · **Keep editing** · **Discard** |
| Discard (edit) | Title **Discard your changes?** · body `Your changes to {Sep 24} won't be saved.` · **Keep editing** · **Discard** |
| Delete (AC25) | Title **Delete production for {today / Sep 24}?** (today: `Delete today's production?`) · body `This removes:` + `Good: {qty}` / `Rejects: {qty}` · `You can't undo this.` · **Cancel** · **Delete day** |
| Delete from Edit (AC24) | Same, with the lead line `You've set every amount to 0.` · buttons **Keep editing** · **Delete day** |
| Delete failed (AC26) | `Couldn't delete. Check your connection and try again.` |
| First use (AC27) | Heading **No production logged yet** · body `Log your first collection and it will show here, day by day.` · button **Log production** |
| Empty range (AC28, design) | `No production logged in this date range.` · **Show last 30 days** / **Clear dates** [proposed] |
| Load failure (AC30) | Heading **Couldn't load production** · body `Check your connection and try again.` · **Try again** |
| Refetch failed (toast) | `Couldn't refresh production.` · action **Try again** |

Dates in copy use R3: `today` / `today's`, `Sep 24`, `Sep 24, 2025`. No copy says "eggs" where the owner means trays. "eggs" appears only in the R1 under-a-tray amounts and in "Loose eggs", which is the owner's own term for the remainder.

### Quantity entry
- This feature ships the **shared trays + loose input** (owner decision, feature 00 decision 5: two fields). `QuantityInput` wraps two `UInputNumber`s and takes `eggsPerTray` from the farm. It emits one egg count, and it's reused later by Sales.
  - Trays: min 0, no max. Loose: min 0, max `eggsPerTray − 1`, **validated, not clamped**.
  - `inputmode="numeric"`, `pattern="[0-9]*"`, `enterkeyhint="next"` (`"done"` on the last field), `autocomplete="off"`.
  - Blank counts as 0.
- `formatQty` (R1) is its display counterpart, and it's the only formatter used on this screen.
- There's **no open convention decision** here. It's already decided: two fields.

### Accessibility
- **Tap targets ≥ 44px (mobile and tablet):** steppers (44×44), quantity inputs (44 tall), date inputs, chips, Clear, the ⋮ trigger, menu items, sheet ✕, Cancel/Save, dialog buttons and the FAB (52px). The design's 32px inputs, 36px Save and ~26px ✕ are raised (D7). The day-card toggle is at least 56px tall.
- **Numeric keypad:** every quantity field (as above). Date uses the native date picker.
- **Labels on every input:** visible column/inline labels plus explicit accessible names per input (`"Large loose eggs"`). Date and From/To have labels, and group labels are `fieldset`/`legend` ("Good eggs, by size", "Rejects (no size)"). Errors are linked through `aria-describedby` (`UFormField`).
- **Not colour alone:** rejects always say "Rejects:" or "Reject" in text. Good/Reject badges have text. Chart series are named in the legend and tooltip, and slots 10+ also use a dash pattern. Invalid fields have a message and an icon, not just a red ring. The active chip has `aria-pressed` and a solid fill (not just a hue change), and "Delete day" has an icon.
- **Sunlight contrast:** body amounts use `text-default`/`text-highlighted`. Chart lines use the 600 shades in light mode (R2). The reject amount uses the owner-approved #E7000B in light mode. Badges use the `subtle` variant, whose text is dark enough on its tint, and the FE checks the yellow/lime tints if they're ever used as text.
- **Focus:** opening the sheet/dialog traps focus. Closing returns focus to the FAB, the Add button or the ⋮ that opened it. After a delete, focus moves to the next card's toggle, or to the empty-state button. Dialog defaults: Cancel / Keep editing.
- **Live regions:** toasts are announced (Nuxt UI toaster). Form-level errors use `role="alert"`.
- **Motion:** sheet slide, card highlight and chevron rotation respect `prefers-reduced-motion`.
- **Text size:** 16px inputs (no iOS zoom), as in feature 00.

### Design conflicts: UX resolution
| # | Resolution in this section |
|---|---|
| D1 | Edit day and Delete day live in each card's ⋮ menu (44px, works collapsed). Edit reuses the form ("Edit production", date read-only, replaces the day). Delete asks for confirmation, and the dialog lists what's removed. |
| D2 | Rejects are one unsized "Rejects (no size)" amount (design). There's no size picker for rejects anywhere. |
| D3 | Week = rolling 7 days, Month = rolling 30 days (device date). The range overrides the chips and un-highlights them, and Clear or tapping a chip returns to it. A caption on the chart shows the active range. There's no Day chip. |
| D4 | R1: under a tray shows `5 eggs`, and labelled amounts read `Rejects: 5 eggs`. This applies to good eggs too. |
| D5 | Day cards at every width. |
| D6 | The loose max, the message and the stepper limit all come from the farm's tray size. |
| D7 | Every mobile/tablet target is at least 44px. The mobile form row stacks the size name above its steppers to fit. |
| D8 | FAB at bottom `64px + safe-area + 16px`, right 16px. The page pads for it, and toasts sit above it. |
| D9 | Toasts name the date. There are separate "Logged" / "Added to" / "Updated" / "Deleted" wordings. |
| D10 | R2: colour per size through a stable slot and a 10-colour palette (the design's four kept), dashed after 10. Rejects are always red. Full names everywhere, and a rule for short codes if they're needed later. |

### Data the UI needs (for the architect)
1. **The farm's size list** (id, name, order, **stable colour slot**), available **before the form opens** (e.g. with the farm context, like eggs-per-tray), so the FAB opens the form instantly with no spinner. Seeded slots: Small 0, Medium 1, Large 2, Jumbo 3. New sizes take the lowest unused slot. Any size referenced by a day in range must be resolvable to its current name and order, even if it's later archived (AC39, AC41).
2. **Eggs-per-tray** (already on the farm context from feature 00).
3. **Days in a date range:** for each day with production, the date, good eggs per size id and rejects eggs. Newest first. The list and the chart use the same payload. Totals can be summed client-side.
4. **"Has any production at all"** (a flag or count) to tell the first-use empty state (AC27) apart from the empty-range one (AC28).
5. **One day's totals by date, for any date** (even outside the loaded range): for the AC8 "adds to" note when the owner changes the date, for Edit pre-fill and for the delete dialog.
6. **The result of a save/edit:** the day's new totals, and whether the date **already had production before this save** (to pick "Logged…" vs "Added to…" in the toast). The card updates from this without a reload.
7. **Idempotency for "add":** the UI generates one submit id per form opening and reuses it on retries. Because saving *adds* to a day, a retry after an ambiguous network failure must not add twice (AC12, AC13).
8. **Local "today":** the UI sends the device's local date. The server's future-date check must not reject a local "today" that is "tomorrow" in UTC (the 9 pm case, AC11 and the "Today" definition).
9. **Error kinds** the UI maps to copy: network/unreachable; validation with the field (which size / rejects, loose too high, not whole, future date, nothing entered); unknown or foreign size (→ "Your sizes have changed…"); day not found on edit/delete (→ refresh the list and toast "That day was already deleted."); session expired (shell handles it).
10. **Edit = replace, delete = by date:** the UI sends the complete set of amounts for the day on Edit. It doesn't send per-row patches.

### Questions for PM
- **Q1 (AC7):** when a saved date is outside the current filter, I switch the range to that single date so the card is visible (Clear returns to the chip). OK, or would you rather keep the filter and only show the toast?
- **Q2:** should the "adds to" note (AC8) offer a link, "Edit Sep 24 instead", for when the owner meant to correct rather than add? It isn't included. It's one extra link, but it's new behaviour.
- **Q3:** is there a sanity limit on trays (a typo of 800 instead of 8)? Nothing is included. A soft warning ("That's a lot of trays. Check the number.") could be added later without blocking.
- **Q4 (AC20):** the chart plots only days that have production (a day not logged isn't drawn as 0), which matches the design. Please confirm that reading of "across the days in the current filter".

**Answers (team lead, 2026-09-25; the owner can override):**
- **Q1:** yes. Switch the range to the saved date so the card is visible.
- **Q2:** no link in 01. Edit day in the ⋮ menu covers corrections.
- **Q3:** no tray limit in 01. A soft "check the number" warning is noted as a follow-up.
- **Q4:** confirmed. Plot only days that have production; a day that wasn't logged isn't drawn as 0.

**Owner decisions (2026-09-25):** O1 A ("5 eggs", label first), O2 accepted (name above steppers on phones), O3 accepted (darker chart lines in light mode), O4 keep all five additions.

### Decisions for owner
- **O1: How small amounts read (D4).** Your design shows the same 5 rejects three ways ("5 loose rejects", "0 trays + 5", "5 rejects"). I propose one rule: **under a tray it reads "5 eggs"**, and whenever the app says what an amount is, the label comes first: **"Rejects: 5 eggs"**, **"Good: 16 trays + 14"**. Alternatives: (B) keep "0 trays + 5" everywhere (consistent, but clunky for small numbers), or (C) "5 loose" (short, but "loose" means the leftover after trays elsewhere). **Recommendation: A.**
- **O2: Phone form layout (D7).** At a thumb-friendly 44px, the size name, the trays stepper and the loose stepper don't fit on one line on a phone, so on phones **each size's name sits above its two steppers**. It's a bit taller and scrolls a little, while Save stays pinned at the bottom. Desktop keeps your one-line rows. **Recommendation: accept.** The alternative is smaller 32px steppers as designed, which are easy to miss with a gloved or wet thumb.
- **O3: Chart colours in sunlight (R2).** Your four size colours stay, and extra sizes get violet, cyan, orange, pink, lime and indigo. In light mode I'd draw the lines one shade darker (the same colours), because your yellow line is very faint on white outdoors. This is the same kind of change you approved for the green buttons. **Recommendation: accept.**
- **O4: Small additions to your design, for you to confirm or strike:** a live "Good: … · Rejects: …" total above Save (to check against your notebook before saving), a "Today" / weekday hint under the date, the date range caption on the chart, a tap-for-numbers tooltip on the chart, and a "Show last 30 days" button when the week is empty. **Recommendation: keep all five.** None of them adds a step to logging.

## 3. Technical design (Architect)

Checked on 2026-09-25 against the installed code and versions: Postgres **17.6** (local stack), `@nuxt/ui` 4.11.2 (`UInputNumber`, `UDrawer` and `UModal` props read from `node_modules/@nuxt/ui/dist/runtime/components/*.d.ts`), and the PostgREST error mapping (docs.postgrest.org). Verified on the local DB: `unique nulls not distinct (…)` works as an `ON CONFLICT (…) DO UPDATE` arbiter (two reject upserts of 5 and 7 sum to 12), and duplicate keys *within one* upsert statement raise `ON CONFLICT DO UPDATE command cannot affect row a second time`, so the functions below reject duplicate sizes before the upsert.

**Shape of the design in one paragraph.** Sizes become a tenant-scoped `sizes` table. It's seeded by a trigger on `tenants` insert, and a migration backfills existing farms. Production is **one aggregate row per (farm, date, quality, size)**: logging a date again *adds* to its rows with an upsert, Edit *replaces* the day, and Delete removes it by date. Every write is a `security invoker` Postgres function called through supabase-js `rpc` as the signed-in user, so each Save is one transaction, which makes it all-or-nothing. An idempotency table keyed by a client-generated `submissionId` stops a retried "add" from counting twice. Reads come from one function that returns every day in a range as one JSON value (so PostgREST's `max_rows = 1000` can't truncate it), plus a `hasAny` flag. The size list goes out with the farm in `/api/me`, so the form opens instantly.

### 3.1 Data

Three new migrations, each created with `bunx supabase migration new <name>` (timestamps after `20260924171655`). Types are regenerated afterwards with `bun run db:types`.

#### M4 `sizes`

| Column | Type / constraint |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `name` | `text not null`, `constraint sizes_name_length check (char_length(btrim(name)) between 1 and 40)` |
| `sort_order` | `integer not null`, `check (sort_order >= 0)`. It sets the farm's order. It's **not** unique, so a later reorder doesn't need deferred constraints. Ties break by `name`, then `id`. |
| `color_slot` | `smallint not null`, `check (color_slot >= 0)`. This is the stable colour (UX R2): slots 0–9 map to the palette, and 10+ repeat the palette with a dashed line. |
| `archived_at` | `timestamptz null`. Null means active. Retiring a size (the follow-up feature) sets this, and **sizes are never deleted** (AC41). |
| `created_at`, `updated_at` | `timestamptz not null default now()` + the `set_updated_at` trigger |

- `constraint sizes_tenant_id_id_key unique (tenant_id, id)`. This is the target of production's composite FK, and it's also the index that leads with `tenant_id` (the 010 meta-test needs one).
- `create unique index sizes_tenant_name_key on public.sizes (tenant_id, lower(btrim(name)))`: no two sizes in a farm can share a name, whatever the case. This covers archived sizes too, so past days never show two identical labels. The follow-up may relax it to active sizes only.
- `constraint sizes_tenant_color_slot_key unique (tenant_id, color_slot)`: a slot is never reused, not even after archiving, so an archived size keeps its colour in past charts (R2).
- **Default list, in one place.** `app.seed_default_sizes(p_tenant_id uuid) returns void` (plpgsql, `security invoker`, `set search_path = ''`) inserts `('Small',0,0), ('Medium',1,1), ('Large',2,2), ('Jumbo',3,3)` as `(name, sort_order, color_slot)`, with `on conflict do nothing` on the name index, so it's idempotent. Run `revoke all on function … from public`; no role other than the owner (postgres) needs it.
- **New farms (AC37):** `create trigger seed_default_sizes after insert on public.tenants for each row execute function app.seed_default_sizes_trigger()`, where the trigger function calls `app.seed_default_sizes(new.id)`. `provision_farm`, `tests.create_farm` and any future path all get the four sizes with no extra step. Tenants are only ever inserted by postgres/service_role, both of which bypass RLS, so the trigger needs no definer rights.
- **Existing farms (AC37):** the same migration ends with `select app.seed_default_sizes(t.id) from public.tenants t;`.
- **Grants/RLS:** see §3.2. Owners get read-only access in this feature.

#### M5 `production`

`public.production`: one row per (farm, date, quality, size). Its value is the day's total for that key.

| Column | Type / constraint |
|---|---|
| `id` | `uuid primary key default gen_random_uuid()` |
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `produced_on` | `date not null`: the owner's local calendar date, as sent by the device (it's a `date`, not a timestamp) |
| `size_id` | `uuid null` |
| `quality` | `text not null`, `constraint production_quality_valid check (quality in ('good', 'reject'))` (categories are data: a new quality is a new allowed value) |
| `eggs` | `integer not null`, `constraint production_eggs_positive check (eggs > 0)`. **Always individual eggs.** Zero rows aren't stored: a size with nothing is simply absent. |
| `created_at`, `updated_at` | `timestamptz not null default now()` + the `set_updated_at` trigger |

- `constraint production_reject_unsized check ((quality = 'reject') = (size_id is null))`. **Rejects are unsized and good eggs are sized**, enforced for every write path, including direct PostgREST calls (AC35, D2).
- `constraint production_size_fk foreign key (tenant_id, size_id) references public.sizes (tenant_id, id)`, with the default `MATCH SIMPLE` and `ON DELETE NO ACTION`. **A size must belong to the same farm** (AC35, AC40): a composite key can't point at another tenant's size even if its id is known. When `size_id` is null (rejects) the FK isn't checked. It's `NO ACTION` rather than `RESTRICT` because `NO ACTION` is checked at the end of the statement, so deleting a whole tenant (both tables cascade from `tenants`) still works. Deleting a single size that has production fails, which is what AC41 wants.
- `constraint production_day_key unique nulls not distinct (tenant_id, produced_on, quality, size_id)`. This is **the aggregate key**: at most one row per day per size and one reject row per day, and it's the upsert arbiter. It leads with `tenant_id` and also serves the date-range reads.
- `create index production_tenant_size_idx on public.production (tenant_id, size_id)`. It backs the composite FK (size lookups and a future archive check) and the Inventory `group by size_id` (feature 04).
- The single-column `tenant_id` FK is kept alongside the composite one, because 010 requires every `tenant_id` to reference `tenants`.

`public.production_submissions` is the idempotency ledger for "add" saves (UX data need 7).

| Column | Type / constraint |
|---|---|
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `id` | `uuid not null`: the client's `submissionId` |
| `produced_on` | `date not null` |
| `had_before` | `boolean not null`: whether the date already had production **before** this submit, so a replay gets the same toast wording ("Logged…" vs "Added to…") |
| `created_at`, `updated_at` | `timestamptz not null default now()` + the trigger |

- `primary key (tenant_id, id)`. Scoping the key to the tenant means one farm's key can never collide with, or probe, another farm's. It also satisfies the "index leads with `tenant_id`" rule.
- About one row per Save, with no pruning in v1 (see D8).

#### M6 `production_functions`

All of these are `language plpgsql`, **`security invoker`** and `set search_path = ''`, so RLS applies exactly as for a direct query. Each runs as one transaction per `rpc` call. Every function takes **`p_tenant_id`**, which the repository layer fills from `ctx.tenantId` (never from the request), and first calls `app.assert_tenant(p_tenant_id)`. That raises `TM006` unless the value equals `app.current_tenant_id()`. It's the RPC form of "RLS **and** the repository filter": both have to agree.

Custom SQLSTATEs (PostgREST returns these as HTTP 400 with `code` = the SQLSTATE, and supabase-js exposes `error.code`). The `PT…` prefix is avoided on purpose, because PostgREST treats it as an HTTP status.

| SQLSTATE | Meaning | Repository maps it to |
|---|---|---|
| `TM001` | a size id isn't one of this farm's allowed sizes (unknown, another farm's, or archived) | 400 `validation_failed`, `fields.sizes` |
| `TM002` | date after the latest possible "today" anywhere on Earth (`(now() at time zone 'utc')::date + 1`) | 400 `validation_failed`, `fields.date` |
| `TM003` | day has no production (replace/delete) | 404 `not_found` |
| `TM004` | nothing above zero was entered | 400 `validation_failed`, `fields.amounts` |
| `TM005` | malformed amounts: array lengths differ, a negative or null count, or a duplicate size | 400 `validation_failed`, `fields.amounts` |
| `TM006` | `p_tenant_id` isn't the caller's tenant | 500 `internal` (logged: it can only be a server bug) |
| `23503`, `23514` | constraint backstops (shouldn't be reachable past the checks above) | 400 `validation_failed` |

Helpers, in the `app` schema (not exposed by PostgREST). Revoke execute from public and grant it to `authenticated`:
- `app.assert_tenant(p_tenant_id uuid) returns void`.
- `app.production_days_json(p_tenant_id uuid, p_from date, p_to date) returns jsonb`. It returns `{ "hasAny": bool, "days": [ { "date": "YYYY-MM-DD", "good": [ { "sizeId", "eggs" } … ], "goodTotal": int, "rejects": int } … ] }`. Days are newest first. `good` is in the farm's size order (`sort_order, name, id`, joined on `(tenant_id, id)`) and has only sizes with eggs. `rejects` is 0 when there are none. `hasAny` is `exists (select 1 from production where tenant_id = p_tenant_id)`, which ignores the range (AC27 vs AC28). Null `p_from`/`p_to` mean open-ended. Filters are `tenant_id = p_tenant_id` explicitly **and** RLS.

Public RPCs. Run `revoke execute … from public, anon`, then `grant execute … to authenticated`:

```sql
public.production_days(p_tenant_id uuid, p_from date default null, p_to date default null) returns jsonb
  -- assert_tenant; return app.production_days_json(p_tenant_id, p_from, p_to). Stable.

public.log_production(p_tenant_id uuid, p_submission_id uuid, p_day date,
                      p_size_ids uuid[], p_eggs integer[], p_rejects integer) returns jsonb
  -- returns { "day": <day json>, "hadBefore": bool, "replayed": bool }

public.replace_production_day(p_tenant_id uuid, p_day date,
                              p_size_ids uuid[], p_eggs integer[], p_rejects integer) returns jsonb
  -- returns { "day": <day json> }

public.delete_production_day(p_tenant_id uuid, p_day date) returns jsonb
  -- returns { "removed": <day json as it was before the delete> }
```

**`log_production` (add to the day, AC3, AC8, AC12, AC13):**
1. `assert_tenant`. Validate: `p_day` is not null and `≤ utc_today + 1` (else `TM002`); `p_size_ids`/`p_eggs` have equal lengths, no nulls, every count ≥ 0 and `p_rejects ≥ 0` (else `TM005`); no duplicate size id among non-zero lines (else `TM005`); the non-zero total is > 0 (else `TM004`).
2. `perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_day::text, 0))`. This serialises writes to one farm-day, so "had before", the upsert and a concurrent Edit/Delete can't interleave. It's held only for the length of this short transaction.
3. **Idempotency:** `insert into production_submissions (tenant_id, id, produced_on, had_before) values (p_tenant_id, p_submission_id, p_day, <exists production for the day>) on conflict (tenant_id, id) do nothing`. If no row was inserted, this is a **replay**: return `{ day: current day json, hadBefore: <stored had_before>, replayed: true }` and write nothing. A concurrent duplicate blocks on the PK until the first commits, then takes this branch. If the first attempt rolled back, its ledger row rolled back with it, so the retry really saves.
4. Every non-zero size id must be an **active** size of this tenant (`archived_at is null`), else `TM001`.
5. One upsert statement: `insert into production (tenant_id, produced_on, size_id, quality, eggs) select … 'good' … from unnest(p_size_ids, p_eggs) where eggs > 0 union all select …, null, 'reject', p_rejects where p_rejects > 0 on conflict (tenant_id, produced_on, quality, size_id) do update set eggs = production.eggs + excluded.eggs`.
6. Return `{ day, hadBefore, replayed: false }`.

**`replace_production_day` (Edit day, AC23, AC26):** `assert_tenant`, the same validation as steps 1 and 2 (an all-zero edit is `TM004`, because the UI routes it to Delete per AC24), then `TM003` if the day has no rows. The allowed sizes are **active sizes plus any size already on that day**, so editing a past day that holds a since-archived size doesn't strand it (forward-compatible with AC41; otherwise `TM001`). Then `delete from production where tenant_id = p_tenant_id and produced_on = p_day`, insert the non-zero lines, and return `{ day }`. It's naturally idempotent: a retry produces the same final state.

**`delete_production_day` (AC25, AC26):** `assert_tenant`, lock, capture `production_days_json(p_tenant_id, p_day, p_day)->'days'->0`, and raise `TM003` if it's null. Then delete by `(tenant_id, produced_on)` and return `{ removed }`. Idempotency records for that date stay; they're harmless.

**What Inventory (feature 04) needs, for the record:** `select size_id, sum(eggs) from production where tenant_id = … and quality = 'good' group by size_id`, minus completed sales by `size_id`. A `security_invoker` view or function over `production_tenant_size_idx` covers it, and 010 already requires `security_invoker` on views. Sales will reference `sizes` with the same composite `(tenant_id, size_id)` FK. Because rows are aggregates, Edit/Delete change on-hand retroactively, as the PM expects.

### 3.2 RLS and grants

| Table | Grants to `authenticated` (anon: `revoke all`) | Policies (all `to authenticated`, all `tenant_id = (select app.current_tenant_id())`) |
|---|---|---|
| `sizes` | `select` only | `sizes_select` (using). **No** insert/update/delete policy in 01, so owners can't change sizes yet: there's no grant **and** no policy (the two-lock pattern from feature 00, D6). The "Farm settings: sizes" feature adds insert/update (never delete). |
| `production` | `select, insert, update, delete` | The full template: `production_select`, `production_insert` (with check), `production_update` (using + with check), `production_delete` (using). The grants are required because the functions are `security invoker`. |
| `production_submissions` | `select, insert` | `production_submissions_select`, `production_submissions_insert` (with check). No update/delete. |

- `revoke all on public.<t> from anon, authenticated;` then the grants above, on all three. Supabase grants new-table privileges to both roles by default, so revoking first is mandatory.
- **Direct PostgREST writes.** The browser holds the user's JWT, so it could call PostgREST directly, bypassing Nitro. That's why every data rule lives in the DB: the check constraints, the composite FK, the unique key, RLS, and the function-level checks. A direct `insert` into `production` can still skip two function-only checks: the loose future-date backstop and "active size only". Both only affect the caller's own farm, and neither is a cross-tenant risk. When archiving exists, the follow-up should move "active size" into a `before insert` trigger (see Open questions).

### 3.3 Server API

All routes are wrapped in **`defineTenantHandler`** (the guard test picks them up automatically). They get `ctx.db` and `ctx.farm`, and none reads a tenant from the query, body or params. Quantities are **egg counts**. Dates are `YYYY-MM-DD` strings, which are the device's **local** date (the server never converts time zones). Responses carry `Cache-Control: private, no-store` (from the handler).

#### Contract: additions to `shared/types/api.ts`

```ts
/** A farm's egg size (per-farm data, D10). Colour comes from `colorSlot` (UX R2), never from position. */
export interface FarmSize {
  id: string
  name: string
  sortOrder: number
  colorSlot: number
  /** false once archived (follow-up feature). Archived sizes still label past days; the form offers active ones only. */
  active: boolean
}

export interface FarmSummary {
  id: string
  name: string
  eggsPerTray: number
  /** ALL of the farm's sizes (active + archived), sorted by sortOrder, name. New in feature 01. */
  sizes: FarmSize[]
}

/** 'YYYY-MM-DD', the owner's local calendar date. */
export type IsoDate = string

export interface ProductionSizeAmount { sizeId: string, eggs: number }

/** One day's production. `good` has only sizes with eggs > 0, in the farm's size order. */
export interface ProductionDay {
  date: IsoDate
  good: ProductionSizeAmount[]
  /** Sum of `good[].eggs`. Rejects are NOT included (AC16). */
  goodTotal: number
  /** Unsized rejects for the day; 0 when none. */
  rejects: number
}

/** GET /api/production/days */
export interface ProductionDaysResponse {
  /** Whether the farm has any production at all, ignoring the range (AC27 vs AC28). */
  hasAny: boolean
  /** Days in range that have production, newest first. */
  days: ProductionDay[]
}

/** GET /api/production/days/:date */
export interface ProductionDayResponse { day: ProductionDay | null }

/** The amounts in one save. Zero lines may be sent and are ignored. */
export interface ProductionAmounts {
  good: ProductionSizeAmount[]
  rejects: number
}

/** POST /api/production/entries (add to the day). */
export interface LogProductionRequest extends ProductionAmounts {
  /** A UUID generated per form opening and reused on retries of the SAME payload (§3.4 "Retry rule"). */
  submissionId: string
  date: IsoDate
}
export interface LogProductionResponse {
  day: ProductionDay
  /** The date already had production before this save ("Added to…" vs "Logged…" toast). */
  hadProductionBefore: boolean
  /** true when this submissionId had already been applied; nothing new was added. */
  replayed: boolean
}

/** PUT /api/production/days/:date (Edit day: replaces the day). */
export type ReplaceProductionDayRequest = ProductionAmounts
export interface ReplaceProductionDayResponse { day: ProductionDay }

/** DELETE /api/production/days/:date */
export interface DeleteProductionDayResponse { removed: ProductionDay }
```

`ApiErrorCode` is **unchanged**. Field keys in `ApiErrorData.fields` for these routes live in `shared/constants/production.ts`:

```ts
export const PRODUCTION_FIELDS = {
  date: 'date',        // bad or future date
  amounts: 'amounts',  // nothing entered / malformed
  rejects: 'rejects',  // rejects not a whole number >= 0 or over the cap
  sizes: 'sizes',      // unknown/foreign/archived size -> "Your sizes have changed…"
  from: 'from', to: 'to',
  good: (sizeId: string) => `good.${sizeId}`, // a per-size count invalid
} as const
export const MAX_EGGS_PER_LINE = 1_000_000   // integer-safety cap per line per save (D9); not a UX tray limit
```
The messages are the §2.5 copy (`PRODUCTION_MESSAGES` in the same file), so the server and the form say the same thing.

#### Validation schemas: `shared/schemas/production.ts` (zod 4, relative imports)

- `isoDateSchema`: `/^\d{4}-\d{2}-\d{2}$/` plus a real calendar date (round-trip through `Date.UTC`).
- `eggCountSchema`: `z.number().int().min(0).max(MAX_EGGS_PER_LINE)`.
- `productionAmountsSchema`: `{ good: z.array({ sizeId: z.uuid(), eggs: eggCountSchema }).max(100), rejects: eggCountSchema }`, with refines for no duplicate `sizeId` (→ `amounts`) and at least one amount > 0 (→ `amounts`, "Enter at least one amount.").
- `logProductionBodySchema = productionAmountsSchema.extend({ submissionId: z.uuid(), date: isoDateSchema })`, refined so `date ≤ maxLoggableDate(now)` (→ `date`).
- `replaceProductionDayBodySchema = productionAmountsSchema`.
- `productionRangeQuerySchema = { from?: isoDateSchema, to?: isoDateSchema }`, refined so `from ≤ to` (→ `to`, "End date must be on or after the start date").
- `.strict()` isn't used: unknown keys, including a smuggled `tenant_id`, are **stripped** by zod's default and never reach the repository.

`shared/utils/local-date.ts` (pure, unit-tested, used by the server and the app): `todayLocal(now = new Date()): IsoDate` (from `getFullYear/Month/Date`, **not** `toISOString`); `todayUtc(now)`; `maxLoggableDate(now) = addDays(todayUtc(now), 1)`; `addDays(d, n)` and `compareIsoDates(a, b)`, both done on date-only values in UTC so DST never shifts a day.

#### Routes

| Method, path | File | Request | 200 response | Errors |
|---|---|---|---|---|
| `GET /api/production/days?from=&to=` | `server/api/production/days.get.ts` | query per `productionRangeQuerySchema`; both optional (UX: From only → from..∞, and the FE passes `to = today`; To only → ..to; neither → all) | `ProductionDaysResponse` | 400 `validation_failed` (`from`/`to`) |
| `GET /api/production/days/:date` | `server/api/production/days/[date].get.ts` | `date` param | `ProductionDayResponse` (`day: null` when none, **not** 404, because the AC8 note looks up arbitrary dates) | 400 (`date`) |
| `POST /api/production/entries` | `server/api/production/entries.post.ts` | `LogProductionRequest` | `LogProductionResponse` | 400 (`date`, `amounts`, `rejects`, `good.<id>`, `sizes`) |
| `PUT /api/production/days/:date` | `server/api/production/days/[date].put.ts` | `ReplaceProductionDayRequest` | `ReplaceProductionDayResponse` | 400 (as above); 404 `not_found` (day has no production) |
| `DELETE /api/production/days/:date` | `server/api/production/days/[date].delete.ts` | none | `DeleteProductionDayResponse` | 404 `not_found` |

Every route can also return 401 `unauthenticated`, 403 `no_farm` and 500 `internal` (from `defineTenantHandler`). Handlers are one validation plus one repository call, so each one is a single short request: an auth check, the membership lookup and one RPC.

**`GET /api/me` change:** `MeResponse` is unchanged in shape, but `farm.sizes` is now filled in (FE reads the size list from `useMe()`, UX data need 1). `findMembershipWithFarm` embeds it in the same single query: `.select('tenant_id, tenants ( id, name, eggs_per_tray, sizes ( id, name, sort_order, color_slot, archived_at ) )')`, and `toFarmSummary` sorts it (`sortOrder`, `name`, `id`). `getCurrentFarm` does the same. Every tenant request therefore also carries the farm's sizes, which are a handful of rows.

#### Repository and utils

- **`server/utils/db.ts`: add `TenantDb.rpc(fn, args)`.** This is the RPC form of `scoped()`. `fn` is limited to the `public` functions whose `Args` include `p_tenant_id`; `args` is typed `Omit<Args, 'p_tenant_id'>`; it injects `p_tenant_id: tenantId` and drops any smuggled `p_tenant_id`. Only repositories call it, and guard (b2) already bans `.rpc(` in routes. Unit-test it in `tests/unit/tenant-db.spec.ts`.
- **`server/repositories/production.ts`:** `listProductionDays(db, { from, to })`, `getProductionDay(db, date)`, `logProduction(db, input)`, `replaceProductionDay(db, date, amounts)`, `deleteProductionDay(db, date)`. Each calls `db.rpc(...)`, splits `good` into `p_size_ids`/`p_eggs` arrays, and parses the `jsonb` result into the contract types with a small zod schema (the generated type is `Json`), mapping `hadBefore` → `hadProductionBefore`. `mapProductionDbError(error)` implements the SQLSTATE table in §3.1. Unit-tested with a fake client (`tests/unit/production-repo.spec.ts`).
- Handlers read input with `getValidatedQuery` / `readValidatedBody` / `getValidatedRouterParams` and the shared schemas. A zod failure becomes 400 `validation_failed` with `fields` from the zod issue paths. Add a small `zodFields(error)` helper in `server/utils/errors.ts`.

### 3.4 Frontend

**Page and shell**
- `app/pages/production.vue` replaces the placeholder: `definePageMeta({ primaryAction: { label: 'Add production', ariaLabel: 'Log production', icon: 'i-lucide-plus', fab: true } })`.
- **Primary action (AC1, AC32).** `app/types/page-meta.d.ts` gains `primaryAction?: { label, ariaLabel, icon, fab?: boolean }`. `app/layouts/default.vue` renders it from `route.meta`, so it's SSR-safe with no hydration mismatch: a `UButton` (primary, `size="lg"`, `xl` on tablet for 44px) in the navbar `#right` at `md+`, and a 52px round FAB (`md:hidden`, `fixed right-4 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)]`) below `md`. When `fab` is set, the layout's mobile bottom padding grows by 84px (AC31). A click calls `usePrimaryAction().trigger()` (`app/composables/usePrimaryAction.ts`: the page registers its handler with `onPrimaryAction(fn)`, cleared on unmount, and a `hidden` ref hides the FAB while the sheet or a dialog is open). This is generic, so Sales and Clients reuse it later. On mobile Production the toaster viewport is raised above the FAB by binding `UApp`'s `toaster.ui` from `usePrimaryAction().fabVisible` (FE confirms the exact slot key in 4.11).
- **Data is fetched on the client only.** Every range depends on the device's local "today", which the server can't know. So the list uses `useAsyncData(key, …, { server: false })`, and SSR renders the loading skeleton (AC29). The size list and eggs-per-tray are already in the SSR payload through `useMe()`.

**Shared helpers (single source each)**
- `shared/utils/quantity.ts`: **the one trays↔eggs helper**, used by the form, cards, chart, notes, dialogs and toasts, and reused by Sales later:
  - `toEggs(trays: number, loose: number, eggsPerTray: number): number`
  - `splitEggs(eggs: number, eggsPerTray: number): { trays: number, loose: number }`
  - `formatQty(eggs: number, eggsPerTray: number, locale?: string): string` gives UX R1 exactly: `0 eggs`, `1 egg`, `5 eggs`, `1 tray`, `2 trays`, `1 tray + 12`, `16 trays + 14`, `1,200 trays` (`Intl.NumberFormat` for the thousands).
  - `formatLabelledQty('Good' | 'Rejects', eggs, eggsPerTray)` → `Rejects: 5 eggs`.
  - All of them throw on `eggsPerTray` that isn't an integer ≥ 1. **`30` never appears in app code:** the value always comes from `useFarm().eggsPerTray`.
- `shared/utils/local-date.ts` (§3.3) and `app/utils/day-label.ts`: `formatDayLabel(date, today)` → `Today · Sep 25` / `Sep 24` / `Sep 24, 2025`; `formatDayPhrase(date, today)` → `today` / `Sep 24` for copy; `formatDateHint(date, today)` → `Today` / `Wednesday, Sep 24`.
- `app/utils/production-range.ts` (pure): `rangeFor(state, today)` → `{ from, to }` for Week (today−6..today), Month (today−29..today), From-only (from..today), To-only (..to), and From+To; `validateRange` → the "End date…" error.
- `app/utils/size-colors.ts`: `SIZE_PALETTE` (10 entries of **static** Tailwind class strings, 600 shade in light and 400 in dark, e.g. `'text-blue-600 dark:text-blue-400'`, so Tailwind v4 scanning sees them), `sizeColor(slot) → { class, dashed: slot >= 10 }`, and `REJECT_COLOR = 'text-error'`. SVG strokes use `stroke="currentColor"` inside an element that carries the class.
- `app/composables/useFarm.ts`: `eggsPerTray`, `sizes` (all), `activeSizes`, `sizeById(id)` (for archived or unknown ids, falls back to a neutral `Unknown size` label), all from `useMe()`. `refreshSizes()` = `useMe().ensure({ force: true })`, called after a `sizes` error so reopening the form shows the new list.
- `shared/schemas/production-form.ts`: `createProductionFormSchema({ eggsPerTray, activeSizeIds, today, mode })`, the **form** schema in trays + loose per line. Blank → 0; whole numbers ≥ 0 only; `loose ≤ eggsPerTray − 1` with the message `Loose eggs must be under {eggsPerTray}. Add a tray instead.`; `date ≤ today` (local; `You can't log a future date. Pick today or earlier.`) and required; at least one amount > 0 in Log mode (in Edit mode, all-zero opens the AC24 dialog instead of erroring). `toProductionAmounts(formState, eggsPerTray): ProductionAmounts` converts through `toEggs`.

**Composables**
- `useProductionDays()`: owns the range state (chips, from/to), `status` (`loading` | `ready` | `refreshing` | `error`), `hasAny` and `days`, and fetches `GET /api/production/days` through `$api`. On a range change it keeps the old data while refetching (`refreshing`, the header spinner). `upsertDay(day)` / `removeDay(date)` patch the cached list in place after mutations, with no reload (AC7, AC25). `hasAny` is set true on save and recomputed from the response after a delete by one silent refetch.
- `useProductionDay(date)`: `GET /api/production/days/:date` for the AC8 note, Edit pre-fill and the delete dialog. It's debounced by the date input and silent (no spinner, per UX).
- `useProductionMutations()`: `log(req)`, `replace(date, amounts)`, `remove(date)`, each returning `{ ok: true, data } | { ok: false, error: ProductionErrorKind }`, with an in-flight guard.
- `app/utils/production-errors.ts`: `mapProductionError(e)` → `'network' | 'validation' | 'stale_sizes' | 'not_found' | 'unknown'`, plus `fields`. A `FetchError` with no response is `network`; 400 + `fields.sizes` is `stale_sizes`; 404 is `not_found` (→ refetch the list + toast "That day was already deleted."); 401 is already handled by `$api`.

**Retry rule (AC12, AC13).** `submissionId = crypto.randomUUID()` when the form opens. Save sends it. A failed Save keeps it, and a retry with the **same payload** reuses it, so the server replays instead of adding twice. If the owner **changes any amount or the date** after a failure, the form generates a new id, because a changed payload is a new intent and must never be silently swallowed by a replay. After a failure the form also re-queries the AC8 note, so if the lost attempt did land, the note shows it. Button `loading` + `disabled` and the in-flight guard mean a double tap sends one request.

**Components** (Nuxt UI v4; the FE confirms props against 4.11.2):

| Component | Built from | Notes |
|---|---|---|
| `QuantityInput.vue` | 2 × `UInputNumber` (`size="xl"` below `lg`, `lg` above) | Props `modelValue: { trays: number \| null, loose: number \| null }`, `eggsPerTray`, `label` (for the accessible names). Trays has `:min="0"` and no max. Loose has `:min="0"` and **no `max` prop**, because reka-ui's NumberField clamps to `max` on blur, and UX requires validate-not-clamp. Use `:increment-disabled="loose >= eggsPerTray - 1"` and `:decrement-disabled` at 0/blank, `:format-options="{ useGrouping: false }"`, `disable-wheel-change`, `inputmode="numeric"`, `pattern="[0-9]*"`, `enterkeyhint`, `autocomplete="off"`, and steppers with `tabindex="-1"` via the `increment`/`decrement` button props. Emits the egg total too (`toEggs`). **Reused by Sales.** |
| `ProductionFormOverlay.vue` | `UDrawer direction="bottom" :dismissible="false"` below `md`; `UModal :dismissible="false"` at `md+` | Both expose `close:prevent`, which routes every close gesture through the discard check (AC14). Title `Log production` / `Edit production`. A fixed footer with the live total, Cancel and Save. Closing is disabled while saving. If `UDrawer` fights the on-screen keyboard during FE testing, fall back to a `UModal` styled as the sheet (UX's fallback). |
| `ProductionForm.vue` | `UForm` (`:schema`, `useSubmitValidation()`), `UFormField`, `UInput type="date" :max="today"`, `fieldset`/`legend`, `QuantityInput` per **active** size in `sortOrder` + one for Rejects, `UAlert` (the info note, form error) | Edit mode shows the date as text plus the hint. The AC8 note uses `useProductionDay`. The form-level error goes above the footer. |
| `ProductionFilters.vue` | `UInput type="date"` ×2, `UButton` chips (`aria-pressed`), `UButton` ghost Clear | It wraps at 375px (AC31). |
| `ProductionTrendChart.vue` | hand-drawn inline SVG in a `UCard` (no chart library, D12) | One `<polyline>` + dots per active-or-present size (in size order) + Rejects. X axis = the days in the payload, oldest left. Label thinning ≤7 on mobile / ≤14 on desktop. Tooltip on hover/tap. `role="img"` + aria-label. States: 1 day, empty. |
| `ProductionDayCard.vue` | a `UCard`-style wrapper, `<button aria-expanded>`, `UBadge` (`variant="subtle"`: `error` for the `Rejects: …` badge and the Reject line, `success` for Good), `UDropdownMenu` + `UButton` ghost ⋮ (44px) | Size lines come from `useFarm().sizeById` in farm order. Amounts use `formatQty`. |
| `ProductionDeleteDialog.vue`, `ConfirmDiscardDialog.vue` | `UModal` (max-w 400px), `UAlert`, `UButton` | These are the delete confirm (+ the AC24 variant) and the discard confirm. |
| empty/error/loading | `AppPlaceholder` (+ action slot), `USkeleton` | AC27–AC30 |

Toasts use `useToast().add` with the §2.5 wording (Logged / Added to / Updated / Deleted, date via `formatDayPhrase`).

### 3.5 Invariants at risk

| Rule (CLAUDE.md) | How this design protects it |
|---|---|
| `tenant_id` + `updated_at` + RLS on every table | All three new tables have `tenant_id` (FK to tenants), `updated_at` + trigger, RLS, an index leading with `tenant_id`, and a registry row. The `010` meta-test fails otherwise. |
| Derive the tenant on the server; never trust the client | There's no tenant in any request. Zod strips unknown keys. `p_tenant_id` comes only from `ctx.tenantId` through `TenantDb.rpc`, and **every function asserts it equals `app.current_tenant_id()`** (`TM006`). Guard test (d) covers the new route files. |
| Tenant scoping in one layer; RLS stays on | Functions are `security invoker` and run as `authenticated` with the user's JWT. RLS applies inside them, and they also filter `tenant_id = p_tenant_id`. `TenantDb.rpc` is the only place `p_tenant_id` is set. The 010 check "no security definer function in public is executable by anon/authenticated" still holds, and a new 010 assertion pins the four RPCs as invoker-only and not executable by anon. |
| Service-role key not used at runtime | Nothing new uses it. Sizes are seeded by a DB trigger, so provisioning code doesn't change. |
| Eggs are the unit; eggs-per-tray per farm, never hardcoded | The API and DB carry only egg counts (`production.eggs integer > 0`). Trays exist only in `QuantityInput` / `formatQty` / the form schema, all parameterised by `eggsPerTray` from `useFarm()` (AC6, AC36). The loose max is `eggsPerTray − 1`, computed. |
| Categories are data (sizes are per-farm rows) | Sizes are rows in `sizes`, referenced by `size_id`. Nothing in the app or DB lists Small/Medium/Large/Jumbo except `app.seed_default_sizes` (AC38). The FE iterates `useFarm().activeSizes`. |
| Production rows `(date, size, quality, count)`; rejects unsized, never in inventory/sales | `production_reject_unsized` check: `size_id is null ⇔ quality = 'reject'` (AC35). Inventory later filters `quality = 'good'`. Rejects have no size, so no sized sale can ever draw on them. |
| A size belongs to the same farm | The composite FK `(tenant_id, size_id) → sizes (tenant_id, id)`; `TM001` in the functions gives a friendly error first. |
| Inventory is computed, never stored | Nothing stores on-hand. Production rows are the input, and Edit/Delete change on-hand retroactively. |
| Serverless: short handlers, no pool | Each route is supabase-js over HTTP: auth + membership + one RPC. The advisory lock is transaction-scoped and held for milliseconds. The biggest read is one JSON value. |
| Multi-row saves are atomic | Each Save is one `rpc` = one Postgres transaction (AC13, AC26). There's no multi-call orchestration in Nitro. |

### 3.6 Tests

- **pgTAP registry** (`000_helpers.sql`), in this order, after memberships:
  - `sizes`: seed `null` (the trigger seeds on `create_farm`); attack `insert into public.sizes (tenant_id, name, sort_order, color_slot) values (%1$L, 'Attack', 99, 99)`.
  - `production`: seed `insert into public.production (tenant_id, produced_on, size_id, quality, eggs) select %1$L, date '2026-01-01', s.id, 'good', 10 from public.sizes s where s.tenant_id = %1$L order by s.sort_order limit 1`; attack `insert into public.production (tenant_id, produced_on, quality, eggs) values (%1$L, date '2026-01-01', 'reject', 1)`.
  - `production_submissions`: seed and attack `insert into public.production_submissions (tenant_id, id, produced_on, had_before) values (%1$L, gen_random_uuid(), date '2026-01-01', false)`.

  `020` then covers all 8 checks × 3 tables × both directions automatically (AC34).
- **`010`:** add that the four public production functions are `not prosecdef`, not executable by `anon`, and executable by `authenticated`; and that the `app.*` production helpers aren't executable by `anon`.
- **`020` named cases (AC21, AC34, AC40):**
  - As A: `log_production(<B tenant>, …)`, `production_days(<B tenant>)`, `replace_production_day(<B>…)` and `delete_production_day(<B>…)` all raise `TM006`, and B's rows are unchanged (re-read as postgres).
  - As A with A's tenant but **B's size id**, the RPC raises `TM001`, and a direct insert raises `23503` (composite FK).
  - A sees exactly A's 4 sizes and 0 of B's; anon gets `42501` executing each RPC.
- **New `040_production.test.sql` (constraints and functions):**
  - Seeding: a new tenant gets Small/Medium/Large/Jumbo with slots 0–3 in order, and `app.seed_default_sizes` is idempotent. Also `provision_farm` → 4 sizes (extend 030).
  - Constraints: a sized reject → 23514; an unsized good → 23514; `eggs = 0` → 23514; an unknown quality → 23514; a duplicate key without upsert → 23505; a duplicate size name (any case) → 23505; deleting a size with production fails; deleting a tenant with production succeeds (NO ACTION FK).
  - `log_production`:
    - the AC3 example → day `goodTotal 494`, `rejects 5`, `hadBefore false`;
    - adding Large 66 → Large 330 in **one** row, `hadBefore true` (AC8);
    - the same `submissionId` again → `replayed true` and the totals unchanged (AC12);
    - one bad size among good lines → `TM001` and **nothing** written (AC13);
    - `utc_today + 2` → `TM002`, `utc_today + 1` OK;
    - all zero → `TM004`; duplicate sizes → `TM005`;
    - an archived size → `TM001`.
  - `replace_production_day`: Large 264 → 234 gives `goodTotal 464` (AC23); a size set to 0 disappears; an empty day → `TM003`; all zero → `TM004`; an archived size already on the day is accepted.
  - `delete_production_day` returns the removed totals and leaves 0 rows; a second delete → `TM003`.
  - `production_days`: newest first, `good` in `sort_order` (reorder the sizes → the order changes, counts don't: AC39), a rename is reflected (AC39), `hasAny` is true with an empty range, and open-ended ranges work.
- **`090` mutations** (proof the new rows aren't vacuous): m8 `sizes_select` → `using (true)`; m9 `production_insert` → `with check (true)`; m10 `production_update` → `with check (true)`. Update the final policy-list assertion.
- **Vitest:**
  - `quantity.spec.ts`: every R1 row at 30 and at 24 per tray (29 → `1 tray + 5`, 494 → `20 trays + 14`), `toEggs(1,5,24) = 29`, `splitEggs` round-trips, invalid `eggsPerTray` throws.
  - `local-date.spec.ts`: 21:00 local stays "today", month/year/DST boundaries.
  - `day-label.spec.ts`, `production-range.spec.ts`.
  - `production-schemas.spec.ts`: API schemas, plus the form schema at 30 and 24 per tray: blank→0, −1/1.5/`abc` rejected, loose 29 OK / 30 error at 30 per tray, nothing entered, future date, a smuggled `tenant_id` stripped.
  - `production-errors.spec.ts`, `production-repo.spec.ts` (SQLSTATE → ApiError mapping, `p_tenant_id` injected from the db and never from input, `good` split into arrays).
  - `tenant-db.spec.ts` gets `rpc` cases.
  - `server-guards.spec.ts`: extend "finds the server sources" to expect the five production route files, so rule (a) and rule (d) demonstrably run over them.

### 3.7 Tasks

Order: contract → DB → server → FE. **FE can start F1–F4 as soon as B1 lands**, stubbing responses from the §3.3 types until B7 is live. F5+ want B7.

- [x] **B1 [BE] (contract; unblocks FE)** `shared/types/api.ts` additions (§3.3), `shared/constants/production.ts` (`PRODUCTION_FIELDS`, `PRODUCTION_MESSAGES`, `MAX_EGGS_PER_LINE`), `shared/utils/local-date.ts` + spec, `shared/schemas/production.ts` + spec.
- [x] **B2 [BE]** Migration M4 `sizes`: table, constraints, indexes, grants/RLS, `app.seed_default_sizes` + tenants trigger + backfill.
- [x] **B3 [BE]** Migration M5 `production`: `production` + `production_submissions`, constraints, indexes, triggers, grants/RLS.
- [x] **B4 [BE]** Migration M6 `production_functions`: `app.assert_tenant`, `app.production_days_json`, the four public RPCs with the SQLSTATEs, and grants/revokes.
- [x] **B5 [BE]** pgTAP: registry rows, 010 additions, 020 named cases, 030 provisioning-seeds-sizes, the new 040, and 090 m8–m10. `bun run test:db` passes.
- [x] **B6 [BE]** `bun run db:types`; `TenantDb.rpc` in `server/utils/db.ts` + `tenant-db.spec.ts` cases; `memberships`/`tenants` repositories embed and sort sizes (`FarmSummary.sizes`); check `/api/me` returns them.
- [x] **B7 [BE]** `server/repositories/production.ts` + `mapProductionDbError` + `production-repo.spec.ts`; `zodFields` helper; the five routes; extend `server-guards.spec.ts`. Verify end to end against the local stack (the AC3 example, AC8 add, replay, 404s, a foreign size id, `?tenant_id=` ignored).
- [x] **F1 [FE]** `shared/utils/quantity.ts` + spec; `app/utils/day-label.ts`, `production-range.ts`, `size-colors.ts` (+ specs for the pure ones); `useFarm.ts`.
- [x] **F2 [FE]** `primaryAction` page meta + `usePrimaryAction` + layout button/FAB/padding/toaster offset (AC1, AC31, AC32).
- [x] **F3 [FE]** `QuantityInput.vue` (validate-not-clamp, steppers, keypad attributes, 44px).
- [x] **F4 [FE]** `shared/schemas/production-form.ts` + spec; `ProductionForm` + `ProductionFormOverlay` (Drawer/Modal), the discard dialog, the AC8 note, the live total; `useProductionMutations().log` + `production-errors.ts` + spec; the retry rule (AC2–AC14).
- [x] **F5 [FE]** `useProductionDays`; page states (loading, first use, empty range, load failure, refetch failure toast); `ProductionDayCard` (AC15–AC18, AC27–AC30).
- [x] **F6 [FE]** `ProductionFilters` (chips, range, Clear, validation, "Show last 30 days"/"Clear dates") (AC19).
- [x] **F7 [FE]** `ProductionTrendChart` (series per size by colour slot, Rejects red, label thinning, 1-day case, tooltip, empty state, a11y) (AC20, AC38).
- [x] **F8 [FE]** Edit day (pre-fill via `useProductionDay`, replace, the AC24 route to delete) and Delete day dialog; `not_found` handling (AC22–AC26).
- [x] **F9 [FE]** Post-save behaviour (patch the list, expand, scroll, highlight, switch the range when out of filter per Q1), toasts, dark mode/contrast, the 375px pass, and a farm with 24 per tray and one with 6 sizes (AC6, AC7, AC31–AC33, AC36, AC38).

### 3.8 Decisions

- **D1 Sizes are a tenant table referenced by `size_id`, not a text value or an enum.** This follows owner decision 2 and D10. A rename then changes past days' labels (AC39), a retire is a timestamp (AC41), and sales can reference the same rows. Rejected: a Postgres enum (global to all farms, and it can't be per-tenant); `text` names on production rows (a rename would rewrite history or split it); a `jsonb` list on `tenants` (no FK, so production couldn't be proven to use the farm's own sizes).
- **D2 Composite FK `(tenant_id, size_id) → sizes (tenant_id, id)`.** A plain FK on `size_id` would accept another farm's size id: an FK check isn't subject to RLS. The composite key makes a cross-farm reference impossible at the storage level. `ON DELETE NO ACTION` (not `RESTRICT`) so a whole-tenant cascade still works.
- **D3 Seeding by trigger on `tenants` insert + a migration backfill.** Every creation path, including test helpers and future sign-up, gets the list, and provisioning code doesn't change. Rejected: seeding inside `provision_farm` (misses other paths); an app-side "if no sizes, create them" (a write inside a read, and a race).
- **D4 One aggregate row per (farm, date, quality, size), and "add" is an upsert.** AC8 wants each size shown once with its total, and "several collections as separate items" is out of scope. Aggregate rows make Edit (replace) exact and keep reads trivial. Rejected: append-only rows per Save (an audit trail nobody asked for, more rows per day, and Edit would still have to collapse them). If per-collection history is ever wanted, it's an additive `production_entries` log.
- **D5 Writes are `security invoker` functions called through `TenantDb.rpc`, which injects `p_tenant_id` and has it asserted in SQL.** This is the architecture spec's rule for multi-statement atomic writes, and it keeps "RLS **and** the repository filter". Rejected: several supabase-js calls from Nitro (not atomic, so AC13 would fail); `security definer` (bypasses RLS; the 010 guard forbids it).
- **D6 Idempotency ledger (`production_submissions`) keyed `(tenant_id, submissionId)`.** It's needed only for "add", because replace and delete are idempotent by nature. It stores `had_before` so a replay reports the same "Logged/Added" outcome. Retry rule: same payload → same id; changed payload → new id (§3.4).
- **D7 Future dates: the device decides "today", and the server enforces a backstop of `UTC today + 1`.** The latest local date anywhere on Earth is at most UTC + 1 day (UTC+14), so a real local "today" is never rejected, including the 9 pm case (AC11, UX data need 8). The exact "not after *my* today" check is in the form. Rejected: trusting a client-sent `today` (it adds nothing, since the client already sends the date); a per-farm time zone setting (new settings UI, not in v1; revisit with the Dashboard if server-side "today" is ever needed).
- **D8 No ledger pruning in v1.** It's about one small row per Save. A later cron (outside a request handler) can delete entries older than 30 days.
- **D9 Per-line cap of 1,000,000 eggs (about 33,000 trays at 30).** This is integer-safety, so repeated adds can't overflow `integer`. It isn't the PM's deferred "that's a lot of trays" warning (Q3), and no owner would hit it.
- **D10 Sizes ride on `/api/me` (`FarmSummary.sizes`).** The form opens with no spinner (UX data need 1), and `ctx.farm.sizes` is available server-side at no extra query. Cost: a handful of rows on every tenant request. Rejected: a separate `GET /api/sizes` (an extra round trip before the first open).
- **D11 One read RPC returning a single `jsonb` value.** PostgREST's `max_rows = 1000` would silently truncate a row-returning query over long "To only" ranges (5 sizes × 200+ days). Aggregating to days in SQL returns one value, and `hasAny` comes in the same round trip. `GET /days/:date` returns `day: null` rather than 404, because an empty date is a normal answer for the AC8 note.
- **D12 Hand-drawn SVG chart, no chart library.** The design is polylines, dots and labels, and a library adds weight and theming work. UX allowed either.
- **D13 Client-only data fetching on Production.** Ranges depend on the device's date, and SSR can't know it. SSR shows the skeleton (AC29 is satisfied by design).
- **D14 Owners can't write `sizes` in 01** (no grant, no policy). Sizes are read-only until "Farm settings: sizes". QA changes sizes as postgres in local Studio, which AC37 anticipates.
- **D15 Column names `produced_on` and `eggs`** rather than `date` and `count`, which shadow a type and an aggregate in SQL. The unit is in the name.
- **Doc updates done by the architect:** `docs/egg-farm-app-architecture-spec.md` §3 "As built" (the `TenantDb.rpc` + `p_tenant_id` assertion pattern; `bun run test:db`), §5 (the per-farm `sizes` table, the Production shape and key, unsized rejects only, the sales size reference) and §9 ("Categories as data" + the nullable `size_id`). The D2 conflict (`large/reject/5`) is removed.
- **Proposed `CLAUDE.md` wording (NOT edited, for the team lead to put to the user):**
  1. Replace "Categories are data, not columns. Size, quality, and fulfillment type are column values; never add columns like `large_count`." with: "Categories are data, not columns. **Egg sizes are per-farm rows in `sizes`** (ordered, with a stable colour slot, retired with `archived_at`, never deleted) referenced by `size_id`; quality and fulfillment type are column values. Never add columns like `large_count`, and never hardcode the size list."
  2. Replace "Production rows are `(date, size, quality, count)`. Rejects have `size = null` and `quality = reject`, and they never enter inventory or sales." with: "Production rows are `(produced_on, size_id, quality, eggs)`, one row per farm, date, quality and size; logging a date again adds to it. **Rejects are always unsized**: `size_id` is null exactly when `quality = reject` (check constraint), and they never enter inventory or sales. A production or sale row's size must belong to the same farm (composite FK on `(tenant_id, size_id)`)."
  3. In "Null values carry meaning", replace "`size` (reject)" with "`size_id` (reject)".
  4. Add under "Tenancy and security": "Multi-row writes are `security invoker` Postgres functions called through `TenantDb.rpc`, which passes `p_tenant_id` from the server context; each function asserts it equals `app.current_tenant_id()`."

### 3.9 Open questions / pushback

1. **AC11 (note, no conflict):** the server's future-date guard is `UTC today + 1`, not the owner's exact local today (D7). A request built by hand, not from the form, could log "tomorrow" by up to a day in the owner's own farm. That's no cross-farm risk. The form enforces AC11 exactly.
2. **AC35 "only the farm's own current sizes" (note):** the RPCs enforce "active size". A direct PostgREST insert with the owner's JWT could still use an *archived* size of the owner's own farm. In 01 no size can be archived, so this can't happen yet. **The "Farm settings: sizes" feature must add a `before insert or update` trigger on `production`** (active size, or already on that day) when it introduces archiving.
   - **Update (security audit M1, owner decision 2026-09-25): done in feature 01.** Migration `production_bounds` adds the `production_bounds` trigger (active size, the future-date backstop and the per-line cap) plus `production_eggs_range check (eggs between 1 and 1000000)`. "Farm settings: sizes" no longer needs to add it. See §4 [BE].
3. **Long "To only" ranges (performance note):** a range covering years returns every day in one payload (about 150 bytes a day, so 5 years ≈ 270 KB) and renders every card. That's fine for v1. If it gets slow, add paging with a "Show older" control; that needs a UX pass.
4. **UX Q-level detail for FE:** the toaster offset above the FAB depends on `UApp`'s `toaster.ui` accepting a reactive viewport class in 4.11. If it doesn't, the FE records the fallback in §4.

## 4. Implementation notes (Devs)
- [BE] what was built, files, deviations from design (and why)

**[BE] B1: shared contract (2026-09-25)**
- `shared/types/api.ts`: added `FarmSize`, `FarmSummary.sizes`, and all §3.3 production types (`IsoDate`, `ProductionSizeAmount`, `ProductionDay`, `ProductionDaysResponse`, `ProductionDayResponse`, `ProductionAmounts`, `LogProductionRequest`/`Response`, `ReplaceProductionDayRequest`/`Response`, `DeleteProductionDayResponse`) exactly as §3.3. `ApiErrorCode` unchanged.
- `shared/constants/production.ts`: `PRODUCTION_FIELDS`, `MAX_EGGS_PER_LINE` (1,000,000), `PRODUCTION_MESSAGES` (§2.5 copy; `looseTooHigh(eggsPerTray)` is a function so the tray size is never hardcoded).
- `shared/utils/local-date.ts`: `todayLocal`, `todayUtc`, `maxLoggableDate`, `addDays`, `compareIsoDates` as §3.3, plus `isIsoDate` (the real-calendar-date check the schema uses). All arithmetic is on UTC midnights. `addDays`/`compareIsoDates` throw `RangeError` on an invalid date.
- `shared/schemas/production.ts`: `isoDateSchema`, `eggCountSchema`, `productionAmountsSchema`, `logProductionBodySchema`, `replaceProductionDayBodySchema`, `productionRangeQuerySchema` as §3.3, plus inferred types.
- Tests: `tests/unit/local-date.spec.ts` (21:00 local = still today, east-of-UTC mornings, month/year/leap/DST boundaries, `maxLoggableDate` never below any zone's local today) and `tests/unit/production-schemas.spec.ts` (all API schemas, smuggled `tenant_id` stripped, and type-level checks that the schema outputs satisfy the §3.3 request types).
- Deviations and small additions:
  - `server/repositories/tenants.ts` `toFarmSummary` returns `sizes: []` (marked TODO B6), so typecheck stays green now that `FarmSummary.sizes` is required. **Until B6 lands, `/api/me` returns an empty size list**; the FE should stub sizes.
  - Added `MAX_SIZE_LINES = 100` to the constants (the §3.3 `.max(100)` on `good`, named instead of inlined).
  - Added messages not in §2.5 copy for server-only cases the form can't produce: `tooLarge` (over `MAX_EGGS_PER_LINE`) and `duplicateSize` (same size twice, on `amounts`). Also added `saveFailed`/`editSaveFailed`/`deleteFailed` from §2.5 so all production copy is in one place.
  - Added `productionDayParamsSchema` (`{ date: isoDateSchema }`) for the three `/days/:date` routes (§3.3 says they validate the `date` param but didn't name a schema).
  - The future-date backstop is a refine on the `date` field rather than on the object. Same rule (`date <= maxLoggableDate(now)`), and it still reports on `date`.
  - `productionRangeQuerySchema` treats an empty value (`?from=`) as not set.
  - Invalid dates use the `dateRequired` copy ("Pick a date.").
  - `isoDateSchema`'s calendar refine uses `abort: true`. zod 4 keeps running later checks after a failed one, so without it `2026-02-30` reached `compareIsoDates` and threw. A test covers this.
  - Per-size count errors come out at zod path `good.<index>.eggs`. Mapping that to `PRODUCTION_FIELDS.good(sizeId)` is `zodFields`' job (B7).

**[BE] B2–B7: database, repository, routes (2026-09-25)**
- Migrations:
  - `supabase/migrations/20260925082652_sizes.sql` (M4): `sizes`, `app.seed_default_sizes`, the `seed_default_sizes` trigger on `tenants`, and the backfill.
  - `supabase/migrations/20260925082655_production.sql` (M5): `production` and `production_submissions`.
  - `supabase/migrations/20260925082700_production_functions.sql` (M6).
  - Columns, constraints, indexes, grants and policies are exactly §3.1/§3.2.
- M6 functions: `app.assert_tenant`, `app.production_days_json`, and the four public RPCs, all `security invoker`, `set search_path = ''`, with the SQLSTATEs TM001–TM006. Execute is revoked from `public` and `anon` and granted to `authenticated`.
- pgTAP:
  - `000_helpers.sql`: registry rows for `sizes`, `production` and `production_submissions`, as §3.6.
  - `010`: +4 assertions. The RPCs are invoker, not executable by anon, and executable by authenticated. The `app.*` helpers aren't executable by anon, and size seeding isn't executable by authenticated.
  - `020`: +13 named cases. TM006 on all four RPCs with B's tenant, B's rows unchanged, TM001 via the RPC and 23503 on a direct insert with B's size, A sees exactly its 4 sizes and none of B's, and anon gets 42501 on all four RPCs.
  - `030`: +1. `provision_farm` gives the new farm the 4 sizes.
  - New `040_production.test.sql` (49 assertions) covers the whole §3.6 list.
  - `090`: m8–m10, QA's m11, m12 (added in QA round 1) and the extended policy list.
- B6:
  - `shared/types/database.types.ts` regenerated.
  - `server/utils/db.ts`: `TenantDb.rpc(fn, args)`. `fn` is typed to the public functions whose args include `p_tenant_id`, `args` is `Omit<Args, 'p_tenant_id'>`, a smuggled `p_tenant_id` is dropped, and the function returns `{ data, error }`. Tests are in `tests/unit/tenant-db.spec.ts`.
  - `server/repositories/tenants.ts`: `toFarmSummary` maps and sorts sizes by `sortOrder`, `name`, `id`, with `active = archived_at is null`. `FARM_SUMMARY_COLUMNS` holds the select string.
  - `server/repositories/memberships.ts` embeds `sizes (…)` in its one existing query. `/api/me` now returns `farm.sizes`; the end-to-end run confirmed it.
- B7:
  - `server/repositories/production.ts`: the five repository functions, zod parsing of the jsonb results, and `mapProductionDbError`.
  - `server/utils/errors.ts`: `zodFields(error, input)` (maps `good.<index>.*` to `good.<sizeId>`, and to `amounts` when no size id is usable) and `validateInput(schema, input)` (400 `validation_failed` with fields).
  - Routes: `server/api/production/days.get.ts`, `days/[date].get.ts`, `days/[date].put.ts`, `days/[date].delete.ts` and `entries.post.ts`, all on `defineTenantHandler`.
  - Tests: `tests/unit/production-repo.spec.ts`, and `tests/unit/server-guards.spec.ts` now expects the five route files.
  - Checked end to end against the local stack (dev server plus two provisioned farms, 23/23 checks): the AC3 example, AC8 add, replay, `?tenant_id=` ignored, `day: null`, the 400 field keys, a foreign size id giving `sizes`, edit to 464, the 404s on edit and delete, B deleting A's date giving 404, and signed-out giving 401.
- Deviations and additions:
  - **090 m10: corrected after QA round 1 (S2).** My original reason for replacing §3.6's `production_update with check (true)` was **wrong**. Postgres checks the new row of an UPDATE against the SELECT policy only when the statement reads columns: a column-referencing WHERE, SET or RETURNING. The checker's old check 8 used `where tenant_id = <own>`, so the SELECT policy hid the weak WITH CHECK. A plain `update public.production set tenant_id = '<B>'` did move A's reject rows into B.
    - QA changed check 8 (`update_into_victim`) to attack with `where true` and added **m11** (the architect's original mutation), which is now detected. m10 (RLS disabled on `production`) is kept as an extra mutation. I reviewed QA's change and it's correct.
    - **The same blind spot was in check 5 (`delete_victim`).** On the local stack, with `production_delete using (true)`, A's `delete from public.production where true` returned `ok:2` and removed B's row, yet every checker check passed. Fix:
      - A new check 9, **`delete_all`**, in `tests.isolation_checks` runs `delete from <t> where true` as the attacker. It passes only when the delete is denied (42501) or removes no more rows than the attacker owns.
      - It runs through the new `tests.try_as_rolled_back`, which always rolls the delete back, so the attacker's own seed rows survive.
      - `tests.isolation_check_count` is now 9 per table.
      - New 090 **m12** (`production_delete using (true)`) is detected.
    - **Check 4 (`update_victim`): corrected after QA round 2 (R2-1).** I originally wrote that it had "no exploitable gap". **That was wrong.** I only tried an update that left `tenant_id` alone. With `production_update using (true)` and the real WITH CHECK, `update public.production set tenant_id = '<own>'` passes the WITH CHECK and pulls the victim's rows into the attacker's farm. Check 4's column-referencing WHERE hides it, and check 8 sets the victim's id rather than the attacker's.
      - QA added **check 10 `update_steal`** (`update … set <col> = <own> where true`, rolled back, 42501 or no more rows than the attacker owns) and **090 m13**. `isolation_check_count` is now 10.
      - I reviewed both and they're correct. On the tables without update grants (`tenants`, `memberships`, `sizes`, `production_submissions`) the check gets 42501. On `production` with the real policies it only touches the attacker's own rows and is a no-op on them, and it's rolled back regardless.
      - **Registry seed for `production` changed to an unsized reject row** (QA's optional suggestion, done slightly differently). Simply *adding* a reject row wasn't enough: I tried it, and the victim's sized row still failed the composite size FK (23503), which aborts the whole statement, so no rows ever showed as moved.
        - The seed is now one reject row per farm.
        - Its date is `2026-01-02 + (rows so far)`, so two farms' seed rows never share a `(date, quality)` key (a move would otherwise hit 23505) and never collide with the insert-attack row on 2026-01-01.
        - Now m13 shows `update_steal … [got ok:2, attacker owns 1]` and m11 shows moved rows instead of an FK error.
        - Sized rows and the composite FK remain covered by the 020 named cases (TM001 and 23503 with B's size) and by 040.
    - **Real policies confirmed** from `pg_policy` on the local stack:
      - Every INSERT policy (`production_insert`, `production_submissions_insert`) has `with check (tenant_id = (select app.current_tenant_id()))`.
      - `production_update` has the same expression in both USING and WITH CHECK.
      - Tables with no write policy (`tenants`, `memberships`, `sizes`, and updates/deletes on `production_submissions`) have no write grant either.
  - **Extra private helpers in M6:**
    - `app.production_day_json(tenant, day)`: one day or null.
    - `app.check_production_input(...)`: the shared TM002/TM005/TM004 validation for log and replace.
    - `app.lock_production_day(tenant, day)`: the advisory lock.
    - All three are invoker, revoked from `public`, granted to `authenticated`, and covered by the 010 anon check.
  - **TM005 cases:** `log_production` also raises TM005 for a null `p_submission_id`. A null `p_day` raises TM002 (log/replace) or TM003 (delete).
  - **Replay of a deleted day:** if the date was deleted between the original save and the replay, `log_production` returns an empty day (`good: [], goodTotal: 0, rejects: 0`) instead of null. That keeps `LogProductionResponse.day` non-null as the contract requires.
  - **`seed_default_sizes` uses a bare `on conflict do nothing`** instead of targeting the name index. It also skips an existing colour slot, so a re-run never errors.
  - **Trigger limit:** the seeding trigger is invoker, as §3.1 says. A direct `insert into tenants` as `service_role` (not `postgres`) would fail, because `service_role` has no usage on `app`. No code path does that: provisioning goes through `provision_farm` (security definer, owned by postgres).
  - **Error mapping additions:** `mapProductionDbError` also maps `22003` (an integer overflow from repeated adds) to 400 `amounts` with `tooLarge`, and `23503` to `sizes` rather than a generic 400. TM005 and 23514 use a new `PRODUCTION_MESSAGES.invalidAmounts` ("Check the amounts and try again.").
  - **`getProductionDay`** calls `production_days` with `from = to = date`. §3 named no separate RPC for it.
  - **`validateInput(schema, input)`** is used instead of h3's `readValidatedBody`/`getValidatedQuery`, because h3's helper throws an error without our `fields`. The handlers call `readBody` / `getQuery` / `getRouterParams(event, { decode: true })` and then `validateInput`.

**[BE] Security audit M1: table-level bounds (2026-09-25, owner decision)**
- **Finding:** direct PostgREST writes to `production` (the owner's JWT and the publishable key, own farm only) skipped every server-side bound. For example, `produced_on = 2999-01-01, eggs = 2147483647`, and a line at 2^31−1 made every later add fail with 22003.
- **New migration `supabase/migrations/20260925131758_production_bounds.sql`** (the three earlier ones are untouched):
  - `production_eggs_positive` is replaced by **`production_eggs_range check (eggs between 1 and 1000000)`**, equal to `MAX_EGGS_PER_LINE`. Both places note the link, and a unit test in `production-schemas.spec.ts` reads the migration and asserts the values match.
  - **`app.production_bounds()` trigger** (`before insert or update`, security invoker, `search_path = ''`, not executable by anon):
    - **TM002** when `produced_on` is after UTC today + 1: the same backstop as the RPCs.
    - **TM007** (new SQLSTATE) when `eggs` is over 1,000,000. This fires first; the check constraint is the backstop. It also catches an add that pushes a day's line past the cap, which replaces the old 22003 overflow.
    - **TM001** when a good row's size isn't active (archived, or not the farm's).
  - **Archived sizes on UPDATE (decision):** the active-size rule applies to a *new line*, not to an existing one. That keeps AC41 (retiring a size must not strand past days) and still lets Edit day correct those days.
    - On INSERT, the size must be active, unless the farm already has a good row for that size on that day (the insert is an upsert into the existing line).
    - On UPDATE, the size must be active only if the row's size, **date**, quality or tenant changes. Correcting the count on a since-archived size's line is allowed.
    - **QA round 3 (R3-1) fix:** the date (`produced_on`) was originally missing from that list. The owner could move an archived size's line to another day (`update … set produced_on = …`), creating a new line there. It's now included, in the same uncommitted migration.
      - `replace_production_day` never changes `produced_on`: its upsert conflicts on the same day and sets only `eggs`, and the delete is by day. So Edit day on a day holding an archived size still works; the existing 040 case "an archived size already on the day is accepted on edit" still passes.
  - **`replace_production_day` redefined** (`create or replace` in the new migration). It now deletes only the removed lines and upserts the kept and new ones with `set eggs = excluded.eggs`, instead of delete-all + insert. With the trigger, re-inserting a since-archived size as a brand-new line would be refused. The contract, the SQLSTATEs, idempotency and one-transaction atomicity are unchanged.
  - The RPCs keep their own checks, which run first with the same codes.
- **Error mapping:** `mapProductionDbError` maps **TM007 → 400 `amounts`, `tooLarge`**. TM001 → `sizes` and TM002 → `date` already applied. 22003 stays mapped as an unreachable backstop. The unit test is in `production-repo.spec.ts`.
- **pgTAP:**
  - `040` has 12 new assertions (61 total). As the owner (authenticated), direct inserts are rejected for a future date (TM002), over the cap (TM007) and a new line of an archived size (TM001). Direct updates are rejected over the cap, to a future date, when switching to an archived size, and when moving an archived size's line to another day (R3-1).
  - In the same block, valid direct inserts (a good line at exactly the cap, a reject row) are still accepted, and correcting an existing archived-size line's count is allowed.
  - An RPC add that would push a line past the cap raises TM007, and with the trigger disabled the check constraint gives 23514.
  - `020`: a direct insert with B's size now fails first in the trigger (TM001). A new case disables the trigger and proves the composite FK alone still refuses it (23503).
  - `010`: `app.production_bounds()` is in the "not executable by anon" list.
- **Verified against PostgREST:** the auditor's request (`POST /rest/v1/production` with `produced_on 2999-01-01, eggs 2147483647`) now gets 400 `TM002`, the same with a past date gets 400 `TM007`, and a valid direct insert still gets 201.
- **Docs:** §3.9 item 2 (the trigger now ships in 01, so "Farm settings: sizes" doesn't need to add it). Architecture spec §5 Production: the `eggs` bound and the trigger rules.
- [FE] what was built, files, deviations from design (and why)

**[FE] F1–F9 (2026-09-25)**
- **Shared helpers (F1).**
  - `shared/utils/quantity.ts`: `toEggs`, `splitEggs`, `formatQty`, `formatLabelledQty`. This is the only trays↔eggs code; the form, cards, chart, notes, dialogs and toasts all use it.
  - `app/utils/day-label.ts`: `formatDayLabel`, `formatDayPhrase`, `formatDateHint`, `formatShortDate`, `dayParts`. They format in UTC, so the device's time zone never shifts a date.
  - `app/utils/production-range.ts`: `rangeFor`, `validateRange`, `hasDateRange`, `isInRange`, `RANGE_CHIPS`.
  - `app/utils/size-colors.ts`: `SIZE_PALETTE`, `sizeColor`, `REJECT_COLOR`.
  - `app/composables/useFarm.ts`: `eggsPerTray`, `sizes`, `activeSizes`, `sizeById`, `refreshSizes`.
- **Primary action (F2).**
  - `app/types/page-meta.d.ts` gains `primaryAction`.
  - `app/composables/usePrimaryAction.ts` is generic (`action`, `hasFab`, `hidden`, `fabVisible`, `trigger`, `onPrimaryAction`).
  - `app/layouts/default.vue` renders the top-bar button at md+ (44px below lg), a 52px FAB below md above the tabs, and the extra 84px bottom padding.
  - `app/app.vue` raises the toaster viewport above the FAB on mobile. `UApp`'s `toaster.ui.viewport` works in 4.11.2, so no fallback was needed.
- **Quantity input (F3).** `app/components/QuantityInput.vue`.
- **Form (F4).**
  - Schema: `shared/schemas/production-form.ts` (`createProductionFormSchema`, `toProductionAmounts`, `createProductionFormState`, `isEmptyAmounts`, `PRODUCTION_FORM_PATHS`).
  - Components: `app/components/ProductionForm.vue`, `ProductionFormOverlay.vue`, `ConfirmDiscardDialog.vue`.
  - Composables: `app/composables/useProductionMutations.ts` (`log`, `replace`, `remove`, with an in-flight guard) and `useProductionDay.ts` (AC8 note lookup, debounced and silent).
  - Errors and copy: `app/utils/production-errors.ts` (`mapProductionError`) and `app/utils/production-copy.ts`. The copy file holds the UI-only §2.5 strings (titles, toasts, dialogs, states). Validation and save-error text still comes from `PRODUCTION_MESSAGES`.
- **List (F5–F8).**
  - `app/composables/useProductionDays.ts`.
  - `app/pages/production.vue`, which replaces the placeholder.
  - Components: `ProductionDayCard.vue`, `ProductionFilters.vue`, `ProductionTrendChart.vue` (pure maths in `app/utils/production-chart.ts`), and `ProductionDeleteDialog.vue`.
- **Post-save behaviour and toasts (F9)** are in the page: patch the list, expand the card, scroll it into view, highlight it, and switch the range per Q1.
- **Tests:** `tests/unit/quantity.spec.ts`, `day-label.spec.ts`, `production-range.spec.ts`, `size-colors.spec.ts`, `production-form.spec.ts` (at 30 and at 24 per tray), `production-errors.spec.ts` and `production-chart.spec.ts`. `bun run test:unit` gives 218 passed across 17 files. `bun run typecheck` and `bun run lint` are both clean.
- **Checked in a browser** against the local stack and real routes: headless Chrome through a scratch Playwright script (not added to the repo), at 375px mobile and 1280px desktop, on two throwaway local farms (`fe30@test.local` at 30 per tray, `fe24@test.local` at 24). All 36 checks passed, with no page or console errors:
  - **First use:** the empty state shows.
  - **FAB:** it shows, and it hides while the sheet is open.
  - **Validation:**
    - With nothing entered, the form shows "Enter at least one amount."
    - A loose value of 35 isn't clamped. The field shows the message, and the loose + stepper is disabled at the max.
    - Inputs have `inputmode="numeric"`. Inputs and steppers are 44px. The sheet has no horizontal scroll.
    - Tapping + on a blank field gives 1.
  - **AC3 example:**
    - The live total reads "Good: 16 trays + 14 · Rejects: 5 eggs".
    - Cancel opens the discard dialog, and Keep editing keeps the values.
    - Save shows the toast "Logged today's production".
    - The card reads "Today · Sep 25 · 16 trays + 14 · Rejects: 5 eggs" and is expanded with the lines in size order.
  - **AC8:** the "adds to" note appears. Adding Large 2 trays + 6 gives "Large 11 trays" on one card, and the toast says "Added to…".
  - **Backdated save outside Week:** Jun 10, 2025 switches the range to that date (Q1), and Clear returns to the chip.
  - **Edit:** the form is titled "Edit production" and is pre-filled with Large 11. Changing it to 10 replaces the day.
  - **Delete:** the dialog reads "Delete today's production?". Delete removes the card, the empty-range text shows, and the toast confirms.
  - **Desktop:** the Add button shows. Small trays is autofocused and Enter moves to the next field. At 24 per tray, the loose message reads "under 24", and 1 tray + 5 shows as "1 tray + 5". Dark mode was checked by eye.
  - **6-size farm (AC38):** the test farm's sizes were set to Peewee, Small, Medium, Large, Extra Large, Jumbo in SQL.
    - The form shows 6 lines in that order.
    - Peewee 1 tray + Extra Large 12 + Large 2 trays gives a total of "3 trays + 12". The expanded card lists Peewee first and Extra Large between Large and Jumbo.
    - The legend has 7 entries with 7 distinct computed colours.

    The test data and sizes were restored afterwards.
- **Not verified:** a real phone (iOS Safari / Android Chrome keypad behaviour, AC5), the 60-second timing (AC4), the network-failure and retry paths (AC13), the load-failure and refetch-failure states (AC30), the tooltip by touch, the 768–1023px sidebar states, and a screen reader.
- **Deviations:**
  - **Overlay:** one `UModal` for all sizes, not `UDrawer` below md. It's styled by breakpoint classes as the design's bottom sheet on phones (full width, top corners 16px, max 88dvh, slide-up) and a centred 520px dialog at md+. This is UX's documented fallback. `UDrawer` with `dismissible: false` can't be swiped closed anyway, and vaul repositions itself around the on-screen keyboard. So there's **no swipe-down gesture**. ✕, Cancel, an overlay tap and Esc all go through the discard check (`dismissible: false` + `close:prevent`).
  - **Keyboard (AC5):** instead of `interactive-widget=resizes-content`, the sheet follows `visualViewport` (CSS vars `--sheet-kb` / `--sheet-vvh`, set only while it's open). The pinned footer (Save) then sits above the keypad on iOS and Android, and the focused field scrolls to the centre. This isn't verified on a real device.
  - **Steppers:** `QuantityInput` renders its own − / + buttons in a `UFieldGroup` with `UInputNumber` (`:increment="false" :decrement="false"`). In reka 2.10, the built-in + turns a blank field into `min` (0) rather than 1, and it can't take `tabindex="-1"` cleanly. The loose field has no `max` prop (validate, don't clamp).
  - **Live values:** reka's NumberField commits a typed value only on blur or Enter. `QuantityInput` also parses each `input` event, so the live total, the discard check and Save always match what's on screen.
  - **Errors on each input:** each trays/loose input is its own `UFormField` (`lines.<sizeId>.trays|loose`, `rejects.*`), so only the offending input gets the error ring. Their messages are screen-reader-only (`aria-describedby`). The visible message is shown once under the row.
  - **Validation timing:** field messages appear on blur/change and clear as soon as the field is valid (UX States). This doesn't use `useSubmitValidation`'s "only after submit" timing. "Enter at least one amount." shows only after Save and clears once anything is entered.
  - **Server field mapping:**
    - `good.<sizeId>` marks that size's trays input, and `rejects` marks rejects trays. The server works in eggs, so it can't say which of the two fields is wrong.
    - An unmapped key (e.g. `submissionId`) shows the generic "Couldn't save…" message.
    - `sizes` shows "Your sizes have changed…" and re-reads `/api/me`.
  - **Fetching:** `useProductionDays` fetches in `onMounted` with a sequence guard, rather than `useAsyncData({ server: false })`. The result is the same (client-only, SSR shows the skeleton), with explicit `loading` / `refreshing` / `error` status.
  - **Edit pre-fill** uses the day already in the list, not a fresh `GET /days/:date`, so the form opens instantly. If the day was deleted elsewhere, Save gets a 404: the app shows the toast "That day was already deleted.", refreshes the list and closes the form.
  - **Desktop rows:** at 520px the design's one-line row only fits with a 6rem size column, `w-8` inline labels and 48px number boxes (lg size). Below lg (phones and tablets) the size name sits above two side-by-side 44px steppers (O2), under a "Trays / Loose" header shown once.
  - **Chart:** dots, labels and the tooltip are HTML positioned by percentage over the stretched SVG, so the dots stay round. The tooltip also works with keyboard focus and ←/→. With one day in range, the chart shows dots only (a single point has no line).
  - **Toasts** use the existing Nuxt UI toast styling from feature 00. The FAB's `aria-label` "Log production" is also the first-use button's label. The `primaryAction` strings are literals in `definePageMeta`, because the macro can't reference imports.

**[FE] QA round 1 fixes (2026-09-25)**
- **S1 ("today" went stale overnight).**
  - New `app/utils/today-tracker.ts` (`createTodayTracker(now)`). It's pure, with an injectable clock, and `refresh()` returns true when the local date rolled over.
  - `useProductionDays` holds one tracker and exposes `syncToday()`. It updates `today` and, when the date changed, silently reloads the list, so Week/Month and "From only" move to the new day.
  - `syncToday()` runs on `visibilitychange` (visible), on window `focus`, and in `production.vue` when Log or Edit opens. The form therefore always gets the current date as its default, its `max` and its future-date limit. The toasts, the "Today · …" card label and the delete title follow the same `today`.
  - Test: `tests/unit/today-tracker.spec.ts`, covering 21:00 → 23:59 (no change) → 06:30 the next day (change reported once), and the Week range moving with it.
- **N4 (no client timeout on writes).**
  - `useProductionMutations` passes `timeout: PRODUCTION_WRITE_TIMEOUT_MS` (20 s) to the POST, PUT and DELETE calls.
  - A timed-out request is a `FetchError` with no status, so `mapProductionError` treats it as `network`. The form then shows "Couldn't save…" with the values kept and Save active again.
  - A retry of the same payload reuses its `submissionId`, so a request that landed late is replayed, not added twice.
  - Test: `production-errors.spec.ts` gained a case with a real ofetch timeout against a local server that never responds.
- **Checked in the browser** (headless Chrome, `ctx.clock`), 10/10 checks passed.
  - The page opens at 21:00 the previous evening, then the clock moves to the next day and the page becomes visible again. "+" then defaults to the new date, and `max` is the new date. Saving it gives no future-date error, the toast "Logged today's production", and a card labelled "Today · …".
  - A hung `POST /entries` (the route is never answered): Save spins. After 20 s (fake timers) the form shows "Couldn't save. Check your connection and try again.", keeps the value, and Save is active again. Unrouting and tapping Save then saves.
  - The fake clock starts the evening *before* the real date and jumps to the real "now". Jumping ahead of the server's clock makes the Supabase session look expired, which is an artefact of the test, not app behaviour.
- `bun run typecheck` and `bun run lint` are clean. `bun run test:unit` gives 221 passed across 18 files.

## 5. QA report (QA)

### Round 3, security M1 (2026-09-25): **Verdict: PASS** (one should-fix)
Scope: the new migration `20260925131758_production_bounds.sql` (the three earlier migrations are untouched), the TM007 mapping, and the new tests. Started clean: `db:reset` then `notify pgrst, 'reload schema'`.

**Trigger and archived-size rule.** I ran probes as the signed-in owner in a rolled-back transaction:
- Direct insert refused: a future date (TM002), 2^31−1 eggs (TM007), and a new line for an archived size (TM001).
- Direct update refused: a move to a future date (TM002) and a count over the cap (TM007).
- Allowed: a valid reject insert, and a count change (upsert "add") on an existing line of an archived size.
- The RPC add of an archived size is refused (TM001). An add that pushes a line past the cap gives TM007 and writes nothing (the line stays at 999,999).
- No stranded past days: after archiving Jumbo, Edit day on a day holding Jumbo changes its count (40 → 45) and can add an active size alongside it.

**Real PostgREST, the auditor's request.** `POST /rest/v1/production` with the owner's JWT returned:
- 400 `TM002` for `2999-01-01, 2147483647`.
- 400 `TM007` for the same count on a past date.
- 201 for a valid row.

**Redefined `replace_production_day` (AC22–AC26).**
- SQL: Small 42 + Large 264 + rejects 5, replaced with Large 234 + Medium 10 + 0 rejects, becomes exactly `Medium=10, Large=234`. A rejects-only replace leaves just `REJ=7`. An over-cap line gives TM007 **after** the delete step, and the day stays unchanged, so it's all-or-nothing. An empty day gives TM003 (404).
- Browser at 375px:
  - AC23: Large 8+24 → 7+24 gives `goodTotal 464`, the toast "Updated today's production" and the card "15 trays + 14".
  - Blanking Small and rejects removes both lines and the badge ("14 trays + 2").
  - AC26: a failed edit shows "Couldn't save your changes…" and the day is unchanged.
  - 40,000 trays is blocked with "That number is too large…".
  - The round 1 script's AC23–AC25 Edit/Delete checks all pass.

**Findings**
- **R3-1 [BE] Should fix: a direct UPDATE can move an archived size's line to another day.** `production_bounds.sql:50-53` re-checks the active size on UPDATE only when `size_id`, `quality` or `tenant_id` changes, not `produced_on`.
  - *Scenario (reproduced):* Jumbo archived, with a line on Sep 2. As the owner, `update public.production set produced_on = '2026-09-06' where size_id = <Jumbo>` returned `ok:1`. Sep 6 now has a Jumbo line it never had, which is the "new line of an archived size" the trigger is meant to refuse.
  - Own farm only, and it can't happen in 01, because owners can't archive sizes yet. That's why it isn't Blocking.
  - *Fix:* add `or new.produced_on is distinct from old.produced_on` to the UPDATE condition. The migration isn't committed yet, so it can go in the same file. Add a 040 assertion.
- **Note:** a direct upsert that *adds* to an existing archived-size line is allowed, by the documented design (count corrections on existing lines).

**Tests run (round 3)**
- `bun run db:reset`: 7 migrations applied cleanly.
- `bun run test:db`: **PASS, 6 files, 255 tests** (243 in round 2, plus BE's M1 cases in 010/020/040).
- `bun run test:unit`: **PASS, 18 files, 223 tests.**
- `bun run typecheck`: exit 0. `bun run lint`: exit 0.
- Browser (scratch, not committed):
  - Regression 62/62 (round 1 main script) and 16/16 (six sizes, filters, chart).
  - New Edit replace script 9/9.
  - The owner-JWT PostgREST probe gave 400/400/201 as expected.
- The dev server is stopped, the DB is reset and the schema cache reloaded. Nothing committed.

### Round 2 (2026-09-25): **Verdict: PASS**
All round 1 findings are resolved, and AC2 now passes, so every AC is ✅ apart from the parts that need a real device (AC4, AC5), which are listed below. There are no Blocking findings. QA found one more gap in the isolation checker and fixed it in tests (R2-1). BE should review that change.

**Round 1 fixes, verified**
- **S1 (AC2) fixed.** `app/utils/today-tracker.ts`. `useProductionDays.ts:77-94` has `syncToday()` on `visibilitychange`/`focus`, and `production.vue:39,47` calls it before opening Log or Edit. Browser test with `page.clock` on a mobile viewport:
  - Log at 21:00 → the card reads "Today · Sep 25".
  - Next day 06:30, open the form: the date input, its `max` and the default are all 2026-09-26, and there's no "adds to" note.
  - Save → `day.date = 2026-09-26`, `hadProductionBefore: false`, toast "Logged today's production". The list shows "Today · Sep 26" at the top and "Sep 25" below.
  - Two days on, a `visibilitychange` alone moves the labels ("Sep 26", "Sep 25"; no stale "Today").
  - Unit tests: `tests/unit/today-tracker.spec.ts`.
  - (One browser check first read "" for the date. That was the empty From filter matched by `.first()`, not the form's input; sampling the form's own input over 0–1.5s showed the new date throughout.)
- **N4 fixed.** `useProductionMutations.ts:26,49-57`: 20s timeout on writes, and `app/plugins/api.ts` sets `retry: 0`. Browser: with a save that never gets a response, Save stays disabled with a spinner, then at **20s** shows "Couldn't save. Check your connection and try again." The values are kept, and the retry sends the **same** submissionId and saves. Unit test in `production-errors.spec.ts`.
- **S2 fixed.** BE kept check 8 and m11. BE's new **check 9 `delete_all`** and **m12** are correct:
  - `tests.try_as_rolled_back` nests `try_as` in a block that always raises and rolls back, so the probe delete never persists.
  - The pass rule (42501, or rows deleted ≤ the attacker's own count) holds against the real policies: 0 baseline failures.
  - m12 is caught by `delete_all` specifically (`ok:2` vs 1 owned).
  - A policy that deleted *only* victim rows could slip under the count rule. That's contrived, and check 5 covers the explicit victim-id form.

**New finding: fixed in tests by QA, needs BE review**
- **R2-1 [BE] BE's "check 4 has no exploitable gap" (§4 [BE] S2 notes) is wrong.** With `production_update using (true)` and the **real** WITH CHECK, owner A runs `update public.production set tenant_id = '<A>'`, which passes the WITH CHECK. It returned `ok:1` and pulled farm B's reject row into A (B's row count went to 0). The checker reported **no** failure: check 4's `where tenant_id = <victim>` hides it, and check 8 sets the victim id, not the attacker's.
  - **QA fix (tests only):** new **check 10 `update_steal`** in `supabase/tests/database/000_helpers.sql`. It runs `update … set <col> = <own> where true`, rolled back. It passes only on 42501 or when no more rows are touched than the attacker owns; any other error, e.g. 23503 from a victim's sized row, counts as detected. `isolation_check_count` is now 10. Added **m13** in `090` (plan 16).
  - Checked: 0 baseline failures on all 5 tables, and m13 is detected by `update_steal` specifically.
  - *BE:* review the change and correct the check 4 bullet in §4.
  - Optional: add a reject row to the `production` seed in the registry so a steal shows up as `ok:n` rather than an FK error.

**Regression (browser, re-run against the round 2 code):** the round 1 main script passed 62/62 (AC1–AC3, AC5–AC14, AC16–AC17, AC23–AC31, AC34–AC35, AC37, plus AC6 at 24 per tray). The six-size/filter/chart script passed 16/16 (AC19, AC20, AC28, AC38) and the geometry script 3/3 (AC1, AC5). No page errors.

**Tests run (round 2)**
- `bun run db:reset`: 6 migrations applied cleanly. `notify pgrst, 'reload schema'` was needed afterwards, as the FE dev noted.
- `bun run test:db`: **PASS, 6 files, 243 tests.** That's 221 in round 1, plus BE's check 9 and m12, plus QA's check 10 and m13.
- `bun run test:unit`: **PASS, 18 files, 221 tests.**
- `bun run typecheck`: exit 0. `bun run lint`: exit 0.
- Browser (scratch, not committed): S1 clock 9/9 real checks (plus the one selector artefact explained above), N4 4/4, regression 62/62 + 16/16 + 3/3.
- Dev server stopped and DB reset afterwards. Nothing committed.

**Still not verified (needs a real device or a person):** real phone keypad and keyboard lift (AC5), the 60-second timing (AC4), the chart tooltip by touch, a screen reader, dark mode by eye, and the sidebar toggle states at 768–1023px. Round 1 notes N1–N3 still stand as notes.

### Round 1
**Verdict: FAIL** (round 1, 2026-09-25). No finding breaks a Blocking review rule. The tenancy, RLS, RPC, unit and size design is sound, and every suite is green. It fails on **AC2**. If the Production screen stays open past midnight (the phone sleeps on it overnight), the Log form defaults to **yesterday**, and the real today is rejected as "a future date" (S1). The morning's collection then gets filed under yesterday, and the toast says "Logged today's production". One small FE fix.

**How this was verified.** Code was traced (file:line below). All suites were run. Headless Chrome (playwright-core in a scratchpad, not added to the repo) ran against `bun run dev` and the local stack, on throwaway farms at 30 and 24 per tray, at 375px, 800px and 1280px. It simulated offline (`abort('internetdisconnected')`), a lost response after commit (`route.fetch()` then `abort`), and delayed responses, and changed the clock with `page.clock`. The first script ran **62/62** checks, the six-size/filter script 16/16, the rename/reorder/tray-size script 3/3, and the geometry script 3/3. The clock script failed both of its checks: that's S1. The DB was reset afterwards, and the dev server was stopped.

### AC results (38 ✅ · 1 ❌ · 2 partially verified)
| AC | | Evidence |
|---|---|---|
| AC1 | ✅ | Browser at 375px: the FAB (52px) bottom is at 732 and the tab bar top at 747, so the FAB sits above the tabs. There's no "Add production" button on mobile. The FAB hides while the sheet is open. The sheet is 375 wide, bottom-aligned, and 714/812 = 88% of the height. At 1280px, "Add production" is in the top bar, there's no FAB, and the dialog is centred (503px ≤ 520). Only `production.vue:13` declares `primaryAction`. |
| AC2 | ❌ | The fields and order are right. All 10 quantity fields start empty (placeholder 0). The date = local today on a fresh load, including at 21:00. **But once the page has been open past midnight, the date defaults to yesterday** (`page.clock`: 21:00 → next day 06:30 gives form date 2026-09-25 while the device date is 2026-09-26). See S1. |
| AC3 | ✅ | Browser: the AC3 entry gives the live total "Good: 16 trays + 14 · Rejects: 5 eggs", the response is `goodTotal 494, rejects 5`, and the card reads "16 trays + 14 · Rejects: 5 eggs". Also 040 "AC3: 494 good + 5 rejects…". Zero lines are dropped (`production-form.ts:87-94`, `log_production` `where u.eggs > 0`). |
| AC4 | ⚠ not verified | No 60-second timing on a real phone. Structurally met: the date is prefilled, nothing but quantities and Save is needed (browser), and UX counts 11 taps. |
| AC5 | ⚠ partly verified | Browser at 375px: `inputmode="numeric"` and `pattern` are on all 10 fields. All 33 inputs and buttons in the sheet are 44px. The sheet has 0px horizontal overflow. Save is visible in the pinned footer (y 752–796 of 812). **Not verified:** a real iOS/Android keypad and the `visualViewport` lift (`ProductionFormOverlay.vue:58-83`). |
| AC6 | ✅ | Browser, 24-per-tray farm: loose 24 shows "Loose eggs must be under 24…". "1 tray + 5" is recorded as 29 eggs and shown as "1 tray + 5". The unit specs `quantity.spec.ts` and `production-form.spec.ts` cover 24 per tray. No `30`/`29` literal in app code (grep). |
| AC7 | ✅ | Browser: the form closes, the toast reads "Logged today's production", and today's card is at the top and expanded with the numbers, with no reload. The date-naming copy is in `production-copy.ts`, via `formatDayPhrase` (`day-label.spec.ts`). The out-of-filter switch (Q1) is at `production.vue:113-120`; FE verified it in a browser. |
| AC8 | ✅ | Browser: the note "Today already has production logged. This adds to it." shows, the toast reads "Added to today's production", and Large shows "11 trays" on one card. 040: "AC8: Large is ONE row of 330 eggs". |
| AC9 | ✅ | Browser: loose 35 isn't clamped, shows the message, and blocks Save; the message clears once valid. The server rejects 1.5 and −1 (400, per-field). `production-form.spec.ts` covers −1, 1.5, `abc` and blank→0. |
| AC10 | ✅ | Browser: "Enter at least one amount." shows and the form stays open. The server returns TM004 or a zod error (040, `production-schemas.spec.ts`). |
| AC11 | ✅ | Browser: tomorrow shows the future-date message and blocks Save. The server rejects today+3 with a 400 on `date`, and a date 2 years back saves (200). 040 "UTC today + 2 raises TM002". (The overnight case in S1 also blocks the real today.) |
| AC12 | ✅ | Browser: three taps on a delayed Save sent **1** request. 040 "AC12: the same submissionId replays". `ProductionForm.vue:187,425` and `useProductionMutations.ts:29`. |
| AC13 | ✅ | Browser: offline shows "Couldn't save. Check your connection and try again.", and the values are kept. A lost response after commit brings up the AC8 note. Retry sends the **same** submissionId 3 times and gets `replayed: true, 494/5`, so it's recorded once. 040: "the failed save wrote nothing (no partial day, no ledger row)". |
| AC14 | ✅ | Browser: Esc on an empty form closes it at once. Typed values + Cancel gives "Discard this entry?", and Discard closes. There's no swipe gesture with `UModal` (N2), so that path can't lose data. |
| AC15 | ✅ | `app/utils/nav.ts:20` has the title and subtitle. Cards are newest first (browser Month: [-3, -10]). |
| AC16 | ✅ | Browser: "Today · Sep 25 · 16 trays + 14 · Rejects: 5 eggs". The badge shows only when rejects > 0 (`ProductionDayCard.vue:33`). Labels are covered in `day-label.spec.ts`. |
| AC17 | ✅ | Browser: today is expanded, the lines are Small/Medium/Large/Jumbo with Good badges, then "— Reject 5 eggs". The sum matches the total. |
| AC18 | ✅ | Only `formatQty`/`formatLabelledQty` produce amounts (card, chart tooltip, note, dialog, live total). `quantity.spec.ts` covers the R1 table. |
| AC19 | ✅ | Browser: Week (pressed by default) shows −3 and not −10. Month shows [−3, −10]. From = To = −10 shows one day and un-highlights the chips. From after To shows the error. Clear returns to the chip. `production-range.spec.ts` (11 cases). |
| AC20 | ✅ | Browser: the legend has 6 sizes + Rejects in farm order, with 7 distinct computed colours. Rejects use `text-error`. A one-day range renders with no page error. The chart empty state shows. `production-chart.spec.ts`. |
| AC21 | ✅ | Browser as farm B: `?tenant_id=<A>&p_tenant_id=<A>` returns only B's days. 020 named cases: TM006 on `production_days(B)`. |
| AC22 | ✅ | `ProductionDayCard.vue:87-99`: the ⋮ button is `size-11` (44px) and a sibling of the toggle, not nested. The browser opened Edit and Delete on a card. |
| AC23 | ✅ | Browser: "Edit production" pre-fills Large 11. 040 "replace… Large 264 → 234 gives 464". A size set to 0 is removed (040). |
| AC24 | ✅ | Browser: an all-zero edit gives "You've set every amount to 0." and Keep editing returns to the form. |
| AC25 | ✅ | Browser: "Delete today's production?" lists the amounts. After confirming, the card is gone and the toast "Deleted today's production" shows. |
| AC26 | ✅ | Browser: a delete failure shows "Couldn't delete…", the dialog stays, the day is unchanged, and the retry succeeds. The edit error path (`ProductionForm.vue:159-180`) and each write are one RPC transaction (M6). |
| AC27 | ✅ | Browser: "No production logged yet" with a Log production button. `hasAny` comes from the server (`production_days_json`). |
| AC28 | ✅ | Browser: "No production logged in this date range." and the chart's "Nothing to chart in this range." show, and the filters stay usable. 040 "empty range still reports hasAny = true". |
| AC29 | ✅ | Browser with a 1.5s delayed list: skeletons show and the empty state never flashes. |
| AC30 | ✅ | Browser: a failed first load shows "Couldn't load production" + Try again, with no empty state, and Try again recovers. A failed refetch (Month) shows the toast "Couldn't refresh production." and keeps the content. |
| AC31 | ✅ | Browser at 375px: 0px page overflow. The layout adds 84px of bottom padding when there's a FAB (`default.vue` body `pb-[calc(4rem+…+84px)]`). |
| AC32 | ✅ (partial) | 1280px: max-w 1120 (`default.vue`), and Add production is at the right of the top bar. 800px: Add production is 44px tall and inside the viewport, with no FAB and no overflow. **Not proven:** that the headless sidebar toggle actually changed state (the button position was identical before and after). |
| AC33 | ✅ (code) | Badges carry text ("Good", "Reject", "Rejects: …"). Chart colours are 600 in light mode and 400 in dark (`size-colors.ts`). Not visually checked in dark mode by QA (FE checked by eye). |
| AC34 | ✅ | pgTAP 020: 8 checks × 5 tables × both directions, plus 13 named production/sizes cases. 090 m8–m11 prove the checks aren't vacuous. Browser: B deleting A's date gets 404 and A is unchanged. Signed out gets 401. |
| AC35 | ✅ | `production_reject_unsized` check + 040 (sized reject / unsized good → 23514). Composite FK `production_size_fk` + 020 (23503). Browser: A's size id used from farm B gives 400 `sizes`. |
| AC36 | ✅ | The QA farm's tray size changed 30→24 in SQL: the egg sum stays 256 before and after, and 102 eggs shows as "4 trays + 6". |
| AC37 | ✅ | 030 "provision_farm gives the new farm the default sizes". The M4 backfill (`sizes.sql:90`). `/api/me` returns Small, Medium, Large, Jumbo. |
| AC38 | ✅ | Browser with Peewee…Jumbo: the form has 6 lines in order. Peewee 1 tray → 30 and Extra Large 12 → 12. The card shows "3 trays + 12" with Peewee first and Extra Large between Large and Jumbo. The legend has 7 distinct colours. |
| AC39 | ✅ | Browser: Large renamed to "Big" and Peewee moved last. A past day shows "Big 2 trays + 12", and the form, card and legend order follow. Egg counts are unchanged. 040 AC39 cases. |
| AC40 | ✅ | 020: A sees exactly its 4 sizes and none of B's. The sizes registry row is in the 8×2 checker; 090 m8. |
| AC41 | ✅ | `archived_at` exists, sizes have no delete grant or policy, and the FK is NO ACTION (040: deleting a size with production fails). Replace accepts an archived size already on the day (040). |

### Findings

**Blocking (review rules 1–8):** none.

**Should fix**
- **S1 [FE] "Today" goes stale while the screen stays open, which fails AC2 (and misfiles data).** `app/composables/useProductionDays.ts:15,36`: `today` is computed only in `load()`, which runs on mount and on filter changes. `app/pages/production.vue:22` passes it to the form, which uses it as the default date (`ProductionForm.vue:59`), the `max` (`:316`) and the future-date check (`production-form.ts:72`). It's also used for toasts and labels.
  - *Scenario:* the owner logs at 21:00, and the phone sleeps on Production. At 06:30 they tap "+". The date is yesterday's, and Save adds this morning's eggs to yesterday. The toast says "Logged today's production" and the card says "Today · Sep 25", so nothing looks wrong. Picking the real date shows "You can't log a future date" (reproduced with `page.clock`).
  - *Fix:* recompute `todayLocal()` whenever the form opens (`openLog`) and when the page becomes visible or focused (`useDocumentVisibility`/`visibilitychange`), and reload the list when the date has rolled over. A one-minute ticker also works.
  - Add a test, for example a `useProductionDays` unit test with fake timers, or a component test that the form's default date follows the clock.
- **S2 [BE] The 090 m10 deviation's reasoning is wrong, and the checker was blind to a weak `UPDATE … WITH CHECK`.** §4 says `production_update with check (true)` "is not a reachable breach". It is. As owner A on the weakened policy, `update public.production set tenant_id = '<B>'` (no WHERE clause referencing a column, so Postgres doesn't apply the SELECT policy to the new row) returned `ok:1`, and A's reject row moved into farm B. With the checker's old `where tenant_id = <own>`, the same weakening gives 42501 and goes undetected. That means the suite couldn't catch a future migration dropping the WITH CHECK from `production_update`, or from any later table.
  - **Resolved in tests by QA:** `supabase/tests/database/000_helpers.sql` check 8 (`update_into_victim`) now attacks with `where true`. All real policies still deny it (42501 on all 5 tables). I added `090` **m11** = the architect's original `production_update with check (true)`, which is now detected. m10 (RLS disabled) is kept.
  - *BE:* review the checker change and correct the m10 bullet in §4.

**Notes**
- **N1 [BE]** The server doesn't check that a replayed `submissionId` carries the same payload. A client bug that reused an id would silently drop a new entry and return `replayed: true`. The FE retry rule prevents this (`ProductionForm.vue:206-208`). A cheap hardening: store a payload hash in `production_submissions` and raise on mismatch. Also, an edit-then-revert after an ambiguous failure gets a new id and could add twice; the refreshed AC8 note (`:219`) makes that visible.
- **N2 [FE]** A single `UModal` instead of `UDrawer` on phones is acceptable. It's UX's documented fallback, and the mobile sheet geometry, the pinned Save and every close path (✕, Cancel, overlay, Esc through the discard check) were verified. There's no swipe-down gesture. The `visualViewport` keyboard lift isn't verified on a device.
- **N3 [BE]** As §3.9 says, a direct PostgREST insert with the owner's JWT skips the future-date backstop and the active-size check, for the owner's own farm only. "Farm settings: sizes" must add the `before insert or update` trigger.
- **N4 [FE]** Writes have no client timeout. A hung request keeps Save spinning, and the sheet can't be closed while saving, until the browser gives up. Consider `AbortSignal.timeout(…)` on writes; a retry after a timeout is safe because of the replay.
- **N5** Everything else checked clean: every tenant table has `tenant_id`, `updated_at`, RLS and tenant policies with `with check`. `p_tenant_id` comes only from `TenantDb.rpc` (`server/utils/db.ts:103-108`) and is asserted in SQL (TM006). Functions are `security invoker` (010). All 5 routes use `defineTenantHandler` (guard test). There's no service-role use outside `server/cli`, no `.rpc(`/`.from(` outside repositories, no hardcoded tray size, and no size list outside `app.seed_default_sizes`. Inventory isn't stored. No committed migration was edited: the 3 new ones are untracked, and `git diff HEAD -- supabase/migrations` is empty.
- **Not verified (as the devs also noted):** a real phone keypad (AC5), the 60-second timing (AC4), a touch tooltip, a screen reader, dark mode by eye, and a real sidebar toggle at 768–1023px.

### Tests run
- `bun run db:reset`: all 6 migrations applied cleanly (3 new).
- `bun run test:db`: **PASS, 6 files, 221 tests.** It was 220 before QA; m11 was added.
- `bun run test:unit`: **PASS, 17 files, 218 tests.**
- `bun run typecheck`: exit 0. `bun run lint`: exit 0.
- Headless Chrome (scratch, not committed): 62/62 + 16/16 + 3/3 + 3/3 passed. The clock script failed 0/2 (S1).
- QA test edits: `supabase/tests/database/000_helpers.sql` (check 8), `supabase/tests/database/090_isolation_detects_breach.test.sql` (m11, plan 14).
