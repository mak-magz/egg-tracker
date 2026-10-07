// Fails if the production build output contains secret key material (audit M1).
// Usage: bun run check:build   (run after `bun run build`)
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? '.output'
if (!existsSync(root)) {
  console.error(`check:build: ${root} not found. Run \`bun run build\` first.`)
  process.exit(2)
}

// sb_secret_ followed by key material (the bare prefix in code or docs is fine) is checked everywhere.
// `service_role` is checked only in our own bundle: vendored libraries under node_modules (auth-js,
// storage-js) legitimately mention it.
const patterns = [
  { name: 'sb_secret_ key', re: /sb_secret_[A-Za-z0-9_-]{8,}/ },
  { name: 'service_role', re: /service_role/, skipVendored: true },
]

const hits = []
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) walk(p)
    else if (s.size < 50 * 1024 * 1024) {
      const text = readFileSync(p, 'latin1')
      const vendored = p.split(/[\\/]/).includes('node_modules')
      for (const { name, re, skipVendored } of patterns) if (!(skipVendored && vendored) && re.test(text)) hits.push(`${p} (${name})`)
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
