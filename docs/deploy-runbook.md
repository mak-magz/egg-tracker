# Deploy runbook

## Vercel
- Set only these variables: `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_KEY` (the publishable key). See `.env.example`.
- Do NOT add any secret variable: no `SUPABASE_*` or `NUXT_SUPABASE_*` secret (`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SECRET_KEY`). The app does not use the service-role key at runtime; only `bun run provision` does, from a local `.env`.
- Do NOT install the Supabase-Vercel integration: it injects those variables automatically.
- `nuxt.config.ts` pins `runtimeConfig.supabase.secretKey/serviceKey` to empty so builds can't bake a key in, but a runtime `NUXT_SUPABASE_*` variable would still override it. Keep them unset.
- Before releasing, run `bun run build` then `bun run check:build` (CI does this too). Delete `.output` afterwards.
- Migrations are applied by an explicit manual step (`supabase db push`), never by the app.

## Hosted Supabase checklist (audit L2)
- [ ] Authentication > Sign In / Providers: disable "Allow new users to sign up". Create owners with `bun run provision`.
- [ ] Authentication > URL Configuration: Site URL is the production URL; Redirect URLs list only production (and any needed preview) URLs. No localhost.
- [ ] Authentication > SMTP: configure a real SMTP provider (the built-in one is rate limited and for testing only).
- [ ] Authentication > Password: minimum length 12 or more, and enable leaked-password protection (HaveIBeenPwned; needs a paid plan). Note the app's own minimum (`shared/constants/auth.ts`, 8) and the local `supabase/config.toml` (8) are lower, so raise them together when the policy is tightened.
- [ ] Settings > API (Data API): expose only the `public` schema.
- [ ] Consider TOTP MFA for owner accounts.
- [ ] Keep the secret key out of Vercel and CI; rotate it if it ever appeared in a build output or log.

## Known audit leftovers (`bun audit`)
Remaining after `bun update` and `overrides`, all transitive through Nuxt with no fix yet: `simple-git` (via `@nuxt/devtools`, dev-only; a 4.x override breaks DevTools), `node-forge` (via listhen, dev HTTPS server), `braces` (via nitropack's globby, build time). DevTools is enabled only in dev (`devtools: { enabled: true }` is a no-op in production builds). Re-check after Nuxt updates.
