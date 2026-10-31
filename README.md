# Tamago egg farm tracker

A multi-tenant web app for egg farms: production, computed inventory, sales/deliveries and clients.
Nuxt 4 (SSR) + TypeScript, Firebase Auth + Turso (libSQL) via Drizzle ORM (database-per-tenant), Nuxt UI v4 + Tailwind CSS v4, hosted on Vercel.

Specs live in `docs/` (start with `GEMINI.md` / `CLAUDE.md` and `docs/egg-farm-app-architecture-spec.md`).

## Local setup

Everything runs locally. You need no cloud account and no production credentials.
The commands work the same in PowerShell and Git Bash.

### Prerequisites

- **Bun 1.3.14+**, the package manager (`bun --version`). Don't use npm, npx or pnpm here.
- **Node 24** (`.nvmrc`; `engines` requires `>=24.11 <25`). Nuxt runs on Node, and Bun installs and runs scripts.

### Steps

1. **Install dependencies.** `bun.lock` is committed, so use a frozen install:
   ```sh
   bun install --frozen-lockfile
   ```
   This also runs `nuxt prepare`, which generates `.nuxt/`, needed by lint and typecheck.

2. **Create `.env`** from the example:
   ```sh
   cp .env.example .env
   ```
   To run 100% locally with zero cloud dependencies, uncomment `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `.env`.

3. **Start the Firebase Auth emulator**:
   ```sh
   bun run emulator
   ```
   This starts the Auth emulator on port `9099` and the Emulator UI on `http://127.0.0.1:4000/auth`.

4. **Provision a farm and its owner** (in a second terminal):
   ```sh
   bun run provision -- --farm "Hendricks Farm" --email owner@example.com
   ```
   If you leave out `--password`, it prompts for one with hidden input. `--eggs-per-tray N` is optional
   (the default is 30). See **Provisioning** below for re-runs and details.
   In local development without cloud Turso credentials, this automatically provisions `file:local-control.db` and `file:local-tenant-<tenantId>.db`.

5. **Run the app** at http://localhost:3000 and sign in with the owner account:
   ```sh
   bun run dev
   ```

## Commands

| Command | What it does |
|---|---|
| `bun run dev` | Nuxt dev server on :3000 |
| `bun run emulator` | Start local Firebase Auth emulator and UI (:4000) |
| `bun run build` / `bun run preview` | Production build and local preview |
| `bun run typecheck` | `nuxt typecheck` (vue-tsc) |
| `bun run lint` / `bun run lint:fix` | ESLint (`@nuxt/eslint`, stylistic rules) |
| `bun run test` | Run unit tests (`vitest run`) |
| `bun run test:unit` | Vitest unit tests in `tests/unit/` |
| `bun run test:e2e` | Playwright end-to-end specs in `tests/e2e/` |
| `bun run db:generate:control` | Generate Drizzle migrations for Control DB |
| `bun run db:generate:tenant` | Generate Drizzle migrations for Tenant DB |
| `bun run db:push:control` | Push Drizzle schema to Control DB |
| `bun run db:push:tenant` | Push Drizzle schema to Tenant DB |
| `bun run provision -- …` | Create or update a farm + owner, or reset a password |
| `bun run check:build` | Verify production build does not leak secret key material |

Note: use `bun run test:unit`, not `bun test`. `bun test` is Bun's own test runner, and the specs are written for Vitest.

## Provisioning

There is no public sign-up. Farms and owner accounts are created with a CLI
(`server/cli/provision.ts`) that runs on the operator's machine with Firebase Admin and Turso credentials.
The deployed app frontend never receives secret key material.

### Create a farm and its owner

```sh
bun run provision -- --farm "Hendricks Farm" --email owner@example.com [--password <pw>] [--eggs-per-tray 30]
```

- The owner account is created in Firebase Auth with a verified email, and mapped to the farm in the Control DB.
- `--password` is optional. Without it you're prompted twice with hidden input, which keeps the password out
  of your shell history. The minimum is 8 characters.
- `--eggs-per-tray` must be a whole number of 1 or more (`0`, `-3` and `2.5` are rejected). Without it, a new
  farm gets the database default of 30.
- Output: `Created farm "Hendricks Farm" (eggs per tray: 30) for owner@example.com.`

**Re-running is safe (idempotent).** Running it again for the same email reports the existing setup.
To update a farm's name or eggs per tray, pass `--update`:

```sh
bun run provision -- --farm "Hendricks Egg Farm" --email owner@example.com --eggs-per-tray 24 --update
```

Run `bun run provision -- --help` for the full usage options.
