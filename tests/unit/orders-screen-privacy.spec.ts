// Static guards for the Orders screen as personal data (docs/features/05-orders.md AC53, AC55), in the style of
// sales-privacy.spec.ts. An order carries `clientId`, never a client's name or phone, and the client filter, the
// stacked detail overlays and the hand-off between Orders and Sales are in-memory state only: nothing personal reaches
// the address bar, browser storage, a cookie or the SSR payload, and the cached state is dropped on sign-out.
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

const isFile = (f: string) => {
  try {
    return statSync(f).isFile()
  }
  catch {
    return false
  }
}

// The orders screen: its page, components, composables and helpers, plus the shared pieces the stacked overlays use.
const appOrdersFiles = [
  ...walk(join(ROOT, 'app', 'components')).filter(f => /\/(Order[A-Za-z]*|Orders[A-Za-z]*|DeliverOrderDialog|CancelOrderDialog|CloseShortDialog|FromOrderLink|AppMoreSheet|SaleVoidDialog)\.vue$/.test(rel(f))),
  ...walk(join(ROOT, 'app', 'composables')).filter(f => /\/use(Orders|OrderMutations|DetailStack)\.ts$/.test(rel(f))),
  ...walk(join(ROOT, 'app', 'utils')).filter(f => /\/order-[a-z-]+\.ts$/.test(rel(f))),
  join(ROOT, 'app', 'pages', 'orders.vue'),
  join(ROOT, 'app', 'pages', 'sales', 'index.vue'),
].filter(isFile)

describe('orders screen code', () => {
  it('finds the orders screen sources', () => {
    const names = appOrdersFiles.map(rel)
    for (const expected of [
      'app/pages/orders.vue',
      'app/composables/useOrders.ts',
      'app/composables/useOrderMutations.ts',
      'app/composables/useDetailStack.ts',
      'app/components/OrdersList.vue',
      'app/components/OrderDetail.vue',
      'app/components/OrderForm.vue',
      'app/components/DeliverOrderDialog.vue',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('AC53: nothing personal goes to the URL, browser storage or a cookie', () => {
    const forbidden = /route\.query|useRoute\s*\(\s*\)\s*\.query|\bgetQuery\b|(?:router|navigateTo)[^\n]*\bquery\b|localStorage|sessionStorage|useLocalStorage|useSessionStorage|useStorage|useCookie|document\.cookie|indexedDB/
    const offenders = appOrdersFiles.filter(f => forbidden.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC53: the orders list is fetched after mount, never through the SSR data helpers', () => {
    const offenders = appOrdersFiles.filter(f => /\buseAsyncData\b|\buseLazyAsyncData\b|\buseFetch\b|\buseLazyFetch\b/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })

  it('AC53: the hand-off between Orders and Sales navigates to a bare path: the id travels in memory, never the address', () => {
    const src = code(join(ROOT, 'app', 'composables', 'useDetailStack.ts'))
    expect(src).toMatch(/navigateTo\(path\)/)
    expect(src).not.toMatch(/\$\{[^}]*id[^}]*\}/i)
  })

  it('AC53: the orders page declares no route params or query of its own', () => {
    const src = code(join(ROOT, 'app', 'pages', 'orders.vue'))
    expect(src).not.toMatch(/useRoute\b|definePageMeta\(\{[^}]*(?:validate|key)/)
  })

  it('AC55: signing out clears the cached orders and the stacked detail state', () => {
    const src = code(join(ROOT, 'app', 'composables', 'useMe.ts'))
    expect(src).toMatch(/startsWith\(['"]orders:['"]\)/)
    expect(src).toMatch(/startsWith\(['"]detail-stack:['"]\)/)
  })

  it('AC55: the stores are keyed by farm id, so another farm never sees them even for a moment', () => {
    const src = code(join(ROOT, 'app', 'composables', 'useOrders.ts'))
    expect(src).toMatch(/useState<OrdersState \| null>\('orders:state'/)
    expect(src).toMatch(/state\.value\.farmId === farmId\.value/)
  })

  it('AC54: the order screen never logs', () => {
    const offenders = appOrdersFiles.filter(f => /\bconsole\.\w+\(/.test(code(f)))
    expect(offenders.map(rel)).toEqual([])
  })
})
