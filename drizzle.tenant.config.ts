import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema/tenant.ts',
  out: './server/db/migrations/tenant',
  dbCredentials: {
    url: process.env.NUXT_TURSO_TENANT_URL || 'file:local-tenant.db',
    authToken: process.env.NUXT_TURSO_TENANT_AUTH_TOKEN || '',
  },
})
