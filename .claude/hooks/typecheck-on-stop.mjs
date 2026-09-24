// Stop hook: if .ts/.vue files changed and the Nuxt app exists, run a typecheck once per turn.
// Exit 2 feeds errors back to Claude; no-op before the project is scaffolded.
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
if (input.stop_hook_active) process.exit(0) // already retried once; don't loop

const root = input.cwd || process.cwd()
const pkgPath = `${root}/package.json`
if (!existsSync(pkgPath) || !existsSync(`${root}/node_modules`)) process.exit(0)

let changed = ''
try {
  changed = execSync('git status --porcelain --untracked-files=all', { cwd: root, encoding: 'utf8' })
} catch {
  process.exit(0)
}
if (!/\.(ts|vue|mts|cts)$/m.test(changed)) process.exit(0)

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const cmd = pkg.scripts?.typecheck ? 'npm run -s typecheck' : 'npx --no-install nuxi typecheck'

try {
  execSync(cmd, { cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 280_000 })
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim().split('\n').slice(-60).join('\n')
  process.stderr.write(`Typecheck failed (${cmd}). Fix these before finishing:\n${out}\n`)
  process.exit(2)
}
