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
    ]))
  })

  it('(a) every server/api route is wrapped in defineAuthedHandler or defineTenantHandler', () => {
    const offenders = apiFiles.filter((f) => {
      const src = code(f)
      return !/export\s+default\s+define(?:Authed|Tenant)Handler\s*[(<]/.test(src)
        || /\bdefine(?:Cached)?EventHandler\b|\beventHandler\s*\(/.test(src)
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('(b) #supabase/server is imported only by server/utils/auth.ts and server/utils/db.ts', () => {
    const allowed = new Set(['server/utils/auth.ts', 'server/utils/db.ts'])
    const offenders = [...serverFiles, ...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'shared'))]
      .filter(f => /['"]#supabase\/server['"]/.test(code(f)) && !allowed.has(rel(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('(b2) server routes never call supabase clients directly (repositories do)', () => {
    const offenders = apiFiles.filter(f => /\bserverSupabase\w+\b|\.from\s*\(\s*['"]|\.rpc\s*\(/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('(c) the service role is never used at app runtime', () => {
    const offenders = serverFiles.filter(f => /serverSupabaseServiceRole/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('(c2) only the provisioning CLI reads the secret key', () => {
    const offenders = serverFiles
      .filter(f => !rel(f).startsWith('server/cli/'))
      .filter(f => /SUPABASE_SECRET_KEY|secretKey|SERVICE_ROLE/i.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('(d) no server/api route takes a tenant id from the request', () => {
    // Routes get the tenant from ctx (membership) only; tenant_id is injected by the repository layer.
    const offenders = apiFiles.filter((f) => {
      const src = code(f)
      const mentionsRawTenant = /\btenant_id\b/.test(src)
      const bareTenantId = src.replace(/\bctx\.tenantId\b/g, '').match(/\btenantId\b/)
      return mentionsRawTenant || bareTenantId !== null
    })
    expect(offenders.map(rel)).toEqual([])
  })

  it('(e) no app code imports server code', () => {
    const offenders = walk(join(ROOT, 'app')).filter(f => /from\s+['"](?:~~\/|\.\.\/)+server\//.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })
})
