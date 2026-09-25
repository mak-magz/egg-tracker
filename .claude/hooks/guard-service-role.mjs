// PreToolUse (Write|Edit): block writing service-role key references outside server-only code.
// Allowed: server/**, supabase/**, tests/** (isolation tests), nuxt.config.* (private runtimeConfig),
// .env*, docs/markdown, and .claude/**.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const ti = input.tool_input ?? {}
const filePath = String(ti.file_path ?? '').replace(/\\/g, '/')
const text = [ti.content, ti.new_string, ...(ti.edits ?? []).map((e) => e.new_string)]
  .filter(Boolean)
  .join('\n')

// Legacy service-role names + current @nuxtjs/supabase secret-key names (NUXT_SUPABASE_SECRET_KEY,
// runtimeConfig.supabase.secretKey) + the literal prefix of new-format Supabase secret keys.
const SERVICE_ROLE = new RegExp([
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'serviceRoleKey', 'service_role_key', 'supabaseServiceKey',
  'SUPABASE_SECRET_KEY', 'supabase\\??\\.secretKey', 'supabaseSecretKey', 'sb_secret_',
].join('|'), 'i')
if (!filePath || !SERVICE_ROLE.test(text)) process.exit(0)

const root = String(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()).replace(/\\/g, '/').replace(/\/$/, '')
if (!filePath.toLowerCase().startsWith(root.toLowerCase() + '/')) process.exit(0) // outside the project
const rel = filePath.slice(root.length + 1)
const allowed =
  /(^|\/)server\//.test(rel) ||
  /^(supabase|tests?)\//.test(rel) ||
  /(^|\/)nuxt\.config\.[cm]?[jt]s$/.test(rel) ||
  /(^|\/)\.env/.test(rel) ||
  /\.md$/.test(rel) ||
  /^\.claude\//.test(rel)

if (allowed) {
  if (/nuxt\.config/.test(rel)) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: 'Reminder: the service-role key must live in private runtimeConfig, never under runtimeConfig.public.',
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
      `Service-role key reference in ${rel}, which is outside server/. The service-role key is server-only ` +
      '(see CLAUDE.md). Move this logic into a server route/util under server/ and call it from the client.',
  },
}))
