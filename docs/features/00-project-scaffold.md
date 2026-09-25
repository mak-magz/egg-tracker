# Feature: Project scaffold / foundation (sign-in, app shell, farm base)

**Status:** in-progress
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)
As the farm owner, I want to sign in on my phone or computer and land in an app that already knows my farm and has a clear place for Dashboard, Production, Sales, Inventory and Clients, so that every feature after this one has somewhere to live and my farm's records are private to me from the first egg I log.

As the developer building the app, I want a working local setup with typecheck, lint and test commands, a proven farm-isolation test, and a documented way to set up the owner's account and farm, so that later features build on a safe, repeatable base.

**Why now / spec reference:**
- Foundation for every other v1 feature. Build order: schema, isolation and its test, auth, then everything else (`docs/egg-farm-app-architecture-spec.md`, build order; `CLAUDE.md`, planned build order).
- Auth screen and flows: `docs/egg-farm-app-ui-spec.md` §2.
- App shell and 5 destinations: `docs/egg-farm-app-ui-spec.md` §1, §10, §11.
- Multi-tenant from day one, owner account provisioned, no public sign-up: `docs/egg-farm-app-product-doc.md` §5 ("The one non-obvious v1 investment", deferred table).
- Eggs-per-tray as a per-farm setting with a default: `docs/egg-farm-app-architecture-spec.md` (canonical unit); product doc §8 Q3.
- **Visual design (source of truth for the sign-in screen and the app shell):** the owner's design in `docs/design/`. Read `source/template.html` (markup, tokens, and the `text/x-dc` logic script). The logo is `tamago-logo.png`. UX (§2.5) and frontend follow it.

## 2. Acceptance criteria (PM)
Testable, numbered. "Owner" means a provisioned account that belongs to a farm. "Mobile" means a ~375px-wide viewport; "desktop" means 1024px wide or more.

**Sign-in**
- [ ] AC1: Signing in with the owner's correct email and password takes the owner to the Dashboard in a single "Sign in" submit.
- [ ] AC2: The sign-in screen shows email and password fields and a "Sign in" button. It has no sign-up or "create account" link or path. Visiting any sign-up-style URL does not let someone create an account.
- [ ] AC3: A wrong email or wrong password shows one inline error above the form (for example "Email or password is incorrect"). The message is the same whether or not the email exists. The owner stays on the sign-in screen and the typed email is kept.
- [ ] AC4: Submitting with an empty email or empty password shows a field-level message and makes no sign-in attempt. An email that is not in email format is rejected the same way.
- [ ] AC5: While sign-in is in progress, the button shows a loading state and cannot be pressed again. Pressing it repeatedly does not cause more than one attempt.
- [ ] AC6: If the app can't reach the sign-in service (for example no signal in the barn), the owner sees a plain-language error ("Couldn't connect. Check your connection and try again.") rather than a blank screen or a technical error. The owner can retry without reloading. (This is error handling only. It is not offline support.)
- [ ] AC7: On mobile, the sign-in screen fits the viewport without horizontal scrolling. The email field brings up an email keyboard, and the password field is masked. The "Sign in" button is at least 44px tall.
- [ ] AC8: A signed-in owner who opens the sign-in screen is sent straight to the Dashboard.
- [ ] AC8a: The sign-in screen has a "Forgot password?" link. It asks for an email and always shows the same confirmation ("If that email has an account, we've sent a reset link"), whether or not the account exists. The emailed link opens a "Set a new password" screen: new password plus confirm, with a minimum length and a mismatch error. Saving signs the owner in and lands them on the Dashboard. An expired or already-used link shows a plain message with a way to request a new one. Locally, the reset email can be viewed in the local mail catcher, with no real email sent.

**Protected access and session**
- [ ] AC9: A signed-out visitor who opens any app screen (Dashboard, Production, Sales, Inventory, Clients) by URL is sent to the sign-in screen. No farm content or farm name is shown, not even briefly.
- [ ] AC10: After a signed-out visitor is sent to sign-in from a specific screen (for example Sales), signing in lands them on that screen, not the Dashboard.
- [ ] AC11: When the owner's session expires, the next navigation or action sends them to sign-in with a short explanation ("Your session has expired. Please sign in again."). After signing in they return to the screen they were on. Sessions are long-lived: on the same device the owner stays signed in for weeks and isn't asked to sign in again unless they sign out (owner decision: "rarely").
- [ ] AC12: A user who signs in successfully but doesn't belong to any farm sees a clear message ("Your account isn't linked to a farm yet. Contact support.") and a sign-out option. They see no app screens and no data. There's no crash or blank page.

**Sign-out**
- [ ] AC13: The account menu is reachable from every app screen on both mobile and desktop. It shows the signed-in email and the farm name, and has a "Sign out" action and a dark mode toggle.
- [ ] AC14: "Sign out" ends the session in one tap (no confirmation) and shows the sign-in screen. Afterwards, the browser Back button and reopening a previously visited app URL both lead to sign-in, not farm content.

**App shell and navigation**
- [ ] AC15: The app shell has exactly 5 destinations in this order: Dashboard, Production, Sales, Inventory, Clients. Each one opens its own screen, and the current destination is visibly highlighted.
- [ ] AC16: On desktop, navigation is a persistent left sidebar, with the account menu in the sidebar footer (owner decision, as designed). A top bar shows the current screen title and subtitle.
- [ ] AC17: On mobile, navigation is a bottom tab bar with all 5 destinations visible at once. There's no horizontal scrolling and no "more" menu. Each tab is at least 44px tall and has an icon and a label. A top bar shows the current screen title and the account menu.
- [ ] AC18: Between 768px and 1024px, the sidebar can collapse to an icon rail and expand again. Resizing the window across the breakpoints switches the navigation pattern without a reload and without losing the current screen.
- [ ] AC19: Each of the 5 destination screens shows its title and a friendly placeholder message (for example "Production logging is coming soon"). No screen shows made-up numbers, sample eggs, sample trays or sample clients.
- [ ] AC19a: Dark mode: the account menu toggle switches the whole app (shell, sign-in, placeholders) between light and dark in one tap. The choice is remembered on that device across reloads and sign-ins. Before the owner chooses, the app follows the device's system setting. Text and controls stay readable in both modes.
- [ ] AC20: An unknown app URL shows a "Page not found" message with a link back to the Dashboard. It doesn't show a blank page or a technical error.

**Farm (tenant) base**
- [ ] AC21: Every owner account belongs to exactly one farm, and that farm's name is shown in the account menu and the avatar initials on every app screen. On mobile and on the tablet rail it is one tap away. The owner has no way to pick or switch farms in v1.
- [ ] AC22: Each farm has an eggs-per-tray setting. A farm set up without a value gets the default of **30** (owner decision). The setting accepts only whole numbers of 1 or more. Setting it to 0, a negative number or a fraction is rejected at farm setup.
- [ ] AC23: Which farm a user sees is decided only by who is signed in. Nothing sent from the browser (a changed URL, a request body, a query value naming another farm) can show or change another farm's data.
- [ ] AC24: An automated isolation test sets up two farms (A and B), each with its own owner. It proves that A's owner can't read, change or delete B's farm record, B's eggs-per-tray setting or B's membership, and the reverse. It also proves this holds when the request names the other farm explicitly, and that a signed-out request can read none of either farm's data.
- [ ] AC25: The isolation test really detects a breach. If the farm-isolation rule is temporarily removed or weakened, the test fails. The architect or dev shows QA how to demonstrate this.
- [ ] AC26: The isolation test is set up so that each later feature (production, sales, clients) can add its own records to the same A-vs-B check, rather than writing a separate one-off test.

**Developer foundation**
- [ ] AC27: From a fresh clone, following the README setup steps starts a local database/auth stack and the app, and a provisioned owner can sign in locally. No cloud account or production credentials are needed.
- [ ] AC28: There are separate documented commands for typecheck, lint and tests. Each one exits successfully on a clean checkout of this feature.
- [ ] AC29: A single documented command runs the isolation test (AC24) against the local stack, and it passes.
- [ ] AC30: A documented procedure (one command or a short scripted step) provisions a farm and its owner account from a farm name, an owner email, a password, and optionally eggs-per-tray. That owner can then sign in. Running it again for the same email doesn't create a second farm or a duplicate account. It either reports that the owner already exists or updates it, and the docs say which.
- [ ] AC31: The docs also describe an admin fallback for resetting the owner's password with the provisioning tooling, in case email reset isn't available.
- [ ] AC32: No secret keys are committed to the repo. An example environment file lists every setting needed to run locally, with placeholders.
- [ ] AC33: `CLAUDE.md` is updated with the real dev, typecheck, lint, test, isolation-test and provisioning commands.

**Derived numbers:** none. This feature creates no production, sales or inventory data, and the Dashboard shows no figures yet.

**Out of scope:**
- Production, Sales, Inventory, Clients and Dashboard logic: forms, lists, figures, empty states tied to real data, and the context-aware "+ Add" button/FAB. Later features add these to the shell.
- Tray/egg quantity input and display components. These arrive with the first feature that enters quantities. This feature only stores the eggs-per-tray setting.
- An owner-facing settings screen for editing eggs-per-tray. In v1 it's set at farm provisioning. A minimal settings area can be a later feature.
- Magic-link or social sign-in (owner decision: email + password only).
- Non-goals, kept out and noted for later: public sign-up and SaaS onboarding/billing, multi-user/roles/invites, farm switching, offline support, realtime.
- Hosting/deploy to production. Local only here, with deploy handled as a separate devops step.
- Branding: use the design's "Tamago" name, the `docs/design/tamago-logo.png` logo, and its tokens and colors. No extra branding work.

**Owner decisions (2026-09-24/25):**
1. Tray size: **30 eggs per tray**, the farm default (matches the design).
2. Sign-in: **email + password only**. **"Forgot password?" is included in this feature** (AC8a), as in the design.
3. Session length: **rarely** asked to sign in again. Long-lived sessions (AC11).
4. **Dark mode toggle included** in the account menu (AC13, AC19a), as in the design.
5. Quantity entry convention (for later features): **trays + loose, as two fields**, per the design.
6. UX checkpoint (2026-09-25): **mobile uses bottom tabs**, not the design's drawer (AC17). The **desktop account menu is in the sidebar footer** (AC16 reworded). **Light mode darkens the brand green** for buttons and links (#007F45) and uses a stronger error red (#E7000B); dark mode stays as designed. **The account row shows the farm name + email**, with farm initials in the avatar and no person's name.
7. Defaults taken by the team lead (the owner can override): a minimum password length of 8. AC12's "Contact support" is plain text with no link. AC21 is satisfied by the account menu + avatar initials.
8. **Logo:** `docs/design/tamago-logo.png` has the checkerboard baked in; its pixels are opaque, not transparent. Use a placeholder egg mark until the owner supplies a transparent PNG or SVG. Then export small sizes (favicon, 32/64/192/512).
9. Architect checkpoint (2026-09-25): design **approved**. For a lost phone, the admin `reset-password` command (which signs out all devices) is enough, with no paid inactivity timeout. Before deploy: pick a custom SMTP provider (devops, later).
10. **Done by the team lead with the user's approval:** T5 (the guard hook now covers `NUXT_SUPABASE_SECRET_KEY`, `supabase.secretKey`, `sb_secret_`, and legacy names, with 9 cases re-tested) and the CLAUDE.md part of T24 (the tenancy rule now describes supabase-js-as-user). DevOps still owns the command list in T24.
11. **AC11 timing (team lead, 2026-09-25; the owner can override):** local tokens are ES256, so a revoked session is detected on the **next API call, token refresh (≤1h), or full page load**, not on a plain client-side hop between two placeholder screens. This is accepted for the scaffold. Once each screen loads data through `useApi`, the next navigation will be covered too. We won't add a `/api/me` call on every navigation. QA procedure for AC11: revoke the session, then **reload or trigger an API call**, not just navigate.
12. Still needed before provisioning the real account: the owner email and the farm name. The design shows "Hendricks Farm". Not needed for design or build.

<!-- previous open questions (answered):
1. **Tray size:** how many eggs are in one of your trays? This becomes your farm's eggs-per-tray setting and the default for new farms. The specs use 30 only as an example, and we won't assume it.
2. **Sign-in method:** are you happy signing in with email and password, or would you prefer a "magic link" emailed to you (no password to remember)? This feature builds email and password only.
3. **Staying signed in on your phone:** how often is it OK to be asked to sign in again (every day, every week, only rarely)? Being asked too often slows down barnside logging, and staying signed in longer is less safe if the phone is lost.
4. **Account details for provisioning:** which email should your account use, and what farm name should the app show?
-->

## 2.5 UX design (UX Designer)

**Source of truth:** the owner's design, `docs/design/source/template.html`. It covers the sign-in card (markup lines ~6028–6057), the app shell (~6059–6140), toasts (~6486) and the shell logic in the `text/x-dc` script (~6617–7026: nav metadata, titles and subtitles, breakpoints, dark mode). Anything marked **[proposed]** is **not in the design**: it's drawn in the same visual language (same card, tokens, type and spacing) to cover an AC. Anything marked **[conflict]** is listed in "Design vs AC conflicts" below with its resolution.

The design's per-screen content (dashboard cards, production list, sales table, inventory, clients, the Add modals, the top-bar "Add" button and the mobile FAB) belongs to **later features**. This feature builds only the shell, the auth screens, placeholders and 404.

### Flow

**A. Sign in (main path)**
`Any URL while signed out → Sign-in → Dashboard (or the screen they were sent from, AC10/AC11)`
1. Tap **Email** (skipped when autofocus works) and type it, or pick a saved login.
2. Tap **Password** (or press the keyboard's Next key) and type it.
3. Tap **Sign in** (or press the keyboard's Go key).

**Main-path tap count: 3** (2 when the email field autofocuses, and a password manager can cover both fields). **Day-to-day it's 0**, because sessions last weeks (AC11), so the owner normally opens straight into the app.

- Autofocus the email field on load. It saves a tap where the browser allows it; iOS may ignore it, which is fine.
- Email: `type="email"`, `inputmode="email"`, `autocomplete="username"`, `autocapitalize="off"`, `spellcheck="false"`, `enterkeyhint="next"`.
- Password: `type="password"`, `autocomplete="current-password"`, `enterkeyhint="go"`. Enter submits the form.
- Validate on submit, not while typing. After a failed submit, clear each field's message as soon as that field becomes valid. Focus the first invalid field.
- Wrong credentials: keep the email, clear the password and focus it. Network error: keep both fields, so the owner only has to tap Sign in again.
- Success: go straight to the destination. No toast.

**B. Forgot password [proposed; the design has only the link]**
`Sign-in → "Forgot password?" → Reset your password → "Send reset link" → Check your email → (email app) tap link → Set a new password → "Save and sign in" → Dashboard + toast`
- Taps inside the app: Forgot password? (1), Send reset link (2). If the owner already typed an email on sign-in, carry it over. Then after the email link: New password (3), Confirm (4), Save and sign in (5).
- The confirmation always reads the same, whether or not the account exists (AC8a).
- If the link is expired or already used, show the "link expired" state with **Send a new link**, which opens the "Reset your password" screen again with the email carried over if it's known.

**C. Session expired (AC11) [proposed]**
`Any action/navigation → Sign-in with info banner → Sign in → back to the same screen`

**D. Signed in but not linked to a farm (AC12) [proposed]**
`Sign in → "No farm linked" card (no shell, no nav) → "Sign out" → Sign-in`

**E. Navigate:** 1 tap on any tab or sidebar item. Resizing across breakpoints swaps the nav pattern in place and keeps the current screen (AC18).

**F. Account menu:** tap the avatar or account row (1), then **Dark mode** or **Sign out** (2). Sign out has no confirmation (AC14) and goes to sign-in. The dark-mode toggle leaves the menu open so the owner sees the change. Sign out always finishes locally, even with no signal. If the server can't be reached, the local session is still cleared.

### Layouts

Wireframes aren't to scale. Tab labels are shown in full in the build, and the ASCII only abbreviates them to fit. Nuxt UI component names are approximate (v4). The frontend dev confirms the APIs.

#### Sign-in (mobile ~375px, desktop is the same card centred)
From the design: the page is `bg-muted` with 24px padding. The card is `bg-default`, max-width 380px, 16px radius (`rounded-2xl`), hairline ring plus `shadow-md`, 32px padding, 20px vertical gap. Fields have a 12px gap, and each label sits 6px above its input. Labels are 16px weight 500.

```
┌───────────────────────────────────────┐  page: bg-muted, p-6
│ ┌───────────────────────────────────┐ │  card (UCard or a plain div with the tokens)
│ │           [Tamago logo]           │ │  48px logo image          [conflict C1]
│ │              Tamago               │ │  text-xl 700, highlighted
│ │      Sign in to your tracker      │ │  text-base, muted
│ │                                   │ │
│ │ ┌───────────────────────────────┐ │ │  UAlert (error / info), only when needed
│ │ │ (!) Incorrect email or        │ │ │
│ │ │     password. Try again.      │ │ │
│ │ └───────────────────────────────┘ │ │
│ │ Email                             │ │  UFormField label="Email"
│ │ ┌───────────────────────────────┐ │ │  UInput type=email, 44px tall [C5]
│ │ │ you@yourfarm.com              │ │ │
│ │ └───────────────────────────────┘ │ │
│ │ Enter your email                  │ │  field error (UFormField error), only when invalid
│ │ Password                          │ │
│ │ ┌───────────────────────────┬───┐ │ │  UInput type=password + trailing
│ │ │ ••••••••                  │ ◉ │ │ │  show/hide UButton (44px) [proposed]
│ │ └───────────────────────────┴───┘ │ │
│ │ ┌───────────────────────────────┐ │ │  UButton color=primary block, 44px [C5]
│ │ │            Sign in            │ │ │  loading → spinner + disabled
│ │ └───────────────────────────────┘ │ │
│ │          Forgot password?         │ │  UButton variant=link (or ULink), 44px tap area
│ └───────────────────────────────────┘ │
└───────────────────────────────────────┘
```
- **Mobile tweak [proposed]:** below 768px, top-align the card (about 48px from the top) instead of centring it vertically, so the fields and button stay above the on-screen keyboard. At 375px the card is 327px wide, so nothing scrolls sideways (AC7).
- There's **no** sign-up link anywhere (AC2). There's also no dark-mode toggle on this screen: it follows the saved choice or the system setting (AC19a).
- You could build this with `UAuthForm`, but only if it can show exactly these fields, copy and states, with no provider buttons and no sign-up text. Otherwise use `UForm` + `UFormField` + `UInput` + `UButton`.

#### Reset your password / Check your email / Set a new password / Link expired [proposed]
These use the same card, header and spacing as sign-in. Only the heading, subheading and body change.

```
┌───────────────────────────────┐   ┌───────────────────────────────┐
│         [Tamago logo]         │   │         [Tamago logo]         │
│      Reset your password      │   │         Check your email      │
│  Enter your email and we'll   │   │  If that email has an account,│
│  send you a reset link.       │   │  we've sent a reset link.     │
│ Email                         │   │                               │
│ [ you@yourfarm.com          ] │   │ [      Back to sign in      ] │ UButton neutral outline block
│ [      Send reset link      ] │   │    Didn't get it? Send again  │ UButton link
│        Back to sign in        │   └───────────────────────────────┘
└───────────────────────────────┘
┌───────────────────────────────┐   ┌───────────────────────────────┐
│         [Tamago logo]         │   │         [Tamago logo]         │
│      Set a new password       │   │   This reset link has expired │
│ New password                  │   │  Reset links work once and    │
│ [ ••••••••              | ◉ ] │   │  expire after a while.        │
│ At least 8 characters         │   │  Request a new one.           │ hint (muted, text-sm)
│ Confirm new password          │   │ [      Send a new link      ] │ UButton primary block
│ [ ••••••••              | ◉ ] │   │        Back to sign in        │
│ [     Save and sign in      ] │   └───────────────────────────────┘
└───────────────────────────────┘
```
- New-password fields use `autocomplete="new-password"`. The "Check your email" card replaces the form in place rather than opening a new page.
- While the reset link is being checked, the card shows a spinner and "Checking your link…".

#### Not linked to a farm (AC12) [proposed]
This is the same centred card with no shell, no nav and no farm data.
```
┌───────────────────────────────┐
│         [Tamago logo]         │
│         No farm linked        │  text-xl 700
│  Your account isn't linked to │  text-base, muted
│  a farm yet. Contact support. │
│  Signed in as a@example.com   │  text-sm, dimmed
│ [          Sign out         ] │  UButton neutral outline block, 44px
└───────────────────────────────┘
```

#### App shell, desktop (≥1024px)
From the design: the sidebar is 224px expanded or 64px collapsed, `bg-default` with a right hairline, and its width animates over 200ms. The sidebar header is 56px tall with a 28px logo, "Tamago" (16px 700) and "Egg farm tracker" (12px, muted). Nav items have 8×10px padding, a 10px gap, 18px icons, 16px weight-500 text and a 6px radius. The **active** item has a 12% primary tint background and primary-coloured text; inactive items are muted and hover to `bg-elevated`. The top bar is 56px tall with 20px side padding, `bg-default` and a bottom hairline. Its title is text-xl 700 with −0.01em tracking, and its subtitle is text-sm muted. The main area is `bg-muted` with 24px padding, and content is centred at max-width 1120px.

```
┌────────────────────────┬──────────────────────────────────────────────────────────┐
│ [logo] Tamago          │ «   Dashboard                                            │ ← UDashboardNavbar
│        Egg farm tracker│     Today, Sep 25                                        │   « = UDashboardSidebarCollapse
├────────────────────────┼──────────────────────────────────────────────────────────┤
│ ▌▦ Dashboard   ◄active │                                                          │
│   ▤ Production         │         ┌──────────────────────────────────────┐         │
│   ⊡ Sales              │         │                 (▦)                  │         │ ← placeholder:
│   ▢ Inventory          │         │   Your farm overview is coming soon  │         │   UEmpty in a
│   ⚇ Clients            │         │   Today's trays, what's on hand and  │         │   card surface
│                        │         │   pending deliveries will show here. │         │
│   UNavigationMenu      │         └──────────────────────────────────────┘         │
│   orientation=vertical │                                                          │
├────────────────────────┤                                                          │
│ (HF) Hendricks Farm  › │ ← account row: UDropdownMenu trigger (UUser-like)        │
│      owner@example.com │    [conflict C3/C4]                                      │
└────────────────────────┴──────────────────────────────────────────────────────────┘
  UDashboardGroup › UDashboardSidebar (collapsible) + UDashboardPanel
```
- The top bar's right side is empty in this feature. The design's context-aware "Add …" button arrives with later features (C7).
- The account menu opens **upward** from the sidebar footer, 8px above it and aligned to its left edge, in the design's position.

#### App shell, tablet (768–1023px), icon rail
From the design: the sidebar starts **collapsed** at this width (64px, icons only). The top-bar chevron (» / «) expands it to 224px, and it pushes the content rather than overlaying it. Each icon gets a tooltip with its label (`UTooltip`, or the design's `title`).
```
┌──────┬─────────────────────────────────────────────┐
│[logo]│ »   Sales                                   │
│      │     Deliveries and on-site sales            │
├──────┼─────────────────────────────────────────────┤
│  ▦   │                                             │
│ [⊡]◄ │     ┌──────────────────────────────────┐    │
│  ▤   │     │               (⊡)                │    │
│  ▢   │     │  Sales and deliveries are coming │    │
│  ⚇   │     │  soon                            │    │
│      │     │  Record deliveries and on-site   │    │
│      │     │  sales here.                     │    │
├──────┤     └──────────────────────────────────┘    │
│ (HF) │ ← avatar only; opens the account menu       │
└──────┴─────────────────────────────────────────────┘
```
- **[proposed]** At this width (usually touch), make rail items, the collapse toggle and the avatar at least 44×44px. The design's items are about 40px, and the toggle is about 26px (C10).
- The expanded or collapsed choice lasts for the session only. When the window crosses a breakpoint, it resets to that breakpoint's default, as in the design.

#### App shell, mobile (<768px) [proposed: bottom tabs replace the design's hamburger drawer, C2]
```
┌─────────────────────────────────────────────────────────┐
│ Production                                       (HF)   │ ← top bar 56px, px-4, bg-default,
│ Logged by day, most recent first                        │   bottom hairline. (HF) = avatar,
├─────────────────────────────────────────────────────────┤   44×44 target → UDropdownMenu
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │ ← main: bg-muted, p-4,
│  │                       (▤)                         │  │   bottom padding clears the tab bar
│  │        Production logging is coming soon          │  │
│  │       Log each morning's trays by size here.      │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤ ← tab bar: fixed bottom, bg-default,
│    ▦          ▤          ⊡          ▢          ⚇        │   top hairline, 64px + safe-area
│ Dashboard [Production]  Sales   Inventory   Clients     │   5 equal columns (75px at 375)
│             ▔▔▔▔▔▔                                      │   active: tint pill + primary + 600
└─────────────────────────────────────────────────────────┘
```
- Each tab is a `NuxtLink`/`ULink` column (or a horizontal `UNavigationMenu` if it can do icon-over-label at equal widths) with a 22px icon over a 12px weight-500 label. The whole column is the tap target, 64px tall. The tabs need `env(safe-area-inset-bottom)` padding.
- **Active tab** (not by colour alone): the icon sits in a pill with a 12% primary tint (the design's active style), the label turns primary and weight 600, and the link has `aria-current="page"`.
- The mobile top bar has no hamburger and no drawer. The account avatar sits at the right.
- When the FAB arrives later, it has to sit above the tab bar, at bottom: 64px + safe area + 16px (C7).

**Account menu (all sizes).** `UDropdownMenu` with a 240px panel. The design's panel is 200px; this one is wider so the email fits. It has an 8px radius, `shadow-lg` and 6px padding. Items have 8×10px padding, 16px text and 16px icons. On mobile, make items at least 44px tall.
```
┌──────────────────────────────┐
│ Hendricks Farm               │  header, not a menu item: 16px 600, highlighted
│ owner@example.com            │  text-sm muted, truncated with ellipsis
├──────────────────────────────┤
│ ☾  Dark mode                 │  "☀ Light mode" while dark is active (design)
├──────────────────────────────┤
│ ⇥  Sign out                  │  error colour (design) + icon, so not colour alone
└──────────────────────────────┘
```
- The trigger avatar shows the farm's initials (for example "HF"), using `UAvatar` size sm (32px) inside a 44px hit area.

#### Placeholder screens (AC19)
Each placeholder is a single card: `bg-default`, 16px radius, hairline ring, 40px padding (24px on mobile), max-width 560px, centred at the top of the content area. `UEmpty` works if its styling can match. Inside: the tab's icon (32px) in a 56px circle with a 12% primary tint, a heading (text-lg 600, highlighted) and one line of body text (text-base, muted). There's **no CTA button**, because there's nothing to act on yet. There are **no numbers, trays, eggs or client names** (C6).

#### 404 (AC20) [proposed]
- **Signed in:** render inside the shell. The top bar title is "Page not found" and no nav item is highlighted. The content is the same placeholder-style card with a `search-x` icon, a "404" eyebrow (text-sm, dimmed), the heading, the body text and a **Go to Dashboard** button (primary).
- **Signed out:** show the same card standalone, centred like sign-in. **Go to Dashboard** then leads to sign-in through the normal guard. The card shows no farm name (AC9).
- Nuxt's `error.vue` with `UError`, or a catch-all route. The architect or frontend dev decides; the visuals above apply either way.

### States

| Screen / area | State | What the owner sees |
|---|---|---|
| Sign-in | Default | The card as above, with email autofocused. |
| | Loading (AC5) | The Sign in button shows a spinner and is disabled, and the fields are read-only. A second tap does nothing. |
| | Validation (AC4) | A message under each invalid field (`UFormField` error, red text plus a red input ring), with the first invalid field focused. No request is sent. |
| | Wrong credentials (AC3) | An error `UAlert` above the fields (design style: 10% error tint, 25% error ring, 6px radius). The email is kept, the password cleared and focused. |
| | Network error (AC6) | The same banner slot with the connection copy. Both fields are kept, and tapping Sign in retries. |
| | Session expired (AC11) [proposed] | An **info** `UAlert` (neutral or info tint, not red) above the fields. It clears on the next submit. |
| | Already signed in (AC8) | A server-side redirect to the Dashboard, so the form never flashes. |
| App boot / auth check [proposed] | Loading | A full-screen `bg-muted` with the centred Tamago logo and a small spinner. It never shows a farm name or nav before auth is confirmed (AC9). If SSR resolves auth first, this state rarely appears. |
| Shell | Default | Nav plus top bar, with the farm name and email in the account area. |
| | Farm/membership load failed [proposed] | A centred card: "Couldn't load your farm." with **Try again** (primary) and **Sign out** (neutral). No blank page. |
| | Not linked to a farm (AC12) | The "No farm linked" card. |
| Account menu | Toggle dark mode (AC19a) | Switches immediately, with the label and icon flipping. It follows the system setting until the owner chooses, then the choice is remembered on the device. |
| | Sign out (AC14) | One tap goes to sign-in, with no toast and no confirmation. |
| Forgot / reset [proposed] | Loading | The button shows a spinner and is disabled ("Send reset link", "Save and sign in"). |
| | Validation | Empty or invalid email; password too short; the two passwords don't match. |
| | Sent | The "Check your email" card, identical whether or not the account exists. |
| | Link invalid or used | The "This reset link has expired" card. |
| | Server/network error | The error `UAlert` above the form with the connection or generic copy. |
| | Success | Land on the Dashboard with a toast. |
| Placeholders | Default (the only state) | The placeholder card. There's no data, so there's no loading or empty state. |
| 404 | Default | As above. |

**Toasts.** Use the design's toast style: inverted surface (`bg-inverted` / `text-inverted`), 8px radius, a Check icon, bottom-centre, about 2.6s. On mobile it sits above the tab bar. `useToast` with the toaster set to bottom-centre in `UApp`. This feature has only one toast.

### Copy

| Where | Text |
|---|---|
| App name / subtitle (sidebar) | **Tamago** / **Egg farm tracker** |
| Logo alt | `Tamago` (the design says "Hendricks Farm logo", C11) |
| Sign-in heading / subheading | **Tamago** / **Sign in to your tracker** |
| Labels / placeholders | **Email**, placeholder `you@yourfarm.com` · **Password**, placeholder `••••••••` |
| Show/hide password (aria-label) [proposed] | `Show password` / `Hide password` |
| Button / link | **Sign in** · **Forgot password?** |
| Field errors [proposed] | `Enter your email` · `Enter a valid email, like you@yourfarm.com` · `Enter your password` |
| Wrong credentials (design copy, C9) | `Incorrect email or password. Try again.` |
| Network error (AC6) | `Couldn't connect. Check your connection and try again.` |
| Other/unknown sign-in error [proposed] | `Something went wrong. Try again.` |
| Session expired (AC11) | `Your session has expired. Please sign in again.` |
| Reset request [proposed] | Heading **Reset your password** · body `Enter your email and we'll send you a reset link.` · button **Send reset link** · link **Back to sign in** |
| Reset sent (AC8a) | Heading **Check your email** · body `If that email has an account, we've sent a reset link.` · **Back to sign in** · **Didn't get it? Send again** |
| Rate-limited resend [proposed] | `Please wait a minute before trying again.` |
| Set new password [proposed] | Heading **Set a new password** · **New password** (hint `At least 8 characters`) · **Confirm new password** · button **Save and sign in** |
| Password errors [proposed] | `Use at least 8 characters` · `Passwords don't match` · `Couldn't save your new password. Try again.` |
| Checking link [proposed] | `Checking your link…` |
| Link expired [proposed] | Heading **This reset link has expired** · body `Reset links work once and expire after a while. Request a new one.` · button **Send a new link** · **Back to sign in** |
| Password saved toast [proposed] | `Password updated` |
| Not linked (AC12) | Heading **No farm linked** · body `Your account isn't linked to a farm yet. Contact support.` · `Signed in as {email}` · button **Sign out** |
| Farm load failed [proposed] | `Couldn't load your farm.` · **Try again** · **Sign out** |
| Nav labels (design, in order) | **Dashboard**, **Production**, **Sales**, **Inventory**, **Clients** |
| Top-bar titles / subtitles (design) | Dashboard, `Today, {Mon D}` (the device's date, e.g. "Today, Sep 25"; a date, not a figure) · Production, `Logged by day, most recent first` · Sales, `Deliveries and on-site sales` · Inventory, `Live view — produced minus sold` · Clients, **`Your customers`** [proposed; the design shows a count, "5 customers", C6] |
| Sidebar toggle (aria-label) | `Collapse sidebar` / `Expand sidebar` |
| Account menu | `{Farm name}` · `{email}` · **Dark mode** / **Light mode** · **Sign out** · trigger aria-label `Account menu` |
| Placeholder: Dashboard | **Your farm overview is coming soon** · `Today's trays, what's on hand and pending deliveries will show here.` |
| Placeholder: Production | **Production logging is coming soon** · `Log each morning's trays by size here.` |
| Placeholder: Sales | **Sales and deliveries are coming soon** · `Record deliveries and on-site sales here.` |
| Placeholder: Inventory | **Inventory is coming soon** · `See how many trays you have on hand, by size.` |
| Placeholder: Clients | **Your client list is coming soon** · `Keep your customers and their usual prices here.` |
| 404 | Eyebrow `404` · heading **Page not found** · body `We couldn't find that page.` · button **Go to Dashboard** |

### Quantity entry
This feature has no quantity entry. The owner already decided on trays + loose as two fields (decision 5), and the design's forms follow it (a trays `UInputNumber` plus a loose one capped at eggs-per-tray − 1). That component ships with the first feature that enters quantities.

### Accessibility
- **Tap targets ≥ 44px:** the Sign in button, inputs, the show/hide button, the Forgot password link, tabs (64px), the avatar trigger, menu items on mobile, and rail items and the toggle on tablet. The design's 36px inputs and 40px button are raised (C5, C10).
- **Labels:** every input has a visible `<label>` tied to it (`UFormField`). The design's labels aren't tied to their inputs.
- **Errors:** banners use `role="alert"`, and field errors are linked with `aria-describedby` (`UFormField` handles this). Errors show an icon and text, not colour alone.
- **Current page:** marked with `aria-current="page"`, plus the tint pill and heavier label weight, not colour alone.
- **Body text is 16px**, the design's base size, which also stops iOS from zooming into inputs.
- **Contrast in sunlight:** the design's light-mode brand green (#00C16A) with white text is about **2.4:1**, and red-500 error text on white is about **3.8:1**. Both fail WCAG AA for 16px text. Owner decision O1 below. Dark mode is fine (green-400 with dark text).
- **Keyboard / focus:** Nuxt UI's focus rings stay visible. Custom tab links need a matching `focus-visible` ring.
- **Motion:** the design's 150–300ms transitions are fine. Respect `prefers-reduced-motion` for the sidebar width and sheet animations.

### Design tokens & theming (for the frontend dev)
- **Where the tokens live:** `docs/design/source/template.html`.
  - Figma variables, light `:root` (lines 11–1349), dark `:root[data-theme="dark"], .dark` (1350–2083). This block is repeated at 3013–6015.
  - Semantic aliases, type scale, radius, shadows, motion and the hairline `--ring-inset` (2943–2994).
  - Webfonts (2526–2942).
  - The `:root[data-mode=…]` blocks (sky, purple, teal, orange, zinc, Public Sans and so on, 2096–2524) are Figma kit variants. **Ignore them.**
- **They map onto Nuxt UI semantic colours** (the design uses `--ui-primary`, `--ui-success`, `--ui-info`, `--ui-bg-muted`, `--ui-text-muted` and so on, which are Nuxt UI's own CSS variables). In `app.config.ts` under `ui.colors`, set:
  - `primary: 'green'`
  - `secondary: 'blue'`
  - `success: 'green'`
  - `info: 'blue'`
  - `warning: 'yellow'`
  - `error: 'red'`
  - `neutral: 'slate'`

  Light mode uses shade 500 and dark mode shade 400, which is Nuxt UI's default mapping.
- **Brand green is not Tailwind's green.** It's the "Nuxt green" scale: 50 `#EFFDF5`, 400 `#00DC82`, 500 `#00C16A`, 600 `#00A155`, 700 `#007F45`, 800 `#016538`, 900 `#0A5331` (full scale as `--uicolors-green-*`, around lines 1145–1156). Define it once as `--color-green-*` in `@theme` in `main.css`. Blue, red, yellow and slate match Tailwind v4 defaults.
- **Surfaces:** the page background is `--ui-bg-muted` (`bg-muted`) and cards and bars are `--ui-bg` (`bg-default`). Cards use a 1px **inset ring** instead of a border (`--ring-inset`, i.e. Nuxt UI's `ring ring-default` / `ring-inset`).
- **Radius:** `--ui-radius: 4px`, which is `0.25rem`, the Nuxt UI default. The design's usages: cards and auth card 16px (`rounded-2xl`), menu panel 8px, nav items and banners 6px, and the logo tile 6–8px.
- **Type:** **DM Sans** for all UI text, weights 400/500/600/700. **DM Mono** is for code only. Public Sans (an alt theme) and Inter/Roboto (design-tool chrome) should **not** ship. Headings are semibold with −0.02em tracking, and top-bar titles are 700 with −0.01em. Load DM Sans with **`@nuxt/fonts`** (comes with Nuxt UI), self-hosted from Google Fonts, and set `--font-sans: 'DM Sans', …` in `@theme`. The design's `.woff2` files in `source/assets/` are the same Google Fonts files.
- **Dark mode:** the design toggles `data-theme="dark"`, while Nuxt UI and `@nuxtjs/color-mode` use the `.dark` class. The token CSS supports both, so use `.dark`, set `preference: 'system'` and store it per device (AC19a).
- **Icons:** Lucide via Iconify.
  - Nav: `i-lucide-layout-dashboard`, `i-lucide-clipboard`, `i-lucide-shopping-cart`, `i-lucide-package`, `i-lucide-users`.
  - Other: `log-out`, `moon`, `sun`, `chevron-left` / `chevron-right` (sidebar toggle), `eye` / `eye-off`, `search-x`, `unlink`, `check`.
- **Logo:** `docs/design/tamago-logo.png` is 1024px and 1.3 MB. Export small copies (for example 64px and 128px for @2x, plus a favicon), and check that the transparency is real: the preview shows a checkerboard that may be baked in.

### Design vs AC conflicts
| # | Design | AC / rule | Resolution |
|---|---|---|---|
| C1 | The sign-in header shows **"Hendricks Farm"** with a green tile and a **Leaf** icon. | AC9 (no farm name while signed out). Before sign-in the app can't know which farm it is. Branding is Tamago plus the logo. | Use the **Tamago logo + "Tamago"**. Keep "Sign in to your tracker". |
| C2 | Mobile nav is a **hamburger and slide-in drawer** (248px). There are no bottom tabs. | AC17, UI spec §1/§11: bottom tab bar, all 5 visible. | **Bottom tabs** (AC wins; approved). The drawer isn't built. Owner, please note (O3). |
| C3 | On desktop the account menu sits in the **sidebar footer**. The top bar has none. | AC16: "top bar showing the current screen title **and the account menu**". | **Recommend the design** (sidebar footer on desktop and tablet, top-bar avatar on mobile). It still meets AC13 (reachable everywhere). **PM, please reword AC16** (Q1), or we move it to the top bar. |
| C4 | The account row shows **"Jamie Hendricks / Owner"** with initials "JH". There's no email and no farm name. | AC13 (email + farm name). Provisioning (AC30) doesn't collect a person's name. | Show the **farm name + email**, with farm initials in the avatar (O2). |
| C5 | Inputs are **36px** tall and the Sign in button is **40px**. | AC7 (button ≥ 44px); tap-target rule. | Use a larger size for inputs and the button (about 44px, e.g. `size="lg"`/`"xl"`; confirm). |
| C6 | Every screen has **sample figures** (dashboard cards, lists, "5 customers" subtitle). | AC19 (no made-up numbers, trays, eggs or clients). | **Placeholders win.** The per-screen content is for later features, and the Clients subtitle becomes "Your customers". |
| C7 | The top-bar **"Add …" button** and mobile **FAB** (bottom 20px). | Out of scope for this feature. | Not built now. Later, the FAB has to sit above the tab bar. |
| C8 | Light-mode **white on green-500 (≈2.4:1)** and **red-500 text (≈3.8:1)**. | Sunlight readability, WCAG AA 4.5:1. | Owner decision (O1). |
| C9 | Error copy is "Incorrect email or password. Try again." | AC3 gives "Email or password is incorrect" *as an example*. | Use the **design copy**. It's identical for both cases, so it meets AC3. |
| C10 | The sidebar toggle is about 26px, and nav and menu items are about 40px. | Tap-target rule on touch (tablet and mobile). | Raise to 44px at touch breakpoints. |
| C11 | The logo alt text is "Hendricks Farm logo". | AC9 / branding. | Change it to "Tamago". |
| C12 | Dark mode starts **off**, with no system default. | AC19a (follow the system until the owner chooses). | AC wins. |

### Data the UI needs (for the architect)
- **After sign-in:** the signed-in **email**, the **farm name**, and whether the user **has a farm membership** (this separates the shell from the AC12 "No farm linked" card). All of it should be available at SSR, so the shell never flashes empty or someone else's data.
- **Why the owner is on sign-in:** a flag for *session expired* versus *signed out / never signed in* (AC11 banner), plus the **return-to path** (AC10/AC11). The return path must be a same-app path only.
- **Sign-in error kind:** invalid credentials, network or unreachable, rate-limited, or other. These map to the copy above. They must never reveal whether an email exists.
- **Reset-link status:** valid, expired or already used. Plus the **minimum password length**, from one source shared with server validation (I propose 8, O4).
- **Optional:** the last email used on this device, to pre-fill after a session expiry. It's safe to skip.
- Eggs-per-tray isn't displayed in this feature.

### Questions for PM
- **Q1 (C3):** Is the account menu in the desktop **sidebar footer** (design) acceptable for AC16? If so, please reword AC16. If not, it goes top-right on desktop too.
- **Q2 (AC21):** "App screens always show the farm's name". On desktop the expanded sidebar shows it all the time. On the tablet rail and on mobile it's one tap away in the account menu. Is that enough? If it has to show without a tap, I'd use the mobile top-bar subtitle slot and the rail tooltip.
- **Q3 (AC12):** "Contact support". Is there a support email or contact to link? The default is plain text with no link.

### Decisions for owner
- **O1: Brand green readability in sunlight.** In light mode, white text on your green (#00C16A) is hard to read outdoors (about 2.4:1). I recommend a darker green (**#007F45**) for buttons and links in light mode only (about 5:1), and **#E7000B** for red error text. Dark mode stays as designed. Alternatives: keep the bright green with dark text on buttons, or keep it exactly as designed.
- **O2: Account row.** Your design shows a person's name ("Jamie Hendricks, Owner"), but the app doesn't collect a name yet. I propose showing the **farm name and email** instead. (Adding a display name to account setup would be a scope change for the PM.)
- **O3: Mobile navigation.** Your design uses a menu button with a slide-out drawer on phones. The approved requirements use **bottom tabs** so all 5 sections are one thumb-tap away. I'm going with tabs, drawn in your design's style. Please confirm.
- **O4: Minimum password length.** I propose **8 characters**.
- **O5: Logo.** Sign-in and the sidebar use `tamago-logo.png` instead of the design's leaf icon. Please confirm, and check whether the image has a real transparent background.

## 3. Technical design (Architect)

Docs checked on 2026-09-25 (WebFetch/npm): Nuxt 4.5.2 is the latest release; Nuxt 5 isn't out. `@nuxt/ui` is at 4.11.2, `@nuxtjs/supabase` at 2.0.10 (built on `@supabase/ssr` 0.12; `useSupabaseUser`/`serverSupabaseUser` return **JWT claims** through `getClaims()`), and the Supabase CLI at 2.117. The CLI's `test db` runs pgTAP through `pg_prove` and accepts paths; the local mail catcher is **Mailpit** at `:54324` (the config section is still `[inbucket]`). TypeScript 7 is out, but vue-tsc still needs the TS 6 API.

### 3.1 Project setup

**Layout: Nuxt 4 with the `app/` directory.**
```
app/            app.vue, app.config.ts, error.vue, assets/css/main.css, layouts/, pages/,
                components/, composables/, middleware/, plugins/, utils/
server/         api/, utils/, repositories/, plugins/, cli/   (cli/ isn't bundled by Nitro; it is typechecked)
shared/         types/ (api.ts, database.types.ts), constants/, utils/, schemas/   (auto-imported in app + server)
supabase/       config.toml, migrations/, templates/recovery.html, tests/database/*.sql
tests/unit/     Vitest specs (node environment)
public/         favicon.svg
```

**Packages** (caret on the pinned major; Node pinned with `.nvmrc` = `24` and `"engines": { "node": ">=24.11 <25" }`):

| Dependency | Version | Dev dependency | Version |
|---|---|---|---|
| `nuxt` | `^4.5.2` | `typescript` | **`~6.0.3`** (not 7; D13) |
| `@nuxt/ui` (bundles `@nuxt/fonts`, `@nuxt/icon`, `@nuxtjs/color-mode`) | `^4.11.2` | `vue-tsc` | `^3.3.11` |
| `tailwindcss` | `^4.3.3` | `@nuxt/eslint` + `eslint` | `^1.17.0` + `^10` |
| `@nuxtjs/supabase` | `^2.0.10` | `vitest` | `^5.0.1` |
| `@supabase/supabase-js` (explicit, for the CLI script) | `^2.117.1` | `supabase` (CLI) | `^2.117.0` |
| `zod` | `^4.6.5` | ~~`tsx`~~ (dropped: Bun runs the TS CLI directly) | n/a |
| `@vueuse/core` (same major Nuxt UI uses) | `^14` | `@types/node` | `^24` |
| `@iconify-json/lucide` (icons bundled locally, no runtime Iconify API calls) | `^1.2` | | |

Don't add `@nuxt/fonts`, `@nuxt/icon` or `@nuxtjs/color-mode` to `modules`, because Nuxt UI registers them itself. Configure them through the `fonts`, `icon` and `colorMode` keys.

**`nuxt.config.ts` (the parts the design depends on):**
- `modules: ['@nuxt/ui', '@nuxtjs/supabase', '@nuxt/eslint']`, `css: ['~/assets/css/main.css']`, `compatibilityDate: '2026-09-01'`.
- `typescript: { strict: true }`. This is the Nuxt 4 default; keep `noUncheckedIndexedAccess` on too. `typeCheck` stays off in dev, because `bun run typecheck` handles it.
- `supabase: { redirect: false, types: '~~/shared/types/database.types.ts', cookieOptions: { maxAge: 60 * 60 * 24 * 400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }, clientOptions: { auth: { flowType: 'pkce' } } }`. `redirect: false` because we run our own middleware (D11). The 400-day cookie supports AC11 (D10). If the module doesn't resolve `~~`, use `./shared/types/database.types.ts`.
- `colorMode: { preference: 'system', fallback: 'light', classSuffix: '' }`. The owner's choice is stored in localStorage and isn't cleared on sign-out (AC19a).
- `fonts: { families: [{ name: 'DM Sans', provider: 'google', weights: [400, 500, 600, 700] }] }`. Fonts are self-hosted at build time. DM Mono and Public Sans don't ship.
- `icon: { serverBundle: 'local', clientBundle: { scan: true } }`.
- `app.head`: `viewport: 'width=device-width, initial-scale=1, viewport-fit=cover'` (for bottom-tab safe areas), `meta: [{ name: 'robots', content: 'noindex, nofollow' }]`, a favicon link to `/favicon.svg`, and `htmlAttrs: { lang: 'en' }`.
- `runtimeConfig`: see §3.9. The module fills `public.supabase.{url,key}` and the private `supabase.secretKey`.

**Package scripts (exact):**
```jsonc
"dev": "nuxt dev",
"build": "nuxt build",
"preview": "nuxt preview",
"postinstall": "nuxt prepare",
"typecheck": "nuxt typecheck",          // the Stop hook runs `bun run typecheck`
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"test": "bun run test:unit && bun run test:db",
"test:unit": "vitest run",
"test:db": "supabase test db",          // = the tenant-isolation suite (AC29); needs `bun run db:start`
"db:start": "supabase start",
"db:stop": "supabase stop",
"db:reset": "supabase db reset",        // re-applies migrations locally
"db:types": "supabase gen types typescript --local > shared/types/database.types.ts",
"provision": "bun --env-file=.env server/cli/provision.ts"
```
- ESLint: `eslint.config.mjs` = `withNuxt({ ignores: ['shared/types/database.types.ts'] })`, with `eslint: { config: { stylistic: true } }` in `nuxt.config`. `lint` depends on `.nuxt/eslint.config.mjs`, which `postinstall` generates.
- Vitest: `vitest.config.ts` from `vitest/config`, with `environment: 'node'` and `include: ['tests/unit/**/*.spec.ts']`. Specs use relative imports. Add `@nuxt/test-utils` (`^4.3`) later, when the first component test needs a Nuxt environment.
- The Supabase CLI needs Docker Desktop, which the README says. Every DB script targets the **local** stack; nothing uses `--linked`.

### 3.2 Data

Three migrations, each created with `bunx supabase migration new <name>`:

**M1 `foundation_helpers`**
```sql
create schema if not exists app;   -- NOT in [api].schemas, so PostgREST doesn't expose it
grant usage on schema app to authenticated;
create function app.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
```

**M2 `tenants_memberships`**

| Table | Column | Type / constraint |
|---|---|---|
| `public.tenants` | `id` | `uuid primary key default gen_random_uuid()`: **this is the tenant id** |
| | `name` | `text not null check (char_length(btrim(name)) between 1 and 100)` |
| | `eggs_per_tray` | `integer not null default 30 check (eggs_per_tray >= 1)` |
| | `created_at`, `updated_at` | `timestamptz not null default now()` |
| `public.memberships` | `id` | `uuid primary key default gen_random_uuid()` |
| | `tenant_id` | `uuid not null references public.tenants(id) on delete cascade` |
| | `user_id` | `uuid not null references auth.users(id) on delete cascade` |
| | `created_at`, `updated_at` | `timestamptz not null default now()` |

- `constraint memberships_user_id_key unique (user_id)`: one farm per user in v1. When multi-farm arrives, replace it with `unique (tenant_id, user_id)`.
- `create index memberships_tenant_id_idx on public.memberships (tenant_id);`: the index leads with `tenant_id`.
- Triggers `set_updated_at` (`before update ... for each row execute function app.set_updated_at()`) on both tables.
- **The shared tenant-resolution helper**, created after `memberships`:
  ```sql
  create function app.current_tenant_id() returns uuid
    language sql stable security definer set search_path = '' as $$
    select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()) limit 1
  $$;
  revoke all on function app.current_tenant_id() from public;
  grant execute on function app.current_tenant_id() to authenticated;
  ```
  Every later policy calls it as `(select app.current_tenant_id())` so the planner evaluates it once per statement (initPlan).

**Is `tenants` exempt from "every table has `tenant_id`"?** `tenants` is the **root**: its `id` *is* the tenant id, and there's no redundant `tenant_id` column. Every other table (memberships now; production, sales and clients later) carries `tenant_id uuid not null references tenants(id)`. The coverage meta-test (§3.7) enforces this, with `tenants` as the one named exception, keyed on `id`. The rule's intent is that every row is attributable to a tenant and RLS-filtered by it, and the root does that through `id` (D4). This is recorded in the architecture spec §5.

**M3 `provisioning_functions`** (service-role only, called by the CLI through `supabase-js` `rpc`):
```sql
public.admin_user_id_by_email(p_email text) returns uuid
  -- security definer, search_path=''; select id from auth.users where lower(email) = lower(p_email)
public.admin_revoke_sessions(p_user_id uuid) returns integer
  -- security definer; delete from auth.sessions where user_id = p_user_id (refresh tokens cascade); returns rows deleted
public.provision_farm(p_user_id uuid, p_farm_name text, p_eggs_per_tray integer default null, p_update boolean default false)
  returns table (tenant_id uuid, farm_name text, eggs_per_tray integer, outcome text)   -- 'created' | 'unchanged' | 'updated'
```
- `provision_farm` runs in one transaction. If the user already has a membership, it returns `unchanged`; with `p_update`, it updates `name` and (if given) `eggs_per_tray` and returns `updated`. Otherwise it inserts the tenant and the membership and returns `created`. When `p_eggs_per_tray is null`, the INSERT **omits the column**, so the DB default applies and the value 30 appears in exactly one place, the column default. `unique(user_id)` settles a concurrent double-run: the second one fails and rolls back its tenant insert.
- On all three: `revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`. Supabase grants EXECUTE on new `public` functions to anon/authenticated by default, so the revoke is mandatory. The coverage test checks it.

Types: after the migrations, run `bun run db:types` and commit `shared/types/database.types.ts`.

### 3.3 RLS

| Table | Grants | Policies |
|---|---|---|
| `tenants` | `revoke all on public.tenants from anon, authenticated;` then `grant select on public.tenants to authenticated;` | `tenants_select_own`: `for select to authenticated using (id = (select app.current_tenant_id()))`. **No** insert/update/delete policy. |
| `memberships` | `revoke all ... from anon, authenticated;` then `grant select ... to authenticated;` | `memberships_select_own`: `for select to authenticated using (user_id = (select auth.uid()))`. **No** insert/update/delete policy. |

- Both tables get `enable row level security`. `force` isn't needed: the owner role (`postgres`) is used only by migrations and tests, and `service_role` has BYPASSRLS by design, for provisioning only.
- **Owners can't create or change tenants or memberships (v1).** There are no write grants and no write policies, so any write through the API fails with 42501. This blocks "A inserts a membership into B's farm". Owners can't edit their own eggs_per_tray either; it's set at provisioning, and a settings screen is out of scope.
- **`with check`:** there are no write policies in this feature. The **policy template every later table copies** (now in the architecture spec):
  ```sql
  alter table public.<t> enable row level security;
  revoke all on public.<t> from anon;
  create policy <t>_select on public.<t> for select to authenticated
    using (tenant_id = (select app.current_tenant_id()));
  create policy <t>_insert on public.<t> for insert to authenticated
    with check (tenant_id = (select app.current_tenant_id()));
  create policy <t>_update on public.<t> for update to authenticated
    using (tenant_id = (select app.current_tenant_id())) with check (tenant_id = (select app.current_tenant_id()));
  create policy <t>_delete on public.<t> for delete to authenticated
    using (tenant_id = (select app.current_tenant_id()));
  ```

### 3.4 Server

**DB access mode for v1 (D3): `supabase-js` acting as the signed-in user.** Nitro gets the client with `serverSupabaseClient(event)` (publishable key plus the user's session cookies), so PostgREST runs every query as role `authenticated` with that user's JWT claims. There's no service-role key and no direct Postgres connection in the request path.
- **Defense in depth, per spec §3:** (1) the connection role is `authenticated`, a non-superuser without BYPASSRLS; (2) tenant context is set per transaction, because PostgREST `SET LOCAL`s `request.jwt.claims` in each request's transaction and `app.current_tenant_id()` derives the tenant from it; (3) the repository layer *also* injects `tenant_id` explicitly. A forgotten filter gives an empty result, and a broken policy is still covered by the filter.
- **Serverless:** it's HTTP to PostgREST, so there's no pool in the function, and Supabase pools on its side. `/api/me` makes one auth check and one query. Multi-statement atomic writes (later features) become `security invoker` Postgres functions called through `rpc`, so each one stays a single transaction.
- A direct pooler connection with `SET LOCAL app.current_tenant` is **reserved** for future non-request work (cron/workers). That work must then `set local role authenticated` and set the claims or tenant GUC. It isn't built now.

**Server files**

| File | Purpose |
|---|---|
| `server/utils/auth.ts` | `getAuthContext(event)`, `requireAuth(event)` (401), `requireTenant(event)` (401 / 403 `no_farm`). These are the only callers of `serverSupabaseUser` for identity. Results are cached on `event.context`. |
| `server/utils/handlers.ts` | `defineAuthedHandler(fn)` (signed in, farm optional; for `/api/me`) and `defineTenantHandler(fn)` (signed in **and** has a farm; used by every later data route). Both set `Cache-Control: private, no-store` and map thrown errors to `ApiErrorData`. **Every file in `server/api/` must use one of the two** (guard test). |
| `server/utils/db.ts` | The repository foundation: `createTenantDb(event, tenantId): TenantDb`. |
| `server/repositories/memberships.ts` | `findMembershipWithFarm(client, userId)`: the only query that runs *before* the tenant is known. It's scoped by `user_id` and RLS, and embeds `tenants(id, name, eggs_per_tray)` in one round trip. |
| `server/repositories/tenants.ts` | `getCurrentFarm(db)`: `.eq('id', db.tenantId)`. |
| `server/api/me.get.ts` | `GET /api/me` |
| `server/plugins/no-store.ts` | A Nitro `render:response` hook that sets `Cache-Control: private, no-store` on every SSR HTML response, so Back/bfcache doesn't show farm content after sign-out (AC14). |

**Shared contract: `shared/types/api.ts`.** These are the exact shapes; FE builds against them.
```ts
export type ApiErrorCode = 'unauthenticated' | 'no_farm' | 'validation_failed' | 'not_found' | 'internal'
export interface ApiErrorData { code: ApiErrorCode; fields?: Record<string, string> }
// Server throws createError({ statusCode, statusMessage, data: ApiErrorData }).
// Client reads it from FetchError.data.data (Nitro nests `data` inside the error body).

export interface FarmSummary { id: string; name: string; eggsPerTray: number }
export interface MeResponse { email: string; farm: FarmSummary | null }
```

**Server-only types** (`server/utils/auth.ts`, `server/utils/db.ts`):
```ts
export interface AuthContext { userId: string; email: string }        // JWT claims: sub, email
export interface TenantContext extends AuthContext { tenantId: string; farm: FarmSummary }

type Tables = Database['public']['Tables']
export type TenantTable = Exclude<keyof Tables, 'tenants' | 'memberships'>   // never today; grows per feature
export interface TenantDb {
  readonly tenantId: string
  readonly client: SupabaseClient<Database>   // the user-JWT client; used only inside server/repositories/
  /** select/update/delete come pre-filtered with .eq('tenant_id', tenantId); insert rows get tenant_id injected. */
  scoped<T extends TenantTable>(table: T): {
    select(columns?: string): unknown          // BE: the PostgrestFilterBuilder type, with .eq('tenant_id') applied
    insert(rows: Omit<Tables[T]['Insert'], 'tenant_id'> | Omit<Tables[T]['Insert'], 'tenant_id'>[]): unknown
    update(patch: Omit<Tables[T]['Update'], 'tenant_id'>): unknown   // .eq('tenant_id') applied
    delete(): unknown                          // .eq('tenant_id') applied
  }
}
```
BE fills in the concrete supabase-js builder return types (the `unknown` placeholders). The invariant to hold: callers can't pass or override `tenant_id`.

**`GET /api/me`**
- Request: no params and no body. A query string, if any, is ignored (AC23).
- Handler: `defineAuthedHandler` → `findMembershipWithFarm(client, ctx.userId)` → `MeResponse`.
- `200 MeResponse`. `farm` is `null` when the user has no membership (AC12); that isn't an error.
- `401 { code: 'unauthenticated' }` when there's no session, or it's invalid or revoked.
- `500 { code: 'internal' }` when the DB or Auth is unreachable. The FE shows "Couldn't load your farm."
- Headers: `Cache-Control: private, no-store`.
- For later routes, `defineTenantHandler` returns `403 { code: 'no_farm' }` when the user has no membership.

**Guard test** (`tests/unit/server-guards.spec.ts`, which reads source files with `fs`): (a) every `server/api/**/*.ts` uses `defineAuthedHandler` or `defineTenantHandler`; (b) `#supabase/server` is imported only by `server/utils/auth.ts` and `server/utils/db.ts`; (c) `serverSupabaseServiceRole` appears nowhere under `server/` (v1 needs no service role at runtime); (d) no `server/api` file reads `tenant_id`/`tenantId` from `getQuery`, `readBody`, `readValidatedBody` or `getRouterParam`.

### 3.5 Auth flows

Every auth call except `/api/me` goes browser → Supabase Auth through `useSupabaseClient()` (publishable key). `@supabase/ssr` keeps the session in cookies, so SSR sees it.

| Flow | Design |
|---|---|
| **Sign in** | `signInWithPassword({ email, password })`. On success: set the hint cookie, `useMe().ensure({ force: true })`, then `navigateTo(safeReturnTo(route.query.redirect) ?? '/', { replace: true })`. The middleware sends no-farm users on to `/no-farm`. Errors pass through `mapAuthError` → `'invalid_credentials' \| 'network' \| 'rate_limited' \| 'unknown'` (code `invalid_credentials`/400 → invalid; `AuthRetryableFetchError`, status 0 or a fetch `TypeError` → network; 429 or `over_*_rate_limit` → rate_limited). Accounts are provisioned with confirmed emails, so there's no "email not confirmed" case, and the message is the same whether or not the email exists (AC3). AC5 is covered by button `loading` plus an in-flight guard in the composable. |
| **Sign out** | `signOut({ scope: 'local' })` in a try/catch (D15). Whatever the outcome, even offline: clear the hint cookie, `useMe().clear()`, then `reloadNuxtApp({ path: '/login' })`. The full reload drops in-memory state, so Back leads to a fresh SSR → middleware → sign-in (AC14). `no-store` HTML covers bfcache, and a `pageshow` listener reloads if `event.persisted` and there's no session. |
| **Forgot password** | `/forgot-password` → `resetPasswordForEmail(email)`. It always shows "Check your email" on success; Supabase doesn't reveal whether the account exists. 429 → "Please wait a minute before trying again." Network → the connection banner. The email typed on sign-in is carried over through `useState('auth:lastEmail')`, not the URL. |
| **Reset email** | Local: `supabase/templates/recovery.html`, wired in `config.toml`. Its link is `{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&type=recovery`. This is the token-hash flow, not PKCE `?code=`, so it works when the link is opened on a different device from the one that requested it (D9). Open it in **Mailpit at http://127.0.0.1:54324**; no real mail is sent. Hosted: the same template goes into the dashboard (deploy step). |
| **Reset callback** `/auth/reset` | SSR renders only "Checking your link…". `verifyOtp({ type: 'recovery', token_hash })` runs **in `onMounted`**, client-side, so link scanners that don't run JS can't burn the single-use token. Then `router.replace({ query: {} })` removes the token from the URL and history. States: `checking` → `valid` (the new-password form) \| `expired` (`otp_expired`, any invalid/used-token error, or missing/wrong params → "This reset link has expired" + **Send a new link**) \| `network` (banner + retry). Supabase reports both expired and used links as `otp_expired`, and the UX deliberately shows one state for both. Save: `updateUser({ password })` → set the hint cookie → `useMe().ensure({ force: true })` → `/` + toast "Password updated". A link is valid for `otp_expiry = 3600` s and works once. |
| **Session expired** | The **hint cookie** `tamago_had_session=1` (not sensitive, 400 days, `SameSite=Lax`, `path=/`, set client-side after a successful sign-in or reset, cleared only on explicit sign-out). When the middleware finds no session: hint present → `/login?redirect=<path>&reason=expired`; hint absent → `/login?redirect=<path>`. So a first-time visitor never sees "expired". Mid-session: a client plugin handles `onAuthStateChange('SIGNED_OUT')` that the user didn't start, and the `$api` wrapper handles a 401 from our API. Both call `handleSessionExpired()`, which uses the current `route.fullPath` (AC11). |
| **Return-to** | `shared/utils/return-to.ts`: `safeReturnTo(raw: unknown): string \| null`. It accepts only a string that starts with a single `/` (not `//` or `/\`), has no control characters or backslashes, still has origin `http://x` after `new URL(raw, 'http://x')`, and isn't an auth route (`/login`, `/forgot-password`, `/auth/*`, `/no-farm`). Anything else returns `null`, and the caller uses `/`. Unit-tested with open-redirect cases. |
| **No farm linked** | `/api/me` → `farm: null` → the middleware sends every farm route to `/no-farm`, which shows the email and Sign out. `/no-farm` sends you to `/` when a farm exists. |
| **Sign-up blocked (AC2)** | `config.toml` sets `[auth] enable_signup = false` (**not** `[auth.email] enable_signup = false`, which disables email+password sign-in entirely; see §4 [DEVOPS]), so even a direct `auth.signUp()` call with the publishable key fails, while `auth.admin.createUser` still works for provisioning. There are no sign-up routes, so `/signup` and `/register` fall through to the 404. Hosted: switch off "Allow new users to sign up" (deploy checklist). |
| **Rate limits** | Supabase defaults: sign-in/sign-up 30 requests per 5 min per IP; token refresh 150 per 5 min per IP; token verifications 30 per 5 min per IP; recovery/OTP one per 60 s per user; the **built-in email sender is limited to 2 emails/hour** and isn't for production (Open question 2). The UI maps 429 to the rate-limited copy. |

**`supabase/config.toml` (local):** `[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/auth/reset"]`, `enable_signup = false`, `minimum_password_length = 8`, `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10`. `[auth.email] enable_signup = true` (must stay true: the CLI maps it to the email provider switch; §4 [DEVOPS]), `otp_expiry = 3600`. `[auth.email.template.recovery] subject = "Reset your Tamago password"`, `content_path = "./supabase/templates/recovery.html"`. BE should confirm the `minimum_password_length` key against the installed CLI.

**Long-lived sessions (AC11):** the access JWT lasts 1 h and refreshes automatically; refresh tokens rotate and never expire. The cookie `maxAge` is 400 days (the browser maximum), and it rolls because `@supabase/ssr` rewrites it on every refresh. The owner stays signed in until they sign out, the session is revoked, or 400 days pass without opening the app. Time-boxed and inactivity timeouts are Pro-plan features and stay off. **To trigger expiry locally (for QA):** sign in, run `delete from auth.sessions;` in local Studio (http://127.0.0.1:54323), then navigate: you land on sign-in with the expired banner, and signing in returns you to the same screen. This is immediate for our API: the server resolves identity with `getUser()` (§4 [BE]), so `/api/me` returns 401 on the next request, locally and hosted. *(Corrected by BE: the local stack signs ES256 JWTs, not HS256, so `getClaims` never falls back to `getUser`.)*

**Password rules:** `shared/constants/auth.ts` exports `PASSWORD_MIN_LENGTH = 8`. `shared/schemas/auth.ts` (zod 4, used directly as `UForm :schema` via Standard Schema) has `signInSchema`, `forgotPasswordSchema` and `newPasswordSchema` (with a confirm refine), using the §2.5 copy as messages. The same constant is used by the provisioning CLI and matches `minimum_password_length` in `config.toml`.

### 3.6 Provisioning (AC30, AC31)

`server/cli/provision.ts` runs with `bun --env-file=.env` (Bun executes the TS directly; no `tsx`) on the operator's machine, never from the browser and never as an HTTP route. It reads `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_SUPABASE_SECRET_KEY` and builds its own `createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })`. It lives under `server/`, where the service-role guard allows the key, but Nitro never bundles it. It uses relative imports only, because Nuxt aliases don't resolve outside Nuxt.
```
bun run provision -- --farm "Hendricks Farm" --email owner@example.com [--password <pw>] [--eggs-per-tray 30] [--update] [--yes]
bun run provision -- reset-password --email owner@example.com [--password <pw>] [--yes]
```
- **Validation before any network call:** farm name is 1–100 characters after trimming; the email must be in email format (zod); the password must be at least `PASSWORD_MIN_LENGTH`; `--eggs-per-tray` must match `/^\d+$/` and be ≥ 1, so `0`, `-3` and `2.5` are rejected with a clear message (AC22). A missing `--password` prompts with hidden input, which keeps the password out of shell history.
- **Provision flow:** `auth.admin.createUser({ email, password, email_confirm: true })`. On `email_exists`, continue **without touching the password**. Then `rpc('admin_user_id_by_email')` → `rpc('provision_farm', …)` → print the outcome:
  - `created`: `Created farm "Hendricks Farm" (eggs per tray: 30) for owner@example.com.`
  - `unchanged`: `owner@example.com already has farm "Hendricks Farm" (eggs per tray: 30). No changes made. Use --update to change the farm name or eggs per tray, or reset-password to change the password.`
  - `updated`: `Updated farm "…" (eggs per tray: N) for owner@example.com.`
- **Documented behaviour (AC30):** re-running for the same email **reports and changes nothing** unless `--update` is passed. It never creates a second farm or account. A half-finished run (user created, farm not) is completed by the next run.
- **Admin password reset (AC31):** `reset-password` → `admin_user_id_by_email` → `auth.admin.updateUserById(id, { password })` → `rpc('admin_revoke_sessions', { p_user_id: id })`, unless `--keep-sessions` is passed. So a reset also signs out every device, which is the lost-phone remedy. *(BE: `--keep-sessions` dropped; Supabase Auth revokes every session on an admin password change, so it can't be honoured. See §4 [BE].)*
- **Target safety:** it prints the target URL first. If the host isn't `127.0.0.1` or `localhost`, it asks for `y/N` confirmation (skip with `--yes`). For production, run it with `--env-file=.env.production.local`. That file is gitignored and stays on the operator's machine.
- Tests: argument parsing and validation are unit-tested (`tests/unit/provision-args.spec.ts`, which means the parsing lives in a pure exported function). The end-to-end run is verified manually against the local stack.

### 3.7 Isolation test (AC24, AC25, AC26, AC29)

All tests are pgTAP files in `supabase/tests/database/`, run in filename order by **`bun run test:db`**, which is the single command for AC29. Every file after `000` is wrapped in `begin; … rollback;`.

| File | Contents |
|---|---|
| `000_helpers.sql` | **Commits** the `tests` schema to the local DB only (`db reset` wipes it; everything is `create or replace`, so it's idempotent). It contains: `tests.create_user(identifier text) → uuid` (inserts into `auth.users`); `tests.create_farm(name text, owner_identifier text) → uuid` (tenant + membership, as postgres); `tests.authenticate_as(identifier)` (`set_config('role','authenticated',true)`, plus `request.jwt.claims` = `{sub, role:'authenticated', email}` and `request.jwt.claim.sub`); `tests.authenticate_anon()`; `tests.clear_authentication()`; **the registry** `tests.tenant_table_registry()`; and **the checker** `tests.isolation_checks()`. It grants usage on `tests` to anon/authenticated (local test DB only). |
| `010_rls_coverage.test.sql` | Meta-guards. For every table in `public`: RLS is enabled; the table is in the registry; it has an `updated_at` column and a `set_updated_at` trigger; it has a `tenant_id` column (except `tenants`). Every view in `public` has `security_invoker=true`, ready for the inventory view. `anon` and `authenticated` have **no** EXECUTE on `provision_farm`, `admin_user_id_by_email` or `admin_revoke_sessions`. |
| `020_tenant_isolation.test.sql` | Creates farm A (owner a@test) and farm B (owner b@test) and runs `select ok(passed, description) from tests.isolation_checks('a','b')` plus `('b','a')`. Named AC24 cases: A's `update tenants set eggs_per_tray = 1 where id = <B>` touches 0 rows or raises 42501, and B's value is unchanged (re-read as postgres); A can't `delete from tenants where id = <B>`; A can't `insert into memberships (tenant_id, user_id) values (<B>, auth.uid())`; A can't read, update or delete B's membership; A can't insert a tenant; A can't update its **own** tenant either (v1). Anon reads 0 rows from both tables. |
| `030_foundation_constraints.test.sql` | `eggs_per_tray` defaults to 30; 0 and -1 are rejected (23514); a blank or 101-character name is rejected; the `updated_at` trigger bumps; `unique(user_id)` holds; `provision_farm` is idempotent (created → unchanged → updated with `p_update`, and it never creates a second tenant). |
| `090_isolation_detects_breach.test.sql` | **AC25, automated.** Inside the rolled-back transaction, as postgres, it applies each **mutation** in turn (savepoint → mutate → check → rollback to savepoint) and asserts `exists (select 1 from tests.isolation_checks('a','b') where not passed)`: (m1) `tenants_select_own` replaced with `using (true)`; (m2) `memberships_select_own` replaced with `using (true)`; (m3) `alter table tenants disable row level security`; (m4) `grant insert on memberships to authenticated` + a permissive insert policy; (m5) `app.current_tenant_id()` replaced with one that returns B's id. If the suite misses any weakening, this file fails. |

**Registry and checker (the AC26 extension point).** `tests.tenant_table_registry()` returns `(table_name regclass, tenant_column text, seed_sql text, attack_insert_sql text)`. The SQL strings are `format()` templates where `%1$L` is the tenant id. Today it contains:
```sql
('public.tenants',     'id',        null /* seeded by create_farm */, 'insert into public.tenants (id, name) values (%1$L, ''x'')'),
('public.memberships', 'tenant_id', null /* seeded by create_farm */, 'insert into public.memberships (tenant_id, user_id) values (%1$L, auth.uid())')
```
`tests.isolation_checks(attacker text, victim text)` returns `setof (table_name text, check_name text, passed boolean, description text)`. It's a plain checker, not pgTAP, so `020` and `090` can share it. For each registered table it runs `seed_sql` for both farms as postgres, then as the attacker:
1. **Positive control:** it sees ≥ 1 of its own rows, so a "deny everything" policy can't pass.
2. It sees 0 rows `where <col> = <victim>`, even when naming the other farm explicitly.
3. It sees 0 rows `where <col> <> <own>`.
4. `update <t> set updated_at = updated_at where <col> = <victim>` affects 0 rows or raises 42501.
5. `delete from <t> where <col> = <victim>` affects 0 rows or raises 42501, and the victim's row still exists (re-checked as postgres).
6. `attack_insert_sql` with the victim's id raises 42501.
7. As **anon**, `count(*)` is 0 or raises 42501.

Each check runs in its own `begin … exception` block, so one failure doesn't hide the rest. The checker switches roles with `set_config('role', …, true)` and resets to postgres at the end.

**A later feature adds its table** by adding **one registry row** with a `seed_sql` (e.g. `insert into public.clients (tenant_id, name) values (%1$L, 'Seed')`) to `000_helpers.sql`. It doesn't write a new test. `010` fails if it forgets.

**Showing QA the breach detection (AC25):** (1) `090` runs on every `bun run test:db`. (2) Manually: in local Studio run `drop policy tenants_select_own on public.tenants; create policy tenants_select_own on public.tenants for select to authenticated using (true);`, then `bun run test:db` fails in `020`, and `bun run db:reset` restores the policy.

### 3.8 Frontend structure

**Routes and page meta.** The global middleware reads `definePageMeta({ auth })`, and the **default is `'farm'`, so new pages are protected unless they opt out (deny by default).**

| Path | File | `auth` | Layout |
|---|---|---|---|
| `/` (Dashboard) | `app/pages/index.vue` | farm | default |
| `/production`, `/sales`, `/inventory`, `/clients` | `app/pages/<name>.vue` | farm | default |
| `/login` | `app/pages/login.vue` | guest | auth |
| `/forgot-password` | `app/pages/forgot-password.vue` | guest | auth |
| `/auth/reset` | `app/pages/auth/reset.vue` | public | auth |
| `/no-farm` | `app/pages/no-farm.vue` | user | auth |
| any unknown path | `app/pages/[...slug].vue` (sets status 404 on SSR) | public | the shell when `me.farm` exists, otherwise a standalone card |
| unexpected thrown errors | `app/error.vue` | n/a | standalone card, "Something went wrong" + **Go to Dashboard** *[proposed copy]* |

**`app/middleware/auth.global.ts`** runs on SSR too, so redirects are 302s and nothing flashes (AC9):
1. `user = useSupabaseUser()` (claims). `level = to.meta.auth ?? 'farm'`.
2. No user and `level` is `farm` or `user` → `navigateTo({ path: '/login', query: { redirect: to.fullPath, reason: hint ? 'expired' : undefined } })`.
3. User present → `await useMe().ensure()`, which fetches `/api/me` once with `useRequestFetch()` on SSR, forwarding cookies, and caches the result in `useState`. A 401 → sign out locally and treat it as step 2 with `reason=expired`.
4. `guest` + user → `safeReturnTo(to.query.redirect) ?? '/'` (AC8), or `/no-farm` when `farm` is null.
5. `farm` + `me.farm === null` → `/no-farm`. `user` (i.e. `/no-farm`) + a farm exists → `/`.
6. `ensure()` failed with a network or 500 error → let the page render. The default layout shows **Couldn't load your farm.** with Try again (`ensure({ force: true })`) and Sign out.

**Composables, plugins and utils**
- `app/composables/useMe.ts` → `{ me: Readonly<Ref<MeResponse | null>>, status: Readonly<Ref<'idle' | 'loading' | 'ready' | 'error'>>, ensure(opts?: { force?: boolean }): Promise<void>, clear(): void }`.
- `app/composables/useAuthActions.ts` → `signIn(email, password): Promise<{ ok: true } | { ok: false; kind: SignInErrorKind }>`, `signOut(): Promise<void>`, `requestPasswordReset(email): Promise<{ ok: true } | { ok: false; kind: 'network' | 'rate_limited' | 'unknown' }>`, `verifyRecovery(tokenHash: string): Promise<'valid' | 'expired' | 'network'>`, `updatePassword(password): Promise<{ ok: true } | { ok: false; kind: 'network' | 'weak_password' | 'unknown' }>`, `handleSessionExpired(): Promise<void>`. Here `SignInErrorKind = 'invalid_credentials' | 'network' | 'rate_limited' | 'unknown'`.
- `app/utils/auth-errors.ts` → `mapAuthError(e: unknown): SignInErrorKind`, with a unit spec.
- `app/utils/nav.ts` → `APP_NAV`, the single ordered list of the 5 destinations `{ key, label, to, icon, title, subtitle }`, used by the sidebar, the tabs and the navbar title (AC15). The Dashboard subtitle `Today, {Mon D}` is rendered **client-side only** (`<ClientOnly>` or after mount), so the server's UTC date never causes a hydration mismatch or shows the wrong day.
- `app/plugins/api.ts` → `$api = $fetch.create({ onResponseError })`, where a 401 calls `handleSessionExpired()`. `useApi()` exposes it, and later features call our API only through it.
- `app/plugins/auth-session.client.ts` → the `onAuthStateChange` SIGNED_OUT listener (ignored when the user started the sign-out) and the `pageshow` bfcache guard.

**Layouts and components (Nuxt UI v4)**
- `app/app.vue`: `<UApp :toaster="{ position: 'bottom-center', duration: 2600 }"><NuxtLayout><NuxtPage /></NuxtLayout></UApp>`.
- `app/layouts/auth.vue` + `AuthCard.vue` (logo, heading, subheading, default slot). The page is `bg-muted p-6`. The card is `max-w-[380px] rounded-2xl ring ring-default shadow-md p-8 bg-default`, centred, and top-aligned (about 48px) below `md`.
- `app/layouts/default.vue` → `AppShell`:
  - `UDashboardGroup` with persistence off (collapse state is for the session only and resets at breakpoints).
  - `UDashboardSidebar`: `collapsible`, `v-model:collapsed`, `:toggle="false"`, and `:ui="{ root: 'hidden md:flex' }"` so it shows from 768px (its default is `lg`). Header: logo, "Tamago", "Egg farm tracker". Body: `UNavigationMenu orientation="vertical"` from `APP_NAV`, with `UTooltip` labels when collapsed. `#footer`: `AppAccountMenu`.
  - `UDashboardPanel`, with `#header` `UDashboardNavbar` (`:toggle="false"`, title and subtitle from `APP_NAV`, `UDashboardSidebarCollapse` in `#leading` at `md+`, the `AppAccountMenu` avatar in `#right` below `md` only) and `#body` (`bg-muted`, content `max-w-[1120px]`, bottom padding `calc(64px + env(safe-area-inset-bottom))` below `md`).
  - `AppBottomTabs.vue`: `md:hidden`, fixed to the bottom, 5 equal `NuxtLink` columns with `aria-current="page"`, the tint pill and a `focus-visible` ring (AC17).
  - Collapse state: `useBreakpoints(breakpointsTailwind)`. The rail is collapsed by default at `md`–`lg`, expanded at `lg+`, and resets whenever the width crosses a breakpoint (AC18). Nav *visibility* is pure CSS, so SSR renders both navs and hydration is stable.
  - If the `ui.root` override fights the component, FE may fall back to a custom `<aside>` with the same tokens and record it in §4.
- `AppAccountMenu.vue`: `UDropdownMenu` (240px content). A header slot (not an item) shows the farm name and the email (truncated). Items: **Dark mode / Light mode** (`useColorMode().preference = 'dark' | 'light'`, keeping the menu open) and **Sign out** (`color: 'error'`, `i-lucide-log-out`). The trigger is a `UAvatar` with the farm's initials in a 44×44 hit area, or, in the expanded sidebar, the full row with avatar, farm name and email (AC13, AC21).
- `AppPlaceholder.vue` (props `icon`, `title`, `body`, optional `eyebrow` and action slot) for the 5 pages and the 404. `UEmpty` can be used if its styling can match the §2.5 card.
- Auth pages use **`UForm` + `UFormField` + `UInput` + `UButton` + `UAlert`**, not `UAuthForm`: we need the exact fields and copy, info-vs-error banners, a show/hide button and no provider or sign-up slots. `PasswordInput.vue` = `UInput` + a trailing `UButton` (`i-lucide-eye` / `eye-off`, with the §2.5 aria-labels). Inputs and buttons use `size="xl"` or a `ui` height override to reach at least 44px (FE confirms the exact size).
- `AppLogo.vue`: a **placeholder** inline-SVG egg mark (an egg-shaped path filled with `var(--ui-primary)`, `role="img" aria-label="Tamago"`, with a `size` prop for 28 or 48), plus `public/favicon.svg` with the same mark. It's replaced with exports (favicon, 32/64/192/512) once the owner supplies a transparent PNG or SVG.

**Theme: `app/assets/css/main.css`**
```css
@import "tailwindcss";
@import "@nuxt/ui";

@theme static {
  --font-sans: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --color-green-50: #EFFDF5;  --color-green-100: #D9FBE8; --color-green-200: #B3F5D1; --color-green-300: #75EDAE;
  --color-green-400: #00DC82; --color-green-500: #00C16A; --color-green-600: #00A155; --color-green-700: #007F45;
  --color-green-800: #016538; --color-green-900: #0A5331; --color-green-950: #052E16;
}
:root {
  --ui-radius: 0.25rem;
  --ui-primary: var(--ui-color-primary-700);   /* #007F45, light mode only (owner decision 6) */
  --ui-error: var(--ui-color-error-600);       /* Tailwind v4 red-600 = #E7000B */
}
.dark {
  --ui-primary: var(--ui-color-primary-400);   /* as designed */
  --ui-error: var(--ui-color-error-400);
}
```
`app/app.config.ts`: `ui.colors = { primary: 'green', secondary: 'blue', success: 'green', info: 'blue', warning: 'yellow', error: 'red', neutral: 'slate' }`. Raw Tailwind is for layout only. `success` keeps the default shade (500), which is fine for icons; FE checks the toast's contrast.

**Shared helpers involved:** `safeReturnTo`, `PASSWORD_MIN_LENGTH`, the auth zod schemas, `APP_NAV`, `mapAuthError`. The quantity conversion helper and size lists are **not** part of this feature. `MeResponse.farm.eggsPerTray` is exposed through `useMe()` so the first quantity feature reads it from there and never hardcodes 30.

### 3.9 Env

`.env.example` (committed; `.env` and `.env.*` are already gitignored, except the example):
```dotenv
# --- Public: exposed to the browser (runtimeConfig.public.supabase) ---
NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NUXT_PUBLIC_SUPABASE_KEY=<publishable key from `bunx supabase status` (or the legacy anon key)>

# --- Private: server-only (runtimeConfig.supabase.secretKey) ---
# Used ONLY by `bun run provision` (server/cli). The app does not use it at runtime in v1,
# so do NOT set it in Vercel. Never prefix it with NUXT_PUBLIC_.
NUXT_SUPABASE_SECRET_KEY=<secret key from `bunx supabase status` (or the legacy service_role key)>
```
Nothing else is required. pgTAP runs inside the local DB, and unit tests need no env. The deprecated `SUPABASE_SERVICE_KEY` isn't used.

### 3.10 Invariants at risk

| Rule (CLAUDE.md) | How the design protects it |
|---|---|
| `tenant_id` + `updated_at` on every table | Both tables have `updated_at` and a trigger. `tenants` is the root, keyed on `id` (D4). `memberships.tenant_id` has an index that leads with it. `010_rls_coverage` fails if any `public` table lacks RLS, `updated_at`, the trigger, `tenant_id` or a registry entry. |
| Derive the tenant on the server; never trust the client | `/api/me` takes no input. The tenant comes from `memberships` via `auth.uid()` (JWT `sub`), both in `requireTenant` and in `app.current_tenant_id()`. Guard test (d). pgTAP "names the other farm explicitly" checks. |
| Tenant scoping centralized | `TenantDb.scoped()` in `server/utils/db.ts` injects `tenant_id`, and only repositories use it. Guard test (b). |
| RLS stays on for server routes (non-superuser, per-transaction tenant context) | The server acts as `authenticated` with the user's JWT, which PostgREST sets per transaction. There's no service role in the request path (guard test (c)), and the secret isn't deployed to Vercel. D3. |
| Service-role key only under `server/` | Used only by `server/cli/provision.ts` and the private runtimeConfig. **Gap found:** the guard hook's regex doesn't match the current key names (`NUXT_SUPABASE_SECRET_KEY`, `secretKey`, `sb_secret_`); task T5. |
| Serverless: pooler or supabase-js, short handlers | supabase-js over HTTP with no pool. `/api/me` is one auth check plus one query. Provisioning is a local CLI, not a request handler. |
| Eggs are the unit; eggs-per-tray is per tenant, never hardcoded | `tenants.eggs_per_tray` (check ≥ 1). The default 30 lives **only** in the column default, because provisioning omits the column rather than writing 30. The FE reads it from `MeResponse.farm.eggsPerTray`. |
| No public sign-up (product scope) | `[auth] enable_signup = false` (returns 422 `signup_disabled`) and no routes (AC2). |

### 3.11 Tasks

Order: scaffold/tooling → DB → server → FE. **Parallel:** once T1 is done, FE can do **T15–T16** alongside BE T6–T14. Once **T11 (contract types)** lands, FE can do **T17–T23**, stubbing `/api/me` locally if T13 isn't finished.

- [x] **T1 [DEVOPS]** Scaffold Nuxt 4 in the repo root: `package.json` (§3.1 versions, scripts, engines, `"packageManager": "bun@1.3.14"`) + committed `bun.lock`, `.nvmrc`, `nuxt.config.ts` (§3.1), `app/app.vue` with `UApp`, `app/assets/css/main.css` (imports only), and the Nuxt 4 `tsconfig.json`. Make sure `bun run dev` boots and `bun run typecheck` passes.
- [x] **T2 [DEVOPS]** `eslint.config.mjs` (`withNuxt`, stylistic, ignore generated types). `bun run lint` passes.
- [x] **T3 [DEVOPS]** `vitest.config.ts` + `tests/unit/smoke.spec.ts`. `bun run test:unit` passes.
- [x] **T4 [DEVOPS]** `bunx supabase init`; `config.toml` per §3.5; `supabase/templates/recovery.html`; `.env.example` (§3.9); README "Local setup": Docker Desktop, `bun install --frozen-lockfile`, `bun run db:start`, copy keys from `bunx supabase status` into `.env`, `bun run db:reset`, `bun run provision -- …`, `bun run dev`, and the Mailpit and Studio URLs.
- [x] **T5 [DEVOPS]** *(done by the team lead, 2026-09-25)* *(needs the user's approval: it's `.claude/` config)* Extend `.claude/hooks/guard-service-role.mjs` to match `SUPABASE_SECRET_KEY|secretKey|sb_secret_|serverSupabaseServiceRole`.
- [x] **T6 [BE]** Migration M1 `foundation_helpers` (§3.2).
- [x] **T7 [BE]** Migration M2 `tenants_memberships`: tables, constraints, index, triggers, grants/revokes, RLS (§3.3), `app.current_tenant_id()`.
- [x] **T8 [BE]** Migration M3 `provisioning_functions` (service-role-only EXECUTE).
- [x] **T9 [BE]** `bun run db:types` → commit `shared/types/database.types.ts`; wire `supabase.types`.
- [x] **T10 [BE]** pgTAP `000`, `010`, `020`, `030`, `090` (§3.7). `bun run test:db` passes, and the manual weakening makes it fail.
- [x] **T11 [BE] (contract; unblocks FE)** `shared/types/api.ts`, `shared/constants/auth.ts`, `shared/schemas/auth.ts`, `shared/utils/return-to.ts` + `tests/unit/return-to.spec.ts`.
- [x] **T12 [BE]** `server/utils/auth.ts`, `server/utils/handlers.ts`, `server/utils/db.ts` (TenantDb), `server/repositories/{memberships,tenants}.ts`.
- [x] **T13 [BE]** `server/api/me.get.ts`, `server/plugins/no-store.ts`, `tests/unit/server-guards.spec.ts`.
- [x] **T14 [BE]** `server/cli/provision.ts` (provision + reset-password) + `tests/unit/provision-args.spec.ts`; README "Provisioning": idempotency wording, admin reset (AC31), production use with `--env-file`.
- [x] **T15 [FE]** Theme (`main.css` tokens, `app.config.ts`, fonts), `AppLogo.vue` placeholder, `public/favicon.svg`. *(can start after T1)*
- [x] **T16 [FE]** `layouts/auth.vue` + `AuthCard.vue`; `layouts/default.vue` shell (sidebar/rail/bottom tabs/navbar) + `app/utils/nav.ts`; resize behaviour (AC15–AC18). *(can start after T1)*
- [x] **T17 [FE]** `useMe`, `useAuthActions`, `mapAuthError` + spec, `plugins/api.ts`, `plugins/auth-session.client.ts`, `middleware/auth.global.ts`, hint cookie. *(after T11)*
- [x] **T18 [FE]** `/login` with every state in §2.5 (AC1–AC8, AC10, AC11 banner).
- [x] **T19 [FE]** `/forgot-password` + `/auth/reset` (checking/valid/expired/network; save → Dashboard + toast) (AC8a). Verify end-to-end through Mailpit.
- [x] **T20 [FE]** `/no-farm` + the shell's "Couldn't load your farm" state (AC12).
- [x] **T21 [FE]** `AppAccountMenu` in the sidebar footer, rail and mobile top bar: farm name, email, dark-mode toggle, sign out (AC13, AC14, AC19a, AC21).
- [x] **T22 [FE]** The 5 placeholder pages + `AppPlaceholder.vue`; the client-only Dashboard date (AC19).
- [x] **T23 [FE]** `[...slug].vue` 404 (in the shell when signed in, standalone when signed out, HTTP 404) + `error.vue` (AC20).
- [ ] **T24 [DEVOPS]** Update `CLAUDE.md`'s "Project status" and commands (dev, typecheck, lint, test, test:unit, test:db = isolation, provision, db:*) (AC33). Run the README from a clean clone (AC27). `typecheck`, `lint` and `test` all exit 0 (AC28, AC29).

### 3.12 Decisions

- **D1 Nuxt 4.5 with the `app/` directory.** It's the current stable line; Nuxt 5 isn't released. `app/`, `server/` and `shared/` give separate app, server and shared TS contexts, and the contract types live in `shared/`.
- **D2 `@nuxtjs/supabase` v2 (with `redirect: false`) rather than hand-rolled `@supabase/ssr`.** The module *is* `@supabase/ssr` underneath, and it already handles SSR cookie get/set (including token refresh during SSR), the browser client, `getClaims`-based user state, the private `secretKey` runtimeConfig split and generated types. Hand-rolling would add about 150 lines of cookie plumbing with the same security properties. What we give up: its redirect middleware can't express "expired" reasons, membership gating or guest routes, so we turn it off (D11). We override its 8-hour cookie default (D10). Rejected: hand-rolled.
- **D3 Server data access = supabase-js with the user's JWT**, not a direct pooler connection with `SET LOCAL app.current_tenant`. Both satisfy the spec's defense-in-depth rule, and spec §2/§3 permit either. The JWT path is stronger: the DB sees *the user*, not a server-asserted tenant, and the app holds no privileged DB credential. It also suits Vercel: no pool, no custom login role or password, no prepared-statement pitfalls in transaction mode. Cost: multi-statement transactions must be Postgres functions called through `rpc`. The spec text is updated.
- **D4 `tenants` is the root table, and its `id` is the tenant id.** A duplicate generated `tenant_id` column was rejected as two names for one value.
- **D5 Tenant resolution with `app.current_tenant_id()`**: security definer, in a schema PostgREST doesn't expose, and it reads `memberships` by `auth.uid()`. Rejected: a custom access-token hook that puts `tenant_id` in the JWT, which brings stale claims after membership changes and another Auth hook to run, and isn't needed at one farm per user. Multi-farm later changes only this helper, adding a selector.
- **D6 Owners get neither write grants nor write policies on tenants and memberships**: two independent locks. pgTAP accepts either "0 rows" or 42501.
- **D7 Provisioning = the Admin API + service-role-only SQL functions + a local CLI.** Rejected: SQL seeds that insert into `auth.users` (fragile against GoTrue internals and password hashing), and an HTTP admin route, which would put the service-role key in the deployed app.
- **D8 No service role at app runtime in v1**, and the secret isn't set on Vercel. This shrinks the blast radius. Revisit only when a server route truly needs privilege.
- **D9 Reset uses `token_hash` + `verifyOtp` run client-side on mount.** Rejected: the PKCE `?code=` exchange (it needs the same browser that made the request, which breaks the phone-requests/laptop-opens case) and verifying in a server GET (email link scanners would use up the one-time link).
- **D10 Sessions:** the cookie `maxAge` is 400 days and rolling; refresh tokens rotate and don't expire; the JWT lasts 1 h. A non-sensitive hint cookie tells "expired" apart from "never signed in". Rejected: always showing "expired" on redirect (it misleads first-time visitors) and a localStorage flag (SSR can't read it, so the banner would flash).
- **D11 Our own global route middleware with page-meta levels** (`farm` by default, `user`, `guest`, `public`). Deny by default means a new page is protected unless it opts out.
- **D12 The 404 is a catch-all page**, so the middleware runs and it can render inside the shell with `me`. `error.vue` handles thrown errors.
- **D13 TypeScript `~6.0`, not 7.0**, because vue-tsc and Vue tooling still need the TS 6 programmatic API.
- **D14 The isolation proof lives in pgTAP**, with a registry, a pure checker function and mutation tests. It's fast, has no HTTP dependency, and extends with one registry row. A Vitest HTTP-level isolation suite was rejected for now as duplicate coverage; add it if a later feature brings routes with non-trivial authorization.
- **D15 Sign-out uses `scope: 'local'`**, so signing out one device doesn't sign out the others. The admin `reset-password` revokes every session.
- **D16 No `role` column on memberships.** Roles are a v1 non-goal, and adding one later is a small migration.

### 3.13 Open questions / needs a call

1. **Owner:** "Rarely signed in again" means a session effectively lasts until sign-out. If the phone is lost, the remedy is `bun run provision -- reset-password …`, which also signs out every device. Is that acceptable? The alternative is a Supabase Pro plan with an inactivity timeout, for example 30 days.
2. **Owner/devops (before deploy, not blocking this feature):** in production, Supabase's built-in email sends at most 2 emails an hour and isn't meant for real use. Forgot-password needs a custom SMTP provider (Resend, Postmark or similar), which is a small cost decision.
3. **User (config change):** approve T5, which extends the service-role guard hook to the `SECRET_KEY` names the module now uses. Without it, the hook doesn't catch this project's actual key names.
4. **User:** `CLAUDE.md` says "connect as a non-superuser role and set tenant context per transaction (e.g. `SET LOCAL app.current_tenant`)". D3 still meets that, since the `authenticated` role and the JWT claims are set per transaction. Should T24 also reword the line to name the supabase-js-as-user approach? I haven't edited `CLAUDE.md`.
5. **UX (minor):** the `error.vue` copy for unexpected errors isn't in §2.5. I proposed "Something went wrong" + **Go to Dashboard**.
6. **PM note (no conflict):** AC22's "a fraction is rejected" is enforced in the provisioning validation. A Postgres `integer` column would silently round `2.5` on a raw SQL insert, but the CLI is the only write path in v1. pgTAP covers 0 and negative values at the DB level.

## 4. Implementation notes (Devs)
- [DEVOPS] **T1–T4 done (2026-09-25).**
  - **Bun is the package manager (owner decision).** `"packageManager": "bun@1.3.14"`, and `bun.lock` is committed. There is no `package-lock.json`, and `.gitignore` now ignores `package-lock.json`, `yarn.lock` and `pnpm-lock.yaml` (plus Nuxt's `.data/`). Scripts differ from §3.1 in two places: `test` = `bun run test:unit && bun run test:db`, and `provision` = `bun --env-file=.env server/cli/provision.ts`. `tsx` is dropped because Bun runs TS directly, so the provisioning CLI must stay Bun-compatible and use relative imports. The Supabase CLI resolves from the local devDependency (`supabase` 2.117.0), and docs use `bunx supabase …`. `bun run provision -- --farm "X" …` forwards arguments correctly: Bun strips the `--` and keeps quoted values (tested). Use `bun run test:unit`, not `bun test`, which is Bun's own runner. Node stays the runtime (`.nvmrc` 24; local Node 24.18.0).
  - Bun blocks one postinstall (`unrs-resolver`, from the ESLint import plugin). It's a fallback that downloads a native binding only when the optional platform package is missing. `@unrs/resolver-binding-win32-x64-msvc` installed normally, so it's harmless, and I didn't add `trustedDependencies`.
  - **Installed versions:** nuxt 4.5.2 (Nitro 2.13.4, Vite 8.3.1, Vue 3.5.43), @nuxt/ui 4.11.2, @nuxtjs/supabase 2.0.10, @supabase/supabase-js 2.117.1, tailwindcss 4.3.3, zod 4.6.5, @vueuse/core 14.4.0, @iconify-json/lucide 1.2.136; dev: typescript 6.0.3, vue-tsc 3.3.11, eslint 10.11.0, @nuxt/eslint 1.17.0, vitest 5.0.1, supabase 2.117.0, @types/node 24.13.6.
  - **TypeScript 7: not compatible yet, so we stay on `~6.0.3` (D13 confirmed).** vue-tsc 3.3.11 (latest) declares `typescript >=5.0.0`, but that range is misleading. Its `index.js` does `require.resolve('typescript/lib/tsc')`, and it only special-cases `typescript` aliased to `@typescript/typescript6`, the TS 6 JS-API compatibility package. `typescript@7.0.2`'s `exports` has no `./lib/tsc`, only `./unstable/*` API entries. That's the exact failure in vuejs/language-tools discussion #6121, which was closed as a duplicate of #5381 (tsgo support), and #5381 has no fix. Re-check when vue-tsc ships native tsgo support.
  - **Deviation / bug fix in §3.5: `[auth.email] enable_signup` must be `true`.** The CLI maps that key to `GOTRUE_EXTERNAL_EMAIL_ENABLED`. With `false`, password sign-in fails with 422 `email_provider_disabled` ("Email logins are disabled"), which would break AC1. Verified on the local stack with an Admin-API-created user. Sign-up is still blocked by `[auth] enable_signup = false` (`GOTRUE_DISABLE_SIGNUP=true`), and `POST /auth/v1/signup` returns 422 `signup_disabled`. §3.5 and §3.10 are corrected. **Hosted deploy checklist:** turn "Allow new users to sign up" off, but keep the Email provider **on**.
  - **Deviation: `[analytics] enabled = false`.** On Docker Desktop for Windows, the `vector` container can't list containers through the Docker socket and restart-loops. Analytics only feeds Studio's Logs Explorer. Turning it off stops the loop and makes `db:start` faster (it'll help CI too).
  - The `config.toml` auth settings are live, confirmed from the auth container env and endpoints: `site_url` http://localhost:3000, redirect `…/auth/reset`, `minimum_password_length = 8`, `jwt_expiry = 3600`, refresh rotation on (reuse interval 10), `otp_expiry = 3600`, and the recovery template + subject "Reset your Tamago password". A `POST /auth/v1/recover` delivered that email to Mailpit, with the link `http://localhost:3000/auth/reset?token_hash=<hash>&type=recovery` (D9). The probe user and email were deleted afterwards. In this CLI version the Mailpit config section is `[local_smtp]`, not `[inbucket]`.
  - Files: `package.json`, `bun.lock`, `.nvmrc`, `nuxt.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `app/app.vue`, `app/assets/css/main.css`, `app/pages/index.vue` (scaffold placeholder so dev has a route), `tests/unit/smoke.spec.ts`, `supabase/config.toml`, `supabase/.gitignore`, `supabase/templates/recovery.html`, `.env.example`, `README.md` ("Local setup", "Local service URLs", "Commands", and a "Provisioning" stub for BE T14), `.gitignore` (merged).
  - **Verified (Windows, Git Bash, Bun 1.3.14):** `bun install --frozen-lockfile` OK; `bun run typecheck`, `bun run lint` and `bun run test:unit` (1 file, 1 test) all exit 0; `bun run dev` serves `GET /` → 200 (`<title>Tamago</title>`), then stopped; `bun run db:start`, `db:stop` and `db:reset` all exit 0.
  - **Known until BE T10:** `bun run test:db` exits 1 with "no pgTAP tests found in supabase/tests", so `bun run test` fails until the first pgTAP file lands. `db:reset` warns that `supabase/seed.sql` is missing; that's harmless, and there's no seed by design (provisioning is the CLI). Without `.env`, `@nuxtjs/supabase` warns about missing URL/key, but typecheck and lint still pass. Until T9, it warns that `database.types.ts` is missing.
  - The local stack is **left running** for BE (API :54321, DB :54322, Studio :54323, Mailpit :54324). A local, gitignored `.env` was written from `bunx supabase status`. Nothing was linked or pushed.
  - Still DevOps-owned: T24 (CLAUDE.md commands, clean-clone run), CI workflow, Vercel config (`no-store` route rules), and the SMTP provider before deploy.
- [BE] **T6–T14 done (2026-09-25).**
  - **Migrations** (`supabase/migrations/`): `20260924171649_foundation_helpers.sql` (the `app` schema, with usage revoked from public and granted to authenticated; `app.set_updated_at()` with `search_path=''`), `20260924171652_tenants_memberships.sql` (as §3.2/§3.3; named check constraints `tenants_name_length`, `tenants_eggs_per_tray_positive`), `20260924171655_provisioning_functions.sql` (as §3.2; `provision_farm` also rejects an unknown user id with 23503, trims the farm name, and on `--update` without eggs-per-tray keeps the current value). `admin_user_id_by_email` trims its input.
  - **Types (T9):** `shared/types/database.types.ts` was generated with `bun run db:types`. `supabase.types` in `nuxt.config.ts` already pointed there (DevOps), and the module resolves `~~`.
  - **pgTAP (T10)** in `supabase/tests/database/`: `000_helpers.sql` (commits the `tests` schema and `create extension pgtap` to the local DB; `db:reset` wipes both), `010_rls_coverage` (15), `020_tenant_isolation` (48), `030_foundation_constraints` (28), `090_isolation_detects_breach` (10): 102 assertions in total. **Additions beyond §3.7:**
    - `tests.try_as(who, sql)` runs a statement as a user or anon and returns `ok:<rows>` or the SQLSTATE. It always switches back to postgres.
    - The checker has an **8th check, `update_into_victim`** (`update … set <col> = victim where <col> = own`). Without it, an update policy with a weak `WITH CHECK` went undetected. A mutation run proved this: a permissive `USING (true)` update policy on `tenants` is *not* a breach on its own, because UPDATE only sees rows the SELECT policy allows. So I replaced the planned m6 with "update policy on memberships with `WITH CHECK (true)`".
    - 010 also checks: every `tenant_id` has an FK to `tenants` and an index that leads with it; anon has no table privileges; no `security definer` function in `public` is executable by anon or authenticated; `app.current_tenant_id()` is executable by authenticated only.
    - 090 has 7 mutations (m1–m5 as designed, the new m6, and m7 = anon select grant + policy on tenants). It then re-runs the checker and lists the policies, to prove every mutation was undone. `tests.mutation_detected()` applies each mutation inside a plpgsql subtransaction and rolls it back by raising a private SQLSTATE, and the file itself also rolls back. Verified after a run: the policies, RLS flags and `app.current_tenant_id()` body are unchanged.
    - `tests.isolation_check_count()` keeps the `plan()` in 020 in sync as registry rows are added (AC26).
  - **AC25 manual demo (done):** `drop policy tenants_select_own …; create policy … using (true);` in the local DB → `bun run test:db` fails (020: 5 failures, including "A sees exactly one farm"; 090: baseline and after-mutations fail) → `bun run db:reset` restores it → PASS.
  - **Contract (T11):** `shared/types/api.ts` (exact §3.4 shapes), `shared/constants/auth.ts` (`PASSWORD_MIN_LENGTH = 8`), `shared/schemas/auth.ts`, `shared/utils/return-to.ts`. **Additions:**
    - The schemas also export `AUTH_MESSAGES`, `emailSchema`, `newPasswordValueSchema` and the `SignInInput` / `ForgotPasswordInput` / `NewPasswordInput` types.
    - The new-password confirm field is **`confirmPassword`**.
    - The email is trimmed. Empty gets "Enter your email"; bad format gets "Enter a valid email, like you@yourfarm.com".
    - `return-to.ts` also exports `isAuthRoutePath()`. `safeReturnTo` returns the *normalised* path (`/a/../sales` → `/sales`). It rejects auth routes case-insensitively, with a trailing slash, and percent-encoded (`/%6Cogin`), and caps the length at 2048.
    - Specs: `tests/unit/return-to.spec.ts`, `tests/unit/auth-schemas.spec.ts`.
  - **Server (T12/T13):**
    - `server/utils/auth.ts`, `handlers.ts` and `db.ts`, plus **`server/utils/errors.ts`** (new: `apiError(status, code, fields?)`, `toApiError()`). Unexpected errors are logged and returned as a generic 500 `internal` with no internal message.
    - `server/repositories/memberships.ts` (`findMembershipWithFarm`, one query that embeds `tenants(id, name, eggs_per_tray)`) and `server/repositories/tenants.ts` (`getCurrentFarm`, `toFarmSummary`).
    - `server/api/me.get.ts`, `server/plugins/no-store.ts`.
    - `TenantDb.scoped()` returns the real supabase-js builder types (`QueryBuilder<T>`, derived through a single-signature `fromTable` wrapper). It strips any smuggled `tenant_id` from insert rows and update patches, then injects its own. `createTenantDbFromClient()` is exported for tests.
    - `defineTenantHandler` passes `ctx = { userId, email, tenantId, farm, db }`.
    - Auth and membership lookups are cached per request on `event.context` (as promises).
  - **Deviation (security): server identity uses `auth.getUser()`, not `getClaims()` / `serverSupabaseUser`.** The local stack (CLI 2.117) signs **ES256** JWTs (checked: JWKS `EC/ES256`), so `getClaims()` only verifies the signature locally. I tested this: after `reset-password` revoked the owner's sessions, `/api/me` still returned **200** with the old cookie. With `getUser()`, the next request returns **401** immediately. The cost is one Auth round trip per API request. §3.5 (the QA expiry procedure) is corrected. Note for FE: `useSupabaseUser()` on the client/SSR still reads claims, so a revoked session looks signed in to the middleware until `/api/me` returns 401 (handle it as `reason=expired`, as designed).
  - **Guard test** `tests/unit/server-guards.spec.ts` covers (a)–(d) as designed, plus:
    - (b2) routes don't call `serverSupabase*`, `.from(` or `.rpc(` (repositories do);
    - (c2) only `server/cli/` mentions the secret key;
    - (e) `app/` doesn't import `server/`.
    - (d) is strict: an `server/api` file may not mention `tenant_id` at all, or `tenantId` except as `ctx.tenantId`.

    I verified it fails on a planted `defineEventHandler` + `getQuery(event).tenant_id` route (then deleted it). `tests/unit/tenant-db.spec.ts` checks the scoping with a fake client (`vi.mock('#supabase/server')`).
  - **Provisioning (T14):** `server/cli/provision.ts` (I/O) + `server/cli/provision-args.ts` (pure parsing and validation, `USAGE`, `outcomeMessage`) + `tests/unit/provision-args.spec.ts`. README "Provisioning" is written. **Deviations:**
    1. The CLI looks up the user **before** `createUser`, so an existing account is never prompted for a password it would ignore. A `--password` given for an existing account prints a note. The `email_exists` race is still handled.
    2. **`--keep-sessions` removed.** Tested locally: `auth.admin.updateUserById(id, { password })` itself deletes all the user's sessions (2 → 0 even with the flag), so the flag couldn't be honoured. `reset-password` always signs out every device (the owner-approved lost-phone remedy). `admin_revoke_sessions` is still called as a backstop.
    3. Eggs-per-tray is also capped at int4 max, so a huge number gets the friendly message rather than a DB error.
  - **End-to-end check (local, via the FE's dev server on :3000, GETs only):**
    - Provisioned `be-test@example.com` / "BE Test Farm": `created`, then the re-run reported `unchanged`, `--update` gave `updated` (24), `--eggs-per-tray 2.5` exited 2, and restoring 30 gave `updated`. There was 1 user and 1 tenant throughout.
    - Password sign-in (`/auth/v1/token`) → 200. `/api/me` with the session cookie → 200 `{"email":"be-test@example.com","farm":{"id":"…","name":"BE Test Farm","eggsPerTray":30}}` with `Cache-Control: private, no-store`. The same request with `?tenant_id=0000…&tenantId=x` gave an identical response (AC23).
    - No cookie → 401 `{data:{code:'unauthenticated'}}`. A garbage cookie → 401.
    - Wrong password and unknown email both → 400 `invalid_credentials` (AC3). `POST /auth/v1/signup` → 422 `signup_disabled` (AC2).
    - After `reset-password`: the old session got 401 on its next `/api/me`, the old password → 400, and the new password → 200.
    - A user with no farm → 200 `{"email":"…","farm":null}` (AC12).
    - **All test users and farms were deleted afterwards.** The local DB has 0 users, tenants and memberships. The `tests` schema and the pgtap extension stay committed locally (by design, from `000`).
  - Not tested live: the 500 `internal` path (Auth or DB unreachable). The logic is `isAuthRetryableFetchError` or status 0/≥500 → 500, and any repository error → `toApiError` → 500.
- [FE] **T15–T16 done (2026-09-25).** Nuxt UI 4.11.2 component APIs checked against ui.nuxt.com (v4) and the installed source/theme (`node_modules/@nuxt/ui/dist/runtime/components`, `.nuxt/ui/*.ts`).
  - **Files:** `app/assets/css/main.css` (tokens), `app/app.config.ts` (theme), `app/components/AppLogo.vue`, `public/favicon.svg`, `app/utils/nav.ts`, `app/components/AuthCard.vue`, `app/layouts/auth.vue`, `app/layouts/default.vue`, `app/components/AppBottomTabs.vue`, `app/components/AppAccountSummary.vue`, `app/pages/index.vue` (reduced to an empty stub; the scaffold's `<main><h1>` clashed with the shell's `<h1>`).
  - **Theme (T15):** as §3.8, plus `--ui-header-height: 3.5rem` (the design's 56px top bar and sidebar header; Nuxt UI defaults to 4rem). `app.config.ts` also sets `ui.icons.panelOpen/panelClose` to `i-lucide-chevron-right/left` (the design's toggle), `card.slots.root = 'rounded-2xl'` (the design's 16px cards), and two `navigationMenu` compound variants: the active pill is `before:bg-primary/12` (the design's 12% tint, instead of Nuxt UI's neutral `bg-elevated`), and inactive items hover to `bg-elevated`. Fonts were already configured in `nuxt.config` by T1, so they're unchanged. Verified: light primary renders #007F45, and dark stays green-400 with dark text on buttons.
  - **Logo:** `AppLogo.vue` is a **placeholder** inline-SVG egg (`currentColor` = `text-primary`, so it follows light and dark), with `size` (default 28) and `wordmark` props, and `role="img" aria-label="Tamago"` when it's shown without the wordmark. `public/favicon.svg` has the same mark with hardcoded #007F45 / #00DC82 via `prefers-color-scheme` (a favicon can't read CSS variables). Swap both when the owner sends a transparent logo.
  - **Shell (T16):** `UDashboardGroup unit="px" :persistent="false"` › `UDashboardSidebar` (`collapsible`, `v-model:collapsed`, 224/64px, `:toggle="false"`, `ui.root` adds `md:flex`, so the `ui.root` override works and no custom `<aside>` was needed) with `UNavigationMenu orientation="vertical" tooltip :collapsed` › `UDashboardPanel` with `UDashboardNavbar :toggle="false"`, where the `#left` slot holds `UDashboardSidebarCollapse` (`md:flex`, 44px below `lg`), `<h1>` title and subtitle, and `#right` holds the mobile avatar. `AppBottomTabs.vue` is custom (a `NuxtLink custom` slot → `<a>` with explicit `aria-current`), because `ULink` only sets `aria-current` on exact matches.
  - **Active matching:** `isNavItemActive()` in `nav.ts`. `/` matches only itself; other items also match sub-paths (`/sales/123`), ready for detail routes. The sidebar, tabs and title all use it.
  - **Collapse (AC18):** `useBreakpoints(breakpointsTailwind)`. The breakpoint default (tablet collapsed, desktop expanded) is applied in `onMounted` and on every breakpoint crossing, never during hydration. **Known tradeoff:** SSR renders expanded, so a first load at 768–1023px shows the full sidebar for one frame before it collapses. Nav visibility is CSS-only, so there's no mismatch.
  - **Dashboard subtitle:** `Today, {Mon D}` is set client-side in `onMounted` and on route change (`formatTodaySubtitle`, en-US, device time zone). SSR renders no subtitle for the Dashboard.
  - **Deviation, avatar size:** v4 `UAvatar` `sm` is 28px, so the design's 32px avatar is `size="md"`. Initials are computed in `AppAccountSummary` and uppercased (`UAvatar`'s `alt` fallback keeps the original case, so "Your farm" became "Yf").
  - **Stubs left for T17+ (all resolved by T17–T23 below):** the `TODO(T17/T21)` account stub, the non-interactive `AppAccountSummary`, the "Tamago" title fallback, and the missing destination pages.
  - **Verified:** `bun run typecheck` exit 0 and `bun run lint` exit 0. `bun run dev` was checked in headless Chrome with temporary stub pages, which were removed afterwards: at 375px (via an iframe, since headless Chrome has a ~500px minimum window) the 5 tabs are all visible at 64px each, with no horizontal scroll, the avatar top right and the auth card top-aligned, in both light and dark. At 900px the rail is 64px with the Sales tint. At 1280px the sidebar is 224px. Live resizing over CDP 1280→900→1280→375→900→1280 gave the sidebar widths 224/64/224/0 (tabs shown)/64/224 with the route and title kept. A manual expand at 900 reset to collapsed after crossing to 1280 and back. Tapping the Inventory tab at 375 navigated and moved `aria-current`. There were no hydration warnings in the browser console.
- [FE] **T17–T23 done (2026-09-25).** Built against the real `/api/me` (T13 was live before any stub was needed, so **no `/api/me` stub was ever written**) and the T11 contract (`#shared/types/api`, `#shared/schemas/auth`, `#shared/constants/auth`, `safeReturnTo`). Nothing in `shared/`, `server/` or `supabase/` was changed. Nuxt UI components used: UForm, UFormField, UInput, UButton, UAlert, UDropdownMenu, UAvatar, UCard, UIcon, UApp (plus the T16 dashboard set). All were checked against ui.nuxt.com v4 and the installed 4.11.2 source.
  - **Files (T17):** `app/composables/useMe.ts`, `useAuthActions.ts`, `useSessionHint.ts`, `useApi.ts`, `useSubmitValidation.ts`; `app/utils/auth-errors.ts` (+ `tests/unit/auth-errors.spec.ts`), `app/utils/login-location.ts`; `app/plugins/api.ts`, `app/plugins/auth-session.client.ts`; `app/middleware/auth.global.ts`; `app/types/page-meta.d.ts` (`auth` level + optional `title`). **(T18–T19):** `app/pages/login.vue`, `forgot-password.vue`, `auth/reset.vue`, `app/components/PasswordInput.vue`, `AuthBanner.vue`. **(T20):** `app/pages/no-farm.vue`; the farm-load-failed card in `app/layouts/default.vue`. **(T21):** `app/components/AppAccountMenu.vue`; `default.vue` now reads `useMe()` (the stub is gone). **(T22):** `app/components/AppPlaceholder.vue`; `app/pages/{index,production,sales,inventory,clients}.vue`. **(T23):** `app/pages/[...slug].vue`, `app/error.vue`. **Theme:** `app.config.ts` adds `py-2.5` to button and input size `xl` (40px → 44px, C5).
  - **Deviations:**
    - `useMe().ensure()` returns `Promise<'ready' | 'unauthenticated' | 'error'>`, not `Promise<void>`, so the middleware can tell a 401 (end the session, go to `reason=expired`) from a 500 (render the "Couldn't load your farm" card).
    - `mapAuthError` is joined by `mapResetRequestError`, `mapUpdatePasswordError` and `mapVerifyRecoveryError`, plus `AUTH_ERROR_COPY`, in the same file: one place for the §2.5 copy.
    - Sign-out: supabase-js keeps the local session when `signOut({ scope: 'local' })` can't reach the server, so on an error `useAuthActions` deletes the `sb-*` auth cookies itself. AC14 then holds offline too.
    - `reloadNuxtApp` is called with `force: true`. Without it, Nuxt skips a reload to the same path within 10 s (loop guard), which silently broke a second sign-out soon after a first one (found in testing).
    - After sign-in, verify and reset, `useSupabaseUser` and `useSupabaseSession` are set synchronously from `getClaims()`/`getSession()`, because the module updates them asynchronously and the next navigation's middleware would otherwise see "signed out".
    - Auth forms use `:loading-auto="false"` plus their own `disabled` state. With `loadingAuto` on, UForm keeps inputs disabled until `onSubmit` returns, so "focus the password after wrong credentials" failed.
    - Validation: `useSubmitValidation()` gives UForm `validate-on=[]` until the first failed submit, then `['input', 'change', 'blur']` with `eager-validation`, so each field's message clears as soon as that field is valid. The first invalid field is focused.
    - The 404 is `[...slug].vue` with `layout: false` and `<NuxtLayout :name="me?.farm ? 'default' : 'auth'">`. `PageMeta.title = 'Page not found'` drives the shell title, and `setResponseStatus(404)` runs on SSR. `error.vue` (it wraps its own `UApp`) handles thrown errors: "Something went wrong" (the §3.13 proposed copy), or the 404 copy for a thrown 404. Its "Go to Dashboard" calls `clearError({ redirect: '/' })`.
    - The farm-load-failed card replaces the whole shell (no nav or farm data) rather than sitting inside it, reusing `AuthCard`. "Try again" calls `ensure({ force: true })`.
    - The account menu: `UDropdownMenu` with a `type: 'label'` header slot (farm name + email). The dark-mode item calls `event.preventDefault()`, so the menu stays open, and sets `useColorMode().preference`; the choice lives in localStorage and survives sign-out. Sign out uses `color: 'error'`. The panel opens upward from the expanded sidebar, to the right from the rail, and downward-right from the mobile top bar. Items are 44px below `md`.
  - **Finding for the architect/QA (AC11 detection timing):** §3.5 says that locally, `delete from auth.sessions` then navigating lands on sign-in immediately "because HS256 JWTs make `getClaims` fall back to `getUser`". **The local stack signs with ES256** (`/auth/v1/.well-known/jwks.json`; the JWT header is `alg: ES256`), so `getClaims()` verifies locally and a client-side hop between two placeholder screens does **not** notice a revoked session. What does work, and was tested: (a) any `$api` call that gets a 401 → `/login?redirect=…&reason=expired`; (b) the access token expiring (≤ 1 h), when the auto-refresh fails, supabase-js removes the session and emits SIGNED_OUT → the same redirect; (c) any full load or reload (the server uses `getUser()`). Once later features load data through `$api` on each screen, (a) covers "next navigation". I did **not** add a per-navigation `/api/me` round trip; that's a call for the architect. The QA procedure in §3.5 should say "then reload, or call an API" rather than "navigate".
  - **Verified end to end** (bun run dev + headless Chrome over CDP, local stack, a throwaway owner made with `bun run provision`, and a second account whose farm was deleted to test AC12):
    - **AC1:** correct credentials → one submit → the destination.
    - **AC2:** no sign-up text on `/login`; `/signup` and `/register` → HTTP 404.
    - **AC3:** a wrong password and an unknown email both show "Incorrect email or password. Try again.", the email is kept, the password is cleared and focused, with no stray field error.
    - **AC4:** an empty submit gives "Enter your email" / "Enter your password" and a bad format gives "Enter a valid email, like you@yourfarm.com", with 0 `/auth/v1/token` requests and the first invalid field focused. Messages clear live once the field is valid.
    - **AC5:** a triple click → the button is disabled and 1 token request is sent.
    - **AC6:** offline (CDP) → "Couldn't connect. Check your connection and try again.", both fields kept, and retrying online succeeds without a reload.
    - **AC7 (375px):** `type=email`, `inputmode=email`, the password masked, the input and button 44px, no horizontal scroll.
    - **AC8:** `/login` while signed in → `/`; `/login?redirect=/clients` → `/clients`.
    - **AC8a (through Mailpit):** the typed email carries over; the same confirmation shows for a known and an unknown email; the subject is "Reset your Tamago password" and the link is `/auth/reset?token_hash=…&type=recovery`. A no-JS fetch of the link (a scanner) got only "Checking your link…" and did **not** use the token up. The token is removed from the URL. "Use at least 8 characters" / "Passwords don't match" appear, and the mismatch clears to only that message. Save → `/` + the "Password updated" toast. The same link again, or no token → "This reset link has expired".
    - **AC9:** signed-out SSR `GET /` → 302 `/login` and `/sales` → 302 `/login?redirect=/sales`, with no farm name in the HTML.
    - **AC10:** sign-in from `/login?redirect=/sales` lands on `/sales`.
    - **AC11:** paths (a), (b) and (c) above all show the "Your session has expired. Please sign in again." banner (neutral, not red) and return to the same screen after sign-in.
    - **AC12:** the no-farm user → `/no-farm` with the copy, "Signed in as …" and Sign out; `/sales` → `/no-farm`; Sign out → `/login`.
    - **AC13 / AC21:** the menu shows "FE Test Farm", the email, Dark/Light mode and Sign out; the avatar shows "FT"; the sidebar row shows the farm and email; the mobile trigger is 44×44.
    - **AC14:** Sign out → `/login` with no banner; Back → `/login?redirect=/clients` with no farm name; reopening `/clients` → sign-in.
    - **AC15–AC18:** the 5 destinations in order, each highlighted; resize 1280/900/375/900/1280 → sidebar 224/64/tabs/64/224 with the screen kept.
    - **AC19:** each screen shows its title and §2.5 placeholder copy, with no digits in the content.
    - **AC19a:** the toggle flips `html.dark` ↔ `light`, the menu stays open and the label flips, and the choice survives a reload (localStorage `nuxt-color-mode`). With no choice it follows the system (headless default dark).
    - **AC20:** signed in → "Page not found" inside the shell with no nav item active, and "Go to Dashboard" → `/`. Signed out → the standalone card, no shell. `error.vue` renders and recovers.
    - **T20:** `/api/me` forced to 500 (CDP Fetch) → the "Couldn't load your farm." card → "Try again" → the shell.
    - **Console:** no warnings or errors during the sign-in flows.
  - **Commands:** `bun run typecheck` exit 0 · `bun run lint` exit 0 · `bun run test:unit` exit 0 (7 files, 100 tests, including `auth-errors.spec.ts`).
  - **Left behind: nothing.** The two test accounts (`fe-test@`, `fe-nofarm@example.com`) and the "FE Test Farm" tenant were deleted (the DB has 0 users and 0 tenants again), their Mailpit messages were deleted, and the dev server and headless Chrome were stopped.

## 5. QA report (QA)
**Verdict:**
