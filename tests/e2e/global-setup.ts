import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { E2E_EMAIL, E2E_PASSWORD, STATE_PATH } from './env'

export default async function globalSetup() {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const url = process.env.NUXT_TURSO_CONTROL_URL ?? 'file:local-control.db'
  const isLocalFile = url.startsWith('file:')
  const host = URL.canParse(url) ? new URL(url).hostname : ''
  if (!isLocalFile && host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('e2e refuses to run: NUXT_TURSO_CONTROL_URL must be a local file: or 127.0.0.1/localhost URL (load .env).')
  }

  // Idempotent: re-running for the same email reports "No changes made".
  const run = spawnSync('bun', [
    '--env-file=.env', 'server/cli/provision.ts', '--farm', 'E2E Farm', '--email', E2E_EMAIL, '--password', E2E_PASSWORD, '--yes',
  ], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`provision failed (status ${run.status}): ${run.stderr || run.stdout}`)

  mkdirSync('tests/e2e/.auth', { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await browser.newPage({ baseURL: 'http://localhost:3000' })
  await page.goto('/login')
  await page.waitForLoadState('networkidle') // hydrated, so the click is handled by the form and not a native submit
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.locator('input[type=password]').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.context().storageState({ path: STATE_PATH })
  await browser.close()
}
