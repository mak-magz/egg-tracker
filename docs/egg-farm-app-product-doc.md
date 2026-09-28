# Egg Farm Tracker — Product Design Doc (v1)

> **Purpose:** the *why* and *for-whom* behind the app — problem, users, goals, scope, and success criteria.
> Companion docs: `egg-farm-app-architecture-spec.md` (the *what* / backend), `egg-farm-app-ui-spec.md` (screens & flows), `egg-farm-app-design.md` (fuller decision log).
> **Status:** v1 planning. Sections marked 🟡 need the owner's input to firm up.

---

## 1. Problem Statement

A working chicken egg farm produces eggs daily and sells them — some delivered to regular clients (shops, restaurants, individuals), some sold on-site/at home. Today this is tracked informally (notebooks / memory / spreadsheets 🟡 *confirm current method*). That approach breaks down in predictable ways:

- **Production isn't visible over time.** Daily counts live on paper; trends (is the flock's output rising or falling?) and quality rates (how many rejects?) are hard to see.
- **Inventory is guessed, not known.** With production and sales recorded separately (or not at all), "how many large eggs do we actually have right now?" has no reliable answer.
- **Deliveries get tracked in someone's head.** What's been ordered vs. actually delivered, who still owes what, which deliveries are outstanding — easy to lose track of, easy to make mistakes.
- **The full picture is fragmented.** Production, stock, and sales are three views of one operation, but nothing ties them together, so questions that span them ("do we have enough large eggs to cover this week's orders?") can't be answered.

The core problem: **an egg operation generates simple, repetitive daily data that is valuable in aggregate but is currently not captured in a way that answers everyday operational questions.**

---

## 2. Who It's For

### Primary user (v1): the owner-operator
A single person who runs the farm and does the recording themselves. Characteristics that shape the product:
- Enters data **frequently and quickly** — production in the morning, sales through the day — often **on a phone, possibly barnside**. Speed and low-friction entry matter more than depth.
- Is **not** a software person; the app must be obvious without training.
- Cares about concrete operational answers (how much do I have, who ordered what, how's production doing), not analytics for their own sake.
- Thinks in **trays**, not individual eggs, when talking about quantities.

### Future users (post-v1): other egg farms
The app is built multi-tenant from day one on the premise that **other small/mid egg farms have the same problem**. They are not v1 users, but the architecture assumes they'll come, so v1 avoids single-farm shortcuts (see Scope).

### Explicitly *not* targeted (v1)
Large industrial operations needing flock-health/feed/mortality/breeding management; farms whose main need is accounting/invoicing; multi-staff operations needing roles and permissions. 🟡 *Confirm none of these describe you.*

---

## 3. Goals & Non-Goals

### Product goals (what success enables the user to do)
1. **Log production in seconds** — a morning's collection, by size and quality, with minimal taps.
2. **Always know what's on hand** — current sellable inventory, by size, without manual tallying.
3. **Track sales and deliveries in one place** — including what's pending vs. delivered, and per-customer history.
4. **See the operation at a glance** — a dashboard answering "how's production, what do I have, what's outstanding" in one look.
5. **Trust the numbers** — the data should be consistent (inventory reconciles with production and sales) and historically accurate (past sales don't change when prices or tray sizes do).

### Non-goals (v1)
- Not an accounting or accounts-receivable system: no payment status, balances, statements or reminders. A printable invoice for a single sale is planned (feature 05).
- Not a flock-management or animal-husbandry tool (no feed, mortality, health, breeding).
- Not a logistics tool (no delivery routing or scheduling).
- Not a multi-user/team product yet (single owner; no roles).
- Not offline-capable in v1 (online web app; offline considered and deferred).

---

## 4. Why This, Why Now

- **The data is already being produced daily** — the app captures something that exists, rather than asking the user to generate new work. Low behavior-change cost.
- **The three domains form one loop** (production → inventory → sales), so a modest v1 delivers disproportionate value: connecting them answers questions none of them answers alone.
- **The market is validated but the angle is open.** Existing poultry/egg apps lead with flock health, feed, and mortality; **sales-and-delivery-to-customers is consistently thin** across them. This app's center of gravity is exactly that underserved half — production-to-sale, with real customer/delivery tracking — which is both the owner's actual need and a potential differentiator if it becomes a SaaS. 🟡 *This is the key product bet — worth validating with 1–2 other farms before investing in the SaaS path.*

---

## 5. Scope

### In scope (v1)
Auth (single owner) · Dashboard/metrics (fixed small set) · Production tracking (by size + quality, incl. rejects) · Inventory (computed, by size) · Sales (delivered + on-site, with pending/complete status) · Client list (simple, referenceable).

### Deliberately out of v1 (with reasons)
| Deferred | Why deferred |
|---|---|
| Accounts-receivable (balances, statements, payment status) | Large domain; sale price captured is enough for v1. Different from SaaS billing. A printable invoice for one sale is not deferred — see feature 05. |
| Delivery routing/scheduling | Logistics rabbit hole; not core to the tracking loop. |
| Offline support | Considered twice; drops in favor of a coherent online web app. Costly to add well; would reopen the architecture. `updated_at` kept as a cheap hedge. |
| Realtime dashboards | Daily data is low-frequency; refresh/polling suffices. Clear later path exists. |
| Feed / mortality / health / flock mgmt | Where incumbents compete; not this app's angle. Buyers may expect it *if* commercializing. |
| Multi-user / roles | Single-owner v1; multi-tenancy is in the data layer, not the UI. |
| Payment-status tracking | Would justify a second status axis; not needed until invoicing exists. |
| Public sign-up / SaaS billing | Owner account provisioned; onboarding/billing belong to the SaaS phase. |

### The one non-obvious v1 investment
Even though v1 serves one farm, it is built **multi-tenant (shared tables + `tenant_id` + RLS) from the first migration.** This is invisible to the v1 user but is the decision most expensive to retrofit, and the SaaS ambition is real enough to justify paying for it now. This is a deliberate product choice, not just a technical one.

---

## 6. Success Criteria

### v1 (personal tool) — is it working?
- The owner **actually uses it daily** instead of paper — the truest signal.
- Logging a morning's production takes **well under a minute**.
- "How many large eggs do I have?" and "what deliveries are still pending?" are answerable **instantly, and are correct**.
- Inventory reconciles: produced − sold matches reality closely enough to trust.
🟡 *Owner to define any concrete personal bar (e.g. "replaces the notebook within 2 weeks").*

### Beyond v1 (SaaS validation) — should it grow?
- At least a couple of **other farms find the same loop useful** (validates the bet in §4).
- The sales/delivery focus is the reason they'd choose it over flock-centric incumbents.
🟡 *Only pursue after the personal tool proves itself.*

---

## 7. Key Product Decisions (and their rationale)

These shaped the product, not just the code:

- **Sales absorb deliveries** (delivery is a fulfillment *type*, not a separate thing) — because a home sale and a delivered sale are the same event (eggs out, money in) with different fulfillment. This keeps inventory correct across *all* outflows and makes revenue complete. Modeling "deliveries" alone would have leaked home sales.
- **Inventory is computed, not entered** — the user should never maintain a stock number by hand; it's derived from the data they already log. Fewer things to keep in sync, fewer ways to be wrong.
- **Trays for the human, eggs for the system** — the user works in trays (how they think), the app stores eggs (the honest, history-proof unit). The mismatch is hidden at the edges.
- **Rejects are tracked but never sold** — they matter as a quality signal, not as sellable stock, so they're recorded at production and excluded from inventory/sales.
- **Small, fixed dashboard** — resisting configurability and chart-sprawl keeps v1 focused on the few numbers that actually run the operation.

---

## 8. Open Questions for the Owner 🟡

1. **Current method** — what's used today (paper, spreadsheet, memory)? Sharpens the problem statement and the "replaces X" success bar.
2. **SaaS intent** — is selling to other farms a real plan or a someday-maybe? Affects how hard to push the multi-tenant/validation work.
3. **Tray size** — actual eggs per tray for this operation (drives the canonical-unit default).
4. **Hen counts** — tracked or not? Determines whether the lay-rate metric exists in v1.
5. **On-site sales frequency** — common, or occasional? If common, the on-site sale flow deserves as much polish as deliveries.
6. **Personal success bar** — what would make *you* consider v1 a success?

---

## 9. One-Paragraph Summary

A fast, phone-friendly web app for an egg farm owner to log daily production (by size and quality), always know current sellable inventory, and track sales — whether delivered to regular clients or sold on-site — including what's still outstanding. It connects the production→inventory→sales loop that today lives on paper and in memory, answering everyday operational questions the current process can't. Built as an online, multi-tenant web app (Nuxt + Supabase) so it can grow from a single owner's tool into a SaaS for other farms — with its distinctive bet being a genuinely good sales-and-delivery experience, the half that existing flock-centric poultry apps underserve.
