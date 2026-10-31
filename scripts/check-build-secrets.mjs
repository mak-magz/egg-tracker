// Fails if the production build output contains secret key material (audit M1).
// Usage: bun run check:build   (run after `bun run build`)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? '.output'
if (!existsSync(root)) {
  console.error(`check:build: ${root} not found. Run \`bun run build\` first.`)
  process.exit(2)
}

// Checks for leaked secret keys (Firebase private keys, Turso platform tokens, or legacy sb_secret_ keys).
// `service_role` is checked only in our own bundle: vendored libraries under node_modules legitimately mention it.
const patterns = [
  { name: 'sb_secret_ key', re: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { name: 'service_role', re: /service_role/, skipVendored: true },
  { name: 'Firebase private key', re: /-----BEGIN PRIVATE KEY-----/, publicOnly: true },
]

const hits = []
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) walk(p)
    else if (s.size < 50 * 1024 * 1024) {
      const text = readFileSync(p, 'latin1')
      const parts = p.split(/[\\/]/)
      const vendored = parts.includes('node_modules')
      const isPublic = parts.includes('public')
      for (const { name, re, skipVendored, publicOnly } of patterns) {
        if (skipVendored && vendored) continue
        if (publicOnly && !isPublic) continue
        if (re.test(text)) hits.push(`${p} (${name})`)
      }
    }
  }
}
walk(root)

if (hits.length) {
  console.error('check:build FAILED. Secret material found in the build output (values not shown):')
  for (const h of hits) console.error(`  ${h}`)
  process.exit(1)
}
console.log(`check:build OK: no secret key material in ${root}.`)
