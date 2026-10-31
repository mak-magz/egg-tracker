// Control DB schema (Turso main database): maps Firebase Auth users to tenants and their isolated Turso DBs.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  eggsPerTray: integer('eggs_per_tray').notNull().default(30),
  currency: text('currency').notNull().default('PHP'),
  /** Turso database URL or local SQLite file URL (e.g. libsql://farm-xyz.turso.io or file:local-tenant.db) */
  dbUrl: text('db_url').notNull(),
  /** Scoped Turso database auth token (empty string for local file: URLs) */
  dbAuthToken: text('db_auth_token').notNull().default(''),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
})

export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Firebase Auth UID */
    userId: text('user_id').notNull(),
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    uniqueIndex('memberships_user_id_key').on(table.userId),
  ],
)

export type ControlTenantRow = typeof tenants.$inferSelect
export type ControlMembershipRow = typeof memberships.$inferSelect
