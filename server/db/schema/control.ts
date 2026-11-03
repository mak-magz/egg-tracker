// Control DB schema (Turso main database): maps Firebase Auth users to tenants and their isolated Turso DBs.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tier: text('tier', { enum: ['free', 'premium'] }).notNull().default('free'),
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

export const adminAuditLogs = sqliteTable(
  'admin_audit_logs',
  {
    id: text('id').primaryKey(),
    operatorEmail: text('operator_email').notNull(),
    actionType: text('action_type', {
      enum: [
        'tenant_provision',
        'tenant_settings_update',
        'user_assign',
        'user_transfer',
        'user_unlink',
        'user_password_reset',
        'schema_migration',
        'sync_snapshot_reset',
        'operator_login',
      ],
    }).notNull(),
    targetId: text('target_id').notNull(), // Tenant ID or User UID
    summary: text('summary').notNull(),
    details: text('details'), // Optional serialized JSON payload/diff
    createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  },
  table => [
    index('admin_audit_logs_created_at_idx').on(table.createdAt),
    index('admin_audit_logs_operator_idx').on(table.operatorEmail),
  ],
)

export type ControlTenantRow = typeof tenants.$inferSelect
export type ControlMembershipRow = typeof memberships.$inferSelect
export type ControlAdminAuditLogRow = typeof adminAuditLogs.$inferSelect
export type NewControlAdminAuditLogRow = typeof adminAuditLogs.$inferInsert
