# Feature: Farm settings (manage egg sizes)

**Status:** done
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want to add, rename, reorder and retire the egg sizes my farm sorts into, from a settings screen on my phone, so that the Production form and charts match how I actually grade eggs (for example adding "Peewee" or dropping "Jumbo") without losing any of the history I've already logged.

As the farm owner, I want retiring a size to hide it from new entries but keep my past days intact, so that I can stop using a size without my old numbers changing or disappearing.

**Why now / spec reference:**
- Feature 01 stores sizes as per-farm data and names "Farm settings: sizes" as the next feature (`docs/features/01-production-logging.md`: AC37–AC41, Follow-ups). The owner can currently only change sizes by editing the database.
- Owner decision 2 (feature 01): sizes are editable per farm, "data now, UI later". This is the "UI later".
- Data rules: `docs/egg-farm-app-architecture-spec.md` "Sizes" (never deleted, retired with `archived_at`, stable colour slot). `CLAUDE.md` "Units and data model".
- UI spec: §1 says the account menu is "sign out, (later: settings)" and §6 lists "a settings screen beyond the minimum" as deferred. This feature is that screen.
- **Visual design (source of truth):** `docs/design/source/template.html` has **no settings screen and no settings entry point.** The only account menu (~6093–6103) has "Dark mode" and "Sign out". See conflict S1 below. Nothing here is drawn in the design, so UX designs it in the design's visual language.
- Builds on features 00 (shell, account menu) and 01 (sizes table, `useFarm` sizes, Production form, day cards and chart).

## 2. Acceptance criteria (PM)
Terms used in these criteria:
- **Owner** means a signed-in, provisioned owner. **Mobile** is about 375px wide; **desktop** is 1024px or more.
- **Active size**: a size offered for new entries. **Archived size**: a retired size. It's never deleted.
- **Farm sizes** are the farm's own ordered list (feature 01). The examples use the starting Small, Medium, Large, Jumbo.
- Items marked **[not in design]** are needed for correctness but the design doesn't draw them. That is every item here that concerns the settings screen itself.

**Getting to settings**
- [ ] AC1: A **Settings** entry is reachable from every app screen on mobile and desktop, in the account menu (the menu that holds Dark mode and Sign out) [not in design; see S1 and question Q3]. Opening it in one or two taps from anywhere shows the **Settings** screen with a **Sizes** section. The screen's title is "Settings". It is not a sixth main navigation tab: the app still has exactly 5 destinations (Dashboard, Production, Sales, Inventory, Clients).
- [ ] AC2: The Sizes section lists the farm's **active** sizes in the farm's order, each with its name. A farm that has never changed its sizes sees Small, Medium, Large, Jumbo, in that order. Archived sizes are listed separately below (AC15), never mixed into the active list.

**Add a size**
- [ ] AC3: **Add size** asks for a name only. No colour, code or other field is required. Saving adds the size as an active size **at the end of the active list**. It appears in the Production "Log production" form, as a new trays + loose line at the bottom, the next time the form opens, without signing out or reloading. A new size has no past production.
- [ ] AC4: **Name rules**, for add and rename:
  - Leading and trailing spaces are ignored, and any run of spaces inside the name is collapsed to one (owner decision, 2026-09-25), so "Extra  Large" is saved and compared as "Extra Large".
  - A name of 1 to 40 characters is accepted; blank or longer than 40 is rejected with a message on the field.
  - A name that matches another size's name is rejected, ignoring upper/lower case (for example "large" when "Large" exists), with a message on the field. This includes **archived** sizes, so past days never show two identical labels. If the match is archived, the message points to restoring it (AC16).
  - Save is blocked while a message shows.
- [ ] AC5: A new size's chart colour is **never the same as another of the farm's sizes, archived ones included**, until the palette is used up. It never takes the Rejects colour (red). Adding, renaming, reordering or archiving any size **never changes the colour of any other size** (feature 01 UX rule R2). After the palette runs out, colours repeat with a dashed line (feature 01 R2), so any number of sizes still works. The owner doesn't pick colours in this feature.

**Rename**
- [ ] AC6: **Rename** changes the label everywhere at once, **including on past days, in past chart ranges and in the Production form**. It changes no egg count (feature 01 AC39). Before saving, the screen tells the owner that past days will show the new name, for example "Past days will show this new name too."
- [ ] AC7: Renaming a size to the same name it already has, or only changing its capitalisation or spacing, is allowed and saves without an "already exists" error against itself.

**Reorder**
- [ ] AC8: The owner can move an active size up or down. On mobile this works with **taps** (for example up and down buttons); dragging alone doesn't count. Each move control is at least 44px tall and wide.
- [ ] AC9: The new order shows in the Production form, the expanded day cards and the chart legend the next time each opens (feature 01 AC39). It changes no egg counts and no colours.
- [ ] AC10: The first size has no move-up control and the last has no move-down control, or the control is disabled. Nothing happens and no error shows.

**Archive (retire)**
- [ ] AC11: **Archive** asks for confirmation. The dialog names the size and says what changes, for example: "Archive Jumbo? It won't be offered for new production. Your past days keep their Jumbo eggs." **Archive** and **Cancel** are both offered. Cancel changes nothing.
- [ ] AC12: After Archive, the size:
  - no longer appears on the "Log production" form,
  - still shows, with its name and counts, on every past day that has eggs of it, in the collapsed totals and the expanded lines,
  - still plots in the Production chart, with its legend entry and colour, for any date range that contains eggs of that size,
  - isn't shown as a chart series or legend entry for a date range that has none of its eggs.

  The day totals, the chart values and the egg counts stay exactly as they were before archiving.
- [ ] AC13: **Edit day** (feature 01) on a day that has eggs of an archived size still shows that size's line, pre-filled and labelled "Archived", so the owner can correct or remove it. Saving that day without touching the line keeps its eggs. **Log production** never offers an archived size, and a new entry, or a date being added to, can't put eggs onto one, through the form or any other request.
- [ ] AC14: **A farm can't archive its last active size.** With only one active size left, its Archive control is disabled or absent, with a plain-language reason, for example "Keep at least one size." A request that would leave no active size is also refused by the system and changes nothing.
- [ ] AC15: Archived sizes are listed in a separate **Archived** group under the active list, in their last order, each labelled "Archived". A farm with no archived sizes shows no empty archived group, or shows a short line such as "No archived sizes".

**Restore** [PM addition: needed so an accidental archive isn't permanent and to resolve the name clash in AC4; see question Q4]
- [ ] AC16: Each archived size has a **Restore** action, with no confirmation. A restored size is active again, **at the end of the active list**, keeps its original name, colour and all its past eggs, and is offered on the Log production form again.

**Saving and errors**
- [ ] AC17: Each change (add, rename, move, archive, restore) takes effect **on its own**, without a separate "Save all" step, and shows the updated list without a page reload. A short confirmation (toast) names the change, for example "Added Peewee", "Renamed Large to Big", "Archived Jumbo".
- [ ] AC18: While a change is being saved, its control shows a spinner and can't be pressed again. Tapping quickly twice adds one size, not two, and moves a size one step, not two.
- [ ] AC19: If a change fails (for example, no signal), **nothing changes**: the list stays as it was, the typed value stays in the field, and a plain-language message shows, for example "Couldn't save. Check your connection and try again." Tapping again retries. This is error handling only, not offline support.
- [ ] AC20: If another phone or tab has already changed the sizes (for example, the size being renamed has since been archived), the change is refused with a plain message, and the screen refreshes to the current list. Nothing is changed by mistake. The single-owner case makes this rare.

**States and layout**
- [ ] AC21: **Loading:** the Sizes section shows a loading placeholder, not an empty list. **Load failure:** a plain-language message with **Try again**, and no blank screen.
- [ ] AC22: **Empty state:** a farm always has at least one active size (AC14), so the active list is never empty. This is checked, not designed for.
- [ ] AC23: On mobile (375px), the list, its controls and the add/rename form need no horizontal scrolling. Every tappable control (Add size, move up/down, rename, archive, restore, dialog buttons) is at least 44px tall. The screen can be scrolled clear of the bottom tab bar. On desktop the content is centred at the design's maximum width (about 1120px). Between 768px and 1023px it works with the sidebar collapsed and expanded.
- [ ] AC24: Light and dark mode both keep names, the "Archived" label and the dialogs readable. "Archived" shows as text, not only as a colour or dimming.

**Data rules and derived numbers**
- [ ] AC25: **Sizes never lose or change history.** No action on this screen deletes a size or changes or removes any production eggs. After add, rename, reorder, archive and restore, the sum of eggs for the farm, and each day's per-size counts, are identical to before. There is no "Delete size".
- [ ] AC26: Sizes stay **private to each farm**. The farm-isolation test (feature 01 AC34) is extended to writes: farm A's owner can't add, rename, reorder, archive or restore farm B's sizes, and can't read them, and the reverse. A signed-out request can't read or change sizes.
- [ ] AC27: Only the signed-in owner of the farm can change its sizes. There are no roles in v1 (non-goal), so every owner of a farm has the same access.
- [ ] AC28: **Later features rely on these rules, which this feature must not break:**
  - **Inventory** (feature 04) lists an archived size for as long as eggs of that size remain on hand, and stops listing it once they reach 0. It's not offered for new sales.
  - **Sales** (a later feature) offers **active** sizes only for a new sale. A pending delivery that already has an archived size can still be completed.
  - Archiving is allowed even if a size has eggs on hand or a pending delivery. The confirmation (AC11) doesn't need to check for either, because those screens don't exist yet. Revisit when Inventory and Sales ship.

**Out of scope:**
- **Deleting** a size. Sizes are never deleted (AC25).
- Choosing or changing a size's **colour**, or a short code (AC5).
- **Merging** two sizes, or moving eggs from one size to another.
- Renaming or reordering **archived** sizes. The owner restores first.
- Bulk changes, drag-and-drop as the only way to reorder, undo, and a change history or "who changed this" log (multi-user, non-goal).
- Setting a **minimum or maximum number** of sizes beyond "at least one active" (AC14). The chart already handles any number.
- **Farm name, email, password and dark mode.** Dark mode and Sign out stay in the account menu (feature 00).
- **Eggs-per-tray**, unless the owner picks option B in Q1 (see below).
- Hen counts and lay rate (owner decision 1, feature 01). If a "current hens" setting arrives later, it would live on this screen. Noted for later.
- Non-goals, kept out and noted for later: flock health, feed and mortality; offline; multi-user, roles and "who logged this"; realtime updates; invoicing and payment status.

**Design vs spec conflicts (for UX and the architect):**
- **S1: The design has no settings screen or entry.** The account menu has only Dark mode and Sign out. UI spec §1 says "later: settings" and §6 says a minimal settings area. PM decision: add a **Settings** item to the account menu (AC1), not a sixth tab, so the 5-destination navigation and the design's layouts are untouched. UX draws the screen in the design's style.
- **S2: The name index covers archived sizes.** Feature 01 notes `sizes_tenant_name_key` may be relaxed to active sizes only. PM position: **don't relax it** (AC4). Two sizes with the same label on past days would confuse the owner. Restore (AC16) is the way to bring a name back. The architect can override if the owner picks a different answer in Q4.
- **S3: Feature 01's form and Edit day.** AC13 requires the Edit day form to keep showing an archived size that's on the day. Feature 01 offers only active sizes on the form and lets the database accept an existing archived line. The feature 01 form may need a small change to show it. Also, feature 01 says this feature must add a rule that stops a direct insert on an archived size (feature 01 §3 note on AC35). AC13 states that in product terms.
- **S4: Chart legend.** Feature 01 AC38 says one line per farm size. With archiving, that becomes one line per size **that has eggs in the range** (AC12). The design has no archived state.

**Owner decisions (answered 2026-09-25, all matching the PM recommendations):**
- **Q1: A. Sizes only.** Tray size stays set at provisioning; Q2 no longer applies.
- **Q3: A.** Settings is an item in the account menu (AC1 stands).
- **Q4: A.** Restore stays (AC16 stands).
- **Q5: A.** A retired size's name can't be reused; the app points to Restore (AC4 stands, `sizes_tenant_name_key` is not relaxed, S2 stands).
- **Q6 and Q7:** not yet asked. Q6 (no roles; the owner can change everything) is confirm-only and kept as written in AC27. Q7 (any sizes to add or drop first) only sets test data.

**Questions as asked (for the record):**
- **Q1. Tray size on this screen (blocks scope, not design of sizes).** Feature 01 lists "Farm settings: tray size" as a separate follow-up. Eggs-per-tray is set once when the farm is provisioned (currently 30) and the owner can't change it in the app.
  - **A. Sizes only.** This feature is only about sizes. Tray size stays set at provisioning and gets its own small feature later.
  - **B. Sizes + tray size.** The same screen also lets you change "Eggs per tray". Past production keeps its exact egg counts; only how it's shown in trays changes (see Q2).
  - **PM recommendation: A.** It keeps this feature to one job and shippable on its own, and tray size rarely changes, so it can safely wait. B is small if you want it now. The Settings screen is designed so a "Tray size" section can be added later without rework.
- **Q2. Only if B: what happens to old quantities when tray size changes?** Eggs are stored exactly, so a change can only change how trays are displayed. Example: 494 eggs shows as "16 trays + 14" at 30 per tray, and as "20 trays + 14" at 24.
  - **A. Restate everything** in the new tray size (past days, inventory, charts). The eggs are always right, but old days read differently from your notebook.
  - **B. Keep the old tray size for past days.** Needs the app to remember the tray size per day. That's a larger change and it makes totals hard to compare.
  - **PM recommendation: A**, with a warning before saving: "Past days will show in trays of 24. Egg counts don't change." (matches feature 01 AC36 and product goal 5). Prices on future Sales need a separate check: if prices are per tray, changing tray size changes what a price means. The Sales feature has to decide that.
- **Q3. Where does Settings live?** Options: **A. an item in the account menu** (avatar on mobile, sidebar footer on desktop). **B. a sixth destination** in the bottom tabs and sidebar. **C. a link from the Production screen's Log form.**
  - **PM recommendation: A.** The design has a single account menu, Settings will be used rarely, and A keeps the 5 tabs unchanged (a sixth tab would crowd 375px). Doesn't block design if you agree with A.
- **Q4. Bringing back a retired size.** Do you want **Restore** (AC16)? **A. Yes, restore** (PM default in the criteria). **B. No, an archived size stays retired**; to use it again you'd add a new one with a different name. **Recommendation: A.** Without it, a mistaken archive can't be undone and the old name can never be used again, since names are unique (AC4).
- **Q5. Reusing a retired size's name.** If you archive "Jumbo" and later add a new "Jumbo", past days would show two "Jumbo" labels. **A. Not allowed**: the app asks you to restore the old one instead (AC4, PM default). **B. Allowed**, with the retired one shown as "Jumbo (archived)" everywhere. **Recommendation: A.** It keeps past days easy to read. B is only worth it if you want a clean split between the old and the new Jumbo. Doesn't block design.
- **Q6. Who can change settings?** With one owner in v1, the owner can change everything (AC27). **Confirm only:** no roles or "staff can log but not change sizes". That's a later multi-user feature. **Recommendation: confirm as is.**
- **Q7. Check before design starts:** your current list is Small, Medium, Large, Jumbo. Are there sizes you plan to add or drop first, such as Peewee or Extra Large? This only sets the test data and needs no answer to start.

## 2.5 UX design (UX Designer)

**Owner decisions on the UX checkpoint (2026-09-25):**
- **Name spaces:** collapse repeated inner spaces to one, on top of trimming (added to AC4). The server applies the same rule as the form.
- **Additions O1, O2, O3 are in:** O1 a one-tap "Restore {Name}" button in the "name is archived" message; O2 a phone-only ← back arrow on Settings; O3 the Restore toast says where the size went ("Restored Jumbo. It's last in your list.").
- **Archived label (designer's question 2):** day cards, tooltip and legend show an archived size's name with no "Archived" label. Only Settings and Edit day say "Archived".
- **No FAB or top-bar Add (conflict C2):** Settings has only the in-card **Add size** button.

**Source of truth:** the owner's design, `docs/design/source/template.html`. It has **no settings screen**, so this screen is drawn in the design's visual language and copies patterns that already exist in it or in the built app:
- the account menu (design ~6093–6103; built as `AppAccountMenu.vue`),
- cards (`bg-default`, hairline ring, 16px radius) and `bg-muted` 6px-radius rows inside them (feature 01 form rows),
- 16px DM Sans, `UBadge` `subtle` badges, primary / neutral-outline / ghost buttons,
- the confirm dialog (`ProductionDeleteDialog.vue`: `UModal`, max 400px, buttons stacked on phones),
- the toast (design ~6486: inverted, bottom-centre, 2.6s), the skeleton, and the load-failure card (feature 01 §2.5 States).

Nothing new is invented visually. Anything marked **[proposed]** is not in the design or the built shell. Nuxt UI names are approximate (v4); the frontend dev confirms the APIs. Feature 01 §2.5 rules R1–R3 still apply (colour slots, quantity format, date labels).

### Shared rules (used by every part of this screen)

**R1. One change at a time, saved on its own (AC17, AC18).** Every action (add, rename, move, archive, restore) is its own request. There is no "Save all".
- While a change is in flight, the control that was pressed shows a spinner. **Every other control on the Sizes card is disabled for that moment** (usually well under a second), so a double tap can't add two sizes or move a size two steps. The card has `aria-busy="true"`.
- The list only updates when the server says yes. If it fails, the list stays as it was (AC19). Because the change isn't drawn early, there is nothing to roll back. If the architect prefers an optimistic move, a failed move must put the row back and show the same message.
- After a successful change the affected row gets the same short highlight as a saved day card (a `bg-primary/8` fade over 1.5s, none with reduced motion) and focus lands somewhere sensible (see Accessibility).

**R2. Messages live where the owner is looking.**
- Name problems: on the field, under the input (`UFormField` error).
- A failed add or rename: an error `UAlert` inside the inline form, above the buttons. The typed name stays.
- A failed move or restore, or a list conflict (AC20): one `UAlert` at the top of the Sizes card (`role="alert"`, with a 44px dismiss ✕). It clears on the next successful change or when dismissed.
- A failed archive: an error `UAlert` inside the dialog. The dialog stays open.
- Success: the toast (R4). Toasts are never the only place an error shows, because they vanish in 2.6s.

**R3. Names (AC4).** The same rules for Add and Rename.
1. Leading and trailing spaces are removed before checking and before saving. **[proposed]** Repeated spaces inside a name ("Extra  Large") are also collapsed to one, so two labels never differ only by spacing. See Question 1.
2. Length after trimming: 1 to 40. There is **no `maxlength` on the input**, so a pasted long name shows a message instead of being silently cut.
3. Case-insensitive match against **every** size of the farm, active or archived. A match on the size being renamed itself is fine (AC7).
4. Checks run when the field loses focus and when the owner taps Add/Save. After a message has shown, it re-checks on every keystroke and the message clears the moment the name is valid.
5. **Save is blocked while a message shows.** The button is disabled (`aria-disabled`, dimmed) only while a message is on screen. Before any message, it is enabled, so an empty tap gives the message instead of a dead button. Pressing Enter/Go does the same as tapping Save.
6. A rename that leaves the trimmed name exactly the same closes the form with no request and no toast (same as feature 01's "nothing changed" edit). A change of capitalisation or spacing only is a real change and saves.

**R4. Toasts (AC17).** The design's toast, 2.6s. On phones Settings has no FAB, so the toast sits **above the tab bar**: `bottom: calc(64px + env(safe-area-inset-bottom) + 16px)`. Exact wording is in Copy.

**R5. Size colour is not shown on this screen.** Feature 01 R2 says colour appears only in the chart. A size keeps its colour through every action here (AC5, AC9), and the owner doesn't pick it, so the list has no colour dots. This also means no size is identified by colour alone.

### Flow

**Getting there (AC1).** Any screen → the account menu → **Settings** → Settings screen.
- Mobile: tap the **avatar** in the top bar (1), tap **Settings** (2). **2 taps.**
- Desktop, sidebar expanded: click the **account row** in the sidebar footer (1), click **Settings** (2). **2 clicks.**
- Tablet, sidebar collapsed to the rail: click the **avatar** at the bottom of the rail (1), then **Settings** (2). **2 taps.**
- The screen is at `/settings`. **None of the five tabs is highlighted** there (the same as the 404 page in feature 00). The title is "Settings". There is no FAB and no top-bar Add button; the screen has its own **Add size** button (see conflict C2).
- **Back [proposed, C3]:** on phones only, a 44px **←** button sits left of the title. It goes back to the previous screen (the Dashboard if there was none). Otherwise the owner has to know to tap a tab.
- Leaving: tap any tab or a sidebar item. Nothing needs saving, so there is never a "discard" prompt at screen level.

**A. Add a size (AC3, AC4)**
`Settings → Add size → (the field is focused, keypad opens) type name → Add → toast "Added Peewee" → the new row is last in the list, highlighted`
- The form opens **inline**, in place of the Add size button, and the field is focused (the owner just tapped, so the keypad opening is expected). The card scrolls the form into view above the keypad.
- Name only. No colour, code or other field. It goes at the **end of the active list**.
- The Production form shows it as the last line the next time it opens.
- After Add, the form closes, focus returns to the **Add size** button, and adding another is one more tap.
- **Main path: 2 taps + typing** (Add size, Add). With the keypad's Go key, **1 tap + typing**.

**B. Rename (AC6, AC7)**
`Settings → ⋮ on the row → Rename → (the row turns into a form, field focused, name selected) type → Save → toast "Renamed Large to Big"`
- The row itself becomes the form (no dialog), so the list stays visible and the keypad doesn't fight a centred modal on phones.
- Under the field, always: "Past days will show this new name too." (AC6).
- **Main path: 3 taps + typing** (⋮, Rename, Save). With the Go key, 2 taps.
- Esc, or **Cancel**, closes it and changes nothing. No prompt: it's only a name.

**C. Reorder (AC8–AC10)**
`Settings → tap ↑ or ↓ on the row → the row moves one place → toast "Moved Large up"`
- **1 tap per step.** Moving Jumbo from last to first in a list of four is 3 taps.
- After a move, focus stays on the same row's same button (in its new place), so repeated taps keep moving it. The row scrolls into view if it needs to.
- The first row's ↑ and the last row's ↓ are disabled. Nothing happens and no error shows (AC10).
- Reordering is **taps, not drag** (AC8). Drag is not offered in v1, so there is nothing to learn or mis-hit.

**D. Archive (AC11, AC12, AC14)**
`Settings → ⋮ → Archive → dialog "Archive Jumbo?" → Archive → toast "Archived Jumbo" → the row moves to the Archived group`
- **Main path: 3 taps** (⋮, Archive, Archive in the dialog).
- Cancel changes nothing.
- With **one active size left**, Archive is disabled and the reason is on screen (see States).
- The dialog is a plain confirmation, not a red "delete" one: nothing is lost and Restore exists. See conflict C4.

**E. Restore (AC16)**
`Settings → Archived group → Restore → toast "Restored Jumbo. It's last in your list." → the row is at the end of the active list, highlighted`
- **1 tap**, no confirmation.

**F. Name matches an archived size (AC4, owner decision Q5)**
`Add or Rename → type "jumbo" → message "Jumbo is archived. Restore it instead." with a Restore button → tap Restore → same result as flow E, and the form closes`
- 1 extra tap, and the typed name doesn't need to be re-entered anywhere.

**G. Something changed elsewhere (AC20)**
`Any change → the server says it's out of date → the change is not made → the list refreshes → an alert at the top of the card says so`
- The owner sees the current list and can act again. Nothing is changed by mistake.

### Layouts

Wireframes aren't to scale. Legend: `[x]` enabled button · `(x)` disabled button · `[⋮]` menu button.

#### Account menu with Settings (AC1) [proposed, S1]
The built `AppAccountMenu` gets **Settings** (`i-lucide-settings`) as the first item of the middle group, above Dark mode. Sign out stays last, in red. Items are 44px tall on phones.
```
 Mobile (avatar, opens down, right-aligned)      Desktop expanded (sidebar footer, opens up)
        ┌──────────────────────────┐              ┌──────────────────────────┐
        │ Hendricks Farm           │  header      │ Hendricks Farm           │
        │ jamie@hendricks.farm     │  (label)     │ jamie@hendricks.farm     │
        ├──────────────────────────┤              ├──────────────────────────┤
        │ ⚙  Settings              │ 44px         │ ⚙  Settings              │
        │ ☾  Dark mode             │              │ ☾  Dark mode             │
        ├──────────────────────────┤              ├──────────────────────────┤
        │ ⏻  Sign out              │ red          │ ⏻  Sign out              │
        └──────────────────────────┘              └──────────────────────────┘
                                                   [ (JH) Hendricks Farm    › ]  trigger
```
- Selecting **Settings** navigates and closes the menu. Dark mode still stays open (feature 00).
- On `/settings` the Settings item shows as current (`aria-current="page"`, the `bg-elevated` current tint).
- The tablet rail opens the same menu to the right of the avatar (unchanged from feature 00).

#### Settings, mobile (~375px), default with one archived size
Main area `bg-muted`, p-4 (from the shell). Bottom padding clears the tab bar only (no FAB here).
```
┌───────────────────────────────────────────┐
│ [←] Settings                        (HF)  │ top bar (shell). ← 44×44 [proposed]. HF = avatar menu
│     Farm settings                         │ subtitle text-sm muted
├───────────────────────────────────────────┤
│ ┌───────────────────────────────────────┐ │ UCard look: bg-default, ring, rounded-2xl, p-4
│ │ Sizes                                 │ │ text-base 600, highlighted
│ │ The sizes you sort your eggs into.    │ │ text-sm muted
│ │ They show on the Log production form  │ │
│ │ in this order.                        │ │
│ │ ┌───────────────────────────────────┐ │ │ <ul>. Row: bg-muted, rounded-md, min-h 56px
│ │ │ Small                 (↑) [↓] [⋮] │ │ │ name text-base 500, wraps (never truncated)
│ │ └───────────────────────────────────┘ │ │ ↑ ↓: UButton ghost icon, 44×44, gap 4px
│ │ ┌───────────────────────────────────┐ │ │ [⋮]: UDropdownMenu trigger, 44×44
│ │ │ Medium                [↑] [↓] [⋮] │ │ │
│ │ └───────────────────────────────────┘ │ │ first row: ↑ disabled
│ │ ┌───────────────────────────────────┐ │ │
│ │ │ Large                 [↑] [↓] [⋮] │ │ │
│ │ └───────────────────────────────────┘ │ │
│ │ ┌───────────────────────────────────┐ │ │
│ │ │ Jumbo                 [↑] (↓) [⋮] │ │ │ last row: ↓ disabled
│ │ └───────────────────────────────────┘ │ │
│ │ [            + Add size             ] │ │ UButton outline, block, 44px+, i-lucide-plus
│ └───────────────────────────────────────┘ │
│ ┌───────────────────────────────────────┐ │ second card, only when something is archived
│ │ Archived                              │ │ text-base 600
│ │ Not offered for new production. Past  │ │ text-sm muted
│ │ days keep them.                       │ │
│ │ ┌───────────────────────────────────┐ │ │ Row: bg-muted, rounded-md, min-h 56px
│ │ │ Peewee                [ ⟲ Restore ]│ │ │ name text-base 500
│ │ │ [Archived]                        │ │ │ UBadge neutral subtle, text (not colour alone)
│ │ └───────────────────────────────────┘ │ │ Restore: UButton outline, 44px, icon + text
│ └───────────────────────────────────────┘ │
├───────────────────────────────────────────┤
│  Dashboard  Production  Sales  Inv Clients│ tabs (none highlighted)
└───────────────────────────────────────────┘
```
- **Width check at 375px:** card inner width is 343 − 32 = 311px, row inner 295px. Three 44px buttons plus gaps take about 140px, which leaves about 147px for the name ("Extra Large" is about 90px). A 40-character name wraps to two or three lines and the row grows; it never truncates and never scrolls sideways (AC23).
- **Archive is in the ⋮ menu, not a visible button.** This matches the ⋮ pattern on the Production day cards, and keeps a rarely used, consequential action one step away from the everyday ↑ ↓.
- **⋮ menu:** `UDropdownMenu`, items 44px tall: **Rename** (`i-lucide-pencil`) and **Archive** (`i-lucide-archive`, neutral colour, not red). The menu trigger's accessible name is `Actions for {Name}`.
- **Move buttons** are named `Move {Name} up` / `Move {Name} down`.
- **The Archived card** is shown only when there's at least one archived size. It's not shown at all otherwise (AC15: no empty group), so a new farm's screen is just the Sizes card. Archived rows appear in their last order. They have no ↑ ↓ ⋮ (renaming and reordering archived sizes are out of scope: restore first).

#### Settings, desktop (≥1024px) and tablet (768–1023px)
Content is centred at max 1120px (shell). At **lg and up** each section is a two-column band: a short description on the left and the card on the right. That keeps the rows from stretching across 1100px, and it leaves room for later sections such as tray size (Q1) without rework. **Below lg (tablet)** it's one column, exactly like mobile, with the sidebar collapsed to the rail or expanded.
```
┌──────────────┬───────────────────────────────────────────────────────────────────────────┐
│ [logo] Tamago│ «  Settings                                                                │ no Add button in the top bar
│              │    Farm settings                                                           │
├──────────────┼───────────────────────────────────────────────────────────────────────────┤
│  Dashboard   │ Sizes                        ┌───────────────────────────────────────────┐ │
│  Production  │ The sizes you sort your      │ Small                       (↑) [↓] [⋮]   │ │ rows: bg-muted, rounded-md, 48px+
│  Sales       │ eggs into. They show on the  │ Medium                      [↑] [↓] [⋮]   │ │ controls 40px at lg, 44px on tablet
│  Inventory   │ Log production form in this  │ Large                       [↑] [↓] [⋮]   │ │
│  Clients     │ order.                       │ Jumbo                       [↑] (↓) [⋮]   │ │
│              │                              │ [ + Add size ]                            │ │ outline button, left-aligned, auto width
│              │ (left column: 280px,         └───────────────────────────────────────────┘ │
│              │  text-base 600 + text-sm      ┌───────────────────────────────────────────┐ │
│              │  muted, sticky at top)        │ Archived                                  │ │ card only when something is archived
│              │ Archived                     │ Peewee  [Archived]            [ ⟲ Restore ]│ │ name, badge inline, Restore right
│              │ Not offered for new          └───────────────────────────────────────────┘ │
│  ──────────  │ production. Past days                                                      │
│ (JH) Hendri… │ keep them.                                                                 │ account row → menu with Settings
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```
- Each band's left column repeats the card heading and help text, so on desktop the card itself carries only its rows (no duplicate heading). On one-column widths the heading and help text sit inside the card, as in the mobile wireframe.
- The band grid is `lg:grid-cols-[280px_1fr]` with a 24px gap. The card is at most 720px wide.
- Row controls on desktop are the same buttons at 40px (44px on tablet, which is usually touch), as in feature 01.

#### Inline forms (Add and Rename), mobile
The form replaces the Add size button (Add) or the row (Rename). Everything else stays visible and usable, so a wrong tap costs nothing.
```
│ │ ┌───────────────────────────────────┐ │ │ Rename: replaces the row. Add: replaces the button
│ │ │ Size name                         │ │ │ UFormField label, text-base 500 (label on every input)
│ │ │ [ Large                        ]  │ │ │ UInput xl, 44px, 16px text, autofocus, text selected
│ │ │ Past days will show this new name │ │ │ help, text-sm dimmed. RENAME ONLY (AC6)
│ │ │ too.                              │ │ │
│ │ │ [ Cancel ]  [       Save        ] │ │ │ Cancel: ghost 44px · Save: primary, flex-1, 44px
│ │ └───────────────────────────────────┘ │ │ Add form: help line is absent, buttons Cancel / Add
```
- Input attributes: `type="text"`, `autocapitalize="words"`, `autocomplete="off"`, `spellcheck="false"`, `enterkeyhint="done"`, `aria-describedby` on the help and error text. It isn't a numeric field, so no `inputmode="numeric"`.
- Add form placeholder: `For example, Peewee`.
- The form is a `UForm` so Enter submits and Esc cancels.

#### Archive confirmation (AC11)
`UModal`, centred at every width, max-width 400px (same as the delete-day dialog). On phones the buttons stack full width at 44px with Archive on top.
```
┌───────────────────────────────────────┐
│ Archive Jumbo?                        │  title
│ It won't be offered for new           │  body, text-base
│ production. Your past days keep their │
│ Jumbo eggs.                           │
│ You can restore it any time.          │  text-sm muted
│ ┌ (!) Couldn't archive. Check your ─┐ │  error alert, only after a failure
│ └   connection and try again.       ─┘ │
│        [ Cancel ]  [ ▣ Archive ]      │  Cancel: neutral outline, focused by default
└───────────────────────────────────────┘  Archive: primary solid, i-lucide-archive, spinner while saving
```
- The name is the size's current name. The dialog names only what changes; it doesn't check inventory or pending deliveries (AC28).
- Escape, the overlay and Cancel do the same thing: close, change nothing. They're disabled while the request is running.

#### Production form: Edit day with an archived size (S3, AC13)
The Edit production form (feature 01) shows an archived size that's on that day. It is **not** in the Log production form.
```
│ Good eggs, by size                        │
│                  Trays          Loose     │
│ ┌───────────────────────────────────────┐ │
│ │ Small                                 │ │  active sizes first, in the farm's order
│ │ [−][   1   ][+]    [−][  12   ][+]    │ │
│ └───────────────────────────────────────┘ │
│ ┌ Medium … Large … ─────────────────────┐ │
│ ┌───────────────────────────────────────┐ │
│ │ Jumbo   [Archived]                    │ │  UBadge neutral subtle, text-xs: after the name
│ │ [−][   1   ][+]    [−][  10   ][+]    │ │  pre-filled, fully editable, 44px as the others
│ └───────────────────────────────────────┘ │
│ Rejects (no size)                         │
```
- **Order:** the day's archived lines come **after the active sizes**, still inside "Good eggs, by size". The active lines then match the Log production form line for line. The build currently sorts by `sortOrder`, which would put an archived size back in its old slot in the middle. Please change to active first.
- **Label:** the badge "Archived" is text next to the name. Desktop shows it inline after the name in the fixed name column, and the column can wrap. The accessible name of each input is `Jumbo (archived) trays` and `Jumbo (archived) loose eggs`.
- **Behaviour:** the owner can correct the line or set it to 0/blank to remove it. Saving without touching it keeps its eggs (AC13). The live total counts it.
- No extra explanation text. The badge is enough. **[proposed]** If testing shows people wonder why Jumbo is there, add the hint "Jumbo is archived. It shows because this day has some." under the line.
- Sizes that are archived and not on the day never show in Edit.
- **Day cards, the expanded lines, the chart tooltip and the legend show the size name only** (no "Archived" label). Names can't repeat (Q5), so a name is unambiguous, and the history reads the way the owner wrote it. Only Settings and Edit day say "Archived".

#### Chart legend change (S4, AC12)
Feature 01 draws one series and one legend entry per farm size. That changes to:
```
 Active sizes             always shown (a line at 0 if the range has none), in the farm's order
 Archived sizes           shown ONLY if at least one day in the current range has eggs of that size
 Rejects                  last, as before
```
- Archived sizes that are shown come **after the active ones**, before Rejects. That is the same order as Edit day. They keep their colour slot and use their name only (no "Archived" suffix; see above).
- An archived size with no eggs in the range has no line, no legend entry and no tooltip row. Switching the range (Week, Month, From/To) adds or removes it.
- The line for an archived size that is shown is drawn on every day in the range, at 0 on days without eggs of it, the same as any size.
- The chart's `aria-label` and the day cards are unchanged. The build (`ProductionTrendChart.vue`, `buildChartModel(days, sizes)`) currently uses all sizes, so the frontend must filter archived series by the range's days.

### States

| Area | State | What the owner sees |
|---|---|---|
| Screen | **Loading (AC21)** | The Sizes card renders its heading and help text at once. In place of the rows are **4 row skeletons** (`USkeleton`, 56px, `rounded-md`). The Add size button is hidden (there's nothing to add to yet). The Archived card isn't shown yet. It never shows an empty list while loading. |
| | **Default** | The Sizes card with active rows, the Add size button, and (if any) the Archived card. |
| | **Load failure (AC21)** | In place of the rows and the button, inside the Sizes card: `i-lucide-cloud-off`, heading "Couldn't load your sizes", body "Check your connection and try again.", and a **Try again** button (primary, xl, `i-lucide-refresh-cw`, spinner while retrying). No blank screen. |
| | **Empty (AC22)** | Not designed. A farm always has at least one active size. If none ever arrives, the screen treats it as a load failure (the card above). |
| | **Refreshing** | If the farm context already has the list, the screen shows it at once and refreshes quietly (no skeleton, no spinner). A quiet refresh that fails changes nothing on screen. The list may then be stale, and AC20 covers that on the next change. |
| Active row | **Default** | Name, ↑, ↓, ⋮. |
| | **First / last** | The first row's ↑ and the last row's ↓ are disabled. No message (AC10). |
| | **Only one active size (AC14)** | The one row has ↑ and ↓ disabled, and its **Archive** menu item is disabled with the reason visible in the item ("Keep at least one size."). A line of text with `i-lucide-info` is also shown **under the list, always**, so the reason is on screen without opening the menu: "Keep at least one size. Add another before you archive {Name}." Text plus an icon, not colour alone. |
| | **In flight (R1, AC18)** | The pressed control shows a spinner. All other controls on the card are disabled. The card is `aria-busy`. |
| | **Just changed** | Short row highlight (R1), toast (R4). |
| Add | **Default** | The Add size button. Tapping it opens the form (field focused). |
| | **Form open** | Label "Size name", the field, buttons **Cancel** / **Add**. Opening Rename closes it and vice versa. |
| | **Validation (AC4)** | The field gets an error ring, an icon and the message below. **Add** is disabled while the message shows and enabled again as soon as the name is valid. The messages are in Copy. |
| | **Matches an archived size** | The message "{Name} is archived. Restore it instead." and, under it, a **Restore {Name}** text button (`UButton` link/ghost, 44px). It restores at once and closes the form (flow F). |
| | **Saving (AC18)** | **Add** shows a spinner and is disabled. The field is read-only. Cancel is disabled. |
| | **Server / network error (AC19)** | An error alert above the buttons: "Couldn't save. Check your connection and try again." The typed name stays. **Add** is active again and tapping it retries the same add (no second size, see Data). |
| Rename | **Default / validation / saving / error** | As Add, with the field pre-filled and selected, the help line "Past days will show this new name too.", and **Save**. Error: "Couldn't save. Check your connection and try again." |
| | **Unchanged** | Save closes the form. No request, no toast. |
| | **Size was archived or changed elsewhere (AC20)** | The form closes, the list refreshes, and the top alert says "Your sizes were changed somewhere else. The list is up to date now." |
| Archive | **Dialog** | See wireframe. Cancel is focused. |
| | **Saving** | Archive shows a spinner. Everything in the dialog is disabled and can't be closed. |
| | **Failed** | The alert inside the dialog: "Couldn't archive. Check your connection and try again." The dialog stays. Archive retries. Nothing changed. |
| | **Refused: last size (AC14, server)** | Inside the dialog: "Keep at least one size." The dialog stays, and the list refreshes. Rare, since the menu item is already disabled. |
| | **Out of date (AC20)** | The dialog closes, the list refreshes, and the top alert shows the "changed somewhere else" message. |
| Archived group | **None archived (AC15)** | The Archived card isn't shown at all. |
| | **Some archived** | The card lists them in their last order. Each has the name, the **Archived** badge and a **Restore** button. |
| | **Restoring** | **Restore** shows a spinner. Other controls are disabled. |
| | **Restore failed** | The alert at the top of the Sizes card: "Couldn't restore {Name}. Check your connection and try again." Restore is active again. |
| | **Restore refused (AC20)** | The "changed somewhere else" alert, and the list refreshes. |
| Move | **Failed** | The alert at the top of the Sizes card: "Couldn't move {Name}. Check your connection and try again." The order is unchanged. Tapping again retries. |
| | **Out of date (AC20)** | The "changed somewhere else" alert, and the list refreshes. |
| Success | **Toasts** | The design's toast (R4). Wording in Copy. |
| Theme | **Light / dark (AC24)** | All text uses `text-default` / `text-highlighted` / `text-muted` tokens, and rows use `bg-muted` on `bg-default`. "Archived" is a text badge. Disabled controls are dimmed **and** `aria-disabled`, and the Only-one-size reason is text. |

### Copy

| Where | Text |
|---|---|
| Account menu item | **Settings** |
| Page title / subtitle | **Settings** · `Farm settings` |
| Back button (aria-label, phones) | `Back` |
| Sizes card | Heading **Sizes** · help `The sizes you sort your eggs into. They show on the Log production form in this order.` |
| Row controls (aria-labels) | `Move {Name} up` · `Move {Name} down` · `Actions for {Name}` |
| Row menu | **Rename** · **Archive** |
| Add | Button **Add size** · form label **Size name** · placeholder `For example, Peewee` · buttons **Cancel** · **Add** |
| Rename | Form label **Size name** · help `Past days will show this new name too.` · buttons **Cancel** · **Save** |
| Only one active size | Menu item disabled, description `Keep at least one size.` · line under the list `Keep at least one size. Add another before you archive {Name}.` |
| Archived card | Heading **Archived** · help `Not offered for new production. Past days keep them.` · badge **Archived** · button **Restore** (aria-label `Restore {Name}`) |
| Archive dialog | Title `Archive {Name}?` · body `It won't be offered for new production. Your past days keep their {Name} eggs.` + `You can restore it any time.` · buttons **Cancel** · **Archive** |
| Edit day, archived line | Badge **Archived** · input names `{Name} (archived) trays` / `{Name} (archived) loose eggs` |
| Toast: add | `Added {Name}` |
| Toast: rename | `Renamed {Old} to {New}` |
| Toast: move | `Moved {Name} up` · `Moved {Name} down` |
| Toast: archive | `Archived {Name}` |
| Toast: restore | `Restored {Name}. It's last in your list.` |
| Name: blank (AC4) | `Enter a size name.` |
| Name: too long (AC4) | `Use 40 characters or fewer.` |
| Name: matches an active size (AC4) | `You already have a size called {Existing name}.` |
| Name: matches an archived size (AC4) | `{Existing name} is archived. Restore it instead.` + button **Restore {Existing name}** |
| Save failed: add / rename (AC19) | `Couldn't save. Check your connection and try again.` |
| Archive failed | `Couldn't archive. Check your connection and try again.` |
| Move failed | `Couldn't move {Name}. Check your connection and try again.` |
| Restore failed | `Couldn't restore {Name}. Check your connection and try again.` |
| Last size refused (AC14) | `Keep at least one size.` |
| Changed elsewhere (AC20) | `Your sizes were changed somewhere else. The list is up to date now.` |
| Load failure (AC21) | Heading **Couldn't load your sizes** · body `Check your connection and try again.` · **Try again** |
| Loading | (no text; row skeletons) |

Notes on the wording:
- Names in messages use the size's own name as saved, in its own capitalisation (a match on "large" reads `You already have a size called Large.`).
- The copy says "size" and "eggs" only where the owner would. The only "eggs" is in the archive dialog and help text, where the eggs of that size are what's kept. Nothing says "tray" here, because this screen holds no quantities.
- No message uses "invalid", "conflict", "constraint" or "archived_at". "Archive" and "Restore" are the words the PM approved.

### Quantity entry
This screen has no quantities, so the trays + loose component isn't used and the open convention question doesn't arise (two fields, already decided). The Edit day line for an archived size reuses `QuantityInput` unchanged.

### Accessibility
- **Tap targets ≥ 44px (mobile and tablet, AC23):** the back button, ↑, ↓, ⋮, menu items, Add size, the inline form's input, Cancel/Save/Add, the Restore button, the Restore-in-message button, dialog buttons, alert dismiss ✕, Try again. Rows are at least 56px tall. At lg and up, controls may be 40px, as in feature 01. Neighbouring 44px buttons are 4px apart, so a thumb doesn't hit the wrong one, and ↑ ↓ are kept apart from ⋮ by the same gap. The menu's Archive item sits under Rename with no gap issue since items are 44px.
- **Reordering is taps (AC8):** up and down buttons. There's no drag, so it can't be missed by a thumb, and it works with a keyboard or a screen reader.
- **Labels on every input:** the visible label "Size name" plus `aria-describedby` for the help and error. Every icon-only button has an `aria-label` that names the size.
- **Not colour alone:** "Archived" is a text badge. Disabled ↑ ↓ are dimmed and `aria-disabled`. The only-one-size reason is text with an icon. Errors have a message and an icon, not just a red ring. No colours are used to identify sizes on this screen (R5).
- **Sunlight contrast:** body text uses `text-default` / `text-highlighted`; the smallest text (`text-sm` help) is `text-muted`, the same as feature 01. Archived names are **not dimmed** (the badge does the job), so they stay readable in bright light.
- **Focus:**
  - Opening the inline form focuses its field. Esc or Cancel returns focus to the ⋮ / Add size button that opened it.
  - After a move, focus stays on the same button of the moved row.
  - After Add: focus goes to the Add size button. After Rename: to the row's ⋮.
  - After Archive: to the next row's ⋮ (or the Add size button if it was the last). After Restore: to the restored row's ⋮.
  - Dialogs trap focus and default to Cancel. Closing returns focus to the ⋮ that opened it.
- **Live regions:** toasts are announced (Nuxt UI toaster). The card's alerts use `role="alert"`. The list is a `<ul>`, so a screen reader hears "list, 4 items".
- **Motion:** row highlight, the form opening and the dialog respect `prefers-reduced-motion`.
- **Text size:** 16px inputs (no iOS zoom), as in feature 00.

### Design conflicts: UX resolution
| # | Conflict | Resolution |
|---|---|---|
| S1 | The design has no settings screen and no Settings entry. | Drawn in the design's style (above). **Settings** is the first item of the middle group in the built account menu (owner decision Q3). Still 5 tabs, none highlighted on `/settings`. |
| S2 | Name index covers archived sizes. | Kept (owner decision Q5). The message points to Restore, with a one-tap button. |
| S3 | Edit day and archived sizes. | Shown after the active lines with an **Archived** badge (wireframe above). `ProductionForm.vue` already keeps the line but sorts by `sortOrder` and has no label. Two small changes: order active first, add the badge and the accessible name. |
| S4 | Chart legend per range. | Archived series only if the range has their eggs (above). `ProductionTrendChart.vue` currently uses every size. |
| C2 | UI spec §1 says an Add action is "always reachable" (top-bar button, FAB) and context-aware. | Settings has no top-bar button or FAB. Its one add action is the in-card **Add size** button, next to the list it changes. A FAB would float over the rows. Feature 01 already limits the FAB to Production. |
| C3 | UI spec §1 lists a back affordance for drill-down screens; the feature 00 shell has none. | A phone-only **←** on the Settings top bar **[proposed]**, so a screen with no highlighted tab has a clear way out. Not added to any other screen. |
| C4 | UI spec §0 says "confirm only where data loss is real". Archiving loses nothing, and Restore undoes it. | AC11 (owner-approved) requires the confirmation, so it stays. The dialog is plain (primary button, not red, no "you can't undo") and says Restore exists. It's one tap more than a bare button, which is acceptable for a rare action. |
| C5 | The design's account menu is 200px wide with no header. | The built one (w-60, farm and email header) is the base. Only the Settings item is added. |
| C6 | Feature 01 R2 says size colour appears only in the chart. | No colour dots in the size list (R5). |

### Data the UI needs (for the architect)
1. **The farm's full size list** with, for each size: id, name, order, colour slot, and whether it's archived (`FarmSize` already has these). It should be the **same list the Production form and chart use**, so a change here shows there on next open without a reload (AC3, AC9).
2. **A fresh list when the Settings screen opens** (a quiet refresh even if the farm context has one), so the screen isn't stale after a change on another phone. A dedicated fetch is optional, but the loading and load-failure states above assume one may exist.
3. **The result of each change** should return the whole updated list (or enough to rebuild it) plus the id of the size that changed, so the screen re-renders from one response and can highlight the row.
4. **Error kinds** the UI maps to copy: network/unreachable · name blank · name too long · **name taken, with whether the match is archived and its id** (so the Restore pointer and button work when another device changed things first) · **would leave no active size** · **size not found or already in the other state** (already archived, not archived, gone: the conflict message) · session expired (the shell handles it).
5. **Idempotency for Add**, as feature 01 did for Log: one submit id per form opening, reused on retry, so a retry after an ambiguous failure adds one size, not two (AC18, AC19).
6. **Moves must not double-apply on retry.** "Move up one place" repeated after an ambiguous failure could move two steps. Suggest the UI sends the size and its **wanted position** (or the whole new order) rather than "one step". The architect decides.
7. **Trimmed and collapsed name:** the UI checks names against the loaded list, but the server is the authority and must apply the same trim (and, if approved, the same space-collapsing) and the same case-insensitive check across active and archived (AC4).
8. **Archived sizes on a day (S3):** the day payload keeps the size id, so the UI can resolve name and archived flag from the list (already true).
9. **Legend presence (S4):** nothing new. The days payload for the current range says which sizes have eggs; the UI filters archived series from it.
10. **A rule stopping new eggs on an archived size** through any request (AC13, feature 01 §3 note). Not a UI item, listed so it isn't lost.

### Questions for PM
- **Q1 (spaces inside a name):** AC7 says changing "spacing" is a real change, and AC4 only mentions leading and trailing spaces. I propose also collapsing repeated spaces inside a name to one (R3.1), so "Extra  Large" can't sit next to "Extra Large". OK, or should only the ends be trimmed?
- **Q2 (history labels):** day cards, the tooltip and the legend show an archived size's name with **no "Archived" label** (only Settings and Edit day say it). Names can't repeat, so this reads clean. OK, or should history mark archived sizes too?
- **Q3 (no top-bar Add or FAB on Settings):** see C2. OK?

### Decisions for owner
No blocking decisions. Owner decisions Q1, Q3, Q4 and Q5 are all applied as answered (sizes only, account-menu entry, Restore, name reuse points to Restore). Three small additions to your design that you can confirm or strike (none adds a step to any main path):
- **O1: A "Restore {Name}" button inside the "name is archived" message.** It saves retyping and one screen trip. The alternative is the message alone.
- **O2: A back arrow (phones only) on Settings**, because no tab is highlighted there.
- **O3: The Restore toast says where the size went** ("Restored Jumbo. It's last in your list."), because it moves from the Archived card up into the list, possibly off screen on a small phone.

### Main-path tap counts (mobile)
| Task | Taps | Notes |
|---|---|---|
| Open Settings from anywhere | 2 | avatar, Settings |
| Add a size | 2 + typing | Add size, Add (1 with the keypad's Go key); the field is already focused |
| Rename | 3 + typing | ⋮, Rename, Save (2 with Go); name is pre-selected |
| Reorder | 1 per step | ↑ or ↓; Jumbo to the top of four = 3 |
| Archive | 3 | ⋮, Archive, Archive in the dialog |
| Restore | 1 | no confirmation |

Add a size from anywhere: 4 taps + typing. Every touch target is at least 44px on phones and tablets.

## 3. Technical design (Architect)

**Owner decisions on the design checkpoint (2026-09-26):**
- **Size cap (D5): yes.** 100 sizes per farm, archived included (`TM015`, message "You have reached the limit of 100 sizes."). This overrides the PM's "no maximum number of sizes" out-of-scope line.
- **Archive/restore retries:** follow the UX table as written. A retry after a lost response shows "changed somewhere else"; no quiet-success rule.
- **Security audit:** run `security-auditor` after QA, because owners now have column-limited write grants on `sizes` (§3.2, D1).
- **CLAUDE.md:** update the sizes bullet at wrap-up with the architect's wording (§3.8), and show it in the summary.

Checked on 2026-09-26 against the code (migrations `sizes`, `production`, `production_functions`, `production_bounds`; `server/`, `shared/`, the Production components, `useMe`/`useFarm`, the app shell) and the docs: PostgreSQL 17 `CREATE TRIGGER` (transition tables are allowed only on a statement-level `AFTER` trigger, and **not** with an `UPDATE OF` column list) and `normalize(text, NFC)` (UTF8 servers only, which Supabase is). Component APIs were not re-read from Nuxt UI 4.11; the frontend dev confirms them, as UX asked.

**Shape of the design in one paragraph.** Managing sizes is five small writes (add, rename, reorder, archive, restore). Each is one `security invoker` Postgres function called through `TenantDb.rpc`, as in feature 01. Because those functions run as the signed-in owner, the owner needs write privileges on `sizes`, and the browser holds the same JWT, so PostgREST could reach the table directly. So **every rule that matters lives in the database itself**, not only in the functions: column-level grants (an owner can never write `tenant_id` or `color_slot`, and can never delete), a `BEFORE` trigger that normalises the name and assigns colour and position, and a statement-level `AFTER` trigger that refuses to leave a farm with no active size. The functions add friendly errors, idempotency and conflict checks on top. Reads reuse the list that already rides on `/api/me`, plus one small `GET /api/sizes` for a quiet refresh. Every mutation returns the whole updated list and the id of the size it changed, and the client swaps that list into the same farm context the Production form and chart read from, so a change shows everywhere at once.

**What already exists and is reused unchanged** (so nothing here is rebuilt):
- The `sizes` table, `sizes_tenant_name_key` (case-insensitive, archived included, **kept as is**, owner decision Q5), `sizes_tenant_color_slot_key` (a slot is never reused), the composite FK from `production`, and `app.assert_tenant`.
- **The rule that stops direct writes onto an archived size already exists** (`production_bounds` trigger, migration `production_bounds`, feature 01 audit M1): a new good line for an archived size is refused (`TM001`), an existing line of one can still be corrected. `log_production` also refuses it. Feature 01's note that this feature "must add" that trigger is out of date, and this design adds nothing there. It is only re-tested through the new archive path (§3.6).
- `production_days_json` orders each day's lines by `sizes.sort_order`. This design keeps `sort_order` compact with **active sizes first**, so archived lines already come after the active ones on day cards.
- `buildChartModel` **already** shows an archived size only when the range has its eggs (`s.active || present.has(s.id)`). UX §2.5 says the chart currently uses every size; the code is ahead of that. The only chart change is ordering (archived after active, §3.4).

### 3.1 Data

Two migrations, created with `bunx supabase migration new <name>` (after `20260925131758`): **M8 `sizes_write_rules`** and **M9 `sizes_functions`**. Then `bun run db:types`.

#### M8 `sizes_write_rules`

**1. Helpers** (schema `app`, so PostgREST doesn't expose them; `revoke all … from public`, `grant execute … to authenticated`, because the trigger and the check constraint run as the caller):
- `app.normalize_size_name(p_name text) returns text`, `immutable`, `security invoker`, `set search_path = ''`: `btrim(regexp_replace(normalize(p_name, nfc), '\s+', ' ', 'g'))`. So: Unicode NFC (so "Cafe" typed with a combining accent and one typed with a precomposed accent are the same name), every run of whitespace becomes one space, ends trimmed. This is the **one SQL definition** of AC4's rule. Its twin is `normalizeSizeName` in `shared/utils/size-name.ts` (§3.3); a Vitest case and a pgTAP case use the same fixtures.
- `app.lock_tenant_sizes(p_tenant_id uuid) returns void`: `pg_advisory_xact_lock(hashtextextended('sizes:' || p_tenant_id::text, 0))`. It serialises size writes for one farm for the length of the (short) transaction. The key prefix differs from the production-day lock (`tenant:date`), so the two never collide.
- `app.compact_size_order(p_tenant_id uuid) returns void`: one `UPDATE … FROM (select id, row_number() over (order by (archived_at is not null), sort_order, name, id) - 1 as rn …)` that rewrites `sort_order` to `0..n-1` **only on rows whose value differs** (so `updated_at` doesn't move on untouched rows). Result: active sizes are `0..k-1` in the owner's order and archived ones follow in their previous relative order. This is what makes "add at the end", "restore to the end" and "archived in their last order" hold, and it keeps the day cards ordered active-first.

**2. Existing rows and the name rule.** Re-normalise any existing name (`update public.sizes set name = app.normalize_size_name(name) where name <> app.normalize_size_name(name)`, as postgres, before the constraint), then `constraint sizes_name_normalised check (name = app.normalize_size_name(name))`. The existing `sizes_name_length` (1–40 characters, counted in code points like zod's) and the unique index stay.

**3. `BEFORE INSERT OR UPDATE` row trigger `sizes_write_guard`** (`app.sizes_write_guard()`, `security invoker`, `set search_path = ''`, `revoke all … from public`). It applies to **every write path**, including a direct PostgREST call with the owner's JWT:
- `new.name := app.normalize_size_name(new.name)` (on insert, and on update when the name changes). A blank result then fails `sizes_name_length` (23514); a duplicate fails the unique index (23505).
- **INSERT:** `perform app.lock_tenant_sizes(new.tenant_id)`, then
  - if the farm already has 100 sizes (archived count too, they're never deleted): `TM015` "too many sizes" (§3.8 D5, owner call);
  - `if new.color_slot is null`: the **smallest non-negative integer not used by any size of the farm, archived included** (`generate_series(0, count)` minus the used slots). Slots 0–9 are the ten palette colours and none of them is red (`SIZE_PALETTE` has no red; `REJECT_COLOR` is separate), 10+ repeat the palette dashed. So a colour is never repeated until the palette is used up, red is never taken, and, because a slot is never reused, no other size's colour ever changes (AC5, UX R2). The seed function still supplies explicit slots 0–3 and those are honoured;
  - `if new.sort_order is null`: `coalesce(max(sort_order), -1) + 1` over all the farm's sizes.
- **UPDATE:** `tenant_id` and `color_slot` are immutable: raising `TM014` if either changes (the column grants already stop the owner; this covers every role).
- Concurrency: the lock is taken **before** the slot and position are computed, so two adds to one farm queue instead of racing. If a multi-row insert in one statement can't see its own earlier rows, the unique `(tenant_id, color_slot)` key turns that into a clean 23505, never a repeated colour.

**4. `AFTER UPDATE` statement trigger `sizes_keep_one_active`** (`referencing old table as old_rows new table as new_rows for each statement`, no column list, which Postgres requires for transition tables). For every tenant that has a row going from `archived_at is null` to `not null` in the statement: `perform app.lock_tenant_sizes(tenant)`, then if that tenant has **no** row with `archived_at is null`, `TM010` (the whole statement rolls back). Why a statement trigger and not a row trigger: a bulk `update … set archived_at = now()` must not archive everything, and a row trigger can't reliably see its own statement's earlier rows. Why the lock: two owners' phones archiving the last two sizes at once each see the other as still active, so the second waits on the lock, then re-counts (a fresh snapshot per statement in READ COMMITTED) and is refused. This is AC14's "refused by the system" for **every** path, and the archive function's own up-front check is only the friendly error.

**5. `public.size_submissions`** (idempotency ledger for "add", the twin of `production_submissions`):

| Column | Type / constraint |
|---|---|
| `tenant_id` | `uuid not null references public.tenants (id) on delete cascade` |
| `id` | `uuid not null`: the client's `submissionId` |
| `size_id` | `uuid not null`; `foreign key (tenant_id, size_id) references public.sizes (tenant_id, id)` |
| `name` | `text not null`: the **normalised requested name**, so a replay with a different name is refused (audit L1, `TM013`) instead of silently returning the first size |
| `created_at`, `updated_at` | `timestamptz not null default now()` + `set_updated_at` trigger |

`primary key (tenant_id, id)` (leads with `tenant_id`, as 010 requires). No pruning in v1: it is one tiny row per successful add. The retention job (audit L3) is deferred, and **covers both ledgers** when it arrives (§3.9).

**6. Grants and policies** on `sizes` (`revoke all on public.sizes from anon, authenticated;` first):

| Privilege for `authenticated` | Why |
|---|---|
| `select` (table) | unchanged |
| `insert (tenant_id, name)` | The functions run as the owner, so they need it. **Nothing else is insertable**: not `sort_order`, `color_slot`, `archived_at`, or `id`. The trigger fills position and colour, so the owner can't pick a colour or a duplicate slot (AC5). |
| `update (name, sort_order, archived_at, updated_at)` | Rename, reorder, archive, restore. **Not** `tenant_id`, `color_slot`, `id`, `created_at`. `updated_at` is only there so the generic isolation check 4 (§3.6) has teeth. The `set_updated_at` trigger overwrites it anyway. |
| **no `delete`, no `truncate`, no `references`, no `trigger`** | AC25: there is no delete path for an owner, and no delete policy either (the two-lock pattern kept from feature 01 D14: no grant **and** no policy). |

Policies (all `to authenticated`, template from the architecture spec §3): keep `sizes_select`; add `sizes_insert` (`with check (tenant_id = (select app.current_tenant_id()))`) and `sizes_update` (`using` + `with check` the same). **No `sizes_delete`.**

`size_submissions`: `revoke all … from anon, authenticated`, `grant select, insert to authenticated`, policies `size_submissions_select` and `size_submissions_insert` (no update/delete), RLS enabled, one registry row (§3.6).

#### M9 `sizes_functions`

All `language plpgsql`, **`security invoker`**, `set search_path = ''`, `revoke execute … from public, anon`, `grant execute … to authenticated`. Each takes `p_tenant_id` first (filled by `TenantDb.rpc`, never from the request), calls `app.assert_tenant(p_tenant_id)` first (`TM006`), then `app.lock_tenant_sizes(p_tenant_id)`, so every size write for a farm is serialised and each function sees a settled list. Each is one transaction per call. Zero new `security definer` functions (the 010 guard would fail).

Custom SQLSTATEs, continuing the M6 list (`TM001`–`TM007`; never the `PT` prefix):

| SQLSTATE | Raised when | Repository maps it to |
|---|---|---|
| `TM008` | name blank or over 40 characters after normalising | 400 `validation_failed`, `fields.name` |
| `TM009` | another size of the farm (archived too) has the same name ignoring case. `detail` = `{"id","name","archived"}` as JSON | 409 `conflict`, `reason: 'name_taken'`, `existing`, `fields.name` |
| `TM010` | archiving would leave no active size (function pre-check **and** the M8 trigger) | 409 `conflict`, `reason: 'last_active_size'`, `sizes` |
| `TM011` | the size id isn't one of this farm's sizes | 404 `not_found`, `sizes` |
| `TM012` | the size isn't in the state the change needs (rename of an archived size, archive of an archived one, restore of an active one), or `reorder_sizes`' list isn't exactly the farm's active sizes | 409 `conflict`, `reason: 'sizes_changed'`, `sizes` |
| `TM013` | the same `submissionId` was used with a different name | 400 `validation_failed`, `fields.submissionId` |
| `TM014` | `tenant_id` or `color_slot` changed (trigger) | 500 `internal` (unreachable from our routes) |
| `TM015` | the farm already has 100 sizes | 400 `validation_failed`, `fields.name` |
| `TM005` | malformed input (null, duplicate ids in `p_size_ids`, null submission id) | 400 `validation_failed`, `fields.order` / `fields.submissionId` |
| `TM006` | `p_tenant_id` isn't the caller's tenant | 500 `internal` (a server bug) |
| `23505`, `23514` | backstops behind the checks above (name index, name/slot/length checks) | 500 `internal` (logged: the functions check first, under the lock, so a race can't reach them) |

```sql
public.add_size(p_tenant_id uuid, p_submission_id uuid, p_name text) returns jsonb      -- { "changedId": uuid, "replayed": bool }
public.rename_size(p_tenant_id uuid, p_size_id uuid, p_name text) returns jsonb          -- { "changedId": uuid }
public.reorder_sizes(p_tenant_id uuid, p_size_ids uuid[]) returns jsonb                  -- { "changed": bool }
public.archive_size(p_tenant_id uuid, p_size_id uuid) returns jsonb                      -- { "changedId": uuid }
public.restore_size(p_tenant_id uuid, p_size_id uuid) returns jsonb                      -- { "changedId": uuid }
```

They return only what they changed. The **repository reads the whole list right after** (one small select in a new call), so there is one list mapper and one sort order (`sort_order, name, id`) in the code, not a second one in SQL.

- **`add_size` (AC3, AC4, AC5, AC18):** normalise; `TM008` if blank or over 40 code points. Look up `size_submissions (tenant, id)`: if it exists, then if its `name` differs (case-insensitive) `TM013`, else **return its `size_id` with `replayed: true` and write nothing** (a retry after a lost response). Otherwise: `TM009` if the name is taken (lookup by `lower(name)`, detail JSON as above); insert `(tenant_id, name)` (the trigger assigns slot and position, or `TM015`); insert the ledger row; `compact_size_order`; return the new id. If anything raises, the ledger row rolls back with it, so a retry after a *refused* add really re-evaluates.
- **`rename_size` (AC4, AC6, AC7):** normalise, `TM008`; load the size (`TM011` if not this farm's); `TM012` if it is archived (renaming archived sizes is out of scope; UX treats this as "changed elsewhere"); `TM009` if **another** size has that name (`id <> p_size_id`, so a case- or spacing-only change to itself is fine); if the normalised name equals the current name exactly, do nothing and return the id (a retry of a rename that landed); else update. No egg count, colour or position is touched.
- **`reorder_sizes` (AC8–AC10):** `p_size_ids` is the **full wanted order of the active sizes**. `TM005` if it has a null or a duplicate. `TM012` if the **set** of ids is not exactly the farm's current active set (someone added, archived or restored in between, or an archived or foreign id was sent). Then set each active size's `sort_order` to its 0-based position and call `compact_size_order` (archived sizes keep their relative order after the active ones). Sending the wanted order rather than "one step" makes a retry after a lost response harmless (same order, same result) and turns a stale list into a refusal instead of a wrong move. It changes only `sort_order`.
- **`archive_size` (AC11–AC14):** `TM011` if unknown; `TM012` if already archived; `TM010` if it is the only active size (a friendly pre-check; the trigger is the guarantee); `update … set archived_at = now()`; `compact_size_order`. Nothing in `production` is touched, so counts and past days are identical (AC12, AC25).
- **`restore_size` (AC16):** `TM011`; `TM012` if not archived; `update … set archived_at = null, sort_order = (max over all sizes) + 1`; `compact_size_order` puts it last among the active ones. Name and colour are untouched, and the name can't clash because names were unique across archived sizes all along.

**Conflict detection for AC20 (design choice).** No version token. Each change asserts the *state it depends on*, under the farm lock: rename and archive need an **active** size, restore needs an **archived** one, reorder needs the **exact active set**, and every change needs the size to exist. That covers the AC20 example and the realistic single-owner cases (two tabs, or a retry after a lost response) without a version column on every row. What it does not detect, on purpose: two devices renaming the same size, or reordering the same set. Those are last-write-wins, because the owner's intent is still what they saw on screen and nothing is lost (§3.8 D3).

**Idempotency, per action:**

| Action | If the same request arrives twice |
|---|---|
| Add | The ledger (`submissionId`) returns the first size; one size exists (AC18). |
| Rename | Same target name is a no-op; the second call returns the same id. |
| Move | The same wanted order is a no-op. Never "two steps". |
| Archive / Restore | The second call finds the size already in the new state and gets `TM012` (a conflict). The list in the error reply is current, so the screen shows the right thing (§3.9 Q3 proposes making this quiet on the client). |

### 3.2 RLS and grants

| Table | Grants to `authenticated` (anon: `revoke all`) | Policies (all `to authenticated`, `tenant_id = (select app.current_tenant_id())`) |
|---|---|---|
| `sizes` | `select`; `insert (tenant_id, name)`; `update (name, sort_order, archived_at, updated_at)`; **no delete** | `sizes_select`, `sizes_insert` (with check), `sizes_update` (using + with check). **No delete policy.** |
| `size_submissions` (new) | `select, insert` | `size_submissions_select`, `size_submissions_insert` (with check). No update/delete. |

- **Why sizes now has write grants (this changes feature 01 D14, "read-only until this feature").** `security invoker` functions run with the caller's privileges, so an owner who can call `add_size` must be able to `insert` into `sizes`. The alternative, `security definer`, is forbidden by the rules and by the 010 guard. So direct PostgREST writes to `sizes` with the owner's JWT become possible, and the design closes them at the database: column grants (no colour, no id, no tenant, no archived flag on insert, no delete at all), RLS (own farm only), and the M8 triggers (name normalised, colour and position assigned, last active size protected, at most 100 sizes). What is left for a hand-built call is the owner changing **their own** farm's names, order and archive state within those rules, which is exactly what the screen lets them do.
- `production` and `production_submissions` are unchanged. The `production_bounds` trigger reads `sizes.archived_at` as before.
- 010's "`anon` has no privileges" and "no `security definer` function in `public` is executable by `anon`/`authenticated`" checks keep passing. New 010 assertions are in §3.6.

### 3.3 Server API

All six routes use **`defineTenantHandler`** (the guard test picks them up, rules (a), (b2) and (d)). None reads a tenant from the query, body or params, and only the repository calls `db.rpc`/`db.scoped`. Every route can also return 401 `unauthenticated`, 403 `no_farm` and 500 `internal` (from the handler). Each handler is one validation, one or two repository calls, and returns quickly (auth check, membership lookup, one RPC, one small select). Responses carry `Cache-Control: private, no-store`.

#### Contract: additions to `shared/types/api.ts`

```ts
export type ApiErrorCode = 'unauthenticated' | 'no_farm' | 'validation_failed' | 'not_found' | 'conflict' | 'internal' // + 'conflict'

/** Why a 'conflict' (409) happened. The UI has copy for each (feature 02 §2.5 "Copy"). */
export type ApiErrorReason = 'name_taken' | 'last_active_size' | 'sizes_changed'

/** The size that already has the name being saved (AC4). `archived` picks "Restore it instead". */
export interface SizeNameMatch { id: string, name: string, archived: boolean }

export interface ApiErrorData {
  code: ApiErrorCode
  fields?: Record<string, string>
  /** With code 'conflict'. */
  reason?: ApiErrorReason
  /** With reason 'name_taken'. */
  existing?: SizeNameMatch
  /** With 'conflict' and a 404 on a size: the farm's CURRENT sizes, so the screen refreshes with no second request. Absent if that read failed. */
  sizes?: FarmSize[]
}

// ---- Sizes (docs/features/02-farm-settings.md §3.3) ----
export interface SizesResponse { sizes: FarmSize[] }              // GET /api/sizes: ALL sizes, active first then archived, each group in the farm's order
export interface AddSizeRequest { submissionId: string, name: string }      // POST /api/sizes
export interface RenameSizeRequest { name: string }                          // PATCH /api/sizes/:id
export interface ReorderSizesRequest { sizeId: string, order: string[] }    // PUT /api/sizes/order
/** Every mutation returns the whole updated list and the id of the size that changed (for the highlight and toast). */
export interface SizeChangeResponse { sizes: FarmSize[], changedId: string }
```

`FarmSize`/`FarmSummary` keep their shape. Doc-comment change only: `sortOrder` is compact (`0..n-1`, active sizes first), and `active` is `false` once archived. **Quantities: none; this feature carries no egg counts.**

`shared/constants/sizes.ts`, the single source of field keys, numbers and messages used by both the server and the form:

```ts
export const SIZE_FIELDS = { name: 'name', order: 'order', submissionId: 'submissionId', id: 'id' } as const
export const MAX_SIZE_NAME_LENGTH = 40        // characters (code points), after normalising; = sizes_name_length
export const MAX_SIZES_PER_FARM = 100         // = the TM015 cap in M8 (a unit test compares the two)
export const SIZE_MESSAGES = {
  nameBlank: 'Enter a size name.',
  nameTooLong: 'Use 40 characters or fewer.',
  nameTaken: (existing: string) => `You already have a size called ${existing}.`,
  nameArchived: (existing: string) => `${existing} is archived. Restore it instead.`,
  tooMany: 'You have reached the limit of 100 sizes.',        // new copy, see §3.9 Q2
  lastActive: 'Keep at least one size.',
  changedElsewhere: 'Your sizes were changed somewhere else. The list is up to date now.',
} as const
```

`shared/utils/size-name.ts` (pure, used by the server, the schemas and the form):
- `normalizeSizeName(raw: string): string` = `raw.normalize('NFC').replace(/\s+/gu, ' ').trim()`. Idempotent. **Twin of `app.normalize_size_name`**, and the DB stays the authority (a name that reaches it is normalised again).
- `sizeNameLength(name)` = code points (`[...name].length`), to match `char_length`.
- `checkSizeName(raw, sizes, selfId?)` → `{ ok: true, name } | { ok: false, reason: 'blank' | 'too_long' | 'taken', message, existing?: SizeNameMatch }`. Compares `toLowerCase()` of the normalised name to every size except `selfId`, active or archived, and returns the **existing size's own spelling** for the message. It is the form's live check (UX R3); the server does **not** use it for the clash (the DB decides, under the lock).

`shared/schemas/sizes.ts` (zod 4, relative imports, unknown keys stripped, so a smuggled `tenant_id`, `colorSlot` or `sortOrder` never reaches the repository):
- `sizeNameSchema`: `z.string()`, `.transform(normalizeSizeName)`, then blank → `nameBlank`, length over 40 (by code points) → `nameTooLong`. Never truncates.
- `addSizeBodySchema = { submissionId: z.uuid(), name: sizeNameSchema }`; `renameSizeBodySchema = { name: sizeNameSchema }`.
- `reorderSizesBodySchema = { sizeId: z.uuid(), order: z.array(z.uuid()).min(1).max(MAX_SIZES_PER_FARM) }`, refined: no duplicate ids, and `sizeId` is in `order` (both → `order`).
- `sizeIdParamsSchema = { id: z.uuid() }`.
- Server messages come from `SIZE_MESSAGES`, so the form and the API say the same thing.

#### Routes

| Method, path | File | Request | 200 response | Errors |
|---|---|---|---|---|
| `GET /api/sizes` | `server/api/sizes/index.get.ts` | none (query ignored) | `SizesResponse` | none beyond the common ones |
| `POST /api/sizes` | `server/api/sizes/index.post.ts` | `AddSizeRequest` | `SizeChangeResponse` (`changedId` = the new size; a replay returns the first one) | 400 `fields.name` (blank, too long, too many sizes), `fields.submissionId` (missing, or reused with another name); 409 `name_taken` + `existing` |
| `PATCH /api/sizes/:id` | `server/api/sizes/[id].patch.ts` | `RenameSizeRequest` | `SizeChangeResponse` | 400 `fields.name` / `fields.id`; 404 `not_found` + `sizes`; 409 `sizes_changed` + `sizes` (size archived meanwhile); 409 `name_taken` + `existing` |
| `PUT /api/sizes/order` | `server/api/sizes/order.put.ts` | `ReorderSizesRequest` (the **wanted full order of the active sizes** and the size that was moved) | `SizeChangeResponse` (`changedId` = `sizeId`) | 400 `fields.order`; 409 `sizes_changed` + `sizes` (the active set differs) |
| `POST /api/sizes/:id/archive` | `server/api/sizes/[id]/archive.post.ts` | none | `SizeChangeResponse` | 400 `fields.id`; 404 + `sizes`; 409 `last_active_size` + `sizes`; 409 `sizes_changed` + `sizes` (already archived) |
| `POST /api/sizes/:id/restore` | `server/api/sizes/[id]/restore.post.ts` | none | `SizeChangeResponse` | 400 `fields.id`; 404 + `sizes`; 409 `sizes_changed` + `sizes` (not archived) |

Notes:
- **Archive and restore are their own routes**, not a `PATCH { archived: bool }`, so the API never exposes `archived_at` and there is no way to send an arbitrary timestamp or a colour.
- **Add is idempotent by `submissionId`**, with the same retry rule as feature 01: the id is made when the form opens, reused on a retry of the same name, and replaced when the name changes (§3.4).
- **Reorder** sends the whole active order plus the moved id. There is no "step" parameter anywhere.
- The error bodies use the existing shape: `FetchError.data.data` is `ApiErrorData`. `apiError(status, code, fields?, extra?)` in `server/utils/errors.ts` gains an `extra` argument for `reason`, `existing` and `sizes`; `API_ERROR_CODES` and `STATUS_MESSAGES` gain `conflict` (`'Conflict'`). `toApiError` already passes our own errors through.

#### Repository and server utils

- **`server/repositories/sizes.ts`** (new): `listSizes(db)`, `addSize(db, input)`, `renameSize(db, id, name)`, `reorderSizes(db, input)`, `archiveSize(db, id)`, `restoreSize(db, id)`. Each write calls `db.rpc(...)`, then `listSizes(db)`, and returns `{ sizes, changedId }`. `listSizes` is `db.scoped('sizes').select('id, name, sort_order, color_slot, archived_at')` mapped by the **same** mapper as `/api/me` (`toFarmSizes`, exported from `server/repositories/tenants.ts`; ordering `sort_order, name, id`, one place). The function results are parsed with small zod schemas (the generated type is `Json`), as in `production.ts`.
- **`mapSizeDbError(db, error)`** implements the SQLSTATE table in §3.1. It is async because for `TM010`, `TM011`, `TM012` it tries `listSizes(db)` to attach `sizes`; if that read also fails it throws the mapped error **without** `sizes` (the client then refreshes on its own). `TM009` parses `error.details` (JSON) into `existing`; if parsing fails it is a generic 409 `name_taken` with a fields message.
- `TenantDb.rpc` and its types need no change: `add_size` etc. take `p_tenant_id`, so they appear in `TenantRpc` once `bun run db:types` is run.
- **`/api/me` and `getCurrentFarm`** are unchanged (they embed all sizes). `ctx.farm.sizes` stays available to handlers.

### 3.4 Frontend

**Page and shell**
- **`app/pages/settings.vue`** (default `farm` auth level; SSR renders it from the sizes already in the `useMe` payload, so the first paint has no skeleton). `definePageMeta({ title: 'Settings', subtitle: 'Farm settings', back: true })`. **No `primaryAction`** (no top-bar Add, no FAB: UX C2). No tab is highlighted (`findActiveNavItem('/settings')` is undefined), the same as the 404 page. The page body is `SizesManager` inside the band layout (`lg:grid-cols-[280px_1fr]`, one column below `lg`).
- **`app/types/page-meta.d.ts`**: add `subtitle?: string` (shown when the route isn't a nav destination) and `back?: boolean` (phone-only ← button). **`app/layouts/default.vue`**: `subtitle` falls back to `route.meta.subtitle`; when `route.meta.back`, render a 44px `UButton` (`i-lucide-arrow-left`, `aria-label="Back"`, `md:hidden`) at the start of the navbar `#left`. Its click goes `router.back()` when `history.state.back` exists, else `navigateTo('/')` (UX C3). Generic, so later screens reuse it.
- **`app/components/AppAccountMenu.vue`**: add `{ label: 'Settings', icon: 'i-lucide-settings', to: '/settings', active: route.path === '/settings' }` as the **first item of the middle group**, above Dark mode. A link item closes the menu on select (Dark mode still calls `event.preventDefault()` to stay open). Items stay `min-h-11`. The menu is already rendered in the mobile top bar, the expanded sidebar footer and the tablet rail, so AC1 holds on every screen with no other change.
- **`app/app.vue`** toaster: today only pages with a FAB raise the viewport. Change the default (no FAB) to `bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:bottom-4` so a toast on Settings, and on every non-FAB page, clears the bottom tabs (UX R4). FAB pages keep the 84px offset.

**Keeping the farm-context size list in sync (the answer to "how does the Production form and chart stay current")**
- Every consumer already reads `useFarm()`, which reads `useMe().me.farm.sizes`: `ProductionForm` (`activeSizes`, `sizeById`), `ProductionDayCard` (`sizeById`), `ProductionTrendChart` (`sizes`). So **the one place to update is `me.farm.sizes`**, and everything follows.
- **`useMe()`** gains `setSizes(sizes: FarmSize[])`: replaces `me.farm.sizes` when a farm exists, does nothing otherwise. It never touches `status`.
- **`useFarm()`** gains `archivedSizes` (computed), `applySizes(sizes)` (calls `setSizes`), and `refreshSizes()` is **reimplemented**: `GET /api/sizes`, then `applySizes`, resolving `'ok' | 'error'`. On error it changes nothing. The current `refreshSizes` calls `useMe().ensure({ force: true })`, whose failure path sets `me = null` and `status = 'error'`, which makes the layout replace the whole app with "Couldn't load your farm". That was tolerable while sizes never changed and is not acceptable for "a quiet refresh that fails changes nothing on screen" (UX States, Refreshing). `ProductionForm`'s existing `void refreshSizes()` keeps working.
- **Mutations apply the reply.** `useSizeMutations` calls `applySizes(reply.sizes)` on success and also on a conflict reply that carries `sizes`. So a change made on Settings is in the farm context before the response promise resolves, and the Production form (opened later), day cards and chart show it with no reload (AC3, AC9).
- **Another phone or tab** is not pushed (no realtime, out of scope). Its staleness is caught the same way as today: a save on a stale form gets `TM001` (`stale_sizes`), which refreshes the list, and the Settings screen quietly refreshes when it opens.
- **A form that is already open must not re-render against a changed list.** `ProductionForm` builds `state.lines` once at setup, but its `sizeLines` is a live `computed` over the farm context, so a `refreshSizes()` after a stale-sizes error would add a line with no `state.lines[id]` and crash the template. Fix in F7: build `sizeLines` **once at setup** (a plain snapshot), the same moment `state` is built. The existing "Your sizes have changed. Close this form and open it again." message is then true.

**Shared helpers (single source each)**
- `shared/utils/size-name.ts`, `shared/constants/sizes.ts`, `shared/schemas/sizes.ts` (§3.3).
- `app/utils/size-order.ts` (pure): `groupSizes(sizes) → { active, archived }` (stable, active first), `moveInOrder(activeIds, id, 'up' | 'down') → string[] | null` (null at the ends, so the first row's ↑ and the last row's ↓ do nothing, AC10), `canArchive(activeCount)`.
- `app/utils/size-errors.ts` (pure): `mapSizeError(e) → SizeError`, kinds `network | name_invalid | name_taken | last_active | stale | not_found | unknown`, carrying `fields`, `existing` and `sizes` where present. Same shape and style as `production-errors.ts`. 401 is handled by `$api`. A 409 with `reason: 'name_taken'` → `name_taken`; `last_active_size` → `last_active`; `sizes_changed` and every 404 → `stale`; 400 with `fields.name` → `name_invalid`; a fetch with no response, or 502/503/504 → `network`.
- `app/utils/size-copy.ts`: the UI-only copy from UX §2.5 (toasts, help text, aria-labels), as `PRODUCTION_COPY` does. Field messages come from `SIZE_MESSAGES`.
- `app/utils/size-colors.ts` is **unchanged**. Slot → colour stays there, and no colour is shown on Settings (UX R5).
- Nothing here converts quantities, so `shared/utils/quantity.ts` and `eggsPerTray` are not involved.

**Composables**
- `useSizeMutations()`: `add(req)`, `rename(id, name)`, `move(sizeId, order)`, `archive(id)`, `restore(id)`, each returning `{ ok: true, data } | { ok: false, error: SizeError } | null` (null when another change is in flight: one in-flight guard for the whole card, so a double tap can't add twice or move two steps: AC18). Exposes `pending` (which action and size id, for the spinner and for disabling every other control). 20 s timeout like production writes, so a hung request becomes the normal "Couldn't save" + retry path. On success and on a conflict reply with `sizes` it calls `applySizes`.
- **Add retry rule** (same as feature 01 §3.4): `submissionId = crypto.randomUUID()` when the Add form opens; a retry with the **same normalised name** reuses it; a changed name gets a new id. Closing and reopening the form gets a new id.

**Components** (Nuxt UI v4; the frontend dev confirms props against the installed version)

| Component | Built from | Notes |
|---|---|---|
| `SizesManager.vue` | `UCard`-look wrapper, `USkeleton`, `UAlert`, `UButton` | The Sizes card: heading and help, the active `<ul>`, the "only one size" line, the Add button/form, the top `UAlert` for move/restore failures and AC20, the load-failure and loading states. Owns `useSizeMutations` and the `aria-busy` state. Sizes come from `useFarm()`; opens with a quiet `refreshSizes()` on mount. Loading = no sizes in context yet and a fetch running; load failure = no sizes and the fetch failed (UX States). |
| `SizeRow.vue` | `<li>`, `UButton` ghost icon ×2 (↑ ↓), `UDropdownMenu` (Rename, Archive) | 56px min height, 44px controls, aria-labels from UX Copy. Renders the rename form in place of itself (UX flow B). Archive item disabled with the reason when it is the only active size. |
| `SizeNameForm.vue` | `UForm`, `UFormField`, `UInput`, `UAlert`, `UButton` | Shared by Add and Rename. Live check with `checkSizeName` (blur, submit, then per keystroke), Save blocked only while a message shows, "matches an archived size" message with the **Restore {Name}** button (emits `restore(existing.id)`), server `fields.name` mapped onto the field, inline error `UAlert` for network failures, typed name kept on failure. Rename shows the "Past days will show this new name too." help. |
| `ArchivedSizesCard.vue` | `UCard` look, `UBadge` (neutral, subtle, "Archived"), `UButton` outline | Shown only when `archivedSizes.length > 0`. Restore button per row. |
| `ArchiveSizeDialog.vue` | `UModal` (max 400px), `UAlert`, `UButton` | Modelled on `ProductionDeleteDialog.vue`: Cancel focused, closing disabled while saving, inline failure alert, primary (not red) Archive. `last_active` shows "Keep at least one size."; `stale` closes it. |
| `ProductionForm.vue` (change) | existing | See below. |
| `ProductionTrendChart.vue` / `production-chart.ts` (change) | existing | See below. |
| `AppAccountMenu.vue`, `layouts/default.vue`, `app.vue` (change) | existing | See above. |

**Edit day with an archived size (S3, AC13), `ProductionForm.vue`**
- Build `sizeLines` once at setup as: the **active** sizes in the farm's order, then any archived size that is on the day being edited (in its order). Log mode is the active sizes only. Each line carries `archived: boolean`. This replaces the current sort by `sortOrder`, which would put an archived size back in its old slot (UX asked for active first).
- In the template, an archived line shows `<UBadge color="neutral" variant="subtle" size="xs">Archived</UBadge>` after the name, and passes `label="{name} (archived)"` to `QuantityInput`, which already builds "{label} trays" and "{label} loose eggs" from it.
- Behaviour is unchanged: the line is pre-filled and editable, setting it to 0 removes it, and saving without touching it sends the same count (the day's `sizeIds` still include it, and `replace_production_day` keeps it, as `production_bounds` allows).

**Chart legend (S4, AC12), `production-chart.ts`**
- `buildChartModel` already includes a size only if it is active or has eggs in the range. Change only the **order** of `shown`: active sizes first (farm order), then archived-with-eggs (farm order), then Rejects. Names only, no "Archived" suffix (UX). No other chart change. `useFarm().sizes` already carries `active`.

**Nuxt UI notes for the dev:** the account-menu item uses the `to` link form of `DropdownMenuItem`; the ↑ ↓ buttons are `UButton` `variant="ghost"` with icon-only labels; the confirm is `UModal` as in `ProductionDeleteDialog`; the loading placeholder is `USkeleton`; toasts are `useToast().add` (the design's inverted toast is already themed in `app.config.ts`).

### 3.5 Invariants at risk

| Rule (CLAUDE.md / spec §9) | How this design protects it |
|---|---|
| `tenant_id` + `updated_at` + RLS on every table | `size_submissions` has `tenant_id` (FK to tenants), `updated_at` + trigger, RLS, a PK leading with `tenant_id`, and a registry row. 010 fails otherwise. `sizes` gets insert and update policies with the tenant `with check`. |
| Derive the tenant on the server; never trust the client | No route reads a tenant. Zod strips unknown keys (`tenant_id`, `colorSlot`, `sortOrder`, `archived`). `p_tenant_id` comes only from `ctx.tenantId` via `TenantDb.rpc`, and every function asserts it equals `app.current_tenant_id()` (`TM006`). Guard test (d) covers the six new route files. |
| Tenant scoping in one layer; RLS stays on | Functions are `security invoker` and run as the owner (RLS applies inside). They filter `tenant_id = p_tenant_id` **and** RLS filters. `listSizes` goes through `db.scoped`. No new `security definer`. |
| Service role not used at runtime | Nothing here uses it. |
| Multi-row writes are `security invoker` functions through `TenantDb.rpc` | Add (size + ledger + compaction), rename, reorder (many rows), archive and restore (row + compaction) are each one function call, so each is all-or-nothing. |
| Sizes are per-farm rows, **never deleted**, retired with `archived_at`, stable colour slot | No delete grant, no delete policy, no delete route, no delete in any function (pgTAP proves an owner gets 42501). Archive only sets `archived_at`. `color_slot` is assigned once by the trigger, is unique per farm forever, is in no update grant, and is immutable in the trigger. Rename, reorder, archive and restore don't touch it, so **no other size's colour ever changes**. |
| Never hardcode the size list | The UI iterates `useFarm()` lists. The only place "Small/Medium/Large/Jumbo" appears is still `app.seed_default_sizes`. Copy examples (Peewee, Jumbo) are text in help and dialogs, not data. |
| Eggs are the unit; eggs-per-tray per farm | No quantities on this screen or API. Rename, reorder, archive and restore never write `production` (AC25). Tray size is unchanged. |
| Production `size_id` belongs to the same farm; archived sizes keep history | The composite FK is untouched. Archiving keeps every past row valid and readable. New eggs onto an archived size are refused at the DB (`production_bounds`, `TM001`) and by `log_production`. |
| Categories are data; one `status` field; nullable meanings | Unchanged. `archived_at` is a nullable timestamp with a meaning (null = active), not a second status column on another table. |
| Serverless: short handlers, no long-lived pool | supabase-js over HTTP, one RPC + one small select per request. The advisory lock is transaction-scoped and held for milliseconds. |
| Every route wrapped; guard test | The six routes use `defineTenantHandler`; `server-guards.spec.ts` expects them by name. |

### 3.6 Tests

**pgTAP** (`bun run test:db`; the local stack must be running):
- **`000_helpers.sql` registry:**
  - `sizes` attack insert becomes `insert into public.sizes (tenant_id, name) values (%1$L, 'Attack')`. The old statement names `sort_order` and `color_slot`, which the owner can no longer insert, so it would raise 42501 for the **wrong reason** (a column privilege, not RLS) and stop testing the policy.
  - Add `public.size_submissions` after `sizes`. Seed: `insert into public.size_submissions (tenant_id, id, size_id, name) select %1$L, gen_random_uuid(), s.id, 'seed' from public.sizes s where s.tenant_id = %1$L order by s.sort_order limit 1`. Attack: `… values (%1$L, gen_random_uuid(), gen_random_uuid(), 'x')`. A random `size_id` avoids a NOT NULL trap, and RLS (42501) is reported before the FK check.
  - Because `tenant_id` and `updated_at`/`sort_order` privileges are column-limited, the generic checks 8 and 10 (which write `tenant_id`) pass on the privilege error for `sizes`. **Check 4** (`update … set updated_at = updated_at where tenant_id = victim`) is why `updated_at` is in the update grant: it keeps a weakened `sizes_update` detectable. The named cases below cover the rest.
- **`010`:** (plan count grows by the new assertions)
  - the five new public functions are `not prosecdef`, not executable by `anon`, executable by `authenticated`;
  - the new `app.*` helpers (`normalize_size_name`, `lock_tenant_sizes`, `compact_size_order`, `sizes_write_guard`, `sizes_keep_one_active`) are not executable by `anon`;
  - `authenticated` has **no** `DELETE` or `TRUNCATE` on `sizes`, and no column-level `INSERT` on `sort_order`, `color_slot`, `archived_at`, `id`, and no `UPDATE` on `tenant_id`, `color_slot`, `id`, `created_at` (`has_column_privilege`).
- **`020` named cases (AC26, AC27):**
  - As A: each of the five RPCs with **B's tenant id** raises `TM006`, and B's sizes are unchanged when re-read as postgres.
  - As A with **A's tenant but B's size id**: `rename_size`, `archive_size`, `restore_size` raise `TM011`; `reorder_sizes` with B's ids raises `TM012`.
  - As A, a **direct** `update public.sizes set name = 'Pwned' where tenant_id = <B>` affects 0 rows; `insert into public.sizes (tenant_id, name) values (<B>, 'x')` raises 42501; `delete from public.sizes` raises 42501 (no grant). B's names, order and archive flags are unchanged.
  - A reads none of B's `size_submissions`. Anon gets 42501 executing each of the five RPCs. The reverse direction (B against A) is run for the RPC cases too.
- **New `050_sizes.test.sql` (rules and functions, as the farm owner, plus postgres setup):**
  - **Names (AC4, AC7):** `'  Extra   Large '` is saved as `Extra Large`; composed and decomposed accents collapse to one name; blank → `TM008`; 40 characters OK and 41 → `TM008` (counting an emoji as one); `large` vs `Large` → `TM009` with `detail` naming the active match; a match on an **archived** size → `TM009` with `archived: true`; renaming `Large` to `LARGE`, or `Extra Large` to `Extra  Large`, works (no clash with itself); renaming to another size's name → `TM009`; a direct `insert` with a padded or spaced name is normalised, and a direct blank insert fails 23514.
  - **Add (AC3, AC5, AC18):** the new size is last among the active ones and `sort_order` is compact `0..n-1` after every operation; slots are `4, 5, …` and **never repeat**, including after archiving one (its slot is not reused); the 11th and 12th sizes get slots 10 and 11; the same `submissionId` twice returns the same `changedId` and leaves one new row (`replayed: true`); the same id with a different name → `TM013`; a refused add (`TM009`) leaves no ledger row, so a retry with a fixed name works; a **direct** owner insert of a size gets a colour and position assigned by the trigger; the 101st size → `TM015`.
  - **Rename (AC6, AC25):** production totals and every day's per-size counts are identical before and after; rename of an archived size → `TM012`; unknown id → `TM011`; renaming to its own exact name is a no-op.
  - **Reorder (AC9, AC10, AC25):** a full order is applied, colours and eggs unchanged; an order missing an active size, including an archived or foreign id, or with a duplicate → `TM012` / `TM005` and nothing changes; the same order twice is a no-op.
  - **Archive (AC11–AC14):** archiving sets only `archived_at`; **every other size's colour, name and counts are unchanged**; archiving an archived size → `TM012`; archiving the **last** active size → `TM010` and nothing changes; as the owner **directly**, `update public.sizes set archived_at = now() where id = <last active>` → `TM010`, and a bulk `update public.sizes set archived_at = now()` on all the farm's sizes → `TM010` with **no row changed**; archiving 3 of 4 works.
  - **Restore (AC16):** the size is active, last among the active ones, with the same name, colour and past eggs; restoring an active size → `TM012`.
  - **AC13 through the new path** (the trigger itself was tested in 040): after archiving Jumbo, `log_production` with Jumbo → `TM001`; `replace_production_day` on a day holding Jumbo keeps and can edit that line; a direct insert of a **new** archived-size line → `TM001`; `production_days` still returns the archived size's counts; archived lines sort after active ones on the day.
  - **No delete (AC25):** as the owner, `delete from public.sizes` and `truncate public.sizes` → 42501; as postgres, deleting a size that has production → 23503 (existing); updating `color_slot` as the owner → 42501, as postgres → `TM014`; updating `tenant_id` as postgres → `TM014`.
  - **Not testable in one pgTAP session (concurrency):** two owners archiving the last two sizes at once, and two adds at once. QA runs the manual recipe in §5: in session 1 `begin; select public.archive_size(…A…);` without committing, in session 2 `select public.archive_size(…B…);` (it must block), then commit session 1 (session 2 must fail with `TM010`); and two concurrent `add_size` calls must produce two different colour slots.
- **`090` mutations** (so the new policies aren't vacuous): m14 `sizes_insert` → `with check (true)`; m15 `sizes_update` → `using (true) with check (…)`; m16 `grant delete on public.sizes to authenticated` + a permissive delete policy. Each must be detected by the checker. Update `plan(...)` and the final policy-list assertion (add `sizes_insert`, `sizes_update`, `size_submissions_select`, `size_submissions_insert`, and `public.size_submissions` to the table list).
- **`030`/`040`:** unchanged and must still pass (`040` inserts a padded `' large '`, expecting 23505, and a duplicate slot, also 23505: both still hold, because the trigger normalises the name and keeps an explicit slot).

**Vitest** (`bun run test:unit`):
- `size-name.spec.ts`: `normalizeSizeName` (leading/trailing, inner runs, tabs/newlines/NBSP, NFC, idempotent); `sizeNameLength` counts code points; `checkSizeName` (blank, 40 vs 41, case-insensitive match on active and on archived with the `existing` spelling, the size itself excluded (AC7), a spacing-only change is not "unchanged").
- `sizes-schemas.spec.ts`: each body and param schema; `tenant_id`, `colorSlot`, `sortOrder`, `archived` stripped; `order` rejects duplicates, an empty list, more than 100, and a `sizeId` not in `order`; `submissionId` must be a UUID.
- `sizes-repo.spec.ts` (fake client, as `production-repo.spec.ts`): every SQLSTATE → the right status, `code`, `reason`, `fields`; `existing` parsed from `details`; `sizes` attached on `TM010/11/12` and **absent** when that follow-up read fails; `p_tenant_id` injected from the db, never from input; a write returns `{ sizes, changedId }`.
- `size-errors.spec.ts`, `size-order.spec.ts` (`moveInOrder` at both ends and in the middle, `groupSizes` keeps the order, active first).
- `production-chart.spec.ts`: archived-with-eggs after the active ones; archived without eggs omitted; active sizes at 0 still shown.
- `size-colors.spec.ts`: no `SIZE_PALETTE` entry is the reject colour or a red class (AC5: never red).
- A constants test: `MAX_SIZES_PER_FARM` equals the number in the M8 migration, and `MAX_SIZE_NAME_LENGTH` equals the `sizes_name_length` bound (the same pattern as `MAX_EGGS_PER_LINE`).
- `server-guards.spec.ts`: "finds the server sources" expects the six sizes route files, so rules (a), (b2) and (d) demonstrably run over them.
- Component and page behaviour (states, focus, 44px targets, dark mode) has no unit harness in this repo. It is verified by QA against the ACs, and the pure logic sits in the utils above so it is covered.

### 3.7 Tasks

Order: contract, then DB and server, with the frontend building against the contract in parallel. **B1 unblocks everything.** After B1: the DB track (B2, B3, B4), the server track (B5, B6, needs B3 for `db:types`) and the whole FE track (F1–F8, stubbing `$api` from the §3.3 types) can run **in parallel**. **F1 (chart order), F7 (Edit day) and the shell pieces of F2 need nothing from the backend at all** and can start now, even before B1. FE integration against the real routes needs B6.

**Backend**
- [x] **B1 [BE] (contract; unblocks FE)** `shared/types/api.ts` additions (§3.3: `conflict`, `ApiErrorReason`, `SizeNameMatch`, the extra `ApiErrorData` fields, the sizes request/response types), `shared/constants/sizes.ts`, `shared/utils/size-name.ts`, `shared/schemas/sizes.ts`, and the Vitest specs for them (`size-name`, `sizes-schemas`, the constants test). Extend `server/utils/errors.ts` (`conflict` code and message, `apiError` `extra` argument) with a test.
- [x] **B2 [BE]** Migration M8 `sizes_write_rules`: helpers, existing-row normalisation and `sizes_name_normalised`, `sizes_write_guard` and `sizes_keep_one_active` triggers, `size_submissions`, grants and policies. Rules-level pgTAP in `050` (names, colour, cap, no delete, last-active direct and bulk, immutability).
- [x] **B3 [BE]** Migration M9 `sizes_functions`: the five RPCs with the SQLSTATEs, revokes and grants. Function-level pgTAP in `050` (add/rename/reorder/archive/restore, idempotency, AC13 through the new path). Run `bun run db:types`.
- [x] **B4 [BE]** pgTAP wiring: registry rows (`sizes` attack statement, `size_submissions`), `010` additions, `020` named cases both ways, `090` m14–m16 and the policy list. `bun run test:db` passes.
- [x] **B5 [BE]** `server/repositories/sizes.ts` (+ export `toFarmSizes` from `tenants.ts`, `mapSizeDbError`), `sizes-repo.spec.ts`.
- [x] **B6 [BE]** The six routes; extend `server-guards.spec.ts`. Verify end to end on the local stack: add (and a replay), a name clash with an archived size, rename, reorder, archive, the last-size refusal, restore, a foreign size id, `?tenant_id=` and a body `tenant_id` ignored, and that `/api/me` shows the change on its next call.
- [x] **B7 [BE]** Manual concurrency check (§3.6) and a note in §4. Update the architecture spec if the implementation differs (the spec was updated by the architect on 2026-09-26).

**Frontend**
- [x] **F1 [FE]** `production-chart.ts` ordering (active first, archived-with-eggs next) + spec; `app/utils/size-order.ts`, `size-errors.ts`, `size-copy.ts` + specs; `useMe().setSizes`; `useFarm()` (`archivedSizes`, `applySizes`, the quiet `refreshSizes` over `GET /api/sizes`).
- [x] **F2 [FE]** Shell: `page-meta.d.ts` (`subtitle`, `back`), the layout's subtitle fallback and phone back button, the **Settings** item in `AppAccountMenu`, the toaster offset in `app.vue`, and `app/pages/settings.vue` with the band layout and a placeholder card (AC1, AC23).
- [x] **F3 [FE]** `useSizeMutations` (in-flight guard, timeout, apply reply, the add retry rule).
- [x] **F4 [FE]** `SizesManager` list: loading skeleton, load failure, refresh on mount, active rows, ↑ ↓ (via `moveInOrder`, sending the full order), the "only one size" line and disabled Archive, the top alert, row highlight, focus rules (AC2, AC8–AC10, AC14, AC21–AC22).
- [x] **F5 [FE]** `SizeNameForm`: Add (inline, `submissionId`) and Rename (in place of the row), live name check, server field errors, the "archived, restore it instead" message and its Restore button, toasts (AC3, AC4, AC6, AC7, AC17–AC19).
- [x] **F6 [FE]** `ArchiveSizeDialog`, `ArchivedSizesCard` and Restore, the AC20 "changed elsewhere" flow for every action, and the Restore toast (AC11, AC12, AC15, AC16, AC20).
- [x] **F7 [FE]** `ProductionForm` Edit day: snapshot `sizeLines`, active first, the Archived badge and accessible names (AC13, S3).
- [x] **F8 [FE]** Polish and checks: 375px and tablet with the sidebar collapsed and expanded, no horizontal scroll, 44px targets, light and dark, reduced motion, screen-reader labels, a farm with 12 sizes (dashed slots), a farm with archived sizes (AC23, AC24). Confirm the Production form, day cards and chart pick up each change with no reload (AC3, AC9).

### 3.8 Decisions

- **D1 Database-enforced rules with column-level grants, not `security definer`.** The rules force `security invoker` functions, so the owner needs write access, so direct PostgREST writes must be safe on their own. Alternatives rejected: `security definer` functions (bypass RLS; forbidden by the rules and the 010 guard); table-level `insert, update` grants with the rules only in the functions (an owner could then set their own colour slot, un-archive with a stale order, or archive the last size straight through PostgREST, which fails AC14's "refused by the system" for every request); a Nitro-side privileged connection (the settled decision is supabase-js as the user).
- **D2 Colour and position are assigned by a trigger, and the owner can't send either.** Smallest unused slot per farm, so "never repeat until the palette is used up, never red, never change another size's colour" hold structurally (slots 0–9 are distinct non-red palette colours; a slot is never reused). Rejected: a `SIZE_PALETTE`-aware function in SQL (the DB only needs "unused"; the palette is a UI concern and 10+ already means "repeat dashed"); the client choosing a slot (a race, and it breaks AC5's guarantee).
- **D3 Conflict detection by asserting the state each change depends on, not by version tokens.** Covers AC20 as written and a retry after a lost response. Rejected: an `updated_at`/version token on every request (more plumbing on all five routes, and it still needs a merge rule). Accepted gap: two devices renaming or reordering the same sizes is last-write-wins.
- **D4 Reorder sends the full wanted order of the active sizes plus the moved id.** Idempotent on retry, and a stale list is refused by the exact-set check. Rejected: a step ("move up one"), which moves two places on a retry; a `position` for one size (a stale list quietly lands it next to the wrong neighbours).
- **D5 A cap of 100 sizes per farm, archived included.** `/api/me` embeds every size on every request and one Log form save carries a line per active size (`MAX_SIZE_LINES = 100`), and sizes are never deleted, so without a cap the payload is unbounded. 100 is far beyond any farm. It is a small change to the PM's "no maximum" line (out of scope: "setting a minimum or maximum number of sizes beyond at least one active"), so it is **flagged for the owner** (§3.9 Q2). Rejected: no cap (an unbounded `/api/me`); a small cap like 20 (a farm that churns names could hit it through archived sizes, which are never deleted).
- **D6 Mutations return `{ changedId }` from SQL and the repository re-reads the list.** One list mapper and one order (`sort_order, name, id`) in the code, shared with `/api/me`. Cost: one more small select per write. Rejected: building the list as jsonb in SQL (a second definition of the sort and the shape).
- **D7 `sort_order` is compacted on every order-affecting write, active sizes first.** Keeps "add at the end", "restore to the end" and "archived in their last order" trivial, and makes day cards and Edit day list archived lines after the active ones with no client sorting. Rejected: a sparse or fractional order (needs rebalancing); leaving archived sizes in their old slot (day cards and the legend would interleave archived and active).
- **D8 Archive and restore are `POST /api/sizes/:id/archive|restore`, and reorder is `PUT /api/sizes/order`.** The API never exposes `archived_at`, a colour or a raw `sort_order`. Rejected: one `PATCH` that takes any of those.
- **D9 A dedicated `GET /api/sizes` next to sizes riding on `/api/me`.** `/api/me` keeps the form instant on first load (feature 01 D10). The new route gives Settings and the stale-form path a quiet refresh that can't blank the shell. `refreshSizes()` moves from `ensure({ force })` to it.
- **D10 Names are normalised to NFC as well as trimmed and collapsed.** AC4 says only spaces, but two names that look identical and differ only in Unicode composition would defeat the "no two identical labels" purpose of the unique index. It changes nothing for ordinary names. Owner-visible only in that a pasted decomposed "é" is stored precomposed.
- **D11 The idempotency ledger stores the requested name** (audit L1), so a replay with a different name is an error, not a silent return of the first size.
- **Doc updates done by the architect (2026-09-26):** `docs/egg-farm-app-architecture-spec.md` §3 "As built" (write grants plus DB triggers for tables that invoker functions write; the shared error additions; the per-farm sizes lock) and §5 "Sizes" (management rules, colour assignment, cap, no delete). **Proposed `CLAUDE.md` wording (not edited, for the team lead to put to the user):** under "Units and data model", extend the sizes bullet with "Sizes are managed (add, rename, reorder, archive, restore) through `security invoker` functions; colour slot and position are assigned by the database, an owner can never delete a size, and a farm always keeps one active size (a database trigger)."

### 3.9 Open questions / pushback

1. **Feature 01 D14 changes (note, not a conflict).** "Owners can't write `sizes`" no longer holds; it can't, given `security invoker` functions. The design confines it with column grants and triggers (D1, §3.2). The security auditor should review this on its next run (it touches RLS and grants).
2. **Owner call: cap of 100 sizes per farm (D5).** Proposed as a technical guardrail. It slightly goes against "no maximum number of sizes" in the out-of-scope list. If the owner strikes it, `TM015`, `MAX_SIZES_PER_FARM` and `SIZE_MESSAGES.tooMany` are removed, and `/api/me` stays unbounded. The message `You have reached the limit of 100 sizes.` is new copy for UX/PM to approve.
3. **UX/PM option, not blocking: quiet archive/restore retries.** A retry of an archive that already landed (response lost) gets `TM012`, so UX's table shows the "changed somewhere else" alert although the owner did it. Optional client behaviour: after a conflict reply, if the refreshed list already shows the size in the wanted state, treat it as success (toast, no alert). The API supports either. **Default in the task list: follow the UX table as written (show the alert).**
4. **AC13 wording (reading recorded).** "A new entry, or a date being added to, can't put eggs onto an archived size, through the form or any other request." Enforced: `log_production` and any direct **insert of a new line** on an archived size are refused. **Not** refused: a direct update of the eggs on an **existing** line of an archived size, because that is exactly what Edit day and correcting a line (also AC13) need, and the trigger can't tell the two apart. It only affects the owner's own farm. QA should read AC13 this way.
5. **AC20 scope (reading recorded).** State-based conflict detection (D3). Two devices renaming the same size, or reordering the same active set, are last-write-wins. The AC's own example (renaming a size that was archived meanwhile) is refused.
6. **UX §2.5 mismatch with the code (no action).** UX says `buildChartModel` uses every size; it already filters archived sizes by the range. The chart change is ordering only. UX also says Edit day sorts by `sortOrder` (true) and asks for active first (F7).
7. **Owner-visible side effects of shared changes.** The toast viewport moves above the bottom tabs on every page without a FAB (not just Settings), and `refreshSizes()` no longer blanks the app on failure. Both are improvements to feature 01 behaviour and need no decision.
8. **Deferred (audit follow-ups from feature 01, updated):** **L1** is done for the new ledger (D11). **L3** (a retention job) now covers `production_submissions` **and** `size_submissions`, outside request handlers. **L2** (security headers) is unrelated and still before first deploy.
9. **Not built here:** Inventory and Sales rules in AC28 (an archived size listed while eggs remain, offered for new sales only when active). They depend on `sizes.archived_at` only, which this feature provides. Revisit when those features ship.

## 4. Implementation notes (Devs)

### [BE]

**B1 (shared contract), done 2026-09-26.** Built exactly as §3.3; the frontend can code against it.
- `shared/types/api.ts`: `ApiErrorCode` gains `'conflict'`; new `ApiErrorReason`, `SizeNameMatch`; `ApiErrorData` gains optional `reason`, `existing`, `sizes`; new `SizesResponse`, `AddSizeRequest`, `RenameSizeRequest`, `ReorderSizesRequest`, `SizeChangeResponse`; `FarmSize` doc comment only (compact `sortOrder`, `active` false once archived).
- `shared/constants/sizes.ts`: `SIZE_FIELDS`, `MAX_SIZE_NAME_LENGTH` (40), `MAX_SIZES_PER_FARM` (100), `SIZE_MESSAGES` (as §3.3).
- `shared/utils/size-name.ts`: `normalizeSizeName`, `sizeNameLength`, `checkSizeName` (+ type `SizeNameCheck`).
- `shared/schemas/sizes.ts`: `sizeNameSchema`, `addSizeBodySchema`, `renameSizeBodySchema`, `reorderSizesBodySchema`, `sizeIdParamsSchema` (+ inferred types `AddSizeBody`, `RenameSizeBody`, `ReorderSizesBody`, `SizeIdParams`).
- `server/utils/errors.ts`: `conflict` added to `API_ERROR_CODES` and `STATUS_MESSAGES` (`'Conflict'`); `apiError(status, code, fields?, extra?)` where `extra` is `{ reason?, existing?, sizes? }` (new exported type `ApiErrorExtra`); only keys that are set go in the body. (This is part of B1 in the task list; it was also needed to keep `Record<ApiErrorCode, string>` compiling.)
- Tests: `tests/unit/size-name.spec.ts`, `sizes-schemas.spec.ts`, `sizes-constants.spec.ts`, `api-errors.spec.ts`.
- Small choices where §3.3 was silent (no contract effect): the `order` and `id` schema errors use `SIZE_MESSAGES.changedElsewhere` (a bad or mismatched id list means the list is out of date); a non-string name reads as blank; `submissionId` keeps zod's default message; `checkSizeName` takes `readonly Pick<FarmSize, 'id' | 'name' | 'active'>[]`, so a full `FarmSize[]` works.
- Left for B2: the `MAX_SIZES_PER_FARM` vs `TM015` migration comparison (the migration doesn't exist yet). `sizes-constants.spec.ts` already checks `MAX_SIZE_NAME_LENGTH` against `sizes_name_length`.
- For B2 (SQL twin of `normalizeSizeName`): JS `\s` covers NBSP, U+2003 etc. Postgres `\s` in `regexp_replace` depends on the database locale. B2's pgTAP test should use the same fixtures as `size-name.spec.ts` (tabs, newlines, NBSP, composed and decomposed accents) so any gap shows.

**B2 to B7 (DB, repository, routes), done 2026-09-26.** Built as §3; all six routes match the §3.3 contract. Migrations (new, in order): `20260925172544_sizes_write_rules.sql` (M8) and `20260925172545_sizes_functions.sql` (M9). `shared/types/database.types.ts` regenerated with `bun run db:types`.
- **B2, M8** `supabase/migrations/20260925172544_sizes_write_rules.sql`: `app.normalize_size_name`, `app.lock_tenant_sizes`, `app.compact_size_order`; existing names re-normalised, then `sizes_name_normalised`; `sizes_write_guard` (BEFORE INSERT OR UPDATE row trigger: normalise, lock, cap 100 = `TM015`, smallest unused colour slot, position at the end, `TM014` on a `tenant_id`/`color_slot` change); `sizes_keep_one_active` (AFTER UPDATE statement trigger with transition tables, `TM010`); `size_submissions`; column grants (`insert (tenant_id, name)`, `update (name, sort_order, archived_at, updated_at)`, no delete) and the `sizes_insert`/`sizes_update`/`size_submissions_*` policies. The whitespace class in `normalize_size_name` is spelled out (`\t \n \v \f \r`, space, NBSP, U+1680, U+2000-200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF), not `\s`, so it matches JavaScript's whatever the locale.
- **B3, M9** `supabase/migrations/20260925172545_sizes_functions.sql`: `add_size`, `rename_size`, `reorder_sizes`, `archive_size`, `restore_size` exactly as §3.1 (security invoker, `assert_tenant`, then the sizes lock; friendly checks, idempotency ledger, state-based conflicts).
- **B4 wiring**: `000_helpers.sql` (registry: sizes attack now `(tenant_id, name)` only; `size_submissions` row; new checker check 11), `010` (+11 assertions), `020` (+33 named cases, both directions, plus anon), `090` (m14 to m16, policy list). New `050_sizes.test.sql` (137 assertions).
- **B5** `server/repositories/sizes.ts`: `listSizes`, `addSize`, `renameSize`, `reorderSizes`, `archiveSize`, `restoreSize`, `mapSizeDbError(db, error, operation?)`, type `SizeOperation`. `toFarmSizes` (and type `SizeRowForFarm`) is now exported from `server/repositories/tenants.ts` and `toFarmSummary` uses it. Tests: `tests/unit/sizes-repo.spec.ts` (27 cases); `sizes-constants.spec.ts` now compares `MAX_SIZES_PER_FARM` with the `if v_count >= 100` in M8.
- **B6 routes**: `server/api/sizes/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `order.put.ts`, `[id]/archive.post.ts`, `[id]/restore.post.ts` (all `defineTenantHandler`); `server-guards.spec.ts` now lists them. End-to-end check on the local stack (dev server on :3000, two provisioned owners, real session cookies), 36 assertions, all passed: signed-out 401 on GET and POST; list (query ignored, `Cache-Control: private, no-store`); add (normalised `"  Pee   wee "` to `Pee wee`, last, slot 4), replay (same `changedId`, still one new size), replay with another name (400 `fields.submissionId`), name clash active (409 `name_taken` + `existing` + field message) and archived (`existing.archived: true`, "Jumbo is archived. Restore it instead."), blank and 41 characters (400 `fields.name`), missing `submissionId`; a smuggled `?tenant_id=`, body `tenant_id`, `colorSlot`, `sortOrder`, `archived` all ignored (size landed in A, slot 5, last, active, B unchanged); rename (normalised, case-only change of itself, clash, missing name, bad id 400 `fields.id`); reorder (colours unchanged, compact, same order twice OK, missing moved id 400 `fields.order`, missing/foreign id 409 `sizes_changed` + `sizes`); archive (archived last, others keep colour, again = 409 `sizes_changed`, rename of an archived size = 409); B's size id as A on rename/archive/restore = 404 + A's `sizes`, B's list untouched; `/api/me` shows the change on its next call in the same order; restore (last among active, same name and colour; restore of an active size = 409); archiving the last active size = 409 `last_active_size` + `sizes`, nothing changed.
- **B7 concurrency (manual, two `psql` sessions as an `authenticated` owner with a JWT claim, farm with two active sizes, 2026-09-26).** (1) Session 1: `begin; select public.archive_size(…Large…); select pg_sleep(5); commit;`. Session 2, started 1.6 s later: `archive_size(…Jumbo…)`. It blocked for 3.4 s (until session 1 committed at :09.9) and then failed with `TM010`; Jumbo stayed active. (2) The same with **direct** `update public.sizes set archived_at = now() where id = …` in both sessions (the trigger path, no function): session 2 blocked 3.4 s and failed with `TM010`. (3) Two concurrent `add_size` calls (`Alpha` holding the transaction 4 s): session 2 waited 2.4 s, then succeeded; the farm ended with `Alpha` slot 4 and `Beta` slot 5 (distinct). The test farm and accounts were deleted afterwards.
- **Deviations and small choices** (none changes the §3.3 contract):
  - **Checker check 11 and the m15 mutation.** With column-level grants an owner can't write `tenant_id`, so generic checks 8 and 10 stop on a privilege error and prove nothing about `sizes_update`, and check 4's column-referencing `WHERE` masks a weak `USING`. I verified that §3.6's m15 (`using (true)` with the correct `with check`, or the reverse) is **not a reachable breach** here (the correct half still stops the write, and it is not detected by the checker, correctly). So I added **check 11** to `tests.isolation_checks` (`update <t> set updated_at = now() where true`, rolled back, must touch no more than the attacker's own rows or be denied; the SET must not read a column, or Postgres also applies the SELECT policy) and m15 in `090` is `using (true) with check (true)`, which check 11 detects. `tests.isolation_check_count()` is now 11 per table (020 uses the function). The doc's line that `updated_at` in the grant "gives check 4 teeth" is superseded by check 11.
  - `mapSizeDbError` has an optional third argument (`SizeOperation`) only so `TM005` lands on `fields.submissionId` for an add and `fields.order` for a reorder. `TM008` maps to `fields.name` with `SIZE_MESSAGES.nameBlank` (the database can't say blank vs too long; the route's zod schema catches both first, so it is only a backstop). `TM013` and an unreadable `TM009` detail use two short local messages (`This request was already used with a different name. Try again.`, `Another size already has this name.`).
  - `add_size`/`rename_size` treat a null name as `TM008` (blank), not `TM005`. `TM005` is only for a null submission id and a malformed reorder list.
  - `GET /api/sizes` and `/api/me` both order by `sort_order, name, id`; "active first" holds because M9 keeps `sort_order` compact with archived sizes last.
  - Only `sizes.updated_at` (not `created_at`) is in the update grant, as §3.1 says.
  - `bun run db:reset` was needed to apply M8 and M9, so the local database was wiped: any accounts the frontend was using must be provisioned again (`bun run provision`). I deleted my own test accounts.
- **For the frontend and QA:** a `TM009` reply carries `existing` (`id`, `name`, `archived`) plus a ready `fields.name` message. A 409 `conflict` with `last_active_size` or `sizes_changed`, and a 404 on a size id, carry the farm's current `sizes` (absent only if that read failed too), so the screen can refresh without a second request. Archive/restore retries return `sizes_changed` (owner decision: no quiet-success rule). Reorder replies use `changedId = sizeId` from the request. Typecheck currently reports one error in `app/pages/zz-preview.vue` (frontend work in progress, not mine).

**QA S2 fix (NUL and lone surrogate in a size name), 2026-09-26.** A name with a control character or a lone surrogate now gets a 400 `fields.name` instead of a 500. Nothing changes for names that were valid before (tabs and newlines are still turned into spaces first).
- `shared/utils/size-name.ts`: new `hasInvalidSizeNameChar(name)` (`/[\p{Cc}\p{Cs}]/u`, run after `normalizeSizeName`); `checkSizeName` returns `reason: 'invalid'` with `SIZE_MESSAGES.nameInvalid` (order: blank, invalid, too long, taken). `shared/schemas/sizes.ts` `sizeNameSchema` adds the same issue, so both the form and the routes agree. `shared/constants/sizes.ts`: one new string, `nameInvalid: "This name has a character that isn't allowed."` (no other string changed). The SQL side and `size-name-parity.spec.ts` are untouched.
- Not changed (QA N1, left for the owner): invisible format characters such as U+200B and U+200D are still accepted.
- `server/repositories/sizes.ts` `mapSizeDbError`: `22P05` (Postgres: `\u0000 cannot be converted to text`), `PGRST102` (PostgREST: empty or invalid json, what a lone surrogate gives) and `22021` (invalid byte sequence) map to 400 `fields.name` for add, rename or no operation. For archive, restore and reorder (no name involved) they stay 500 `internal`. Confirmed live over PostgREST: NUL gives `22P05`, lone surrogate gives `PGRST102`.
- **For the frontend:** `SizeNameCheck` has a new `reason: 'invalid'`; `SizeNameForm` only reads `.message`, so it works unchanged. `mapSizeError` already puts any `fields.name` on the field.
- Tests: `size-name.spec.ts`, `sizes-schemas.spec.ts`, `sizes-repo.spec.ts`, `sizes-constants.spec.ts` extended.

**Security audit fixes (M-1, M-2, L-1, L-2), 2026-09-26.** One new migration, `supabase/migrations/20260926024518_sizes_hardening.sql` (M10; M8 and M9 are untouched; it replaces functions with `create or replace`, so grants stay; everything is still `security invoker`, `search_path = ''`). No route or contract change.
- **M-1 (ledger).** `size_submissions` gets `check (char_length(name) <= 40)`, the insert grant is cut to `(tenant_id, id, size_id, name)` (what `add_size` writes; `created_at`/`updated_at` default), and a `BEFORE INSERT` trigger `app.size_submissions_guard` caps a farm's ledger at 100 rows (new SQLSTATE `TM016`, unreachable from the routes: every ledger row is one `add_size`-created size, sizes are capped at 100 and the 4 seeded ones have no row). Chosen over "revoke the grant and write only through the functions", because the functions are `security invoker` and so need the caller's privilege; making them `security definer` would break the project rule. The trigger takes the farm's sizes lock, so two direct inserts can't both pass the count. Not changed, as asked: `production_submissions` has the same pattern (pre-existing audit L3), so a direct insert there is still unbounded.
- **M-2 (cheap caps).** A raw name over 200 characters is refused (`TM008`) before `normalize_size_name` in `sizes_write_guard` (insert and rename), `add_size` and `rename_size` (also before the lock). `reorder_sizes` refuses more than 100 ids (`TM005`, as for a malformed order) before the distinct count. Live: a 30 MB name, direct or through `add_size`, and a 1,000,000-uuid reorder are now refused with no measurable DB work (the ~0.2 s and ~1.0 s seen are `repeat()` and `array(select gen_random_uuid())` building the test input; before: 7.8 s and 1.6 s). New shared constant `MAX_SIZE_NAME_INPUT_LENGTH = 200` (`shared/constants/sizes.ts`); `sizeNameSchema` (`.max(200)` before the transform) and `checkSizeName` refuse a raw name over 200 with `nameTooLong`, so the form and the routes agree with the database (previously 300 spaces plus "a" was a valid "a"; now it is "too long"). `mapSizeDbError` is unchanged: `TM008` and `TM005` already map, and the schema catches these first.
- **L-1 (lock before RLS).** `sizes_write_guard` (insert branch) and `size_submissions_guard` raise `42501` ("row is not for the caller's farm") before `lock_tenant_sizes` when `current_user = 'authenticated'` and `new.tenant_id` is not `app.current_tenant_id()`. Other roles (postgres, service_role: `provision_farm`, seed, pgTAP fixtures) are unaffected. Live, two `psql` sessions: farm B's lock held for 7 s, farm A's cross-farm insert failed in 2.5 ms (was 5.3 s).
- **L-2 (sort_order).** I used the check: `sizes_sort_order_range check (sort_order between 0 and 100000)` replaces `sizes_sort_order_nonnegative`. That alone isn't enough, because the trigger's "end of list" is `max + 1`, so an owner at 100000 would make the next add violate the check (a 500). So the trigger caps its value at 100000, and `add_size` and `restore_size` also compact the order before computing `max + 1` (so the function paths always get an exact "last"). `update ... set sort_order = 2147483647` now gives `23514` (a direct-write refusal, like any other bad direct write, mapped to a generic 500 by the routes, which never send it).
- **Tests.** `050_sizes.test.sql` 137 to 180 (Farm I: 5 L-1, 12 M-2, 4 + 5 M-1, 17 L-2), `010` 30 to 32 (ledger column grants, guard not executable by anon), `020` cases 13 to 15 per direction (ledger insert into the other farm `42501`, ledger row for own farm pointing at the other farm's size `23503`), `090` m14 now also disables the guard trigger, because with L-1 a weak `sizes_insert` policy alone is no longer a breach (the trigger is a second lock); new m14b shows the RLS policy alone still refuses the insert when the trigger is off (19 to 20). Vitest: `sizes-constants.spec.ts` (the migration's 200/40/100 caps equal the shared constants), `size-name.spec.ts`, `sizes-schemas.spec.ts`.
- **Still deferred:** L-3, L-4 (retention job, audit L3), L-5 (security headers, audit L2), the Info items.

### [FE]

**F1 to F8 done, 2026-09-26.** Built as §3.4 and §2.5. Nuxt UI 4.11.2 components used, APIs checked against ui.nuxt.com and the installed source this session: `UCard`, `UButton`, `UDropdownMenu` (items with `description`, `disabled`, `to`, `active`), `UModal`, `UAlert` (`close` object, `update:open`), `UForm`, `UFormField` (`error`/`help` props and the `#error` slot), `UInput` (exposes `inputRef`), `USkeleton`, `UBadge`, `UIcon`.
- **F1**: `app/utils/production-chart.ts` (archived-with-eggs after the active sizes, then Rejects) + cases in `production-chart.spec.ts`; `app/utils/size-order.ts` (`groupSizes`, `moveInOrder`, `canArchive`, `replaceFarmSizes`), `size-errors.ts` (`mapSizeError`), `size-copy.ts` (`SIZE_COPY`), `size-mutations.ts` (pure core, see F3); `useMe().setSizes`; `useFarm()` gains `archivedSizes`, `applySizes` and a quiet `refreshSizes()` over `GET /api/sizes` (resolves `'ok' | 'error'`, changes nothing on error; a reply that arrives after a newer list was applied is dropped, via a `farm:sizes-version` counter, so a slow refresh can't undo a change).
- **F2**: `app/types/page-meta.d.ts` (`subtitle`, `back`), `app/layouts/default.vue` (subtitle fallback, phone-only 44px ← via `router.back()` or `/`), `AppAccountMenu.vue` (Settings as first item, `to: '/settings'`), `app/app.vue` (toasts above the tab bar on every tabbed page without a FAB; unchanged on sign-in pages), `app/pages/settings.vue`, `SettingsSection.vue` (card, and the 280px + card band at lg).
- **F3**: `app/composables/useSizeMutations.ts` is a thin wrapper over `app/utils/size-mutations.ts` (`createSizeMutations`, `createSubmissionTracker`, `fetchSizes`), which has no Nuxt auto-imports, so `tests/unit/size-mutations.spec.ts` drives it with a stubbed `$api`: one in-flight guard (a second call resolves to `null`), 20 s timeout, the reply (or a conflict reply's `sizes`) applied to the farm context, a `stale`/`last_active` error without a list triggers a refresh, add retry rule (same normalised name reuses the `submissionId`, changed name or reopened form gets a new one).
- **F4 to F6**: `SizesManager.vue` (owns the mutations, states, focus, highlight, top alert, archive dialog and the Archived card), `SizeRow.vue`, `SizeNameForm.vue`, `ArchivedSizesCard.vue`, `ArchiveSizeDialog.vue`; the row highlight is a CSS keyframe `size-row-flash` in `app/assets/css/main.css`.
- **F7**: `ProductionForm.vue` builds `sizeLines`/`sizeIds` once at setup (snapshot): active sizes in the farm's order, then (Edit only) archived sizes on the day; archived line gets the "Archived" `UBadge` and the accessible names `{Name} (archived) trays` / `... loose eggs`.
- **Specs**: `size-order.spec.ts`, `size-errors.spec.ts`, `size-mutations.spec.ts`, plus the chart cases. `bun run test:unit`: 26 files, 351 tests pass. `bun run typecheck` and `bun run lint` clean.
- **Checked in a real browser (headless Chrome, local stack, provisioned owner, real routes)**: at 375px, 900px (rail) and 1280px; light and dark; add (name normalised, toast, focus to Add size, retry after a dropped request reused the same `submissionId`, double tap made one size), rename (toast, day cards show the new name with no reload), reorder (Log form and chart follow), archive (Log form drops it; day card and chart legend keep it, legend after the active sizes; Edit day shows it last with the badge and the `(archived)` input names), restore (last in the list, toast wording), clash with an archived name (message + Restore button, restoring from the form closes it), another phone's change (`sizes_changed` alert, list refreshed, rename form closed), last-size line and disabled Archive item, the API refusing the last archive, load-failure and skeleton states, no horizontal scroll (375, 900, 1280), targets 44px at 375 and 900 (40px at lg, as designed), long (39 character) name wraps, reduced motion turns the row highlight off. The Production form, day cards and chart picked up every change with no page reload (a `window` flag set once survived the whole run).
- **Deviations and choices**:
  1. `mapSizeError` has no `not_found` kind: every 404 maps to `stale` (§3.4 says both).
  2. The rename help ("Past days will show this new name too.") is `UFormField`'s `help`, which Nuxt UI replaces with the error while one shows; it returns as soon as the name is valid, and Save is blocked while a message shows, so the owner always sees it before saving. §2.5 says "always".
  3. A blank field abandoned with Cancel or a tap elsewhere shows no message on blur (only Save does), because a message appearing between finger-down and finger-up on a phone can move the Cancel button and lose the tap. A non-blank name is checked on blur as specified.
  4. The "changed somewhere else" notice uses the neutral alert colour (info blue read as a link).
  5. `SizeRow` and the rename form: the manager passes the form through a `form` slot of `SizeRow`.
  6. The Alert dismiss uses Nuxt UI's default "Close" label.
  7. A quiet `refreshSizes()` is also called by `ProductionForm` on a stale-sizes error as before; it no longer goes through `/api/me`.
- **Not verified**: real-device keypad behaviour (iOS/Android, focus and scroll above the keypad), a screen reader pass, `prefers-reduced-motion` for the modal animation, a farm with 12+ sizes on the chart (dashed slots), a real network drop for `archive`/`restore`/`move` failure alerts on the real server (the add failure and stale paths were exercised; the alert copy for move/restore failure is exercised only by the unit-tested error path). QA should run these.
- The local test account `fe-check@example.com` / farm "FE Check Farm" (password `FeCheck-Pass-123`) was created with `bun run provision` for the browser checks; it has production for today and a few archived sizes.
- **QA round 1 fixes (2026-09-26, S1 and N5)**:
  - **S1** (`app/components/SizeNameForm.vue`): the Cancel/Add/Save button row now has `@mousedown.prevent`, so pressing a button never moves focus out of the name field. No blur means no re-check, no message between finger-down and finger-up, and the buttons don't move: the first tap on Cancel lands. Save still re-checks on click, keyboard Tab/Enter/Esc are unchanged, and a tap anywhere else still blurs and checks the name (AC4). This replaces the blur-time skip in deviation 3, which is now needed only for a blank field tapped away. Chosen over `relatedTarget` because Safari (macOS and iOS) does not focus buttons on click, so `relatedTarget` is null there. No Vitest spec: the fix is a DOM event modifier with no extractable logic (the Vitest environment is Node). Checked in headless Chrome at 375px with CDP events on the local stack: without the change, mouse-down on Cancel showed the message and the form stayed open (mouse and touch); with it, Cancel closes the form on the first press and first touch tap (no message shown, focus stays in the input), Add on a clashing name shows the message and stays open, and blurring the field elsewhere still shows the message. Not tested on a real phone.
  - **N5** (`app/utils/size-mutations.ts`): a `name_taken` refusal now also starts a quiet `refresh()` (fire and forget, errors swallowed), so the client's list catches up with a size made elsewhere. The refusal is returned to the form at once, without waiting for the refresh. Cases added to `tests/unit/size-mutations.spec.ts` (refresh called; not awaited; a failing refresh is swallowed).

## 5. QA report (QA)

**Verdict: PASS** (2026-09-26). All 28 acceptance criteria are met and there are no Blocking findings. Two Should-fix items (one FE, one BE) and a few Nice-to-haves are listed below; none blocks the feature. Per the owner's decision, `security-auditor` still runs next (owners now hold column-limited write grants on `sizes`; QA's direct-PostgREST attack results are below as input).

### Tests run
| Command | Result |
|---|---|
| `bun run test:unit` | 27 files, **353 tests pass** (351 from the devs + 2 QA cases in the new `tests/unit/size-name-parity.spec.ts`) |
| `bun run test:db` (local stack up) | 7 files, **472 assertions pass** (000, 010, 020, 030, 040, **050 sizes: 137**, 090). Result: PASS |
| `bun run typecheck` | exit 0, clean |
| `bun run lint` | exit 0, clean |

**QA test added:** `tests/unit/size-name-parity.spec.ts` parses the whitespace class out of `app.normalize_size_name` in the M8 migration and requires it to select exactly the code points JavaScript `\s` selects (U+0000 to U+10FFFF), so the JS/SQL twin can't drift. Not committed.

### Manual and live checks (dev server on :3100, real routes, headless Chrome over CDP, local Postgres)
- **JS vs Postgres name normalisation:** compared `normalizeSizeName` with `app.normalize_size_name` on the running Postgres over **all 1,112,063 code points** (a space-padded doubled character, exercising trim and collapse) and over 317,280 combining-mark pairs (5 marks after every BMP code point, NFC): **0 differences** (NBSP, U+2003, BOM, decomposed accents all agree).
- **Direct PostgREST attacks with an owner's JWT** (publishable key + the owner's access token, bypassing our routes): insert into another farm's tenant -> 403 (RLS); insert with `color_slot`, `sort_order`, `archived_at` or `id` -> 403 (column grants); update `tenant_id`, `color_slot` or `id` -> 403; update another farm's size -> 200 with 0 rows; `DELETE` one or all -> 403; bulk archive of every size -> 400 `TM010`, nothing changed; unfiltered PATCH -> 21000; archiving one at a time stops at the last active size (`TM010`); renaming an archived size to an active size's name -> 23505; un-archive works (no clash is possible, names are unique across archived); padded/NBSP/decomposed insert stored as `Ex tra Café`; duplicate by case -> 23505; blank -> 23514; `size_submissions` insert for another tenant -> 403, with another farm's size id -> 23503, read of another farm's ledger -> `[]`; anon read -> 401; `rpc/add_size` with the other farm's tenant -> `TM006`; archiving the other farm's size id with own tenant -> `TM011`. No bypass found.
- **Concurrency (two `psql` sessions as an owner):** session 1 archives Large and holds the transaction 4 s; session 2 archives the last other active size and blocks, then is refused (`a farm must keep at least one active size`), Jumbo stays active. Two concurrent `add_size` calls got distinct slots (7 and 8).
- **Isolation checker (090 / check 11):** ran the m15 idea by hand inside a rolled-back transaction: weak `USING` alone -> no checker failure; weak `WITH CHECK` alone -> no checker failure (correct: neither is reachable, `tenant_id` is unwritable); both weakened -> check 11 `update_unrestricted` fails (`ok:14, attacker owns 4`). So the BE's deviation is sound and the checker does detect the reachable breach. Baseline: 0 failing checks.
- **Every route unauthenticated:** 401 on all six; `GET /settings` signed out -> 302 to `/login?redirect=/settings`.
- **Browser flows** at 375, 768, 900, 1024 and 1280 px, light and dark, reduced motion (see the AC table).
- Cleanup: the three QA farms and accounts (`qa-a/b/c@example.com`) and all their data were deleted; the dev server and Chrome were stopped. The FE's `fe-check@example.com` account was left as is.

### Acceptance criteria
| AC | | Evidence |
|---|---|---|
| 1 | ✅ | Avatar menu (mobile, tablet rail) and sidebar footer (desktop) both show **Settings** first in the middle group; opened from `/`, `/production`, `/sales`, `/inventory`, `/clients` at 375px, each -> `/settings`, h1 "Settings", subtitle "Farm settings" (2 taps). Also 768/900/1024/1280. No tab has `aria-current` on `/settings`; still 5 tabs. Back arrow: 44px at 375, hidden at md+; from `/inventory` it returns to `/inventory`, from a direct load to `/`. |
| 2 | ✅ | New farm shows Small, Medium, Large, Jumbo in order; archived sizes only in the separate Archived card (screenshots, DOM). |
| 3 | ✅ | Add asks for the name only. New row is last; the Log production form (opened with no reload, `window` flag survived) lists it as the last line, in the same order as Settings. Verified through the API too (`sortOrder` compact, slot assigned by the trigger). |
| 4 | ✅ | `"  Pee   wee "` -> `Pee wee` (form, API, direct insert, pgTAP); "Extra  Large" rename saved as "Extra Large"; blank -> "Enter a size name."; 41 chars -> "Use 40 characters or fewer." (no `maxlength`, value kept), 40 accepted; `large`/`LARGE`/`jumbo` clash on active and archived sizes with the field message; archived match adds the **Restore Jumbo** button; Add/Save disabled with `aria-disabled` while a message shows. Server repeats every rule (API tests, 400/409 bodies). |
| 5 | ✅ | Slots assigned by the trigger only (owner can't send or update one: 403). With 100 sizes: 100 distinct slots (0-99), archived ones' slots not reused; palette has no red (`size-colors.spec`); chart with 13 sizes shows slots 10+ dashed with hollow legend dots (screenshot). Rename/reorder/archive/restore left every other colour unchanged (API list before/after; 050). |
| 6 | ✅ | Rename shows in day cards, the chart legend and the Log form with no reload; help "Past days will show this new name too." shows under the field before saving (hidden only while an error shows). Production rows byte-identical after rename (md5 incl. `updated_at`). |
| 7 | ✅ | Same name saves as a no-op (form closes, no request, no toast); `LARGE` and `Extra  Large ` saved as real changes, toast "Renamed Large to LARGE". |
| 8 | ✅ | Up/down buttons; measured 44x44 at 375 and 900 (40x40 at lg, as designed and allowed in §2.5). Every interactive element at 375 measured >= 44px in default, menu, rename, error and alert states. |
| 9 | ✅ | After moves the Log form, expanded day lines and chart legend follow Settings order with no reload; eggs and colours unchanged. |
| 10 | ✅ | First row's up and last row's down are `disabled` + `aria-disabled`; no message. Reorder API sends the full order. |
| 11 | ✅ | Dialog: "Archive Jumbo?" / "It won't be offered for new production. Your past days keep their Jumbo eggs." / "You can restore it any time."; Cancel and Archive both 44px, 343px wide; Cancel is focused (with real focus emulation), Tab is trapped, Escape and Cancel change nothing and return focus to the row's menu button. |
| 12 | ✅ | After archive: gone from the Log form; still on day cards (collapsed total 334 eggs = 130+109+95 kept; expanded line "Jumbo 3 trays + 5"); in the chart with legend entry and colour for ranges that have its eggs (Sep 20-26, Sep 23-25) and absent for Sep 19-22; shown after the active sizes, before Rejects. |
| 13 | ✅ | Edit day shows "Jumbo" with an **Archived** badge after the active lines, input names `Jumbo (archived) trays` / `... loose eggs`, pre-filled 3 trays + 5; saving untouched kept 95; editing loose to 6 saved 96. New eggs on an archived size refused through `POST /api/production/entries` (new day and existing day) and `PUT` day (400 stale-sizes); direct insert of a new line -> `TM001` (050). Recorded reading (a direct update of an existing archived line is allowed) holds; see Note N7. |
| 14 | ✅ | With one active size: Archive item disabled with "Keep at least one size." in the item, plus the on-screen line "Keep at least one size. Add another before you archive Small." Server refuses: route 409 `last_active_size`; direct update and bulk update -> `TM010` with no row changed; concurrent archive refused after waiting on the lock. |
| 15 | ✅ | Archived card only when something is archived; each row has the name and a text "Archived" badge; no empty group. (Order note N4.) |
| 16 | ✅ | Restore has no confirmation; restored size is last among the active, same name and colour, back on the Log form; toast "Restored Jumbo. It's last in your list." Works from the card and from the name-clash message (form closes). |
| 17 | ✅ | Each change is its own request; list updates with no reload; toasts "Added Pee wee", "Renamed Large to LARGE", "Moved Small down", "Archived Jumbo", "Restored Jumbo. It's last in your list." Toasts sit above the tab bar. |
| 18 | ✅ | Same-tick double click: one size added, one move step applied; pressed control spins, others disabled, card `aria-busy`. Add retry reuses the `submissionId` (`replayed: true`, same `changedId`, count unchanged), a changed name gets a new id; replay with another name -> 400 `fields.submissionId`. Move sends the full order (idempotent). |
| 19 | ✅ | With the network offline: add keeps the typed name, shows "Couldn't save. Check your connection and try again.", retry (online) adds exactly one size; rename keeps the form and the message; move shows "Couldn't move Small..." at the top of the card; restore shows "Couldn't restore Pee wee..."; archive shows "Couldn't archive..." inside the dialog, dialog stays, retry works. List unchanged in each case. (Move, restore and archive failures were on the FE's unverified list; now verified.) |
| 20 | ✅ | Second-tab changes simulated through the API: rename form open on a size archived elsewhere -> form closes, list refreshes, notice "Your sizes were changed somewhere else. The list is up to date now."; move with a changed set -> same; archive of an already archived size -> dialog closes + notice; restore of an already restored size -> notice; add of a name just created elsewhere -> "You already have a size called Tab Two Made." on the field; archive of the last active size elsewhere -> "Keep at least one size." in the dialog and the list refreshes. Retries of archive/restore show the notice (owner decision: no quiet success). |
| 21 | ✅ | Skeleton (4 rows, add button hidden) and load-failure card ("Couldn't load your sizes", Try again) traced in `SizesManager.vue:29-361`; not reachable in real use because the list rides on `/api/me` (FE verified them with stubs). A quiet refresh that fails while a list shows changes nothing: verified with the network offline on a client navigation to Settings (list stayed, no error, app not blanked, page not reloaded). |
| 22 | ✅ | Active list never empty: last-size protections above; `showLoadError` covers "no active size" as designed. |
| 23 | ✅ | 375px: `scrollWidth` 375 in every state, a 40-character name wraps (row 68px), all controls >= 44px, page scrolls clear of the tab bar (dark screenshot). Desktop 1280 two-column band; 1024 band; 768 and 900 one column with the sidebar collapsed and expanded, no horizontal scroll. |
| 24 | ✅ | Dark mode screenshots: names, "Archived" badge, error text, Restore button and dialog readable; "Archived" is text. |
| 25 | ✅ | No delete route, grant or policy (403 on `DELETE`); production table hash, egg sum and row count identical after rename, move, add and archive (live) and in 050. |
| 26 | ✅ | 020 named cases both directions (RPCs with the other tenant -> `TM006`, other farm's size ids -> `TM011`/`TM012`, direct update 0 rows, direct insert/delete 42501, anon 42501, `size_submissions` unreadable); registry now covers `size_submissions`; 090 m14-m16 detected. Re-proved live over PostgREST (see attacks above). |
| 27 | ✅ | Every route is `defineTenantHandler` (guard test lists all six); same access for any owner of the farm; anon and signed-out get 401/42501. |
| 28 | ✅ | Nothing here blocks the later rules: `archived_at` is the only signal; archiving is allowed with production or pending data; archived sizes keep their lines and can still be edited on an existing line. Nothing built for Inventory/Sales (out of scope). |

### Review against the rules
- **Blocking 1-8: none.** `size_submissions` has `tenant_id`, RLS, tenant `with check` on insert, no update/delete, a registry row and an isolation entry. `tenant_id` is never read from the client (zod strips it; smuggled `tenant_id`, `colorSlot`, `sortOrder`, `archived` in bodies and `?tenant_id=` in the query were ignored). All data access is `db.rpc` / `db.scoped` with the user's JWT; no new `security definer` (010 passes); the secret key appears only in `server/cli/provision.ts`. No previously committed migration was edited (M8 and M9 are new). No inventory or sales logic changed.
- **Should-fix 9-14:** no tray math, no hardcoded size names or eggs-per-tray; Nuxt UI 4 APIs work at runtime with no console errors or hydration warnings during the runs; empty/error/loading states present; §3 contracts match (only the wording differences in S2 below).
- **Out of scope for this review** (changed or untracked but not part of feature 02, from the nuxt-ui skill install): `.claude/agents/*.md` (7 files, +26 lines), `.claude/skills/nuxt-ui/`, `skills-lock.json`. Decide separately whether to commit them.

### Findings

**Blocking**
- None.

**Should-fix**
- **S1 [frontend-dev]** `app/components/SizeNameForm.vue` `onBlur` (about lines 96-99) plus the `#error` slot. With a non-blank invalid name typed (for example a duplicate), the first press on **Cancel** is swallowed: mouse-down blurs the input, the message appears, the buttons move down, and the click never lands on Cancel, so the owner has to press it again. Reproduced with CDP mouse events (`msg before: false`, `msg after mousedown: true`, `form still open after Cancel tap: true`). The FE handled this only for a blank field (deviation 3). It is certain on desktop mouse; whether a real phone tap is affected depends on the browser (unverified). Fix: skip the blur re-check when `event.relatedTarget` is the Cancel button, or reserve room for the message so nothing moves.
- **S2 [backend-dev]** `shared/schemas/sizes.ts` `sizeNameSchema` / `server/repositories/sizes.ts`. A name containing U+0000 or a lone surrogate passes validation and reaches Postgres, which raises 22P05 / PGRST102, so the route answers **500 `internal`** (and logs an ERROR) instead of a 400 field message. Reproduced with `POST /api/sizes` `{ name: "A\u0000B" }` and `"A\ud800B"`. Only a hand-built request or a very odd paste triggers it, and no data is harmed. Fix: reject both in `sizeNameSchema` (and in `checkSizeName` so the form says the same), or map those two SQLSTATEs to `fields.name`.

**Nice-to-have**
- **N1 [backend-dev + frontend-dev]** Names made only of invisible characters (U+200B zero-width space, U+200D, U+200E) or containing control characters (BEL) are accepted and create a size that looks blank in the list (three such rows were created during QA). Not a data risk, and both sides agree with each other. Consider rejecting format/control characters in `normalizeSizeName` and `app.normalize_size_name` together (the new parity test would need updating with them).
- **N2 [frontend-dev]** Account menu items measure 40px at md and up (44px only on phones). UX §2.5 says items are 44px on phones, and its Accessibility line says tablets too; this is feature 00 sizing, not new, so only a note.
- **N3 [backend-dev]** A direct (PostgREST) insert or un-archive leaves `sort_order` unchanged or at `max + 1`, so the "active first, compact" order is restored only at the next function call. Cosmetic, own farm only. The UI groups active and archived itself, so nothing shows wrongly except day-line order on days with archived sizes.
- **N4 [PM/UX]** The Archived card lists sizes most recently archived first (each archive puts the size at the front of the archived group), not in the order they had in the active list. AC15's "their last order" is ambiguous, so this was accepted; say if the owner wants the original order.
- **N5 [frontend-dev]** After a server `name_taken` refusal the list is not refreshed, so a size created elsewhere stays missing from the list until the next change. The message itself is right. Low value.
- **N6 [backend-dev]** JS `toLowerCase()` and Postgres `lower()` can differ for a few letters (for example Turkish dotted I), so the form's live check may say "free" where the server then says "taken". The server is the authority and the message appears after Save, so only a note.
- **N7 [architect]** Recorded AC13 reading (also feature 01 behaviour): a direct PostgREST upsert or update onto an **existing** line of an archived size on the same day is allowed by `production_bounds`. Own farm only; matches the architect's note.
- **N8 [backend-dev]** Check 11 in the isolation checker passes vacuously for a table where `updated_at` is not in the authenticated update grant (it also accepts 42501). Fine for `sizes` (it is in the grant). Keep in mind if another column-limited table is added.
- **N9 [team lead]** `CLAUDE.md` sizes bullet updated with the architect's wording at wrap-up (done 2026-09-26).

### Not verified (cannot be done here)
- Real phone keypad (iOS/Android): focus and scroll above the keypad, and whether S1 also affects a real touch tap.
- Screen reader pass (labels, live regions, list announcement); only the DOM names and roles were checked.
- The modal's open/close animation under `prefers-reduced-motion` (only that it opens, closes and leaves no overlay under emulation; the row highlight was checked by the FE).
- Skeleton and load-failure states in a live app (not reachable without stubbing; code-traced).
- `security-auditor` review of the new grants and triggers: done, see the security audit below.

### Security audit (2026-09-26, read-only, after QA)
Run through a general-purpose agent following `.claude/agents/security-auditor.md`, because the `security-auditor` agent failed to start (its frontmatter `skills:` list loads `security-review`, which runs `git diff origin/HEAD...`, and this repo has no `origin` remote).
- **Verdict:** no Critical or High findings. No way found, as an owner, to read or write another farm's data or to get around the column grants, RLS and triggers with direct PostgREST calls. All new functions are `security invoker` with `search_path = ''`; `anon` has no access; all six routes use `defineTenantHandler`; no XSS path from size names.
- **Fixed after the audit (owner decision):** M-1 (unbounded direct inserts and no length cap on `size_submissions`), M-2 (CPU amplification from oversized names or reorder arrays), L-1 (the sizes trigger locked a farm it hadn't authorised), L-2 (`sort_order` overflow). Migration `20260926024518_sizes_hardening.sql`; see §4 [BE] "Security audit fixes".
- **Deferred:**
  - **L-3:** the DB doesn't enforce the control-character/lone-surrogate name rule (only the shared schema does); invisible-only names are QA N1.
  - **L-4:** retention job for `size_submissions` and `production_submissions` (audit follow-up L3); `production_submissions` also still allows unbounded direct inserts.
  - **L-5:** security headers and CSP (audit follow-up L2). Do before the first deploy.
  - **Info:** `service_role` has no EXECUTE on the `app.*` helpers, so a service-role write to `sizes` would fail on the trigger; only `provision_farm` is used today.
- **Not verified by the audit:** PostgREST/Kong request-body limits, the hosted Supabase project, the running routes' JWT handling end to end (relied on the audited `defineTenantHandler` and the guard test).
