import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD, STATE_PATH } from './env'

export default async function globalSetup() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const url = process.env.NUXT_TURSO_CONTROL_URL || 'file:local-control.db'
  const isLocalFile = url.startsWith('file:')
  const host = URL.canParse(url) ? new URL(url).hostname : ''
  if (!isLocalFile && host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('e2e refuses to run: NUXT_TURSO_CONTROL_URL must be a local file: or 127.0.0.1/localhost URL (load .env).')
  }

  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
  const emulatorHostname = emulatorHost.split(':')[0]
  if (emulatorHostname !== '127.0.0.1' && emulatorHostname !== 'localhost') {
    throw new Error('e2e refuses to run: FIREBASE_AUTH_EMULATOR_HOST must be a 127.0.0.1 or localhost address.')
  }

  const projectId = process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-no-project'

  // Idempotent: re-running for the same email reports "No changes made".
  const run = spawnSync('bun', [
    'server/cli/provision.ts', '--farm', 'E2E Farm', '--email', E2E_EMAIL, '--password', E2E_PASSWORD, '--yes',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FIREBASE_AUTH_EMULATOR_HOST: emulatorHost,
      NUXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
      NUXT_TURSO_CONTROL_URL: url,
      TURSO_API_TOKEN: '',
      TURSO_ORG: '',
    },
  })
  if (run.status !== 0) throw new Error(`provision failed (status ${run.status}): ${run.stderr || run.stdout}`)

  mkdirSync('tests/e2e/.auth', { recursive: true })
  const browser = await chromium.launch({
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : process.platform === 'win32' ? { channel: 'msedge' } : {}),
  })
  const page = await browser.newPage({ baseURL: 'http://localhost:3000' })
  const diag: string[] = [`[provision] ${run.stdout.trim()}`]
  page.on('console', m => diag.push(`[console.${m.type()}] ${m.text()}`))
  page.on('pageerror', e => diag.push(`[pageerror] ${e.message}`))
  page.on('response', async (r) => {
    if (r.status() >= 400) {
      const body = await r.text().catch(() => '')
      diag.push(`[http ${r.status()}] ${r.request().method()} ${r.url()} -> ${body}`)
    }
  })
  await page.goto('/login')
  await page.getByLabel('Email').waitFor({ state: 'visible' }) // hydrated and interactive
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.locator('input[type=password]').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  try {
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15_000 })
  }
  catch (e) {
    throw new Error(`Sign-in in global-setup did not navigate away from ${page.url()}.\nDiagnostics:\n${diag.join('\n')}`, { cause: e })
  }
  await page.context().storageState({ path: STATE_PATH, indexedDB: true })
  await browser.close()
}
