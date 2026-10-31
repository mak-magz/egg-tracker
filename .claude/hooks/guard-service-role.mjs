// PreToolUse (Write|Edit): block writing private server credentials outside server-only code.
// Allowed: server/**, tests/**, nuxt.config.* (private runtimeConfig), .env*, docs/markdown, .agents/**, and .claude/**.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const ti = input.tool_input ?? {}
const filePath = String(ti.file_path ?? '').replace(/\\/g, '/')
const text = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e.new_string)]
  .filter(Boolean)
  .join('\n')

// Secret credential names: Firebase Admin private key/service account, Turso platform/auth tokens,
// and legacy service-role names.
const SERVER_SECRETS = new RegExp([
  'FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'TURSO_API_TOKEN', 'NUXT_TURSO_CONTROL_AUTH_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'serviceRoleKey', 'service_role_key', 'supabaseServiceKey',
  'SUPABASE_SECRET_KEY', 'supabase\\??\\.secretKey', 'supabaseSecretKey', 'sb_secret_',
].join('|'), 'i')
if (!filePath || !SERVER_SECRETS.test(text)) process.exit(0)

const root = String(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()).replace(/\\/g, '/').replace(/\/$/, '')
if (!filePath.toLowerCase().startsWith(root.toLowerCase() + '/')) process.exit(0) // outside the project
const rel = filePath.slice(root.length + 1)
const allowed =
  /(^|\/)server\//.test(rel) ||
  /^(tests?)\//.test(rel) ||
  /(^|\/)nuxt\.config\.[cm]?[jt]s$/.test(rel) ||
  /(^|\/)\.env/.test(rel) ||
  /\.md$/.test(rel) ||
  /^\.(claude|agents|gemini)\//.test(rel)

if (allowed) {
  if (/nuxt\.config/.test(rel)) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: 'Reminder: server secret keys must live in private runtimeConfig, never under runtimeConfig.public.',
      },
    }))
  }
  process.exit(0)
}

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason:
      `Secret credential reference in ${rel}, which is outside server/. Private credentials are server-only ` +
      '(see GEMINI.md / CLAUDE.md). Move this logic into a server route/util under server/ and call it from the client.',
  },
}))
