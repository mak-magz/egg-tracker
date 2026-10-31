# Deploy runbook

## Vercel
- Connect the repository directly in the Vercel dashboard. Vercel automatically detects Nuxt 4 and builds on push.
- Configure public Firebase environment variables in Vercel:
  - `NUXT_PUBLIC_FIREBASE_API_KEY`
  - `NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NUXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NUXT_PUBLIC_FIREBASE_APP_ID`
- Configure server-only credentials in Vercel:
  - `FIREBASE_SERVICE_ACCOUNT` (or `GOOGLE_APPLICATION_CREDENTIALS` path)
  - `NUXT_TURSO_CONTROL_URL`
  - `NUXT_TURSO_CONTROL_AUTH_TOKEN`
- Do NOT expose `FIREBASE_SERVICE_ACCOUNT` or Turso auth tokens to `NUXT_PUBLIC_*`.
- `check:build` runs on every build (`bun run check:build`) to verify no private key material is leaked into public client bundles.
- GitHub Actions (`.github/workflows/ci.yml`):
  1. `checks` job runs lint, typecheck, unit tests, and production build secret checks on PRs & main.
  2. `migrate` job pushes Drizzle schema migrations to the Control DB on push to `main`.
- Required GitHub Secrets (under the `production` Environment or Repository Secrets):
  - `NUXT_TURSO_CONTROL_URL`: URL of the production Turso Control DB.
  - `NUXT_TURSO_CONTROL_AUTH_TOKEN`: Auth token for the production Turso Control DB.

## Firebase & Turso checklist
- [ ] Firebase Auth > Sign-in method: Email/Password enabled. Disable anonymous sign-in or public user registration (farms & owners are provisioned via `bun run provision`).
- [ ] Firebase Auth > Authorized domains: Add your production and preview Vercel domains.
- [ ] Turso: Control database created (`libsql://...`) and auth token generated.
- [ ] Keep private keys and tokens out of client bundles; verify with `bun run check:build`.

## Known audit leftovers (`bun audit`)
Remaining after `bun update` and `overrides`, all transitive through Nuxt with no fix yet: `simple-git` (via `@nuxt/devtools`, dev-only), `node-forge` (via listhen), `braces` (via nitropack's globby). DevTools is enabled only in dev (`devtools: { enabled: true }` is a no-op in production builds).
