// Static guards for clients as personal data (docs/features/03-clients.md §3.6, AC21, AC29, AC30, AC31), in the style
// of server-guards.spec.ts. Names and phones must not reach a log, the address bar, browser storage or the SSR payload,
// and no route or repository call may delete a client.
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
// Strip comments so documentation mentioning a forbidden name doesn't trip the guards.
const code = (f: string) => readFileSync(f, 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

const serverClientFiles = [
  ...walk(join(ROOT, 'server', 'api', 'clients')),
  join(ROOT, 'server', 'repositories', 'clients.ts'),
]

// The clients screen: its page, components, composables and helpers (whichever exist).
const appClientFiles = [
  ...walk(join(ROOT, 'app', 'components')).filter(f => /\/Client[A-Za-z]*\.vue$/.test(rel(f))),
  ...walk(join(ROOT, 'app', 'composables')).filter(f => /\/useClient[A-Za-z]*\.ts$/.test(rel(f))),
  ...walk(join(ROOT, 'app', 'utils')).filter(f => /\/client-[a-z-]+\.ts$/.test(rel(f))),
  join(ROOT, 'app', 'pages', 'farm', 'clients.vue'),
].filter((f) => {
  try {
    return statSync(f).isFile()
  }
  catch {
    return false
  }
})

describe('clients server code', () => {
  it('finds the clients server sources', () => {
    expect(serverClientFiles.map(rel).sort()).toEqual([
      'server/api/clients/[id].put.ts',
      'server/api/clients/[id]/archive.post.ts',
      'server/api/clients/[id]/restore.post.ts',
      'server/api/clients/index.get.ts',
      'server/api/clients/index.post.ts',
      'server/repositories/clients.ts',
    ])
  })

  it('AC21: there is no DELETE route and no delete or truncate call for clients', () => {
    const routes = walk(join(ROOT, 'server', 'api', 'clients')).map(rel)
    expect(routes.filter(r => /\.delete\.ts$/.test(r))).toEqual([])
    const offenders = serverClientFiles.filter(f => /\.delete\s*\(|\.truncate\s*\(|\bdelete\s+from\b|\btruncate\b/i.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC29: every console call is one fixed "[clients] ..." line: never an error object, message, details or hint', () => {
    const calls: string[] = []
    for (const f of serverClientFiles) {
      for (const m of code(f).matchAll(/console\.\w+\(.*$/gm)) calls.push(`${rel(f)}: ${m[0]}`)
    }
    expect(calls.length).toBeGreaterThan(0) // the repository's one logger is found
    const offenders = calls.filter(c => !/: console\.(?:error|warn)\(`\[clients\] [^`]*`\)$/.test(c))
    expect(offenders).toEqual([])
  })

  it('AC29: the clients repository never reads an error message, and reads details only for TM020\'s id', () => {
    const src = code(join(ROOT, 'server', 'repositories', 'clients.ts'))
    expect(src).not.toMatch(/\.message\b/)
    expect(src.match(/\.details\b/g) ?? []).toHaveLength(1)
  })

  it('AC29: the clients routes never log anything', () => {
    const offenders = serverClientFiles.filter(f => rel(f).startsWith('server/api/') && /\bconsole\b|\blogger\b/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC30: GET /api/clients ignores the query string', () => {
    const src = code(join(ROOT, 'server', 'api', 'clients', 'index.get.ts'))
    expect(src).not.toMatch(/getQuery|\.query\b|useQuery/)
  })
})

describe('clients screen code (whichever files exist)', () => {
  it('AC30, AC31: nothing personal goes to the URL, browser storage or a cookie', () => {
    const forbidden = /route\.query|useRoute\s*\(\s*\)\s*\.query|\bgetQuery\b|(?:router|navigateTo)[^\n]*\bquery\b|localStorage|sessionStorage|useLocalStorage|useSessionStorage|useStorage|useCookie|document\.cookie|indexedDB/
    const offenders = appClientFiles.filter(f => forbidden.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('D10: the client list is fetched after mount, never through the SSR data helpers', () => {
    const offenders = appClientFiles.filter(f => /\buseAsyncData\b|\buseLazyAsyncData\b|\buseFetch\b|\buseLazyFetch\b/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC21: no client screen code calls a delete on /api/clients', () => {
    const offenders = appClientFiles.filter(f => /method\s*:\s*['"]DELETE['"]/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })
})
