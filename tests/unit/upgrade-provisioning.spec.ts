import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createClient } from '@libsql/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import * as controlSchema from '../../server/db/schema/control'
import { getControlDb, initTenantDbSchema, resolveLibsqlUrl } from '../../server/db/turso'
import { findMembershipWithFarm } from '../../server/repositories/memberships'
import { isDatabaseAuthToken, provisionTenantFarm } from '../../server/services/provision'
import { parseServiceAccountConfig } from '../../server/utils/auth'

const TEST_CONTROL_DB = 'local-control-upgrade-test.db'

describe('Vercel Account Upgrade & Provisioning Resilience', () => {
  const createdFiles: string[] = [TEST_CONTROL_DB]
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...origEnv }
  })

  afterAll(() => {
    process.env = origEnv
    for (const f of createdFiles) {
      for (const suffix of ['', '-wal', '-shm']) {
        const target = `${f}${suffix}`
        if (existsSync(target)) {
          try {
            rmSync(target, { force: true })
          }
          catch {
            // Ignore Windows file lock cleanup delay
          }
        }
      }
    }
  })

  describe('resolveLibsqlUrl', () => {
    it('leaves libsql:// and https:// URLs unchanged on Vercel', () => {
      process.env.VERCEL = '1'
      expect(resolveLibsqlUrl('libsql://tamago-control-org.turso.io')).toBe('libsql://tamago-control-org.turso.io')
      expect(resolveLibsqlUrl('https://tamago-control-org.turso.io')).toBe('https://tamago-control-org.turso.io')
    })

    it('rewrites relative file: URLs into os.tmpdir() when running on Vercel', () => {
      process.env.VERCEL = '1'
      const resolved = resolveLibsqlUrl('file:local-control.db')
      const expectedPrefix = `file:${tmpdir().replace(/\\/g, '/')}/`
      expect(resolved.startsWith(expectedPrefix)).toBe(true)
      expect(resolved.endsWith('/local-control.db')).toBe(true)
    })

    it('keeps relative file: URLs as-is in local non-serverless dev', () => {
      delete process.env.VERCEL
      delete process.env.AWS_LAMBDA_FUNCTION_NAME
      delete process.env.NETLIFY
      expect(resolveLibsqlUrl('file:local-control.db')).toBe('file:local-control.db')
    })
  })

  describe('parseServiceAccountConfig', () => {
    it('parses raw JSON, unescapes \\n in private_key, and extracts project_id', () => {
      const raw = JSON.stringify({
        type: 'service_account',
        project_id: 'tamago-prod',
        client_email: 'firebase-adminsdk@tamago-prod.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgk\\n-----END PRIVATE KEY-----\\n',
      })
      const res = parseServiceAccountConfig(raw)
      expect(res.projectId).toBe('tamago-prod')
      expect(res.certInput).toBeDefined()
      expect(typeof res.certInput).toBe('object')
      const certObj = res.certInput as Record<string, string>
      expect(certObj.private_key).toContain('\nMIIEvgIBADANBgk\n')
      expect(certObj.private_key).not.toContain('\\n')
    })

    it('parses quoted JSON and base64-encoded JSON strings', () => {
      const json = JSON.stringify({
        project_id: 'tamago-quoted',
        client_email: 'admin@tamago.app',
        private_key: 'line1\\nline2',
      })
      const quoted = `"${json}"`
      expect(parseServiceAccountConfig(quoted).projectId).toBe('tamago-quoted')

      const b64 = Buffer.from(json, 'utf8').toString('base64')
      expect(parseServiceAccountConfig(b64).projectId).toBe('tamago-quoted')
    })

    it('ignores non-existent local file paths so applicationDefault() does not crash with ENOENT', () => {
      const res = parseServiceAccountConfig('./non-existent-service-account-file.json')
      expect(res.certInput).toBeUndefined()
    })
  })

  describe('isDatabaseAuthToken', () => {
    it('detects database-scoped JWTs containing rid or action claims', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')
      const dbPayload = Buffer.from(JSON.stringify({ rid: 'db-123', a: 'rw' })).toString('base64url')
      const dbJwt = `${header}.${dbPayload}.sig`
      expect(isDatabaseAuthToken(dbJwt)).toBe(true)
    })

    it('allows platform JWTs and opaque platform API tokens', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')
      const platformPayload = Buffer.from(JSON.stringify({ sub: 'user-123', iss: 'turso' })).toString('base64url')
      const platformJwt = `${header}.${platformPayload}.sig`
      expect(isDatabaseAuthToken(platformJwt)).toBe(false)
      expect(isDatabaseAuthToken('turso_pat_opaque_token_string_12345')).toBe(false)
    })
  })

  describe('Fresh Control DB Bootstrap & Provisioning Order', () => {
    it('bootstraps an empty Control DB when findMembershipWithFarm is called before provisionTenantFarm', async () => {
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(`${TEST_CONTROL_DB}${suffix}`)) {
          rmSync(`${TEST_CONTROL_DB}${suffix}`, { force: true })
        }
      }

      delete process.env.VERCEL
      process.env.NUXT_TURSO_CONTROL_URL = `file:${TEST_CONTROL_DB}`
      delete process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN
      delete process.env.TURSO_API_TOKEN
      delete process.env.TURSO_ORG

      // 1. First call in upgrade.post.ts: findMembershipWithFarm on a brand-new uninitialized Control DB
      const before = await findMembershipWithFarm('uid-new-owner-1')
      expect(before).toBeNull()

      // 2. Provision the tenant farm
      const provisioned = await provisionTenantFarm({
        farmName: 'Live Upgrade Farm',
        currency: 'PHP',
        eggsPerTray: 30,
        ownerEmail: 'owner@livefarm.com',
        ownerUid: 'uid-new-owner-1',
        tier: 'premium',
      })
      expect(provisioned.tenantId).toBeDefined()
      const tenantFile = provisioned.dbUrl.replace(/^file:/, '')
      createdFiles.push(tenantFile)

      // 3. Subsequent findMembershipWithFarm returns the newly provisioned farm & seeded sizes
      const after = await findMembershipWithFarm('uid-new-owner-1')
      expect(after).not.toBeNull()
      expect(after?.farm.name).toBe('Live Upgrade Farm')
      expect(after?.farm.sizes.length).toBeGreaterThanOrEqual(4)
    })

    it('enforces exact Hrana SQL placeholder bind counts in initTenantDbSchema (regression for LibsqlBatchError SQLITE_UNKNOWN)', async () => {
      const memClient = createClient({ url: ':memory:' })
      const origBatch = memClient.batch.bind(memClient)

      // Simulate Turso Hrana server strict parameter count check on every batch statement
      memClient.batch = (async (stmts: unknown[], mode?: 'write' | 'read' | 'deferred') => {
        for (let i = 0; i < stmts.length; i++) {
          const s = stmts[i]
          if (typeof s === 'string') {
            const placeholders = s.split('?').length - 1
            expect(placeholders, `Statement #${i} string has unbound placeholders`).toBe(0)
          }
          else if (s && typeof s === 'object' && 'sql' in s) {
            const stmtObj = s as { sql: string, args?: unknown[] }
            const placeholders = stmtObj.sql.split('?').length - 1
            const argsLen = Array.isArray(stmtObj.args) ? stmtObj.args.length : 0
            expect(argsLen, `Statement #${i} (${stmtObj.sql}) parameter count mismatch`).toBe(placeholders)
          }
        }
        return origBatch(stmts as Parameters<typeof origBatch>[0], mode)
      }) as typeof memClient.batch

      await initTenantDbSchema(memClient)

      // Verify both 'sales' and 'orders' rows were inserted into local_counters
      const counters = await memClient.execute('SELECT id, next_number, updated_at FROM local_counters ORDER BY id')
      expect(counters.rows.map(r => r.id)).toEqual(['orders', 'sales'])

      // Verify default farm_settings row was seeded
      const settings = await memClient.execute('SELECT id, farm_name FROM farm_settings')
      expect(settings.rows).toHaveLength(1)
      expect(settings.rows[0]?.id).toBe('default')
      memClient.close()
    })

    it('self-heals a half-provisioned tenant whose Control DB rows exist but Tenant DB batch previously rolled back', async () => {
      delete process.env.VERCEL
      process.env.NUXT_TURSO_CONTROL_URL = `file:${TEST_CONTROL_DB}`

      const halfTenantFile = 'local-tenant-half-provisioned-test.db'
      createdFiles.push(halfTenantFile)
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(`${halfTenantFile}${suffix}`)) {
          rmSync(`${halfTenantFile}${suffix}`, { force: true })
        }
      }

      // Ensure control DB exists and insert a tenant + membership pointing to an empty (uninitialized) tenant DB file
      await findMembershipWithFarm('uid-check')
      const controlDb = getControlDb()
      const now = new Date().toISOString()
      await controlDb.insert(controlSchema.tenants).values({
        id: 'tenant-half-1',
        name: 'Recovered Farm',
        tier: 'premium',
        eggsPerTray: 30,
        currency: 'PHP',
        dbUrl: `file:${halfTenantFile}`,
        dbAuthToken: '',
        createdAt: now,
        updatedAt: now,
      })
      await controlDb.insert(controlSchema.memberships).values({
        id: 'mem-half-1',
        tenantId: 'tenant-half-1',
        userId: 'uid-half-1',
        createdAt: now,
        updatedAt: now,
      })

      // Calling findMembershipWithFarm automatically bootstraps the empty tenant DB and returns the farm
      const recovered = await findMembershipWithFarm('uid-half-1')
      expect(recovered).not.toBeNull()
      expect(recovered?.farm.name).toBe('Recovered Farm')
      expect(recovered?.farm.sizes.length).toBe(4)
    })
  })
})
