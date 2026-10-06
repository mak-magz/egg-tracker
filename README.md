# Tamago egg farm tracker

A multi-tenant web app for egg farms: production, computed inventory, sales/deliveries and clients.
Nuxt 4 (SSR) + TypeScript, Supabase (Postgres + Auth), Nuxt UI v4, hosted on Vercel.

Specs live in `docs/` (start with `CLAUDE.md` and `docs/egg-farm-app-architecture-spec.md`).

## Local setup

Everything runs locally. You need no cloud account and no production credentials.
The commands work the same in PowerShell and Git Bash.

### Prerequisites

- **Docker Desktop**, running. The local Supabase stack runs in containers.
- **Bun 1.3.14**, the package manager (`bun --version`). Don't use npm, npx or pnpm here.
- **Node 24** (`.nvmrc`; `engines` requires `>=24.11 <25`). Nuxt still runs on Node, and Bun only installs and runs scripts.

### Steps

1. **Install dependencies.** `bun.lock` is committed, so use a frozen install:
   ```sh
   bun install --frozen-lockfile
   ```
   This also runs `nuxt prepare`, which generates `.nuxt/`, needed by lint and typecheck. The Supabase CLI
   is a dev dependency, so you don't need a global install.

2. **Start the local Supabase stack** (Postgres, Auth, Studio, Mailpit). The first run pulls images and takes a few minutes:
   ```sh
   bun run db:start
   ```

3. **Create `.env`** from the example and fill in the keys printed by:
   ```sh
   cp .env.example .env
   bunx supabase status
   ```
   | `.env` variable | Value from `bunx supabase status` |
   |---|---|
   | `NUXT_PUBLIC_SUPABASE_URL` | Project URL / `API_URL` (`http://127.0.0.1:54321`) |
   | `NUXT_PUBLIC_SUPABASE_KEY` | Publishable key (`sb_publishable_…`) |
   | `NUXT_SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`). Used **only** by `bun run provision`, never by the running app. |

   `.env` is gitignored. Local keys are the same on every `db:start`, so you only do this once.

4. **Apply migrations** to a fresh local database. This wipes local data:
   ```sh
   bun run db:reset
   ```

5. **Provision a farm and its owner** (there is no public sign-up):
   ```sh
   bun run provision -- --farm "Hendricks Farm" --email owner@example.com
   ```
   If you leave out `--password`, it prompts for one with hidden input. `--eggs-per-tray N` is optional
   (the default is 30). See **Provisioning** below for re-runs and admin password resets.

6. **Run the app** at http://localhost:3000 and sign in with the owner account:
   ```sh
   bun run dev
   ```

### Local service URLs

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio (DB browser, SQL editor) | http://127.0.0.1:54323 |
| Mailpit (catches all auth email, e.g. password reset) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

No real email is sent locally. Open Mailpit to see password-reset emails.

Stop the stack with `bun run db:stop` (your local data is kept).

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Nuxt dev server on :3000 |
| `bun run build` / `bun run preview` | Production build and local preview |
| `bun run typecheck` | `nuxt typecheck` (vue-tsc). The Claude Code Stop hook also runs it. |
| `bun run lint` / `bun run lint:fix` | ESLint (`@nuxt/eslint`, stylistic rules) |
| `bun run test:unit` | Vitest unit tests (`tests/unit/`, no DB needed) |
| `bun run test:db` | pgTAP DB tests, including the **tenant-isolation suite**. Needs `bun run db:start`. |
| `bun run test:migration` | Feature 05 migration test: resets the **local** DB to the pre-orders schema, seeds pending/complete/voided sales, applies the orders migrations and checks the conversion (AC43 to AC46). Needs `bun run db:start`. Leaves the DB on the current schema except for its test data: run `bun run db:reset` afterwards. Not part of `bun run test`. |
| `bun run test` | `test:unit` then `test:db` |
| `bun run db:start` / `db:stop` | Start or stop the local Supabase stack |
| `bun run db:reset` | Recreate the local DB and re-apply all migrations |
| `bun run db:types` | Regenerate `shared/types/database.types.ts` from the local DB |
| `bun run provision -- …` | Create or update a farm + owner, or reset a password (see below) |

All `db:*` and `test:db` scripts target the **local** stack only. Migrations reach production only through a
controlled step (CI or an explicit manual command), never from the app at runtime.

Note: use `bun run test:unit`, not `bun test`. `bun test` is Bun's own test runner, and the specs are written for Vitest.

## Provisioning

There is no public sign-up. Farms and owner accounts are created with a local CLI
(`server/cli/provision.ts`) that runs on the operator's machine with the Supabase secret key from `.env`.
The deployed app never uses that key.

### Create a farm and its owner

```sh
bun run provision -- --farm "Hendricks Farm" --email owner@example.com [--password <pw>] [--eggs-per-tray 30]
```

- The owner account is created with a confirmed email, so the owner can sign in straight away.
- `--password` is optional. Without it you're prompted twice with hidden input, which keeps the password out
  of your shell history. The minimum is 8 characters.
- `--eggs-per-tray` must be a whole number of 1 or more (`0`, `-3` and `2.5` are rejected). Without it, a new
  farm gets the database default of 30.
- Output: `Created farm "Hendricks Farm" (eggs per tray: 30) for owner@example.com.`

**Re-running is safe (idempotent).** Running it again for the same email **reports and changes nothing**:

```
owner@example.com already has farm "Hendricks Farm" (eggs per tray: 30). No changes made. Use --update to change the farm name or eggs per tray, or reset-password to change the password.
```

It never creates a second farm or a second account, and it never changes an existing password (a
`--password` given for an existing account is ignored, with a note). If a previous run was interrupted after
creating the account but before the farm, the next run finishes the job.

To change the farm name or eggs per tray, add `--update`:

```sh
bun run provision -- --farm "Hendricks Egg Farm" --email owner@example.com --eggs-per-tray 24 --update
```

`--update` without `--eggs-per-tray` keeps the current value.

### Admin password reset (fallback when email reset isn't available)

The owner normally uses **Forgot password?** on the sign-in screen. If email isn't working, or the owner has
lost their phone, reset the password directly:

```sh
bun run provision -- reset-password --email owner@example.com [--password <pw>]
```

This sets the new password and **signs the owner out on every device** (Supabase Auth revokes all sessions
when an admin changes a password, and the CLI also deletes any remaining sessions). It's also the remedy for a
lost or stolen phone. Server routes reject the revoked session right away, and the owner signs in again with
the new password.

### Running against production

The CLI prints the target URL first. If it isn't `127.0.0.1` or `localhost`, it asks `Continue? [y/N]`
(skip the prompt with `--yes`). Keep the production URL and secret key in a gitignored
`.env.production.local` on the operator's machine, never in Vercel, and pass it explicitly:

```sh
bun --env-file=.env.production.local server/cli/provision.ts --farm "Hendricks Farm" --email owner@example.com
```

Run `bun run provision -- --help` for the full usage.
