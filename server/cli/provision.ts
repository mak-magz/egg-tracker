// Provisioning CLI (AC30, AC31). Runs on the operator's machine, never as an HTTP route:
//   bun run provision -- --farm "Hendricks Farm" --email owner@example.com [--password <pw>] [--eggs-per-tray 30] [--update] [--yes]
//   bun run provision -- reset-password --email owner@example.com [--password <pw>] [--yes]
// `bun run provision` = `bun --env-file=.env server/cli/provision.ts`. Nitro never bundles this file.
// It is the ONLY code that uses the secret (service-role) key. docs/features/00-project-scaffold.md §3.6.
import { createInterface } from 'node:readline'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import {
  USAGE,
  isLocalTarget,
  outcomeMessage,
  parseProvisionArgs,
  validatePassword,
} from './provision-args'
import type { ProvisionCommand, ProvisionOutcome, ResetPasswordCommand } from './provision-args'

type Admin = SupabaseClient<Database>

class CliError extends Error {}

function readLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/** Reads a line without echoing it (TTY). Falls back to a plain line read when stdin is piped. */
function readHidden(question: string): Promise<string> {
  const stdin = process.stdin
  if (!stdin.isTTY) return readLine(question)
  process.stdout.write(question)
  return new Promise((resolve, reject) => {
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup()
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (ch === '\u0003') { // Ctrl-C
          cleanup()
          process.stdout.write('\n')
          reject(new CliError('Cancelled.'))
          return
        }
        if (ch === '\u007F' || ch === '\b') value = value.slice(0, -1)
        else if (ch >= ' ') value += ch
      }
    }
    const cleanup = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
    }
    stdin.on('data', onData)
  })
}

async function promptNewPassword(): Promise<string> {
  const pw = await readHidden('New password: ')
  const check = validatePassword(pw)
  if (!check.ok) throw new CliError(check.error)
  const confirm = await readHidden('Confirm password: ')
  if (confirm !== pw) throw new CliError('The passwords don\'t match.')
  return pw
}

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new CliError(`${name} is not set. Run with --env-file (bun run provision uses .env); see .env.example.`)
  return value
}

async function confirmTarget(url: string, yes: boolean) {
  console.log(`Target: ${url}`)
  if (isLocalTarget(url) || yes) return
  const answer = await readLine('This is NOT the local stack. Continue? [y/N] ')
  if (answer.trim().toLowerCase() !== 'y') throw new CliError('Aborted.')
}

async function findUserId(admin: Admin, email: string): Promise<string | null> {
  const { data, error } = await admin.rpc('admin_user_id_by_email', { p_email: email })
  if (error) throw new CliError(`Couldn't look up ${email}: ${error.message}`)
  return data ?? null
}

async function provision(admin: Admin, cmd: ProvisionCommand) {
  let userId = await findUserId(admin, cmd.email)

  if (userId) {
    if (cmd.password) console.log('Note: the account already exists; --password was ignored (use reset-password to change it).')
  }
  else {
    const password = cmd.password ?? await promptNewPassword()
    const { data, error } = await admin.auth.admin.createUser({ email: cmd.email, password, email_confirm: true })
    if (error && error.code !== 'email_exists') {
      throw new CliError(`Couldn't create the account for ${cmd.email}: ${error.message}`)
    }
    userId = data?.user?.id ?? await findUserId(admin, cmd.email)
    if (!userId) throw new CliError(`The account for ${cmd.email} could not be found after creating it.`)
    if (!error) console.log(`Created account ${cmd.email}.`)
  }

  const { data, error } = await admin.rpc('provision_farm', {
    p_user_id: userId,
    p_farm_name: cmd.farm,
    // Omitted when not given, so the column default applies (the default lives only in the DB).
    ...(cmd.eggsPerTray !== undefined ? { p_eggs_per_tray: cmd.eggsPerTray } : {}),
    p_update: cmd.update,
  })
  if (error) throw new CliError(`Couldn't provision the farm: ${error.message}`)
  const row = data?.[0]
  if (!row) throw new CliError('provision_farm returned no row.')
  console.log(outcomeMessage(row.outcome as ProvisionOutcome, cmd.email, row.farm_name, row.eggs_per_tray))
}

async function resetPassword(admin: Admin, cmd: ResetPasswordCommand) {
  const userId = await findUserId(admin, cmd.email)
  if (!userId) throw new CliError(`There is no account for ${cmd.email}.`)
  const password = cmd.password ?? await promptNewPassword()

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) throw new CliError(`Couldn't update the password for ${cmd.email}: ${error.message}`)

  // Supabase Auth already revokes every session on an admin password change (verified locally, CLI 2.117).
  // This explicit revoke is a backstop in case that behaviour ever changes; it normally finds nothing left.
  const { error: revokeError } = await admin.rpc('admin_revoke_sessions', { p_user_id: userId })
  if (revokeError) throw new CliError(`Password updated, but signing out devices failed: ${revokeError.message}`)
  console.log(`Password updated for ${cmd.email}. All their devices are signed out.`)
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseProvisionArgs(argv)
  if (!parsed.ok) {
    console.error(`Error: ${parsed.error}\n\n${USAGE}`)
    return 2
  }
  const cmd = parsed.value
  if (cmd.command === 'help') {
    console.log(USAGE)
    return 0
  }

  const url = env('NUXT_PUBLIC_SUPABASE_URL')
  const secretKey = env('NUXT_SUPABASE_SECRET_KEY')
  await confirmTarget(url, cmd.yes)

  const admin: Admin = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  if (cmd.command === 'provision') await provision(admin, cmd)
  else await resetPassword(admin, cmd)
  return 0
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (e: unknown) => {
    if (e instanceof CliError) console.error(`Error: ${e.message}`)
    else console.error('Unexpected error:', e)
    process.exitCode = 1
  },
)
