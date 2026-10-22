# Deploy runbook

## Vercel
- Connect the repository directly in the Vercel dashboard. Vercel automatically detects Nuxt 4 and builds on push.
- Set only these variables in Vercel: `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_KEY` (the publishable key). See `.env.example`.
- Do NOT add any secret variable: no `SUPABASE_*` or `NUXT_SUPABASE_*` secret (`SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, `NUXT_SUPABASE_SECRET_KEY`). The app does not use the service-role key at runtime; only `bun run provision` does, from a local `.env`.
- Do NOT install the Supabase-Vercel integration: it injects those variables automatically.
- `nuxt.config.ts` pins `runtimeConfig.supabase.secretKey/serviceKey` to empty so builds can't bake a key in, but a runtime `NUXT_SUPABASE_*` variable would still override it. Keep them unset.
- GitHub Actions (`.github/workflows/ci.yml`):
  1. `checks` job runs lint, typecheck, unit tests, and production build secret checks on PRs & main.
  2. `migrate` job automatically pushes Supabase migrations (`supabase db push --include-all`) only on push to `main`.
- Required GitHub Repository Secrets (for database migrations in CI):
  - `SUPABASE_PROJECT_ID`: Reference ID of your hosted Supabase project.
  - `SUPABASE_ACCESS_TOKEN`: Personal Access Token generated from Supabase Dashboard Account Settings.
  - `SUPABASE_DB_PASSWORD`: Database password for your Supabase project.


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
