// Pure argument parsing + validation for `bun run provision` (docs/features/00-project-scaffold.md §3.6).
// No I/O here, so it is unit-tested (tests/unit/provision-args.spec.ts). Relative imports only:
// the CLI runs under Bun outside Nuxt, where aliases don't resolve.
import { PASSWORD_MIN_LENGTH } from '../../shared/constants/auth'
import { emailSchema } from '../../shared/schemas/auth'

export interface ProvisionCommand {
  command: 'provision'
  farm: string
  email: string
  /** Undefined: prompt (only if the account has to be created). */
  password?: string
  /** Undefined: the DB column default applies (never hardcoded here). */
  eggsPerTray?: number
  update: boolean
  yes: boolean
}

export interface ResetPasswordCommand {
  command: 'reset-password'
  email: string
  password?: string
  yes: boolean
}

export type CliCommand = ProvisionCommand | ResetPasswordCommand | { command: 'help' }

export type ParseResult = { ok: true, value: CliCommand } | { ok: false, error: string }

export const FARM_NAME_MAX = 100
const INT4_MAX = 2_147_483_647

export const USAGE = `Usage:
  bun run provision -- --farm "<farm name>" --email <owner email> [--password <pw>] [--eggs-per-tray <n>] [--update] [--yes]
  bun run provision -- reset-password --email <owner email> [--password <pw>] [--yes]

Provision (idempotent): creates the owner account (email confirmed) and the farm. Re-running for the same
email never creates a second farm or account: it reports "No changes made" unless --update is passed, which
updates the farm name and (if given) eggs per tray. It never changes an existing password.

reset-password: sets a new password for an existing owner and signs out ALL their devices
(Firebase Auth revokes refresh tokens on an admin password reset).

--password is optional: without it you're prompted (hidden input), which keeps it out of shell history.
--eggs-per-tray must be a whole number >= 1. Without it a new farm gets the database default (30).
The target is NUXT_TURSO_CONTROL_URL; a non-local target asks for confirmation unless --yes.
Use --env-file=.env.production.local (bun --env-file=... server/cli/provision.ts) for production.`

type FlagSpec = Record<string, 'string' | 'boolean'>

const PROVISION_FLAGS: FlagSpec = {
  'farm': 'string', 'email': 'string', 'password': 'string', 'eggs-per-tray': 'string', 'update': 'boolean', 'yes': 'boolean',
}
const RESET_FLAGS: FlagSpec = {
  email: 'string', password: 'string', yes: 'boolean',
}

function parseFlags(argv: string[], spec: FlagSpec): { ok: true, flags: Record<string, string | true> } | { ok: false, error: string } {
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (!arg.startsWith('--')) return { ok: false, error: `Unexpected argument "${arg}".` }
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    const kind = spec[name]
    if (!kind) return { ok: false, error: `Unknown option --${name}.` }
    if (name in flags) return { ok: false, error: `--${name} was given more than once.` }
    if (kind === 'boolean') {
      if (eq !== -1) return { ok: false, error: `--${name} takes no value.` }
      flags[name] = true
      continue
    }
    let value: string | undefined
    if (eq !== -1) {
      value = arg.slice(eq + 1)
    }
    else {
      value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) return { ok: false, error: `--${name} needs a value.` }
      i++
    }
    flags[name] = value
  }
  return { ok: true, flags }
}

export function validateFarmName(raw: string): { ok: true, value: string } | { ok: false, error: string } {
  const value = raw.trim()
  if (value.length < 1 || value.length > FARM_NAME_MAX) {
    return { ok: false, error: `--farm must be 1 to ${FARM_NAME_MAX} characters (after trimming spaces).` }
  }
  return { ok: true, value }
}

export function validateEmail(raw: string): { ok: true, value: string } | { ok: false, error: string } {
  const r = emailSchema.safeParse(raw)
  if (!r.success) return { ok: false, error: `--email "${raw}" is not a valid email address.` }
  return { ok: true, value: r.data.toLowerCase() }
}

export function validatePassword(raw: string): { ok: true, value: string } | { ok: false, error: string } {
  if (raw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `The password must be at least ${PASSWORD_MIN_LENGTH} characters.` }
  }
  return { ok: true, value: raw }
}

/** AC22: whole numbers >= 1 only. "0", "-3", "2.5", "1e2", " 30", "" are all rejected. */
export function validateEggsPerTray(raw: string): { ok: true, value: number } | { ok: false, error: string } {
  const error = `--eggs-per-tray must be a whole number of 1 or more (got "${raw}").`
  if (!/^\d+$/.test(raw)) return { ok: false, error }
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 1 || n > INT4_MAX) return { ok: false, error }
  return { ok: true, value: n }
}

export function parseProvisionArgs(argv: string[]): ParseResult {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
    return { ok: true, value: { command: 'help' } }
  }

  if (argv[0] === 'reset-password') {
    const parsed = parseFlags(argv.slice(1), RESET_FLAGS)
    if (!parsed.ok) return parsed
    const f = parsed.flags
    if (typeof f.email !== 'string') return { ok: false, error: '--email is required.' }
    const email = validateEmail(f.email)
    if (!email.ok) return email
    let password: string | undefined
    if (typeof f.password === 'string') {
      const p = validatePassword(f.password)
      if (!p.ok) return p
      password = p.value
    }
    return {
      ok: true,
      value: { command: 'reset-password', email: email.value, password, yes: f.yes === true },
    }
  }

  if (argv[0] !== undefined && !argv[0].startsWith('--')) {
    return { ok: false, error: `Unknown command "${argv[0]}". Use reset-password, or options only to provision.` }
  }

  const parsed = parseFlags(argv, PROVISION_FLAGS)
  if (!parsed.ok) return parsed
  const f = parsed.flags
  if (typeof f.farm !== 'string') return { ok: false, error: '--farm is required.' }
  if (typeof f.email !== 'string') return { ok: false, error: '--email is required.' }
  const farm = validateFarmName(f.farm)
  if (!farm.ok) return farm
  const email = validateEmail(f.email)
  if (!email.ok) return email
  let password: string | undefined
  if (typeof f.password === 'string') {
    const p = validatePassword(f.password)
    if (!p.ok) return p
    password = p.value
  }
  let eggsPerTray: number | undefined
  if (typeof f['eggs-per-tray'] === 'string') {
    const e = validateEggsPerTray(f['eggs-per-tray'])
    if (!e.ok) return e
    eggsPerTray = e.value
  }
  return {
    ok: true,
    value: { command: 'provision', farm: farm.value, email: email.value, password, eggsPerTray, update: f.update === true, yes: f.yes === true },
  }
}

/** True when the target is the local stack (no confirmation needed). */
export function isLocalTarget(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
  }
  catch {
    return false
  }
}

export type ProvisionOutcome = 'created' | 'unchanged' | 'updated'

export function outcomeMessage(outcome: ProvisionOutcome, email: string, farm: string, eggsPerTray: number): string {
  switch (outcome) {
    case 'created':
      return `Created farm "${farm}" (eggs per tray: ${eggsPerTray}) for ${email}.`
    case 'unchanged':
      return `${email} already has farm "${farm}" (eggs per tray: ${eggsPerTray}). No changes made. `
        + 'Use --update to change the farm name or eggs per tray, or reset-password to change the password.'
    case 'updated':
      return `Updated farm "${farm}" (eggs per tray: ${eggsPerTray}) for ${email}.`
  }
}
