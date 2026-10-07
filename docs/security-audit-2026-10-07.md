# Security audit, 2026-10-07

Scope: the whole system at `8726c81` (features 00 to 07). Method: static read of server, shared, app and all 23 migrations; the live local Supabase stack; pgTAP (1609) and Vitest (1053) suites; a production build run locally; `bun audit`; git-history secret scans. Attacks were tried in SQL as `authenticated` and `anon`, over HTTP against PostgREST and GoTrue, and against the built Nitro server.

## Verdict

No Critical or High findings. No way was found for one farm to read or write another farm's data, and no auth bypass. The weak points are deploy-time and defence-in-depth.

## Request trace (where the tenant comes from)

1. The browser sends the `sb-*-auth-token` cookie. An `Authorization: Bearer` header is ignored.
2. `defineTenantHandler` runs the CSRF guard, then `requireTenant`.
3. `resolveAuth` calls `auth.getUser()` (a GoTrue round trip), so expired or revoked sessions are rejected.
4. The membership is read under the user's own JWT (RLS limits it to `user_id = auth.uid()`), which yields `tenantId`. Body, query and URL never supply one.
5. Repositories go through `scoped()` (adds the `tenant_id` filter and strips smuggled values) or `rpc()` (overwrites `p_tenant_id`).
6. PostgREST verifies the JWT again and runs `security invoker` functions, whose first statement is `app.assert_tenant(p_tenant_id)`.
7. Every query filters by `p_tenant_id`, and RLS applies as a second lock.

## Findings

### Medium

- **M1. The "secret key never at runtime" rule is only a convention.** `runtimeConfig: {}` lets `@nuxtjs/supabase` fill the private `secretKey` from `NUXT_SUPABASE_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`. A local build with `.env` present baked the real key into `.output/server/chunks/_/nitro.mjs`. The public bundle was clean. Fix: pin the module's keys empty, add a build check that fails on `sb_secret_` or `service_role`, and write a deploy runbook (no `SUPABASE_*` secrets in Vercel, no Supabase-Vercel integration).
- **M2. No `script-src` CSP.** The CSP is only `frame-ancestors 'none'`. The auth cookie is readable by JavaScript and lasts 400 days, and the full session sits in the SSR payload (`useState('supabase_session')`). No XSS sink exists today (no `v-html`, `innerHTML`, `eval`, `localStorage`, `window.open`, `postMessage`). Fix: a nonce-based CSP with `connect-src` limited to the Supabase URL, and a shorter cookie `maxAge`. Needs an owner decision. Not part of the fixes made on 2026-10-07.
- **M3. `bun audit`: 10 advisories (3 critical, 6 high, 1 low).** All via dev and build tooling (`@nuxt/devtools`, `@nuxt/cli`, nitropack build, vite, `@nuxt/eslint`), not the deployed function. Fix: `bun update`, `overrides` for stuck transitive pins, `bun audit` in CI, keep devtools dev-only.

### Low

- **L1.** A GoTrue 429 is treated as a revoked session (`server/utils/auth.ts:29-34`), so the client signs the user out. Treat 429 as transient.
- **L2.** Hosted Supabase config is not governed by `supabase/config.toml`. Checklist: disable signups, production Site URL and redirects, real SMTP, password minimum 12+ and leaked-password protection, expose only the `public` schema, consider TOTP MFA. Also set `[auth.email] enable_signup = false` (line 226).
- **L3.** `/auth/v1/otp` answers 422 `signup_disabled` for an unknown email, which can reveal whether an email exists. Not exercised against a real user. A WAF rule would cover it.
- **L4.** Error logging is not uniformly SQLSTATE-only: `production.ts:55,63`, `sizes.ts:36`, `errors.ts:60`, `auth.ts:48,54`, and raw PostgrestErrors thrown from `memberships.ts:31` and `tenants.ts:54`. No personal data is exposed today, because those tables hold none.
- **L5.** Default privileges on `public` still grant `anon`, `authenticated` and `service_role` everything on new tables. Every migration revokes explicitly and `010_rls_coverage` fails if `anon` has a table privilege, but a forgotten revoke would not fail closed.
- **L6.** The owner can write integrity columns directly: `sale_counters.next_number` and `order_counters.next_number` (a jump leaves gaps in sale numbers), `order_lines.line_total` and sale line totals on a hand-built insert. Self-affecting within one farm. Revisit before staff accounts or legal invoice numbering.
- **L7.** No application-level rate limiting. HSTS lacks `includeSubDomains`/`preload`, no `Cross-Origin-Resource-Policy`, `x-powered-by: Nuxt` is sent, and the PostgREST OpenAPI document is readable with the publishable key. Use Vercel Firewall rate limits.
- **L8.** `offset` has no maximum in `salesListQuerySchema` and `ordersQuerySchema`, so a huge value gives a 500. `onHandQuerySchema.sizeId` has no array cap.
- **L9.** The provisioning CLI's `--password` flag is visible in shell history and the process list. Prefer the hidden prompt.

## Checked and sound

**Tenant isolation**
- RLS is enabled on all 16 `public` tables, with 40 policies. Every INSERT and UPDATE policy has `WITH CHECK (tenant_id = (select app.current_tenant_id()))`.
- `tenants` and `memberships` are select-only. Sales, clients and orders have no DELETE grant or policy (the two line tables have a DELETE policy guarded by triggers).
- All 27 public RPCs taking `p_tenant_id` call `app.assert_tenant` (raises `TM006`).
- Attacks as farm A against farm B all failed or returned zero rows: selects, RPCs with B's tenant id (including B's client or size ids under A's tenant), direct INSERT/UPDATE/DELETE, and writes to `tenants` and `memberships`.
- Composite `(tenant_id, …)` foreign keys block cross-tenant references.
- Only four `security definer` functions exist. `app.current_tenant_id` has `search_path=''` and reads only `memberships` by `auth.uid()`. The other three are service-role-only. Every function has `search_path=""`.
- Anon has no table privilege and no function execute. The `app` schema is not exposed.
- The `app.order_delivery` flag cannot be set from a client (`set_config` is not exposed).
- Order state-machine triggers guard hand-built writes. `090_isolation_detects_breach` proves the isolation suite fails when a breach is injected.
- `current_tenant_id()` uses only the verified `sub`; nothing reads `user_metadata`, `app_metadata` or client-settable GUCs.

**AuthN/AuthZ**
- JWT verification is server-side.
- All 32 route files use `defineTenantHandler`, except `/api/me` (`defineAuthedHandler`). A guard test enforces this. There is no server middleware besides `no-store`.
- `/api/_supabase/*` and dev endpoints return 404.
- Sign-out uses `scope: 'local'` with a cookie-clear fallback.
- The `return-to` path validation blocks open redirects.
- The recovery flow runs `verifyOtp` client-side only and strips the token from the URL.
- Deleting a user cascades `memberships`, so access ends immediately.

**CSRF, headers, cache, CORS (against the built server)**
- A cross-site `Sec-Fetch-Site` or foreign `Origin` returns 403 before auth. A non-JSON POST body returns 400. OPTIONS returns 404 with no CORS headers.
- `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP and HSTS (production) are present.
- `Cache-Control: private, no-store` on pages, API and 404s. `/_nuxt` assets are immutable and public. No `swr`, `isr` or `cache` route rules.
- Error bodies are `{code}` only.

**Secrets**
- The service-role key is referenced only in `server/cli/provision.ts`. `.env` is gitignored and was never tracked. Git history shows no real keys. No `NUXT_PUBLIC_` secrets.

**Input handling**
- Every route validates with zod at the boundary, and the database re-enforces every bound as CHECK constraints and triggers. All writes are fixed `rpc` or table-builder calls. IDOR attempts returned 404.

**Client personal data**
- The clients, sales, orders and inventory repositories log SQLSTATE only. The client list is fetched after mount and is never in `/api/me` or the SSR payload. Client state is cleared on sign-out. The invoice page loads in `onMounted` only. The privacy unit tests pass.

**Connection model**
- PostgREST as the non-superuser `authenticated` role. No direct DB credentials, no long-lived pool, no session-level `SET`.

## Before deploy

- Before a second farm: M1 and the L2 hosted-config checklist.
- Before first deploy: also M2 and M3.

## Status of fixes

Tracked in the git log after this report. On 2026-10-07 the code-side items were taken on: M1, M3, L1, L4, L5, L8 and the local part of L2. M2 (CSP) was left open for an owner decision. L3, L6, L7 and L9 are accepted for now.
