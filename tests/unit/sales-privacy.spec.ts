// Static guards for sales as personal data (docs/features/04-sales.md §3.6, AC59, AC60, AC61), in the style of
// clients-privacy.spec.ts. A sale carries `clientId`, never a client's name or phone (CLAUDE.md), so this file's
// exposure is narrower than clients' own, but keeps the same discipline: nothing personal reaches a log, the
// address bar, browser storage or the SSR payload, and the cached sales/on-hand state is dropped on sign-out.
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
// Strip comments so documentation mentioning a forbidden pattern doesn't trip the guards.
const code = (f: string) => readFileSync(f, 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

const serverSalesFiles = [
  ...walk(join(ROOT, 'server', 'api', 'sales')),
  join(ROOT, 'server', 'repositories', 'sales.ts'),
]

// The sales screen: its page, components, composables and helpers (whichever exist). Includes the reusable
// pickers/dialogs the sale form owns even though they aren't named `Sale*` (mirrors clients' own file list).
const appSalesFiles = [
  ...walk(join(ROOT, 'app', 'components')).filter(f => /\/(Sale[A-Za-z]*|ClientPicker|SizeChipPicker|StockShortfallDialog)\.vue$/.test(rel(f))),
  ...walk(join(ROOT, 'app', 'composables')).filter(f => /\/use(Sale[A-Za-z]*|OnHand)\.ts$/.test(rel(f))),
  ...walk(join(ROOT, 'app', 'utils')).filter(f => /\/sale-[a-z-]+\.ts$/.test(rel(f))),
  join(ROOT, 'app', 'pages', 'sales', 'index.vue'),
].filter((f) => {
  try {
    return statSync(f).isFile()
  }
  catch {
    return false
  }
})

describe('sales server code', () => {
  it('finds the sales server sources', () => {
    expect(serverSalesFiles.map(rel).sort()).toEqual([
      'server/api/sales/[id].get.ts',
      'server/api/sales/[id].put.ts',
      'server/api/sales/[id]/void.post.ts',
      'server/api/sales/index.get.ts',
      'server/api/sales/index.post.ts',
      'server/api/sales/on-hand.get.ts',
      'server/repositories/sales.ts',
    ])
  })

  it('AC59: every console call is one fixed "[sales] ..." line: never an error object, message, details or hint', () => {
    const calls: string[] = []
    for (const f of serverSalesFiles) {
      for (const m of code(f).matchAll(/console\.\w+\(.*$/gm)) calls.push(`${rel(f)}: ${m[0]}`)
    }
    expect(calls.length).toBeGreaterThan(0) // the repository's one logger is found
    const offenders = calls.filter(c => !/: console\.(?:error|warn)\(`\[sales\] [^`]*`\)$/.test(c))
    expect(offenders).toEqual([])
  })

  it('AC59: the sales repository never reads an error message, and reads details only for TM037\'s shortfall', () => {
    const src = code(join(ROOT, 'server', 'repositories', 'sales.ts'))
    expect(src).not.toMatch(/\.message\b/)
    expect(src.match(/\.details\b/g) ?? []).toHaveLength(1)
  })

  it('AC59: `.hint` is only ever used to pick between fixed messages, never logged or echoed raw', () => {
    const src = code(join(ROOT, 'server', 'repositories', 'sales.ts'))
    for (const m of src.matchAll(/console\.\w+\([^)]*\.hint\b[^)]*\)/g)) {
      expect.fail(`a console call reads .hint directly: ${m[0]}`)
    }
  })

  it('AC59: the sales routes never log anything', () => {
    const offenders = serverSalesFiles.filter(f => rel(f).startsWith('server/api/') && /\bconsole\b|\blogger\b/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC59: no sales server file ever reads a client\'s name or phone (only `clientId`)', () => {
    const offenders = serverSalesFiles.filter(f => /\bclient(Name|Phone)\b|\.name\s*,?\s*\/\/\s*client|clients\.name/i.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })
})

describe('sales screen code (whichever files exist)', () => {
  it('AC60, AC61: nothing personal goes to the URL, browser storage or a cookie', () => {
    const forbidden = /route\.query|useRoute\s*\(\s*\)\s*\.query|\bgetQuery\b|(?:router|navigateTo)[^\n]*\bquery\b|localStorage|sessionStorage|useLocalStorage|useSessionStorage|useStorage|useCookie|document\.cookie|indexedDB/
    const offenders = appSalesFiles.filter(f => forbidden.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC60: the sales list is fetched after mount, never through the SSR data helpers', () => {
    const offenders = appSalesFiles.filter(f => /\buseAsyncData\b|\buseLazyAsyncData\b|\buseFetch\b|\buseLazyFetch\b/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC61: signing out clears the cached sales and on-hand state', () => {
    const src = code(join(ROOT, 'app', 'composables', 'useMe.ts'))
    expect(src).toMatch(/startsWith\(['"]sales:['"]\)/)
    expect(src).toMatch(/startsWith\(['"]on-hand:['"]\)/)
  })
})

// Feature 07's invoice (AC22, AC23): page, sheet, composable and helpers.
const invoicePage = join(ROOT, 'app', 'pages', 'sales', '[id]', 'invoice.vue')
const invoiceFiles = [
  invoicePage,
  ...walk(join(ROOT, 'app', 'components')).filter(f => /\/Invoice[A-Za-z]*\.vue$/.test(rel(f))),
  join(ROOT, 'app', 'composables', 'useInvoice.ts'),
  ...walk(join(ROOT, 'app', 'utils')).filter(f => /\/invoice-[a-z-]+\.ts$/.test(rel(f))),
]

describe('invoice code (feature 07, AC22, AC23)', () => {
  it('finds the invoice sources', () => {
    expect(invoiceFiles.map(rel).sort()).toEqual([
      'app/components/InvoiceSheet.vue',
      'app/composables/useInvoice.ts',
      'app/pages/sales/[id]/invoice.vue',
      'app/utils/invoice-copy.ts',
      'app/utils/invoice-load.ts',
      'app/utils/invoice-view.ts',
    ])
  })

  it('loads after mount only: no SSR data helpers, no $fetch', () => {
    const offenders = invoiceFiles.filter(f => /\buseAsyncData\b|\buseLazyAsyncData\b|\buseFetch\b|\buseLazyFetch\b|\$fetch\b/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('no storage, cookie, console or query string, and no useState for the invoice', () => {
    const forbidden = /route\.query|\bgetQuery\b|localStorage|sessionStorage|useStorage|useCookie|document\.cookie|indexedDB|console\.|useState\(/
    expect(invoiceFiles.filter(f => forbidden.test(code(f))).map(rel)).toEqual([])
  })

  it('no currency symbol literal: prices go through formatPrice', () => {
    const offenders = invoiceFiles.filter(f => /[₱€£¥]|\$\s?\d/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('the page title never comes from a client name', () => {
    const heads = [...code(invoicePage).matchAll(/useHead\([\s\S]*?\)\)/g)].map(m => m[0])
    expect(heads.length).toBeGreaterThan(0)
    for (const h of heads) expect(h).not.toMatch(/client|billTo|name/i)
  })

  it('window.print is called once, in a click handler only, never at mount', () => {
    const src = code(invoicePage)
    expect(src.match(/window\.print\(/g)).toHaveLength(1)
    expect(src).toMatch(/function print\(\) \{\s*window\.print\(\)\s*\}/)
    expect(src).toMatch(/@click="print"/)
    const mounted = [...src.matchAll(/onMounted\(\(\) => \{[\s\S]*?\n\}\)/g)].map(m => m[0]).join('\n')
    expect(mounted).not.toMatch(/print/)
  })
})
