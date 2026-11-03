// Provisioning CLI (AC30, AC31). Runs on the operator's machine, never as an HTTP route:
//   bun run provision -- --farm "Hendricks Farm" --email owner@example.com [--password <pw>] [--eggs-per-tray 30] [--update] [--yes]
//   bun run provision -- reset-password --email owner@example.com [--password <pw>] [--yes]
// `bun run provision` = `bun --env-file=.env server/cli/provision.ts`. Nitro never bundles this file.
// Provisions the owner in Firebase Admin Auth, initializes the tenant's Turso/libSQL database with
// Drizzle schema + default egg sizes, and records the tenant & membership in the Turso Control DB.
import { createHash, randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import type { Auth } from 'firebase-admin/auth'
import * as controlSchema from '../db/schema/control'
import { getControlDb, initControlDbSchema, initTenantDbSchema } from '../db/turso'
import {
  adminOutcomeMessage,
  USAGE,
  isLocalTarget,
  outcomeMessage,
  parseProvisionArgs,
  validatePassword,
} from './provision-args'
import type { AdminCommand, ProvisionCommand, ProvisionOutcome, ResetPasswordCommand } from './provision-args'

class CliError extends Error { }

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

function getFirebaseAdminAuth(): Auth {
  const existing = getApps()[0]
  if (existing) return getAuth(existing)

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim()
  const projectId = process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || 'demo-no-project'

  if (rawServiceAccount && rawServiceAccount.startsWith('{')) {
    const app = initializeApp({
      credential: cert(JSON.parse(rawServiceAccount)),
      projectId,
    })
    return getAuth(app)
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
    const app = initializeApp({ projectId })
    return getAuth(app)
  }

  throw new CliError(
    'FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_AUTH_EMULATOR_HOST is not set. Run with --env-file (bun run provision uses .env); see .env.example.',
  )
}

async function confirmTarget(targetUrl: string, yes: boolean) {
  console.log(`Target: ${targetUrl}`)
  if (targetUrl.startsWith('file:') || isLocalTarget(targetUrl) || yes) return
  const answer = await readLine('This is NOT a local target. Continue? [y/N] ')
  if (answer.trim().toLowerCase() !== 'y') throw new CliError('Aborted.')
}

async function findUserId(adminAuth: Auth, email: string): Promise<string | null> {
  try {
    const user = await adminAuth.getUserByEmail(email)
    return user.uid
  }
  catch (e) {
    const code = (e as { code?: string })?.code
    if (code === 'auth/user-not-found') return null
    throw new CliError(`Couldn't look up ${email}: ${(e as Error).message}`)
  }
}

async function createTenantTursoDatabase(tenantId: string): Promise<{ dbUrl: string, dbAuthToken: string }> {
  const tursoApiToken = process.env.TURSO_API_TOKEN?.trim()
  const tursoOrg = process.env.TURSO_ORG?.trim()
  const tursoGroup = process.env.TURSO_GROUP?.trim() || 'default'

  if (!tursoApiToken || !tursoOrg) {
    return { dbUrl: `file:local-tenant-${tenantId}.db`, dbAuthToken: '' }
  }

  const dbName = `tamago-${tenantId.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 32)}`
  const createRes = await fetch(`https://api.turso.tech/v1/organizations/${tursoOrg}/databases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tursoApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: dbName, group: tursoGroup }),
  })
  if (!createRes.ok) {
    const body = await createRes.text()
    throw new CliError(`Couldn't create Turso database ${dbName}: ${createRes.status} ${body}`)
  }
  const createJson = await createRes.json() as { database?: { Hostname?: string } }
  const hostname = createJson.database?.Hostname
  if (!hostname) throw new CliError('Turso API did not return a database Hostname.')

  const tokenRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}/auth/tokens`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tursoApiToken}` },
    },
  )
  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new CliError(`Couldn't mint Turso database token for ${dbName}: ${tokenRes.status} ${body}`)
  }
  const tokenJson = await tokenRes.json() as { jwt?: string }
  if (!tokenJson.jwt) throw new CliError('Turso API did not return a database JWT.')

  return { dbUrl: `libsql://${hostname}`, dbAuthToken: tokenJson.jwt }
}

async function provision(adminAuth: Auth, cmd: ProvisionCommand) {
  let userId = await findUserId(adminAuth, cmd.email)

  if (userId) {
    if (cmd.password) console.log('Note: the account already exists; --password was ignored (use reset-password to change it).')
  }
  else {
    const password = cmd.password ?? await promptNewPassword()
    const deterministicUid = createHash('sha256').update(cmd.email.trim().toLowerCase()).digest('hex').slice(0, 28)
    try {
      const created = await adminAuth.createUser({
        uid: deterministicUid,
        email: cmd.email,
        password,
        emailVerified: true,
      })
      userId = created.uid
      console.log(`Created account ${cmd.email}.`)
    }
    catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'auth/email-already-exists') {
        userId = await findUserId(adminAuth, cmd.email)
      }
      else {
        throw new CliError(`Couldn't create the account for ${cmd.email}: ${(e as Error).message}`)
      }
    }
    if (!userId) throw new CliError(`The account for ${cmd.email} could not be found after creating it.`)
  }

  const controlUrl = process.env.NUXT_TURSO_CONTROL_URL?.trim() || 'file:local-control.db'
  const controlToken = process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN?.trim() || undefined
  const rawControlClient = createClient({ url: controlUrl, authToken: controlToken })
  await initControlDbSchema(rawControlClient)

  const controlDb = getControlDb()
  const [existingMembership] = await controlDb
    .select()
    .from(controlSchema.memberships)
    .where(eq(controlSchema.memberships.userId, userId))

  let outcome: ProvisionOutcome
  let farmName: string
  let eggsPerTray: number

  if (existingMembership) {
    const [existingTenant] = await controlDb
      .select()
      .from(controlSchema.tenants)
      .where(eq(controlSchema.tenants.id, existingMembership.tenantId))
    if (!existingTenant) throw new CliError('Membership exists without a tenant row.')

    if (cmd.update) {
      farmName = cmd.farm.trim()
      eggsPerTray = cmd.eggsPerTray ?? existingTenant.eggsPerTray
      await controlDb
        .update(controlSchema.tenants)
        .set({
          name: farmName,
          eggsPerTray,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(controlSchema.tenants.id, existingTenant.id))
      outcome = 'updated'
    }
    else {
      farmName = existingTenant.name
      eggsPerTray = existingTenant.eggsPerTray
      outcome = 'unchanged'
    }
  }
  else {
    const tenantId = randomUUID()
    const { dbUrl, dbAuthToken } = await createTenantTursoDatabase(tenantId)
    farmName = cmd.farm.trim()
    eggsPerTray = cmd.eggsPerTray ?? 30
    const now = new Date().toISOString()

    await controlDb.insert(controlSchema.tenants).values({
      id: tenantId,
      name: farmName,
      eggsPerTray,
      currency: 'PHP',
      dbUrl,
      dbAuthToken,
      createdAt: now,
      updatedAt: now,
    })

    await controlDb.insert(controlSchema.memberships).values({
      id: randomUUID(),
      tenantId,
      userId,
      createdAt: now,
      updatedAt: now,
    })

    const rawTenantClient = createClient({ url: dbUrl, authToken: dbAuthToken || undefined })
    await initTenantDbSchema(rawTenantClient)
    outcome = 'created'
  }

  console.log(outcomeMessage(outcome, cmd.email, farmName, eggsPerTray))
}

async function resetPassword(adminAuth: Auth, cmd: ResetPasswordCommand) {
  const userId = await findUserId(adminAuth, cmd.email)
  if (!userId) throw new CliError(`There is no account for ${cmd.email}.`)
  const password = cmd.password ?? await promptNewPassword()

  try {
    await adminAuth.updateUser(userId, { password })
  }
  catch (e) {
    throw new CliError(`Couldn't update the password for ${cmd.email}: ${(e as Error).message}`)
  }

  try {
    await adminAuth.revokeRefreshTokens(userId)
  }
  catch (e) {
    throw new CliError(`Password updated, but signing out devices failed: ${(e as Error).message}`)
  }
  console.log(`Password updated for ${cmd.email}. All their devices are signed out.`)
}

async function provisionAdmin(adminAuth: Auth, cmd: AdminCommand) {
  let userId = await findUserId(adminAuth, cmd.email)
  let status: 'created' | 'updated' = 'updated'

  if (!userId) {
    const password = cmd.password ?? await promptNewPassword()
    try {
      const user = await adminAuth.createUser({
        email: cmd.email,
        password,
        emailVerified: true,
      })
      userId = user.uid
      status = 'created'
    }
    catch (e) {
      throw new CliError(`Couldn't create the admin account for ${cmd.email}: ${(e as Error).message}`)
    }
  }
  else if (cmd.password) {
    try {
      await adminAuth.updateUser(userId, { password: cmd.password, emailVerified: true })
      await adminAuth.revokeRefreshTokens(userId)
    }
    catch (e) {
      throw new CliError(`Couldn't update admin credentials for ${cmd.email}: ${(e as Error).message}`)
    }
  }

  // Set custom claims for defense-in-depth
  try {
    await adminAuth.setCustomUserClaims(userId, { admin: true })
  }
  catch (e) {
    console.warn(`[admin] Warning: could not set custom claims: ${(e as Error).message}`)
  }

  console.log(adminOutcomeMessage(cmd.email, status))

  // Check ADMIN_EMAILS configuration
  const adminEmailsRaw = process.env.ADMIN_EMAILS?.trim() || ''
  const adminEmails = adminEmailsRaw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  if (!adminEmails.includes(cmd.email.toLowerCase())) {
    console.log(
      `\nNotice: "${cmd.email}" is NOT currently in ADMIN_EMAILS in your environment.\n`
      + `To allow this account to access /admin, add it to your environment variables:\n`
      + `  ADMIN_EMAILS="${adminEmailsRaw ? `${adminEmailsRaw},${cmd.email}` : cmd.email}"\n`,
    )
  }
  else {
    console.log(`Verified: "${cmd.email}" is authorized in ADMIN_EMAILS.`)
  }
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

  const controlUrl = process.env.NUXT_TURSO_CONTROL_URL?.trim() || 'file:local-control.db'
  await confirmTarget(controlUrl, cmd.yes)

  const adminAuth = getFirebaseAdminAuth()

  if (cmd.command === 'provision') await provision(adminAuth, cmd)
  else if (cmd.command === 'admin') await provisionAdmin(adminAuth, cmd)
  else await resetPassword(adminAuth, cmd)
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
