// Node.js fallback runner for provisioning (when bun is blocked by Windows App Control/Device Guard).
// Usage:
//   node --env-file=.env.production.local scripts/provision.mjs --farm "Magcanta Farm" --email "magcantaeggfarm@gmail.com" --password "admin1234"
import { createHash, randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { createClient } from '@libsql/client'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

function readLine(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

function readHidden(question) {
  const stdin = process.stdin
  if (!stdin.isTTY) return readLine(question)
  process.stdout.write(question)
  return new Promise((resolve) => {
    let value = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch) => {
      ch = String(ch)
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
      }
      else if (ch === '\u0003') {
        process.exit(1)
      }
      else if (ch === '\u0008' || ch === '\u007f') {
        value = value.slice(0, -1)
      }
      else {
        value += ch
      }
    }
    stdin.on('data', onData)
  })
}

function parseArgs(args) {
  const parsed = {
    command: 'provision',
    update: false,
    yes: false,
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === 'reset-password') {
      parsed.command = 'reset-password'
    }
    else if (arg === '--farm') {
      parsed.farm = args[++i]
    }
    else if (arg === '--email') {
      parsed.email = args[++i]?.toLowerCase().trim()
    }
    else if (arg === '--password') {
      parsed.password = args[++i]
    }
    else if (arg === '--eggs-per-tray') {
      parsed.eggsPerTray = parseInt(args[++i], 10)
    }
    else if (arg === '--update') {
      parsed.update = true
    }
    else if (arg === '--yes') {
      parsed.yes = true
    }
  }
  return parsed
}

function getFirebaseAdminAuth() {
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

  throw new Error('FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, or FIREBASE_AUTH_EMULATOR_HOST must be set in your env file.')
}

async function findUserId(adminAuth, email) {
  try {
    const user = await adminAuth.getUserByEmail(email)
    return user.uid
  }
  catch (e) {
    if (e.code === 'auth/user-not-found') return null
    throw new Error(`Couldn't look up ${email}: ${e.message}`, { cause: e })
  }
}

async function createTenantTursoDatabase(tenantId) {
  const tursoApiToken = process.env.TURSO_API_TOKEN?.trim()
  const tursoOrg = process.env.TURSO_ORG?.trim()
  const tursoGroup = process.env.TURSO_GROUP?.trim() || 'default'

  if (!tursoApiToken || !tursoOrg) {
    return { dbUrl: `file:local-tenant-${tenantId}.db`, dbAuthToken: null }
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
    throw new Error(`Couldn't create Turso database ${dbName}: ${createRes.status} ${body}`)
  }
  const createJson = await createRes.json()
  const hostname = createJson.database?.Hostname
  if (!hostname) throw new Error('Turso API did not return a database Hostname.')

  const tokenRes = await fetch(
    `https://api.turso.tech/v1/organizations/${tursoOrg}/databases/${dbName}/auth/tokens`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${tursoApiToken}` },
    },
  )
  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    throw new Error(`Couldn't mint Turso database token for ${dbName}: ${tokenRes.status} ${body}`)
  }
  const tokenJson = await tokenRes.json()
  if (!tokenJson.jwt) throw new Error('Turso API did not return a database JWT.')

  return { dbUrl: `libsql://${hostname}`, dbAuthToken: tokenJson.jwt }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const controlUrl = process.env.NUXT_TURSO_CONTROL_URL?.trim() || 'file:local-control.db'
  const controlToken = process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN?.trim() || undefined

  if (!args.email) {
    console.error('Error: --email is required.')
    process.exit(1)
  }

  console.log(`Target: ${controlUrl}`)
  if (!args.yes && !controlUrl.startsWith('file:') && !controlUrl.includes('127.0.0.1') && !controlUrl.includes('localhost')) {
    const ans = await readLine('This is NOT a local target. Continue? [y/N] ')
    if (ans.trim().toLowerCase() !== 'y') {
      console.log('Aborted.')
      process.exit(0)
    }
  }

  const adminAuth = getFirebaseAdminAuth()
  const controlClient = createClient({ url: controlUrl, authToken: controlToken })

  await controlClient.executeMultiple(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      eggs_per_tray INTEGER NOT NULL DEFAULT 30,
      currency TEXT NOT NULL DEFAULT 'PHP',
      db_url TEXT NOT NULL,
      db_auth_token TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memberships (
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, user_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_id_key ON memberships (user_id);
  `)

  if (args.command === 'provision') {
    if (!args.farm) {
      console.error('Error: --farm is required for provisioning.')
      process.exit(1)
    }

    let userId = await findUserId(adminAuth, args.email)

    if (userId) {
      if (args.password) console.log('Note: the account already exists; --password was ignored.')
    }
    else {
      let password = args.password
      if (!password) {
        password = await readHidden('New password: ')
        const confirm = await readHidden('Confirm password: ')
        if (password !== confirm) {
          console.error('The passwords don\'t match.')
          process.exit(1)
        }
      }
      if (password.length < 8) {
        console.error('Password must be at least 8 characters.')
        process.exit(1)
      }

      const deterministicUid = createHash('sha256').update(args.email.trim().toLowerCase()).digest('hex').slice(0, 28)
      const created = await adminAuth.createUser({
        uid: deterministicUid,
        email: args.email,
        password,
        emailVerified: true,
      })
      userId = created.uid
      console.log(`Created account ${args.email}.`)
    }

    const memRes = await controlClient.execute({
      sql: 'SELECT tenant_id FROM memberships WHERE user_id = ?',
      args: [userId],
    })
    const existingTenantId = memRes.rows[0]?.tenant_id

    if (existingTenantId) {
      const tenantRes = await controlClient.execute({
        sql: 'SELECT id, name, eggs_per_tray FROM tenants WHERE id = ?',
        args: [existingTenantId],
      })
      const existingTenant = tenantRes.rows[0]
      if (args.update) {
        const farmName = args.farm.trim()
        const eggsPerTray = args.eggsPerTray ?? Number(existingTenant.eggs_per_tray)
        await controlClient.execute({
          sql: 'UPDATE tenants SET name = ?, eggs_per_tray = ?, updated_at = ? WHERE id = ?',
          args: [farmName, eggsPerTray, new Date().toISOString(), existingTenantId],
        })
        console.log(`Updated farm "${farmName}" (eggs per tray: ${eggsPerTray}) for ${args.email}.`)
      }
      else {
        console.log(`${args.email} already has farm "${existingTenant.name}" (eggs per tray: ${existingTenant.eggs_per_tray}). No changes made.`)
      }
    }
    else {
      const tenantId = randomUUID()
      const { dbUrl, dbAuthToken } = await createTenantTursoDatabase(tenantId)
      const farmName = args.farm.trim()
      const eggsPerTray = args.eggsPerTray ?? 30
      const now = new Date().toISOString()

      await controlClient.execute({
        sql: 'INSERT INTO tenants (id, name, eggs_per_tray, currency, db_url, db_auth_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [tenantId, farmName, eggsPerTray, 'PHP', dbUrl, dbAuthToken, now, now],
      })
      await controlClient.execute({
        sql: 'INSERT INTO memberships (tenant_id, user_id, created_at) VALUES (?, ?, ?)',
        args: [tenantId, userId, now],
      })

      const tenantClient = createClient({ url: dbUrl, authToken: dbAuthToken ?? undefined })
      await tenantClient.executeMultiple(`
        CREATE TABLE IF NOT EXISTS sizes (
          id TEXT PRIMARY KEY NOT NULL,
          tenant_id TEXT NOT NULL,
          name TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          color_slot INTEGER NOT NULL,
          archived_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
      const defaults = [
        { name: 'Small', sortOrder: 0, colorSlot: 0 },
        { name: 'Medium', sortOrder: 1, colorSlot: 1 },
        { name: 'Large', sortOrder: 2, colorSlot: 2 },
        { name: 'Jumbo', sortOrder: 3, colorSlot: 3 },
      ]
      for (const s of defaults) {
        await tenantClient.execute({
          sql: 'INSERT INTO sizes (id, tenant_id, name, sort_order, color_slot, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)',
          args: [randomUUID(), tenantId, s.name, s.sortOrder, s.colorSlot, now, now],
        })
      }
      console.log(`Created farm "${farmName}" (eggs per tray: ${eggsPerTray}) for ${args.email}.`)
    }
  }
  else if (args.command === 'reset-password') {
    const userId = await findUserId(adminAuth, args.email)
    if (!userId) throw new Error(`No account found for ${args.email}`)
    let password = args.password
    if (!password) {
      password = await readHidden('New password: ')
      const confirm = await readHidden('Confirm password: ')
      if (password !== confirm) {
        console.error('The passwords don\'t match.')
        process.exit(1)
      }
    }
    await adminAuth.updateUser(userId, { password })
    await adminAuth.revokeRefreshTokens(userId)
    console.log(`Password updated for ${args.email}. All sessions revoked.`)
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})
