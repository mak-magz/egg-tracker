import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema/control.ts',
  out: './server/db/migrations/control',
  dbCredentials: {
    url: process.env.NUXT_TURSO_CONTROL_URL || 'file:local-control.db',
    authToken: process.env.NUXT_TURSO_CONTROL_AUTH_TOKEN || '',
  },
})
