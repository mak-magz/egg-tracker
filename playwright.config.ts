import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

// End-to-end tests against the LOCAL stack (local SQLite DB + local Firebase Auth emulator).
const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const controlDbUrl = process.env.NUXT_TURSO_CONTROL_URL || 'file:local-control.db'
const projectId = process.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-no-project'

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : process.platform === 'win32' ? { channel: 'msedge' } : {}),
    storageState: 'tests/e2e/.auth/state.json',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: `bun run emulator -- --project ${projectId}`,
      url: `http://${emulatorHost}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'bun run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        FIREBASE_AUTH_EMULATOR_HOST: emulatorHost,
        NUXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
        NUXT_TURSO_CONTROL_URL: controlDbUrl,
      },
    },
  ],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
})
