// Static guards over server source (docs/features/00-project-scaffold.md §3.4 "Guard test").
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')

function walk(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out = out.concat(walk(full))
    else if (/\.(?:ts|mts|js|mjs)$/.test(name)) out.push(full)
  }
  return out
}

const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const read = (f: string) => readFileSync(f, 'utf8')
// Strip comments so documentation mentioning a forbidden name doesn't trip the guards.
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const serverFiles = walk(join(ROOT, 'server'))
const apiFiles = walk(join(ROOT, 'server', 'api'))

describe('server guards', () => {
  it('finds the server sources', () => {
    expect(apiFiles.map(rel)).toEqual(expect.arrayContaining([
      'server/api/me.get.ts',
      // Feature 01: rules (a) and (d) demonstrably run over the production routes.
      'server/api/production/days.get.ts',
      'server/api/production/days/[date].get.ts',
      'server/api/production/days/[date].put.ts',
      'server/api/production/days/[date].delete.ts',
      'server/api/production/entries.post.ts',
      // Feature 02: rules (a), (b2) and (d) demonstrably run over the sizes routes.
      'server/api/sizes/index.get.ts',
      'server/api/sizes/index.post.ts',
      'server/api/sizes/[id].patch.ts',
      'server/api/sizes/order.put.ts',
      'server/api/sizes/[id]/archive.post.ts',
      'server/api/sizes/[id]/restore.post.ts',
      // Feature 03: rules (a), (b2) and (d) demonstrably run over the clients routes (there is no DELETE route: AC21).
      'server/api/clients/index.get.ts',
      'server/api/clients/index.post.ts',
      'server/api/clients/[id].put.ts',
      'server/api/clients/[id]/archive.post.ts',
      'server/api/clients/[id]/restore.post.ts',
      // Feature 04: rules (a), (b2) and (d) demonstrably run over the sales routes.
      'server/api/sales/index.get.ts',
      'server/api/sales/index.post.ts',
      'server/api/sales/[id].get.ts',
      'server/api/sales/[id].put.ts',
      'server/api/sales/[id]/void.post.ts',
      'server/api/sales/on-hand.get.ts',
      // Feature 06: the inventory route.
      'server/api/inventory/index.get.ts',
      // Feature 05: the eight order routes.
      'server/api/orders/index.get.ts',
      'server/api/orders/index.post.ts',
      'server/api/orders/[id].get.ts',
      'server/api/orders/[id].put.ts',
      'server/api/orders/[id]/status.post.ts',
      'server/api/orders/[id]/cancel.post.ts',
      'server/api/orders/[id]/close.post.ts',
      'server/api/orders/[id]/deliver.post.ts',
    ]))
  })

  it('has no DELETE route for sales or orders (sales are void-only, orders are never deleted: AC23, AC40)', () => {
    const deletes = apiFiles.map(rel).filter(f => (f.startsWith('server/api/sales/') || f.startsWith('server/api/orders/')) && f.endsWith('.delete.ts'))
    expect(deletes).toEqual([])
  })

  it('(a) every server/api route is wrapped in defineAuthedHandler, defineTenantHandler, defineAdminHandler, or defineAdminLoginHandler', () => {
    const offenders = apiFiles.filter((f) => {
      const src = code(f)
      return !/export\s+default\s+define(?:Authed|Tenant|Admin|AdminLogin)Handler\s*[(<]/.test(src)
        || /\bdefine(?:Cached)?EventHandler\b|\beventHandler\s*\(/.test(src)
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('(b) firebase-admin and server/db/turso are imported only by auth, db, memberships, admin, and cli layers', () => {
    const allowedAuth = new Set(['server/utils/auth.ts', 'server/cli/provision.ts', 'server/services/provision.ts'])
    const allowedTurso = new Set([
      'server/utils/db.ts',
      'server/repositories/memberships.ts',
      'server/cli/provision.ts',
      'server/services/provision.ts',
      'server/repositories/admin-tenants.ts',
      'server/repositories/admin-users.ts',
      'server/repositories/admin-migrations.ts',
      'server/repositories/admin-sync.ts',
      'server/repositories/admin-audit.ts',
    ])
    const allFiles = [...serverFiles, ...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'shared'))]
    const authOffenders = allFiles.filter(f => /['"]firebase-admin/.test(code(f)) && !allowedAuth.has(rel(f)))
    const tursoOffenders = allFiles.filter(f => /['"](?:.*\/)?db\/turso['"]/.test(code(f)) && !allowedTurso.has(rel(f)))
    expect(authOffenders.map(rel)).toEqual([])
    expect(tursoOffenders.map(rel)).toEqual([])
  })

  it('(b2) server routes never call database clients directly (repositories do)', () => {
    const offenders = apiFiles.filter(f => /\bgetControlDrizzleDb\b|\bgetTenantDrizzleDb\b|\.from\s*\(\s*['"]|\.rpc\s*\(/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('(c) Turso platform API token is never used at app runtime (only cli, provisioning, and turso-platform service)', () => {
    const offenders = serverFiles
      .filter(f => !rel(f).startsWith('server/cli/') && rel(f) !== 'server/services/provision.ts' && rel(f) !== 'server/services/turso-platform.ts')
      .filter(f => /TURSO_API_TOKEN|TURSO_ORG/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('(c2) only server/utils/auth.ts and server/cli/ read FIREBASE_SERVICE_ACCOUNT', () => {
    const allowed = new Set(['server/utils/auth.ts', 'server/cli/provision.ts'])
    const offenders = serverFiles
      .filter(f => !allowed.has(rel(f)))
      .filter(f => /FIREBASE_SERVICE_ACCOUNT/i.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('(d) no farm server/api route takes a tenant id from the request (admin routes excluded)', () => {
    // Farm routes get the tenant from ctx (membership) only; tenant_id is injected by the repository layer.
    // Admin routes operate on the fleet control plane where tenant id is a URL parameter.
    const farmApiFiles = apiFiles.filter(f => !rel(f).startsWith('server/api/admin/'))
    const offenders = farmApiFiles.filter((f) => {
      const src = code(f)
      const mentionsRawTenant = /\btenant_id\b/.test(src)
      const bareTenantId = src.replace(/\bctx\.tenantId\b/g, '').match(/\btenantId\b/)
      return mentionsRawTenant || bareTenantId !== null
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('(f) all handler wrappers refuse cross-site writes before touching auth (security audit L1)', () => {
    // Every route is wrapped (rule a), so the check lives once, in the wrappers, ahead of any auth or database work.
    const src = code(join(ROOT, 'server', 'utils', 'handlers.ts'))
    expect(src.match(/\bassertRequestAllowed\(event\)/g) ?? []).toHaveLength(4)
    expect(src).toMatch(/assertRequestAllowed\(event\)\s*\n\s*const \w+ = await requireAuth\(event\)/)
    expect(src).toMatch(/assertRequestAllowed\(event\)\s*\n\s*const tenant = await requireTenant\(event\)/)
    expect(src).toMatch(/assertRequestAllowed\(event\)\s*\n\s*const \w+ = await requireAdmin\(event\)/)
    expect(src).toMatch(/import \{[^}]*\bcheckRequest\b[^}]*\} from '\.\/request-guard'/)
  })

  it('(e) no app code imports server code', () => {
    const offenders = walk(join(ROOT, 'app')).filter(f => /from\s+['"](?:~~\/|\.\.\/)+server\//.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })
})
