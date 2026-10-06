// Static guards for orders as personal data (docs/features/05-orders.md AC53, AC54), in the style of
// sales-privacy.spec.ts. An order carries `clientId`, never a client's name or phone: nothing personal reaches a log
// or an error body from the server code.
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
    else out.push(full)
  }
  return out
}

const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const serverOrderFiles = [
  ...walk(join(ROOT, 'server', 'api', 'orders')),
  join(ROOT, 'server', 'repositories', 'orders.ts'),
  join(ROOT, 'server', 'repositories', 'order-json.ts'),
]

describe('orders server code', () => {
  it('finds the orders server sources', () => {
    expect(serverOrderFiles.map(rel).sort()).toEqual([
      'server/api/orders/[id].get.ts',
      'server/api/orders/[id].put.ts',
      'server/api/orders/[id]/cancel.post.ts',
      'server/api/orders/[id]/close.post.ts',
      'server/api/orders/[id]/deliver.post.ts',
      'server/api/orders/[id]/status.post.ts',
      'server/api/orders/index.get.ts',
      'server/api/orders/index.post.ts',
      'server/repositories/order-json.ts',
      'server/repositories/orders.ts',
    ])
  })

  it('AC54: the only log line is the fixed `[orders] <scope> <code>` one', () => {
    const calls: string[] = []
    for (const f of serverOrderFiles) {
      for (const m of code(f).matchAll(/console\.\w+\(.*$/gm)) calls.push(`${rel(f)}: ${m[0]}`)
    }
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter(c => !/: console\.(?:error|warn)\(`\[orders\] [^`]*`\)$/.test(c))).toEqual([])
  })

  it('AC54: the orders repository never reads an error message, and reads details only for TM037 and TM051', () => {
    const src = code(join(ROOT, 'server', 'repositories', 'orders.ts'))
    expect(src).not.toMatch(/\.message\b/)
    expect(src.match(/\.details\b/g) ?? []).toHaveLength(2)
  })

  it('AC54: the orders routes never log anything', () => {
    const offenders = serverOrderFiles.filter(f => rel(f).startsWith('server/api/') && /\bconsole\b|\blogger\b/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC53: no orders server file ever reads a client name or phone (only `clientId`)', () => {
    const offenders = serverOrderFiles.filter(f => /\bclient(Name|Phone)\b|clients\.name/i.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })
})
